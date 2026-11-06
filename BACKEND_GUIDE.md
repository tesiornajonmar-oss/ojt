# OJT-ERAMS — Backend & Database Guide

This front end is finished and **talks to the server only through `API.<group>.<method>()`**. The demo data lives in `js/mock/` (browser-only). To go live you build a server that implements the 102 endpoints below, then:

1. In `js/config.js` set `USE_MOCK: false` and `API_BASE` to your server (default `/api`).
2. **Delete the `js/mock/` folder.** Nothing else imports it (`js/boot.js` only loads it when `USE_MOCK` is true).
3. Delete the demo-only bits: the `data-demo` blocks on the four `login.html` pages (they remove themselves when `USE_MOCK` is false, but delete the markup anyway), (the demo backup / reset tools were already removed from the UI).
4. `js/api-contract.js` is the contract: `[name, METHOD, path, roles, description]`. `js/http-api.js` already turns every row into a `fetch()` call, so you do **not** edit page code.

Suggested stack: Node.js + Express (or NestJS) + PostgreSQL/MySQL, or Supabase/Firebase if you prefer managed. Any stack works.

## HTTP rules the front end expects

- JSON in / JSON out. Success = `200` + JSON. Failure = `4xx` + `{"error":"Readable message"}` (the message is shown to the user as-is).
- `401` = not signed in → the page goes to the login screen. `403` = wrong role.
- Auth: `POST /api/auth/login` returns `{token, user}`; the front end sends `Authorization: Bearer <token>`. Prefer short-lived JWT or server sessions; hash passwords with **bcrypt/argon2** (the demo stores plain text — never copy that).
- `":x"` in a path is filled from the call's argument `x`. For `GET`, other arguments are the query string; for other methods they are the JSON body.
- **Every endpoint must check the role and the ownership on the server** (a student may only see own data; an adviser only own caseload; a supervisor only trainees placed in their company; super admin everything). Never trust the page to hide buttons.

## Features that need extra care on a real server

- **Forgot password** (`auth.forgotPassword`, public): never reveal whether the username exists; always return the same message. Recommended: e-mail a single-use reset link valid ~30 minutes (store only a hash of the token), or — as the demo does — notify the adviser/administrator who then use the existing `reset-password` endpoints. Rate-limit by IP and username.
- **Narrative attachments** (`student.saveReport` → `attachments:[{name,type,data}]`): the demo sends base64 data URLs. On a real server accept multipart upload instead, store files in object storage, allow only JPG/PNG/WebP/PDF (check the real file signature, not just the name), limit size (e.g. 10 MB) and count (3), scan for malware, and return `{name,type,url}` where `url` is a short-lived signed link. The pages already read `url` first and `data` second.
- **Messages**: a conversation has participants; it may optionally be about one trainee. Faculty may only message the supervisors of their own trainees' companies, supervisors only the advisers of their own trainees (`messages.contacts`); the server must enforce this in `messages.start`.
- **Sections**: `users.section` (e.g. "BSIT 4A") is used for filtering in the faculty, supervisor and super-admin trainee lists.
- **Profile**: `auth.updateProfile` may change only e-mail and phone.

## Roles

| Role | Portal | Folder |
|---|---|---|
| `EDUC_INTERN` (student) | `/` | project root |
| `ADVISER` (faculty) | `/admin/` | `admin/` |
| `SUPERVISOR` (company) | `/supervisor/` | `supervisor/` |
| `SUPER_ADMIN` | `/superadmin/` | `superadmin/` |

## Endpoints

### auth

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.auth.login` | `POST /api/auth/login` | public | Body {portal, username, password}. portal = student / faculty / supervisor / superadmin. Returns {token, user}. |
| `API.auth.logout` | `POST /api/auth/logout` | any | Invalidate the token. |
| `API.auth.me` | `GET /api/auth/me` | any | Profile of the signed-in user + sidebar badges {approvals, messages}. |
| `API.auth.changePassword` | `POST /api/auth/change-password` | any | Body {old_password, new_password}. |
| `API.auth.updateProfile` | `PUT /api/auth/profile` | any | Body {email, phone}. Update own contact details. |
| `API.auth.forgotPassword` | `POST /api/auth/forgot-password` | public | Body {portal, username}. Always answers {ok, message} and never reveals whether the account exists. Real backend: e-mail a one-time reset link (valid ~30 min) or notify the staff who can reset it. |
| `API.auth.setTheme` | `PUT /api/auth/theme` | any | Body {theme: "light"/"dark"}. |

### notifications

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.notifications.list` | `GET /api/notifications` | any | Returns {items:[{id,text,link,at,read}], unread}. |
| `API.notifications.markRead` | `POST /api/notifications/read` | any | Body {id?}. No id = mark all read. |

### messages

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.messages.contacts` | `GET /api/messages/contacts` | ADVISER,SUPER_ADMIN,SUPERVISOR | People the caller may message: faculty see the supervisors of their trainees, supervisors see the advisers of their trainees, super admin sees everyone. |
| `API.messages.trainees` | `GET /api/messages/trainees` | ADVISER,SUPER_ADMIN,SUPERVISOR | Trainees the caller may start a conversation about. |
| `API.messages.threads` | `GET /api/messages/threads` | ADVISER,SUPER_ADMIN,SUPERVISOR | Conversation list (one thread is about one trainee). |
| `API.messages.get` | `GET /api/messages/threads/:id` | ADVISER,SUPER_ADMIN,SUPERVISOR | Thread + messages. Marks the thread read for the caller. |
| `API.messages.start` | `POST /api/messages/threads` | ADVISER,SUPER_ADMIN,SUPERVISOR | Body {to?, student_id?, subject, body}. `to` = contact uid; `student_id` optional = the conversation is about that trainee (if no `to`, everyone responsible for the trainee is added). Notifies the other participants. |
| `API.messages.send` | `POST /api/messages/threads/:id/messages` | ADVISER,SUPER_ADMIN,SUPERVISOR | Body {body}. |

### student

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.student.dashboard` | `GET /api/student/dashboard` | EDUC_INTERN | Hours, active/today shift, recent feed, announcements, Face ID state, policy flags. |
| `API.student.placement` | `GET /api/student/placement` | EDUC_INTERN | Company, schedule, adviser(s) and company supervisor(s). |
| `API.student.shifts` | `GET /api/student/shifts` | EDUC_INTERN | Own attendance history (no photos). |
| `API.student.clockIn` | `POST /api/student/attendance/clock-in` | EDUC_INTERN | Body {coords:{lat,lng}/null, photo:dataURL/null, face:{descriptor,liveness}/null}. Server decides GPS + face status. |
| `API.student.clockOut` | `POST /api/student/attendance/clock-out` | EDUC_INTERN | Body {photo, face}. Server computes hours, runs the approval rules, returns {shift, outcome, flags}. |
| `API.student.reports` | `GET /api/student/reports` | EDUC_INTERN | Own narrative reports. |
| `API.student.saveReport` | `POST /api/student/reports` | EDUC_INTERN | Body {id?, title, body, date, attachments?, accomplishment_ids?, submit}. |
| `API.student.deleteReport` | `DELETE /api/student/reports/:id` | EDUC_INTERN | Only drafts. |
| `API.student.faceStatus` | `GET /api/student/face` | EDUC_INTERN | {enrolled, enrolled_at, shots}. |
| `API.student.enrollFace` | `POST /api/student/face` | EDUC_INTERN | Body {descriptors:[[128 numbers]…], photo, consent:true}. Biometric data — see BACKEND_GUIDE.md. |
| `API.student.requestSchedule` | `POST /api/student/schedule-request` | EDUC_INTERN | Body {days[],start,end,break_min,reason}. Asks supervisor to approve a schedule change. |
| `API.student.accomplishments` | `GET /api/student/accomplishments` | EDUC_INTERN | Own accomplishments with evidence photos. |
| `API.student.saveAccomplishment` | `POST /api/student/accomplishments` | EDUC_INTERN | Body {id?,date,title,description,hours,evidence[{name,type,data}] (1-4 photos, required)}. |
| `API.student.deleteAccomplishment` | `DELETE /api/student/accomplishments/:id` | EDUC_INTERN | Only while not verified. |

### supervisor

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.supervisor.dashboard` | `GET /api/supervisor/dashboard` | SUPERVISOR | Counts, trainees on duty today, oldest waiting items. |
| `API.supervisor.trainees` | `GET /api/supervisor/trainees` | SUPERVISOR | Trainees placed at the supervisor's company, with progress + today's state. |
| `API.supervisor.trainee` | `GET /api/supervisor/trainees/:sid` | SUPERVISOR | Summary, attendance (no photos), reports (read-only), evaluation. |
| `API.supervisor.queue` | `GET /api/supervisor/attendance/queue` | SUPERVISOR | Returns {pending:[…risk-sorted, with photos], spot:[…], total}. |
| `API.supervisor.approveShift` | `POST /api/supervisor/attendance/:id/approve` | SUPERVISOR | Body {hours?}. |
| `API.supervisor.rejectShift` | `POST /api/supervisor/attendance/:id/reject` | SUPERVISOR | Body {note}. |
| `API.supervisor.escalateShift` | `POST /api/supervisor/attendance/:id/escalate` | SUPERVISOR | Body {note}. Sends the item to the trainee's faculty adviser. |
| `API.supervisor.bulkApprove` | `POST /api/supervisor/attendance/bulk-approve` | SUPERVISOR | Body {ids:[…]}. HIGH-risk items are always skipped. Returns {approved, skipped}. |
| `API.supervisor.evaluations` | `GET /api/supervisor/evaluations` | SUPERVISOR | Each trainee with evaluation status. |
| `API.supervisor.saveEvaluation` | `PUT /api/supervisor/evaluations/:sid` | SUPERVISOR | Body {ratings:{…1-5}, comments, recommend:"YES"/"NO", submit}. |
| `API.supervisor.trace` | `GET /api/supervisor/trace` | SUPERVISOR,ADVISER,SUPER_ADMIN | Where each trainee is: on duty / not in / done, last location & distance from site, last 10 records. |

### faculty

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.faculty.dashboard` | `GET /api/faculty/dashboard` | ADVISER,SUPER_ADMIN | Counts + oldest waiting items + flagged trainees. |
| `API.faculty.roster` | `GET /api/faculty/trainees` | ADVISER,SUPER_ADMIN | Trainee summaries in scope. |
| `API.faculty.trainee` | `GET /api/faculty/trainees/:sid` | ADVISER,SUPER_ADMIN | Summary, attendance (no photos), reports (with accomplishments), accomplishments, evaluation, face state, supervisors, placement history, pending schedule request. |
| `API.faculty.queue` | `GET /api/faculty/queue` | ADVISER,SUPER_ADMIN | {needsYou:[…], awaitingSupervisor:[…], reports:[…], total}. Slips are risk-sorted and include photos. |
| `API.faculty.approveShift` | `POST /api/faculty/attendance/:id/approve` | ADVISER,SUPER_ADMIN | Body {hours?}. |
| `API.faculty.rejectShift` | `POST /api/faculty/attendance/:id/reject` | ADVISER,SUPER_ADMIN | Body {note}. |
| `API.faculty.bulkApprove` | `POST /api/faculty/attendance/bulk-approve` | ADVISER,SUPER_ADMIN | Body {ids}. HIGH-risk skipped. Returns {approved, skipped}. |
| `API.faculty.approveReport` | `POST /api/faculty/reports/:id/approve` | ADVISER,SUPER_ADMIN |  |
| `API.faculty.reviseReport` | `POST /api/faculty/reports/:id/revise` | ADVISER,SUPER_ADMIN | Body {feedback}. |
| `API.faculty.updateTrainee` | `PUT /api/faculty/trainees/:sid` | ADVISER,SUPER_ADMIN | Body {user:{…}, ojt:{target_hours,start_date,end_date,status}}. Company and schedule have their own endpoints. |
| `API.faculty.addTrainee` | `POST /api/faculty/trainees` | ADVISER,SUPER_ADMIN | Body {first_name,last_name,student_id,program,username,password,email,company_id,target_hours,start_date}. |

### staff

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.staff.shiftPhotos` | `GET /api/staff/attendance/:id/photos` | ADVISER,SUPER_ADMIN,SUPERVISOR | Clock-in / clock-out photos and face results of one shift. |
| `API.staff.resetTraineePassword` | `POST /api/staff/trainees/:sid/reset-password` | ADVISER,SUPER_ADMIN | Returns {temporary_password}. |
| `API.staff.resetFace` | `DELETE /api/staff/trainees/:sid/face` | ADVISER,SUPER_ADMIN | Remove a trainee's enrolled face so they can enroll again. |
| `API.staff.companies` | `GET /api/staff/companies` | ADVISER,SUPER_ADMIN | Companies with MOA state, trainee count and their supervisors. |
| `API.staff.createCompany` | `POST /api/staff/companies` | ADVISER,SUPER_ADMIN |  |
| `API.staff.updateCompany` | `PUT /api/staff/companies/:id` | ADVISER,SUPER_ADMIN | Name, address, GPS, geofence, contact. (MOA is Super Admin only.) |
| `API.staff.supervisors` | `GET /api/staff/supervisors` | ADVISER,SUPER_ADMIN | Company supervisor accounts with workload. |
| `API.staff.createSupervisor` | `POST /api/staff/supervisors` | ADVISER,SUPER_ADMIN | Body {first_name,last_name,email,phone,position,company_id,username,password}. |
| `API.staff.updateSupervisor` | `PUT /api/staff/supervisors/:supervisor_id` | ADVISER,SUPER_ADMIN |  |
| `API.staff.resetSupervisorPassword` | `POST /api/staff/supervisors/:supervisor_id/reset-password` | ADVISER,SUPER_ADMIN | Returns {temporary_password}. |
| `API.staff.deleteSupervisor` | `DELETE /api/staff/supervisors/:supervisor_id` | ADVISER,SUPER_ADMIN |  |
| `API.staff.updateSchedule` | `PUT /api/staff/trainees/:sid/schedule` | ADVISER,SUPERVISOR,SUPER_ADMIN | Body {sid,days[0-6],start,end,break_min}. Edit one trainee's schedule. |
| `API.staff.scheduleRequests` | `GET /api/staff/schedule-requests` | ADVISER,SUPERVISOR,SUPER_ADMIN | Pending schedule requests in scope. |
| `API.staff.decideSchedule` | `POST /api/staff/schedule-requests/:id` | ADVISER,SUPERVISOR,SUPER_ADMIN | Body {id,approve,note?}. |
| `API.staff.accomplishments` | `GET /api/staff/accomplishments` | ADVISER,SUPERVISOR,SUPER_ADMIN | Query {sid?,status?}. Accomplishments in scope, SUBMITTED first. |
| `API.staff.verifyAccomplishment` | `POST /api/staff/accomplishments/:id/verify` | ADVISER,SUPERVISOR,SUPER_ADMIN | Body {id,ok,feedback?}. Feedback required when ok=false. |
| `API.staff.reassignCompany` | `POST /api/staff/trainees/:sid/reassign` | ADVISER,SUPER_ADMIN | Body {sid,company_id,reason,effective_date?}. Writes placement history; returns {warnings[]} (no contract / over slots). |
| `API.staff.remindFace` | `POST /api/staff/face-reminders` | ADVISER,SUPER_ADMIN | Body {sids?[]}. Notifies trainees without Face ID. |
| `API.staff.importStudents` | `POST /api/staff/import-students` | ADVISER,SUPER_ADMIN | Body {rows[{student_id,first_name,last_name,program?,section?,email?,company?,start_date?,target_hours?}], adviser_id?}. Max 1000. Returns {created[{username,temporary_password}], errors[{row,message}]}. |
| `API.staff.contractFile` | `GET /api/companies/:id/contract-file` | ADVISER,SUPERVISOR,SUPER_ADMIN | The attached signed contract (data URL). |

### admin

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.admin.counts` | `GET /api/admin/counts` | SUPER_ADMIN | {students, companies, supervisors}. |
| `API.admin.roster` | `GET /api/admin/trainees` | SUPER_ADMIN | Every trainee with adviser id. |
| `API.admin.advisers` | `GET /api/admin/advisers` | SUPER_ADMIN | Advisers with caseload, workload and oldest waiting item. |
| `API.admin.createAdviser` | `POST /api/admin/advisers` | SUPER_ADMIN |  |
| `API.admin.updateAdviser` | `PUT /api/admin/advisers/:id` | SUPER_ADMIN |  |
| `API.admin.resetAdviserPassword` | `POST /api/admin/advisers/:id/reset-password` | SUPER_ADMIN | Returns {temporary_password}. |
| `API.admin.deleteAdviser` | `DELETE /api/admin/advisers/:id` | SUPER_ADMIN | Only when the adviser has no trainees. |
| `API.admin.transferCaseload` | `POST /api/admin/advisers/:id/transfer` | SUPER_ADMIN | Body {to}. |
| `API.admin.assign` | `POST /api/admin/assign` | SUPER_ADMIN | Body {sids:[…], adviser_id/null}. |
| `API.admin.setHold` | `POST /api/admin/trainees/:sid/hold` | SUPER_ADMIN | Body {hold:boolean}. |
| `API.admin.announcements` | `GET /api/admin/announcements` | SUPER_ADMIN | With "reach" (number of trainees) per item. |
| `API.admin.postAnnouncement` | `POST /api/admin/announcements` | SUPER_ADMIN | Body {title,message,audience,priority,expires}. audience = "ALL" or an adviser id. |
| `API.admin.toggleAnnouncement` | `POST /api/admin/announcements/:id/toggle` | SUPER_ADMIN |  |
| `API.admin.removeAnnouncement` | `DELETE /api/admin/announcements/:id` | SUPER_ADMIN |  |
| `API.admin.settings` | `GET /api/admin/settings` | SUPER_ADMIN | Program + approval policy. |
| `API.admin.applyRadius` | `PUT /api/admin/settings/geofence` | SUPER_ADMIN | Body {radius}. Applied to all companies. |
| `API.admin.saveApprovalPolicy` | `PUT /api/admin/settings/approval` | SUPER_ADMIN | Body {auto_approve, face_required, face_threshold, escalate_days, min_shift_hours, max_shift_hours, face_repeat_after, break_min, grace_min}. |
| `API.admin.users` | `GET /api/admin/users` | SUPER_ADMIN | Directory of ALL accounts (students, supervisors, faculty, admins) with active / must_change. |
| `API.admin.createAdmin` | `POST /api/admin/admins` | SUPER_ADMIN | Body {first_name,last_name,email,username,password,title?,department?}. Forces password change at first login. |
| `API.admin.setUserActive` | `PUT /api/admin/users/:username/active` | SUPER_ADMIN | Body {username,active}. Disabled accounts cannot sign in. |
| `API.admin.resetUserPassword` | `POST /api/admin/users/:username/reset-password` | SUPER_ADMIN | Returns {temporary_password}; user must change it at next login. |
| `API.admin.saveContract` | `PUT /api/admin/companies/:id/contract` | SUPER_ADMIN | Body {id,is_partner,moa_status,moa_expiry,slots,contract_type,contract_ref,signed_on,contract_notes,contract_file?/null}. |
| `API.admin.renewContract` | `POST /api/admin/companies/:id/renew` | SUPER_ADMIN | Extend the contract by one year. |
| `API.admin.saveProgram` | `PUT /api/admin/settings/program` | SUPER_ADMIN | Body {required_hours,shift_start,shift_end,days[],break_min}. Defaults for NEW trainees only. |
| `API.admin.saveHolidays` | `PUT /api/admin/settings/holidays` | SUPER_ADMIN | Body {holidays[{date,name}]}. Holidays are not counted as absences. |
| `API.admin.audit` | `GET /api/admin/audit` | SUPER_ADMIN | Audit trail (newest first). |

### dtr

| Client call | Method & path | Who | What it does |
|---|---|---|---|
| `API.dtr.get` | `GET /api/dtr` | EDUC_INTERN,ADVISER,SUPERVISOR,SUPER_ADMIN | Query {from,to,sid?}. Auto-generated DTR: one row per day (present/absent/rest/holiday) with late, undertime, overtime, hours, certification. Students get their own. |
| `API.dtr.summary` | `GET /api/dtr/summary` | ADVISER,SUPERVISOR,SUPER_ADMIN | Query {from,to}. One DTR totals row per trainee in scope (for certification). |
| `API.dtr.certify` | `POST /api/dtr/certify` | ADVISER,SUPERVISOR,SUPER_ADMIN | Body {sid,from,to,note?}. Supervisor certifies the DTR (adviser/admin only when the company has no supervisor). Refused while records are pending. |
| `API.dtr.certifyMany` | `POST /api/dtr/certify-many` | ADVISER,SUPERVISOR,SUPER_ADMIN | Body {sids[],from,to}. Returns {certified, skipped[]}. |
| `API.dtr.reopen` | `POST /api/dtr/reopen` | ADVISER,SUPERVISOR,SUPER_ADMIN | Body {sid,from,to}. Removes a certification. |


Exact request/response shapes are the easiest to read from `js/mock/mock-api.js` (each `S['group.name']` function is the reference behaviour) and from the page scripts that call them.

## Attendance approval rules (**must be reproduced on the server**)

When the student clocks out the server builds the record and decides who verifies it — the browser never decides. The pure rules are in **`js/mock/mock-rules.js`** (no database access) — port that file one-to-one, then use `evaluateShift` in `js/mock/mock-api.js` as the reference for the rest.

1. **GPS**: haversine distance to the company. `In-Range` if ≤ `geofence_radius`, else `Manual` (flag `MANUAL_GPS`). Store the clock-out coordinates too (`lat_out`, `lng_out`, `distance_out`) — the supervisor "Trace" page uses them.
2. **Face**: compare the browser's 128-number descriptor with the enrolled ones (Euclidean). `≤ face_threshold` → match. Flags `FACE_LOW`, `FACE_NONE`, `FACE_NOT_ENROLLED`, `NO_LIVENESS`. After `face_repeat_after` consecutive mismatches add `FACE_REPEAT` and notify adviser + supervisor (possible proxy attendance).
3. **Photo**: none → `NO_PHOTO`. **Shift length**: `SHORT_SHIFT` / `LONG_SHIFT`.
4. **Schedule (DTR rules)** — each trainee has days, start, end (overnight allowed), `break_min`; system `grace_min` (default 15):
   - pick the schedule window whose start is nearest the clock-in; `late` = in − start (only if > grace); `undertime` = end − out (only if > grace); arriving within grace counts from the scheduled start.
   - `worked` = out − in − break (break applies only if the span ≥ 5 h). `regular_hours` = overlap with the schedule minus break. `ot_hours` = out − max(end, in) if > grace.
   - Rest day (or arrival after the shift ended): `regular_hours = 0`, everything is overtime and the record is flagged `OFF_SCHEDULE`.
   - **Overtime is never counted automatically.** `computed_hours = regular_hours`; when the supervisor approves with `count_ot` the overtime is added and `ot_status = APPROVED`.
5. **Risk**: `FACE_LOW, NO_LIVENESS, NO_PHOTO, SHORT_SHIFT, LONG_SHIFT, FACE_REPEAT` = HIGH; `OVERTIME`, `OFF_SCHEDULE` and other flags = MEDIUM. `LATE` and `UNDERTIME` are informational (shown on the DTR, never block auto-approval).
6. **Decision**: no blocking flags and `auto_approve` → `APPROVED` (`approval_method = AUTO`). Otherwise `PENDING_VERIFICATION`, `review_level = SUPERVISOR` if the company has a supervisor, else `ADVISER`.
7. **Escalation** after `escalate_days`; supervisor may escalate manually. **Bulk approve** never approves HIGH. Only `APPROVED` hours count.
8. **Reassignment**: pending records still waiting for the old supervisor move to `ADVISER`.

## DTR, certification and accomplishments

- **DTR is generated, not typed.** `dtr.get` builds one row per calendar day in the period from `shifts` + the schedule + holidays: `PRESENT / ABSENT / REST / HOLIDAY / TODAY`. Totals: present, absent, late (count, minutes), undertime, overtime (total / approved), regular and counted hours, pending count. Don't store it — compute it (see `dtrFor` in `mock-api.js`); only the certification is stored.
- **Certification** (`dtr.certify`, `dtr.certifyMany`, `dtr.reopen`): the **company supervisor** certifies a period. Adviser/Super Admin may certify only when the company has no supervisor. Refuse while any record in the period is still pending, or if the period is in the future. Store `{student_id, from, to, certified_by, at, note}`; certified DTRs show on the printout.
- **Who can see the DTR**: the student (own), the supervisor (own company), the adviser (own students), Super Admin (all) — the same scope rule as the rest of the API (`assertScope`).
- **Schedule changes**: staff edit directly (`staff.updateSchedule`); students file a request (`student.requestSchedule`) that the supervisor approves/declines. Validate: ≥1 day, start ≠ end, break 0–180, shift ≤ 16 h. Changing a schedule affects **future** records only (each shift stores a `sched` snapshot).
- **Accomplishments with evidence**: 1–4 JPG/PNG/WebP photos required (≤ ~900 KB each after the browser compresses them). Store in object storage and keep keys. Status `SUBMITTED → VERIFIED | REVISION`; verified items can no longer be edited. Narrative reports reference accomplishments by id (`accomplishment_ids`) and the print view embeds their photos.
- **Deployment status** (computed): `UNASSIGNED` (no company), `AWAITING_CONTRACT` (company has no valid contract), `SCHEDULED` (start date in the future), `DEPLOYED`, `ON_HOLD`, `COMPLETED`.
- **Reassignment** (`staff.reassignCompany`): needs a reason; refuse while the trainee is clocked in; close the open `placements` row and open a new one; warn (not block) if the new company has no valid contract or is over its slots; notify trainee, adviser and both companies' supervisors.
- **Contracts**: type, reference, signed date, expiry, slots, notes, one document (PDF/image). Expired contracts are computed from `moa_expiry` (see `moaEffective`). Keep a history of changes.
- **Accounts**: every person has an account. `admin.users` lists all; disabled accounts (`active=false`) cannot sign in; temporary passwords are random, shown once, and `must_change=true` forces a change at next sign-in (the shell opens a locked "set your password" dialog). `staff.importStudents` creates up to 1000 student accounts from CSV rows and returns the one-time passwords.
- **Trace** (`supervisor.trace`): state (`ON_DUTY / DONE / NOT_IN`), last location + distance, last 10 records. The page polls every 30 s; use WebSockets later if you want live updates.

Run a nightly job for: escalation, contract-expiry flags, closing forgotten clock-ins (mark `LONG_SHIFT`).

## Face verification, security and privacy checklist

- The browser sends only descriptors (128 floats) and a small JPEG — **do not accept uploaded files** on the clock-in endpoints; they must only come from `Camera.capture()`.
- Always compare descriptors **on the server**; ignore any `match`/`liveness` flags the browser claims.
- Store enrolled descriptors in a separate `face_profiles` table, encrypted at rest; delete on request (`staff.resetFace`).
- Face data is sensitive personal information (Philippines **Data Privacy Act, RA 10173**): keep the consent checkbox, record `consented_at`, state the purpose and retention period, restrict access by role, and log every view.
- The blink check reduces photo-of-a-photo spoofing but is not unbeatable. For stronger protection add server-side checks: reject images with no/stale timestamp, rate-limit clock-ins per device/IP, record the user-agent/IP. Face ID can no longer be removed or re-enrolled by the student — only staff (`staff.resetFace`), which prevents someone swapping in a different face after enrolment.
- Serve everything over **HTTPS** (the camera and GPS only work on https or 127.0.0.1).
- Enforce password rules, lock out after repeated failures, set CORS to your own domain only, validate every field length, escape output (the front end already escapes), and keep an audit log.

## What to delete / replace when going live

| Item | Action |
|---|---|
| `js/mock/` | delete |
| `USE_MOCK` in `js/config.js` | `false` |
| `data-demo` demo-account button on the login pages | delete |
| CSV import / contract file / photo evidence (base64 in the mock) | switch to multipart or signed-URL uploads to object storage |
| Plain-text demo passwords | replace with hashed passwords |
| `vendor/face-api/` | keep (needed offline); or host on your CDN and change `FACE` paths in `config.js` |

See `docs/DATA_MODEL.md` for the tables.
