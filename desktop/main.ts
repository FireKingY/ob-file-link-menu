import { installFileLinkMenu } from './menu';
import { copyFileFromHost } from './copy-file';
import { installSessionFileHandoff } from './send-to-session';

declare global {
  interface Window {
    __OPENCHAMBER_PLATFORM__?: string;
    __OPENCHAMBER_DESKTOP__?: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> };
    __OPENCHAMBER_FILE_LINK_MENU_DISPOSE__?: () => void;
  }
}

// This entry belongs in the host page. A sandboxed extension cannot load it there.
if (window.__OPENCHAMBER_PLATFORM__ === 'darwin' && window.__OPENCHAMBER_DESKTOP__) {
  const bridge = window.__OPENCHAMBER_DESKTOP__;
  window.__OPENCHAMBER_FILE_LINK_MENU_DISPOSE__?.();
  const notices = new Set<HTMLElement>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const disposeSessionHandoff = installSessionFileHandoff(document);
  const dispose = installFileLinkMenu({
    document,
    copy: (path) => navigator.clipboard.writeText(path),
    copyFile: copyFileFromHost,
    reveal: async (path) => { await bridge.invoke('desktop_reveal_path', { path }); },
    notify: (message, error = false) => {
      const notice = document.createElement('div');
      notice.dataset.fileLinkNotice = '';
      notice.setAttribute('role', error ? 'alert' : 'status');
      notice.textContent = message;
      notice.style.cssText = `position:fixed;z-index:2147483647;bottom:24px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:10px 14px;border-radius:8px;background:var(--surface-elevated,#fff);color:var(--surface-elevated-foreground,#252525);border:1px solid var(--interactive-border,#ddd);box-shadow:0 4px 20px #0002;font:13px/1.5 var(--font-sans,-apple-system,sans-serif);pointer-events:none;`;
      document.body.append(notice);
      notices.add(notice);
      const timer = setTimeout(() => { notice.remove(); notices.delete(notice); timers.delete(timer); }, error ? 6000 : 2200);
      timers.add(timer);
    },
  });
  window.__OPENCHAMBER_FILE_LINK_MENU_DISPOSE__ = () => {
    dispose();
    disposeSessionHandoff();
    for (const timer of timers) clearTimeout(timer);
    for (const notice of notices) notice.remove();
    delete window.__OPENCHAMBER_FILE_LINK_MENU_DISPOSE__;
  };
}
