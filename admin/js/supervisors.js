/* Company supervisor accounts. Used by the Faculty portal AND the Super Admin portal (same page logic). */
(async () => {
  const me = await Shell.init('supervisors');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const TITLES = ['Mr.', 'Ms.', 'Mrs.', 'Engr.', 'Dr.', 'Atty.'];
  let list = [], companies = [];

  async function load() {
    [list, companies] = await Promise.all([API.staff.supervisors(), API.staff.companies()]);
    const cur = $('fCompany').value;
    $('fCompany').innerHTML = '<option value="">All companies</option>' + companies.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    render();
  }

  function render() {
    const q = $('search').value.trim().toLowerCase(), co = $('fCompany').value;
    const shown = list.filter(s => (!q || `${s.name} ${s.company_name} ${s.username}`.toLowerCase().includes(q)) && (!co || s.company_id === co));
    $('tbody').innerHTML = shown.map(s => `<tr class="log-row" data-id="${esc(s.supervisor_id)}">
      <td><b>${esc(s.name)}</b><div class="small muted">${esc(s.position || '')} • @${esc(s.username)} • ${esc(s.supervisor_id)}</div></td>
      <td class="small">${esc(s.company_name)}</td><td>${s.trainees}</td>
      <td>${s.pending ? `<span class="chip chip-warn">${s.pending}</span>${s.oldest_days >= 3 ? ` <span class="late small">oldest ${s.oldest_days}d</span>` : ''}` : '<span class="muted small">All clear</span>'}</td>
      <td><button class="btn btn-outline btn-sm" type="button">Manage</button></td></tr>`).join('');
    $('emptyNote').hidden = shown.length > 0;
    $('tbody').querySelectorAll('tr').forEach(tr => tr.onclick = () => openForm(tr.dataset.id));
  }

  function openForm(id) {
    const s = id ? list.find(x => x.supervisor_id === id) : null;
    Modal.open({
      title: s ? `Manage — ${esc(s.name)}` : 'Add Company Supervisor',
      body: `<div class="form-grid">
        <div class="field"><label>Title</label><select id="sTitle">${TITLES.map(t => `<option ${s && s.title === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Position</label><input id="sPos" value="${esc(s ? s.position || '' : '')}" placeholder="e.g., IT Department Head"></div>
        <div class="field"><label>First name *</label><input id="sFirst" value="${esc(s ? s.first_name : '')}"></div>
        <div class="field"><label>Last name *</label><input id="sLast" value="${esc(s ? s.last_name : '')}"></div>
        <div class="field"><label>Email *</label><input id="sEmail" type="email" value="${esc(s ? s.email : '')}"></div>
        <div class="field"><label>Phone</label><input id="sPhone" value="${esc(s ? s.phone || '' : '')}"></div>
        <div class="field full"><label>Company *</label><select id="sCompany">${companies.map(c => `<option value="${esc(c.id)}" ${s && s.company_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        ${s ? `<div class="field"><label>Username</label><input value="${esc(s.username)}" disabled></div>` : `
        <div class="field"><label>Username *</label><input id="sUser"></div><div class="field"><label>Temporary password *</label><input id="sPass" value="supervisor123"></div>`}
      </div><p class="error" id="sErr"></p>`,
      footer: `${s ? '<button class="btn btn-outline danger" id="sDel" type="button" style="margin-right:auto">Delete</button><button class="btn btn-outline" id="sReset" type="button">Reset password</button>' : ''}
               <button class="btn btn-outline" id="sCancel" type="button">Cancel</button><button class="btn btn-navy" id="sSave" type="button">${s ? 'Save' : 'Create account'}</button>`
    });
    const g = k => $(k).value.trim();
    $('sCancel').onclick = () => Modal.close();
    if (!s) {
      const suggest = () => { if (!$('sUser').value) $('sUser').value = (g('sFirst').charAt(0) + g('sLast')).toLowerCase().replace(/[^a-z0-9]/g, ''); };
      $('sFirst').addEventListener('blur', suggest); $('sLast').addEventListener('blur', suggest);
    }
    guarded($('sSave'), async () => {
      const f = { title: g('sTitle'), position: g('sPos'), first_name: g('sFirst'), last_name: g('sLast'), email: g('sEmail'), phone: g('sPhone'), company_id: g('sCompany') };
      if (!f.first_name || !f.last_name || !f.email) { $('sErr').textContent = 'Please fill in all fields marked with *.'; return; }
      if (!emailRe.test(f.email)) { $('sErr').textContent = 'Please enter a valid email address.'; return; }
      try {
        if (s) { await API.staff.updateSupervisor({ supervisor_id: id, ...f }); toast('Supervisor updated.'); }
        else {
          Object.assign(f, { username: g('sUser'), password: g('sPass') });
          if (!f.username || f.password.length < 6) { $('sErr').textContent = 'A username and a password of at least 6 characters are required.'; return; }
          await API.staff.createSupervisor(f); toast(`Account created — username: ${f.username} • password: ${f.password}`, 'ok', 8000);
        }
        Modal.close(); load();
      } catch (e) { $('sErr').textContent = e.message; }
    });
    if (s) {
      guarded($('sReset'), async () => { if (!confirm(`Reset ${s.name}'s password?`)) return; const r = await API.staff.resetSupervisorPassword({ supervisor_id: id }); toast('Password reset to: ' + r.temporary_password, 'ok', 6000); });
      guarded($('sDel'), async () => {
        if (!confirm(`Delete ${s.name}? Items waiting for them will go to the faculty advisers.`)) return;
        await API.staff.deleteSupervisor({ supervisor_id: id }); Modal.close(); toast('Supervisor deleted.', 'warn'); load();
      });
    }
  }

  $('addBtn').onclick = () => openForm(null);
  $('search').addEventListener('input', render); $('fCompany').addEventListener('change', render);
  try { await load(); } catch (e) { toast(e.message, 'err'); }
})();
