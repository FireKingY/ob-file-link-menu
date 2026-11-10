import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addAdapter, applyAdapter, planAdapter, removeInstalledAdapter } from '../scripts/desktop-adapter.mjs';

describe('desktop installation', () => {
  test('preserves the host page and backs up each changed page', async () => {
    const root = await mkdtemp(join(tmpdir(), 'file-link-menu-adapter-'));
    const original = '<!doctype html><body><script src="/existing-customization.js"></script></body>';
    try {
      for (const name of ['index.html', 'mini-chat.html']) await writeFile(join(root, name), original);
      const plan = await planAdapter(root);
      expect(plan.files.filter((file: { changed: boolean }) => file.changed)).toHaveLength(2);
      const result = await applyAdapter(plan, join(root, 'backups'));
      expect(await readFile(join(result.backupDirectory!, 'index.html'), 'utf8')).toBe(original);
      expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('/existing-customization.js');
      expect((await planAdapter(root)).files.every((file: { changed: boolean }) => !file.changed)).toBe(true);
      const installed = await readFile(join(root, 'index.html'), 'utf8');
      await writeFile(join(root, 'index.html'), installed.replace('<body>', '<body data-user-change="kept">'));
      await removeInstalledAdapter(await planAdapter(root, 'remove'), join(root, 'backups'));
      const restored = await readFile(join(root, 'index.html'), 'utf8');
      expect(restored).toContain('data-user-change="kept"');
      expect(restored).toContain('/existing-customization.js');
      expect(restored).not.toContain('openchamber:file-link-menu:start');
      expect((await planAdapter(root, 'remove')).files.every((file: { changed: boolean }) => !file.changed)).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test('refuses a page changed after the installation plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'file-link-menu-adapter-'));
    try {
      await writeFile(join(root, 'index.html'), '<body>original</body>');
      const plan = await planAdapter(root);
      await writeFile(join(root, 'index.html'), '<body>user changes</body>');
      await expect(applyAdapter(plan, join(root, 'backups'))).rejects.toThrow('页面在安装期间发生变化');
      expect(await readFile(join(root, 'index.html'), 'utf8')).toBe('<body>user changes</body>');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test('refuses HTML without a body', () => {
    expect(() => addAdapter('<head></head>', 'adapter.js')).toThrow('body');
  });
});
