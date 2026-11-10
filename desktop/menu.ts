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

type MenuOptions = {
  document: Document;
  copy: (path: string) => Promise<void>;
  copyFile: (path: string) => Promise<void>;
  reveal: (path: string) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};

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
    const actions = [
      { id: 'copy-path', label: '复制文件地址', run: copy, success: '已复制文件地址', icon: 'M8 4H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10M9 2h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z' },
      { id: 'copy-file', label: '复制文件', run: copyFile, success: '已复制文件，可在 Finder 中粘贴', icon: 'M14 2H6a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7l-5-5Zm0 0v5h5M8 12h8M8 16h8' },
      { id: 'reveal-file', label: '在 Finder 中打开', run: reveal, success: '已在 Finder 中打开', icon: 'M3 5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5Z' },
    ];
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action.id;
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '1.6');
      icon.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shape.setAttribute('d', action.icon);
      icon.append(shape);
      button.append(icon, document.createTextNode(action.label));
      button.addEventListener('click', () => {
        close(true);
        void action.run(target.path).then(() => notify(action.success), (error: unknown) => {
          const message = action.id === 'copy-file' && error instanceof Error ? error.message
            : action.id === 'copy-path' ? '复制失败，请重试。' : '无法在 Finder 中打开，请确认文件仍然存在且可访问。';
          notify(message, true);
        });
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
