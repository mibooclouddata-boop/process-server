'use strict';
// Cookies remain HttpOnly. Only same-origin API writes receive the CSRF header.
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const api = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    const method = (init.method || input.method || 'GET').toUpperCase();
    if (api && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = new Headers(init.headers || input.headers);
      headers.set('X-Requested-With', 'process-server');
      init = {...init, headers};
    }
    const response = await originalFetch(input, init);
    if (api && response.status === 401 && url.pathname !== '/api/login') {
      sessionStorage.removeItem('currentUser');
      localStorage.removeItem('currentUser');
      window.location.replace('/login.html');
    }
    return response;
  };
})();
