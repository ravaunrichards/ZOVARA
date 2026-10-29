import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { COIN_PACKS, GIFTS, type CoinPackId } from '../catalog.js';
import { HttpError } from '../errors.js';
import { requireAuth, isConfigured } from '../security.js';

function stripeClient() {
  if (!isConfigured(config.STRIPE_SECRET_KEY)) throw new HttpError(503, 'Card top-ups are unavailable until the owner configures Stripe.', 'PAYMENTS_NOT_CONFIGURED');
  return new Stripe(config.STRIPE_SECRET_KEY);
}

async function creditCoins(userId: string, coins: number, amountCents: number, currency: string, provider: string, reference: string, metadata: Record<string, unknown> = {}) {
  return withTransaction(async (client) => {
    const event = await client.query(
      `INSERT INTO payment_events(provider,provider_reference,user_id,amount_cents,currency,coins,status,metadata)
       VALUES($1,$2,$3,$4,$5,$6,'succeeded',$7::jsonb)
       ON CONFLICT(provider,provider_reference) DO NOTHING RETURNING id`,
      [provider, reference, userId, amountCents, currency, coins, JSON.stringify(metadata)]
    );
    if (!event.rowCount) return { credited: false, duplicate: true };
    const wallet = await client.query('UPDATE wallets SET balance_coins=balance_coins+$2,updated_at=now() WHERE user_id=$1 RETURNING balance_coins', [userId, coins]);
    if (!wallet.rows[0]) throw new HttpError(404, 'Wallet not found.', 'NOT_FOUND');
    await client.query(
      "INSERT INTO wallet_ledger(user_id,kind,amount_coins,balance_after,reference_type,reference_id,metadata) VALUES($1,'purchase',$2,$3,$4,$5,$6::jsonb)",
      [userId, coins, wallet.rows[0].balance_coins, provider, reference, JSON.stringify(metadata)]
    );
    return { credited: true, balanceCoins: Number(wallet.rows[0].balance_coins) };
  });
}

async function recordPartialRefund(paymentIntentId: string, stripeChargeId: string, amountRefunded: number, chargeAmount: number) {
  await withTransaction(async (client) => {
    const event = await client.query("SELECT id,metadata,status FROM payment_events WHERE provider='stripe' AND metadata->>'paymentIntentId'=$1 FOR UPDATE", [paymentIntentId]);
    const payment = event.rows[0];
    if (!payment || payment.status !== 'succeeded') return;
    const metadata = { ...(payment.metadata || {}), partialRefundRequiresManualReview: true, stripeChargeId, partialRefundAmountCents: amountRefunded, originalChargeAmountCents: chargeAmount };
    await client.query('UPDATE payment_events SET metadata=$2::jsonb,updated_at=now() WHERE id=$1', [payment.id, JSON.stringify(metadata)]);
  });
}

async function applyVerifiedRefund(paymentIntentId: string, stripeChargeId: string) {
  return withTransaction(async (client) => {
    const event = await client.query(
      "SELECT id,user_id,coins,status,metadata FROM payment_events WHERE provider='stripe' AND metadata->>'paymentIntentId'=$1 FOR UPDATE",
      [paymentIntentId]
    );
    const payment = event.rows[0];
    if (!payment || payment.status !== 'succeeded') return { applied: false, duplicate: Boolean(payment) };
    const wallet = await client.query('SELECT balance_coins FROM wallets WHERE user_id=$1 FOR UPDATE', [payment.user_id]);
    if (!wallet.rows[0]) throw new HttpError(404, 'Wallet not found while reconciling a verified refund.', 'WALLET_NOT_FOUND');
    const coinsOwed = Number(payment.coins);
    const existingBalance = Number(wallet.rows[0].balance_coins);
    const clawback = Math.min(existingBalance, coinsOwed);
    let balanceAfter = existingBalance;
    if (clawback > 0) {
      const changed = await client.query('UPDATE wallets SET balance_coins=balance_coins-$2,updated_at=now() WHERE user_id=$1 RETURNING balance_coins', [payment.user_id, clawback]);
      balanceAfter = Number(changed.rows[0]!.balance_coins);
      await client.query(
        "INSERT INTO wallet_ledger(user_id,kind,amount_coins,balance_after,reference_type,reference_id,metadata) VALUES($1,'refund',$2,$3,'stripe_refund',$4,$5::jsonb)",
        [payment.user_id, -clawback, balanceAfter, stripeChargeId, JSON.stringify({ paymentIntentId, coinsOriginallyPurchased: coinsOwed, coinsReversed: clawback, requiresManualReview: clawback < coinsOwed })]
      );
    }
    const metadata = { ...(payment.metadata || {}), stripeChargeId, refundClawbackCoins: clawback, refundRequiresManualReview: clawback < coinsOwed };
    await client.query("UPDATE payment_events SET status='refunded',metadata=$2::jsonb,updated_at=now() WHERE id=$1", [payment.id, JSON.stringify(metadata)]);
    return { applied: true, clawbackCoins: clawback, requiresManualReview: clawback < coinsOwed };
  });
}

export async function walletRoutes(app: FastifyInstance) {
  app.get('/api/wallet/packs', async () => ({ packs: Object.entries(COIN_PACKS).map(([id, pack]) => ({ id, ...pack })) }));
  app.get('/api/wallet/gifts', async () => ({ gifts: GIFTS }));
  app.get('/api/wallet', { preHandler: requireAuth }, async (request) => {
    const [wallet, ledger] = await Promise.all([
      query('SELECT balance_coins,updated_at FROM wallets WHERE user_id=$1', [request.user.id]),
      query('SELECT id,kind,amount_coins,balance_after,reference_type,created_at,metadata FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [request.user.id])
    ]);
    return { balanceCoins: Number(wallet.rows[0]?.balance_coins ?? 0), updatedAt: wallet.rows[0]?.updated_at ?? null, ledger: ledger.rows };
  });

  app.post('/api/gifts/send', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = z.object({ recipientUsername: z.string().trim().min(3).max(30), giftId: z.enum(['spark','bloom','orbit','crown']), postId: z.string().uuid().optional(), liveStreamId: z.string().uuid().optional() }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid gift.', 'VALIDATION_ERROR');
    const gift = GIFTS.find((item) => item.id === parsed.data.giftId)!;
    const result = await withTransaction(async (client) => {
      const recipient = await client.query('SELECT id FROM users WHERE lower(username)=lower($1) AND disabled_at IS NULL', [parsed.data.recipientUsername]);
      if (!recipient.rows[0]) throw new HttpError(404, 'Creator not found.', 'NOT_FOUND');
      const recipientId = String(recipient.rows[0].id);
      if (recipientId === request.user.id) throw new HttpError(400, 'You cannot send gifts to yourself.', 'SELF_GIFT');
      // Stable lock ordering prevents two reciprocal gifts from deadlocking their wallet rows.
      const locked = await client.query('SELECT user_id,balance_coins FROM wallets WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE', [[request.user.id, recipientId].sort()]);
      const balances = new Map(locked.rows.map((row) => [String(row.user_id), Number(row.balance_coins)]));
      const senderBalance = balances.get(request.user.id);
      const recipientBalance = balances.get(recipientId);
      if (senderBalance === undefined) throw new HttpError(404, 'Wallet not found.', 'NOT_FOUND');
      if (recipientBalance === undefined) throw new HttpError(404, 'Creator wallet not found.', 'NOT_FOUND');
      if (senderBalance < gift.coins) throw new HttpError(402, 'Not enough Z-Coins. Add coins from your wallet to send this gift.', 'INSUFFICIENT_COINS');
      const giftRow = await client.query('INSERT INTO gifts(sender_id,recipient_id,post_id,live_stream_id,gift_code,coins) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at', [request.user.id, recipientId, parsed.data.postId ?? null, parsed.data.liveStreamId ?? null, gift.id, gift.coins]);
      const debit = await client.query('UPDATE wallets SET balance_coins=balance_coins-$2,updated_at=now() WHERE user_id=$1 RETURNING balance_coins', [request.user.id, gift.coins]);
      const credit = await client.query('UPDATE wallets SET balance_coins=balance_coins+$2,updated_at=now() WHERE user_id=$1 RETURNING balance_coins', [recipientId, gift.coins]);
      await client.query("INSERT INTO wallet_ledger(user_id,kind,amount_coins,balance_after,reference_type,reference_id,metadata) VALUES($1,'gift_sent',$2,$3,'gift',$4,$5::jsonb)", [request.user.id, -gift.coins, debit.rows[0]!.balance_coins, giftRow.rows[0]!.id, JSON.stringify({ giftId: gift.id, recipientId })]);
      await client.query("INSERT INTO wallet_ledger(user_id,kind,amount_coins,balance_after,reference_type,reference_id,metadata) VALUES($1,'gift_received',$2,$3,'gift',$4,$5::jsonb)", [recipientId, gift.coins, credit.rows[0]!.balance_coins, giftRow.rows[0]!.id, JSON.stringify({ giftId: gift.id, senderId: request.user.id })]);
      await client.query("INSERT INTO notifications(user_id,actor_id,kind,entity_type,entity_id,payload) VALUES($1,$2,'gift','user',$2,$3::jsonb)", [recipientId, request.user.id, JSON.stringify({ giftId: gift.id, coins: gift.coins })]);
      return { giftId: giftRow.rows[0]!.id, balanceCoins: Number(debit.rows[0]!.balance_coins), recipientBalanceCoins: Number(credit.rows[0]!.balance_coins) };
    });
    return reply.code(201).send(result);
  });

  app.post('/api/payments/stripe/checkout', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = z.object({ packId: z.enum(['starter','creator','studio']) }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'Select a valid Z-Coin pack.', 'VALIDATION_ERROR');
    const pack = COIN_PACKS[parsed.data.packId as CoinPackId];
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'],
      line_items: [{ price_data: { currency: config.STRIPE_CURRENCY, unit_amount: pack.priceCents, product_data: { name: pack.title, description: 'ZOVARA virtual currency; not redeemable for cash.' } }, quantity: 1 }],
      metadata: { userId: request.user.id, packId: parsed.data.packId, coins: String(pack.coins) },
      success_url: `${config.APP_ORIGIN}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.APP_ORIGIN}/?payment=cancelled`
    });
    if (!session.url) throw new HttpError(502, 'The payment provider did not return a checkout URL.', 'PAYMENT_PROVIDER_ERROR');
    await query("INSERT INTO payment_orders(user_id,provider,provider_order_id,pack_id) VALUES($1,'stripe',$2,$3) ON CONFLICT(provider,provider_order_id) DO NOTHING", [request.user.id, session.id, parsed.data.packId]);
    return reply.send({ checkoutUrl: session.url, provider: 'stripe', status: 'pending' });
  });

  app.post('/api/payments/stripe/webhook', async (request, reply) => {
    if (!isConfigured(config.STRIPE_SECRET_KEY) || !isConfigured(config.STRIPE_WEBHOOK_SECRET)) return reply.code(503).send({ error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Stripe webhook is not configured.' } });
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string') throw new HttpError(400, 'Missing payment signature.', 'INVALID_SIGNATURE');
    const raw = (request as typeof request & { rawBody?: Buffer }).rawBody;
    if (!raw) throw new HttpError(400, 'Missing raw webhook body.', 'INVALID_WEBHOOK');
    let event: Stripe.Event;
    try { event = stripeClient().webhooks.constructEvent(raw, signature, config.STRIPE_WEBHOOK_SECRET); }
    catch { throw new HttpError(400, 'Invalid payment webhook signature.', 'INVALID_SIGNATURE'); }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        const userId = session.metadata?.userId;
        const packId = session.metadata?.packId as CoinPackId | undefined;
        const pack = packId ? COIN_PACKS[packId] : undefined;
        if (userId && pack) {
          const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
          await creditCoins(userId, pack.coins, session.amount_total ?? pack.priceCents, session.currency ?? config.STRIPE_CURRENCY, 'stripe', session.id, { eventId: event.id, checkoutSessionId: session.id, packId, paymentIntentId: paymentIntentId ?? null });
          await query("UPDATE payment_orders SET status='succeeded',updated_at=now() WHERE provider='stripe' AND provider_order_id=$1 AND user_id=$2", [session.id, userId]);
        }
      }
    }
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntentId) {
        if (charge.amount_refunded >= charge.amount) await applyVerifiedRefund(paymentIntentId, charge.id);
        else await recordPartialRefund(paymentIntentId, charge.id, charge.amount_refunded, charge.amount);
      }
    }
    return reply.code(200).send({ received: true });
  });
}
