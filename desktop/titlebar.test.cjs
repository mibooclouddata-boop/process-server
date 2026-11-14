const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('../node_modules/playwright');
test('desktop controls are accessible, dispatch narrow window commands, and skip nested frames', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'titlebar.js'), 'utf8');
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.calls = [];
      window.__TAURI_INTERNALS__ = {invoke:async (command) => { window.calls.push(command); return false; }};
    });
    await page.addInitScript({content:source});
    await page.goto('data:text/html,<html><body>ERP<iframe srcdoc="nested"></iframe></body></html>');
    await page.getByRole('button', {name:'최소화', exact:true}).click();
    await page.getByRole('button', {name:'최대화', exact:true}).click();
    await page.getByRole('button', {name:'닫기', exact:true}).click();
    assert.deepEqual(await page.evaluate(() => calls.filter(c => c.startsWith('plugin:window|') && !c.endsWith('is_maximized'))), [
      'plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|close'
    ]);
    assert.equal(await page.frames()[1].locator('#process-window-controls').count(), 0);
  } finally { await browser.close(); }
});
test('desktop shell rounds the full viewport and removes rounding when maximized', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'erp-chrome-spacing.js'), 'utf8');
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    const page = await browser.newPage();
    await page.addInitScript({content:source});
    await page.goto('data:text/html,<html><head><style>body{margin:0;background:rgb(242,244,246);min-height:100vh}</style></head><body><main id="dashboard">ERP</main></body></html>');
    assert.match(await page.evaluate(() => getComputedStyle(document.documentElement).clipPath), /26px/);
    const {PNG} = require(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
    const pixels = PNG.sync.read(await page.screenshot({omitBackground:true}));
    assert.equal(pixels.data[3], 0, 'Rounded corner must actually be transparent');
    await page.evaluate(() => document.documentElement.classList.add('process-desktop-maximized'));
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).clipPath), 'none');
  } finally { await browser.close(); }
});
test('blank ERP header starts dragging without intercepting buttons', async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {window.calls=[];window.__TAURI_INTERNALS__={invoke:async command=>calls.push(command)};});
    await page.addInitScript({path:path.join(__dirname,'erp-chrome-spacing.js')});
    await page.goto('data:text/html,<html><body><header class="app-topbar"><span>Blank header</span><button>Menu</button></header></body></html>');
    await page.getByText('Blank header').click();
    await page.getByRole('button',{name:'Menu'}).click();
    assert.deepEqual(await page.evaluate(()=>calls), ['plugin:window|start_dragging']);
  } finally {await browser.close();}
});
test('zoom selection emits a factor and restores the saved selection', async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage();
    await page.route('https://desktop.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.addInitScript(()=>{window.zoomCalls=[];window.__TAURI_INTERNALS__={invoke:async(command,args)=>{if(args?.event==='desktop-zoom')zoomCalls.push(args.payload);return false;}};});
    await page.addInitScript({path:path.join(__dirname,'titlebar.js')});
    await page.goto('https://desktop.test/');
    await page.getByRole('combobox',{name:'화면 배율'}).selectOption('125');
    assert.equal(await page.evaluate(()=>zoomCalls.at(-1)),1.25);
    await page.reload();
    assert.equal(await page.getByRole('combobox',{name:'화면 배율'}).inputValue(),'125');
    assert.equal(await page.evaluate(()=>zoomCalls.at(-1)),1.25);
  } finally {await browser.close();}
});
