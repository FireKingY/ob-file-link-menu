const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');

const directory = path.resolve(__dirname, '..');
const profile = mkdtempSync(path.join(process.env.FILE_LINK_MENU_TEST_TMP || os.tmpdir(), 'session-file-electron-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-background-networking');
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('Session file test timed out'); app.exit(1); }, 20000);

const html = `<!doctype html><meta charset="utf-8">
<div data-chat-column="pinned"><div data-chat-input="true" id="pinned-target"><div class="cm-content" contenteditable="true">侧栏问题</div></div></div>
<div data-chat-column="main"><div data-chat-input="true" id="main-target"><div class="cm-content" contenteditable="true">已有问题</div></div></div>
<div aria-hidden="true" inert><iframe id="extension" title="文件链接菜单" sandbox="allow-scripts" src="/api/guest-files/test-grant/background/index.html"></iframe></div>
<button id="send-to-session">发送到当前会话</button>
<script>
window.__OPENCHAMBER_PLATFORM__='darwin';window.__OPENCHAMBER_DESKTOP__={invoke:async()=>{}};
window.drops=[];window.results=[];window.nextPath='/workspace/example.md';
window.addEventListener('message',event=>{if(event.source===document.getElementById('extension').contentWindow&&event.data?.type==='session-file-test-result')window.results.push(event.data);});
document.getElementById('send-to-session').onclick=()=>document.getElementById('extension').contentWindow.postMessage({type:'test-invoke',path:window.nextPath},'*');
</script><script src="/composer.js"></script><script src="/adapter.js"></script>`;

async function run() {
  let exitCode = 0;
  let server;
  try {
    const bundle = (input, output) => execFileSync(process.env.FILE_LINK_MENU_BUN || 'bun', [path.join(directory, 'node_modules/@openchamber/sdk/scripts/bundle-guest.ts'), input, output], { cwd: directory, stdio: 'pipe' });
    bundle(path.join(__dirname, 'smoke-session-file-entry.ts'), path.join(profile, 'entry.js'));
    const dependencyRoot = process.env.FILE_LINK_MENU_UI_SOURCE;
    if (!dependencyRoot) throw new Error('Set FILE_LINK_MENU_UI_SOURCE to an OpenChamber packages/ui directory with installed dependencies.');
    const resolveDependency = (name) => JSON.stringify(require.resolve(name, { paths: [dependencyRoot] }));
    writeFileSync(path.join(profile, 'composer.ts'), `
      import { EditorView, keymap } from ${resolveDependency('@codemirror/view')};
      import { EditorState } from ${resolveDependency('@codemirror/state')};
      import { standardKeymap } from ${resolveDependency('@codemirror/commands')};
      window.composers={};
      for (const [id,text] of [['main-target','已有问题\\n第二行'],['pinned-target','侧栏问题']]) {
        const parent=document.getElementById(id);parent.replaceChildren();
        const view=new EditorView({parent,state:EditorState.create({doc:text,selection:{anchor:0,head:text.length},extensions:[keymap.of(standardKeymap)]})});
        window.composers[id]=view;
        parent.addEventListener('drop',event=>{
          event.preventDefault();
          const path=event.dataTransfer.getData('application/x-openchamber-file-path');
          window.drops.push({target:id,path,types:Array.from(event.dataTransfer.types)});
          const selection=view.state.selection.main;
          view.dispatch({changes:{from:selection.from,to:selection.to,insert:' @'+path}});
        });
      }
    `);
    bundle(path.join(profile, 'composer.ts'), path.join(profile, 'composer.js'));
    const entry = readFileSync(path.join(profile, 'entry.js'));
    const adapter = readFileSync(path.join(directory, 'desktop/main.js'));
    server = http.createServer((request, response) => {
      const route = new URL(request.url, 'http://test').pathname;
      if (route === '/adapter.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(adapter); return; }
      if (route === '/entry.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(entry); return; }
      if (route === '/composer.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(readFileSync(path.join(profile, 'composer.js'))); return; }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(route.endsWith('/background/index.html') ? '<script src="/entry.js"></script>' : html);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await app.whenReady();
    const win = new BrowserWindow({ show: false, width: 800, height: 500, webPreferences: { sandbox: true } });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    const evaluate = (source) => win.webContents.executeJavaScript(source, true);
    const invoke = async (file) => {
      const count = await evaluate('window.results.length');
      await evaluate(`window.nextPath=${JSON.stringify(file)};document.getElementById('send-to-session').click()`);
      return evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+6000;function read(){if(window.results.length>${count})resolve(window.results.at(-1));else if(Date.now()>deadline)reject(new Error('Missing handoff result'));else setTimeout(read,15);}read();})`);
    };
    const file = '/workspace/中文目录/新 trace 100%.md';
    assert.deepEqual(await invoke(file), { type: 'session-file-test-result', ok: true });
    assert.deepEqual(await evaluate('window.drops'), [{ target: 'main-target', path: file, types: ['application/x-openchamber-file-path'] }]);
    assert.equal(await evaluate('window.composers["main-target"].state.doc.toString()'), `已有问题\n第二行 @${file}`);
    assert.equal(await evaluate('document.querySelector("#pinned-target .cm-content").textContent'), '侧栏问题');

    await evaluate('document.querySelector("#main-target .cm-content").contentEditable="false"');
    assert.equal((await invoke('/repo/no-session.md')).ok, false);
    assert.equal(await evaluate('window.drops.length'), 1);
    await evaluate('document.querySelector("#main-target .cm-content").contentEditable="true"');
    assert.equal((await invoke('relative.md')).ok, false);
    assert.equal(await evaluate('window.drops.length'), 1);

    await evaluate(`window.postMessage({channel:'openchamber:file-link-menu:session-file',version:1,path:'/repo/spoof.md'},'*')`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))');
    assert.equal(await evaluate('window.drops.length'), 1);

    await evaluate(adapter.toString());
    assert.equal((await invoke('/repo/second.md')).ok, true);
    assert.equal(await evaluate('window.drops.length'), 2);
    await evaluate('window.__OPENCHAMBER_FILE_LINK_MENU_DISPOSE__()');
    await evaluate('window.nextPath="/repo/after-dispose.md";document.getElementById("send-to-session").click()');
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))');
    assert.equal(await evaluate('window.drops.length'), 2);
    console.log('PASS: sandboxed extension request, private reply, native file-drop payload, Unicode and spaces, draft preservation, main versus pinned composer, errors, spoof rejection and cleanup.');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    clearTimeout(timeout);
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    rmSync(profile, { recursive: true, force: true });
    app.exit(exitCode);
  }
}

void run();
