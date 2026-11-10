export const SESSION_FILE_CHANNEL = 'openchamber:file-link-menu:session-file';
export const SESSION_FILE_VERSION = 1;

export type SessionFileRequest = {
  channel: typeof SESSION_FILE_CHANNEL;
  version: typeof SESSION_FILE_VERSION;
  path: string;
};

export function isSessionFileRequest(value: unknown): value is SessionFileRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<SessionFileRequest>;
  return request.channel === SESSION_FILE_CHANNEL && request.version === SESSION_FILE_VERSION
    && typeof request.path === 'string' && request.path.startsWith('/') && !request.path.startsWith('//')
    && request.path.length <= 32000 && !/[\0\r\n]/.test(request.path);
}
