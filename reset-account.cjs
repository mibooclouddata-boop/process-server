'use strict';
// Offline operator command. Stop the server first; never put passwords in argv.
const fs = require('node:fs');
const path = require('node:path');
const {validPassword, hashPassword, migratePasswords} = require('./passwords');
const [id, mode] = process.argv.slice(2);
const password = process.env.PROCESS_ACCOUNT_PASSWORD;
delete process.env.PROCESS_ACCOUNT_PASSWORD;
if (!id || !validPassword(password) || (mode && mode !== '--bootstrap')) {
  console.error('Usage: node reset-account.cjs <id> [--bootstrap]; set PROCESS_ACCOUNT_PASSWORD (12–128 chars) securely. Stop the server first.');
  process.exit(1);
}
const dir = path.resolve(process.env.PROCESS_DATA_DIR || __dirname);
const file = path.join(dir, 'data.json');
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {users:[], records:[]};
let user = data.users.find(u => u.id === id);
if (!user) {
  if (mode !== '--bootstrap' || data.users.length) {
    console.error('Account not found. Bootstrap is allowed only for an empty user store.');
    process.exit(1);
  }
  user = {id, name:id, role:'sysadmin'};
  data.users.push(user);
}
user.passwordHash = hashPassword(password);
delete user.password;
delete user.passwordResetRequired;
migratePasswords(data);
fs.mkdirSync(dir, {recursive:true});
fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), {mode:0o600});
fs.renameSync(file + '.tmp', file);
console.log('Account credential updated. No password was printed.');
