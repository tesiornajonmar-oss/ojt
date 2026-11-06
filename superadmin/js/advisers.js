(async () => {
  const me = await Shell.init('advisers');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const TITLES = ['Prof.', 'Dr.', 'Engr.', 'Mr.', 'Ms.', 'Mrs.'];
  let advisers = [];

  async function render() {
    try { advisers = await API.admin.advisers(); } catch (e) { return toast(e.message, 'err'); }
    $('countNote').textContent = `${advisers.length} faculty adviser${advisers.length === 1 ? '' : 's'}`;
    $('tbody').innerHTML = advisers.map(a => `<tr class="log-row" data-id="${esc(a.id)}">
        <td><b>${esc(a.name)}</b><div class="small muted">@${esc(a.user.username)} • ${esc(a.id)}</div></td>
        <td class="small">${esc(a.user.department || '—')}</td><td>${a.count}</td>
        <td>${a.pending ? `<span class="chip chip-warn">${a.slips} slips • ${a.reports} reports</span>${a.oldestDays >= 3 ? ` <span class="late small">oldest ${a.oldestDays}d</span>` : ''}` : '<span class="muted small">All clear</span>'}</td>
        <td class="prog-cell"><div class="tracker-bar mini"><div class="tracker-fill-approved" style="width:${a.avg}%"></div></div><div class="small muted">${a.avg}% avg</div></td>
        <td><button class="btn btn-outline btn-sm" type="button">Manage</button></td></tr>`).join('');
    $('emptyNote').hidden = advisers.length > 0;
    $('tbody').querySelectorAll('tr').forEach(tr => tr.onclick = () => openManage(tr.dataset.id));
  }

  function openManage(id) {
    const a = advisers.find(x => x.id === id); if (!a) return;
    const u = a.user, others = advisers.filter(x => x.id !== id);
    Modal.open({
      title: `Manage — ${esc(a.name)}`,
      body: `<div class="form-grid">
          <div class="field"><label>Title</label><select id="mTitle">${TITLES.map(t => `<option ${t === u.title ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Adviser ID</label><input value="${esc(a.id)}" disabled></div>
          <div class="field"><label>First name *</label><input id="mFirst" value="${esc(u.first_name)}"></div>
          <div class="field"><label>Last name *</label><input id="mLast" value="${esc(u.last_name)}"></div>
          <div class="field full"><label>Department</label><input id="mDept" value="${esc(u.department || '')}"></div>
          <div class="field"><label>Email *</label><input id="mEmail" type="email" value="${esc(u.email || '')}"></div>
          <div class="field"><label>Username</label><input value="${esc(u.username)}" disabled></div></div>
        <p style="margin-top:14px"><b>Assigned trainees (${a.count})</b></p>
        <div class="chips-wrap">${a.students.map(s => `<span class="chip chip-neutral">${esc(s.name)}</span>`).join('') || '<span class="muted small">None assigned.</span>'}</div>
        ${a.count && others.length ? `<div class="field"><label>Transfer all trainees to</label><div class="inline-row"><select id="mTo">${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select>
          <button class="btn btn-outline btn-sm" id="mTransfer" type="button">Transfer</button></div></div>` : ''}
        <p class="error" id="mErr"></p>`,
      footer: `<button class="btn btn-outline danger" id="mDelete" type="button" style="margin-right:auto" ${a.count ? 'disabled title="Transfer this adviser\'s trainees first"' : ''}>Delete</button>
               <button class="btn btn-outline" id="mReset" type="button">Reset password</button><button class="btn btn-outline" id="mClose" type="button">Close</button><button class="btn btn-navy" id="mSave" type="button">Save</button>`
    });
    const g = k => $(k).value.trim();
    $('mClose').onclick = () => Modal.close();
    guarded($('mSave'), async () => {
      if (!g('mFirst') || !g('mLast')) { $('mErr').textContent = 'First and last name are required.'; return; }
      if (!emailRe.test(g('mEmail'))) { $('mErr').textContent = 'Please enter a valid email address.'; return; }
      try { await API.admin.updateAdviser({ id, title: g('mTitle'), first_name: g('mFirst'), last_name: g('mLast'), department: g('mDept'), email: g('mEmail') }); Modal.close(); toast('Adviser updated.'); render(); }
      catch (e) { $('mErr').textContent = e.message; }
    });
    guarded($('mReset'), async () => { if (!confirm(`Reset ${a.name}'s password?`)) return; const r = await API.admin.resetAdviserPassword({ id }); toast('Password reset to: ' + r.temporary_password, 'ok', 6000); });
    if ($('mTransfer')) guarded($('mTransfer'), async () => {
      const to = $('mTo').value, toName = (advisers.find(x => x.id === to) || {}).name;
      if (!confirm(`Move all ${a.count} trainee(s) from ${a.name} to ${toName}?`)) return;
      try { const r = await API.admin.transferCaseload({ id, to }); Modal.close(); toast(`Transferred ${r.moved} trainee(s) to ${toName}.`); render(); } catch (e) { $('mErr').textContent = e.message; }
    });
    guarded($('mDelete'), async () => {
      if (!confirm(`Delete ${a.name}? This cannot be undone.`)) return;
      try { await API.admin.deleteAdviser({ id }); Modal.close(); toast('Adviser deleted.', 'warn'); render(); } catch (e) { $('mErr').textContent = e.message; }
    });
  }

  function openAdd() {
    Modal.open({
      title: 'Add Faculty Adviser',
      body: `<div class="form-grid">
        <div class="field"><label>Title</label><select id="nTitle">${TITLES.map(t => `<option>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Department</label><input id="nDept" placeholder="College of Computer Studies"></div>
        <div class="field"><label>First name *</label><input id="nFirst"></div><div class="field"><label>Last name *</label><input id="nLast"></div>
        <div class="field full"><label>Email *</label><input id="nEmail" type="email"></div>
        <div class="field"><label>Username *</label><input id="nUser"></div><div class="field"><label>Temporary password *</label><input id="nPass" value="adviser123"></div>
      </div><p class="error" id="nErr"></p>`,
      footer: '<button class="btn btn-outline" id="nCancel" type="button">Cancel</button><button class="btn btn-navy" id="nCreate" type="button">Create adviser</button>'
    });
    const g = k => $(k).value.trim();
    const suggest = () => { if (!$('nUser').value) $('nUser').value = (g('nFirst').charAt(0) + g('nLast')).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    $('nFirst').addEventListener('blur', suggest); $('nLast').addEventListener('blur', suggest);
    $('nCancel').onclick = () => Modal.close();
    guarded($('nCreate'), async () => {
      const f = { title: g('nTitle'), first_name: g('nFirst'), last_name: g('nLast'), department: g('nDept'), email: g('nEmail'), username: g('nUser'), password: g('nPass') };
      if (!f.first_name || !f.last_name || !f.email || !f.username || !f.password) { $('nErr').textContent = 'Please fill in all fields marked with *.'; return; }
      if (!emailRe.test(f.email)) { $('nErr').textContent = 'Please enter a valid email address.'; return; }
      if (f.password.length < 6) { $('nErr').textContent = 'Password must be at least 6 characters.'; return; }
      try { const r = await API.admin.createAdviser(f); Modal.close(); toast(`${r.id} created — username: ${f.username} • password: ${f.password}`, 'ok', 8000); render(); }
      catch (e) { $('nErr').textContent = e.message; }
    });
  }

  $('addBtn').onclick = openAdd;
  render();
})();
