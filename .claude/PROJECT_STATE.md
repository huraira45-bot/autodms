# PROJECT_STATE.md — AutoDMS
> Update this file as work progresses. It's the living memory of where we are.
>
> **Architecture bible**: `.claude/SYSTEM_DOCUMENTATION.md` — update it after every feature shipped.
> Add a Change Log entry there whenever anything in the system design, rules, or decisions changes.

---

## Project Overview
**AutoDMS** — a full-stack Dealership Management System for a Pakistan-based auto dealership.

- **Backend**: Node.js + Express + mssql, running on `:5000`
- **Frontend**: React 18 + Vite + React Router, running on `:5173`
- **Database**: SQL Server `temp_db1` on `localhost` (Windows Auth)
- **Auth**: JWT (8h), bcrypt for new passwords, legacy FIS hash detection for old `GLUser` records
- **RBAC**: 22 module keys, stored in `dms_ModulePermissions` per `GroupID`

The system wraps a legacy SQL Server ERP (`temp_db1`, ~433 tables, `addata_`/`gen_`/`data_`/`GL_`/`Invent_` prefixes). New DMS features live in `dms_*` tables and coexist with legacy data without modifying legacy SPs.

---

## Conventions & Rules

### General
- No unnecessary comments — only add when the WHY is non-obvious
- No backwards-compat shims; delete unused code cleanly
- Inline styles preferred in React (existing codebase style) — no new CSS files unless required
- No email field anywhere — username + password only for login

### Backend
- Route order in `server.js` matters: auth/admin/finalize routes registered BEFORE `app.use('/api', authMiddleware)`
- `req.user` shape: `{ userId, userName, groupId, groupTitle, modules: string[] }`
- Never modify legacy SPs — do follow-up UPDATEs after SP calls instead
- Use `new sql.Request(transaction)` for each query inside a loop within a transaction
- Return HTTP 423 for "record is finalized" errors

### Frontend
- All Axios calls use relative paths — baseURL is set in `main.jsx`
- `useAuth()` exposes: `user`, `loading`, `login()`, `logout()`, `hasModule(key)`
- `<ProtectedRoute moduleKey="...">` wraps all protected routes in `App.jsx`
- `<fieldset disabled={isFinalized}>` pattern for read-only finalized forms

### SQL / PowerShell
- Always use PowerShell (not bash) for sqlcmd
- bcrypt hashes contain `$` — use `@'...'@` heredoc in PowerShell, never `@"..."@`
- Split multi-statement DDL into separate sqlcmd calls

---

## Domain Model

### Entities
| Entity | Table | Key Fields |
|--------|-------|------------|
| Job Card | `Addata_JobCardInfo` | `JobCardId`, `JobCardNo`, `JobStatus` (0-4), `IsFinalized`, `CreatedBy`, `CreatedByName` |
| GRN | `data_PurchaseInfo` | `PurchaseID`, `PurchaseVoucherNo`, `IsFinalized`, `CreatedBy`, `CreatedByName` |
| GRTN | `data_PurchaseReturnInfo` | `PurchaseReturnID`, `PurchaseReturnNo`, `IsFinalized`, `CreatedBy`, `CreatedByName` |
| Parts | `InventItems` | `ItemId`, `ItenName` (typo in legacy DB — do not fix), `ItemType='Part'` |
| Parties | `gen_PartiesInfo` | `PartyID`, `PartyName` |
| Users | `GLUser` | `UserID`, `UserName`, `UserPassword`, `GroupID` |
| Roles | `GLUserGroup` | `GroupID`, `GroupTitle` |
| Module Perms | `dms_ModulePermissions` | `GroupID`, `ModuleKey` |
| Unfinalize | `dms_UnfinalizeRequests` | `RequestID`, `EntityType`, `EntityID`, `Status` (PENDING/AM_APPROVED/COMPLETED/REJECTED) |

### Job Card Status Codes
- `0` = Open, `1` = In Progress, `2` = Ready, `3` = Invoiced, `4` = Closed

### Roles (live in DB)
- `GroupID=1` = Admin (all modules)
- Other groups assigned per-module in `dms_ModulePermissions`

### Finalize Workflow (3-party approval)
1. Any user with `finalize` module → clicks Finalize → `IsFinalized=1`
2. Any user → clicks "Request Unfinalize" + reason → `dms_UnfinalizeRequests` row with `Status=PENDING`
3. User with `am_approve` → approves → `Status=AM_APPROVED`
4. User with `admin_unfinalize` → performs unfinalize → `IsFinalized=0`, `Status=COMPLETED`
5. Either AM or Admin can reject at their stage → `Status=REJECTED`

---

## Completed Work

### Phase 1 — Core Backend (earlier sessions)
- Express server + mssql pool (`Software/config/db.js`)
- All 16 route/controller pairs for: employees, parties, branches, departments, designations, items, inventory config, GRN, GRTN, store sale, SSR, accounts, workshop (customers, job cards, parts issue, sublet, labour, settings)
- Legacy SP integration: `sp_SavePurchaseGRN`, `sp_SavePurchaseReturn`, `sp_SaveStoreSale`, `sp_SaveStoreSaleReturn`

### Phase 2 — Frontend SPA (earlier sessions)
- All 28 pages under `Software/frontend/src/pages/`
- React Router v6 routing in `App.jsx`
- Sidebar navigation

### Phase 3 — RBAC + Login (earlier sessions)
- `dms_ModulePermissions` table + seed data
- `GLUser` password: bcrypt new / legacy FIS old — dual-path detection
- JWT auth: `authController`, `authRoutes`, `middleware/auth.js`
- `AuthContext.jsx` — `AuthProvider`, `useAuth()`, `hasModule()`
- `Login.jsx` — username + password only
- `UsersAdmin.jsx` — user CRUD + password reset
- `RolePermissions.jsx` — role management + module checkbox matrix
- `permissionController.js` + `permissionRoutes.js`
- `App.jsx` refactored: `ProtectedRoute`, sidebar visibility per module, `AppShell` login gate

### Phase 4 — Creator Capture + Finalize Workflow (2026-05-11)
- **DB schema** (applied via sqlcmd):
  - `Addata_JobCardInfo`, `data_PurchaseInfo`, `data_PurchaseReturnInfo`: added `IsFinalized BIT`, `FinalizedBy INT`, `FinalizedByName NVARCHAR(100)`, `FinalizedAt DATETIME`, `CreatedBy INT`, `CreatedByName NVARCHAR(100)`
  - `dms_UnfinalizeRequests` table (14 columns) created
  - `dms_ModulePermissions`: seeded `finalize`, `am_approve`, `admin_unfinalize` for GroupID=1
  - Views updated: `vw_WorkshopJobCards`, `vw_PurchaseGRNHeader`, `vw_PurchaseReturnHeader` — added creator/finalize columns
- **Backend**:
  - `config/modules.js` — added 3 workflow module definitions
  - `controllers/finalizeController.js` — entity-map pattern, 6 endpoints: finalize, requestUnfinalize, getRequests, amApprove, reject, adminUnfinalize
  - `routes/finalizeRoutes.js` — all routes behind `authMiddleware`
  - `controllers/workshopController.js` — finalize check (HTTP 423) in saveJobCard UPDATE, saveSublet, issuePartsToJobCard; creator fields in saveJobCard INSERT
  - `controllers/grnController.js` — follow-up UPDATE after SP call to set CreatedBy/CreatedByName
  - `controllers/grtnController.js` — same pattern
  - `server.js` — registered `/api/finalize` route
- **Frontend**:
  - `JobCardForm.jsx` — full rewrite: `<fieldset disabled={isFinalized}>`, Finalize/Request Unfinalize buttons, unfinalize modal, creator display
  - `JobCardList.jsx` — added Created By column, Lock badge for finalized, disabled status dropdown when finalized
  - `GRN.jsx` — full rewrite: added Recent GRNs table (was missing), Creator, Status badge, Finalize/Request Unfinalize actions
  - `GRTN.jsx` — added Creator, Status badge, Finalize/Request Unfinalize, unfinalize modal
  - `UnfinalizeRequests.jsx` — AM section (PENDING), Admin section (AM_APPROVED), History section; Reject modal
  - `App.jsx` — added `UnfinalizeRequests` import, WORKFLOW nav section, `/unfinalize-requests` route

---

### Phase 5 — RO Number System + Creator-Only Finalize + Search Bars (2026-05-11)
- **DB schema** (applied via sqlcmd):
  - `dms_ROCounters (CardCode PK, CurrentCounter INT)` — per-business-type counters seeded: BP=0, CT=0, GR=0, WR=0
  - `dms_DocCounters (DocType PK, CurrentCounter INT)` — flat counters seeded: GRN=0, GRTN=0
  - `Addata_JobCardInfo` — 19 new columns: `PMType`, `ServiceAdvisor`, `RepeatROID`, `BatteryNo`, `VehicleColor`, `Millage`, `IsEstimatedRO BIT`, `EstimatedRONo`, `ApprovedBy`, `RevisedDelivery`, `JobResult`, `IsFIR BIT`, `BringByType`, `BringByName`, `BringByMobile`, `DeliveredTo`, `DeliveryMobile`, `DeliveredAt`, `PaymentCO`
  - `vw_WorkshopJobCards` — updated to include all 19 new columns + `CustomerCNIC`, `CustomerAddress`, `CustomerEmail`, `PartyName`
- **Backend**:
  - `workshopController.js` — atomic RO counter (`UPDATE dms_ROCounters SET CurrentCounter = CurrentCounter + 1 OUTPUT INSERTED.CurrentCounter`), all 19 new fields in INSERT/UPDATE, auto-seed counter row when new job type created, 4 new admin endpoints: `getROCounters`, `updateROCounter`, `getDocCounters`, `updateDocCounter`
  - `grnController.js` — atomic GRN counter via `dms_DocCounters`, follow-up UPDATE sets `PurchaseVoucherNo = GRN-XXXX`; `getGRNs` supports `?search=` param
  - `grtnController.js` — same pattern, `PurchaseReturnNo = GRTN-XXXX`; `getGRTNs` supports `?search=` param
  - `finalizeController.js` — creator-only check: `CreatedBy === req.user.userId` required; admin with `admin_unfinalize` module bypasses; returns HTTP 403 if unauthorized
  - `workshopRoutes.js` — 4 new routes for counter management
- **Frontend**:
  - `JobCardForm.jsx` — full redesign matching FIS Windows desktop screenshot: blue-gradient title bar, beveled toolbar buttons, group boxes, tab interface (General | Vehicle Info | Job Card Info | Spares | Sublet Repair), Bill Details panel, all 19 new fields, RO# auto-generated (readonly), Job# user-entered
  - `GRN.jsx` — creator-only finalize; debounced searchbar above Recent GRNs (searches `GRN#, Bill#, Supplier`); split `fetchData` into `fetchFormData` (mount-only) + `fetchGRNs(search)` (reactive)
  - `GRTN.jsx` — same pattern as GRN; searchbar searches `GRTN#, Supplier`
  - `JobCardList.jsx` — debounced searchbar (300ms), placeholder hints `0042 or WR-0042`; 4-digit search naturally matches across all business types via LIKE
  - `WorkshopSettings.jsx` — "RO / Document Counters" panel with per-type editing and next-number preview

---

---

### Phase 6 — Care-Off Discount System (2026-05-11)
- **DB schema** (applied via sqlcmd):
  - `dms_CareOff` — employee ↔ max discount % mapping with active toggle; FK to `gen_EmployeeInfo`
  - `dms_CareOffAudit` — audit log: who set care-off, who changed discounts, timestamps
  - `Addata_JobCardInfo` — added `CareOffID INT NULL`, `CareOffName NVARCHAR(100) NULL`
  - `Addata_JobCardInfoDetail` — added `DiscType NVARCHAR(10) NULL` (existing `Discount` column reused for value)
  - `dms_ModulePermissions` — seeded `workshop_careoff` for GroupID=1
  - `vw_WorkshopJobCards` — updated to include `CareOffID`, `CareOffName`
- **Backend**:
  - `utils/careOffUtils.js` — pure functions: `computeLineDiscAmt(item)` (% or Rs, cap at price), `validateDiscountCap(items, maxPct)` (tolerance 0.005); no DB dependencies → testable
  - `controllers/careOffController.js` — CRUD: get all/active, save (post/put), soft-delete (set inactive), audit log
  - `routes/careOffRoutes.js` — `GET /`, `GET /active`, `GET /audit`, `POST /`, `PUT /:id`, `DELETE /:id`
  - `server.js` — registered `/api/care-offs` route
  - `config/modules.js` — added `workshop_careoff` module definition
  - `workshopController.js` — cap validation (HTTP 422) before transaction; `effectiveItems` strips discounts if no care-off; per-line `Discount`, `DiscAmt`, `DiscType` saved; fire-and-forget audit after commit
- **Frontend**:
  - `CareOffAdmin.jsx` — admin screen: table with employee, max%, PKR example on 1k, status; modal for add/edit (employee dropdown filtered to non-care-off employees, max% with live preview); activate/deactivate toggle
  - `JobCardForm.jsx` — "Care-Off / Discount Auth" group box in right panel with employee dropdown; discount column (value + %/Rs toggle) appears in labour table only when care-off selected; Price becomes read-only when care-off assigned; Payable column (Price − DiscAmt); live cap indicator (green/red); cap-over warning banner; bill details show real Total Disc. and Total Payable; swap-block: changing care-off with discounts > new cap is rejected with clear message
  - `App.jsx` — added `CareOffAdmin` import, `UserCheck` icon, sidebar link, route `/workshop/care-off`
- **Tests**: `__tests__/careOffCap.test.js` — 15 Jest unit tests on pure cap logic; all pass

## In Progress
**Accounting Module — Build session active (2026-05-12).**
- ✅ §14.22 items 1–5 (schema foundation): migrations folder + `001_accounting_foundation.sql` applied; 12 constraint tests pass.
- ✅ §14.22 item 6 (System Accounts admin UI): backend + frontend complete, atomic upsert+audit, posting-count warning, audit history view. `resolveRole(roleKey)` helper available for downstream controllers.
- ✅ §14.22 COA seed: all 32 accounts including 12 system role leafs; system role assignments auto-seeded via migration 002.
- ✅ §14.22 item 7 (Tax Rates admin UI + seeds): backend + frontend complete, atomic rate change, future-dated changes supported, `resolveRate(taxType, asOfDate)` helper available for downstream posting flows.
- ✅ §14.22 item 8 sub-1 (Job Card finalize posting): pure builder matches §14.6 exactly. 16 unit tests pass. Posting hook wired into `finalizeController.finalize` atomically. JobCardForm Bill Details panel updated to fetch tax rates and include PST + GST in Total Payable.
- ⏳ §14.22 item 8 sub-1b (Insurance jobs split receivable, §14.10) — deferred follow-up.
- ✅ §14.22 item 8 sub-2 (GRN finalize posting, §14.7): pure builder + snapshot calculator match §14.7 exactly. 17 unit tests pass. `FreightTaxable` checkbox added to GRN form. Total tests 48/48.
- ✅ §14.22 item 8 sub-3 (GTRN finalize posting, §14.8): pure builder + snapshot calculator (looks up original GRN landed cost) match §14.8 exactly. 13 unit tests pass. Total tests 61/61.
- ✅ §14.22 item 8 sub-4 (Store Sale finalize posting, §14.9): pure builder produces 7-line voucher, 12 unit tests pass. Total tests 73/73. Doc typo fixed (§14.9 said total 2,565; correct is 2,735).
- ✅ §14.22 item 8 sub-5 (SSR finalize posting, §14.9 return): pure builder produces 7-line mirror-reverse voucher, 12 unit tests pass. Total tests 85/85.
- ✅ **§14.22 item 8 fully complete (all 5 posting flows).**
- ✅ §14.22 item 9 (Receive Payment / Make Payment screens, §14.11): backend + frontend complete. Per-invoice allocation, multi-mode payments, advance handling for both customer and supplier sides. 15 builder tests pass. Total tests 100/100. UX iter: walk-in mode uses Business Unit + RO number entry; outstanding lists show RO/Invoice ref; walk-in mode now shows JC balance breakdown via `/api/payments/jobcard-balance/:id`.
- ✅ §14.22 item 10 (POS Settlement screen, §14.13): backend + frontend complete. Hybrid review flow per §14.13. Per-bank commission applied automatically; admin can override commission / net deposit before posting. Posts BRV voucher with Cr POS Clearing per receipt tagged by `AllocatedToVoucherID`.
- ⏳ §14.22 item 11 (26 reports) — pending.
- ⏳ §14.22 item 12 (finalize/unfinalize on manual vouchers) — pending.
- ⏳ §14.22 item 13 (cascade-block on unfinalize) — pending.
- ⏳ Items 9–13 — pending.

Deferred design sessions: Car Sales, Payroll / HR, Incentive Distribution (each will be its own dedicated design session).

**CRO Module — Phases 0–7 complete (2026-05-15).** Design doc: `.claude/planning/cro-module-design.md`.

- ✅ Phase 0 (HR foundation): `LinkedEmployeeID` on `GLUser`, `ReportsToID` on `gen_EmployeeInfo`, `ManagerEmployeeID` on `gen_DepartmentInfo`, `gen_JobCardType.ManagerEmployeeID`, `IsActive` flag.
- ✅ Phase 1 (Schema + scaffolding): migrations 015–017 applied. 16 `dms_CRO_*` tables, opt-out flag, 4 module keys (`cro_workspace`, `cro_admin`, `cro_dept_responder`, `cro_reports`) seeded.
- ✅ Phase 2 (Core complaint flow): workspace, complaint detail, new-complaint wizard, attachments, action timeline. JC finalize → auto follow-up + auto PostJobCard survey + auto service reminder. Complaint close → auto PostComplaint survey. CRD outcome=Complaint → auto-creates CRO complaint linked back. NotSatisfied verdict → forced L2 escalation.
- ✅ Phase 3 (Escalation engine): `services/escalationEngine.js` + `escalationCron.js`. `node-cron` every 15min, cumulative chain L0→L1→L2, severity multipliers (Critical ×0.5, Low ×2.0), unique-index idempotency, manual escalate/reassign endpoints. L0 + L1/L2 notifications via shared `croNotificationService`. 22 Jest tests pass.
- ✅ Phase 4 (Twilio): `services/twilioWhatsAppService.js` now invokes real `twilio` client when `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` env vars are set, falls back to stub otherwise. `controllers/croWhatsAppController.js` handles `/api/cro/whatsapp/inbound` (signature-verified, opt-out keyword detection — STOP/CANCEL/UNSUBSCRIBE flips `addata_CustomerInfo.WhatsAppOptOut`) and `/api/cro/whatsapp/status` (delivery status callbacks). Both public, mounted before auth middleware. Admin read-only viewer at `GET /api/cro/whatsapp/messages`.
- ✅ Phase 5 (Surveys + reminders):
  - Surveys: `services/croSurveyService.js` (`createSurvey` shared by triggers + manual create), public token endpoint `/api/cro/surveys/public/:token`, admin CRUD `/cro/surveys`, template management `/cro/survey-templates` (versioned, auto-deactivates older versions). In-CRD-call survey capture via `<SurveyCapturePanel>` inside the follow-up contact modal.
  - Reminders: `services/croReminderService.js` with ladder logic (PDI→FFS 1500km/90d, FFS→SFS 5000km/180d, SFS→Regular 5000km/180d), km/day rule (≥3 JCs → personal rate capped at 200; default 30), `min(km, time)` due-date pick. `services/reminderCron.js` daily at 09:00 flips Scheduled → Sent. 8 Jest tests. Admin page `/cro/reminders` with back-fill + run-now.
- ✅ Phase 6 (Inquiry + KYC):
  - Inquiries: `controllers/croInquiryController.js`, page `/cro/inquiries`, category-to-department auto-routing, convert-to-complaint, link-to-JC.
  - KYC flags: `controllers/croKYCController.js`, page `/cro/kyc-flags`, `<KYCBanner>` wired into JobCardForm — banner forces Advisor acknowledgment before save when entered chassis has any open flag.
- ✅ Phase 7 (Reports): **13/13 shipped — all tiers complete.** v1 (5/5): Open Dashboard, Aged/SLA, Resolution-by-Dept, Survey Scores, Reminder Conversion. v2 (5/5): By Responder, Escalation Heatmap, Repeat Complaints, NotSatisfied Tracker, KYC Register. v3 (3/3): Campaign ROI, Customer Lifetime Touchpoints (per-customer rollup across JCs/complaints/surveys/campaigns/reminders/flags with KYC-flagged highlighting), Service-Order Ladder Funnel (PDI→FFS→SFS→Regular chassis cohort conversion).
- ✅ Phase 8 (Campaigns): `services/croCampaignService.js` with segment resolver (`buildSegmentSQL` — vehicleBrand, vehicleCode, noJCSinceDays, hasJCEver, DoNotContact opt-out always honored) + throttled send pipeline (`executeCampaign` — ~9 msg/sec to stay under Twilio's 80/sec ceiling). `controllers/croCampaignController.js` with full CRUD + preview + send-now (runs in background) + cancel. Frontend `/cro/campaigns` page with segment builder, live preview (count + 10 sample customers), template editor (`{{name}}` / `{{brand}}` / `{{vehicle}}` placeholders), Twilio Template SID field, scheduled-send datetime picker, per-send detail modal with auto-refresh while Sending. `dms_CRO_CampaignSends` queue table tracks every recipient with delivery status + Twilio SID + error capture.

**Recovery incident (worth keeping the technique):** during Phase 2.7 a Write tool failed with ENOSPC and truncated `App.jsx` to 0 bytes. Reconstructed by parsing the Claude session transcript (`.claude/projects/c--Users-ServerDeskop-Desktop-db1/00cf5e40-*.jsonl`) and replaying every `Write` + `Edit` tool call for that file in order. Worked cleanly. Recovery script approach documented in this conversation.

---

## Pending / Backlog
- Print / PDF export for Job Cards and GRNs
- Reporting module (sales, stock, workshop performance)
- Voucher listing / ledger view
- Dashboard charts (real data instead of placeholders)
- Notifications for pending unfinalize requests
- **Multi-branch party consolidation** — currently each branch of EFU / Adamjee / large supplier is a separate `gen_PartiesInfo` row (Option A, no schema change). Future enhancement: add `ParentPartyID` self-FK OR `dms_PartyGroups` table for consolidated rollup reporting. Trigger: business needs a "group total" statement. See §14.20 in SYSTEM_DOCUMENTATION.md for full notes.

---

## Decisions Log

| Date | Decision | Why |
|------|----------|-----|
| 2026-05 | Dual-path password: bcrypt new / legacy plain-compare old | Existing `GLUser` rows use FIS proprietary hash; can't mass-reset 100+ users |
| 2026-05 | Follow-up UPDATE after legacy SP, not SP modification | SPs may serve other systems; non-invasive |
| 2026-05 | Entity-map whitelist in finalizeController | Prevents SQL injection via `:entity` param; keeps one controller for all types |
| 2026-05 | HTTP 423 for finalized-record mutations | Semantically correct (423 = Locked); frontend can detect specifically |
| 2026-05 | `new sql.Request(transaction)` per loop iteration | mssql throws "parameter already declared" if you reuse a Request object across loop iterations |
| 2026-05 | PowerShell heredoc `@'...'@` for sqlcmd with bcrypt hashes | Bash expands `$2b` → empty string, corrupting the stored hash |
| 2026-05 | No email field on login | User requirement: username + password only |
| 2026-05 | Inline styles (no CSS files) | Matches existing codebase — all pages use inline styles consistently |
| 2026-05 | Atomic RO counter via `UPDATE ... OUTPUT INSERTED` | Row-level lock during UPDATE prevents duplicate RO numbers under concurrent saves |
| 2026-05 | GRN/GRTN counters in `dms_DocCounters` (flat, no business type) | GRN/GRTN are not per-business-type; one global sequence per doc type |
| 2026-05 | Creator-only finalize (HTTP 403 for non-creator) | Policy: only the record creator can finalize their own work; admin can bypass |
| 2026-05 | Debounced search (300ms) instead of immediate fetch | Prevents a DB query on every keystroke; 300ms feels instant to users |
| 2026-05 | `fetchFormData` / `fetchGRNs` split in GRN+GRTN pages | Avoids re-fetching parties/warehouses/items on every search keystroke |
| 2026-05 | 4-digit search matches all business types automatically | `%0042%` LIKE matches `WR-0042`, `BP-0042`, etc. — no special handling needed |
| 2026-05 | Cap validation before transaction (not inside) | Avoids holding a transaction lock while querying `dms_CareOff`; HTTP 422 returned cleanly |
| 2026-05 | `effectiveItems` strips discounts when no care-off | Prevents frontend from sending discount values that were set before removing care-off |
| 2026-05 | Audit fire-and-forget after commit | Audit failure must not roll back a saved job card; errors logged to console only |
| 2026-05 | Floating-point tolerance `+ 0.005` in cap check | Prevents false "over cap" rejections from rounding (e.g. 10.001 vs 10.000) |
| 2026-05 | Pure `careOffUtils.js` separate from controller | Allows Jest to test cap logic without any DB mocking |
| 2026-05 | Swap block: reject care-off change if current discounts > new cap | Prevents silent data corruption when swapping to a lower-cap care-off |

---

## Open Questions
_Nothing currently open._

---

## Gotchas & Warnings

### DB
- `ItenName` column in `InventItems` is a typo from the legacy schema — do NOT rename it; all code references use this spelling
- `data_PurchaseInfo` and `data_PurchaseReturnInfo` have `CreatedBy`/`CreatedByName` set via follow-up UPDATE (not in the SP) — if the SP call succeeds but the UPDATE fails, the record exists without creator info
- `GLUser.UserPassword` for legacy users is NOT bcrypt — detect with `startsWith('$2b')` before comparing

### Frontend
- `GRN.jsx` previously fetched `grns` state but had no JSX to render it — fixed in Phase 4 rewrite; don't revert
- `JobCard.jsx` (old file) still exists in pages/ — the active file is `JobCardForm.jsx`; `JobCard.jsx` is unused legacy

### Auth / Routes
- Route registration order in `server.js` is critical: `/api/auth`, `/api/admin`, `/api/finalize` must be registered BEFORE `app.use('/api', authMiddleware)` — otherwise the auth middleware blocks them
- The 401 interceptor in `main.jsx` calls `window.location.reload()` — this works because `App.jsx` re-checks `user` on load and shows Login if token is gone

### SQL Server
- `temp_db1` uses Windows Authentication — no password needed in connection string
- `PRINT` statements cannot appear inside `ALTER VIEW` DDL in a single sqlcmd batch — split into separate calls
