const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');

const directory = path.resolve(__dirname, '..');
const profile = mkdtempSync(path.join(process.env.FILE_LINK_MENU_TEST_TMP || os.tmpdir(), 'file-tabs-electron-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-background-networking');
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('File tab test timed out'); app.exit(1); }, 25000);

async function run() {
  let exitCode = 0;
  let server;
  try {
    const dependencyRoot = process.env.FILE_LINK_MENU_UI_SOURCE;
    if (!dependencyRoot) throw new Error('Set FILE_LINK_MENU_UI_SOURCE to an OpenChamber packages/ui directory with installed dependencies.');
    const dependency = (name) => JSON.stringify(require.resolve(name, { paths: [dependencyRoot] }));
    const fixture = `
      import React from ${dependency('react')};
      import { createRoot } from ${dependency('react-dom/client')};
      import { ContextMenu } from ${dependency('@base-ui/react/context-menu')};
      import { EditorView, keymap } from ${dependency('@codemirror/view')};
      import { EditorState } from ${dependency('@codemirror/state')};
      import { standardKeymap } from ${dependency('@codemirror/commands')};
      const h=React.createElement;
      const files=[{key:'a',id:'file:/workspace/active/readme.md'},{key:'b',id:'file:/workspace/中文 100%/readme.md'},{key:'web',id:'browser:https://example.com'}];
      window.calls=[];window.selected='a';window.closedTabs=[];
      window.__OPENCHAMBER_PLATFORM__='darwin';
      window.__OPENCHAMBER_DESKTOP__={invoke:async(command,args)=>window.calls.push({kind:'reveal',command,args})};
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text)=>window.calls.push({kind:'copy',text})}});
      window.fetch=async(url,options)=>{window.calls.push({kind:'copy-file',url,request:JSON.parse(options.body)});return Response.json({status:200,body:'{"ok":true}'});};
      function tab(file){
        return h('div',{'data-sortable-tab-id':file.id,key:file.key},h(ContextMenu.Root,null,
          h(ContextMenu.Trigger,{render:(props)=>h('div',{...props},h('button',{id:'tab-'+file.key,role:'tab','aria-selected':file.key==='a',onClick:()=>window.selected=file.key},file.key==='web'?'Browser':'readme.md'))}),
          h(ContextMenu.Portal,null,h(ContextMenu.Positioner,null,h(ContextMenu.Popup,{'data-slot':'dropdown-menu-content',className:'native-menu'},
            h(ContextMenu.Item,{className:'native-item',onClick:()=>window.closedTabs.push(file.key)},'关闭'),
            h(ContextMenu.Separator,{className:'native-separator'}),
            h(ContextMenu.Item,{className:'native-item'},'关闭其他'),
            h(ContextMenu.Item,{className:'native-item',disabled:true},'关闭左侧标签'),
            h(ContextMenu.Item,{className:'native-item'},'关闭右侧标签'),
            h(ContextMenu.Item,{className:'native-item'},'关闭所有标签'),
            h(ContextMenu.Separator,{className:'native-separator'}),
            h(ContextMenu.Item,{className:'native-item'},'将面板移到左侧'),
            h(ContextMenu.Item,{className:'native-item'},'将面板移到底部'))))));
      }
      createRoot(document.getElementById('root')).render(h('section',{'data-context-panel':'true'},h('header',null,...files.map(tab))));
      const host=document.getElementById('composer');
      window.composer=new EditorView({parent:host,state:EditorState.create({doc:'已有问题\\n第二行',selection:{anchor:0,head:8},extensions:[keymap.of(standardKeymap)]})});
      host.addEventListener('drop',event=>{event.preventDefault();const path=event.dataTransfer.getData('application/x-openchamber-file-path');window.calls.push({kind:'send',path});const selection=window.composer.state.selection.main;window.composer.dispatch({changes:{from:selection.from,to:selection.to,insert:' @'+path}});});
    `;
    writeFileSync(path.join(profile, 'fixture.ts'), fixture);
    execFileSync(process.env.FILE_LINK_MENU_BUN || 'bun', [path.join(directory, 'node_modules/@openchamber/sdk/scripts/bundle-guest.ts'), path.join(profile, 'fixture.ts'), path.join(profile, 'fixture.js')], { cwd: directory, stdio: 'pipe' });
    const html = `<!doctype html><meta charset="utf-8"><style>
      :root{--surface-elevated:#fff;--surface-elevated-foreground:#222;--interactive-hover:#eee}
      body{font:14px -apple-system;margin:20px;background:#f7f7f6}header{display:flex;gap:8px;margin-bottom:40px}header button{padding:12px}
      .native-menu{min-width:208px;background:white;border:1px solid #ddd;border-radius:10px;padding:4px;box-shadow:0 8px 28px #0002}
      .native-item{padding:6px 10px;border-radius:6px;outline:none}.native-item[data-highlighted]{background:#eee}.native-item[data-disabled]{opacity:.4}
      .native-separator{height:1px;margin:4px;background:#ddd}
      </style><div id="root"></div><div data-chat-column="main"><div data-chat-input="true" id="composer"></div></div><script src="/fixture.js"></script><script src="/adapter.js"></script>`;
    const adapter = readFileSync(path.join(directory, 'desktop/main.js'));
    server = http.createServer((request, response) => {
      const route = new URL(request.url, 'http://test').pathname;
      if (route === '/fixture.js' || route === '/adapter.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(route === '/fixture.js' ? readFileSync(path.join(profile, 'fixture.js')) : adapter);
      } else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await app.whenReady();
    const win = new BrowserWindow({ show: false, width: 850, height: 650, webPreferences: { sandbox: true } });
    const contents = win.webContents;
    const evaluate = (code) => contents.executeJavaScript(code, true);
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    const rightClick = async (selector, additions = true) => {
      const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
      contents.sendInputEvent({ type: 'mouseDown', button: 'right', clickCount: 1, ...point });
      contents.sendInputEvent({ type: 'mouseUp', button: 'right', clickCount: 1, ...point });
      await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+2500;function read(){const menu=document.querySelector('[role=menu][data-slot=dropdown-menu-content]');if(menu&&${additions ? 'menu.querySelectorAll("[data-file-tab-action]").length===4' : 'true'})resolve(true);else if(Date.now()>end)reject(new Error('Missing tab menu'));else setTimeout(read,15);}read();})`);
      await settle();
    };
    const choose = async (id) => { await evaluate(`document.querySelector('[data-file-tab-action="${id}"]').click()`); await settle(); };
    const target = '/workspace/中文 100%/readme.md';
    await rightClick('#tab-b');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("[data-file-tab-action]")).map(item=>item.textContent)'), ['复制文件地址', '复制文件', '在 Finder 中打开', '发送到当前会话']);
    assert.equal(await evaluate('window.selected'), 'a');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).some(item=>item.textContent==="关闭左侧标签"&&item.getAttribute("aria-disabled")==="true")'), true);
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).some(item=>item.textContent==="将面板移到底部")'), true);
    assert.equal(await evaluate('document.querySelector("[role=menu]").getBoundingClientRect().bottom<=innerHeight'), true);
    await choose('copy-path');
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'copy', text: target });
    assert.equal(await evaluate('document.querySelector("[role=menu]")===null'), true);
    await rightClick('#tab-b'); await choose('reveal-file');
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'reveal', command: 'desktop_reveal_path', args: { path: target } });
    await rightClick('#tab-b'); await choose('copy-file');
    assert.equal(await evaluate('JSON.parse(window.calls.at(-1).request.body).path'), target);
    await rightClick('#tab-b'); await choose('send-to-session');
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'send', path: target });
    assert.equal(await evaluate('window.composer.state.doc.toString()'), `已有问题\n第二行 @${target}`);
    await rightClick('#tab-a');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'End' }); await settle();
    assert.equal(await evaluate('document.activeElement.dataset.fileTabAction'), 'send-to-session');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' }); await settle();
    assert.equal(await evaluate('document.activeElement.textContent'), '关闭');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); await settle();
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); await settle();
    assert.equal(await evaluate('document.activeElement.textContent'), '关闭右侧标签');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'End' }); await settle();
    for (let index = 0; index < 3; index++) { contents.sendInputEvent({ type: 'keyDown', keyCode: 'Up' }); await settle(); }
    assert.equal(await evaluate('document.activeElement.dataset.fileTabAction'), 'copy-path');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); await settle();
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'copy', text: '/workspace/active/readme.md' });
    await rightClick('#tab-a');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await settle();
    await rightClick('#tab-a');
    await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).find(item=>item.textContent==="关闭").click()');
    await settle();
    assert.deepEqual(await evaluate('window.closedTabs'), ['a']);
    await rightClick('#tab-web', false);
    assert.equal(await evaluate('document.querySelectorAll("[data-file-tab-action]").length'), 0);
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await settle();
    await evaluate(adapter.toString());
    await rightClick('#tab-b');
    assert.equal(await evaluate('document.querySelectorAll("[data-file-tab-action]").length'), 4);
    await evaluate('window.__OPENCHAMBER_FILE_LINK_MENU_DISPOSE__()');
    assert.equal(await evaluate('document.querySelectorAll("[data-file-tab-action]").length'), 0);
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).some(item=>item.textContent==="关闭")'), true);
    console.log('PASS: real Base UI tab menus, all four file actions, inactive same-name tabs, exact Unicode paths, draft preservation, native close/move entries, keyboard navigation, other tab types and cleanup.');
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
