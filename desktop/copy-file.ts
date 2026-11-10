type HostFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function copyFileFromHost(path: string, request: HostFetch = (...args) => window.fetch(...args)): Promise<void> {
  // The host's fetch bridge supplies the active runtime and its authorization.
  // The extension service still enforces its enabled state and approved scope.
  let response: Response;
  try {
    response = await request('/api/guests/file-link-menu/service/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'POST', path: '/copy-file', body: JSON.stringify({ path }) }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('无法连接文件复制服务，请确认本机 OpenChamber 正在运行后重试。');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404
      || ['NO_SERVICE', 'NOT_GRANTED', 'DISABLED'].includes(result?.error)) {
      throw new Error('请在“设置 → 扩展”中启用“文件链接菜单”，并批准 osascript 权限后重试。');
    }
    throw new Error('文件复制服务启动失败，请在“设置 → 扩展”中检查后重试。');
  }
  if (!result || typeof result.status !== 'number' || typeof result.body !== 'string') {
    throw new Error('文件复制服务返回了无效结果，请重试。');
  }
  let answer: { ok?: boolean; message?: string } | null = null;
  try { answer = JSON.parse(result.body); } catch { /* Use the failure message below. */ }
  if (result.status < 200 || result.status >= 300 || answer?.ok !== true) {
    throw new Error(typeof answer?.message === 'string' ? answer.message : '无法复制文件，请确认文件仍然存在且可访问。');
  }
}
