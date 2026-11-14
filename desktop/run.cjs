'use strict';
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {serverUrl} = require('./url.cjs');
try {
  const mode = process.argv[2];
  if (!['dev', 'build', 'build-local'].includes(mode)) throw new Error('dev, build 또는 build-local을 지정하세요.');
  const url = serverUrl(process.env.PROCESS_SERVER_URL, mode !== 'build');
  require('./prepare.cjs');
  const cli = path.join(path.dirname(require.resolve('@tauri-apps/cli/package.json')), 'tauri.js');
  const args = mode === 'build-local' ? ['build', '--debug', '--target', 'x86_64-pc-windows-msvc'] : [mode];
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: __dirname, stdio: 'inherit',
    env: {...process.env, PROCESS_SERVER_URL: url}
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
