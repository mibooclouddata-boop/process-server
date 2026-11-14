'use strict';
function serverUrl(value, development) {
  if (!value && !development) throw new Error('PROCESS_SERVER_URL에 운영 HTTPS 주소를 지정하세요.');
  const url = new URL(value || 'http://localhost:3000');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (development && loopback && url.protocol === 'http:'))) {
    throw new Error('인증정보·쿼리·해시 없는 HTTPS 주소가 필요합니다. 개발 시에만 localhost HTTP를 허용합니다.');
  }
  return url.href;
}
module.exports = {serverUrl};
