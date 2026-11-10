import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDirectory = fileURLToPath(new URL('..', import.meta.url));
const start = '<!-- openchamber:file-link-menu:start -->';
const end = '<!-- openchamber:file-link-menu:end -->';
const marker = /\n?<!-- openchamber:file-link-menu:start -->[\s\S]*?<!-- openchamber:file-link-menu:end -->\n?/g;
const digest = (text) => createHash('sha256').update(text).digest('hex');

export function addAdapter(html, filename) {
  if (!/<\/body>/i.test(html)) throw new Error('找不到页面的 body 结束标签。');
  const clean = html.replace(marker, '\n');
  return clean.replace(/<\/body>/i, `${start}\n<script defer src="/${filename}"></script>\n${end}\n</body>`);
}

export function removeAdapter(html) { return html.replace(marker, '\n'); }

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeAtomic(path, content) {
  const temporary = `${path}.file-link-menu-${process.pid}`;
  try {
    const information = await stat(path).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    await writeFile(temporary, content, { flag: 'wx', mode: information ? information.mode & 0o777 : 0o644 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function planAdapter(uiDirectory, operation = 'apply') {
  if (!['apply', 'remove'].includes(operation)) throw new Error('找不到此操作。');
  const directory = await realpath(uiDirectory);
  const source = await readFile(join(extensionDirectory, 'desktop/main.js'), 'utf8');
  const filename = `file-link-menu-adapter-${digest(source).slice(0, 12)}.js`;
  const files = [];
  for (const name of ['index.html', 'mini-chat.html']) {
    const path = join(directory, name);
    const before = await readOptional(path);
    if (before === null) { if (name === 'index.html') throw new Error('找不到 OpenChamber 的 index.html。'); continue; }
    const hasMarker = before.includes(start);
    const existingSource = before.match(/<script defer src="\/(file-link-menu-adapter-[a-f0-9]{12}\.js)"><\/script>/)?.[1];
    const after = operation === 'remove' ? hasMarker ? removeAdapter(before) : before
      : hasMarker && existingSource === filename ? before : addAdapter(before, filename);
    files.push({ name, path, before, after, changed: before !== after });
  }
  return { directory, filename, source, files };
}

export async function applyAdapter(plan, backupRoot) {
  const changed = plan.files.filter((file) => file.changed);
  const scriptPath = join(plan.directory, plan.filename);
  const existingScript = await readOptional(scriptPath);
  if (existingScript !== null && existingScript !== plan.source) throw new Error('适配脚本的同名文件已变更，未覆盖此文件。');
  const backupDirectory = join(backupRoot, `${Date.now()}-${process.pid}`);
  if (changed.length) {
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    for (const file of changed) await copyFile(file.path, join(backupDirectory, file.name), constants.COPYFILE_EXCL);
    await writeFile(join(backupDirectory, 'record.json'), JSON.stringify({
      uiDirectory: plan.directory,
      script: plan.filename,
      files: changed.map((file) => ({ name: file.name, before: digest(file.before), after: digest(file.after) })),
    }, null, 2));
  }
  const written = [];
  try {
    if (existingScript === null) await writeFile(scriptPath, plan.source, { flag: 'wx' });
    for (const file of changed) {
      if (await readFile(file.path, 'utf8') !== file.before) throw new Error('页面在安装期间发生变化，请重新运行安装。');
      await writeAtomic(file.path, file.after);
      written.push(file);
    }
  } catch (error) {
    for (const file of written.reverse()) {
      if (await readFile(file.path, 'utf8') === file.after) await writeAtomic(file.path, file.before);
    }
    if (existingScript === null && await readOptional(scriptPath) === plan.source) await unlink(scriptPath);
    throw error;
  }
  return { changed: changed.map((file) => file.path), backupDirectory: changed.length ? backupDirectory : null };
}

export async function removeInstalledAdapter(plan, backupRoot) {
  const changed = plan.files.filter((file) => file.changed);
  const backupDirectory = join(backupRoot, `${Date.now()}-${process.pid}-remove`);
  if (changed.length) {
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    for (const file of changed) await copyFile(file.path, join(backupDirectory, file.name), constants.COPYFILE_EXCL);
  }
  const written = [];
  try {
    for (const file of changed) {
      if (await readFile(file.path, 'utf8') !== file.before) throw new Error('页面在撤销期间发生变化，请重试。');
      await writeAtomic(file.path, file.after);
      written.push(file);
    }
  } catch (error) {
    for (const file of written.reverse()) {
      if (await readFile(file.path, 'utf8') === file.after) await writeAtomic(file.path, file.before);
    }
    throw error;
  }
  // Leave the inactive script on disk. It can belong to another open window.
  return { changed: changed.map((file) => file.path), backupDirectory: changed.length ? backupDirectory : null };
}

async function main() {
  const [operation = 'plan', selectedDirectory] = process.argv.slice(2);
  if (!['plan', 'apply', 'remove'].includes(operation)) throw new Error('用法：node scripts/desktop-adapter.mjs plan|apply|remove [web-dist目录]');
  const directory = selectedDirectory ?? process.env.OPENCHAMBER_WEB_DIST;
  if (!directory) throw new Error('请传入 OpenChamber 的 web-dist 目录，或设置 OPENCHAMBER_WEB_DIST。');
  const backupRoot = process.env.FILE_LINK_MENU_BACKUP_DIR
    ?? join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'file-link-menu/desktop-backups');
  const plan = await planAdapter(directory, operation === 'remove' ? 'remove' : 'apply');
  if (operation === 'plan') {
    console.log(JSON.stringify({
      operation: 'plan',
      uiDirectory: plan.directory,
      adapter: join(plan.directory, plan.filename),
      changes: plan.files.filter((file) => file.changed).map((file) => ({ path: file.path, adds: [start, `<script defer src="/${plan.filename}"></script>`, end] })),
      backupRoot,
      note: '此命令只显示计划。apply 修改应用页面资源。remove 移除加载标记。应用更新可以覆盖适配脚本。',
    }, null, 2));
    return;
  }
  const result = operation === 'remove' ? await removeInstalledAdapter(plan, backupRoot) : await applyAdapter(plan, backupRoot);
  console.log(JSON.stringify({ operation, ...result, reload: '重新载入 OpenChamber 页面后生效。' }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
