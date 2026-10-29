export const COIN_PACKS = {
  starter: { coins: 100, priceCents: 199, currency: 'usd', title: '100 Z-Coins' },
  creator: { coins: 550, priceCents: 999, currency: 'usd', title: '550 Z-Coins' },
  studio: { coins: 1200, priceCents: 1999, currency: 'usd', title: '1,200 Z-Coins' }
} as const;
export const GIFTS = [
  { id: 'spark', name: 'Spark', emoji: '✦', coins: 5 },
  { id: 'bloom', name: 'Bloom', emoji: '✿', coins: 25 },
  { id: 'orbit', name: 'Orbit', emoji: '◉', coins: 100 },
  { id: 'crown', name: 'Crown', emoji: '♛', coins: 500 }
] as const;
export type CoinPackId = keyof typeof COIN_PACKS;
export type GiftId = (typeof GIFTS)[number]['id'];
