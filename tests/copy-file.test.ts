import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COPY_FILE_SCRIPT, copyLocalFile } from '../service/copy-file';
import { copyFileFromHost } from '../desktop/copy-file';

describe('native file clipboard', () => {
  test('passes file paths as data and uses NSURL pasteboard objects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'file-link-menu-copy-'));
    const path = join(directory, '中文 100% " $(touch nope);.txt');
    try {
      await writeFile(path, 'fixture');
      const calls: unknown[][] = [];
      const launch = async (...args: [string, string[]]) => { calls.push(args); };
      await copyLocalFile(path, { platform: 'darwin', launch });
      await copyLocalFile(directory, { platform: 'darwin', launch });
      expect(calls).toEqual([
        ['/usr/bin/osascript', ['-l', 'JavaScript', '-e', COPY_FILE_SCRIPT, '--', path]],
        ['/usr/bin/osascript', ['-l', 'JavaScript', '-e', COPY_FILE_SCRIPT, '--', directory]],
      ]);
      expect(COPY_FILE_SCRIPT).toContain('NSURL.fileURLWithPath');
      expect(COPY_FILE_SCRIPT).toContain('pasteboard.writeObjects');
      expect(COPY_FILE_SCRIPT).not.toContain(path);
      await expect(copyLocalFile(join(directory, 'missing'), { platform: 'darwin', launch })).rejects.toMatchObject({ status: 404 });
      await expect(copyLocalFile('relative.txt', { platform: 'darwin', launch })).rejects.toMatchObject({ status: 400 });
      await expect(copyLocalFile('/path\0name', { platform: 'darwin', launch })).rejects.toMatchObject({ status: 400 });
      await expect(copyLocalFile(path, { platform: 'linux', launch })).rejects.toMatchObject({ status: 501 });
      expect(calls).toHaveLength(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe('chat file clipboard requests', () => {
  test('uses the host fetch bridge and sends the exact file path', async () => {
    const calls: unknown[] = [];
    const request = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init?.method, JSON.parse(String(init?.body))]);
      return Response.json({ status: 200, body: '{"ok":true}' });
    };
    await copyFileFromHost('/repo/新 trace 100%.pftrace', request);
    expect(calls).toEqual([['/api/guests/file-link-menu/service/request', 'POST', {
      method: 'POST', path: '/copy-file', body: '{"path":"/repo/新 trace 100%.pftrace"}',
    }]]);
  });
  test('reports missing approval and failed copies without a success response', async () => {
    await expect(copyFileFromHost('/repo/file', async () => Response.json({ error: 'NO_SERVICE' }, { status: 403 }))).rejects.toThrow('osascript');
    await expect(copyFileFromHost('/repo/file', async () => Response.json({ status: 404, body: '{"message":"文件不存在"}' }))).rejects.toThrow('文件不存在');
    await expect(copyFileFromHost('/repo/file', async () => Response.json({ status: 200, body: '{"ok":false}' }))).rejects.toThrow('无法复制文件');
    await expect(copyFileFromHost('/repo/file', async () => Response.json({}))).rejects.toThrow('无效结果');
    await expect(copyFileFromHost('/repo/file', async () => { throw new Error('network'); })).rejects.toThrow('无法连接');
  });
});
