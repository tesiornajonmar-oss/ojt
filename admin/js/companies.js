(async () => {
  const me = await Shell.init('companies');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let list = [];

  async function render() {
    try { list = await API.staff.companies(); } catch (e) { return toast(e.message, 'err'); }
    const q = $('search').value.trim().toLowerCase();
    const shown = list.filter(c => !q || `${c.name} ${c.industry} ${c.address}`.toLowerCase().includes(q));
    $('list').innerHTML = shown.length ? shown.map(c => `
      <div class="company-card">
        <div><b>${esc(c.name)}</b> ${c.is_partner ? '<span class="chip moa-approved">Partner</span>' : '<span class="chip moa-not_required">Non-partner</span>'} ${moaChip(c.moa_effective)}
          <div class="small muted">${esc(c.industry || '')} • ${esc(c.address)}</div>
          <div class="small muted">📍 ${c.lat != null ? `${(+c.lat).toFixed(5)}, ${(+c.lng).toFixed(5)}` : 'No coordinates yet'} • Geofence ${c.geofence_radius} m • ${c.placed} trainee(s)</div>
          <div class="small muted">🧑‍💼 ${c.supervisors.length ? c.supervisors.map(s => esc(s.name)).join(', ') : 'No supervisor account yet'}</div></div>
        <button class="btn btn-outline btn-sm" data-edit="${esc(c.id)}" type="button">Edit</button></div>`).join('') : '<p class="muted center">No companies match.</p>';
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(b.dataset.edit));
  }

  function openForm(id) {
    const c = id ? list.find(x => x.id === id) : null;
    Modal.open({
      wide: true, title: c ? `Edit — ${esc(c.name)}` : 'Add Company',
      body: `<div class="form-grid">
        <div class="field full"><label>Company name *</label><input id="cName" value="${esc(c ? c.name : '')}"></div>
        <div class="field"><label>Industry</label><input id="cInd" value="${esc(c ? c.industry || '' : '')}"></div>
        <div class="field"><label>Address *</label><input id="cAddr" value="${esc(c ? c.address : '')}"></div>
        <div class="field"><label>Latitude</label><input id="cLat" type="number" step="any" value="${c && c.lat != null ? c.lat : ''}" placeholder="14.6625"></div>
        <div class="field"><label>Longitude</label><input id="cLng" type="number" step="any" value="${c && c.lng != null ? c.lng : ''}" placeholder="120.9568"></div>
        <div class="field full"><button class="btn btn-outline btn-sm" id="cLoc" type="button">📍 Use my current location</button><span class="small muted" id="cLocNote" style="margin-left:8px">Stand at the company and press this to fill in the coordinates.</span></div>
        <div class="field"><label>Geofence radius (m)</label><input id="cRad" type="number" min="50" max="5000" value="${c ? c.geofence_radius : 300}"></div>
        <div class="field"><label>Contact person</label><input id="cPerson" value="${esc(c ? c.contact_person || '' : '')}"></div>
        <div class="field"><label>Contact email</label><input id="cEmail" type="email" value="${esc(c ? c.contact_email || '' : '')}"></div>
        <div class="field"><label>Contact phone</label><input id="cPhone" value="${esc(c ? c.contact_phone || '' : '')}"></div>
      </div><p class="small muted" style="margin-top:10px">Partner and MOA status are managed by the Super Admin.</p><p class="error" id="cErr"></p>`,
      footer: '<button class="btn btn-outline" id="cCancel" type="button">Cancel</button><button class="btn btn-navy" id="cSave" type="button">Save</button>'
    });
    const g = k => $(k).value.trim();
    $('cCancel').onclick = () => Modal.close();
    $('cLoc').onclick = () => {
      const note = $('cLocNote');
      if (!navigator.geolocation) { note.textContent = 'This browser has no GPS support.'; return; }
      note.textContent = 'Getting location…';
      navigator.geolocation.getCurrentPosition(p => { $('cLat').value = p.coords.latitude.toFixed(6); $('cLng').value = p.coords.longitude.toFixed(6); note.textContent = 'Location filled in.'; },
        () => { note.textContent = 'Could not get your location (permission denied?).'; }, { enableHighAccuracy: true, timeout: 10000 });
    };
    guarded($('cSave'), async () => {
      const body = { name: g('cName'), industry: g('cInd'), address: g('cAddr'), lat: g('cLat'), lng: g('cLng'), geofence_radius: g('cRad'),
        contact_person: g('cPerson'), contact_email: g('cEmail'), contact_phone: g('cPhone') };
      try { if (id) await API.staff.updateCompany({ id, ...body }); else await API.staff.createCompany(body); Modal.close(); toast('Company saved.'); render(); }
      catch (e) { $('cErr').textContent = e.message; }
    });
  }

  $('addBtn').onclick = () => openForm(null);
  $('search').addEventListener('input', render);
  render();
})();
