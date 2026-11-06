/* =====================================================================
   OJT-ERAMS — http-api.js : the REAL backend adapter (used when USE_MOCK is false).
   You do not need to edit this file. It turns every row of js/api-contract.js
   into a fetch() call, so your job is only to implement those endpoints.
   See BACKEND_GUIDE.md.
   ===================================================================== */
(function () {
  const ROUTES = {};
  window.API_CONTRACT.forEach(r => { ROUTES[r[0]] = { method: r[1], path: r[2] }; });

  function build(name, args) {
    const r = ROUTES[name];
    const rest = { ...args };
    const path = r.path.replace(/:([a-z_]+)/g, (m, key) => {
      const v = rest[key]; delete rest[key];
      if (v == null) throw new Error(`Missing "${key}" for ${name}`);
      return encodeURIComponent(v);
    }).replace(/^\/api/, window.OJT_CONFIG.API_BASE);
    if (r.method === 'GET') {
      const qs = new URLSearchParams();
      Object.keys(rest).forEach(k => { if (rest[k] != null) qs.append(k, rest[k]); });
      const s = qs.toString();
      return { url: path + (s ? '?' + s : ''), init: { method: 'GET' } };
    }
    return { url: path, init: { method: r.method, body: JSON.stringify(rest), headers: { 'Content-Type': 'application/json' } } };
  }

  window.ApiBackend = {
    async call(name, args, session) {
      if (!ROUTES[name]) throw new Error('Unknown API call: ' + name);
      const { url, init } = build(name, args);
      init.headers = Object.assign({ Accept: 'application/json' }, init.headers || {});
      if (session && session.token) init.headers.Authorization = 'Bearer ' + session.token;
      let res;
      try { res = await fetch(url, init); }
      catch (e) { throw new Error('Cannot reach the server. Check your connection and API_BASE in js/config.js.'); }
      let data = null;
      try { data = await res.json(); } catch (e) { /* empty body */ }
      if (!res.ok) {
        const err = new Error((data && data.error) || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
      }
      return data;
    }
  };
})();
