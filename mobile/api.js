// Configure the same server for login and business requests. Never persist bearer tokens.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://192.168.1.100:3000';
let token = null;
export async function apiFetch(path, options = {}) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  return fetch(SERVER_URL + path, {
    ...options,
    credentials: 'omit',
    headers: {...options.headers, 'X-Requested-With':'process-server', ...(token ? {Authorization:'Bearer ' + token} : {})},
  });
}
export async function login(id, password) {
  token = null;
  const response = await apiFetch('/api/login', {
    method:'POST', headers:{'Content-Type':'application/json', 'X-Client-Type':'mobile'},
    body:JSON.stringify({id,password}),
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.token) return null;
  token = data.token;
  return data.user;
}
export async function logout() {
  try { if (token) await apiFetch('/api/logout', {method:'POST'}); }
  catch { /* Local logout must complete even when the server is unreachable. */ }
  finally { token = null; }
}
