// ZOVARA repo structure & integrity verification. Dependency-free.
// Checks: required paths exist, every JSON parses, migrations are ordered & non-empty,
// the gift manifest has >=100 gifts. Exits non-zero on any failure.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let problems = 0;
const note = (ok, msg) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${msg}`); if (!ok) problems++; };

console.log('ZOVARA verify-repo');

// 1) Required paths
const required = [
  'package.json', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.json',
  'packages/economy/src/ledger.mjs', 'packages/economy/src/economy.mjs', 'packages/economy/src/gifts.mjs',
  'packages/api-contracts/src/index.ts', 'packages/design-system/src/tokens.ts',
  'apps/web/src/features/feed/ZovaraFeed.tsx', 'apps/web/src/features/feed/ZovaraFeed.css',
  'services/api/src/server.mjs', 'services/api/src/config.mjs',
  'database/migrations', 'tests/unit/economy-model.test.mjs',
  'assets/gifts/manifests/catalog.json', 'docs/source-integration/PROVENANCE.md',
  'README.md', '.env.example',
];
for (const p of required) note(existsSync(join(root, p)), `exists: ${p}`);

// 2) JSON files parse
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc); else acc.push(full);
  }
  return acc;
}
const files = walk(root);
const jsonFiles = files.filter((f) => f.endsWith('.json'));
let jsonOk = 0;
for (const f of jsonFiles) {
  try { JSON.parse(readFileSync(f, 'utf8')); jsonOk++; }
  catch (e) { note(false, `JSON parse: ${f} — ${e.message}`); }
}
note(jsonOk === jsonFiles.length, `all ${jsonFiles.length} JSON files parse`);

// 3) Migrations ordered & non-empty
const migDir = join(root, 'database/migrations');
const migs = existsSync(migDir) ? readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort() : [];
note(migs.length > 0, `found ${migs.length} migration(s)`);
migs.forEach((m, i) => {
  const expected = String(i + 1).padStart(3, '0');
  const prefix = m.slice(0, 3);
  note(prefix === expected, `migration ${m} has ordered prefix ${expected}`);
  note(statSync(join(migDir, m)).size > 0, `migration ${m} non-empty`);
});

// 4) Gift manifest
try {
  const cat = JSON.parse(readFileSync(join(root, 'assets/gifts/manifests/catalog.json'), 'utf8'));
  note(cat.count >= 100 && cat.gifts.length === cat.count, `gift manifest has ${cat.count} gifts (>=100)`);
  note(new Set(cat.gifts.map((g) => g.id)).size === cat.count, 'gift ids are unique');
} catch (e) { note(false, `gift manifest: ${e.message}`); }

console.log(`\n${problems === 0 ? 'VERIFY PASS' : `VERIFY FAIL (${problems} problem(s))`}`);
process.exit(problems === 0 ? 0 : 1);
