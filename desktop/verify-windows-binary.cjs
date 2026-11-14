'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const exe=fs.readFileSync(process.argv[2]);
assert.equal(exe.toString('ascii',0,2),'MZ','Expected a Windows executable');
const pe=exe.readUInt32LE(0x3c);
assert.equal(exe.readUInt32LE(pe),0x4550,'Expected PE signature');
assert.equal(exe.readUInt16LE(pe+24+68),2,'Desktop app must use Windows GUI subsystem, including local-test builds');
console.log('PASS: Windows GUI executable; no extra console taskbar window');
