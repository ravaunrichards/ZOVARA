import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const migrationDir = path.resolve('database/migrations');
const canonicalPattern = /^000[1-7]_.+\.sql$/;

test('canonical database migration chain contains exactly 0001 through 0007', async () => {
  const files = (await readdir(migrationDir)).filter((name) => canonicalPattern.test(name)).sort();
  assert.equal(files.length, 7, 'expected seven canonical migrations');
  assert.deepEqual(files.map((name) => name.slice(0, 4)), ['0001', '0002', '0003', '0004', '0005', '0006', '0007']);
});

test('canonical migrations are transactional and substantive', async () => {
  const files = (await readdir(migrationDir)).filter((name) => canonicalPattern.test(name)).sort();
  for (const name of files) {
    const sql = await readFile(path.join(migrationDir, name), 'utf8');
    assert.match(sql, /^\s*begin;/i, name + ' must begin a transaction');
    assert.match(sql.trim(), /commit;\s*$/i, name + ' must commit its transaction');
    assert.match(sql, /create table|create or replace function|create policy|enable row level security/i, name + ' must contain schema work');
  }
});

test('legacy alternate migration files are not selected as canonical', async () => {
  const files = await readdir(migrationDir);
  const canonical = files.filter((name) => canonicalPattern.test(name));
  const legacy = files.filter((name) => /^00[1-5]_/.test(name) && name.endsWith('.sql'));
  assert.equal(canonical.length, 7);
  assert.ok(legacy.length >= 1, 'audit should continue to detect retained legacy files');
  assert.ok(legacy.every((name) => !canonical.includes(name)));
});
