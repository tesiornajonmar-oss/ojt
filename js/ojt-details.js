(async () => {
  const me = await Shell.init('ojt-details');
  if (!me) return;
  const $ = id => document.getElementById(id);

  async function render() {
    let p, face;
    try { [p, face] = await Promise.all([API.student.placement(), API.student.faceStatus()]); } catch (e) { return toast(e.message, 'err'); }
    const o = p.ojt, c = p.company;
    $('placement').innerHTML = o && c ? `
      <div class="kv"><span>Company (HTE)</span><b>${esc(c.name)}</b></div>
      <div class="kv"><span>Address</span><b>${esc(c.address)}</b></div>
      <div class="kv"><span>Industry</span><b>${esc(c.industry || '—')}</b></div>
      <div class="kv"><span>Agreement</span><b>${moaChip(c.moa_effective)}</b></div>
      <div class="kv"><span>Status</span><b>${statusChip(p.status)}</b></div>
      <div class="kv"><span>Required hours</span><b>${o.target_hours} h</b></div>
      <div class="kv"><span>Training period</span><b>${U.fmtDateLong(o.start_date)} → ${o.end_date ? U.fmtDateLong(o.end_date) : 'open'}</b></div>
      <div class="kv"><span>Deployment</span><b>${({ DEPLOYED: '🟢 Deployed', SCHEDULED: 'Starts soon', AWAITING_CONTRACT: 'Waiting for the company contract', UNASSIGNED: 'No company yet', ON_HOLD: 'On hold', COMPLETED: 'Completed' })[p.deployment] || ''}</b></div>
      <div class="kv"><span>Schedule</span><b>${esc(p.schedule.days_label)}<br>${esc(p.schedule.start)} – ${esc(p.schedule.end)} • break ${p.schedule.break_min} min</b></div>
      <div style="margin:6px 0 10px"><button class="btn btn-outline btn-sm" id="schReq" type="button">✏️ Request schedule change</button>
        ${p.schedule_request ? `<div class="small ${p.schedule_request.status === 'PENDING' ? 'muted' : p.schedule_request.status === 'APPROVED' ? '' : 'late'}" style="margin-top:6px">Last request: ${p.schedule_request.status === 'PENDING' ? 'waiting for your supervisor' : p.schedule_request.status === 'APPROVED' ? 'approved' : 'declined' + (p.schedule_request.note ? ' — ' + esc(p.schedule_request.note) : '')}</div>` : ''}</div>
      ${p.placements.length > 1 ? `<div class="small muted">Previous companies: ${p.placements.slice(1).map(x => esc(x.company)).join(', ')}</div>` : ''}
      <div class="kv"><span>Program</span><b>${esc(p.user.program || '—')}</b></div>` : '<p class="muted">No placement yet.</p>';
    $('advisers').innerHTML = p.advisers.length ? p.advisers.map(a => `<div class="kv"><span>${esc(a.email || '')}</span><b>${esc(a.name)}</b></div>`).join('') : '<p class="muted small">No adviser assigned yet.</p>';
    $('supervisors').innerHTML = p.supervisors.length ? p.supervisors.map(s => `<div class="kv"><span>${esc([s.position, s.email, s.phone].filter(Boolean).join(' • ') || '—')}</span><b>${esc(s.name)}</b></div>`).join('')
      : '<p class="muted small">Your company has no supervisor account yet — your adviser will review your attendance.</p>';

    $('faceBox').innerHTML = face.enrolled
      ? `<div class="spot-note">✅ Face ID is set up (${face.shots} shots, ${U.fmtWhen(face.enrolled_at)}). Clean attendance records are verified automatically.</div>
         <p class="small muted">For security, only your adviser can reset your Face ID (for example if you got new glasses or a new look). Ask them if it stops recognising you.</p>`
      : `<p class="small">Face ID lets the system confirm that <b>you</b> are the one clocking in. You take three quick photos once; afterwards each clock-in is compared with them.</p>
         <p class="small muted">${face.face_required ? 'Without Face ID, every attendance record must be reviewed by a person, which is slower.' : ''}</p>
         <button class="btn btn-navy" id="faceNew" type="button">Set up Face ID</button>`;
    if ($('faceNew')) $('faceNew').onclick = startEnroll;
    if ($('schReq')) $('schReq').onclick = () => ReviewExtra.scheduleEditor(null, { days: p.schedule.days, start_label: p.schedule.start, end_label: p.schedule.end, brk: p.schedule.break_min },
      async f => { await API.student.requestSchedule(f); toast('Request sent to your supervisor.'); render(); }, true);
  }

  function startEnroll() {
    Modal.open({
      title: 'Face ID — your consent',
      body: `<p class="small">To verify attendance, this system stores a <b>numeric face template</b> and one reference photo made from the three photos you take next.</p>
        <ul class="small" style="padding-left:18px"><li>It is used <b>only</b> to confirm your identity when you clock in or out.</li>
        <li>Only your adviser, company supervisor and the program administrators can see your attendance photos.</li>
        <li>You can ask your adviser to delete or reset it at any time.</li></ul>
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px"><input type="checkbox" id="consent"> I understand and agree to the processing of my face data for OJT attendance verification (Data Privacy Act of 2012).</label>
        <p class="error" id="cErr"></p>`,
      footer: '<button class="btn btn-outline" id="cNo" type="button">Cancel</button><button class="btn btn-navy" id="cYes" type="button">Agree & take photos</button>'
    });
    $('cNo').onclick = () => Modal.close();
    $('cYes').onclick = async () => {
      if (!$('consent').checked) { $('cErr').textContent = 'Please tick the box to continue.'; return; }
      Modal.close();
      const r = await Camera.capture({ title: 'Set up Face ID', enroll: true, shots: 3 });
      if (!r) return;
      try { await API.student.enrollFace({ descriptors: r.descriptors, photo: r.photo, consent: true }); toast('Face ID is ready ✓'); render(); }
      catch (e) { toast(e.message, 'err', 5000); }
    };
  }

  guarded($('pwBtn'), async () => {
    const err = $('pwErr'), o = $('pwOld').value, n = $('pwNew').value, n2 = $('pwNew2').value;
    if (n.length < 6) { err.textContent = 'New password must be at least 6 characters.'; return; }
    if (n !== n2) { err.textContent = 'The new passwords do not match.'; return; }
    try { await API.auth.changePassword({ old_password: o, new_password: n }); err.textContent = ''; $('pwOld').value = $('pwNew').value = $('pwNew2').value = ''; toast('Password changed.'); }
    catch (e) { err.textContent = e.message; }
  });

  await render();
  const target = ['#face', '#password'].includes(location.hash) ? $(location.hash.slice(1)) : null;
  if (target) { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 2200); }
})();
