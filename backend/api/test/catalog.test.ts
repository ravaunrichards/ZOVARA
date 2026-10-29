import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN_PACKS, GIFTS } from '../src/catalog.js';

test('coin packs have positive, unique, explicit amounts', () => {
  const entries = Object.entries(COIN_PACKS);
  assert.equal(new Set(entries.map(([id]) => id)).size, entries.length);
  for (const [, pack] of entries) { assert.ok(pack.coins > 0); assert.ok(pack.priceCents > 0); assert.equal(pack.currency, 'usd'); }
});
test('gift catalog costs positive integer coin amounts', () => {
  assert.equal(new Set(GIFTS.map((gift) => gift.id)).size, GIFTS.length);
  for (const gift of GIFTS) { assert.ok(Number.isInteger(gift.coins)); assert.ok(gift.coins > 0); }
});
