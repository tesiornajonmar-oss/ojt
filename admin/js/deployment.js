/* Deployment board + "who handles who" + company reassignment. Used by Faculty and Super Admin portals. */
(async () => {
  const me = await Shell.init('deployment');
  if (!me) return;
  const $ = id => document.getElementById(id), isSA = me.role === 'SUPER_ADMIN';
  const DEP = { DEPLOYED: ['🟢 Deployed', 'pill-approved'], SCHEDULED: ['Starts soon', 'pill-pending'], AWAITING_CONTRACT: ['⚠ Awaiting contract', 'pill-revision'], UNASSIGNED: ['⚠ No company', 'pill-revision'], ON_HOLD: ['On hold', 'pill-pending'], COMPLETED: ['✓ Completed', 'pill-approved'] };
  let rows = [], comps = [], advisers = {}, tab = 'board', depFilter = '';
  const advName = r => (r.adviserId && advisers[r.adviserId]) || (r.adviserId && !isSA ? me.name : '—');

  async function load() {
    [rows, comps] = await Promise.all([API.faculty.roster(), API.staff.companies()]);
    if (isSA) { try { (await API.admin.advisers()).forEach(a => { advisers[a.adviser_id || a.id] = a.name; }); } catch (e) { /* names optional */ } }
    const secs = [...new Set(rows.map(r => r.user.section).filter(Boolean))].sort();
    $('fSection').innerHTML = '<option value="">All sections</option>' + secs.map(s => `<option>${esc(s)}</option>`).join('');
    $('fCompany').innerHTML = '<option value="">All companies</option><option value="__none">No company</option>' + comps.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    render();
  }
  const filtered = () => { const s = $('fSection').value, c = $('fCompany').value, q = $('fSearch').value.trim().toLowerCase();
    return rows.filter(r => (!s || r.user.section === s) && (!depFilter || r.deployment === depFilter) && (!c || (c === '__none' ? !r.company : r.company && r.company.id === c)) &&
      (!q || [r.name, r.company && r.company.name, ...r.supervisors.map(x => x.name)].join(' ').toLowerCase().includes(q))); };

  function chips() {
    const n = k => rows.filter(r => r.deployment === k).length;
    $('chips').innerHTML = `<button class="chip ${depFilter ? 'chip-neutral' : 'chip-warn'}" data-f="">All ${rows.length}</button>` + Object.entries(DEP).map(([k, v]) => `<button class="chip ${depFilter === k ? 'chip-warn' : 'chip-neutral'}" data-f="${k}">${v[0].replace(/^[^\w⚠✓]+/, '')} ${n(k)}</button>`).join('');
    $('chips').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { depFilter = b.dataset.f; render(); });
  }
  function board(list) {
    $('panel').innerHTML = `<div class="table-wrap"><table class="logs-table"><thead><tr><th>Trainee</th><th>Section</th><th>Company</th><th>Company supervisor</th><th>Adviser</th><th>Schedule</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(r => { const [t, c] = DEP[r.deployment] || [r.deployment, '']; const moa = r.ojt && r.ojt.moa_status;
        return `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.user.section || '—')}</td><td>${r.company ? esc(r.company.name) : '<span class="muted">—</span>'}${r.company && moa !== 'APPROVED' && moa !== 'NOT_REQUIRED' ? ` <span class="chip chip-warn">contract ${esc(String(moa).toLowerCase())}</span>` : ''}</td>
        <td class="small">${r.supervisors.map(x => esc(x.name)).join(', ') || '<span class="muted">none</span>'}</td><td class="small">${esc(advName(r))}</td>
        <td class="small">${esc(r.schedule.days_label)}<br>${esc(r.schedule.start)} – ${esc(r.schedule.end)}</td><td><span class="${c}">${t}</span></td>
        <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-re="${esc(r.sid)}" type="button">${r.company ? 'Reassign' : 'Assign'}</button> <a class="btn btn-outline btn-sm" href="dtr.html?sid=${encodeURIComponent(r.sid)}">DTR</a></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted center">No trainees match.</td></tr>'}
      </tbody></table></div>`;
    $('panel').querySelectorAll('[data-re]').forEach(b => b.onclick = () => reassign(b.dataset.re));
  }
  function who(list) {      // adviser → company → supervisor → trainees
    const byAdv = {}; list.forEach(r => { (byAdv[r.adviserId || '—'] = byAdv[r.adviserId || '—'] || []).push(r); });
    $('panel').innerHTML = Object.entries(byAdv).map(([a, rs]) => { const byC = {}; rs.forEach(r => { (byC[r.company ? r.company.name : 'No company yet'] = byC[r.company ? r.company.name : 'No company yet'] || []).push(r); });
      return `<div class="who-adv"><h4>👩‍🏫 ${esc(advName(rs[0]))} <span class="muted small">— ${rs.length} trainee(s)</span></h4>${Object.entries(byC).map(([c, ts]) => `<div class="who-co"><b>🏢 ${esc(c)}</b> <span class="small muted">Supervisor: ${esc(ts[0].supervisors.map(x => x.name).join(', ') || 'none assigned')}</span>
        <div class="who-st">${ts.map(t => `<span class="chip chip-neutral">${esc(t.name)}${t.user.section ? ' · ' + esc(t.user.section) : ''}</span>`).join(' ')}</div></div>`).join('')}</div>`; }).join('') || '<p class="muted">No trainees.</p>';
  }
  function render() {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const list = filtered(); chips();
    $('note').textContent = `${list.length} of ${rows.length} trainees`;
    tab === 'board' ? board(list) : who(list);
  }
  function reassign(sid) {
    const r = rows.find(x => x.sid === sid), cur = r.company ? r.company.id : null;
    Modal.open({ title: `${r.company ? 'Reassign' : 'Assign'} — ${esc(r.name)}`, body: `${r.company ? `<p class="small muted">Currently at <b>${esc(r.company.name)}</b>. Approved hours stay with the trainee. Records waiting for the old supervisor go to the adviser.</p>` : ''}
      <div class="form-grid"><div class="field full"><label>New company *</label><select id="rcC"><option value="">Choose…</option>${comps.filter(c => c.id !== cur).map(c => `<option value="${esc(c.id)}">${esc(c.name)} — ${c.moa_effective === 'APPROVED' || c.moa_effective === 'NOT_REQUIRED' ? 'contract OK' : 'no valid contract'}${c.slots ? ` • ${c.placed}/${c.slots} slots` : ''}</option>`).join('')}</select></div>
      <div class="field"><label>Effective date</label><input id="rcD" type="date" value="${U.dateStr()}"></div><div class="field full"><label>Reason *</label><textarea id="rcR" rows="2" placeholder="e.g., Company has no more slots / trainee transferred closer to home."></textarea></div></div><p class="error" id="rcE"></p>`,
      footer: '<button class="btn btn-outline" id="rcX" type="button">Cancel</button><button class="btn btn-navy" id="rcOk" type="button">Confirm</button>' });
    $('rcX').onclick = () => Modal.close();
    guarded($('rcOk'), async () => { try {
      const res = await API.staff.reassignCompany({ sid, company_id: $('rcC').value, reason: $('rcR').value, effective_date: $('rcD').value });
      Modal.close(); toast(res.warnings.length ? 'Reassigned. ' + res.warnings.join(' ') : 'Reassigned.', res.warnings.length ? 'warn' : 'ok', 6000); load(); } catch (e) { $('rcE').textContent = e.message; } });
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
  ['fSection', 'fCompany'].forEach(i => $(i).onchange = render); $('fSearch').oninput = render;
  $('csvBtn').onclick = () => { const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = ['Student ID,Name,Section,Company,Supervisor,Adviser,Status,Schedule'].concat(filtered().map(r => [r.sid, r.name, r.user.section, r.company && r.company.name, r.supervisors.map(x => x.name).join('; '), advName(r), r.deployment, `${r.schedule.days_label} ${r.schedule.start}-${r.schedule.end}`].map(q).join(','))).join('\n');
    downloadBlob('deployment.csv', new Blob([csv], { type: 'text/csv' })); };
  try { await load(); } catch (e) { toast(e.message, 'err'); }
})();
