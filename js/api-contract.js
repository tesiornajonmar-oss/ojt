/* =====================================================================
   OJT-ERAMS — API CONTRACT  (the single source of truth for the backend)
   Every page talks to the server ONLY through  API.<group>.<method>(args)  → Promise.
   Each row is:  [ name, HTTP method, path, who may call it, what it does ]
     • ":x" in a path is filled from args.x (e.g. /shifts/:id → args.id).
     • GET: remaining args go in the query string.  Other methods: remaining args are the JSON body.
     • Success: HTTP 200 + JSON.   Failure: HTTP 4xx + {"error":"human readable message"}.
     • HTTP 401 means "not signed in" → the page sends the user to the login screen.
   BACKEND_GUIDE.md is generated from this file; the demo backend (js/mock) implements the same names.
   ===================================================================== */
window.API_CONTRACT = [
  /* ---- auth ---- */
  ['auth.login',            'POST',   '/api/auth/login',                        'public',   'Body {portal, username, password}. portal = student | faculty | supervisor | superadmin. Returns {token, user}.'],
  ['auth.logout',           'POST',   '/api/auth/logout',                       'any',      'Invalidate the token.'],
  ['auth.me',               'GET',    '/api/auth/me',                           'any',      'Profile of the signed-in user + sidebar badges {approvals, messages}.'],
  ['auth.changePassword',   'POST',   '/api/auth/change-password',              'any',      'Body {old_password, new_password}.'],
  ['auth.updateProfile',    'PUT',    '/api/auth/profile',                      'any',      'Body {email, phone}. Update own contact details.'],
  ['auth.forgotPassword',   'POST',   '/api/auth/forgot-password',              'public',   'Body {portal, username}. Always answers {ok, message} and never reveals whether the account exists. Real backend: e-mail a one-time reset link (valid ~30 min) or notify the staff who can reset it.'],
  ['auth.setTheme',         'PUT',    '/api/auth/theme',                        'any',      'Body {theme: "light"|"dark"}.'],

  /* ---- notifications & messages ---- */
  ['notifications.list',    'GET',    '/api/notifications',                     'any',      'Returns {items:[{id,text,link,at,read}], unread}.'],
  ['notifications.markRead','POST',   '/api/notifications/read',                'any',      'Body {id?}. No id = mark all read.'],
  ['messages.contacts',     'GET',    '/api/messages/contacts',                 'ADVISER,SUPER_ADMIN,SUPERVISOR', 'People the caller may message: faculty see the supervisors of their trainees, supervisors see the advisers of their trainees, super admin sees everyone.'],
  ['messages.trainees',     'GET',    '/api/messages/trainees',                 'ADVISER,SUPER_ADMIN,SUPERVISOR', 'Trainees the caller may start a conversation about.'],
  ['messages.threads',      'GET',    '/api/messages/threads',                  'ADVISER,SUPER_ADMIN,SUPERVISOR', 'Conversation list (one thread is about one trainee).'],
  ['messages.get',          'GET',    '/api/messages/threads/:id',              'ADVISER,SUPER_ADMIN,SUPERVISOR', 'Thread + messages. Marks the thread read for the caller.'],
  ['messages.start',        'POST',   '/api/messages/threads',                  'ADVISER,SUPER_ADMIN,SUPERVISOR', 'Body {to?, student_id?, subject, body}. `to` = contact uid; `student_id` optional = the conversation is about that trainee (if no `to`, everyone responsible for the trainee is added). Notifies the other participants.'],
  ['messages.send',         'POST',   '/api/messages/threads/:id/messages',     'ADVISER,SUPER_ADMIN,SUPERVISOR', 'Body {body}.'],

  /* ---- student ---- */
  ['student.dashboard',     'GET',    '/api/student/dashboard',                 'EDUC_INTERN', 'Hours, active/today shift, recent feed, announcements, Face ID state, policy flags.'],
  ['student.placement',     'GET',    '/api/student/placement',                 'EDUC_INTERN', 'Company, schedule, adviser(s) and company supervisor(s).'],
  ['student.shifts',        'GET',    '/api/student/shifts',                    'EDUC_INTERN', 'Own attendance history (no photos).'],
  ['student.clockIn',       'POST',   '/api/student/attendance/clock-in',       'EDUC_INTERN', 'Body {coords:{lat,lng}|null, photo:dataURL|null, face:{descriptor,liveness}|null}. Server decides GPS + face status.'],
  ['student.clockOut',      'POST',   '/api/student/attendance/clock-out',      'EDUC_INTERN', 'Body {photo, face}. Server computes hours, runs the approval rules, returns {shift, outcome, flags}.'],
  ['student.reports',       'GET',    '/api/student/reports',                   'EDUC_INTERN', 'Own narrative reports.'],
  ['student.saveReport',    'POST',   '/api/student/reports',                   'EDUC_INTERN', 'Body {id?, title, body, date, attachments?, accomplishment_ids?, submit}.'],
  ['student.deleteReport',  'DELETE', '/api/student/reports/:id',               'EDUC_INTERN', 'Only drafts.'],
  ['student.faceStatus',    'GET',    '/api/student/face',                      'EDUC_INTERN', '{enrolled, enrolled_at, shots}.'],
  ['student.enrollFace',    'POST',   '/api/student/face',                      'EDUC_INTERN', 'Body {descriptors:[[128 numbers]…], photo, consent:true}. Biometric data — see BACKEND_GUIDE.md.'],

  /* ---- company supervisor ---- */
  ['supervisor.dashboard',  'GET',    '/api/supervisor/dashboard',              'SUPERVISOR', 'Counts, trainees on duty today, oldest waiting items.'],
  ['supervisor.trainees',   'GET',    '/api/supervisor/trainees',               'SUPERVISOR', 'Trainees placed at the supervisor\'s company, with progress + today\'s state.'],
  ['supervisor.trainee',    'GET',    '/api/supervisor/trainees/:sid',          'SUPERVISOR', 'Summary, attendance (no photos), reports (read-only), evaluation.'],
  ['supervisor.queue',      'GET',    '/api/supervisor/attendance/queue',       'SUPERVISOR', 'Returns {pending:[…risk-sorted, with photos incl. late/undertime/overtime], total}.'],
  ['supervisor.approveShift','POST',  '/api/supervisor/attendance/:id/approve', 'SUPERVISOR', 'Body {hours?}.'],
  ['supervisor.rejectShift','POST',   '/api/supervisor/attendance/:id/reject',  'SUPERVISOR', 'Body {note}.'],
  ['supervisor.escalateShift','POST', '/api/supervisor/attendance/:id/escalate','SUPERVISOR', 'Body {note}. Sends the item to the trainee\'s faculty adviser.'],
  ['supervisor.bulkApprove','POST',   '/api/supervisor/attendance/bulk-approve','SUPERVISOR', 'Body {ids:[…]}. HIGH-risk items are always skipped. Returns {approved, skipped}.'],
  ['supervisor.evaluations','GET',    '/api/supervisor/evaluations',            'SUPERVISOR', 'Each trainee with evaluation status.'],
  ['supervisor.saveEvaluation','PUT', '/api/supervisor/evaluations/:sid',       'SUPERVISOR', 'Body {ratings:{…1-5}, comments, recommend:"YES"|"NO", submit}.'],

  /* ---- faculty adviser (SUPER_ADMIN may use these too: scope = everyone) ---- */
  ['faculty.dashboard',     'GET',    '/api/faculty/dashboard',                 'ADVISER,SUPER_ADMIN', 'Counts + oldest waiting items + flagged trainees.'],
  ['faculty.roster',        'GET',    '/api/faculty/trainees',                  'ADVISER,SUPER_ADMIN', 'Trainee summaries in scope.'],
  ['faculty.trainee',       'GET',    '/api/faculty/trainees/:sid',             'ADVISER,SUPER_ADMIN', 'Summary, attendance (no photos), reports (with accomplishments), accomplishments, evaluation, face state, supervisors, placement history, pending schedule request.'],
  ['faculty.queue',         'GET',    '/api/faculty/queue',                     'ADVISER,SUPER_ADMIN', '{needsYou:[…], awaitingSupervisor:[…], reports:[…], total}. Slips are risk-sorted and include photos.'],
  ['faculty.approveShift',  'POST',   '/api/faculty/attendance/:id/approve',    'ADVISER,SUPER_ADMIN', 'Body {hours?}.'],
  ['faculty.rejectShift',   'POST',   '/api/faculty/attendance/:id/reject',     'ADVISER,SUPER_ADMIN', 'Body {note}.'],
  ['faculty.bulkApprove',   'POST',   '/api/faculty/attendance/bulk-approve',   'ADVISER,SUPER_ADMIN', 'Body {ids}. HIGH-risk skipped. Returns {approved, skipped}.'],
  ['faculty.approveReport', 'POST',   '/api/faculty/reports/:id/approve',       'ADVISER,SUPER_ADMIN', ''],
  ['faculty.reviseReport',  'POST',   '/api/faculty/reports/:id/revise',        'ADVISER,SUPER_ADMIN', 'Body {feedback}.'],
  ['faculty.updateTrainee', 'PUT',    '/api/faculty/trainees/:sid',             'ADVISER,SUPER_ADMIN', 'Body {user:{…}, ojt:{target_hours,start_date,end_date,status}}. Company and schedule have their own endpoints.'],
  ['faculty.addTrainee',    'POST',   '/api/faculty/trainees',                  'ADVISER,SUPER_ADMIN', 'Body {first_name,last_name,student_id,program,username,password,email,company_id,target_hours,start_date}.'],

  /* ---- shared by faculty + super admin ---- */
  ['staff.shiftPhotos',     'GET',    '/api/staff/attendance/:id/photos',       'ADVISER,SUPER_ADMIN,SUPERVISOR', 'Clock-in / clock-out photos and face results of one shift.'],
  ['staff.resetTraineePassword','POST','/api/staff/trainees/:sid/reset-password','ADVISER,SUPER_ADMIN', 'Returns {temporary_password}.'],
  ['staff.resetFace',       'DELETE', '/api/staff/trainees/:sid/face',          'ADVISER,SUPER_ADMIN', 'Remove a trainee\'s enrolled face so they can enroll again.'],
  ['staff.companies',       'GET',    '/api/staff/companies',                   'ADVISER,SUPER_ADMIN', 'Companies with MOA state, trainee count and their supervisors.'],
  ['staff.createCompany',   'POST',   '/api/staff/companies',                   'ADVISER,SUPER_ADMIN', ''],
  ['staff.updateCompany',   'PUT',    '/api/staff/companies/:id',               'ADVISER,SUPER_ADMIN', 'Name, address, GPS, geofence, contact. (MOA is Super Admin only.)'],
  ['staff.supervisors',     'GET',    '/api/staff/supervisors',                 'ADVISER,SUPER_ADMIN', 'Company supervisor accounts with workload.'],
  ['staff.createSupervisor','POST',   '/api/staff/supervisors',                 'ADVISER,SUPER_ADMIN', 'Body {first_name,last_name,email,phone,position,company_id,username,password}.'],
  ['staff.updateSupervisor','PUT',    '/api/staff/supervisors/:supervisor_id',  'ADVISER,SUPER_ADMIN', ''],
  ['staff.resetSupervisorPassword','POST','/api/staff/supervisors/:supervisor_id/reset-password','ADVISER,SUPER_ADMIN', 'Returns {temporary_password}.'],
  ['staff.deleteSupervisor','DELETE', '/api/staff/supervisors/:supervisor_id',  'ADVISER,SUPER_ADMIN', ''],

  /* ---- super admin ---- */
  ['admin.counts',          'GET',    '/api/admin/counts',                      'SUPER_ADMIN', '{students, companies, supervisors}.'],
  ['admin.roster',          'GET',    '/api/admin/trainees',                    'SUPER_ADMIN', 'Every trainee with adviser id.'],
  ['admin.advisers',        'GET',    '/api/admin/advisers',                    'SUPER_ADMIN', 'Advisers with caseload, workload and oldest waiting item.'],
  ['admin.createAdviser',   'POST',   '/api/admin/advisers',                    'SUPER_ADMIN', ''],
  ['admin.updateAdviser',   'PUT',    '/api/admin/advisers/:id',                'SUPER_ADMIN', ''],
  ['admin.resetAdviserPassword','POST','/api/admin/advisers/:id/reset-password','SUPER_ADMIN', 'Returns {temporary_password}.'],
  ['admin.deleteAdviser',   'DELETE', '/api/admin/advisers/:id',                'SUPER_ADMIN', 'Only when the adviser has no trainees.'],
  ['admin.transferCaseload','POST',   '/api/admin/advisers/:id/transfer',       'SUPER_ADMIN', 'Body {to}.'],
  ['admin.assign',          'POST',   '/api/admin/assign',                      'SUPER_ADMIN', 'Body {sids:[…], adviser_id|null}.'],
  ['admin.setHold',         'POST',   '/api/admin/trainees/:sid/hold',          'SUPER_ADMIN', 'Body {hold:boolean}.'],
  ['admin.announcements',   'GET',    '/api/admin/announcements',               'SUPER_ADMIN', 'With "reach" (number of trainees) per item.'],
  ['admin.postAnnouncement','POST',   '/api/admin/announcements',               'SUPER_ADMIN', 'Body {title,message,audience,priority,expires}. audience = "ALL" or an adviser id.'],
  ['admin.toggleAnnouncement','POST', '/api/admin/announcements/:id/toggle',    'SUPER_ADMIN', ''],
  ['admin.removeAnnouncement','DELETE','/api/admin/announcements/:id',          'SUPER_ADMIN', ''],
  ['admin.settings',        'GET',    '/api/admin/settings',                    'SUPER_ADMIN', 'Program + approval policy.'],
  ['admin.applyRadius',     'PUT',    '/api/admin/settings/geofence',           'SUPER_ADMIN', 'Body {radius}. Applied to all companies.'],
  ['admin.saveApprovalPolicy','PUT',  '/api/admin/settings/approval',           'SUPER_ADMIN', 'Body {auto_approve, face_required, face_threshold, escalate_days, min_shift_hours, max_shift_hours, face_repeat_after, break_min, grace_min}.'],
  ['dtr.get',             'GET',   '/api/dtr', 'EDUC_INTERN,ADVISER,SUPERVISOR,SUPER_ADMIN', 'Query {from,to,sid?}. Auto-generated DTR: one row per day (present/absent/rest/holiday) with late, undertime, overtime, hours, certification. Students get their own.'],
  ['dtr.summary',         'GET',   '/api/dtr/summary', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Query {from,to}. One DTR totals row per trainee in scope (for certification).'],
  ['dtr.certify',         'POST',  '/api/dtr/certify', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Body {sid,from,to,note?}. Supervisor certifies the DTR (adviser/admin only when the company has no supervisor). Refused while records are pending.'],
  ['dtr.certifyMany',     'POST',  '/api/dtr/certify-many', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Body {sids[],from,to}. Returns {certified, skipped[]}.'],
  ['dtr.reopen',          'POST',  '/api/dtr/reopen', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Body {sid,from,to}. Removes a certification.'],
  ['staff.updateSchedule', 'PUT',   '/api/staff/trainees/:sid/schedule', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Body {sid,days[0-6],start,end,break_min}. Edit one trainee\'s schedule.'],
  ['student.requestSchedule', 'POST',  '/api/student/schedule-request', 'EDUC_INTERN', 'Body {days[],start,end,break_min,reason}. Asks supervisor to approve a schedule change.'],
  ['staff.scheduleRequests', 'GET',   '/api/staff/schedule-requests', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Pending schedule requests in scope.'],
  ['staff.decideSchedule', 'POST',  '/api/staff/schedule-requests/:id', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Body {id,approve,note?}.'],
  ['student.accomplishments', 'GET',   '/api/student/accomplishments', 'EDUC_INTERN', 'Own accomplishments with evidence photos.'],
  ['student.saveAccomplishment', 'POST',  '/api/student/accomplishments', 'EDUC_INTERN', 'Body {id?,date,title,description,hours,evidence[{name,type,data}] (1-4 photos, required)}.'],
  ['student.deleteAccomplishment', 'DELETE', '/api/student/accomplishments/:id', 'EDUC_INTERN', 'Only while not verified.'],
  ['staff.accomplishments', 'GET',   '/api/staff/accomplishments', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Query {sid?,status?}. Accomplishments in scope, SUBMITTED first.'],
  ['staff.verifyAccomplishment', 'POST',  '/api/staff/accomplishments/:id/verify', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'Body {id,ok,feedback?}. Feedback required when ok=false.'],
  ['staff.reassignCompany', 'POST',  '/api/staff/trainees/:sid/reassign', 'ADVISER,SUPER_ADMIN', 'Body {sid,company_id,reason,effective_date?}. Writes placement history; returns {warnings[]} (no contract / over slots).'],
  ['staff.remindFace',    'POST',  '/api/staff/face-reminders', 'ADVISER,SUPER_ADMIN', 'Body {sids?[]}. Notifies trainees without Face ID.'],
  ['supervisor.trace',    'GET',   '/api/supervisor/trace', 'SUPERVISOR,ADVISER,SUPER_ADMIN', 'Where each trainee is: on duty / not in / done, last location & distance from site, last 10 records.'],
  ['admin.users',         'GET',   '/api/admin/users', 'SUPER_ADMIN', 'Directory of ALL accounts (students, supervisors, faculty, admins) with active / must_change.'],
  ['admin.createAdmin',   'POST',  '/api/admin/admins', 'SUPER_ADMIN', 'Body {first_name,last_name,email,username,password,title?,department?}. Forces password change at first login.'],
  ['admin.setUserActive', 'PUT',   '/api/admin/users/:username/active', 'SUPER_ADMIN', 'Body {username,active}. Disabled accounts cannot sign in.'],
  ['admin.resetUserPassword', 'POST',  '/api/admin/users/:username/reset-password', 'SUPER_ADMIN', 'Returns {temporary_password}; user must change it at next login.'],
  ['staff.importStudents', 'POST',  '/api/staff/import-students', 'ADVISER,SUPER_ADMIN', 'Body {rows[{student_id,first_name,last_name,program?,section?,email?,company?,start_date?,target_hours?}], adviser_id?}. Max 1000. Returns {created[{username,temporary_password}], errors[{row,message}]}.'],
  ['staff.contractFile',  'GET',   '/api/companies/:id/contract-file', 'ADVISER,SUPERVISOR,SUPER_ADMIN', 'The attached signed contract (data URL).'],
  ['admin.saveContract',  'PUT',   '/api/admin/companies/:id/contract', 'SUPER_ADMIN', 'Body {id,is_partner,moa_status,moa_expiry,slots,contract_type,contract_ref,signed_on,contract_notes,contract_file?|null}.'],
  ['admin.renewContract', 'POST',  '/api/admin/companies/:id/renew', 'SUPER_ADMIN', 'Extend the contract by one year.'],
  ['admin.saveProgram',   'PUT',   '/api/admin/settings/program', 'SUPER_ADMIN', 'Body {required_hours,shift_start,shift_end,days[],break_min}. Defaults for NEW trainees only.'],
  ['admin.saveHolidays',  'PUT',   '/api/admin/settings/holidays', 'SUPER_ADMIN', 'Body {holidays[{date,name}]}. Holidays are not counted as absences.'],
  ['admin.audit',           'GET',    '/api/admin/audit',                       'SUPER_ADMIN', 'Audit trail (newest first).'],
];
