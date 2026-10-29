# Gifter badges and gifts

## Badge categories

| Category | Levels | Visual treatment |
|---|---:|---|
| Spark | 1–10 | Opalescent starter progression |
| Bronze | 11–20 | Bronze/copper prestige |
| Silver | 21–30 | Silver/prismatic prestige |
| Gold | 31–40 | Gold/solar prestige |
| Cosmic | 41–50 | Celestial/cosmic prestige |

Every level has a unique id, name, badge SVG, category, and unique strictly increasing minimum eligible coin-spend threshold. Level 0 is a Newcomer state with no earned badge. Level 50 starts at 100,000,000 eligible coins of gifting spend. These lifetime levels are separate from monthly rankings, which reset on the first day of the month at 00:00 America/Jamaica while database timestamps stay in UTC.

Eligible spend is server-derived when a gift transaction is confirmed. Reversed/refunded/chargeback-related gift spend must be reversed by the financial event-handling path. Recharging coins alone does not earn gifter XP. The rules are versioned in `assets/badges/gifter-levels.json` and mirrored to `gifter_level_rules` via `pnpm catalog:seeds`.

## Gift launch catalog

The registry contains 104 uniquely identified gift designs across Flowers, Reactions, Celebrations, Animals, Fantasy, Vehicles, Music, Luxury, Sports, Jamaica, Parish Pride, Seasonal and Ocean categories. Every record includes a coin price, tier, SVG path/checksum, animation duration and a reduced-motion fallback. Audio associations are currently intentionally `null` where no original audio file was produced. The animation is a catalog/source SVG prototype; commissioned 3D model files and a full animation engine are not represented as complete.

## Atomic transaction policy

`public.send_gift_transaction` checks authentication, live status, gift availability, private-room access, blocking, idempotency and balance. It debits coins, writes append-only ledger entries, calculates the 50/50 gross-value share, increments eligible spend, recalculates the level and adds a durable outbox event in one database transaction. 100 coins = USD 1 is the explicit initial accounting basis. Fee, refund, chargeback and tax treatment must be applied and disclosed as described in `docs/payments.md` before releasing creator funds. The event can be confirmed even if its visual animation later fails; client animation must not automatically trigger a refund or second debit.
