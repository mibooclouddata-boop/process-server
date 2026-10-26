'use strict';
const {randomBytes, scryptSync, scrypt, timingSafeEqual} = require('node:crypto');
const {promisify} = require('node:util');
const derive = promisify(scrypt);
// OWASP scrypt baseline, with a fresh salt per password.
const options = {N:131072, r:8, p:1, maxmem:160 * 1024 * 1024};
function validPassword(v) { return typeof v === 'string' && v.length >= 12 && v.length <= 128; }
function hashPassword(v) {
 const salt = randomBytes(16).toString('hex');
 return ['scrypt',131072,8,1,salt,scryptSync(v,salt,32,options).toString('hex')].join('$');
}
const validHash = v => typeof v === 'string' && /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(v);
async function verifyPassword(v, encoded) {
 if (typeof v !== 'string' || v.length > 128 || !validHash(encoded)) return false;
 const fields = encoded.split('$');
 return timingSafeEqual(await derive(v,fields[4],32,options), Buffer.from(fields[5],'hex'));
}
function migratePasswords(data) {
 let changed = false;
 for (const user of data.users) {
  if (Object.hasOwn(user,'password')) {
   if (!validHash(user.passwordHash)) {
    if (typeof user.password === 'string' && user.password && user.password !== '1234' && user.password.length <= 128) user.passwordHash = hashPassword(user.password);
    else { user.passwordResetRequired = true; delete user.passwordHash; }
   }
   delete user.password; changed = true;
  }
  if (!validHash(user.passwordHash) && !user.passwordResetRequired) { user.passwordResetRequired = true; changed = true; }
 }
 return changed;
}
module.exports = {validPassword, hashPassword, verifyPassword, migratePasswords};
