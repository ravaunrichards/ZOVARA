// Emits assets/gifts/manifests/catalog.json from the authoritative catalog code.
// Marks every asset reference MISSING until real art is produced (no false claims).
import { buildGiftCatalog } from '../../packages/economy/src/gifts.mjs';
import { writeFileSync, existsSync } from 'node:fs';

const gifts = buildGiftCatalog();
const manifest = {
  generatedAt: new Date().toISOString(),
  count: gifts.length,
  categories: [...new Set(gifts.map((g) => g.category))],
  gifts: gifts.map((g) => ({
    ...g,
    assetStatus: Object.fromEntries(
      Object.entries(g.assets).map(([k, p]) => [k, p && existsSync(p) ? 'present' : 'MISSING'])
    ),
  })),
};
writeFileSync('assets/gifts/manifests/catalog.json', JSON.stringify(manifest, null, 2));
console.log(`wrote catalog.json with ${manifest.count} gifts across ${manifest.categories.length} categories`);
