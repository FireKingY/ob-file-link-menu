import { describe, expect, test } from 'bun:test';
import { filePathFromTabId } from '../desktop/file-tabs';

describe('file tab targets', () => {
  test('uses the complete tab path without decoding or removing filename punctuation', () => {
    for (const path of ['/workspace/a/readme.md', '/workspace/b/readme.md', '/workspace/中文目录/新 trace 100%.md', '/workspace/file%20name:42.md']) {
      expect(filePathFromTabId(`file:${path}`)).toBe(path);
    }
  });
  test('ignores other tab types, placeholders and invalid paths', () => {
    for (const id of [null, 'file', 'file:relative.md', 'chat:session', 'browser:https://example.com', 'file://server/file', 'file:/bad\0name', 'file:/bad\nname']) {
      expect(filePathFromTabId(id)).toBeNull();
    }
  });
});
