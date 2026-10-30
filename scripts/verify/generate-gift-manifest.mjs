// Generate the compatibility manifest from the canonical gift catalog.
// Every displayed icon/preview/fallback must resolve to a real, checksum-verified asset.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = JSON.parse(readFileSync('assets/gifts/catalog.json', 'utf8'));
const gifts = source.gifts.map((gift) => {
  const asset = gift.asset;
  if (!asset || !existsSync(asset)) throw new Error('Missing gift artwork for ' + gift.id + ': ' + String(asset));
  const checksum = createHash('sha256').update(readFileSync(asset)).digest('hex');
  if (checksum !== gift.checksum) throw new Error('Gift artwork checksum mismatch for ' + gift.id + ': ' + asset);
  return {
    id: gift.id,
    name: gift.name,
    description: gift.description || (gift.name + ' — ZOVARA creator gift.'),
    category: gift.category,
    priceCoins: gift.coinPrice,
    coinValue: gift.coinPrice,
    asset,
    assets: {
      icon: asset,
      preview: asset,
      model3d: null,
      animation: null,
      sound: gift.sound || null,
      fallback: asset
    },
    availability: { regions: ['global'], enabled: true },
    localization: { en: gift.name },
    assetStatus: {
      icon: 'present',
      preview: 'present',
      model3d: 'not-configured',
      animation: 'not-configured',
      sound: gift.sound && existsSync(gift.sound) ? 'present' : 'not-configured',
      fallback: 'present'
    },
    tier: gift.tier,
    vectorAnimation: gift.animation || null,
    checksum: gift.checksum
  };
});
const manifest = {
  version: source.version,
  generatedAt: new Date().toISOString(),
  count: gifts.length,
  categories: source.categories,
  gifts
};
writeFileSync('assets/gifts/manifests/catalog.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Gift compatibility manifest verified: ' + gifts.length + ' gifts; all displayed artwork paths resolve.');
