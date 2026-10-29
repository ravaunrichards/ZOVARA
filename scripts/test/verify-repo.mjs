#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const mustExist = [
  'README.md', 'LICENSE', '.env.example', 'package.json', 'pnpm-workspace.yaml',
  'apps/web/src/App.tsx', 'apps/web/src/pages/FeedPage.tsx', 'apps/creator-studio/index.html',
  'apps/admin/index.html', 'apps/android/app/src/main/AndroidManifest.xml',
  'apps/ios/ZOVARA.xcodeproj/project.pbxproj', 'backend/api/src/server.ts',
  'backend/api/src/routes/auth.ts', 'backend/api/src/routes/posts.ts',
  'backend/api/src/routes/profiles.ts', 'backend/api/src/routes/wallet.ts', 'backend/api/src/routes/live.ts',
  'database/migrations/001_initial.sql', 'database/migrations/002_integrity_and_search.sql',
  'database/migrations/003_saved_posts.sql', 'database/migrations/004_livestream_participants.sql',
  'database/migrations/005_wallet_ledger_append_only.sql', 'docs/deployment/production.md'
];
const problems = [];
for (const path of mustExist) {
  try { if (!(await stat(join(root, path))).isFile()) problems.push(`Expected a file: ${path}`); }
  catch { problems.push(`Missing required file: ${path}`); }
}
let jsonCount = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith('.json')) {
      jsonCount++;
      try { JSON.parse(await readFile(full, 'utf8')); }
      catch (error) { problems.push(`Invalid JSON ${relative(root, full)}: ${String(error)}`); }
    }
  }
}
await walk(root);
const migrations = (await readdir(join(root, 'database/migrations'))).filter((n) => n.endsWith('.sql')).sort();
if (!migrations.length) problems.push('No SQL migrations were found.');
if (migrations.some((name, index) => index > 0 && migrations[index - 1] >= name)) problems.push('Migration file names must sort strictly in order.');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (pkg.name !== 'zovara') problems.push('Root package name is not zovara.');
if (pkg.version !== (await readFile(join(root, 'VERSION'), 'utf8')).trim()) problems.push('Root package version does not match VERSION.');
const walletUi = await readFile(join(root, 'apps/web/src/pages/MorePages.tsx'), 'utf8');
if (walletUi.includes("setPacks([{id:'starter'")) problems.push('Wallet UI contains a hard-coded coin-pack fallback.');
if (!walletUi.includes("api<any>('/api/wallet/packs')")) problems.push('Wallet UI does not read coin packs from the API.');
if (problems.length) {
  console.error(`ZOVARA repository verification failed with ${problems.length} issue(s):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`ZOVARA repository structure verified; ${jsonCount} JSON files parse; ${migrations.length} ordered SQL migrations found.`);
}
