'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fault = (message, status = 503) => Object.assign(new Error(message), {status});

// All readers/writers must use this store; a lock is never stolen by elapsed time.
function createAsStore(filename, {io = fs, timeout = 5000} = {}) {
  const file = path.resolve(filename), lock = file + '.lock', marker = file + '.initialized';
  io.mkdirSync(path.dirname(file), {recursive:true});
  function atomic(target, value) {
    const temporary = target + '.' + randomUUID() + '.tmp';
    let descriptor;
    try {
      descriptor = io.openSync(temporary, 'wx', 0o600);
      io.writeFileSync(descriptor, value);
      io.fsyncSync(descriptor);
      io.closeSync(descriptor); descriptor = undefined;
      io.renameSync(temporary, target);
    } finally {
      if (descriptor !== undefined) io.closeSync(descriptor);
      if (io.existsSync(temporary)) io.unlinkSync(temporary);
    }
  }
  function validate(data) {
    if (!data || !Array.isArray(data.list)) throw fault('AS 저장 파일의 구조를 확인해야 합니다.');
    const ids = new Set(), numbers = new Set();
    for (const row of data.list) {
      if (!row || typeof row.id !== 'string' || !row.id || typeof row.asNo !== 'string' || !row.asNo ||
          ids.has(row.id) || numbers.has(row.asNo)) throw fault('AS 식별자 또는 접수번호 중복을 먼저 복구해야 합니다.');
      ids.add(row.id); numbers.add(row.asNo);
      if (row.version !== undefined && (!Number.isSafeInteger(row.version) || row.version < 0)) throw fault('AS 버전 정보를 확인해야 합니다.');
    }
    for (const key of ['events','requests']) {
      if (data[key] === undefined) data[key] = [];
      if (!Array.isArray(data[key])) throw fault('AS 이력 또는 요청 기록의 구조를 확인해야 합니다.');
    }
    return data;
  }
  async function transaction(operation, {write = true} = {}) {
    const started = Date.now(); let descriptor;
    while (descriptor === undefined) {
      try { descriptor = io.openSync(lock, 'wx', 0o600); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() - started >= timeout) throw fault('다른 저장 작업이 진행 중입니다. 잠시 후 같은 요청으로 재시도하세요.');
        await sleep(20);
      }
    }
    try {
      io.writeFileSync(descriptor, JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
      if (!io.existsSync(file)) {
        if (io.existsSync(marker) || io.existsSync(file + '.bak')) throw fault('AS 파일이 없습니다. 백업을 확인한 후 복구해야 합니다.');
        io.writeFileSync(marker, 'AS store initialized\n', {flag:'wx',mode:0o600});
        atomic(file, JSON.stringify({list:[],monthSeq:{},events:[],requests:[]}));
      }
      // Existing installations get a marker without rewriting business records.
      const original = io.readFileSync(file, 'utf8');
      let data;
      try { data = validate(JSON.parse(original)); }
      catch (error) { throw error.status ? error : fault('AS 파일을 읽지 못했습니다. 원본과 백업을 확인하세요.'); }
      if (!io.existsSync(marker)) io.writeFileSync(marker, 'AS store initialized\n', {flag:'wx',mode:0o600});
      const result = operation(data);
      if (result && typeof result.then === 'function') throw new Error('AS transaction callbacks must be synchronous');
      if (write) {
        validate(data);
        // Retain the last complete generation; never restore it silently on errors.
        atomic(file + '.bak', original);
        atomic(file, JSON.stringify(data, null, 2));
      }
      return result;
    } finally {
      // A release error after commit must not make the API discard committed uploads.
      try { io.closeSync(descriptor); io.unlinkSync(lock); }
      catch (error) { console.error('AS 잠금 해제 실패:', error.code); }
    }
  }
  return {transaction, read:operation => transaction(operation, {write:false})};
}
module.exports = {createAsStore};
