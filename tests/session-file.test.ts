import { describe, expect, test } from 'bun:test';
import { isSessionFileRequest, SESSION_FILE_CHANNEL } from '../shared/session-file';

describe('session file handoff', () => {
  test('preserves an absolute path with spaces and Unicode', () => {
    expect(isSessionFileRequest({ channel: SESSION_FILE_CHANNEL, version: 1, path: '/repo/中文目录/新 trace 100%.md' })).toBe(true);
  });
  test('rejects other channels, versions and invalid paths', () => {
    for (const value of [null, {}, { channel: 'other', version: 1, path: '/file' },
      { channel: SESSION_FILE_CHANNEL, version: 2, path: '/file' },
      ...['relative.md', '//host/file', '/file\0name', '/file\nname', '/file\rname', '/' + 'a'.repeat(32000)]
        .map((path) => ({ channel: SESSION_FILE_CHANNEL, version: 1, path }))]) {
      expect(isSessionFileRequest(value)).toBe(false);
    }
  });
});
