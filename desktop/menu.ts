import { fileActionIcon, fileMenuActions, runFileMenuAction, type FileMenuHandlers } from './actions';

export type FileTarget = { element: HTMLElement; path: string };

export function fileTargetAt(target: EventTarget | null): FileTarget | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('[data-openchamber-file-path]');
  if (!element?.closest('[data-markdown-content]')) return null;
  // Use the host's resolved path, which has already removed source line numbers.
  const path = element.getAttribute('data-openchamber-file-path');
  if (!path?.startsWith('/') || path.startsWith('//') || path.length > 32000 || path.includes('\0')) return null;
  return { element, path };
}

type MenuOptions = FileMenuHandlers & { document: Document };

export function installFileLinkMenu({ document, copy, copyFile, reveal, notify }: MenuOptions): () => void {
  const view = document.defaultView!;
  const lifetime = new AbortController();
  let closeMenu: (() => void) | undefined;
  const style = document.createElement('style');
  style.dataset.fileLinkMenu = 'style';
  style.textContent = `
    [data-file-link-menu] {
      position:fixed;z-index:2147483646;box-sizing:border-box;min-width:210px;max-width:calc(100vw - 16px);
      padding:5px;border:1px solid var(--interactive-border, #d5d5d5);border-radius:8px;
      background:var(--surface-elevated, #fff);color:var(--surface-elevated-foreground, #252525);
      box-shadow:0 8px 28px #0002;font:var(--font-size-ui, 13px)/1.5 var(--font-sans, -apple-system, sans-serif);
      -webkit-app-region:no-drag;
    }
    [data-file-link-menu] button {
      appearance:none;display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;
      background:transparent;color:inherit;border:0;border-radius:4px;text-align:left;white-space:nowrap;
      font:inherit;cursor:default;outline:none;
    }
    [data-file-link-menu] button:hover,[data-file-link-menu] button:focus-visible {
      background:var(--interactive-hover, #eee);
    }
    [data-file-link-menu] svg { width:16px;height:16px;flex:none;opacity:.78; }
  `;
  document.head.append(style);

  const open = (target: FileTarget, x: number, y: number) => {
    closeMenu?.();
    const menu = document.createElement('div');
    menu.dataset.fileLinkMenu = 'menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '文件链接');
    const events = new AbortController();
    const previousFocus = document.activeElement;
    const close = (restoreFocus = false) => {
      events.abort();
      menu.remove();
      closeMenu = undefined;
      if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
    closeMenu = close;
    const actions = fileMenuActions({ copy, copyFile, reveal, notify });
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action.id;
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      button.append(fileActionIcon(document, action.icon), document.createTextNode(action.label));
      button.addEventListener('click', () => {
        close(true);
        runFileMenuAction(action, target.path, notify);
      }, { signal: events.signal });
      menu.append(button);
    }
    document.body.append(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, view.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, view.innerHeight - bounds.height - 8))}px`;
    const buttons = Array.from(menu.querySelectorAll('button'));
    buttons[0]?.focus({ preventScroll: true });
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const index = buttons.findIndex((button) => button === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }, { signal: events.signal });
    document.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && !menu.contains(event.target)) close();
    }, { capture: true, signal: events.signal });
    document.addEventListener('scroll', () => close(), { capture: true, signal: events.signal });
    view.addEventListener('resize', () => close(), { signal: events.signal });
    view.addEventListener('blur', () => close(), { signal: events.signal });
  };

  document.addEventListener('contextmenu', (event) => {
    const target = fileTargetAt(event.target);
    if (!target) { closeMenu?.(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    const bounds = target.element.getBoundingClientRect();
    open(target, event.clientX || bounds.left, event.clientY || bounds.bottom);
  }, { capture: true, signal: lifetime.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    const target = fileTargetAt(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const bounds = target.element.getBoundingClientRect();
    open(target, bounds.left, bounds.bottom);
  }, { capture: true, signal: lifetime.signal });
  return () => { lifetime.abort(); closeMenu?.(); style.remove(); };
}
