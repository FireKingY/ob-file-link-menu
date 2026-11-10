export type FileMenuHandlers = {
  copy: (path: string) => Promise<void>;
  copyFile: (path: string) => Promise<void>;
  reveal: (path: string) => Promise<void>;
  send?: (path: string) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};

export type FileMenuAction = {
  id: string;
  label: string;
  run: (path: string) => Promise<void>;
  success: string;
  failure: string;
  icon: string;
};

export function fileMenuActions(handlers: FileMenuHandlers): FileMenuAction[] {
  const actions = [
    { id: 'copy-path', label: '复制文件地址', run: handlers.copy, success: '已复制文件地址', failure: '复制失败，请重试。', icon: 'M8 4H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10M9 2h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z' },
    { id: 'copy-file', label: '复制文件', run: handlers.copyFile, success: '已复制文件，可在 Finder 中粘贴', failure: '无法复制文件，请重试。', icon: 'M14 2H6a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7l-5-5Zm0 0v5h5M8 12h8M8 16h8' },
    { id: 'reveal-file', label: '在 Finder 中打开', run: handlers.reveal, success: '已在 Finder 中打开', failure: '无法在 Finder 中打开，请确认文件仍然存在且可访问。', icon: 'M3 5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5Z' },
  ];
  if (handlers.send) actions.push({
    id: 'send-to-session', label: '发送到当前会话', run: handlers.send,
    success: '已添加到当前会话输入框', failure: '无法添加文件，请重试。',
    icon: 'm3 3 18 9-18 9 4-9-4-9Zm4 9h14',
  });
  return actions;
}

export function fileActionIcon(document: Document, path: string): SVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.6');
  icon.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  icon.append(shape);
  return icon;
}

export function runFileMenuAction(action: FileMenuAction, path: string, notify: FileMenuHandlers['notify']): void {
  void action.run(path).then(() => notify(action.success), (error: unknown) => {
    const message = (action.id === 'copy-file' || action.id === 'send-to-session') && error instanceof Error
      ? error.message : action.failure;
    notify(message, true);
  });
}
