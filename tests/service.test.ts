import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { ActionError, revealLocalPath } from '../service/reveal';
import { createFileLinkServer } from '../service/server';

describe('Finder arguments', () => {
  let directory: string;
  beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), 'file-link-menu-test-')); });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

  test('keeps Unicode, spaces, percent signs and shell characters in one file argument', async () => {
    const path = join(directory, '新 trace 100% $(touch nope);.pftrace');
    await writeFile(path, 'fixture');
    const calls: unknown[][] = [];
    await revealLocalPath(path, { platform: 'darwin', launch: async (...args) => { calls.push(args); } });
    expect(calls).toEqual([['/usr/bin/open', ['-R', '--', path]]]);
  });
  test('opens a directory instead of selecting the directory', async () => {
    const calls: unknown[][] = [];
    await revealLocalPath(directory, { platform: 'darwin', launch: async (...args) => { calls.push(args); } });
    expect(calls).toEqual([['/usr/bin/open', ['--', directory]]]);
  });
  test('rejects missing files and relative paths before launching Finder', async () => {
    const launch = async () => { throw new Error('must not launch'); };
    await expect(revealLocalPath(join(directory, 'missing'), { platform: 'darwin', launch })).rejects.toMatchObject({ status: 404 });
    await expect(revealLocalPath('relative.txt', { platform: 'darwin', launch })).rejects.toMatchObject({ status: 400 });
    await expect(revealLocalPath('/path\0name', { platform: 'darwin', launch })).rejects.toMatchObject({ status: 400 });
    await expect(revealLocalPath('/path', { platform: 'linux', launch })).rejects.toMatchObject({ status: 501 });
  });
});

describe('service routes', () => {
  const calls: unknown[] = [];
  const copied: unknown[] = [];
  const server = createFileLinkServer('test-token', async (path) => {
    if (path === '/missing') throw new ActionError(404, '文件不存在，可能已被移动或删除。');
    calls.push(path);
  }, async (path) => {
    if (path === '/missing') throw new ActionError(404, '文件不存在，可能已被移动或删除。');
    copied.push(path);
  });
  let origin: string;
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No service address');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  test('requires authorization for health and actions', async () => {
    expect((await fetch(`${origin}/health`)).status).toBe(401);
    expect((await fetch(`${origin}/reveal`, { method: 'POST', body: '{"path":"/ignored"}' })).status).toBe(401);
    expect((await fetch(`${origin}/copy-file`, { method: 'POST', body: '{"path":"/ignored"}' })).status).toBe(401);
    expect(calls).toEqual([]);
    expect(copied).toEqual([]);
  });
  test('copies a file through its own route and reports missing files', async () => {
    const headers = { Authorization: 'Bearer test-token' };
    const result = await fetch(`${origin}/copy-file`, { method: 'POST', headers, body: '{"path":"/新 trace.pftrace"}' });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(copied).toEqual(['/新 trace.pftrace']);
    expect((await fetch(`${origin}/copy-file`, { headers })).status).toBe(405);
    expect((await fetch(`${origin}/copy-file`, { method: 'POST', headers, body: '{}' })).status).toBe(400);
    expect((await fetch(`${origin}/copy-file`, { method: 'POST', headers, body: '{"path":"/missing"}' })).status).toBe(404);
  });
  test('answers health and the reveal route', async () => {
    const headers = { Authorization: 'Bearer test-token' };
    expect(await (await fetch(`${origin}/health`, { headers })).json()).toEqual({ ok: true });
    const result = await fetch(`${origin}/reveal`, { method: 'POST', headers, body: '{"path":"/新 trace.pftrace"}' });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(calls).toEqual(['/新 trace.pftrace']);
  });
  test('reports invalid input, methods, unknown routes and missing files', async () => {
    const headers = { Authorization: 'Bearer test-token' };
    expect((await fetch(`${origin}/reveal`, { headers })).status).toBe(405);
    expect((await fetch(`${origin}/unknown`, { headers })).status).toBe(404);
    for (const body of ['{', 'null', '[]', '{}']) {
      expect((await fetch(`${origin}/reveal`, { method: 'POST', headers, body })).status).toBe(400);
    }
    const missing = await fetch(`${origin}/reveal`, { method: 'POST', headers, body: '{"path":"/missing"}' });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toHaveProperty('message');
    expect((await fetch(`${origin}/reveal`, { method: 'POST', headers, body: 'x'.repeat(64001) })).status).toBe(413);
  });
});
