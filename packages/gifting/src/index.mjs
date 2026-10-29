export const BADGE_CATEGORIES = Object.freeze([
  {id:'spark',name:'Spark',fromLevel:1,toLevel:10,material:'opalescent'},
  {id:'bronze',name:'Bronze',fromLevel:11,toLevel:20,material:'bronze'},
  {id:'silver',name:'Silver',fromLevel:21,toLevel:30,material:'silver'},
  {id:'gold',name:'Gold',fromLevel:31,toLevel:40,material:'gold'},
  {id:'cosmic',name:'Cosmic',fromLevel:41,toLevel:50,material:'cosmic'}
]);
export function thresholdForLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > 50) throw new RangeError('Level must be 1–50');
  if (level === 50) return 100_000_000;
  return Math.max(1, Math.floor(100_000_000 * Math.pow(level / 50, 2.25)));
}
export function resolveGifterLevel(eligibleCoinsSpent) {
  const amount = Number(eligibleCoinsSpent);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('Eligible coins must be a non-negative safe integer');
  let result = { level: 0, category: null, badgeId: null, threshold: 0 };
  for (let level=1; level<=50; level++) {
    const threshold = thresholdForLevel(level);
    if (amount < threshold) break;
    const category = BADGE_CATEGORIES.find(c=>level>=c.fromLevel&&level<=c.toLevel);
    result = {level,category:category.id,badgeId:`gifter-level-${String(level).padStart(2,'0')}`,threshold};
  }
  return result;
}
export function splitGiftCents(grossCents, creatorShareBps = 5000) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new TypeError('Gross cents must be a non-negative safe integer');
  if (!Number.isInteger(creatorShareBps) || creatorShareBps < 0 || creatorShareBps > 10000) throw new RangeError('Share basis points must be from 0 to 10000');
  const creatorCents = Math.floor((grossCents * creatorShareBps) / 10000);
  return { grossCents, creatorCents, platformCents: grossCents - creatorCents };
}
