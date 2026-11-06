# System study — requirements vs. what was built

| # | Requirement | Gap found in the old version | What was done | Where |
|---|---|---|---|---|
| 1 | Who handles who | Adviser ↔ trainee ↔ supervisor links existed but were never shown together | **Deployment → "Who handles who"**: adviser → company → supervisor → trainees, filterable by section / company | Faculty & Super Admin → Deployment |
| 2 | Company reassignment | Company was a dropdown on the trainee form: no reason, no history, no checks | Dedicated reassignment: reason, effective date, history (`placements`), contract + slot warnings, blocked while clocked in, pending records re-routed, everyone notified | Deployment → Reassign |
| 3 | Contract & partnership | Only a MOA status + expiry | Type, reference no., signed date, expiry, **slots**, notes, signed document, history, renew; slot usage shown | Super Admin → Partners & Contracts |
| 4 | All users have accounts | Super Admin could not see or manage supervisors/students/admins in one place | **Users & Accounts**: every role, search/filter, add administrators, enable/disable, reset (random temporary password + forced change) | Super Admin → Users |
| 5 | Lists of all students, users, etc. | Lists scattered per portal | Users directory, All Trainees, Deployment board, DTR summary — all with section filter and CSV export; **CSV import** for hundreds of students | Users, Trainees |
| 6 | See that they are deployed | No deployment concept | Computed status: Deployed / Starts soon / Awaiting contract / No company / On hold / Completed — shown to the trainee, adviser and admin | Dashboard chips, OJT Details, Deployment |
| 7 | Face recognition set-up & security | Student could delete / re-enrol their own Face ID (lets someone swap in another face) | Student cannot delete or re-enrol; only staff reset. Repeated mismatches raise a security alert; advisers can remind trainees without Face ID; server re-checks everything | OJT Details, Trainees |
| 8 | Shifting based on DTR | Hours were a flat 8 h assumption | Hours computed from each trainee's own schedule (days, start, end, break, overnight shifts) | `mock-rules.js` |
| 9 | Auto DTR | DTR was a print of the log list | DTR is generated per day from attendance + schedule + holidays (present / absent / rest / holiday) | DTR pages |
| 10 | Overtime / undertime | Not tracked | Late, undertime and overtime with a 15-min grace; overtime counted **only** when a supervisor approves ("Approve + OT") | DTR, approval cards |
| 11 | Supervisors, faculty, admins can see DTR | Only per-trainee modal | DTR page in all four portals, scoped by role | DTR |
| 12 | Supervisor traces students | Not available | **Trace Trainees**: on duty / not in / done, last location and distance, plot of clock-in points, last 10 records | Supervisor → Trace |
| 13 | Supervisor approves DTR | Supervisor approved single shifts only | Period **certification** (single or many at once); blocked while records are pending; printed on the DTR | DTR |
| 14 | Editable student schedule | Free-text, applied to everyone at once | Per-trainee editor (days, times, break, presets); students request a change, supervisor approves | Trainee detail, OJT Details |
| 15 | Narrative & accomplishments with evidence | Narrative had attachments only | **Accomplishments** need 1–4 photos, supervisor verifies / sends back; can be attached to narrative reports | Accomplishments |
| 16 | Printable; soft-copy narrative | Basic DTR print | Print DTR (with totals & signatures) and print narrative reports with accomplishments + evidence + attached soft copy | Print buttons |

## Removed as unnecessary (and why)
- **Spot-check / "dispute"** — with certification and Face ID alerts it only added work for supervisors.
- **Backup / restore / reset demo** — belongs to the database layer, not the app UI.
- **"Apply schedule to all trainees"** — dangerous at scale; replaced by defaults for new trainees + per-trainee edits.
- **Student Face ID delete / re-enrol** — security hole (see #7).
- **Log History page** — replaced by the DTR.
- **Super Admin "Company Supervisors" page** — duplicated Users & Accounts.
- **Old MOA-only endpoints** — replaced by the contract endpoints.

## Scalability notes
Approval by exception (clean records auto-approve), period certification instead of per-day sign-off, CSV import, section filters everywhere, nightly escalation job. See `BACKEND_GUIDE.md`.

## Known limits (prototype)
Data lives in the browser; passwords are plain text in the mock; photos/contracts are base64 in the mock (use object storage on a real server); the forced password dialog can only be truly enforced by the server.
