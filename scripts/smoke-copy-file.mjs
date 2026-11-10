import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const directory = await mkdtemp(join(process.env.FILE_LINK_MENU_TEST_TMP ?? tmpdir(), 'file-link-menu-native-'));
const fixture = join(directory, '新 trace 100% " $(test);.pftrace');
await writeFile(fixture, 'native clipboard fixture');
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const token = randomUUID();
const service = spawn(process.execPath, [fileURLToPath(new URL('../service/main.js', import.meta.url))], {
  env: { ...process.env, OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: token },
  stdio: 'ignore',
});

// Keep every original pasteboard item in memory. Restore it only while the
// pasteboard still contains this test's file, so a user copy takes precedence.
const nativeTest = `
ObjC.import('AppKit');
ObjC.import('Foundation');
function run(argv) {
  var pasteboard = $.NSPasteboard.generalPasteboard;
  var saved = $.NSMutableArray.alloc.init;
  var items = pasteboard.pasteboardItems;
  for (var i = 0; i < items.count; i++) {
    var original = items.objectAtIndex(i);
    var copy = $.NSPasteboardItem.alloc.init;
    var types = original.types;
    for (var j = 0; j < types.count; j++) {
      var type = types.objectAtIndex(j);
      var data = original.dataForType(type);
      if (data) copy.setDataForType(data, type);
    }
    saved.addObject(copy);
  }
  var expected = argv[1];
  function currentPath() {
    var raw = pasteboard.stringForType('public.file-url');
    return raw ? ObjC.unwrap($.NSURL.URLWithString(raw).path) : null;
  }
  try {
    var task = $.NSTask.alloc.init;
    task.launchPath = '/usr/bin/curl';
    task.arguments = $(['--silent', '--show-error', '--fail-with-body', '--max-time', '15',
      '-H', 'Authorization: Bearer ' + argv[2], '-H', 'Content-Type: application/json',
      '--data-binary', JSON.stringify({path: expected}), argv[0] + '/copy-file']);
    var output = $.NSPipe.pipe;
    task.standardOutput = output;
    task.standardError = output;
    task.launch;
    task.waitUntilExit;
    if (task.terminationStatus !== 0) throw new Error('Copy route failed');
    var body = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(output.fileHandleForReading.readDataToEndOfFile, $.NSUTF8StringEncoding));
    if (JSON.parse(body).ok !== true) throw new Error('Copy route did not report success');
    if (currentPath() !== expected) throw new Error('The pasteboard does not contain the expected file URL');
    var objects = pasteboard.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL), $.NSDictionary.dictionary);
    if (!objects || Number(objects.count) !== 1) throw new Error('The pasteboard does not contain one NSURL');
    if (!objects.objectAtIndex(0).isFileURL) throw new Error('The pasteboard URL is not a file URL');
    return 'PASS';
  } finally {
    if (currentPath() === expected) {
      pasteboard.clearContents;
      if (saved.count > 0 && !pasteboard.writeObjects(saved)) throw new Error('Could not restore the original clipboard');
    }
  }
}
`;

try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (service.exitCode !== null) throw new Error('Service exited before readiness');
    try {
      const response = await fetch(`${origin}/health`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the loopback listener. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(ready, 'Service did not become ready');
  for (const route of ['/reveal', '/copy-file']) {
    assert.equal((await fetch(`${origin}${route}`, { method: 'POST', body: '{}' })).status, 401);
    const response = await fetch(`${origin}${route}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: join(directory, 'missing') }),
    });
    assert.equal(response.status, 404);
  }
  const result = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', nativeTest, '--', origin, fixture, token], { timeout: 20000 });
  assert.equal(result.stdout.trim(), 'PASS');
  console.log('PASS: bundled Node routes, native macOS file clipboard, Unicode and punctuation, NSURL readback, and original clipboard restoration.');
} finally {
  if (service.exitCode === null && service.signalCode === null) {
    const exited = once(service, 'exit');
    service.kill('SIGTERM');
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
