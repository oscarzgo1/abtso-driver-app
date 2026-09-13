# Tachyo

**Fleet dispatch, payroll, and compliance — unified for UK haulage and freight operators.**

Tachyo is a two-part platform built for road transport companies: a web-based **Admin Dispatch Console** for payroll admins and logistics coordinators, and a **Driver App** for the people actually on the road. Both share one Supabase-backed system, so a shift clocked in on a driver's phone is the same shift a dispatcher sees on the live map and the same shift that lands in that week's payroll — no re-entry, no reconciliation between separate tools.

---

## Contents

- [Attributes](#attributes)
- [Benefits](#benefits)
- [Unique Features](#unique-features)
- [Tech Stack](#tech-stack)

---

## Attributes

### Admin Dispatch Console (web)

| Module | What it does |
|---|---|
| **Live Dispatch Board** | Real-time map of every active driver, with a KPI strip (employees logged in, stops over the break threshold, shifts calculated, gross pay calculated) and depot geofencing. |
| **Alert Monitors** | Emergency SOS alerts and automated idle alerts (50+ minute stationary threshold), each with acknowledge/dismiss actions, an audio alarm with mute control, and a direct "open in Maps" link to the driver's location. |
| **Driver Profiles / Employee Database** | Full staff directory covering drivers, mechanics, and logistics personnel, with profession grouping, clock in/out, activate/deactivate, and PIN-based credential generation. |
| **Rates & Agencies / Earnings** | Per-driver and per-agency compensation profiles — hourly or fixed-shift rate types, weekday/Saturday/Sunday differentials, and Night Out allowance tracking — editable directly from the same table used for payroll review. |
| **Profitability & Payroll Analytics** | Revenue vs. driver cost broken down by day, a driver profitability leaderboard (margin %, profit/hour, net profit), depot-to-depot comparison, and CSV/Excel export — filterable by driver, agency, depot, and date range. |
| **Settings & Billing** | Theme (light/dark), alert/audio preferences, and subscription management. |

### Driver App (iOS & Android)

- Simple, company-scoped **Driver ID + PIN** login — no email or password to remember.
- One-tap **shift clock in/out**.
- **Live GPS tracking** with automatic depot geofence detection.
- Built-in **legal & compliance** screen (Contract for Services).

### Platform

- **Multi-tenant from the ground up** — every company that signs up gets its own isolated data space, enforced at the database level (Postgres row-level security), not just hidden in the UI.
- **Two account tiers** — Payroll Admin (full access, including rates and analytics) and Logistics (dispatch-focused, no payroll access).
- **Self-service company registration**, with rotatable, per-company staff registration codes for logistics and payroll roles.
- **Multi-Factor Authentication** on admin login, and driver PINs stored as salted hashes — never in plain text.

---

## Benefits

- **One screen instead of three.** Dispatch, driver cost, and load revenue live in the same interface, so a dispatcher can see whether a route is actually profitable without cross-referencing a separate spreadsheet.
- **Payroll built from the same data as dispatch.** Night Out allowances, weekend differentials, and agency-vs-direct rates are calculated from the actual shift records drivers clocked, not re-typed by hand at week's end.
- **Idle and geofence detection remove the guesswork.** A driver stationary past the threshold, or outside an expected depot boundary, raises itself as an alert — it doesn't wait for someone to notice on a spreadsheet days later.
- **Every company's data stays its own.** Row-level security means one haulage company's drivers, rates, and shift history are never visible to another, even though they run on the same platform.
- **Drivers get a tool built for the cab, not the office.** The driver app is deliberately minimal — clock in, clock out, nothing that needs training.

---

## Unique Features

- **Revenue and cost on the same table.** Most dispatch tools show activity; Tachyo's Compensation Profiles and Detailed View tables show *margin* — load revenue and driver cost side by side, per shift, with net profit computed automatically.
- **Profession-aware employee management.** A single Driver Profiles view splits staff into drivers, mechanics, and logistics — useful for any haulage operator running a mixed fleet team, not just drivers.
- **Threshold-driven alerting, not manual monitoring.** SOS and idle detection run as automated rules against live shift and GPS data, surfaced through one notification bell rather than buried in a report.
- **Depot geofencing tied directly to payroll.** Geofence boundaries aren't just a map overlay — they feed the same idle-detection and Night Out logic that determines what a driver is actually paid.
- **Company self-onboarding.** A new haulage company can register itself, get its own driver company code and staff signup codes, and start dispatching — no manual account provisioning required.

---

## Tech Stack

- **Admin Dashboard:** React 19, TypeScript, Vite, Tailwind CSS
- **Driver App:** Flutter (Dart) — single codebase for iOS and Android
- **Backend:** Supabase — PostgreSQL, Row-Level Security, Realtime subscriptions, Edge Functions
- **Mapping:** Leaflet / MapLibre GL
