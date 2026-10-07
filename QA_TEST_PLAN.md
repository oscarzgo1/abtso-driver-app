# Tachyo QA test plan — 2026-10-01

Status key: ✅ pass · ❌ fail (see Issues) · 🔧 fixed & retested · 📱 phone-only check · ⏳ not yet run

Environment: admin dashboard on localhost:5173 (latest code) and driver web build on localhost:8080, both against production Supabase `imfgzhxdzxkifuncowrl`.

## 0. Static + security baseline
| Check | Status |
|---|---|
| Admin `tsc -b` (0 errors) | ✅ |
| Admin oxlint (0 errors, warnings only) | ✅ |
| Admin production build | ✅ |
| Driver `flutter analyze` (2 info, 0 errors) | ✅ |
| Anon probe of every public table/view | ❌ → 081 🔧, 082 pending approval |
| Anon-callable SECURITY DEFINER functions | ❌ → 083 pending approval |

## 1. Admin — login & account
| Feature | Status |
|---|---|
| Log in, role resolution, suspended-org block | ✅ login/role (suspend ⏳) |
| Remember me | ⏳ |
| Forgot password (neutral message) | ✅ empty-email guard, neutral msg, email delivered, reset link works |
| MFA challenge screen | ❌→🔧 was bypassed (issue 4); fixed + DB enforcement 084 |
| Forced password change (must_change_password) | ✅ set-new-password screen, length + mismatch validation |
| Request access form → edge `request-access` | ⏳ |
| Privacy/Terms modal (4 tabs) | ⏳ |
| Public shared report `?share=` | ⏳ |
| Log out | ✅ |

## 2. Admin — Dispatch Board
| Feature | Status |
|---|---|
| Dashboard KPI tiles + links | ✅ live counts after driver clock-in |
| Numbers/Chart, Daily/Weekly toggles | ⏳ |
| Shipments Activity tabs, search, paging, row → tracking | ⏳ |
| Revenue This Week (payroll only) | ⏳ |
| Live Map: refresh positions, markers, depots, SOS markers | ✅ driver row + marker |
| Telemetry feed: tabs, search, filters, sort, Google Maps link | ⏳ |

## 3. Admin — Alert Monitors
| Feature | Status |
|---|---|
| Mute/unmute alarm | ✅ (not persisted across reload) |
| Clear alerts | ✅ |
| Category dropdown (all categories) | ⏳ |
| SOS card: open in maps / acknowledge / dismiss | ✅ realtime arrival, ack, clear |
| Idle card (idle detection on/off) | ✅ ack/dismiss; ❌ false alert after ~10 pings (issue 19) |
| Fuel receipts queue → Fuel Audit modal (filters, photos, GPS compare, approve/reject, capacity) | ⏳ |
| Parking claims → modal (assign shift, approve adds extras, reject) | ⏳ |
| Walk-around issues → history | ✅ missing-check; ❌→🔧 defects never alerted (issue 20) |
| PIN reset → issue activation code | ⏳ |
| Unroadworthy sign-off → mark reviewed | ✅ |
| Holiday approve/decline/view calendar | ⏳ |
| Access requests (platform owner) | ⏳ |

## 4. Admin — Driver Profiles
| Feature | Status |
|---|---|
| Employee Database list, profession popover | ✅ list |
| Export Drivers CSV | ⏳ |
| Add Employee → activation code modal | ✅ username auto-generated, code issued |
| Import Data (bulk activation codes): sample, preview, import, download codes, printable list | ⏳ |
| Edit employee (profile + compensation + PIN) | ⏳ |
| Clock In (depot select) / Clock Out | ⏳ |
| Assign load (active shift) | ⏳ |
| Reset PIN, Deactivate/Activate, Remove | ⏳ |
| Compensation Summary: flags, N/O filter, agency/driver/date filters | ⏳ |
| Detailed/Weekly views, Export Summary, Fill Excel Template, Export CSV/Excel | ⏳ |
| Bulk edit, Force clock out, Edit time, Payroll drawer save & approve | ⏳ |
| Employee Holidays: month nav, add, approve/decline, remove | ⏳ |

## 5. Admin — Shipments (payroll + loads_pod)
| Feature | Status |
|---|---|
| Assign Load modal: import load file, assign, status tabs, cancel, photos | ⏳ |
| Import Carrier Load Files (Amazon Relay, variant headers, universal) | ⏳ |
| Live Tracking: search, filter, expand, POD lightbox | ⏳ |
| Delivery History: filters, POD inspector | ⏳ |

## 6. Admin — Compliance & Safety
| Feature | Status |
|---|---|
| Overview: readiness, filter pills, Report Defect | ⏳ |
| Defect drawer: under inspection / rectified / set VOR | ⏳ |
| Defect Registry: search, filters, paging | ⏳ |
| Fleet Roadworthiness: add asset (manual + CSV), road-legal dates, notifications | ✅ manual, CSV (valid+invalid rows), statuses, bell; Mark Scheduled ❌→🔧 (issue 7) |
| Driver Hours & WTD: cockpit, timesheet, KPI filters, week nav | ⏳ |
| Walk-Around Checks: filters, photos, signatures | ⏳ |

## 7. Admin — Analytics
| Feature | Status |
|---|---|
| Period/driver/agency/depot/carrier filters | ⏳ |
| KPI chart, True Profit, VAT toggle | ⏳ |
| Costs & targets ledger (add/edit/delete, targets) | ⏳ |
| Breakdowns: sort, scorecards/league table | ⏳ |
| Excel + PDF report export | ⏳ |
| Share link create/copy/revoke + open public link | ⏳ |
| Weekly email settings | ⏳ |

## 8. Admin — Accounts (platform owner)
| Feature | Status |
|---|---|
| Interest buyers: stage, notes | ⏳ |
| New account (create → credentials) | ✅ validation, org+admin created, invite link fallback |
| Plan change, Manage access (feature overrides, limits) | ⏳ |
| Suspend / reactivate | ⏳ |
| Permanent delete (test org only) | ⏳ |

## 9. Admin — Settings
| Feature | Status |
|---|---|
| Company: driver code, support numbers | ✅ |
| Your plan: usage vs limits | ✅ |
| Access codes: create staff account, rotate codes | ✅ (codes hashed) — note: codes unused by any flow |
| Depots: add (incl. current location), delete | ✅ add/remove/confirm; current-location denied in pane (graceful) 📱 |
| Alerts: audio, night-out toggle, idle detection, thresholds | ❌→🔧 Night Out toggle never saved (issue 5); thresholds ✅ |
| Fuel bonus | ✅ saves prefs — payout NOT built (by design text) |
| Appearance | ✅ (copy fixed: no dark mode) |
| Security: MFA enrol/remove, activity log | ✅ enrol (QR layout 🔧 issue 6); remove ⏳ |
| Legal links | ✅ all 5 return 200 |

## 10. Role gating
| Feature | Status |
|---|---|
| Logistics user: no Rates/Shipments/payroll settings | ⏳ |
| Plan-locked features show LockedFeature | ⏳ |
| Employee/depot plan limits enforced server-side | ⏳ |
| Cross-tenant isolation (second test org cannot see first) | ⏳ |

## 11. Driver app
| Feature | Status |
|---|---|
| Login: company code + ID + PIN, terms gate, remember session | ✅ (terms not stored ❌→🔧 issue 16) |
| Wrong PIN counter + lockout | ❌→🔧 never counted (issue 14); RPC verified locally |
| Activation code flow (verify → set PIN) | ✅ wrong code + easy PIN rejected |
| Forgot PIN → admin alert | ⏳ |
| Greeting cinematic | ✅ |
| Home: map, depots, location status | ✅ geofence status; depot pin/position dot not drawn in pane 📱 |
| Clock in (couple vehicle, walk-around or skip) | ✅ with GPS stub (start via walk-around); real GPS 📱 |
| Clock out (end-of-shift inspection) | 📱 |
| SOS → admin alert | ✅ |
| Walk-around check (draft, submit, photos, defects) | ✅ submit/photos/defects; draft resume ❌→🔧 (issue 17) |
| Roadworthiness sign-off (VOR / expired MOT vehicle) | ✅ signature saved → admin alert |
| Assigned units (couple/decouple) | ⏳ |
| Report incident (photos, vehicle) | ⏳ |
| Attach load / confirm delivery (POD) | ⏳ |
| Dispatch: assigned banner → accept → finish | ⏳ |
| Load history + POD thumbnails | ⏳ |
| Fuel & AdBlue log (validation) | ⏳ |
| Overnight parking claim | ⏳ |
| Night-out request ↔ admin approve | ⏳ |
| Holidays: request, cancel, admin decision live | ⏳ |
| History tab: date range, rings, DVSA card, Hours view | ⏳ |
| PDF earnings export | ⏳ |
| Settings: change PIN, support numbers, legal docs, log out | ⏳ |
| Background GPS, notifications, camera, anti-spoofing | 📱 |

## Issues
| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | Critical | `user_roles` RLS disabled; anon could read/insert/update/delete all roles | 🔧 fixed (081), verified anon now 401 |
| 2 | High | `gps_locations` readable by any authenticated user across tenants; anon insert; `live_driver_locations` view leaks to anon | migration 082 written, awaiting approval |
| 3 | High | Anon-callable `verify_driver_pin` (PIN oracle without lockout), `create_driver_profile`, `record_audit` etc. | migration 083 written, awaiting approval |
| 4 | Critical | MFA not enforced: auth listener treated password-only (AAL1) session as signed in → dashboard opened without code; DB also accepted AAL1 tokens | 🔧 UI fixed (App.tsx auth listener) + migration 084 (RLS requires AAL2 when a factor exists) — verified locally; 084 needs prod approval |
| 5 | High | Settings → Alerts "Allow Drivers to Request Night Out" switch never saves (payload missing walkaround/load-reminder fields → 400) and fails silently | 🔧 fixed + error toast on both switches; verified |
| 6 | Low | MFA enrol QR shows stray "data:image/svg+xml;utf-8," text | 🔧 render as <img>; verified |
| 7 | Low | Fleet "Mark Scheduled" overwrote asset notes, no feedback | 🔧 appends + "Scheduled ✓"; verified |
| 8 | Medium | Expired/used invite link lands on login with no explanation (new admin has no password) | open |
| 9 | Info | README claims self-service signup with registration codes — signup is owner-provisioned; codes unused | doc |
| 10 | Info | Fuel Bonus payout not built (settings only) | do not demo as working |
| 11 | Low | Fleet list counts each inspection row as an asset ("5 of 5" for 4 vehicles) | open |
| 12 | Low | Page reload always returns to Dashboard (no URL routing) | open |
| 13 | Medium | Dashboard polls loadData every 15s (~2,500 requests in 15 min per open tab) | open — perf |
| 14 | High | Driver PIN lockout never triggered: failure lookup ran as anon → RLS hid driver → counter stayed 0 (also driver_id not company-scoped) | 🔧 migration 085 + supabase_service.dart; RPC verified locally (15 tries → 1-min lock + audit). Note: Supabase Auth endpoint itself is not gated by this counter |
| 15 | Medium | Driver asset pickers list the same vehicle once per inspection row (e.g. trailer shown twice) | 🔧 merged per registration (earliest dates, VOR if any) |
| 16 | High (legal) | Driver terms acceptance never stored (no driver UPDATE policy) | 🔧 migration 086 accept_driver_terms() + timestamp; verified |
| 17 | Medium | Walk-around "Save as Draft" could never be resumed (answers lost, timer reset); failed submit still marked done | 🔧 draft restore/update-in-place + failure handling; verified |
| 18 | Critical | Cross-tenant: any company's admin can read/ack/delete other companies' SOS + idle alerts (is_admin() not org-scoped); idle_alerts readable by any user | migration 087 written — local apply blocked by classifier, needs approval |
| 19 | Medium | False idle alerts ~10 pings into a shift (GPS trigger ignores 50-min threshold, message "Idle for over 2 minutes") | 🔧 migration 088 drops trigger (cron path correct); applied locally |
| 20 | High (safety) | Walk-around defects (defects_found) raised no alert and never reached Defect Registry | 🔧 Alert Monitors now lists walk-around defects with driver note; verified |
| 21 | Low | "All Alerts" view says "No Active Alerts" while queue items (walk-around, sign-offs) are waiting | open |
| 22 | Low | Not-roadworthy screen header text dark red on red (unreadable) | open |
| 23 | High | SOS "Dismiss/Clear all" never persisted (sos_alerts had no `cleared` column → PGRST204) | 🔧 migration 089 + App.tsx; verified locally |
| 24 | Medium | New parking claims only appeared after reload (table not in realtime publication) | 🔧 migration 089; verified locally |
| 25 | High | Driver "Change PIN" always failed (pgcrypto not on trigger search_path) | 🔧 migration 090 + changePin order; verified locally |
| 26 | High | Deactivated driver could still sign in, clock in and send GPS | 🔧 migration 091 (auth ban synced to is_active) + "account deactivated" message; existing session now ended on next app launch |
| 27 | High | App launch never re-read the driver profile: lookup by driver code hit the uuid column → 400 → silently used cached profile (stale rates, deactivation missed) | 🔧 supabase_service.dart / auth_provider.dart — rebuilt, browser retest pending |
| 28 | High (cost) | Admin dashboard request loop: `shift_mileages` RPC re-fired ~2,800×/min while open (shifts with <2 GPS pings never cached) | 🔧 App.tsx requested-set; verified 0 repeat calls |
| 29 | Medium | Fuel & parking review modals never opened outside Analytics tab | 🔧 moved out of analytics block; verified |
| 30 | Medium | Night Out toggle wiped walk-around/load-reminder settings | 🔧 App.tsx; verified |
| 31 | High | Admin MFA not enforced (aal1 session got full access) | 🔧 App.tsx challenge + migration 084 (RLS); verified locally |
| 32 | Medium | Forgot-PIN / activation matched driver_id across companies | 🔧 driver-activate edge function; verified locally |
| 33 | Medium | New dispatch load only appeared after app restart (realtime channel torn down on profile update) | 🔧 dispatch_provider.dart; banner retest pending |
| 34 | Low | Analytics Overview "Payroll £0 · 0m logged" while True Profit shows wages (tiles count rated shifts only) | 🔧 wording now "on rated shifts" |
| 35 | Medium | Weekly email summary: settings save, but nothing schedules `analytics-report` weekly (no cron job in repo or prod snapshot); needs RESEND_API_KEY + CRON_SECRET | open — do not demo as working |
| 36 | Info | `trial-expiry-sweep` cron (migration 037) absent from prod snapshot — trials never auto-expire. May be intentional (job purges data) | owner decision |

## Session 2 — additional verified features (local stack)

- Defect drawer: Mark Under Inspection, Set VOR (vehicle grounded, severity → Critical), Mark Rectified (vehicle ungrounded) — PASS
- Defect Registry: list, status/category filters, registration search, empty state — PASS
- Walk-Around Checks history: per-employee summary, missed checks, expanded check with defect note + 9 photos, employee/date filters — PASS
- Driver Hours & WTD page renders (no active shift at test time — counters need a live shift retest)
- Analytics: True Profit, VAT toggle, scorecards render; Share link create → public `?share=` view without login → Revoke → "Report unavailable" — PASS
- Weekly email settings: invalid address rejected, valid saved — PASS (sending not wired, see #35)
- Not yet clicked: Excel / PDF export (file download), Carrier Settlement import, Accounts (plan change, overrides, suspend, delete), logistics-role login, starter-plan gating, incident report with photos, manual Attach Load, logout flow retest
