import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export class ActionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function inspectLocalPath(path: unknown, platform = process.platform) {
  if (platform !== 'darwin') {
    throw new ActionError(501, '此操作仅适用于 macOS，请连接本机的 OpenChamber。');
  }
  if (typeof path !== 'string' || !isAbsolute(path) || path.length > 32000 || path.includes('\0')) {
    throw new ActionError(400, '请提供文件的绝对路径。');
  }
  let information;
  try { information = await stat(path); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new ActionError(404, '文件不存在，可能已被移动或删除。');
    if (code === 'EACCES' || code === 'EPERM') throw new ActionError(403, '无法访问此文件，请检查文件权限。');
    throw error;
  }
  if (!information.isFile() && !information.isDirectory()) {
    throw new ActionError(400, '请选择文件或文件夹。');
  }
  return { path, information };
}

export async function revealLocalPath(
  input: unknown,
  options: {
    platform?: NodeJS.Platform;
    launch?: (program: string, args: string[]) => Promise<unknown>;
  } = {},
): Promise<void> {
  const { path, information } = await inspectLocalPath(input, options.platform);
  // Separate arguments preserve spaces, Unicode and shell metacharacters.
  const args = information.isDirectory() ? ['--', path] : ['-R', '--', path];
  const launch = options.launch ?? ((program, args) => execute(program, args, { timeout: 8000, maxBuffer: 16000 }));
  await launch('/usr/bin/open', args);
}
