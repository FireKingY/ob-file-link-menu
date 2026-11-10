import { SESSION_FILE_CHANNEL, SESSION_FILE_VERSION } from '../shared/session-file';

export function sendFileToCurrentSession(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const connection = new MessageChannel();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      connection.port1.close();
      connection.port2.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error('请重新应用桌面适配并重新载入 OpenChamber 页面后重试。')), 5000);
    connection.port1.onmessage = (event: MessageEvent<unknown>) => {
      const result = event.data;
      if (!result || typeof result !== 'object' || !('ok' in result)) return;
      if (result.ok === true) { finish(); return; }
      const message = 'message' in result && typeof result.message === 'string' ? result.message : '无法添加文件，请重试。';
      finish(new Error(message));
    };
    window.parent.postMessage({ channel: SESSION_FILE_CHANNEL, version: SESSION_FILE_VERSION, path }, '*', [connection.port2]);
  });
}
