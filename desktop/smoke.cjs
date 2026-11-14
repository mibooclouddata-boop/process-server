'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {chromium} = require('../node_modules/playwright');
const {startFixture} = require('../test-support/as-fixture.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
(async () => {
  const exe = path.join(process.env.CARGO_TARGET_DIR || path.join(__dirname,'src-tauri/target'), 'x86_64-pc-windows-msvc/debug/process-server-desktop.exe');
  assert(fs.existsSync(exe), 'Build the debug executable first');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'process-desktop-smoke-'));
  let app, browser, fixture, updateServer;
  try {
    fixture = await startFixture();
    let updateMode = 'error';
    updateServer = http.createServer((req,res)=>{
      if(req.url==='/installer.exe'){res.writeHead(200,{'Content-Length':'7'});res.end('invalid');return;}
      if(updateMode==='none'){res.writeHead(204);res.end();return;}
      if(updateMode==='error'){res.writeHead(503);res.end();return;}
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({version:'99.0.0',notes:'필수 업데이트 테스트',platforms:{'windows-x86_64':{url:`http://127.0.0.1:${updateServer.address().port}/installer.exe`,signature:'aW52YWxpZA=='}}}));
    });
    await new Promise(resolve=>updateServer.listen(0,'127.0.0.1',resolve));
    const port = await freePort();
    app = spawn(exe, [], {env:{...process.env,
      PROCESS_SERVER_URL: fixture.url,
      PROCESS_UPDATE_URL: `http://127.0.0.1:${updateServer.address().port}/update`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
    }});
    let launchError;
    app.on('error', error => launchError = error);
    for (let i = 0; i < 60; i++) {
      if (launchError) throw launchError;
      if (app.exitCode !== null || app.signalCode !== null) throw new Error(`App exited: ${app.exitCode ?? app.signalCode}`);
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; }
      catch { await delay(500); }
    }
    assert(browser, 'WebView2 debugging endpoint did not start');
    const context = browser.contexts()[0];
    context.setDefaultTimeout(20000);
    context.setDefaultNavigationTimeout(20000);
    let page, controls;
    for (let i = 0; i < 30; i++) {
      controls = context.pages().find(p => p.url().endsWith('/titlebar.html'));
      page = context.pages().find(p => p !== controls && p.url().startsWith('http://tauri.localhost/'));
      if (page && controls) break;
      await delay(200);
    }
    assert(page, 'ERP window was not created: ' + JSON.stringify(context.pages().map(p => p.url())));
    assert(controls, 'Local titlebar was not created');
    await page.getByRole('button',{name:'다시 시도'}).waitFor();
    await controls.getByRole('button',{name:'다시 연결',exact:true}).click();
    await page.evaluate(url=>{location.href=url;},fixture.url);
    await delay(300);
    assert(page.url().startsWith('http://tauri.localhost/'),'Update gate must block reconnect and direct ERP navigation');
    updateMode='available';
    await page.getByRole('button',{name:'다시 시도'}).click();
    await page.getByRole('button',{name:'업데이트 시작'}).waitFor();
    fs.mkdirSync(path.resolve(__dirname,'../.artifacts/desktop'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../.artifacts/desktop/required-update.png')});
    await page.getByRole('button',{name:'업데이트 시작'}).click();
    await page.getByRole('button',{name:'다시 시도'}).waitFor();
    assert(page.url().startsWith('http://tauri.localhost/'),'Invalid signature must not unlock ERP');
    updateMode='none';
    await page.evaluate(()=>localStorage.setItem('erp-update-access-pending','true'));
    await page.reload();
    await page.getByRole('button',{name:'업무시스템 접속',exact:true}).waitFor();
    assert(page.url().startsWith('http://tauri.localhost/'),'Updated app waits for access after startup check');
    await page.getByRole('button',{name:'업무시스템 접속',exact:true}).click();
    await page.waitForURL(fixture.url+'/**');
    console.log('PASS: mandatory update gate, offline retry, bypass rejection, invalid signature rejected, post-update access');
    assert.equal(await controls.locator('button').first().evaluate(el => getComputedStyle(el).width), '32px');
    // Native navigation can replace the initial local document during CDP attachment.
    for (let i = 0; i < 60 && !page.url().startsWith(fixture.url + '/'); i++) await delay(250);
    assert(page.url().startsWith(fixture.url + '/'), `Server did not open: ${page.url()}`);
    const originalViewport = await page.evaluate(() => ({width:innerWidth,height:innerHeight}));
    const originalDpr = await page.evaluate(() => devicePixelRatio);
    const controlsDpr = await controls.evaluate(() => devicePixelRatio);
    await controls.getByRole('combobox', {name:'화면 배율'}).selectOption('125');
    await page.waitForFunction(dpr => Math.abs(devicePixelRatio - dpr * 1.25) < 0.01, originalDpr);
    assert.equal(await controls.evaluate(() => devicePixelRatio), controlsDpr, 'Window controls must stay the same size');
    await controls.reload();
    assert.equal(await controls.getByRole('combobox', {name:'화면 배율'}).inputValue(), '125');
    await page.reload();
    await page.waitForFunction(dpr => Math.abs(devicePixelRatio - dpr * 1.25) < 0.01, originalDpr);
    await controls.getByRole('combobox', {name:'화면 배율'}).selectOption('150');
    await page.waitForFunction(dpr => Math.abs(devicePixelRatio - dpr * 1.5) < 0.01, originalDpr);
    await controls.getByRole('combobox', {name:'화면 배율'}).selectOption('100');
    await page.waitForFunction(dpr => devicePixelRatio === dpr, originalDpr);
    console.log('PASS: native zoom 100/125/150%, saved selection, navigation persistence, fixed control size');
    await page.evaluate(() => { const d = document.createElement('dialog'); d.id='desktop-modal-test'; d.textContent='Modal test'; document.body.append(d); d.showModal(); });
    await controls.getByRole('button', {name:'최대화',exact:true}).click();
    await controls.waitForFunction(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized', {label:'main'}));
    await page.waitForFunction(() => document.documentElement.classList.contains('process-desktop-maximized'));
    await controls.getByRole('button', {name:'이전 크기로',exact:true}).click();
    await controls.waitForFunction(async () => !(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized', {label:'main'})));
    await page.waitForFunction(() => !document.documentElement.classList.contains('process-desktop-maximized'));
    await page.waitForFunction(size => innerWidth === size.width && innerHeight === size.height, originalViewport);
    await page.evaluate(() => document.getElementById('desktop-modal-test').remove());
    assert.equal(await page.evaluate(async () => {
      try { await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {event:'desktop-update-check',payload:null}); return false; }
      catch { return true; }
    }), true, 'Remote ERP must not emit local update commands');
    assert.equal(await page.evaluate(async () => {
      try { await window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', {title:'not allowed'}); return false; }
      catch { return true; }
    }), true, 'Unrelated native permissions stay denied');
    assert.equal(await page.evaluate(async () => {
      try { await window.__TAURI_INTERNALS__.invoke('plugin:window|minimize', {label:'main'}); return false; }
      catch { return true; }
    }), true, 'Remote ERP must not get local chrome permissions');
    await page.goto(fixture.url + '/login.html');
    await page.locator('#identifier').fill('admin');
    await page.locator('#password').fill('Fixture-passphrase-2026!');
    await page.locator('#submitBtn').click();
    await page.waitForURL('**/dashboard.html', {timeout:30000});
    const me = await page.evaluate(async () => ({status:(await fetch('/api/me')).status}));
    assert.equal(me.status, 200);
    // Login keeps the dashboard in a transition iframe; reload also verifies the session survives navigation.
    await page.reload();
    await page.waitForFunction(() => typeof openAsModal === 'function' && currentUser?.id === 'admin');
    console.log('Restored viewport', await page.evaluate(() => ({width:innerWidth,height:innerHeight,clip:getComputedStyle(document.documentElement).clipPath})), 'original', originalViewport);
    await page.evaluate(() => openAsModal());
    await page.locator('#asShip').fill('DESKTOP TEST');
    await page.locator('#asBlock').fill('B01');
    await page.locator('#asReasonSelect').selectOption('기타');
    await page.locator('#asReason').fill('Tauri verification');
    await page.locator('#asFiles').setInputFiles({name:'desktop.txt',mimeType:'text/plain',buffer:Buffer.from('desktop attachment')});
    await page.locator('#asModal button[onclick="submitAs()"]' ).click();
    await page.locator('#asModal').waitFor({state:'hidden'});
    const stored = fixture.read('as.json').list[0];
    assert.equal(stored.files.length, 1);
    assert.equal(fs.readFileSync(path.join(fixture.dir, 'uploads', stored.files[0].filename), 'utf8'), 'desktop attachment');
    await page.evaluate(async () => { await loadAsList(); await printAsPdf(_asFullList[0]); });
    await page.frameLocator('#printFrame').getByText('DESKTOP TEST', {exact:false}).first().waitFor();
    await page.evaluate(() => closeFileViewer());
    assert.equal(await page.evaluate(() => typeof window.__TAURI__), 'undefined');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:profile});
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['desktop-smoke'], {type:'text/plain'}));
      a.download = 'desktop-smoke.txt'; a.click();
    });
    for (let i = 0; i < 30 && !fs.existsSync(path.join(profile, 'desktop-smoke.txt')); i++) await delay(200);
    assert.equal(fs.readFileSync(path.join(profile, 'desktop-smoke.txt'), 'utf8'), 'desktop-smoke');
    const original = page.url();
    await page.evaluate(() => { location.href = 'https://example.com/'; });
    await delay(500);
    assert.equal(page.url(), original, 'Foreign navigation must be blocked');
    const shots = path.resolve(__dirname, '../.artifacts/desktop');
    fs.mkdirSync(shots, {recursive:true});
    await page.locator('#toastContainer').waitFor({state:'hidden'});
    await page.screenshot({path:path.join(shots, 'dashboard.png'), omitBackground:true});
    await controls.screenshot({path:path.join(shots, 'titlebar.png')});
    if (process.env.DESKTOP_SMOKE_HOLD === '1') { console.log('READY FOR SCREENSHOT'); await delay(60000); }
    const logout = await page.evaluate(async () => (await fetch('/api/logout', {method:'POST',headers:{'X-Requested-With':'process-server'}})).status);
    assert.equal(logout, 200);
    assert.equal((await context.request.get(fixture.url + '/api/me')).status(), 401);
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Close control failed')), 10000);
      app.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    await controls.getByRole('button', {name:'닫기',exact:true}).click();
    await closed;
    console.log('PASS: actual Tauri WebView2 login, session, file upload, document preview, blob download, navigation restriction, logout');
  } finally {
    const errors = [];
    for (const cleanup of [
      () => browser?.close(),
      async () => {
        if (!app?.pid || app.exitCode !== null || app.signalCode !== null) return;
        let timer;
        try {
          const exited = new Promise((resolve, reject) => {
            app.once('exit', resolve);
            timer = setTimeout(() => reject(new Error('App termination timed out')), 5000);
          });
          app.kill(); await exited;
        } finally { clearTimeout(timer); }
      },
      () => fixture?.close(),
      () => updateServer && new Promise(resolve=>updateServer.close(resolve)),
      () => {
        // Only the temporary profile created above may be removed.
        if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('process-desktop-smoke-')) {
          fs.rmSync(profile, {recursive:true,force:true,maxRetries:10,retryDelay:300});
        }
      }
    ]) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Smoke cleanup failed');
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
