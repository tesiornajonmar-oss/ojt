(async () => {
  const me = await Shell.init('users');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const ROLE = { EDUC_INTERN: 'Student', ADVISER: 'Faculty adviser', SUPERVISOR: 'Company supervisor', SUPER_ADMIN: 'Administrator' };
  let rows = [];
  async function load() { rows = await API.admin.users(); render(); }
  const list = () => { const r = $('fRole').value, a = $('fActive').value, q = $('fSearch').value.trim().toLowerCase();
    return rows.filter(u => (!r || u.role === r) && (!a || (a === '1') === u.active) && (!q || [u.name, u.username, u.org, u.id].join(' ').toLowerCase().includes(q))); };
  function render() {
    const l = list(), c = k => rows.filter(u => u.role === k).length;
    $('note').textContent = `${rows.length} accounts — ${c('EDUC_INTERN')} students, ${c('ADVISER')} faculty, ${c('SUPERVISOR')} supervisors, ${c('SUPER_ADMIN')} administrators`;
    $('panel').innerHTML = `<div class="table-wrap"><table class="logs-table"><thead><tr><th>Name</th><th>Role</th><th>ID</th><th>Username</th><th>Section / Company / Dept</th><th>Status</th><th></th></tr></thead><tbody>
      ${l.map(u => `<tr><td><b>${esc(u.name)}</b><div class="small muted">${esc(u.email)}</div></td><td>${ROLE[u.role]}</td><td class="small">${esc(u.id || '')}</td><td>${esc(u.username)}</td><td class="small">${esc(u.org)}${u.role === 'EDUC_INTERN' ? (u.face ? ' • Face ID ✓' : ' • no Face ID') : ''}</td>
      <td>${u.active ? '<span class="pill-approved">Active</span>' : '<span class="pill-revision">Disabled</span>'}${u.must_change ? ' <span class="chip chip-warn" title="Has not set their own password yet">temp password</span>' : ''}</td>
      <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-rs="${esc(u.username)}" type="button">Reset password</button> <button class="btn btn-outline btn-sm ${u.active ? 'danger' : ''}" data-tg="${esc(u.username)}" type="button">${u.active ? 'Disable' : 'Enable'}</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted center">No accounts match.</td></tr>'}</tbody></table></div>`;
    $('panel').querySelectorAll('[data-rs]').forEach(b => guarded(b, async () => {
      if (!confirm('Reset this password? The user will have to choose a new one at next sign-in.')) return;
      const r = await API.admin.resetUserPassword({ username: b.dataset.rs });
      Modal.open({ title: 'Temporary password', body: `<p>Give this password to <b>${esc(b.dataset.rs)}</b> privately. It is shown only once.</p><div class="kv"><span>Temporary password</span><b style="font-size:1.2em">${esc(r.temporary_password)}</b></div>`, footer: '<button class="btn btn-navy" id="tpOk" type="button">Done</button>' });
      $('tpOk').onclick = () => Modal.close(); load(); }));
    $('panel').querySelectorAll('[data-tg]').forEach(b => guarded(b, async () => { const u = rows.find(x => x.username === b.dataset.tg);
      if (u.active && !confirm(`Disable ${u.name}? They will no longer be able to sign in.`)) return;
      await API.admin.setUserActive({ username: u.username, active: !u.active }); toast(u.active ? 'Account disabled.' : 'Account enabled.', u.active ? 'warn' : 'ok'); load(); }));
  }
  function addAdmin() {
    Modal.open({ title: 'Add administrator', body: `<div class="form-grid"><div class="field"><label>First name *</label><input id="aF"></div><div class="field"><label>Last name *</label><input id="aL"></div>
      <div class="field"><label>Email *</label><input id="aE" type="email"></div><div class="field"><label>Department</label><input id="aD" placeholder="OJT Coordination Office"></div>
      <div class="field"><label>Username *</label><input id="aU"></div><div class="field"><label>Temporary password *</label><input id="aP" value="" placeholder="at least 6 characters"></div></div><p class="small muted">They must change this password at first sign-in.</p><p class="error" id="aErr"></p>`,
      footer: '<button class="btn btn-outline" id="aX" type="button">Cancel</button><button class="btn btn-navy" id="aOk" type="button">Create account</button>' });
    $('aX').onclick = () => Modal.close();
    guarded($('aOk'), async () => { try { await API.admin.createAdmin({ first_name: $('aF').value, last_name: $('aL').value, email: $('aE').value, department: $('aD').value, username: $('aU').value, password: $('aP').value });
      Modal.close(); toast('Administrator added.'); load(); } catch (e) { $('aErr').textContent = e.message; } });
  }
  $('addBtn').onclick = addAdmin;
  $('impBtn').onclick = async () => { let adv = []; try { adv = (await API.admin.advisers()).map(a => ({ id: a.id, name: a.name })); } catch (e) { /* optional */ } ReviewExtra.importStudents(load, adv); };
  $('csvBtn').onclick = () => { const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    downloadBlob('users.csv', new Blob(['Name,Role,ID,Username,Email,Section/Company,Status\n' + list().map(u => [u.name, ROLE[u.role], u.id, u.username, u.email, u.org, u.active ? 'Active' : 'Disabled'].map(q).join(',')).join('\n')], { type: 'text/csv' })); };
  ['fRole', 'fActive'].forEach(i => $(i).onchange = render); $('fSearch').oninput = render;
  try { await load(); } catch (e) { toast(e.message, 'err'); }
})();
