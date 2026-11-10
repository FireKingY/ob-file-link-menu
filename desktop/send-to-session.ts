import { isSessionFileRequest, SESSION_FILE_CHANNEL } from '../shared/session-file';

const FILE_PATH_TYPE = 'application/x-openchamber-file-path';

function sourceFrame(document: Document, source: MessageEventSource | null): HTMLIFrameElement | undefined {
  return Array.from(document.querySelectorAll('iframe')).find((frame) => {
    if (frame.contentWindow !== source || frame.title !== '文件链接菜单' || !frame.sandbox.contains('allow-scripts')) return false;
    if (!frame.closest('[aria-hidden="true"][inert]')) return false;
    try {
      const path = new URL(frame.src).pathname;
      return /^\/api\/guest-files\/[^/]+\/background\/index\.html$/.test(path)
        || path === '/api/guests/file-link-menu/background/index.html';
    } catch { return false; }
  });
}

export function addFileToCurrentComposer(document: Document, path: string): void {
  const editors = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-input="true"] .cm-content[contenteditable="true"]'));
  const editor = editors.find((candidate) => !candidate.closest('[data-chat-column="pinned"]'));
  const target = editor?.closest<HTMLElement>('[data-chat-input="true"]');
  if (!editor || !target) throw new Error('请先打开当前会话，再添加文件。');
  if (editor.closest('[inert], [aria-hidden="true"]')) throw new Error('当前会话输入框不可用，请返回会话后重试。');
  // CodeMirror's Mod+End moves after the whole draft. Unlike ArrowDown, End
  // does not invoke the composer's history or autocomplete navigation.
  editor.focus({ preventScroll: true });
  const moveToEnd = new KeyboardEvent('keydown', {
    key: 'End', code: 'End', metaKey: true, bubbles: true, cancelable: true,
  });
  editor.dispatchEvent(moveToEnd);
  // At the end of an empty draft the movement command can be a no-op.
  if (!moveToEnd.defaultPrevented && document.getSelection()?.isCollapsed !== true) {
    throw new Error('无法定位当前会话的输入位置，请重新载入页面后重试。');
  }
  const transfer = new DataTransfer();
  // The native drop handler confirms the whole path before inserting its @mention.
  // An absolute path stays correct when Files and the chat use different roots.
  transfer.setData(FILE_PATH_TYPE, path);
  const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
  target.dispatchEvent(event);
  if (!event.defaultPrevented) throw new Error('当前会话未接收文件，请重新载入 OpenChamber 页面后重试。');
  editor.focus({ preventScroll: true });
}

export function installSessionFileHandoff(document: Document): () => void {
  const view = document.defaultView!;
  const onMessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || !('channel' in data) || data.channel !== SESSION_FILE_CHANNEL) return;
    // Only this extension's mounted background frame can request the handoff.
    // A private MessagePort carries the result back to that invocation.
    if (!sourceFrame(document, event.source) || event.ports.length !== 1) return;
    const port = event.ports[0]!;
    try {
      if (!isSessionFileRequest(data)) throw new Error('文件地址无效，请重新选择文件。');
      addFileToCurrentComposer(document, data.path);
      port.postMessage({ ok: true });
    } catch (error) {
      port.postMessage({ ok: false, message: error instanceof Error ? error.message : '无法添加文件，请重试。' });
    } finally { port.close(); }
  };
  view.addEventListener('message', onMessage);
  return () => view.removeEventListener('message', onMessage);
}
