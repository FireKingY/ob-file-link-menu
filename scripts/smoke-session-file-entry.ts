import { sendFileToCurrentSession } from '../background/send-to-session';

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'test-invoke'
    || !('path' in data) || typeof data.path !== 'string') return;
  void sendFileToCurrentSession(data.path).then(
    () => window.parent.postMessage({ type: 'session-file-test-result', ok: true }, '*'),
    (error: Error) => window.parent.postMessage({ type: 'session-file-test-result', ok: false, message: error.message }, '*'),
  );
});
