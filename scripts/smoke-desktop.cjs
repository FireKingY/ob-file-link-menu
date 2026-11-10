const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');

const taskTemporary = process.env.FILE_LINK_MENU_TEST_TMP || os.tmpdir();
const profile = mkdtempSync(path.join(taskTemporary, 'file-link-menu-electron-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-background-networking');
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('Desktop menu test timed out'); app.exit(1); }, 20000);

async function run() {
  let exitCode = 0;
  try {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, width: 760, height: 480, webPreferences: { sandbox: true } });
    const contents = window.webContents;
    const evaluate = (code) => contents.executeJavaScript(code, true);
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <!doctype html><meta charset="utf-8"><style>
      :root{--surface-elevated:#fff;--surface-elevated-foreground:#262626;--interactive-hover:#edf0f3;--interactive-border:#ddd}
      body{font:16px -apple-system;padding:28px;color:#262626;background:#f7f7f6}p{margin:28px 0}a{color:#248798}code{font-size:14px}
      </style><div data-markdown-content>
      <p><a id="file" data-openchamber-file-path="/workspace/中文目录/新 trace 100%.pftrace" href="/workspace/encoded.pftrace:12"><span>新 trace.pftrace</span></a></p>
      <p><a id="web" href="https://example.com">普通网页链接</a></p>
      <p><code id="code" tabindex="0" data-openchamber-file-path="/repo/src/修改记录.ts">src/修改记录.ts:42</code></p>
      <p id="plain">普通文本</p></div>
      <a id="outside" data-openchamber-file-path="/outside-chat" href="#">Outside chat</a>
      <script>
      window.calls=[];window.contexts=0;window.failCopy=false;window.failReveal=false;window.failFileCopy=false;
      window.__OPENCHAMBER_PLATFORM__='darwin';
      window.__OPENCHAMBER_DESKTOP__={invoke:async(command,args)=>{if(window.failReveal)throw new Error('denied');window.calls.push({kind:'reveal',command,args});}};
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text)=>{if(window.failCopy)throw new Error('denied');window.calls.push({kind:'copy',text});}}});
      window.fetch=async(url,options)=>{
        if(window.failFileCopy)return Response.json({error:'NO_SERVICE'},{status:403});
        window.calls.push({kind:'copy-file',url,request:JSON.parse(options.body)});
        return Response.json({status:200,body:'{"ok":true}'});
      };
      document.addEventListener('contextmenu',()=>window.contexts++);
      </script>
    `));
    const source = readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
    await evaluate(source);
    const rightClick = async (selector) => {
      const point = await evaluate(`(() => {const bounds=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)};})()`);
      contents.sendInputEvent({ type: 'mouseDown', button: 'right', clickCount: 1, ...point });
      contents.sendInputEvent({ type: 'mouseUp', button: 'right', clickCount: 1, ...point });
      await evaluate('new Promise(resolve => requestAnimationFrame(() => resolve(true)))');
    };
    const settle = () => evaluate('new Promise(resolve => requestAnimationFrame(() => resolve(true)))');

    await rightClick('#file span');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).map(item=>item.textContent)'), ['复制文件地址', '复制文件', '在 Finder 中打开']);
    assert.equal(await evaluate('window.contexts'), 0);
    assert.equal(await evaluate('document.activeElement.dataset.action'), 'copy-path');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    await settle();
    assert.equal(await evaluate('document.activeElement.dataset.action'), 'copy-file');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    await settle();
    assert.equal(await evaluate('document.activeElement.dataset.action'), 'reveal-file');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await settle();
    assert.equal(await evaluate('document.querySelector("[role=menu]") === null'), true);

    await rightClick('#file span');
    await evaluate('document.querySelector("[data-action=copy-path]").click()');
    await settle();
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'copy', text: '/workspace/中文目录/新 trace 100%.pftrace' });
    await rightClick('#file');
    await evaluate('document.querySelector("[data-action=copy-file]").click()');
    await settle();
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'copy-file', url: '/api/guests/file-link-menu/service/request', request: {
      method: 'POST', path: '/copy-file', body: '{"path":"/workspace/中文目录/新 trace 100%.pftrace"}',
    } });
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=status]")).at(-1).textContent'), '已复制文件，可在 Finder 中粘贴');
    await rightClick('#file');
    await evaluate('document.querySelector("[data-action=reveal-file]").click()');
    await settle();
    assert.deepEqual(await evaluate('window.calls.at(-1)'), { kind: 'reveal', command: 'desktop_reveal_path', args: { path: '/workspace/中文目录/新 trace 100%.pftrace' } });

    for (const selector of ['#web', '#plain', '#outside']) {
      await rightClick(selector);
      assert.equal(await evaluate('document.querySelector("[role=menu]") === null'), true);
    }
    assert.equal(await evaluate('window.contexts'), 3);

    await evaluate('document.querySelector("#code").focus()');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'F10', modifiers: ['shift'] });
    await settle();
    assert.equal(await evaluate('document.querySelectorAll("[role=menu]").length'), 1);
    await evaluate('document.querySelector("[data-action=copy-path]").click()');
    await settle();
    assert.equal(await evaluate('window.calls.at(-1).text'), '/repo/src/修改记录.ts');

    await evaluate('window.failCopy=true');
    await rightClick('#file');
    await evaluate('document.querySelector("[data-action=copy-path]").click()');
    await settle();
    assert.equal(await evaluate('document.querySelector("[role=alert]").textContent'), '复制失败，请重试。');
    await evaluate('window.failFileCopy=true');
    await rightClick('#file');
    await evaluate('document.querySelector("[data-action=copy-file]").click()');
    await settle();
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=alert]")).at(-1).textContent.includes("osascript")'), true);
    await evaluate('window.failCopy=false;window.failReveal=true');
    await rightClick('#file');
    await evaluate('document.querySelector("[data-action=reveal-file]").click()');
    await settle();
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=alert]")).at(-1).textContent.includes("Finder")'), true);

    await rightClick('#file');
    await evaluate('document.dispatchEvent(new Event("scroll"))');
    assert.equal(await evaluate('document.querySelector("[role=menu]") === null'), true);
    await rightClick('#file');
    await evaluate('window.dispatchEvent(new Event("blur"))');
    assert.equal(await evaluate('document.querySelector("[role=menu]") === null'), true);
    await evaluate('document.querySelector("#file").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:755,clientY:475}))');
    assert.equal(await evaluate('(()=>{const r=document.querySelector("[role=menu]").getBoundingClientRect();return r.right<=innerWidth-7&&r.bottom<=innerHeight-7;})()'), true);

    await evaluate(source);
    assert.equal(await evaluate('document.querySelectorAll("style[data-file-link-menu]").length'), 1);
    await evaluate('window.failReveal=false');
    await rightClick('#file span');
    const screenshotPath = process.env.FILE_LINK_MENU_SCREENSHOT;
    if (screenshotPath) writeFileSync(screenshotPath, (await contents.capturePage()).toPNG());
    await evaluate('window.__OPENCHAMBER_FILE_LINK_MENU_DISPOSE__()');
    assert.equal(await evaluate('document.querySelector("[data-file-link-menu]") === null'), true);
    assert.equal(await evaluate('document.querySelector("[data-file-link-notice]") === null'), true);
    console.log('PASS: real right clicks, file copy requests, exact Unicode paths, Finder IPC, keyboard navigation, ordinary links, errors, dismissal, viewport bounds and cleanup.');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    clearTimeout(timeout);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    rmSync(profile, { recursive: true, force: true });
    app.exit(exitCode);
  }
}

void run();
