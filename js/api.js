/* =====================================================================
   OJT-ERAMS — api.js : the ONLY thing pages use to reach the server.
     await API.student.clockIn({...})   await API.faculty.queue()   …
   It builds one async function per row of js/api-contract.js and forwards the
   call to window.ApiBackend, which is either the demo backend (js/mock) or the
   real one (js/http-api.js) — chosen by OJT_CONFIG.USE_MOCK.
   ===================================================================== */
const API = (() => {
  let portal = null;
  const A = {
    isMock: !!window.OJT_CONFIG.USE_MOCK,
    use(p) { portal = p; return A; },
    get portal() { return portal; },

    /* ---- session (one per portal, so you can test all portals in one browser) ---- */
    sessionKey() { return 'ojt_session_' + portal; },
    session() { try { return JSON.parse(localStorage.getItem(A.sessionKey())); } catch (e) { return null; } },
    setSession(s) { localStorage.setItem(A.sessionKey(), JSON.stringify(s)); },
    clearSession() { localStorage.removeItem(A.sessionKey()); },
    signOut() { A.clearSession(); location.replace('login.html'); }
  };

  async function invoke(name, args) {
    if (!window.ApiBackend) throw new Error('No backend is loaded.');
    try {
      return await window.ApiBackend.call(name, args || {}, A.session(), portal);
    } catch (e) {
      if (e && e.status === 401 && name !== 'auth.login') { A.signOut(); }
      throw e;
    }
  }

  window.API_CONTRACT.forEach(row => {
    const [name] = row;
    const [group, fn] = name.split('.');
    (A[group] = A[group] || {})[fn] = args => invoke(name, args);
  });

  // Login is special: it stores the session for the portal that is signing in.
  A.auth.login = async (portalName, username, password) => {
    A.use(portalName);
    const res = await invoke('auth.login', { portal: portalName, username, password });
    A.setSession({ token: res.token, user: res.user });
    return res;
  };
  A.auth.logout = async () => { try { await invoke('auth.logout'); } catch (e) { /* already signed out */ } A.signOut(); };
  return A;
})();
