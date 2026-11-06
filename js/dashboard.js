(async () => {
  const me = await Shell.init('dashboard');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let d;
  try { d = await API.student.dashboard(); } catch (e) { return toast(e.message, 'err'); }

  /* ---- announcements from the Super Admin (dismissals are remembered per student, in this browser) ---- */
  const key = 'ojt_ann_dismissed_' + d.user.student_id;
  let dismissed = [];
  try { dismissed = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { dismissed = []; }
  const live = d.announcements.filter(a => !dismissed.includes(a.id));
  const box = $('announceBox');
  if (live.length) {
    box.hidden = false;
    box.innerHTML = live.map(a => `
      <div class="${a.priority === 'important' ? 'revision-banner' : 'gatekeeper'}" style="margin-bottom:12px">
        <div><b>📢 ${esc(a.title)}</b><p class="small" style="margin-top:4px">${esc(a.message)}</p>
          <p class="small" style="opacity:.7;margin-top:4px">— ${esc(a.author)} • ${U.fmtShortDate(a.created.slice(0, 10))}</p></div>
        <button class="btn btn-outline btn-sm" data-dismiss="${esc(a.id)}" type="button">Dismiss</button>
      </div>`).join('');
    box.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => {
      dismissed.push(b.dataset.dismiss);
      try { localStorage.setItem(key, JSON.stringify(dismissed)); } catch (e) { /* ignore */ }
      b.parentElement.remove();
      if (!box.children.length) box.hidden = true;
    });
  }

  /* ---- Face ID reminder ---- */
  if (d.policy.face_required && !d.face.enrolled) {
    const fb = $('faceBanner'); fb.hidden = false;
    fb.innerHTML = `<div class="gatekeeper" style="margin-bottom:16px"><div><b>🙂 Set up Face ID</b>
      <p class="small" style="margin-top:4px">Until you do, every attendance record is reviewed by a person. With Face ID, clean records are verified automatically.</p></div>
      <a class="btn btn-navy btn-sm" href="ojt-details.html#face">Set up now</a></div>`;
  }

  /* ---- hours ---- */
  const h = d.hours;
  $('bar').style.width = h.pct + '%'; $('bar').textContent = h.pct + '%';
  $('doneHours').textContent = +h.total.toFixed(2);
  $('targetHours').textContent = h.target;
  $('remainingHours').textContent = `${+h.remaining.toFixed(2)} hours remaining`;
  $('pendingHours').textContent = h.pending ? `+ ${+h.pending.toFixed(2)} h waiting for verification` : '';

  /* ---- quick status ---- */
  const pill = $('statusPill'), btn = $('statusBtn');
  if (d.status === 'ON_HOLD') { pill.className = 'pill inactive'; pill.textContent = 'Your OJT is on hold'; btn.textContent = 'Contact your adviser'; }
  else if (d.active) {
    pill.className = 'pill';
    pill.innerHTML = `Currently Clocked In at<br>${esc(d.active.company)}<br><span class="timer" id="liveTimer">00:00:00</span>`;
    btn.textContent = 'Clock Out';
    const tick = () => { const t = $('liveTimer'); if (t) t.textContent = U.fmtTimer(Date.now() - new Date(d.active.time_in)); };
    tick(); setInterval(tick, 1000);
  } else if (d.today) { pill.className = 'pill inactive'; pill.innerHTML = "Today's shift is<br>already submitted"; btn.textContent = 'View Summary'; }
  else { pill.className = 'pill inactive'; pill.textContent = 'Not Currently Timed In'; btn.textContent = 'Clock In'; }

  /* ---- verification feed ---- */
  const map = { PENDING_VERIFICATION: ['Pending', 'st-pending'], APPROVED: ['Approved', 'st-approved'], REJECTED: ['Rejected', 'st-rejected'], REVISION: ['Revision', 'st-rejected'] };
  $('feed').innerHTML = d.feed.length ? d.feed.map(i => {
    const [text, cls] = map[i.status] || ['Pending', 'st-pending'];
    return `<div class="feed-row"><span>${esc(i.label)}</span><span class="badge-status ${cls}">${text}</span></div>`;
  }).join('') : '<p class="muted">No submissions yet.</p>';
})();
