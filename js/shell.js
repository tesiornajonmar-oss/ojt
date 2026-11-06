/* =====================================================================
   OJT-ERAMS — shell.js : sidebar, top bar, notifications, theme, sign-out
   for ALL four portals.  Every page script starts with:
       const me = await Shell.init('approvals');     // 'approvals' = the active menu item
   and the page's <body data-portal="student|faculty|supervisor|superadmin">.
   ===================================================================== */
const Shell = (() => {
  const NAV = {
    student: [
      { id: 'dashboard', href: 'dashboard.html', ico: '🏠', label: 'Dashboard' },
      { id: 'attendance', href: 'attendance.html', ico: '🕒', label: 'Attendance' },
      { id: 'dtr', href: 'dtr.html', ico: '📋', label: 'My DTR' },
      { id: 'accomplishments', href: 'accomplishments.html', ico: '🏆', label: 'Accomplishments' },
      { id: 'narrative', href: 'narrative.html', ico: '📝', label: 'Narrative Reports' },
      { id: 'ojt-details', href: 'ojt-details.html', ico: '🏢', label: 'OJT Details' }
    ],
    faculty: [
      { id: 'dashboard', href: 'dashboard.html', ico: '📊', label: 'Dashboard' },
      { id: 'approvals', href: 'approvals.html', ico: '✅', label: 'Approvals', badge: 'approvals' },
      { id: 'students', href: 'students.html', ico: '🎓', label: 'Trainees' },
      { id: 'deployment', href: 'deployment.html', ico: '📍', label: 'Deployment' },
      { id: 'dtr', href: 'dtr.html', ico: '📋', label: 'DTR' },
      { id: 'companies', href: 'companies.html', ico: '🏢', label: 'Companies & GPS' },
      { id: 'supervisors', href: 'supervisors.html', ico: '🧑‍💼', label: 'Company Supervisors' },
      { id: 'messages', href: 'messages.html', ico: '💬', label: 'Messages', badge: 'messages' }
    ],
    supervisor: [
      { id: 'dashboard', href: 'dashboard.html', ico: '📊', label: 'Dashboard' },
      { id: 'approvals', href: 'approvals.html', ico: '✅', label: 'Attendance Review', badge: 'approvals' },
      { id: 'trainees', href: 'trainees.html', ico: '🎓', label: 'My Trainees' },
      { id: 'trace', href: 'trace.html', ico: '🧭', label: 'Trace Trainees' },
      { id: 'dtr', href: 'dtr.html', ico: '📋', label: 'DTR' },
      { id: 'evaluations', href: 'evaluations.html', ico: '⭐', label: 'Evaluations' },
      { id: 'messages', href: 'messages.html', ico: '💬', label: 'Messages', badge: 'messages' }
    ],
    superadmin: [
      { id: 'dashboard', href: 'dashboard.html', ico: '📊', label: 'Overview' },
      { id: 'advisers', href: 'advisers.html', ico: '👩‍🏫', label: 'Faculty Advisers' },
      { id: 'users', href: 'users.html', ico: '👥', label: 'Users & Accounts' },
      { id: 'students', href: 'students.html', ico: '🎓', label: 'All Trainees' },
      { id: 'deployment', href: 'deployment.html', ico: '📍', label: 'Deployment' },
      { id: 'dtr', href: 'dtr.html', ico: '📋', label: 'DTR' },
      { id: 'partners', href: 'partners.html', ico: '🤝', label: 'Partners & Contracts' },
      { id: 'announcements', href: 'announcements.html', ico: '📢', label: 'Announcements' },
      { id: 'system', href: 'system.html', ico: '⚙️', label: 'System' }
    ]
  };
  const BRAND = {
    student: { tag: '', cls: '' }, faculty: { tag: 'Faculty', cls: '' },
    supervisor: { tag: 'Company Supervisor', cls: 't-sup' }, superadmin: { tag: 'Super Admin', cls: 't-super' }
  };
  const ROLE_LABEL = { EDUC_INTERN: 'Student', ADVISER: 'Faculty Adviser', SUPERVISOR: 'Company Supervisor', SUPER_ADMIN: 'Super Admin' };

  let timer = null;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };

  function accountLinks(portal, me) {
    if (portal === 'superadmin') return [
      { href: '../admin/dashboard.html', label: '👩‍🏫 Open Faculty portal (all trainees)' },
      { href: '../login.html', label: '🎓 Student portal', blank: true },
      { href: '../supervisor/login.html', label: '🧑‍💼 Company Supervisor portal', blank: true },
      { href: 'system.html', label: '⚙️ System & rules' }
    ];
    if (portal === 'faculty' && me.role === 'SUPER_ADMIN') return [{ href: '../superadmin/dashboard.html', label: '🛡️ Back to Super Admin' }];
    if (portal === 'student') return [
      { href: 'ojt-details.html#face', label: '🙂 Face ID setup' },
      { href: 'ojt-details.html#password', label: '🔒 Change password' }
    ];
    return [];
  }

  function openPassword(forced) {
    const mdl = Modal.open({
      locked: !!forced,
      title: forced ? '🔒 Set your own password' : '🔒 Change password',
      body: `<div class="form-grid"><div class="field full">${forced ? '<p class="small" style="margin-bottom:8px">You are using a temporary password. Please choose your own before continuing.</p>' : ''}<label>${forced ? 'Temporary password' : 'Current password'}</label><input id="cpOld" type="password" autocomplete="current-password"></div>
        <div class="field"><label>New password</label><input id="cpNew" type="password" autocomplete="new-password"></div>
        <div class="field"><label>Confirm new password</label><input id="cpNew2" type="password" autocomplete="new-password"></div></div>
        <p class="small muted" style="margin-top:8px">At least 6 characters.</p><p class="error" id="cpErr"></p>`,
      footer: (forced ? '' : '<button class="btn btn-outline" id="cpCancel" type="button">Cancel</button>') + '<button class="btn btn-navy" id="cpSave" type="button">Change password</button>'
    });
    if (forced) mdl.querySelector('.modal-x').remove();
    const g = id => document.getElementById(id).value;
    if (document.getElementById('cpCancel')) document.getElementById('cpCancel').onclick = () => Modal.close();
    guarded(document.getElementById('cpSave'), async () => {
      const err = document.getElementById('cpErr'); err.textContent = '';
      if (!g('cpOld') || !g('cpNew')) { err.textContent = 'Please fill in all the fields.'; return; }
      if (g('cpNew') !== g('cpNew2')) { err.textContent = 'The new passwords do not match.'; return; }
      try { await API.auth.changePassword({ old_password: g('cpOld'), new_password: g('cpNew') }); Modal.close(); toast('Password changed.'); }
      catch (e) { err.textContent = e.message; }
    });
  }

  function openProfile(me, portal) {
    const rows = [['Name', me.name], ['Username', me.username], ['Role', ROLE_LABEL[me.role] || me.role]];
    if (me.student_id) rows.push(['Student ID', me.student_id], ['Program', me.program || '—'], ['Section', me.section || '—']);
    if (me.company_name) rows.push(['Company', me.company_name], ['Position', me.position || '—']);
    if (me.department) rows.push(['Department', me.department]);
    Modal.open({
      title: '👤 My profile',
      body: rows.map(r => `<div class="kv"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('') +
        `<div class="form-grid" style="margin-top:14px"><div class="field"><label>Email</label><input id="pfEmail" type="email" value="${esc(me.email || '')}"></div>
         <div class="field"><label>Phone</label><input id="pfPhone" value="${esc(me.phone || '')}" placeholder="09XX-XXX-XXXX"></div></div>
         <p class="small muted" style="margin-top:8px">To change your name, ID or section, ask your adviser or the administrator.</p><p class="error" id="pfErr"></p>`,
      footer: '<button class="btn btn-outline" id="pfCancel" type="button">Close</button><button class="btn btn-navy" id="pfSave" type="button">Save contact details</button>'
    });
    document.getElementById('pfCancel').onclick = () => Modal.close();
    guarded(document.getElementById('pfSave'), async () => {
      try { await API.auth.updateProfile({ email: document.getElementById('pfEmail').value, phone: document.getElementById('pfPhone').value }); me.email = document.getElementById('pfEmail').value; me.phone = document.getElementById('pfPhone').value; Modal.close(); toast('Contact details saved.'); }
      catch (e) { document.getElementById('pfErr').textContent = e.message; }
    });
  }

  function build(portal, active, me) {
    const base = portal === 'student' ? '' : '../';
    const nav = NAV[portal], brand = BRAND[portal];
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML =
      `<div class="side-brand">
         <img src="${base}images/cmu-logo.png" alt="" onerror="this.style.display='none'">
         <span class="brand-text sa-brand">OJT-ERAMS${brand.tag ? `<span class="brand-tag ${brand.cls}">${brand.tag}</span>` : ''}</span>
         <button class="drawer-close" id="drawerClose" aria-label="Close menu">✕</button>
       </div>` +
      nav.map(n => `<a class="nav-item ${n.id === active ? 'active' : ''}" href="${n.href}">
          <span class="ico">${n.ico}</span><span class="label">${n.label}</span>${n.badge ? `<span class="nav-badge" data-badge="${n.badge}" hidden>0</span>` : ''}</a>`).join('');

    let overlay = document.getElementById('overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'overlay'; overlay.className = 'overlay'; document.body.appendChild(overlay); }
    const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
    function setNav(show) {
      if (isMobile()) { sidebar.classList.toggle('open', show); overlay.classList.toggle('show', show); }
      else { sidebar.classList.toggle('collapsed', !show); store.set('ojt_nav_collapsed', (!show).toString()); }
    }
    if (isMobile()) setNav(false); else setNav(store.get('ojt_nav_collapsed') !== 'true');

    const initial = esc(String(me.first_name || me.name || '?').charAt(0).toUpperCase());
    const sub = portal === 'student' ? `${me.student_id} • ${me.program || ''}` : portal === 'supervisor' ? `${me.position || ''} • ${me.company_name || ''}` : (me.department || '');
    const roleLabel = portal === 'faculty' && me.role === 'SUPER_ADMIN' ? 'Super Admin (Faculty view)' : ROLE_LABEL[me.role] || me.role;
    const links = accountLinks(portal, me);
    const isDark = document.documentElement.classList.contains('dark-theme');

    document.getElementById('topbar').innerHTML = `
      <button class="hamburger" id="hamburger" aria-label="Toggle menu">☰</button>
      <div class="topbar-right">
        <div class="bell-wrap">
          <button class="bell" id="bellBtn" aria-label="Notifications">🔔<span class="bell-dot" id="bellDot" hidden>0</span></button>
          <div class="bell-panel" id="bellPanel"></div>
        </div>
        <button class="user-trigger" id="userTrigger" aria-label="Account menu">
          <span class="avatar">${initial}</span><span class="user-name">${esc(me.first_name || me.name)}</span><span class="caret">⌄</span>
        </button>
        <div class="user-menu account-panel" id="userMenu">
          <div class="account-head"><span class="avatar">${initial}</span>
            <div><div class="account-name">${esc(me.name)}</div><div class="account-sub">${esc(sub)}</div><span class="role-chip">${esc(roleLabel)}</span></div></div>
          ${links.length ? `<div class="account-links">${links.map(l => `<a class="account-link" href="${l.href}"${l.blank ? ' target="_blank" rel="noopener"' : ''}>${l.label}</a>`).join('')}</div>` : ''}
          <div class="account-links"><button type="button" class="account-link" id="profileBtn">👤 My profile</button>${portal === 'student' ? '' : '<button type="button" class="account-link" id="pwMenuBtn">🔒 Change password</button>'}</div>
          <div class="account-divider"></div>
          <div class="theme-row"><span>🌓 Appearance / Theme</span>
            <label class="switch"><input type="checkbox" id="themeToggle" ${isDark ? 'checked' : ''}><span class="slider"></span></label></div>
          <div class="account-divider"></div>
          <div class="logout-row"><button class="logout-btn" id="logoutBtn">⏻ Log Out</button></div>
        </div>
      </div>`;

    const $ = id => document.getElementById(id);
    $('hamburger').onclick = () => { const shown = isMobile() ? sidebar.classList.contains('open') : !sidebar.classList.contains('collapsed'); setNav(!shown); };
    $('drawerClose').onclick = () => setNav(false);
    overlay.onclick = () => setNav(false);
    const userMenu = $('userMenu'), userTrigger = $('userTrigger'), bellPanel = $('bellPanel'), bellBtn = $('bellBtn');
    userTrigger.onclick = e => { e.stopPropagation(); bellPanel.classList.remove('open'); userMenu.classList.toggle('open'); };
    bellBtn.onclick = e => { e.stopPropagation(); userMenu.classList.remove('open'); bellPanel.classList.toggle('open'); };
    document.addEventListener('click', e => {
      if (!userMenu.contains(e.target) && !userTrigger.contains(e.target)) userMenu.classList.remove('open');
      if (!bellPanel.contains(e.target) && !bellBtn.contains(e.target)) bellPanel.classList.remove('open');
    });
    $('logoutBtn').onclick = () => API.auth.logout();
    $('profileBtn').onclick = () => { userMenu.classList.remove('open'); openProfile(me, portal); };
    if ($('pwMenuBtn')) $('pwMenuBtn').onclick = () => { userMenu.classList.remove('open'); openPassword(); };
    $('themeToggle').onchange = e => {
      const t = e.target.checked ? 'dark' : 'light';
      applyTheme(t); store.set('ojt_theme', t);
      API.auth.setTheme({ theme: t }).catch(() => { /* cosmetic */ });
    };
    window.addEventListener('resize', () => { if (isMobile()) sidebar.classList.remove('collapsed'); else { sidebar.classList.remove('open'); overlay.classList.remove('show'); } });

  }

  function paintBadges(badges) {
    document.querySelectorAll('[data-badge]').forEach(el => {
      const n = (badges && badges[el.dataset.badge]) || 0;
      el.textContent = n > 99 ? '99+' : n; el.hidden = n === 0;
    });
  }

  function paintBell(data) {
    const dot = document.getElementById('bellDot'), panel = document.getElementById('bellPanel');
    if (!dot || !panel) return;
    dot.textContent = data.unread > 9 ? '9+' : data.unread; dot.hidden = !data.unread;
    panel.innerHTML = `<div class="bell-head"><span>Notifications</span><button id="markAll" type="button">Mark all read</button></div>` +
      (data.items.length ? data.items.map(n => `<a class="bell-item ${n.read ? '' : 'unread'}" href="${esc(n.link || '#')}" data-id="${esc(n.id)}">${esc(n.text)}<small>${esc(U.ago(n.at))}</small></a>`).join('')
        : '<div class="bell-empty">You\'re all caught up 🎉</div>');
    const all = document.getElementById('markAll');
    if (all) all.onclick = async () => { await API.notifications.markRead({}); refresh(); };
    panel.querySelectorAll('.bell-item').forEach(a => a.addEventListener('click', () => { API.notifications.markRead({ id: a.dataset.id }); }));
  }

  async function refresh() {
    try {
      const [me, n] = await Promise.all([API.auth.me(), API.notifications.list()]);
      paintBadges(me.badges); paintBell(n);
      return me;
    } catch (e) { return null; }
  }

  async function init(active) {
    const portal = document.body.dataset.portal;
    if (!NAV[portal]) throw new Error('Missing data-portal on <body>.');
    API.use(portal);
    // A Super Admin may open the Faculty portal without signing in again.
    if (!API.session() && portal === 'faculty') {
      const sa = store.get('ojt_session_superadmin');
      if (sa) store.set('ojt_session_faculty', sa);
    }
    if (!API.session()) { location.replace('login.html'); return null; }
    let me;
    try { me = await API.auth.me(); }
    catch (e) { if (e.status === 401) return null; throw e; }
    if (me.theme) { applyTheme(me.theme); store.set('ojt_theme', me.theme); }
    build(portal, active, me);
    if (me.must_change) openPassword(true);
    paintBadges(me.badges);
    API.notifications.list().then(paintBell).catch(() => { /* ignore */ });
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    return me;
  }

  return { init, refresh };
})();
