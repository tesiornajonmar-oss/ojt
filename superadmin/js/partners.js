(async () => {
  const me = await Shell.init('partners');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let list = [];
  if (new URLSearchParams(location.search).get('filter') === 'issues') $('fMoa').value = 'issues';

  const isIssue = c => (c.moa_effective !== 'APPROVED' && c.moa_effective !== 'NOT_REQUIRED') || (c.moa_effective === 'APPROVED' && c.daysLeft !== null && c.daysLeft <= 60);
  function note(c) {
    if (c.daysLeft === null) return '<span class="small muted">No expiry set</span>';
    if (c.daysLeft < 0) return `<span class="co-warn small">Expired ${-c.daysLeft} day(s) ago</span>`;
    if (c.daysLeft <= 60) return `<span class="co-warn small">Expires in ${c.daysLeft} day(s)</span>`;
    return `<span class="small muted">Valid until ${U.fmtDateLong(c.moa_expiry)}</span>`;
  }

  async function render() {
    try { list = await API.staff.companies(); } catch (e) { return toast(e.message, 'err'); }
    const q = $('search').value.trim().toLowerCase(), f = $('fMoa').value;
    const shown = list.filter(c => (!q || `${c.name} ${c.industry} ${c.address}`.toLowerCase().includes(q)) && (!f || (f === 'issues' ? isIssue(c) : c.moa_effective === f)));
    $('tbody').innerHTML = shown.map(c => `<tr>
        <td><b>${esc(c.name)}</b><div class="small muted">${esc(c.industry || '')} • ${esc(c.address)}</div></td>
        <td>${c.is_partner ? '<span class="chip moa-approved">Partner</span>' : '<span class="chip moa-not_required">Non-partner</span>'}</td>
        <td>${moaChip(c.moa_effective)}<div class="small muted">${esc(c.contract_type || 'MOA')}${c.contract_ref ? ' • ' + esc(c.contract_ref) : ''}</div></td><td>${note(c)}${c.signed_on ? `<div class="small muted">Signed ${U.fmtDateLong(c.signed_on)}</div>` : ''}</td>
        <td>${c.slots ? `<span class="${c.placed > c.slots ? 'co-warn' : ''}">${c.placed} / ${c.slots}</span>` : `${c.placed} <span class="small muted">(no limit)</span>`}</td><td>${c.has_contract_file ? `<button class="btn btn-outline btn-sm" data-file="${esc(c.id)}" type="button">📄 View</button>` : '<span class="small muted">none</span>'}</td>
        <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-edit="${esc(c.id)}" type="button">Edit contract</button>
          <button class="btn btn-navy btn-sm" data-renew="${esc(c.id)}" type="button" style="margin-left:6px">Renew +1 yr</button></td></tr>`).join('');
    $('emptyNote').hidden = shown.length > 0;
    $('tbody').querySelectorAll('[data-file]').forEach(b => guarded(b, async () => { const f = await API.staff.contractFile({ id: b.dataset.file }); Modal.open({ wide: true, title: esc(f.name), body: /pdf/.test(f.type) ? `<iframe src="${f.data}" style="width:100%;height:70vh;border:0"></iframe>` : `<img src="${f.data}" style="max-width:100%" alt="">` }); }));
    $('tbody').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEdit(b.dataset.edit));
    $('tbody').querySelectorAll('[data-renew]').forEach(b => guarded(b, async () => {
      const c = list.find(x => x.id === b.dataset.renew);
      if (!confirm(`Renew the contract with ${c.name} for one more year and mark it as an approved partner?`)) return;
      await API.admin.renewContract({ id: c.id }); toast(`MOA renewed for ${c.name}.`); render();
    }));
  }

  function openEdit(id) {
    const c = list.find(x => x.id === id); if (!c) return;
    const opt = (v, cur, lbl) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${lbl}</option>`;
    let file; // undefined = keep, null = remove, object = new
    Modal.open({
      wide: true, title: `Contract — ${esc(c.name)}`,
      body: `<div class="form-grid">
        <div class="field"><label>Official partner?</label><select id="eP">${opt('yes', c.is_partner ? 'yes' : 'no', 'Yes — active partner')}${opt('no', c.is_partner ? 'yes' : 'no', 'No')}</select></div>
        <div class="field"><label>Type</label><select id="eT">${['MOA', 'MOU', 'Endorsement letter', 'Other'].map(t => opt(t, c.contract_type || 'MOA', t)).join('')}</select></div>
        <div class="field"><label>Status</label><select id="eS">${opt('APPROVED', c.moa_status, 'Approved / signed')}${opt('PENDING', c.moa_status, 'Pending')}${opt('EXPIRED', c.moa_status, 'Expired')}${opt('NOT_REQUIRED', c.moa_status, 'Not required')}</select></div>
        <div class="field"><label>Reference no.</label><input id="eR" value="${esc(c.contract_ref || '')}" placeholder="e.g., MOA-2026-014"></div>
        <div class="field"><label>Signed on</label><input id="eG" type="date" value="${esc(c.signed_on || '')}"></div>
        <div class="field"><label>Valid until</label><input id="eX" type="date" value="${esc(c.moa_expiry || '')}"></div>
        <div class="field"><label>Trainee slots <span class="muted">(0 = no limit)</span></label><input id="eL" type="number" min="0" max="500" value="${c.slots || 0}"></div>
        <div class="field"><label>Trainees placed</label><input value="${c.placed}" disabled></div>
        <div class="field full"><label>Notes</label><textarea id="eN" rows="2">${esc(c.contract_notes || '')}</textarea></div>
        <div class="field full"><label>Signed document <span class="muted">(PDF or photo, up to ~1.3 MB)</span></label><input id="eF" type="file" accept="application/pdf,image/jpeg,image/png"><div class="small muted" id="eFn">${c.has_contract_file ? 'A document is attached. Choose a file to replace it.' : 'No document attached.'}</div></div></div>
        ${(c.history || []).length ? `<h4 style="margin:12px 0 4px">History</h4>${c.history.slice(0, 5).map(h => `<div class="small muted">${esc(h.at.slice(0, 10))} — ${esc(h.action)} by ${esc(h.by)} (${esc(h.detail)})</div>`).join('')}` : ''}<p class="error" id="eErr"></p>`,
      footer: '<button class="btn btn-outline" id="eCancel" type="button">Cancel</button><button class="btn btn-navy" id="eSave" type="button">Save</button>'
    });
    $('eF').onchange = async e => { const f = e.target.files[0]; if (!f) return;
      if (f.size > 1300000) { $('eErr').textContent = 'That file is too big for the demo (max ~1.3 MB).'; e.target.value = ''; return; }
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); file = { name: f.name, type: f.type, data }; $('eFn').textContent = 'New file: ' + f.name; };
    $('eCancel').onclick = () => Modal.close();
    guarded($('eSave'), async () => { try {
      const body = { id, is_partner: $('eP').value === 'yes', moa_status: $('eS').value, moa_expiry: $('eX').value || null, slots: $('eL').value, contract_type: $('eT').value, contract_ref: $('eR').value, signed_on: $('eG').value || null, contract_notes: $('eN').value };
      if (file) body.contract_file = file;
      await API.admin.saveContract(body); Modal.close(); toast('Contract updated.'); render(); } catch (e) { $('eErr').textContent = e.message; } });
  }

  $('exportBtn').onclick = () => {
    const rows = [['Company', 'Industry', 'Partner', 'MOA Status', 'MOA Expiry', 'Days Left', 'Trainees Placed', 'Geofence (m)', 'Contact', 'Email', 'Phone']];
    list.forEach(c => rows.push([c.name, c.industry, c.is_partner ? 'Yes' : 'No', c.moa_effective, c.moa_expiry || '', c.daysLeft === null ? '' : c.daysLeft, c.placed, c.geofence_radius, c.contact_person, c.contact_email, c.contact_phone]));
    downloadCsv(`OJT-partners-${U.dateStr()}.csv`, rows);
  };
  $('search').addEventListener('input', render); $('fMoa').addEventListener('change', render);
  render();
})();
