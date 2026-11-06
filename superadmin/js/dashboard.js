(async () => {
  const me = await Shell.init('dashboard');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let roster, advisers, companies, audit;
  try { [roster, advisers, companies, audit] = await Promise.all([API.admin.roster(), API.admin.advisers(), API.staff.companies(), API.admin.audit()]); }
  catch (e) { return toast(e.message, 'err'); }

  $('welcome').textContent = `Welcome, ${me.name}. Here is the health of the whole OJT program.`;
  const cnt = st => roster.filter(r => r.status === st).length;
  const totalApproved = roster.reduce((a, r) => a + r.approved, 0), totalPending = roster.reduce((a, r) => a + r.pending, 0), totalTarget = roster.reduce((a, r) => a + r.target, 0);
  const avg = roster.length ? Math.round(roster.reduce((a, r) => a + r.pct, 0) / roster.length) : 0;
  const partners = companies.filter(c => c.is_partner);
  const moaBad = c => c.moa_effective !== 'APPROVED' && c.moa_effective !== 'NOT_REQUIRED';
  const moaSoon = c => c.moa_effective === 'APPROVED' && c.daysLeft !== null && c.daysLeft <= 60;
  const moaIssues = companies.filter(c => moaBad(c) || moaSoon(c));

  $('statStudents').textContent = roster.length;
  $('statStudentsSub').textContent = `${cnt('ACTIVE')} active • ${cnt('COMPLETED')} completed • ${cnt('NOT_STARTED')} not started`;
  $('statAdvisers').textContent = advisers.length;
  $('statAdvisersSub').textContent = advisers.length ? `${(roster.length / advisers.length).toFixed(1)} trainees each on average` : 'No advisers yet';
  $('statPartners').textContent = partners.length;
  $('statPartnersSub').textContent = `${moaIssues.length} MOA need attention`;
  $('statHours').textContent = Math.round(totalApproved).toLocaleString();
  $('statHoursSub').textContent = `${avg}% average completion`;

  const unassigned = roster.filter(r => !r.adviserId);
  const backlog = advisers.filter(a => a.pending >= 5 || a.oldestDays >= 7);
  const stalled = roster.filter(r => r.flags.some(f => f.startsWith('No activity')));
  const noMoa = roster.filter(r => r.ojt && r.ojt.moa_status !== 'APPROVED' && r.status !== 'COMPLETED');
  const noSup = companies.filter(c => c.placed > 0 && !c.supervisors.length);
  const noFace = roster.filter(r => !r.face_enrolled && (r.status === 'ACTIVE' || r.status === 'NOT_STARTED'));
  const names = list => list.slice(0, 4).map(r => r.name).join(', ') + (list.length > 4 ? ` +${list.length - 4} more` : '');
  const items = [];
  if (unassigned.length) items.push({ ico: '🧑‍🎓', title: `${unassigned.length} trainee(s) have no adviser`, sub: names(unassigned), href: 'students.html?adviser=none' });
  if (backlog.length) items.push({ ico: '⏳', title: `${backlog.length} adviser(s) have a review backlog`, sub: backlog.map(a => `${a.name} (${a.pending} waiting${a.oldestDays ? `, oldest ${a.oldestDays}d` : ''})`).join(' • '), href: 'advisers.html' });
  if (noSup.length) items.push({ ico: '🧑‍💼', title: `${noSup.length} company(ies) with trainees have no supervisor account`, sub: noSup.map(c => c.name).join(' • '), href: 'partners.html' });
  if (moaIssues.length) items.push({ ico: '📄', title: `${moaIssues.length} company MOA(s) need attention`, sub: moaIssues.map(c => `${c.name} (${moaBad(c) ? c.moa_effective.toLowerCase() : 'expires in ' + c.daysLeft + 'd'})`).join(' • '), href: 'partners.html?filter=issues' });
  if (noMoa.length) items.push({ ico: '⚠️', title: `${noMoa.length} trainee(s) placed without an approved MOA`, sub: names(noMoa), href: 'partners.html?filter=issues' });
  if (stalled.length) items.push({ ico: '💤', title: `${stalled.length} trainee(s) inactive for 5+ days`, sub: names(stalled), href: 'students.html?attn=1' });
  if (noFace.length) items.push({ ico: '🙂', title: `${noFace.length} trainee(s) have not set up Face ID`, sub: names(noFace), href: 'students.html?attn=1' });
  $('attnList').innerHTML = items.length ? items.map(i => `<a class="list-row" href="${i.href}"><div><b>${i.ico} ${esc(i.title)}</b><div class="small muted">${esc(i.sub)}</div></div><span class="chev">›</span></a>`).join('')
    : '<p class="muted">🎉 Nothing needs attention right now.</p>';

  const sts = ['ACTIVE', 'COMPLETED', 'NOT_STARTED', 'ON_HOLD'];
  $('segBar').innerHTML = sts.map(s => `<div class="seg seg-${s.toLowerCase()}" style="width:${roster.length ? cnt(s) / roster.length * 100 : 0}%"></div>`).join('');
  $('segLegend').innerHTML = sts.map(s => `<span><i class="seg-${s.toLowerCase()}"></i>${STATUS_LABEL[s]}: <b>${cnt(s)}</b></span>`).join('');
  const apPct = totalTarget ? Math.min(100, Math.round(totalApproved / totalTarget * 100)) : 0;
  const pePct = totalTarget ? Math.min(100 - apPct, Math.round(totalPending / totalTarget * 100)) : 0;
  $('hrsFill').style.width = apPct + '%'; $('hrsPend').style.width = pePct + '%';
  $('hrsText').textContent = `${Math.round(totalApproved).toLocaleString()} / ${totalTarget.toLocaleString()} h (${apPct}%)`;

  $('wlBody').innerHTML = advisers.length ? advisers.map(a => `<tr>
      <td><b>${esc(a.name)}</b><div class="small muted">${esc(a.id)}</div></td><td>${a.count}</td>
      <td class="prog-cell"><div class="tracker-bar mini"><div class="tracker-fill-approved" style="width:${a.avg}%"></div></div><div class="small muted">${a.avg}% avg</div></td>
      <td>${a.pending ? `<span class="chip chip-warn">${a.slips} slips • ${a.reports} reports</span>` : '<span class="muted small">All clear</span>'}${a.awaitingSupervisor ? `<div class="small muted">${a.awaitingSupervisor} with company supervisors</div>` : ''}</td>
      <td>${a.pending ? (a.oldestDays >= 3 ? `<span class="late">${a.oldestDays} days</span>` : a.oldestDays === 0 ? 'Today' : `${a.oldestDays} day(s)`) : '—'}</td>
      <td>${a.flagged ? `<span class="chip chip-warn">⚠ ${a.flagged}</span>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">No advisers yet.</td></tr>';

  const act = audit.slice(0, 8);
  $('actList').innerHTML = act.length ? act.map(a => `<div class="act-row"><span class="act-dot"></span><div><div><b>${esc(a.action)}</b> — ${esc(a.target)}</div>
      <div class="small muted">${esc(a.actor)} • ${esc(a.detail)}${a.detail ? ' • ' : ''}${esc(U.fmtWhen(a.at))}</div></div></div>`).join('')
    : '<p class="muted">No activity yet. Actions by advisers, supervisors and admins will show up here.</p>';

  $('exportBtn').onclick = () => {
    const advName = {}; advisers.forEach(a => { advName[a.id] = a.name; });
    const rows = [['Adviser', 'Student ID', 'Name', 'Company', 'Status', 'Approved Hours', 'Pending Hours', 'Target Hours', 'Completion %', 'MOA', 'Last Activity']];
    roster.slice().sort((a, b) => (advName[a.adviserId] || '~').localeCompare(advName[b.adviserId] || '~') || a.name.localeCompare(b.name))
      .forEach(r => rows.push([advName[r.adviserId] || 'Unassigned', r.sid, r.name, r.company ? r.company.name : '', r.status, +r.approved.toFixed(2), +r.pending.toFixed(2), r.target, r.pct, r.ojt ? r.ojt.moa_status : '', r.last || '']));
    downloadCsv(`OJT-system-report-${U.dateStr()}.csv`, rows);
  };
})();
