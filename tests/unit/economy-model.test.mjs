// Dependency-free test harness (Node 16+ compatible, no node:test, no deps).
// Run: node tests/unit/economy-model.test.mjs
import assert from 'node:assert';
import { Ledger, UNIT, ACCOUNT_KIND } from '../../packages/economy/src/ledger.mjs';
import {
  RECHARGE_PACKAGES, priceCustomRecharge, splitGiftRevenue,
  gifterLevelFor, levelThreshold, hasUltimateUniverse,
  MAX_GIFTER_LEVEL, LEVEL_50_THRESHOLD, ULTIMATE_UNIVERSE_MILESTONE,
  creditPurchase, sendGift,
} from '../../packages/economy/src/economy.mjs';
import { buildGiftCatalog, GIFT_CATEGORIES } from '../../packages/economy/src/gifts.mjs';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

function freshLedger() {
  const l = new Ledger();
  l.openAccount('mint', ACCOUNT_KIND.SYSTEM_MINT);
  l.openAccount('sink', ACCOUNT_KIND.SYSTEM_SINK);
  l.openAccount('buyer', ACCOUNT_KIND.USER);
  l.openAccount('creator', ACCOUNT_KIND.USER);
  return l;
}

console.log('ZOVARA economy-model tests');

test('recharge packages: 7 packages, ascending coins & price', () => {
  assert.strictEqual(RECHARGE_PACKAGES.length, 7);
  for (let i = 1; i < RECHARGE_PACKAGES.length; i++) {
    assert.ok(RECHARGE_PACKAGES[i].coins > RECHARGE_PACKAGES[i - 1].coins);
    assert.ok(RECHARGE_PACKAGES[i].usdCents > RECHARGE_PACKAGES[i - 1].usdCents);
  }
});

test('custom recharge pricing is bounded & deterministic', () => {
  assert.strictEqual(priceCustomRecharge(99), 70);
  assert.throws(() => priceCustomRecharge(98));
  assert.throws(() => priceCustomRecharge(500001));
});

test('gift revenue split is 50/50 and loses no coins', () => {
  const { creatorCoins, platformCoins } = splitGiftRevenue(999);
  assert.strictEqual(creatorCoins + platformCoins, 999);
  assert.strictEqual(creatorCoins, 499); // floor of 499.5
  assert.strictEqual(platformCoins, 500);
});

test('gifter level 0 at start, 50 at exactly the top threshold', () => {
  assert.strictEqual(gifterLevelFor(0), 0);
  assert.strictEqual(levelThreshold(MAX_GIFTER_LEVEL), LEVEL_50_THRESHOLD);
  assert.strictEqual(gifterLevelFor(LEVEL_50_THRESHOLD), 50);
  assert.strictEqual(gifterLevelFor(LEVEL_50_THRESHOLD - 1), 49);
});

test('gifter thresholds are strictly monotonic', () => {
  for (let n = 1; n <= MAX_GIFTER_LEVEL; n++) {
    assert.ok(levelThreshold(n) > levelThreshold(n - 1), `level ${n} not increasing`);
  }
});

test('Ultimate Universe milestone is SEPARATE from level thresholds', () => {
  assert.strictEqual(ULTIMATE_UNIVERSE_MILESTONE, 1_000_000);
  assert.notStrictEqual(ULTIMATE_UNIVERSE_MILESTONE, LEVEL_50_THRESHOLD);
  assert.strictEqual(hasUltimateUniverse(1_000_000), true);
  assert.strictEqual(hasUltimateUniverse(999_999), false);
});

test('ledger: user account cannot go negative', () => {
  const l = freshLedger();
  assert.throws(() => l.post({ unit: UNIT.COINS, amount: 10, from: 'buyer', to: 'sink' }));
});

test('ledger: system mint IS allowed to go negative', () => {
  const l = freshLedger();
  const ok = l.post({ unit: UNIT.COINS, amount: 500, from: 'mint', to: 'buyer' });
  assert.strictEqual(ok, true);
  assert.strictEqual(l.balance('mint', UNIT.COINS), -500);
  assert.strictEqual(l.balance('buyer', UNIT.COINS), 500);
});

test('ledger: conservation holds after mint + spend', () => {
  const l = freshLedger();
  creditPurchase(l, { captureId: 'cap1', buyerId: 'buyer', coins: 1000, mintId: 'mint' });
  sendGift(l, { giftTxId: 'g1', buyerId: 'buyer', creatorId: 'creator', coinValue: 999, sinkId: 'sink' });
  assert.ok(l.conservationHolds(UNIT.COINS));
  assert.ok(l.conservationHolds(UNIT.DIAMONDS));
});

test('purchase crediting is idempotent on capture id', () => {
  const l = freshLedger();
  const first = creditPurchase(l, { captureId: 'capX', buyerId: 'buyer', coins: 350, mintId: 'mint' });
  const dup = creditPurchase(l, { captureId: 'capX', buyerId: 'buyer', coins: 350, mintId: 'mint' });
  assert.strictEqual(first, true);
  assert.strictEqual(dup, false); // duplicate webhook never double-credits
  assert.strictEqual(l.balance('buyer', UNIT.COINS), 350);
});

test('sendGift splits correctly and is idempotent', () => {
  const l = freshLedger();
  creditPurchase(l, { captureId: 'cap2', buyerId: 'buyer', coins: 2000, mintId: 'mint' });
  const r1 = sendGift(l, { giftTxId: 'gift1', buyerId: 'buyer', creatorId: 'creator', coinValue: 999, sinkId: 'sink' });
  assert.strictEqual(r1.applied, true);
  assert.strictEqual(r1.creatorCoins, 499);
  assert.strictEqual(l.balance('creator', UNIT.DIAMONDS), 499);
  const r2 = sendGift(l, { giftTxId: 'gift1', buyerId: 'buyer', creatorId: 'creator', coinValue: 999, sinkId: 'sink' });
  assert.strictEqual(r2.applied, false); // replay guarded
  assert.strictEqual(l.balance('buyer', UNIT.COINS), 2000 - 999);
});

test('coins and diamonds are distinct units (no silent conversion)', () => {
  const l = freshLedger();
  creditPurchase(l, { captureId: 'cap3', buyerId: 'buyer', coins: 1000, mintId: 'mint' });
  sendGift(l, { giftTxId: 'g3', buyerId: 'buyer', creatorId: 'creator', coinValue: 500, sinkId: 'sink' });
  assert.strictEqual(l.balance('creator', UNIT.COINS), 0); // creator earns diamonds, NOT coins
  assert.strictEqual(l.balance('creator', UNIT.DIAMONDS), 250);
});

test('gift catalog has >=100 gifts covering every category', () => {
  const gifts = buildGiftCatalog();
  assert.ok(gifts.length >= 100, `only ${gifts.length} gifts`);
  const ids = new Set(gifts.map((g) => g.id));
  assert.strictEqual(ids.size, gifts.length); // unique stable IDs
  for (const cat of GIFT_CATEGORIES) {
    assert.ok(gifts.some((g) => g.category === cat), `missing category ${cat}`);
  }
  for (const g of gifts) assert.ok(Number.isInteger(g.priceCoins) && g.priceCoins > 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
