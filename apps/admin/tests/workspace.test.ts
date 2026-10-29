import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
describe('Admin workspace entrypoint', () => { it('starts the shared app in the secured admin workspace', async () => { const html=await readFile(resolve(process.cwd(),'index.html'),'utf8'); expect(html).toContain('Administration'); expect(html).toContain('__ZOVARA_START_PAGE__="admin"'); }); });
