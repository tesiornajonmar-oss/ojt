(async () => {
  const me = await Shell.init('trace');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const ST = { ON_DUTY: ['🟢 On duty', 'pill-approved'], DONE: ['✓ Done today', 'pill-approved'], NOT_IN: ['⚠ Not clocked in', 'pill-revision'], ON_HOLD: ['On hold', 'pill-pending'], COMPLETED: ['Completed', 'pill-approved'], NOT_STARTED: ['Not started', 'pill-pending'] };
  const DEP = { DEPLOYED: 'Deployed', UNASSIGNED: 'No company yet', AWAITING_CONTRACT: 'Awaiting contract', SCHEDULED: 'Starts soon', COMPLETED: 'Completed', ON_HOLD: 'On hold' };
  let rows = [];
  const maps = (la, ln) => `https://www.google.com/maps?q=${la},${ln}`;
  const ago = iso => { if (!iso) return '—'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : U.fmtShortDate(iso.slice(0, 10)); };

  function radar(r) {          // simple site-relative plot: circle = allowed radius, dots = recent clock locations
    const c = r.company; if (!c || c.lat == null) return '';
    const pts = r.trail.filter(t => t.lat != null).map(t => ({ dx: (t.lng - c.lng) * 111320 * Math.cos(c.lat * Math.PI / 180), dy: (c.lat - t.lat) * 110540, ok: t.gps_status === 'OK' || t.gps_status === 'INSIDE' || (t.distance_in != null && t.distance_in <= c.radius) }));
    const R = Math.max(c.radius * 1.6, ...pts.map(p => Math.hypot(p.dx, p.dy) * 1.1)), k = 80 / R;
    return `<svg viewBox="-100 -100 200 200" width="180" height="180" role="img" aria-label="Clock-in locations around the company"><circle r="${c.radius * k}" fill="rgba(46,125,50,.12)" stroke="#2e7d32"/><circle r="3" fill="#0b2a5b"/>
      ${pts.map(p => `<circle cx="${p.dx * k}" cy="${p.dy * k}" r="3.5" fill="${p.ok ? '#2e7d32' : '#b3261e'}"/>`).join('')}<text x="0" y="-88" text-anchor="middle" font-size="8" fill="currentColor">Green = inside · Red = outside (radius ${c.radius} m)</text></svg>`;
  }
  function detail(sid) {
    const r = rows.find(x => x.sid === sid);
    Modal.open({ wide: true, title: `🧭 ${esc(r.name)}`, body: `<div style="display:flex;gap:16px;flex-wrap:wrap"><div>${radar(r)}</div><div style="flex:1;min-width:260px">
      <div class="kv"><span>Company</span><b>${esc(r.company ? r.company.name : '—')}</b></div><div class="kv"><span>Schedule</span><b>${esc(r.schedule ? `${r.schedule.days_label}, ${r.schedule.start} – ${r.schedule.end}` : '—')}</b></div>
      <div class="kv"><span>Now</span><b>${ST[r.state] ? ST[r.state][0] : r.state}</b></div>
      ${r.last_location && r.last_location.lat != null ? `<div class="kv"><span>Last location</span><b><a href="${maps(r.last_location.lat, r.last_location.lng)}" target="_blank" rel="noopener">Open in Maps</a> • ${r.last_location.distance_m != null ? r.last_location.distance_m + ' m from the office' : ''}</b></div>` : ''}</div></div>
      <h4 style="margin:14px 0 6px">Last ${r.trail.length} records</h4><div class="table-wrap"><table class="logs-table"><thead><tr><th>Date</th><th>In → Out</th><th>Distance in / out</th><th>Face in / out</th><th>Notes</th></tr></thead><tbody>
      ${r.trail.map(t => `<tr><td>${U.fmtShortDate(t.date)}</td><td>${U.fmtTime(t.time_in)} → ${t.time_out ? U.fmtTime(t.time_out) : '—'}</td><td>${t.distance_in != null ? t.distance_in + ' m' : '—'} / ${t.distance_out != null ? t.distance_out + ' m' : '—'}</td>
        <td>${faceChip(t.face_in)} ${t.face_out ? faceChip(t.face_out) : ''}</td><td class="small">${t.late_min ? 'Late ' + t.late_min + 'm ' : ''}${t.under_min ? 'Under ' + t.under_min + 'm ' : ''}${t.ot_hours ? 'OT ' + t.ot_hours + 'h ' : ''}${flagChips((t.flags || []).filter(f => !['LATE', 'UNDERTIME', 'OVERTIME'].includes(f)))}</td></tr>`).join('')}</tbody></table></div>`,
      footer: `<a class="btn btn-outline" href="dtr.html?sid=${encodeURIComponent(sid)}">📋 Open DTR</a><button class="btn btn-outline" id="tClose" type="button">Close</button>` });
    $('tClose').onclick = () => Modal.close();
  }
  function render() {
    const f = $('fState').value, list = rows.filter(r => !f || r.state === f);
    $('grid').innerHTML = list.map(r => { const [t, c] = ST[r.state] || [r.state, ''], l = r.last_location;
      return `<div class="card trace-card"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${esc(r.name)}</b><div class="small muted">${esc(r.section || '')} • ${esc(DEP[r.deployment] || '')}</div></div><span class="${c}">${t}</span></div>
        <div class="small" style="margin-top:8px">${r.since ? `Clocked in ${U.fmtTime(r.since)}` : r.last_seen ? `Last seen ${ago(r.last_seen)}` : 'No attendance yet'}</div>
        <div class="small muted">${l && l.distance_m != null ? `${l.distance_m} m from the office ${gpsChip(l.gps_status)}` : 'No location yet'}</div>
        <button class="btn btn-outline btn-sm" data-t="${esc(r.sid)}" type="button" style="margin-top:10px">Trace</button></div>`; }).join('') || '<p class="muted">No trainees.</p>';
    $('grid').querySelectorAll('[data-t]').forEach(b => b.onclick = () => detail(b.dataset.t));
    const on = rows.filter(r => r.state === 'ON_DUTY').length, miss = rows.filter(r => r.state === 'NOT_IN').length;
    $('note').textContent = `${on} on duty • ${miss} not clocked in • ${rows.length} total`;
  }
  $('fState').onchange = render;
  try { rows = await API.supervisor.trace(); render(); } catch (e) { toast(e.message, 'err'); }
  setInterval(async () => { if (!document.hidden) { try { rows = await API.supervisor.trace(); render(); } catch (e) { /* ignore */ } } }, 30000);
})();
