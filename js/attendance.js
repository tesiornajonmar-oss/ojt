(async () => {
  const me = await Shell.init('attendance');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let dash, place, ticker = null;

  const OUTCOME = {
    AUTO_APPROVED: ['ok', '✅ Verified automatically — your hours were added.'],
    PENDING_SUPERVISOR: ['warn', '📨 Sent to your company supervisor for review.'],
    PENDING_ADVISER: ['warn', '📨 Sent to your faculty adviser for review.']
  };

  function getCoords() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  }

  const INFO = ['LATE', 'UNDERTIME', 'OVERTIME'];
  function showResult(r) {
    const [cls, text] = OUTCOME[r.outcome] || ['warn', 'Submitted.'];
    const box = $('resultBox');
    box.hidden = false;
    box.innerHTML = `<div class="${cls === 'ok' ? 'spot-note' : 'gatekeeper'}" style="margin-top:14px"><b>${text}</b>
      ${r.shift && (r.shift.late_min || r.shift.under_min || r.shift.ot_hours) ? `<div class="small" style="margin-top:6px">${r.shift.late_min ? `Late ${r.shift.late_min} min. ` : ''}${r.shift.under_min ? `Undertime ${r.shift.under_min} min. ` : ''}${r.shift.ot_hours ? `Overtime ${r.shift.ot_hours} h — counted only if your supervisor approves it. ` : ''}Regular hours: ${r.shift.regular_hours}.</div>` : ''}
      ${r.flags && r.flags.some(f => !INFO.includes(f)) ? `<div class="small" style="margin-top:6px">Why a person needs to look at it:</div><div class="flag-list">${flagChips(r.flags.filter(f => !INFO.includes(f)))}</div>` : ''}</div>`;
  }

  async function load() {
    [dash, place] = await Promise.all([API.student.dashboard(), API.student.placement()]);
    render();
  }

  function render() {
    clearInterval(ticker);
    const ojt = place.ojt, comp = place.company;
    $('placement').innerHTML = comp ? `
      <div class="kv"><span>Company</span><b>${esc(comp.name)}</b></div>
      <div class="kv"><span>Address</span><b>${esc(comp.address)}</b></div>
      <div class="kv"><span>Schedule</span><b>${esc(ojt.shift_start)} – ${esc(ojt.shift_end)}</b></div>
      <div class="kv"><span>Work days</span><b>${esc(ojt.work_days)}</b></div>
      <div class="kv"><span>Geofence</span><b>${comp.geofence_radius} m</b></div>` : '<p class="muted">No company assigned yet.</p>';

    const fb = $('faceBanner');
    fb.hidden = !(dash.policy.face_required && !dash.face.enrolled);
    if (!fb.hidden) fb.innerHTML = `<div class="gatekeeper" style="margin-bottom:16px"><div><b>🙂 Face ID is not set up</b><p class="small" style="margin-top:4px">You can still clock in, but a person must review every record. Set up Face ID once to get automatic verification.</p></div><a class="btn btn-navy btn-sm" href="ojt-details.html#face">Set up</a></div>`;

    ['clockInArea', 'clockOutArea', 'doneArea'].forEach(id => { $(id).hidden = true; });
    const pill = $('statusPill'), a = dash.active, t = dash.today;
    if (dash.status === 'ON_HOLD') { pill.className = 'pill inactive'; pill.textContent = 'Your OJT is on hold — contact your adviser'; $('gpsNote').textContent = ''; }
    else if (a) {
      pill.className = 'pill';
      pill.innerHTML = `Clocked in at ${esc(a.company)}<br><span class="timer" id="liveTimer">00:00:00</span>`;
      const tick = () => { const el = $('liveTimer'); if (el) el.textContent = U.fmtTimer(Date.now() - new Date(a.time_in)); };
      tick(); ticker = setInterval(tick, 1000);
      $('gpsNote').innerHTML = `Since ${U.fmtTime(a.time_in)} • GPS ${gpsChip(a.gps_status)}${a.distance_m != null ? ` (${a.distance_m} m from the company)` : ''} • Face ${faceChip(a.face_in)}`;
      $('clockOutArea').hidden = false;
    } else if (t) {
      pill.className = 'pill inactive'; pill.innerHTML = "Today's shift is<br>already submitted"; $('gpsNote').textContent = '';
      $('doneArea').innerHTML = `<div class="kv"><span>Time</span><b>${U.fmtTime(t.time_in)} – ${U.fmtTime(t.time_out)}</b></div>
        <div class="kv"><span>Hours</span><b>${t.computed_hours}</b></div><div class="kv"><span>Status</span><b>${shiftStatusPill(t)}</b></div>`;
      $('doneArea').hidden = false;
    } else { pill.className = 'pill inactive'; pill.textContent = 'Not currently timed in'; $('gpsNote').textContent = ''; $('clockInArea').hidden = false; }
  }

  guarded($('clockInBtn'), async () => {
    $('resultBox').hidden = true;
    const gps = getCoords();
    const cam = await Camera.capture({ title: 'Clock in — take your photo', face: dash.face.enrolled, liveness: true });
    if (!cam) return;
    const coords = await gps;
    const r = await API.student.clockIn({ coords, photo: cam.photo, face: cam.face });
    toast(r.shift.gps_status === 'In-Range' ? 'Clocked in — location verified.' : 'Clocked in — location is Manual (outside the geofence or no GPS).', r.shift.gps_status === 'In-Range' ? 'ok' : 'warn', 5000);
    await load();
  });

  guarded($('clockOutBtn'), async () => {
    const cam = await Camera.capture({ title: 'Clock out — take your photo', face: dash.face.enrolled, liveness: true });
    if (!cam) return;
    const coords = await getCoords();
    const r = await API.student.clockOut({ coords, photo: cam.photo, face: cam.face });
    await load();
    showResult(r);
  });

  try { await load(); } catch (e) { toast(e.message, 'err'); }
})();
