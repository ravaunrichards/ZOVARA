import { describe, expect, it } from 'vitest';

describe('ZOVARA web package', () => {
  it('has the intended brand identity in the app shell', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const html = await readFile(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('ZOVARA');
    expect(html).toContain('id="root"');
  });
});
