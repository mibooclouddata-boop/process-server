const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'cover-assets/tide.js'), 'utf8');

function setup(options = {}) {
  const scheduled = new Map(), documentEvents = {}, windowEvents = {};
  const samples = [];
  let id = 0, mediaChange, intersectionChange;
  const reduced = {matches: !!options.reduced};
  if (options.legacyMedia) reduced.addListener = fn => { mediaChange = fn; };
  else reduced.addEventListener = (_, fn) => { mediaChange = fn; };
  const ctx = {
    setTransform(){}, fillRect(){}, beginPath(){}, moveTo(){}, fill(){},
    arc(x,y){samples.push([x,y]);}
  };
  const gl = new Proxy({
    getShaderParameter: () => !options.shaderFail,
    getProgramParameter: () => true,
    getUniformLocation: (_, name) => name,
    uniform1f(name, value) {if(name === 'uTime') samples.push(value);}
  }, {get(target, key) {return key in target ? target[key] : () => ({});}});
  let current;
  function makeCanvas(dataset = {zoom:'1.05'}) {
    return {
      dataset: {...dataset}, width: 600, height: 600, events: {},
      getBoundingClientRect: () => ({width:900, height:700}),
      getContext(type) {
        if(type === '2d') return options.noCanvas ? null : ctx;
        if(options.glThrows) throw Error('GPU unavailable');
        return options.noGL ? null : gl;
      },
      cloneNode() {return makeCanvas(this.dataset);},
      replaceWith(next) {current = next;},
      addEventListener(type, fn) {this.events[type] = fn;}
    };
  }
  current = makeCanvas();
  const error = {hidden:true};
  const document = {
    hidden:false, getElementById: () => current, querySelector: () => error,
    addEventListener(type, fn) {documentEvents[type] = fn;}
  };
  const context = {
    document, devicePixelRatio:1, innerWidth:1366,
    matchMedia: options.noMedia ? undefined : () => reduced,
    window: {addEventListener(type, fn) {windowEvents[type] = fn;}},
    requestAnimationFrame(fn) {scheduled.set(++id, fn); return id;},
    cancelAnimationFrame(id) {scheduled.delete(id);}
  };
  if(!options.noObservers) {
    context.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
    context.IntersectionObserver = class {
      constructor(fn) {intersectionChange = fn;}
      observe(){} unobserve(){} disconnect(){}
    };
  }
  vm.runInNewContext(source, context);
  return {
    get canvas(){return current;}, samples, scheduled, error,
    step(now) {const pending = [...scheduled.values()]; scheduled.clear(); pending.forEach(fn => fn(now));},
    hidden(value) {document.hidden=value; documentEvents.visibilitychange();},
    reduced(value) {reduced.matches=value; mediaChange();},
    intersect(value) {intersectionChange([{isIntersecting:value}]);},
    loseContext() {current.events.webglcontextlost({preventDefault(){}});},
    restorePage() {windowEvents.pagehide({persisted:true}); windowEvents.pageshow({persisted:true});},
    resize() {windowEvents.resize();}
  };
}
function assertMoves(app) {
  app.samples.length = 0;
  app.step(1000);
  const first = JSON.stringify(app.samples);
  assert.ok(app.samples.length > 0);
  app.samples.length = 0;
  app.step(1040);
  assert.notEqual(JSON.stringify(app.samples), first, 'rendered geometry/time must change');
  assert.equal(app.scheduled.size, 1, 'exactly one animation loop');
  assert.equal(app.canvas.dataset.running, 'true');
}
test('WebGL continues moving with reduced motion, at a gentler speed', () => {
  const normal=setup(), gentle=setup({reduced:true});
  assertMoves(normal); assertMoves(gentle);
  assert.ok(gentle.samples.at(-1) < normal.samples.at(-1));
  gentle.reduced(false); assert.equal(gentle.scheduled.size,1);
});
for(const options of [{noGL:true}, {glThrows:true}, {shaderFail:true}]) {
  test('GPU failure falls back to moving Canvas: ' + JSON.stringify(options), () => {
    const app=setup({...options,reduced:true});
    assert.equal(app.canvas.dataset.renderer,'canvas-fallback');
    assertMoves(app);
  });
}
test('missing observers and legacy media listener do not stop rendering', () => {
  const app=setup({noObservers:true,legacyMedia:true,reduced:true});
  assertMoves(app); app.resize(); app.reduced(false);
  assert.equal(app.scheduled.size,1);
});
test('missing matchMedia still animates', () => assertMoves(setup({noMedia:true})));
test('context loss switches to Canvas and keeps moving', () => {
  const app=setup(); app.loseContext();
  assert.equal(app.canvas.dataset.renderer,'canvas-fallback'); assertMoves(app);
});
test('hidden and offscreen pages pause; returning and back navigation resume once', () => {
  const app=setup();
  app.hidden(true); assert.equal(app.scheduled.size,0);
  app.hidden(false); assertMoves(app);
  app.intersect(false); assert.equal(app.scheduled.size,0);
  app.intersect(true); assertMoves(app);
  app.restorePage(); assertMoves(app);
});
test('unavailable WebGL and Canvas show a readable error without a loop', () => {
  const app=setup({noGL:true,noCanvas:true});
  assert.equal(app.error.hidden,false); assert.equal(app.scheduled.size,0);
});
