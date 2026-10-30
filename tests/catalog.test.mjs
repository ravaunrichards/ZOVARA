import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const root=process.cwd();const j=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
test('gift catalog contains at least 100 unique, priced, referenced designs',async()=>{const c=await j('assets/gifts/catalog.json');assert.ok(c.gifts.length>=100);assert.equal(new Set(c.gifts.map(x=>x.id)).size,c.gifts.length);assert.equal(new Set(c.gifts.map(x=>x.name)).size,c.gifts.length);for(const g of c.gifts){assert.ok(g.coinPrice>0);assert.ok(c.categories.includes(g.category));const b=await readFile(path.join(root,g.asset));assert.equal(createHash('sha256').update(b).digest('hex'),g.checksum);}});
test('level badges cover 1–50 across five exact categories and rising spend thresholds',async()=>{const d=await j('assets/badges/gifter-levels.json');assert.equal(d.levelZero.level,0);assert.equal(d.levelZero.badgeId,null);assert.equal(d.levels.length,50);assert.deepEqual(d.categories.map(x=>[x.fromLevel,x.toLevel]),[[1,10],[11,20],[21,30],[31,40],[41,50]]);assert.equal(new Set(d.levels.map(x=>x.id)).size,50);for(let i=1;i<d.levels.length;i++)assert.ok(d.levels[i].minEligibleCoinsSpent>d.levels[i-1].minEligibleCoinsSpent);assert.equal(d.levels.at(-1).minEligibleCoinsSpent,100000000);for(const c of d.categories)assert.equal(d.levels.filter(l=>l.category===c.id).length,10);});
test('all 1,000 style configurations are unique and dimensionally complete',async()=>{const d=await j('assets/styles/registry.json');assert.equal(d.styles.length,1000);assert.equal(new Set(d.styles.map(x=>x.id)).size,1000);assert.ok(d.styles.every(x=>x.validated===true));});
test('icon manifest includes distinct source files with valid hashes',async()=>{const d=await j('assets/icons/manifest.json');assert.ok(d.icons.length>=50);assert.equal(new Set(d.icons.map(x=>x.id)).size,d.icons.length);for(const i of d.icons){const b=await readFile(path.join(root,i.asset));assert.equal(createHash('sha256').update(b).digest('hex'),i.checksum);}});

test('compatibility gift manifest mirrors the canonical catalog and points only to present artwork',async()=>{
 const canonical=await j('assets/gifts/catalog.json');
 const manifest=await j('assets/gifts/manifests/catalog.json');
 assert.equal(manifest.count,canonical.count);
 assert.equal(manifest.gifts.length,canonical.gifts.length);
 assert.deepEqual(manifest.categories,canonical.categories);
 const byId=new Map(canonical.gifts.map(g=>[g.id,g]));
 assert.equal(new Set(manifest.gifts.map(g=>g.id)).size,manifest.gifts.length);
 for(const gift of manifest.gifts){
  const source=byId.get(gift.id);
  assert.ok(source,'unknown manifest gift '+gift.id);
  assert.equal(gift.asset,source.asset);
  assert.equal(gift.assets.icon,source.asset);
  assert.equal(gift.assets.preview,source.asset);
  assert.equal(gift.assets.fallback,source.asset);
  assert.equal(gift.assets.model3d,null);
  assert.equal(gift.assets.animation,null);
  assert.equal(gift.assetStatus.icon,'present');
  assert.equal(gift.assetStatus.preview,'present');
  assert.equal(gift.assetStatus.fallback,'present');
  assert.equal(gift.assetStatus.model3d,'not-configured');
  const bytes=await readFile(path.join(root,gift.assets.icon));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.checksum);
 }
});
