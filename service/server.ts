import { createServer } from 'node:http';
import { ActionError, revealLocalPath } from './reveal';
import { copyLocalFile } from './copy-file';

export function createFileLinkServer(token: string, reveal = revealLocalPath, copyFile = copyLocalFile) {
  if (!token) throw new Error('请从 OpenChamber 启动此扩展。');
  return createServer(async (request, response) => {
    const answer = (status: number, value: unknown) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      }).end(JSON.stringify(value));
    };
    if (request.headers.authorization !== `Bearer ${token}`) {
      answer(401, { message: '需要扩展授权。' });
      return;
    }
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/health' && request.method === 'GET') { answer(200, { ok: true }); return; }
    if (path !== '/reveal' && path !== '/copy-file') { answer(404, { message: '找不到此操作。' }); return; }
    if (request.method !== 'POST') { answer(405, { message: '此操作需要 POST 请求。' }); return; }
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        let tooLarge = false;
        request.on('data', (chunk: Buffer) => {
          if (tooLarge) return;
          bytes += chunk.length;
          if (bytes > 64000) {
            tooLarge = true;
            chunks.length = 0;
            reject(new ActionError(413, '文件地址过长。'));
            return;
          }
          chunks.push(chunk);
        });
        request.once('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
        request.once('error', reject);
      });
      let input: unknown;
      try { input = JSON.parse(body); }
      catch { throw new ActionError(400, '文件地址格式无效。'); }
      if (!input || typeof input !== 'object' || !('path' in input)) {
        throw new ActionError(400, '请提供文件地址。');
      }
      await (path === '/copy-file' ? copyFile : reveal)(input.path);
      answer(200, { ok: true });
    } catch (error) {
      if (error instanceof ActionError) answer(error.status, { message: error.message });
      else answer(500, { message: path === '/copy-file' ? '无法复制文件，请确认剪贴板可用后重试。' : '无法在 Finder 中打开，请确认 Finder 可用后重试。' });
    }
  });
}
