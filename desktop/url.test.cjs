const {test} = require('node:test');
const assert = require('node:assert/strict');
const {serverUrl} = require('./url.cjs');
test('production requires an explicit HTTPS server', () => {
  assert.equal(serverUrl('https://erp.example.com', false), 'https://erp.example.com/');
  for (const value of [undefined, '', 'http://erp.example.com', 'https://user:secret@erp.example.com', 'file:///tmp/a', 'bad', 'https://erp.example.com/?token=secret', 'https://erp.example.com/#token']) {
    assert.throws(() => serverUrl(value, false));
  }
});
test('development permits only loopback HTTP', () => {
  assert.equal(serverUrl(undefined, true), 'http://localhost:3000/');
  assert.equal(serverUrl('http://127.0.0.1:3001', true), 'http://127.0.0.1:3001/');
  assert.throws(() => serverUrl('http://example.com', true));
});
