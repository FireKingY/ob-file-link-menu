import { fileActionIcon, fileMenuActions, runFileMenuAction, type FileMenuHandlers } from './actions';

const POPUP = '[role="menu"][data-slot="dropdown-menu-content"]';

export function filePathFromTabId(id: string | null): string | null {
  if (!id?.startsWith('file:')) return null;
  const path = id.slice('file:'.length);
  // Tab ids contain the real path. Percent signs and colons belong to its name.
  return path.startsWith('/') && !path.startsWith('//') && path.length <= 32000 && !/[\0\r\n]/.test(path) ? path : null;
}

function tabTarget(target: EventTarget | null): { element: HTMLElement; path: string } | null {
  if (!(target instanceof Element)) return null;
  const tab = target.closest<HTMLElement>('[data-sortable-tab-id]');
  if (!tab?.closest('[data-context-panel="true"]')) return null;
  const path = filePathFromTabId(tab.getAttribute('data-sortable-tab-id'));
  return path ? { element: tab, path } : null;
}

export function installFileTabMenu(document: Document, handlers: FileMenuHandlers): () => void {
  const view = document.defaultView!;
  const lifetime = new AbortController();
  let cancelWait: (() => void) | undefined;
  const mounted = new Map<HTMLElement, () => void>();
  const frames = new Set<number>();
  const style = document.createElement('style');
  style.dataset.fileTabMenu = 'style';
  style.textContent = `
    [data-file-tab-actions] [role="menuitem"] { display:flex;align-items:center;gap:.5rem;cursor:pointer;outline:none; }
    [data-file-tab-actions] [role="menuitem"]:hover,[data-file-tab-actions] [role="menuitem"]:focus { background:var(--interactive-hover,#eee); }
    [data-file-tab-actions] svg { width:1rem;height:1rem;flex:none;opacity:.78; }
  `;
  document.head.append(style);

  const cleanRemoved = () => {
    for (const [popup, dispose] of mounted) {
      if (!popup.isConnected) { dispose(); mounted.delete(popup); }
    }
  };

  const augment = (popup: HTMLElement, path: string) => {
    if (mounted.has(popup)) return;
    const events = new AbortController();
    const sample = popup.querySelector<HTMLElement>('[role="menuitem"]');
    if (!sample) return;
    const group = document.createElement('div');
    group.dataset.fileTabActions = '';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '文件操作');
    const separator = document.createElement('div');
    separator.setAttribute('role', 'separator');
    separator.className = popup.querySelector('[role="separator"]')?.className ?? 'bg-border -mx-1 my-0.5 h-px';
    group.append(separator);
    for (const action of fileMenuActions(handlers)) {
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
      item.className = sample.className;
      item.dataset.fileTabAction = action.id;
      item.append(fileActionIcon(document, action.icon), document.createTextNode(action.label));
      item.addEventListener('pointermove', () => item.focus({ preventScroll: true }), { signal: events.signal });
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Let the original menu close before focusing the composer or copying.
        popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        const frame = view.requestAnimationFrame(() => {
          frames.delete(frame);
          runFileMenuAction(action, path, handlers.notify);
        });
        frames.add(frame);
      }, { signal: events.signal });
      group.append(item);
    }
    popup.append(group);
    popup.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement
        && event.target.hasAttribute('data-file-tab-action')) {
        event.preventDefault(); event.stopImmediatePropagation(); event.target.click(); return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = Array.from(popup.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .filter((item) => item.getAttribute('aria-disabled') !== 'true' && !item.hasAttribute('data-disabled') && !item.closest('[hidden]'));
      if (!items.length) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const index = items.findIndex((item) => item === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    }, { capture: true, signal: events.signal });
    mounted.set(popup, () => { events.abort(); group.remove(); });
  };

  const prepare = (event: Event) => {
    cancelWait?.();
    cleanRemoved();
    const target = tabTarget(event.target);
    if (!target) return;
    let waiting = true;
    const existing = new Set(document.querySelectorAll<HTMLElement>(POPUP));
    const observer = new MutationObserver(() => inspect());
    const stop = () => { waiting = false; observer.disconnect(); clearTimeout(timer); if (cancelWait === stop) cancelWait = undefined; };
    const inspect = () => {
      if (!waiting || lifetime.signal.aborted) return;
      if (!target.element.isConnected) { stop(); return; }
      const trigger = target.element.querySelector<HTMLElement>('[aria-controls]');
      const id = trigger?.getAttribute('aria-controls');
      const linked = id ? document.getElementById(id) : null;
      const popup = linked?.matches(POPUP) ? linked : Array.from(document.querySelectorAll<HTMLElement>(POPUP))
        .find((candidate) => !existing.has(candidate) && !candidate.hasAttribute('data-ending-style'));
      if (!popup) return;
      stop();
      augment(popup, target.path);
    };
    const timer = setTimeout(stop, 2000);
    cancelWait = stop;
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-controls', 'aria-expanded'] });
    queueMicrotask(inspect);
  };
  document.addEventListener('contextmenu', prepare, { capture: true, signal: lifetime.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) prepare(event);
  }, { capture: true, signal: lifetime.signal });
  return () => {
    lifetime.abort(); cancelWait?.(); style.remove();
    for (const frame of frames) view.cancelAnimationFrame(frame);
    for (const dispose of mounted.values()) dispose();
    mounted.clear();
  };
}
