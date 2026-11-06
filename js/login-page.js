/* Shared by the four login pages (student, faculty, supervisor, super admin).
   The page's <body data-portal="…"> decides which portal is being signed into. */
(function () {
  const portal = document.body.dataset.portal;
  API.use(portal);
  if (API.session()) { location.replace('dashboard.html'); return; }
  const $ = id => document.getElementById(id);
  const form = $('loginForm'), userEl = $('username'), passEl = $('password'), errEl = $('loginError'), btn = $('signInBtn');
  const EYE = $('togglePw').innerHTML;
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  $('togglePw').addEventListener('click', e => {
    const show = passEl.type === 'password';
    passEl.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = show ? EYE_OFF : EYE;
  });

  const demo = $('demoFill');            // demo-only helper (removed together with the data-demo block)
  if (demo && !API.isMock) demo.remove();
  else if (demo) demo.addEventListener('click', () => { userEl.value = demo.dataset.user; passEl.value = demo.dataset.pw; errEl.textContent = ''; btn.focus(); });

  // ---- forgot password: the request goes to the people who can reset it (adviser / administrator)
  const WHO = { student: 'Your faculty adviser and the administrator will be notified.', faculty: 'The administrator will be notified.', supervisor: 'The administrator will be notified.',
    superadmin: 'Super Admin passwords cannot be reset here — contact the person who manages the server.' };
  $('forgotLink').addEventListener('click', e => {
    e.preventDefault();
    Modal.open({
      title: 'Forgot your password?',
      body: `<p class="small muted" style="margin-bottom:12px">Enter your username. ${esc(WHO[portal] || '')}</p>
        <div class="field"><label for="fpUser">Username</label><input id="fpUser" autocomplete="username" value="${esc(userEl.value.trim())}"></div><p class="error" id="fpErr"></p><p id="fpOk" class="small" style="color:var(--green)"></p>`,
      footer: '<button class="btn btn-outline" id="fpCancel" type="button">Close</button><button class="btn btn-navy" id="fpSend" type="button">Send request</button>'
    });
    document.getElementById('fpCancel').onclick = () => Modal.close();
    guarded(document.getElementById('fpSend'), async () => {
      const err = document.getElementById('fpErr'), ok = document.getElementById('fpOk'); err.textContent = ''; ok.textContent = '';
      const username = document.getElementById('fpUser').value.trim();
      if (!username) { err.textContent = 'Please enter your username.'; return; }
      try { const r = await API.auth.forgotPassword({ portal, username }); ok.textContent = r.message; document.getElementById('fpSend').hidden = true; }
      catch (x) { err.textContent = x.message; }
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.textContent = '';
    const username = userEl.value.trim(), password = passEl.value;
    if (!username || !password) { errEl.textContent = 'Please enter both your username and password.'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Signing in…';
    try {
      await API.auth.login(portal, username, password);
      location.href = 'dashboard.html';
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });
})();
