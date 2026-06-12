# CRO (Customer Relations Office) Module — Design Planning

> **Active design session — not yet built.** This is the living planning document.
> Update on every exchange. Mark assumptions 🟢, unknowns 🟡, pushbacks 🔴.

---

## Decisions Locked
1. **Every complaint links to a JobCardID** (no standalone complaints).
2. **No stub JCs** — every complaint references an *existing* JC.
3. **WhatsApp via Twilio** — outbound via approved templates; inbound via webhook.
4. **3-tier escalation, cumulative chain**: L0 (filing) → L1 at 72h → L2 at 96h. (Was 4 tiers; collapsed by #9.)
5. **`NotSatisfied` kickback forces L2 (Executive)** + re-resolve gated on fresh proof + Department Manager ack.
6. **Survey timing**: automatic on every JC finalize + every complaint close.
7. **Retention trigger**: `MIN(km-projected date, month threshold)`. New customers (<3 JCs) → 30 km/day; thereafter personal average, capped at 200.
8. **No Insurance department** — insurance routes to After-Sales.
9. **No default-responder** — L0 = Service Advisor + Department Manager (from minute 0).
10. **Naming**: `dms_CRO_*` prefix.
11. **KYC banner = soft-block** — Save disabled until advisor ticks per-visit "I have verified" audit.
12. **Same-complaint re-open window = 30 days**. Within 30d → re-open original (forces L2). After 30d → fresh complaint event for reporting.
13. **WhatsApp proof override**: CRO Manager can grant one-click override with mandatory reason ("Customer is offline"). Audited; override count tracked per dept.
14. **NoResponse retry**: 3 attempts spaced 24h apart; auto-close as `Closed (NoResponse)` after 14 days from first attempt. Stays visible in reports as "unverified close".

## Open Questions (remaining)

1. **Decision #15 — JC business-type → owning department mapping** (newly surfaced, blocks Phase 0):
   - Which department owns CT, GR, BP, WR? (default: After-Sales, After-Sales, Body Shop, After-Sales)
   - Who is the named Manager (EmployeeID) for each? Likely 2 distinct managers (After-Sales manager + Body Shop manager). See §4.8.

Implementation-time tactics (NOT design — read at deploy):
- Twilio mode (sandbox / production)
- When to rename `gen_DepartmentInfo` "Suzuki Customer Relations" → "Customer Relations"
- Seed `dms_CRO_SystemRoles` via migration or admin UI

---

## 1. Overview

CRO is the **post-sale relationship hub** of the dealership. It owns:
- The customer complaint lifecycle (file → assign → resolve → verify → close)
- The proactive retention loop (next-service due, FFS/SFS reminders)
- General customer inbound (inquiries, campaigns)
- Service-quality oversight (CRO double-check on resolution, satisfaction surveys)
- Data hygiene (KYC flags when a customer's contact info is wrong)

**Operating principle**: CRO is the *customer-facing department* — it does not perform repairs; it represents the customer's voice inside the dealership and the dealership's voice back to the customer. Every complaint has an owning service department (After-Sales, Body Shop, Parts) and a CRO shepherd.

**Workflow shape**: complaint filed → routed to responsible department → resolved by department staff → **CRO calls the customer back to verify** → close OR re-escalate. This double-confirm loop is the design's center of gravity.

🟢 [ASSUMED: CRO is its own department in HR — likely the existing "Suzuki Customer Relations" row in `gen_DepartmentInfo` (DepartmentID=8) renamed. Confirm or rename.]

---

## 2. Roles & Permissions

🟢 [ASSUMED: 4 RBAC keys for the module. Refine after lifecycle is locked.]

| Module Key | Who | Capabilities |
|---|---|---|
| `cro_workspace` | CRO officers | File complaints, log inquiries, run KYC checks, double-check resolutions, send messages, view CRO reports |
| `cro_admin` | CRO Manager | Everything above + configure escalation rules / survey templates / campaign segments |
| `cro_dept_responder` | Service / Body Shop / Parts staff | View complaints routed to their dept, post resolution + WhatsApp proof, request CRO verification |
| `cro_reports` | Managers / GM | Read-only access to all CRO reports |

🟡 [PENDING: do you want a separate "dept_manager" role for first-tier escalation receivers, or piggyback on department-manager-of-record (HR field)?]

---

## 3. HR Module Dependencies (read-only — what CRO needs to consume)

CRO needs HR to expose, for any employee:
- `EmployeeID`, `EmployeeName`, `PhoneNo`/`MobileNo`, `EmailAddress`
- `DepartmentID` → so we can route complaints by department
- `IsActive` (currently absent — see §4)
- `ReportsToID` (currently absent — see §4)
- `LinkedUserID` ↔ `GLUser.UserID` (currently absent — see §4)
- Role/job tags: "Service Advisor", "CRO Officer", "Department Manager"

CRO needs, for any department:
- `DepartmentID`, `DepartmentName`
- `ManagerEmployeeID` (currently absent — see §4)
- Default escalation chain (currently implicit — see §4)

CRO needs, for the logged-in user (`req.user`):
- Their `EmployeeID` (currently the JWT has only `userId` from `GLUser`, no employee link)

---

## 4. Proposed HR Module Enhancements

These are **HR changes**, not CRO changes — they live in HR and benefit any future module too (Payroll, Performance, etc.). Listed in priority order.

### 4.1 Add `LinkedEmployeeID` to `GLUser`
- **What CRO needs**: when a service advisor logs in, the system must know which `EmployeeID` they are (to filter "my open complaints", to attribute resolution logs, to detect when the advisor is the assigned-to person).
- **What HR currently has**: `GLUser` (login credentials) and `gen_EmployeeInfo` (employee record) are entirely separate — no FK between them.
- **The gap**: a user logs in as "asim" (UserID 3) but there's no way to know that's EmployeeID 1. Today this is bridged by name-matching in workshopController, which is fragile.
- **Proposed change**:
  - Add `LinkedEmployeeID INT NULL` (FK to `gen_EmployeeInfo.EmployeeID`) on `GLUser`.
  - User Management page gets a "Linked Employee" picker.
  - JWT payload extended with `employeeId` field at login time.
- **Why HR, not CRO**: every module that wants to attribute actions to a person (Care-Off, Job Card creation, voucher posting) suffers the same gap. Fixing once in HR pays everyone.

### 4.2 Add `ReportsToID` to `gen_EmployeeInfo`
- **What CRO needs**: escalation engine needs to know "if the advisor doesn't resolve in 3 days, who do we ping?" That requires a chain. The chain is: Employee → Reports To → eventually Department Manager → eventually GM.
- **What HR currently has**: nothing. There is no reporting hierarchy in the system.
- **The gap**: complete absence of organizational hierarchy.
- **Proposed change**:
  - Add `ReportsToID INT NULL` (self-FK to `gen_EmployeeInfo.EmployeeID`).
  - HR Settings page gets a "Reports To" picker on each employee.
  - Migration includes a check: no employee reports to themselves, no cycles. Enforced via trigger or recursive CTE check in service layer.
- **Why HR, not CRO**: hierarchy is a universal HR property; CRO is one of many consumers.

### 4.3 Add `ManagerEmployeeID` to `gen_DepartmentInfo`
- **What CRO needs**: many complaints route by *department*, not by named employee. CRO needs "current After-Sales Manager" without knowing the person's name. Same for Body Shop, Parts, etc.
- **What HR currently has**: department has no head-of-department field.
- **The gap**: no way to look up "who is the manager of department X today".
- **Proposed change**:
  - Add `ManagerEmployeeID INT NULL` (FK to `gen_EmployeeInfo`) on `gen_DepartmentInfo`.
  - HR Settings page exposes the picker on Department edit.
- **Why HR, not CRO**: "department has a manager" is org-structure, not CRM data.

### 4.4 Add `IsActive` flag to `gen_EmployeeInfo`
- **What CRO needs**: escalation engine must skip resigned / suspended / extended-leave employees automatically, otherwise reminders sit in dead inboxes.
- **What HR currently has**: `ResignDate` only (catches resignations but not leave / suspension).
- **The gap**: no clean active-employee filter; current `vw_ActiveEmployees` likely filters on `ResignDate IS NULL` only.
- **Proposed change**:
  - Add `IsActive BIT NOT NULL DEFAULT 1` on `gen_EmployeeInfo`.
  - Migrate: `IsActive = CASE WHEN ResignDate IS NULL THEN 1 ELSE 0 END` on existing rows.
  - Update `vw_ActiveEmployees` to filter on `IsActive=1`.
- **Why HR, not CRO**: every consumer (Job Card advisor picker, Care-Off picker, Job Controller technician picker) needs the same filter.

### 4.5 Role/Job tags — designation-driven for now, deferred to a richer model
- **What CRO needs**: "give me all service advisors", "give me the CRO officer on duty", "give me department managers".
- **What HR currently has**: `DesignationID` → `gen_DesignationInfo.DesignationName` (free-text).
- **The gap**: not a true gap *yet* — we can lean on designation names + a curated list. But long-term, distinguishing "designation" (Sr. Tech, Sr. Advisor) from "role" (Service Advisor, CRO Officer, Manager) is cleaner.
- **Proposed change (phase 1, deferred build)**: nothing — CRO module will resolve "service advisor employees" by joining on `DesignationName IN ('Service Advisor', 'Senior Service Advisor')`. Maintain a small `dms_EmployeeRoleTags(EmployeeID, RoleTag)` table only if the join proves brittle.
- **Why HR, not CRO**: same reason as above — role classification is HR-owned.

### 4.6 ~~Department-level "default responder"~~ — **DROPPED (decision #9)**
- Decision #9 made this unnecessary: complaints land directly with the named Service Advisor + Department Manager, not in a generic queue. No `DefaultResponderEmployeeID` field needed.

### 4.8 `gen_JobCardType.ManagerEmployeeID` (NEW — surfaced 2026-05-15)
- **What CRO needs**: each JC business type (CT, GR, BP, WR) has a specific manager who must be in the L0 notification group when a complaint touches that business type. Your structure groups business types in a way that doesn't align with HR departments — CT + BP share one manager, GR + WR share another.
- **What Workshop currently has**: `gen_JobCardType` has `JobCardTypeId`, `CardCode`, `Title`, but no manager link.
- **Proposed change**:
  - Add `ManagerEmployeeID INT NULL` FK to `gen_EmployeeInfo` on `gen_JobCardType`. NULL allowed initially; must be set before any JC of that type can be saved.
  - Workshop Settings UI exposes the manager picker on JC type edit — **one-time setup** of 4 rows.
  - Routing resolves: `complaint.JobCardID → JC.JobCardTypeId → JobCardType.ManagerEmployeeID` = the L0 Business-Unit Manager.
- **No per-JC field needed**: the advisor doesn't pick a manager on each JC. Manager is inherited automatically from the business type. If you ever need to change who manages CT, you update one row in Workshop Settings.
- **Why directly on JobCardType, not on Department**: your manager grouping (`{CT,BP}` vs `{GR,WR}`) is orthogonal to HR department structure (After-Sales / Body Shop). HR `gen_DepartmentInfo.ManagerEmployeeID` (§4.3) stays valid for org-chart / payroll, but isn't on the CRO routing path.

🟡 [PENDING (decision #15): need the two manager names / EmployeeIDs.]

| Business Type | Code | Manager | EmployeeID? |
|---|---|---|---|
| Changan Touch  | CT | **Manager X** | 🟡 |
| Body & Paint   | BP | **Manager X** (same as CT) | 🟡 |
| General Repair | GR | **Manager Y** | 🟡 |
| Warranty       | WR | **Manager Y** (same as GR) | 🟡 |

### 4.7 `Addata_JobCardInfo.ServiceAdvisor` → resolve to EmployeeID (NEW — surfaced by decision #4)
- **What CRO needs**: the escalation chain starts at "Service Advisor on this JC". To notify them, we need an `EmployeeID`. To traverse to their manager (if we ever shift from "department manager" to "direct report-to" logic), we need an FK.
- **What HR currently has**: `Addata_JobCardInfo.ServiceAdvisor` is a free-text `nvarchar` name string. There is no link to `gen_EmployeeInfo`.
- **The gap**: every name match is a fragile string-compare. "ALI HASSAN CHOHAN" vs "Ali Hassan" doesn't match; resigned-and-rehired employees with the same name produce ambiguity.
- **Proposed change** (two options — pick one):
  - **(A) Add `ServiceAdvisorID INT NULL` FK** to `Addata_JobCardInfo` alongside the existing name string. Migrate by name-match where possible, leave NULL on misses, populate going forward via the JC form's existing advisor picker (which already loads from `gen_EmployeeInfo`).
  - **(B) Replace the string field entirely** — drop `ServiceAdvisor` after migrating to a new `ServiceAdvisorID` FK. Risk: legacy reports / SPs that read the name break.
- **Recommended**: (A) — additive, no breaking changes; CRO reads the FK and falls back to name-lookup if NULL.
- **Why HR, not CRO**: every module that wants to attribute work to a specific person on a JC (CRD follow-ups, performance reports, advisor commission) needs this. Fixing once in HR/Workshop pays everyone.

---

## 5. Schema Overview (entities, relationships)

Tentative — refines as decisions lock.

🟢 [ASSUMED: All new tables prefixed `dms_CRO_*` for clarity. Confirm or rename.]

```
dms_CRO_Complaints
    ComplaintID PK
    ComplaintNo (auto, e.g. CMP-2026-0001)
    ComplaintType: 'Product' | 'Service'
    Source: 'Phone' | 'WalkIn' | 'Online' | 'WhatsApp' | 'Inquiry' | 'PostJobSurvey' | 'CRO_OutboundCall'
    Subject, Description
    JobCardID FK NOT NULL       — every complaint references an existing JC (decision #1, #2)
    OriginalItemID FK NULL      — for product complaints, points at InventItems on the JC
    CustomerProfileID FK NULL   — addata_CustomerInfo
    PartyID FK NULL             — credit customer if applicable
    ContactName, ContactPhone (snapshots — never break if customer record changes)
    ChasisNo, EngineNo (snapshots — for KYC cross-check)
    AssignedDepartmentID FK
    AssignedEmployeeID FK NULL  — specific person or null for dept queue
    CurrentEscalationLevel INT DEFAULT 0
    Status: 'New' | 'Assigned' | 'InProgress' | 'PendingCROVerify' | 'Closed' | 'ReOpened'
    Severity: 'Low' | 'Normal' | 'High' | 'Critical' (drives escalation timer)
    OpenedAt, ClosedAt
    CreatedBy/At, UpdatedBy/At

dms_CRO_ComplaintActions
    ActionID PK
    ComplaintID FK
    ActionType: 'Note' | 'Routed' | 'Resolved' | 'WhatsAppProof' | 'CROCallLogged' |
                'CustomerVerdict' | 'Escalated' | 'ReOpened' | 'Closed'
    PerformedByEmployeeID FK
    PerformedAt
    Notes (free text)
    EscalationLevelBefore/After (for escalation events)
    CustomerVerdict: 'Satisfied' | 'NotSatisfied' | 'NoResponse' (only on verdict actions)

dms_CRO_Attachments
    AttachmentID PK
    ComplaintID FK
    AttachmentType: 'WhatsAppScreenshot' | 'Photo' | 'Document'
    FilePath (relative to /uploads/cro/)
    UploadedByEmployeeID FK
    UploadedAt
    Description

dms_CRO_EscalationRules
    RuleID PK
    AppliesToDepartmentID FK NULL  — null = global
    Severity NULL                  — null = applies to all severities
    Level INT                      — 1 = first escalation, 2 = second, etc.
    HoursElapsed INT               — trigger after N hours
    EscalateToType: 'DirectReportTo' | 'DepartmentManager' | 'CROManager' | 'GM'
    NotificationChannels (CSV: 'InApp,WhatsApp,Email')

dms_CRO_Surveys
    SurveyID PK
    SurveyType: 'PostJobCard' | 'PostComplaint' | 'PostCampaign'
    JobCardID / ComplaintID / CampaignID  (one populated)
    CustomerProfileID FK
    TriggeredAt
    SentVia: 'WhatsApp' | 'SMS' | 'PhoneCall'
    QuestionsJSON (configurable template)
    ResponsesJSON
    OverallRating (1-5 or Yes/No)
    Status: 'Sent' | 'Responded' | 'NoResponse' | 'Expired'

dms_CRO_Inquiries
    InquiryID PK
    Subject, Body, Category
    CustomerProfileID FK NULL  — may be brand-new prospect
    ContactName, ContactPhone, ContactEmail
    AssignedDepartmentID FK
    AssignedEmployeeID FK NULL
    Status, OpenedAt, ClosedAt

dms_CRO_KYCFlags
    FlagID PK
    CustomerProfileID FK
    ChasisNo / EngineNo (snapshots — flag survives if profile is replaced)
    FlagType: 'BadNumber' | 'NotOwner' | 'IncorrectAddress' | 'Other'
    Notes
    FlaggedByEmployeeID FK
    FlaggedAt
    ResolvedAt, ResolvedByEmployeeID

dms_CRO_Campaigns
    CampaignID PK
    Name, Channel ('WhatsApp' | 'SMS')
    SegmentRulesJSON (e.g. "vehicles >= 10000km, last service >= 6 months")
    MessageTemplate
    ScheduledAt, ExecutedAt
    Status: 'Draft' | 'Scheduled' | 'Sent' | 'Cancelled'

dms_CRO_CampaignSends
    SendID PK
    CampaignID FK
    CustomerProfileID FK
    SentAt, DeliveryStatus, RespondedAt, Response

dms_CRO_ServiceReminders
    ReminderID PK
    CustomerProfileID FK
    JobCardID FK (the trigger event)
    ReminderType: 'FFS' | 'SFS' | 'NextService' | 'WarrantyExpiry'
    DueDate (computed)
    DueMileage (computed, nullable)
    Status: 'Pending' | 'Sent' | 'Acknowledged' | 'Booked' | 'Stale'

dms_CRO_Notifications
    NotificationID PK
    RecipientEmployeeID FK
    Channel: 'InApp' | 'WhatsApp' | 'Email'
    Subject, Body
    LinkURL (deep-link into CRO workspace)
    SentAt, ReadAt
    SourceType ('Complaint' | 'Escalation' | 'Survey' | etc.), SourceID
```

🟡 [PENDING: confirm `dms_CRO_*` naming, or prefer `dms_CR_*` / `dms_Customer_*`]

---

## 6. Complaint Types & Differentiation

🔒 **Locked**: every complaint links to a `JobCardID` (decision #1). The type differentiates *what was bad about that JC* and where it routes.

| Aspect | Product Complaint | Service Complaint |
|---|---|---|
| **Trigger** | Defective part / wrong supply / accessory issue that arose from a JC | Bad workmanship, missed item, repeat issue, delivery delay |
| **JobCardID** | **Required** — an existing JC that the part was supplied through | **Required** — the JC the customer is unhappy with |
| **Default routing** | Parts department | After-Sales department (or Body Shop / Warranty per JC type) |
| **Resolution path** | Replacement / refund / RMA to supplier; logged as a parts-side action on the JC | Re-work, technician callback, free service voucher |
| **Linked records** | `InventItems` (specific item complained about), `Addata_JobCardInfo` (always), Store Sale invoice (optional reference) | `Addata_JobCardInfo`, named technician, named advisor |
| **Customer expectation** | Money / replacement | Workmanship guarantee |

**How a complaint surfaces in practice** (locked decision #2):
1. CRO's outbound follow-up call (the CRD module we just built) — customer raises an issue → CRO files a complaint against the JC being followed up on.
2. Customer calls in / walks in / WhatsApps in → CRO pulls up customer history, picks the relevant JC from their JC list, files complaint.
3. Post-JC survey response captures dissatisfaction → CRO converts to formal complaint against the same JC.

**There is no flow for a complaint without a JC.** If a customer reports an issue with a part they bought, the workshop opens a JC to remedy the vehicle — the complaint is filed against that JC.

🟢 [ASSUMED: **no separate `Warranty` complaint type**. Warranty-related complaints are Service complaints where the underlying JC has `JobCardTypeId='WR'` (which already exists in `gen_JobCardType`). Reports can filter on JC type when warranty-specific cuts are needed. Confirm or change.]

---

## 7. Complaint Lifecycle (state diagram)

```
                      [New]
                        │
                        │  assign-to-dept (auto or manual)
                        ▼
                    [Assigned]  ◀────────────────┐
                        │                          │
                        │  responder accepts        │ (re-open from kickback)
                        ▼                          │
                  [InProgress]                     │
                        │                          │
                        │  resolution + WhatsApp    │
                        │  proof uploaded            │
                        ▼                          │
              [PendingCROVerify]                   │
                        │                          │
                        │  CRO calls customer       │
                        │  — logs verdict           │
                        ├── Satisfied      → [Closed]
                        ├── NotSatisfied   → [ReOpened] ─┘  🔒 escalation forced to L2 (decision #5)
                        └── NoResponse     → 3 retries @24h, auto-close after 14d (decision #14)

[escalation timer runs in parallel — see §9]
[Closed]
    │
    │  customer raises same JC complaint within 30 days (decision #12)
    ▼
[ReOpened]  → [Assigned], escalation forced to L2
```

🔒 **Locked (decision #12)**: re-open window = **30 days**. Within 30d of a previous `Closed` action on this JC, a new complaint re-opens the original (and force-escalates to L2). After 30d, it's filed as a fresh event.

---

## 8. Resolution Workflow (step-by-step with actors)

🟢 [ASSUMED: this captures your description verbatim — correct any step.]

1. **Complaint opens** (sources: phone call to CRO, walk-in, online form, WhatsApp inbound, post-job survey result, CRO outbound follow-up call, or CRO officer files on customer's behalf).
2. **JobCardID resolution** (per locked decisions #1 and #2 — every complaint references an existing JC):
   - **From a CRD follow-up call**: the JC is already known — the call is *about* that JC.
   - **From a survey response**: the JC is already on the survey row.
   - **From inbound (call / walk-in / WhatsApp)**: CRO opens the customer's profile and picks the JC the complaint is about from a dropdown of their recent JCs.
3. **Auto-classify type** → Product or Service (CRO can override).
4. **Auto-route to department**:
   - Service complaint → After-Sales (default) or Body Shop / Warranty per JC type.
   - Product complaint → Parts.
4. **Department responder picks it up** → status `InProgress`. They execute the fix (call customer, do re-work, replace part, RMA, etc.).
5. **Responder posts resolution evidence**:
   - Text summary of what was done
   - **WhatsApp screenshot upload** (customer-side acknowledgment of receipt of the fix)
   - Status flips → `PendingCROVerify`.
6. **CRO verifies independently** — calls the customer themselves, asks:
   - Did the work happen?
   - Were they satisfied?
   - Captures verdict in `dms_CRO_ComplaintActions` (CustomerVerdict field).
7. **Outcome routing**:
   - `Satisfied` → `Closed`. Optional satisfaction-survey trigger.
   - `NotSatisfied` → `ReOpened` and escalated per §9.
   - `NoResponse` after 3 attempts → status stays `PendingCROVerify` with a `NoResponse` action; auto-close after N days 🟡.
8. **Escalation timer runs in parallel** — if no movement within `HoursElapsed` for the current level, escalation rule fires (§9). Resolution can complete at any time and stops the timer.

---

## 9. Escalation Engine (levels, triggers, actions)

🔒 **Locked (decision #4)**: 3 escalation steps on a **cumulative chain** — recipients accumulate, prior levels stay in the loop. Universal chain regardless of complaint type (a product complaint still escalates through Service Manager, who coordinates with Parts).

### Chain & timers (refined per decision #9)

| Level | Trigger | Recipients (cumulative — all previous + new) | Channels | Window |
|---|---|---|---|---|
| **0** | Complaint opens | **Service Advisor** (named on JC) **+ Business-Unit Manager** (resolved via JC type — see §4.8: {CT,BP}→Mgr X, {GR,WR}→Mgr Y) | InApp + Email | 0–72h |
| **1** | 72h elapsed, status ∉ `PendingCROVerify`/`Closed` | + **CRO Manager** | InApp + Email | 72–96h |
| **2** | 96h elapsed (total) | + **Executive** (GM / MD) | InApp + Email | indefinite |

**Why the change**: decision #9 removed the "queue → pick" step. Complaints now land with *both* the named person and their manager from minute 0 — no one has plausible deniability that they didn't see it. The previous L0→L1 jump (Service Advisor → +Service Manager) collapses into a single wider L0.

**Note**: "cumulative" means at L2 the notification group is `{Service Advisor, Business-Unit Manager, CRO Manager, Executive}` — the chain doesn't transfer ownership, it adds pressure/visibility.

### Severity multiplier
- `Critical` complaints: halve every threshold → L1 at 36h, L2 at 48h.
- `Low` complaints: double → L1 at 144h, L2 at 192h.

### Recipient resolution (depends on HR enhancements — see §4)

| Recipient label | Resolution rule |
|---|---|
| Service Advisor | `Addata_JobCardInfo.ServiceAdvisorID` → `gen_EmployeeInfo` (§4.7 — needs FK migration) |
| Business-Unit Manager | Resolved directly from JC type: `complaint.JobCardID → JC.JobCardTypeId → gen_JobCardType.ManagerEmployeeID`. For {CT, BP} → Manager X. For {GR, WR} → Manager Y. (See §4.8 for the why-not-by-department story.) |
| CRO Manager | `gen_DepartmentInfo.ManagerEmployeeID` of the CRO department (today's renamed "Suzuki Customer Relations"). |
| Executive | `dms_CRO_SystemRoles` row where `RoleKey='EXECUTIVE'`. Admin re-pointable without code change. |

### Manual escalation
- Anyone with `cro_admin` can escalate any complaint to any level at any time via the workspace UI. Captured as `Escalated` action with mandatory reason.
- CRO Manager can also **de-escalate** (re-route, reassign) — captured as a separate `Reassigned` action.

### Re-escalation on customer kickback (decision #5)

When CRO calls the customer to verify resolution and the verdict is `NotSatisfied`:
- The complaint flips `PendingCROVerify` → `ReOpened` → automatically back to `Assigned` (same owning department, same responder).
- The escalation level is **forced to L3 immediately** — Executive is added to the notification group along with everyone else already in the chain.
- `CurrentEscalationLevel=3`, `LastEscalationAt=NOW`, and a `ReOpened` action row is inserted carrying the customer's specific dissatisfaction reason.
- The escalation engine will not auto-bump further (already at max), but the manual-override path remains open for repeated re-opens.
- A re-opened complaint cannot be marked `Resolved` again without a fresh WhatsApp proof upload **AND** an explicit acknowledgment from Service Manager (additional gating to prevent another botch).

**Rationale**: a customer rejecting the first fix is a serious trust event. Going nuclear immediately ensures executive visibility on every botched resolution — better to over-alert than to under-respond.

### Engine implementation

- **Library**: `node-cron` (already common in the stack).
- **Tick**: every 15 minutes.
- **Query**: scans `dms_CRO_Complaints` where `Status NOT IN ('Closed','ReOpened')` and `CurrentEscalationLevel < 3` and `(NOW − LastEscalationAt OR OpenedAt) >= RuleThreshold(level, severity)`.
- **Per match**: insert `Escalated` action, bump `CurrentEscalationLevel`, set `LastEscalationAt=NOW`, push notifications via in-app + email.
- **Idempotency**: a unique constraint on `(ComplaintID, Level)` in `dms_CRO_ComplaintActions WHERE ActionType='Escalated'` prevents double-firing.
- **Holiday/weekend handling**: 🟢 [ASSUMED: timer runs in real-time, no business-day shift. Workshops typically operate 7 days, so this is fine — confirm if Sunday should be excluded.]

---

## 10. Notifications (channels, recipients, triggers)

🟢 [ASSUMED: 3 channels — in-app dashboard badge, WhatsApp (via Twilio), email. SMS not in scope. Internal staff get InApp/Email; customers only get WhatsApp.]

| Event | Recipient | Channels |
|---|---|---|
| Complaint opens & assigned | Assigned employee + dept manager | InApp, Email |
| Resolution posted | CRO officer queue | InApp |
| Escalation fires | Per §9 chain | Per level (InApp + Email always; WhatsApp to customer only if customer-facing reminder) |
| Customer verdict: NotSatisfied | Full L3 group — Service Advisor + Service Mgr + CRO Mgr + Executive (decision #5 forces L3 on kickback) | InApp + Email — all simultaneous |
| Survey response received | CRO officer | InApp |
| Service reminder due | Customer (outbound) + CRO officer (queue) | WhatsApp outbound, InApp internal |
| Campaign send | Customer | WhatsApp |
| KYC flag created | Service advisor (next time same chassis returns) | InApp banner on JC form |

### In-app implementation
- `dms_CRO_Notifications` table.
- Bell icon in app header, polled every 30s (or via SSE post-MVP).
- `ReadAt` timestamp marks dismissal.

### WhatsApp via Twilio — decision #3

**Provider**: Twilio WhatsApp Business API.

**Direction matrix**:

| Direction | Use | Mechanism |
|---|---|---|
| **Outbound** | Service reminders, complaint acknowledgments, campaigns, survey links | `POST /Messages.json` with an **approved template** SID + variable bindings |
| **Outbound (free-form)** | Reply within the 24-hour customer-initiated session window | Free text, no template required |
| **Inbound** | Customer replies (survey answers, "STOP", complaint follow-ups) | Twilio webhook `POST /api/cro/whatsapp/inbound` |
| **Status callbacks** | Delivery / read receipts, failures | Twilio webhook `POST /api/cro/whatsapp/status` |

**Configuration** (in `.env` — none of these are committed):
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+1...    (sandbox during dev, production number on go-live)
TWILIO_WEBHOOK_VALIDATION_TOKEN=
```

**Service layer**: `services/twilioWhatsAppService.js` exposes:
- `sendTemplate({ to, templateSid, variables })` — outbound (any time)
- `sendText({ to, body })` — outbound (only valid inside 24h session window)
- `sendMedia({ to, body, mediaUrl })` — outbound, used for survey forms / images
- `verifyWebhookSignature(req)` — for both inbound + status webhooks

**Webhook controller**: `controllers/croWebhookController.js` handles:
- Routing inbound replies to the originating context (survey, complaint, opt-out, "STOP")
- Recording status updates on `dms_CRO_WhatsAppMessages` (new table)
- Idempotency via Twilio's `MessageSid`

### Templates we need approved by Meta (managed in Twilio Console)

| Name | Purpose | Variables |
|---|---|---|
| `cro_complaint_ack` | "Complaint #{X} received, we'll follow up by {Y}" | ComplaintNo, ExpectedResolveDate |
| `cro_complaint_resolved` | "Complaint #{X} marked resolved by {Dept}, please confirm" | ComplaintNo, Department |
| `cro_service_reminder` | "{Name}, your {Vehicle} is due for {Type} on {Date}" | Name, Vehicle, ReminderType, Date |
| `cro_survey_link` | "How was your service on {Date}? Tap to rate: {Link}" | Date, Link |
| `cro_campaign_generic` | Generic marketing slot | varies |

🟡 [PENDING: which Twilio mode are you on right now? (a) sandbox + testing, (b) sandbox with intended go-live next month, (c) production already provisioned with approved templates? Affects which template SIDs we hardcode vs read from config.]

### New table — `dms_CRO_WhatsAppMessages`

```
dms_CRO_WhatsAppMessages
    MessageID PK
    TwilioMessageSid (unique)
    Direction: 'Outbound' | 'Inbound'
    Status: 'Queued' | 'Sent' | 'Delivered' | 'Read' | 'Failed' | 'Received'
    FromNumber, ToNumber
    Body (NVARCHAR(MAX))
    MediaUrls (JSON array)
    TemplateName NULL  — set on outbound template sends
    SourceType: 'Complaint' | 'Survey' | 'ServiceReminder' | 'Campaign' | 'InboundUnsolicited'
    SourceID INT NULL
    CustomerProfileID FK NULL  — resolved on inbound where possible
    SentAt, DeliveredAt, ReadAt
    ErrorCode, ErrorMessage  — on failure
```

---

## 11. WhatsApp Screenshot Handling

**Purpose**: an audit trail of the responder's resolution. After the service department fixes the issue, they message the customer over WhatsApp ("Vehicle XYZ ready, oil leak fixed, please confirm"), receive the customer's acknowledgment ("Thanks, picking up tomorrow"), and screenshot that exchange. The screenshot is the proof CRO uses when calling the customer back to verify (§8 step 6) — if the customer denies the work was done, the screenshot is the rebuttal.

🟢 [ASSUMED: screenshots are *responder-uploaded*, attached to the complaint after `Resolved` action. Optional secondary upload by customer (forwarded by CRO) is allowed but rare. Confirm or correct.]

### Upload contract

| Aspect | Spec |
|---|---|
| Endpoint | `POST /api/cro/complaints/:id/attachments` (multipart/form-data) |
| Required body | `file` (image), `AttachmentType=WhatsAppScreenshot`, optional `description` |
| Auth | `cro_dept_responder` OR `cro_workspace` |
| File types | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 5 MB per file (workshop phones produce ~1–2 MB typical) |
| Multi-file per complaint | yes — a single resolution may need multiple screenshots |
| Storage path | `Software/uploads/cro/complaint-{ComplaintID}/{timestamp}-{sanitized-original-name}` |
| Metadata | `dms_CRO_Attachments` row per file |
| Retention | indefinite — these are legal evidence in disputes. Soft-delete only (set `DeletedAt`) and admin-audited. |
| Virus / safety scan | deferred to v2 |

### Display

- **On complaint detail page**: thumbnail grid (lazy-loaded), click-to-expand modal with full image + EXIF (capture time if available).
- **On CRO verification call screen**: thumbnails inline next to "Customer Verdict" capture controls so the officer can reference proof while talking to the customer.
- **Forwardable**: each thumbnail has a "Download" button — CRO can email or re-send to GM during escalation.

### State machine integration

- The `Resolved` action is *gated*: a complaint cannot transition to `PendingCROVerify` unless at least one `WhatsAppScreenshot` attachment exists on the complaint.
  - 🔒 **Locked (decision #13)**: CRO Manager can grant a one-click override with mandatory reason. The override writes an `Action` row of type `WhatsAppProofOverride` carrying the reason. Override count per department appears in the v1 SLA-Breach / Resolution-Time reports.
- The screenshot upload itself writes an `Action` row of type `WhatsAppProof`, capturing who uploaded and when, so the audit trail is preserved even if a file is later deleted.

---

## 12. Survey System

### Triggers (assumed default)

🟢 [ASSUMED — confirm or change]:
- **PostJobCard survey**: fires automatically when a JC is finalized AND `IsComplaintStub=0` (none today since decision #2 removed stubs — keeping the check for forward-compat). One survey per JC per customer.
- **PostComplaint survey**: fires automatically when a complaint reaches `Closed`. Captures whether the customer felt the complaint was handled well, separate from the original JC rating.
- **PostCampaign survey** (deferred to v2): opt-in attached to specific campaigns.

### Question template

Stored per survey-type in `dms_CRO_SurveyTemplates(SurveyType, QuestionsJSON, IsActive)`. Admin can edit between versions; existing in-flight surveys retain their snapshot.

Default v1 templates (CRO admin can edit):

**PostJobCard:**
```json
[
  { "id": "q1", "type": "rating", "scale": 5, "text": "How would you rate the overall service quality?" },
  { "id": "q2", "type": "rating", "scale": 5, "text": "How would you rate the service advisor?" },
  { "id": "q3", "type": "yesno", "text": "Was your vehicle delivered on time?" },
  { "id": "q4", "type": "yesno", "text": "Would you recommend us to a friend?" },
  { "id": "q5", "type": "text", "text": "Anything else you'd like to share?" }
]
```

**PostComplaint:**
```json
[
  { "id": "q1", "type": "rating", "scale": 5, "text": "How satisfied are you with the resolution?" },
  { "id": "q2", "type": "yesno", "text": "Was the issue fully resolved?" },
  { "id": "q3", "type": "text", "text": "How could we have handled this better?" }
]
```

### Delivery

**Primary channel**: WhatsApp template `cro_survey_link` with a tokenized URL → opens a one-page mobile-friendly survey form (no customer login). Form posts back to `POST /api/cro/surveys/:token/respond`.

**Fallback**: CRO officer captures answers over a phone call and enters them into the same form on the customer's behalf — recorded with `CapturedByEmployeeID` for audit.

**Token security**: 32-char random URL slug, single-use, expires after 30 days. Tokens live in `dms_CRO_Surveys.ResponseToken`.

### Lifecycle

```
[Triggered] → cron picks up → [Sent] → customer clicks/responds → [Responded]
                                    ↘ 7 days no response → [Expired]
                                    ↘ "STOP" detected → [Cancelled]
```

### Aggregation

- Average rating per advisor, per department, per JC type — drives CRO reports §13.
- "Net Promoter" derived from `q4 = yes` ratio on PostJobCard.
- Recurring complaint sentiment trends from `q3` text via simple keyword tagging (later: sentiment model — deferred).

🔒 **Locked (decision #6)**: automatic on every JC finalize + every complaint close. No sampling.

---

## 13. Reports

### v1 priority (build first — daily-use reports)

🟢 [ASSUMED priority list — confirm or reorder.]

| # | Report | Daily user | What it answers |
|---|---|---|---|
| 1 | **Open Complaints Dashboard** | CRO officer | "What's on my plate right now?" — grouped by status, age bucket, severity. Front door of CRO Workspace. |
| 2 | **Aged / SLA-Breach Complaints** | CRO Manager + Service Manager | "Which complaints are about to escalate or already late?" — filters by age + escalation level. |
| 3 | **Resolution Time by Department** | CRO Manager | "Which dept is meeting / missing SLA?" — avg + p90 resolution hours per dept, per month. |
| 4 | **Survey Scores by Advisor** | After-Sales Manager | "Who's performing well on satisfaction?" — avg rating, NPS-derived from `q4=yes` ratio. |
| 5 | **Service-Reminder Conversion** | CRO Manager | "Are our reminders bringing customers back?" — sent vs acknowledged vs booked vs ignored. |

### v2 priority (operational depth)

| # | Report | Purpose |
|---|---|---|
| 6 | **Complaints by Responder** | Performance review by-name. |
| 7 | **Escalation Heatmap** | Which depts hit L2+ most often — process-improvement signal. |
| 8 | **Repeat Complaints** | Same customer / same chassis with ≥2 complaints in N days (chronic problem cases). |
| 9 | **KYC Flag Register** | Open flags + acknowledgment history. |
| 10 | **NotSatisfied Verdict Tracker** | Trend of kickback rate — leading indicator of dept quality issues. |

### v3 priority (strategic / marketing)

| # | Report | Purpose |
|---|---|---|
| 11 | **Campaign ROI** | Sends → responses → bookings → revenue attribution. |
| 12 | **Customer Lifetime Touchpoints** | All JCs + complaints + surveys + campaigns per customer — for VIP / churn analysis. |
| 13 | **Service-Order Ladder Funnel** | How many PDIs → FFS → SFS — drop-off analysis. |

🟢 [ASSUMED: build v1 first; v2 / v3 deferred to follow-on phases. Confirm.]

---

## 14. Customer Retention (formula, scheduling, message templates)

🟢 [ASSUMED: hybrid trigger — whichever comes first between time elapsed and mileage threshold. Both configurable globally.]

**Default thresholds (workshop-industry typical, configurable):**
- **FFS (First Free Service)**: 1500 km OR 90 days after PDI, whichever first
- **SFS (Second Free Service)**: 5000 km OR 180 days after FFS, whichever first
- **Regular Service**: every 5000 km OR 6 months after last service

**Source data**:
- `Addata_JobCardInfo.OrderTypeId` (PDI/FFS/SFS triggers the chain)
- `Addata_JobCardInfo.KiloMeter` (last known mileage)
- `Addata_JobCardInfo.FinalizedAt` (anchor date)

**km/day rule (decision #7)**:
- If customer has **≥3 finalized JCs** on this chassis → compute personal km/day from the (max_km − min_km) / (max_date − min_date) of their JC history.
- Otherwise → flat **30 km/day** assumed.
- Cap the personal rate at 200 km/day so a single high-mileage outlier doesn't push reminders too aggressively.

**Trigger formula (decision #7)**:
- `due_by_km    = last_jc_date + (target_km / km_per_day) days`
- `due_by_time  = last_jc_date + target_months`
- `DueDate = MIN(due_by_km, due_by_time)` — whichever fires sooner wins. Both are stored on `dms_CRO_ServiceReminders` for analytics ("did km or time fire?").

**Scheduling**:
- On JC finalize, post-commit hook (like the CRD follow-up hook just built) inserts a `dms_CRO_ServiceReminders` row with computed `DueDate` and `DueMileage`.
- Daily cron at 09:00 sweeps reminders with `DueDate <= today + 7d` → calls `twilioWhatsAppService.sendTemplate({ to, templateSid: TPL.SERVICE_REMINDER, variables })` + creates CRO queue entry.
- Customer responds via WhatsApp → inbound webhook routes the reply to the originating reminder row → status flips to `Acknowledged` (any reply) or `Booked` (positive intent keyword set: "book", "yes", "appointment", etc.) → eventually `Stale` after 30d.

**Template content** (Meta-approved variable template):
```
Hi {{1}}, your {{2}} ({{3}}) is due for {{4}} around {{5}} ({{6}} km).
Reply YES to book a slot, or call us at {{7}}.
— {{8}} CRD
```
Variables: `{{1}}=CustomerName`, `{{2}}=Brand+Model`, `{{3}}=RegNo`, `{{4}}=ReminderType`, `{{5}}=DueDate`, `{{6}}=DueMileage`, `{{7}}=DealershipPhone`, `{{8}}=DealershipName`.

🔒 **Locked (decision #7)**: hybrid — `MIN(due_by_km, due_by_time)`. New customers (<3 JCs of history) use flat 30 km/day; thereafter personal average capped at 200 km/day.

---

## 15. Campaign System

🟢 [ASSUMED: segment-by-rule (not free-form CSV upload). Channel = WhatsApp.]

**Segment rules** (composable, stored as JSON):
- Vehicle brand / model / variant
- Last-service window (e.g. "no JC in last 90 days")
- Mileage range
- Geography (`addata_CustomerInfo.City` if present)
- Tags (future: VIP / Insurance-client / Fleet)

**Flow**: CRO admin builds segment → previews count → uploads template → schedules → cron sends.

**Send queue**: rows in `dms_CRO_CampaignSends`, one per recipient, marked sent/responded. Each send invokes `twilioWhatsAppService.sendTemplate()` with the chosen template SID + per-recipient variable bindings (name, vehicle, etc.).

**Rate limiting**: Twilio enforces ~80 msg/sec on WhatsApp Business API; we throttle bulk sends to ~10/sec to stay safe and to give the inbound webhook breathing room.

**Opt-out**: any customer reply containing "STOP" / "UNSUBSCRIBE" / "بند" / "بس" flags them — `addata_CustomerInfo.DoNotContact=1`. Detection lives in `croWebhookController` inbound handler, which short-circuits before any other inbound routing.

🟢 [ASSUMED for v1: full bulk-send capability ships with v1 (the queue + throttler are cheap once Twilio service is wired). Manual one-off send is also available from any campaign in Draft state.]

---

## 16. Inquiry Form & Routing

### Sources

- **Inbound phone call** — CRO officer logs the call as it happens (most common today).
- **Walk-in** — CRO officer captures details at the desk.
- **WhatsApp inbound** (post-Twilio integration) — Twilio webhook routes unsolicited messages that aren't replies to known threads into `dms_CRO_Inquiries` as `Source='WhatsApp'`.
- **Public web form** (deferred build — endpoint designed now so it slots in without rework).

### Default category list (assumed)

🟢 [ASSUMED — confirm or change]:

| Category | Routes to | Notes |
|---|---|---|
| **Sales — New Vehicle** | Sales dept | First-time buyer inquiries. |
| **Sales — Used Vehicle** | Sales dept | If you handle used; otherwise drop. |
| **Service Booking** | After-Sales | "I want to bring my car in" → CRO converts to a JC booking. |
| **Parts** | Parts dept | "Do you have part X for my model?" |
| **Insurance** | After-Sales | Decision #8 — no separate Insurance dept; routed like any other service inquiry. |
| **Warranty Question** | After-Sales | Customer asking about coverage scope/expiry. |
| **Complaint** | Auto-converts to a Complaint (§6) | Inquiry intake is the entry point; CRO triages and converts. |
| **Other / Unsure** | CRO queue, manual route | Catch-all. |

### Routing

- Auto-route on category select → `AssignedDepartmentID` set, dept queue populated.
- CRO Manager can re-route any inquiry to any department.
- Each inquiry has a `Status` (`New` → `Assigned` → `InProgress` → `Closed`) — lifecycle is lighter than complaints (no escalation engine, no WhatsApp-proof gating).

### Conversion to a Complaint or Booking

- **Inquiry → Complaint**: one-click "Convert" button on the inquiry detail page. Pulls the customer's recent JCs to pick from (preserves locked decision #1).
- **Inquiry → Service Booking**: opens the JobCardForm pre-filled with the customer's profile and the inquiry's notes. Inquiry status flips to `Closed (Converted)` with `LinkedJobCardID` set.

### Fields

```
Name, Phone, Email (optional), Category, Subject, Body,
CustomerProfileID FK NULL (set if existing customer recognized),
LinkedJobCardID FK NULL (if converted to booking)
LinkedComplaintID FK NULL (if converted to complaint)
```

---

## 17. KYC Flagging

**Trigger**: while making an outbound call (CRD follow-up or complaint verification), CRO discovers the registered phone number is wrong, or the person answering isn't the listed owner. They open the customer's CRO panel and click "Flag KYC".

### Flag fields

- `FlagType`: `BadNumber` / `NotOwner` / `IncorrectAddress` / `Other`
- `Notes` (free text — required, minimum 10 chars)
- `ChasisNo` + `EngineNo` snapshots (flag survives even if `addata_CustomerInfo` row is later updated, merged, or replaced)
- `OriginalCustomerProfileID` (snapshot of who the flag was filed against)

### Surface points

#### 1. JobCardForm — at chassis-number resolve time

When the service advisor types a chassis (or engine) number into the JobCardForm and the lookup returns a `addata_CustomerInfo` match:

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠  KYC ISSUE FLAGGED FOR THIS CHASSIS                          │
│                                                                │
│ Flagged on 2026-05-12 by CRO Officer Saif                     │
│ Reason: BAD NUMBER — "Customer's listed phone goes to a wrong │
│          person; got their actual phone from the workshop"   │
│                                                                │
│  [ I have verified ownership today ]    [ Open details ]      │
└────────────────────────────────────────────────────────────────┘
```

- **Behavior**:
  - Banner shows above the form, yellow background (`#fef3c7`), red icon.
  - Advisor cannot click **Save** on the JC until they tick **"I have verified ownership today"**.
  - The verify action writes a `dms_CRO_KYCFlags_Acknowledgments` row capturing `AdvisorEmployeeID`, `JobCardID`, `AcknowledgedAt`. The flag itself stays open until CRO marks it resolved — re-appearing on the next visit too.
  - "Open details" opens a side-panel showing all prior acknowledgments + the original CRO notes.

#### 2. CRO Workspace — Flag Register

- Filterable list of open / resolved flags.
- Each row: flag type, customer, chassis, opened-at, last-acknowledged-at (and by whom).
- "Mark Resolved" requires `cro_workspace` + a resolution note + the corrected info (new phone, owner name, etc.) — system patches `addata_CustomerInfo` and writes the audit row.

### Resolution

- A flag is closed only by CRO action, never auto-closed by JC acknowledgment.
- Closing requires the corrected data to be filled in (or marked "could not reach customer" — in which case the flag stays open).

🟢 [ASSUMED: acknowledgment is per-visit (advisor confirms on every JC), not per-advisor-forever. Confirm.]
🔒 **Locked (decision #11)**: KYC banner = **soft-block**. The Save button stays disabled until the advisor ticks "I have verified owner identity today". The tick writes an audit row to `dms_CRO_KYCFlags_Acknowledgments` (AdvisorEmployeeID, JobCardID, AcknowledgedAt). The underlying flag remains open — CRO is the only role that can clear it.

---

## 18. Service Order Types (PDI/FFS/SFS) & Upcoming-Service Tracking

`gen_OrderType` already has the rows we need: `General`, `FFS`, `SFS`, `PDI`, `Insurance`, `Other`. No new master data required.

### Ladder rules (assumed defaults)

🟢 [ASSUMED — confirm or change per manufacturer spec]:

| Stage | Triggered by | Due window (whichever first) |
|---|---|---|
| **PDI** (Pre-Delivery Inspection) | New vehicle delivery (Sales-side) | One-time per chassis. |
| **FFS** (First Free Service) | PDI completed | 1500 km **OR** 90 days after PDI |
| **SFS** (Second Free Service) | FFS completed | 5000 km **OR** 180 days after FFS |
| **Regular Service** | SFS completed (then loops) | every 5000 km **OR** 6 months |
| **Warranty Inspection** | manufacturer schedule | not handled in v1 — deferred |

### Per-chassis ladder view

When CRO opens a customer profile, the system shows the service ladder for each of their vehicles:

```
Honda Civic — APH-1234
  ✅ PDI       — JC CT-0042 (2026-01-12, 0 km)
  ✅ FFS       — JC CT-0058 (2026-04-08, 1245 km)
  ⏳ SFS       — due by 2026-10-08 OR 6245 km (whichever first)
  ⬜ Regular   — pending after SFS
```

### Enforcement (soft)

- JC creation with `OrderTypeId=SFS` but no FFS on this chassis → yellow warning banner, not a block.
- JC creation with `OrderTypeId=FFS` but no PDI on this chassis → yellow warning + KYC-style check ("imported / second-hand?").
- These warnings live on the JobCardForm — purely advisory.

### Reminder generation

Already covered in §14 — every JC finalize post-commit hook computes the *next* expected stage's `DueDate` + `DueMileage` and inserts into `dms_CRO_ServiceReminders`. The cron sweeps these daily and fires WhatsApp messages via Twilio template `cro_service_reminder`.

### Implementation

- **View**: `vw_CRO_CustomerServiceLadder` joins `addata_CustomerInfo` → all their JCs grouped by chassis → computes next-expected stage based on the ladder rules above.
- **Drives**: the CRO customer-profile panel + service-reminder generation hook + the **v3 priority report** "Service-Order Ladder Funnel" (§13).

---

## 19. Audit Logging

Three audit surfaces, each append-only (no in-place edits, no deletes):

| Table | Captures | Granularity |
|---|---|---|
| `dms_CRO_ComplaintActions` | Per-complaint events: assigned, started, resolved, WhatsApp proof, CRO call logged, escalated, customer verdict, reopened, closed | One row per event |
| `dms_CRO_AdminAudit` | Config changes: escalation rule edits, survey template versions, opt-out toggles, system-role reassignments | One row per change with before/after JSON |
| `dms_CRO_WhatsAppMessages` | Every outbound + inbound + status callback | One row per Twilio MessageSid |

**Cross-cutting audit principles**:
- Every audit row carries `EmployeeID` of the actor (resolved from `req.user.employeeId` after HR enhancement §4.1).
- Server time only — never trust client timestamps.
- Soft-delete of attachments writes a `Deleted` action; the file is moved to `uploads/cro/_deleted/` (not actually erased) so legal recovery is possible.

---

## 20. Edge Cases (resolved + deferred)

### Resolved — design decision baked in

| Case | Handling |
|---|---|
| Customer changes phone mid-complaint | `ContactPhone` snapshotted at complaint creation; updating `addata_CustomerInfo` later doesn't retroactively rewrite the complaint trail. |
| Same customer files identical complaint twice within 24h | Soft duplicate warning ("Customer has open complaint #X for this JC"); CRO can dismiss + file anyway. |
| Responder leaves company (resigned) mid-complaint | Escalation engine skips them via `IsActive=0` and pings their `ReportsTo` instead. Open complaints assigned to inactive employee auto-flagged for CRO Manager reassignment. |
| Customer never picks up CRO verification call | 3 attempts spaced 24h apart; if all fail, auto-close as `Closed (NoResponse)` after 14 days. Visible in reports as "unverified close" (decision #14). |
| WhatsApp screenshot upload fails mid-flow | Transaction rolls back; complaint stays in `InProgress`. Retry-friendly. |
| Twilio webhook arrives for unknown MessageSid | Logged with `WARNING` and dropped (no side effects). Possible cause: replayed delivery callback. |
| Customer marked `DoNotContact` after complaint is in flight | Outbound channels skip them; complaint flow continues internally (department still resolves). |
| Two CRO officers double-pick the same complaint | Optimistic concurrency via `UpdatedAt` — second-saver gets a 409 conflict; UI prompts to refresh. |
| Same chassis returns with a different `CustomerProfileID` (vehicle sold) | KYC flags filed against old profile do NOT auto-transfer. CRO must explicitly re-verify and clear stale flag. |
| JC unfinalized after a complaint was filed against it | Complaint stays open and references the now-mutable JC. UI shows "Underlying JC is currently unfinalized — verify before closing complaint." |

### Deferred — acknowledged, designed-for, not built v1

- Web-facing customer portal (read-only complaint status + survey)
- Customer self-service complaint filing
- Voice-call recordings linked to complaints
- Multi-language UI (Urdu / English customer-facing messages)
- Sentiment analysis on free-text survey comments
- Insurance-claim processing workflow
- Two-way conversational AI on WhatsApp (auto-replies, scripted bot flows)

---

## 21. Proposed Changes to Other Existing Modules

| Module | Change | Why |
|---|---|---|
| **HR** (Employees) | Add `ReportsToID`, `IsActive`, link to `GLUser` | See §4 |
| **HR** (HRSettings/Departments) | Add `ManagerEmployeeID`, optional `DefaultResponderEmployeeID` | See §4 |
| **Job Card** (JobCardForm) | Surface KYC-flag banner when chassis match | See §17 |
| **Job Card** (JobCardForm) | Show open-complaints badge on JCs with active complaints | Decision #1 — every JC sees its own dispute history |
| **Job Card** (post-finalize hook) | Insert into `dms_CRO_ServiceReminders` (alongside existing CRD follow-up insert) | See §14 |
| **User Management** | "Linked Employee" picker | See §4.1 |
| **Auth** (login) | Add `employeeId` to JWT payload | See §4.1 |
| **Customer master** | Add `DoNotContact BIT` on `addata_CustomerInfo` | See §15 |

🟢 [ASSUMED: no changes to Accounting / Workshop labour / Stock modules. CRO is purely additive on top.]

---

## 22. Decisions Log

| # | Date | Decision | Rationale |
|---|---|---|---|
| 1 | 2026-05-15 | Every complaint links to a `JobCardID` (no standalone complaints). | Clean joins for reports (complaints by JC type, by advisor, by business unit); single source of truth; aligns with how a dealership thinks about events (every customer touchpoint is a JC). |
| 2 | 2026-05-15 | **No stub JCs** — complaints reference an *existing* JC only. If a customer reports a part defect, the workshop opens a real JC to remedy the vehicle and the complaint is filed against that JC. CRO does not file complaints unconnected to a real JC. | Operational reality: product complaints come through CRO's outbound follow-up calls or inbound where the customer's recent JC is the natural anchor. Removing the stub mechanism eliminates a flag, a filter everywhere a JC list renders, and a special validator-skip path. |
| 3 | 2026-05-15 | **WhatsApp via Twilio** — Twilio is the messaging provider. Outbound uses approved Meta templates; inbound via Twilio webhook; status callbacks tracked in `dms_CRO_WhatsAppMessages`. | Standard, well-supported provider with template management built in; matches Pakistan-market dealership stack. |
| 4 | 2026-05-15 | **3-level escalation, cumulative chain at 72h / 96h / 120h** — recipients accumulate (Service Advisor → +Service Manager → +CRO Manager → +Executive). Severity multiplier halves/doubles timers for Critical/Low. | Optimal 3-day SLA hits L1 at the 72h mark; cumulative chain prevents ownership-washing as it escalates; universal chain (vs per-department) keeps the engine simple. |
| 5 | 2026-05-15 | **`NotSatisfied` kickback forces escalation to L2 (Executive) immediately.** Re-opened complaint additionally requires fresh WhatsApp proof + Service/Department Manager acknowledgment before it can be marked Resolved again. | A rejected first-fix is a serious trust event; executive visibility on every botched resolution is the design choice. Gating the second resolve prevents repeat-botch loops. |
| 6 | 2026-05-15 | **Survey auto-trigger on every JC finalize + every complaint close.** | Maximises dataset for per-advisor / per-dept analytics; cost of a Twilio template send is trivial. |
| 7 | 2026-05-15 | **Retention reminder timing**: `DueDate = MIN(km-projected date, month threshold)`. New customers (<3 JCs of history) use flat 30 km/day; thereafter use personal km/day average (capped at 200 km/day). | Time fires for low-mileage drivers; km fires for fleet/high-use cars; whichever lands first wins. Defaults handle the cold-start case sensibly. |
| 8 | 2026-05-15 | **No Insurance department row.** Insurance-related inquiries and complaints route to After-Sales. | No dedicated insurance staff; spinning up a phantom department adds noise to reports and HR. |
| 9 | 2026-05-15 | **No default-responder per dept.** L0 widened: complaints land directly with named Service Advisor **+ Department Manager** of the resolving dept. Escalation chain collapses to 3 tiers (L0 / L1 / L2) instead of 4. | Removes a queue step; no plausible deniability that "I didn't see it"; the named manager is in the loop from minute 0 to enable real-time handoff if the advisor is on leave. |
| 10 | 2026-05-15 | **Naming**: all new tables use `dms_CRO_*` prefix. | Consistent with existing `dms_CareOff`, `dms_BankAccounts`, etc. |
| 11 | 2026-05-15 | **KYC banner = soft-block**. JC Save button disabled until advisor ticks "I have verified owner identity today". Per-visit audit row written. Flag remains open until CRO clears it. | Keeps workshop running when CRO is unavailable; captures auditable proof of in-person verification; CRO retains authoritative control of the customer record. |
| 12 | 2026-05-15 | **Same-complaint re-open window = 30 days.** A new complaint touching the same JC within 30 days of a previous close re-opens that complaint (forces L2). After 30 days, it's filed as a fresh event. | 30 days matches the typical "give it a month" customer behavior; beyond that, the original issue is closed business and any new problem deserves its own thread. |
| 13 | 2026-05-15 | **WhatsApp proof override**: CRO Manager can grant a one-click override on the `Resolved → PendingCROVerify` gate when the customer is offline. Mandatory reason. Count of overrides per dept appears in reports. | Allows operation in the Pakistan-elderly-customer reality; the per-dept tracker keeps the escape hatch from being abused. |
| 14 | 2026-05-15 | **NoResponse retry policy**: 3 attempts spaced 24h apart; if all fail, auto-close as `Closed (NoResponse)` after 14 days from first attempt. Complaint stays visible in reports flagged as unverified-close. | Bounded retry prevents infinite waiting; the "unverified close" flag means the CRO Manager can sweep these for follow-up without them blocking the queue. |

---

## 23. Open Questions

**All 14 design decisions locked.** Remaining items are implementation-time tactics, not architecture:

- Twilio mode (sandbox / sandbox-going-live / production) — read from `.env` at deploy; not a design question.
- Whether to rename `gen_DepartmentInfo` row "Suzuki Customer Relations" before Phase 1, or do it as part of the migration — operational sequencing.
- Whether to seed the CRO Manager / Executive role mappings in `dms_CRO_SystemRoles` via migration or via the admin UI on first run.

All other open items in earlier section drafts are now resolved by the 14 decisions in §22.

---

## 24. Deferred Items

Quick reference (full context in §20):

- Web-facing customer portal (read-only complaint status + survey)
- Customer self-service complaint filing
- Voice-call recordings linked to complaints
- Multi-language UI (Urdu / English customer-facing messages)
- Sentiment analysis on free-text survey comments
- Insurance-claim processing workflow
- Two-way conversational AI on WhatsApp
- v2 / v3 reports (operational depth + strategic — §13)
- Phase 2 HR enhancements beyond what CRO needs (payroll, performance, attendance hooks)

Each of these is **designed-for** (schema accommodates) but **not built in v1**.

---

## 25. Build Checklist

🟢 [ASSUMED phasing — confirm or reorder. Each phase is roughly 1–3 days of work depending on scope.]

### Phase 0 — HR foundation (prerequisites)
- [ ] Migration: `GLUser.LinkedEmployeeID` FK to `gen_EmployeeInfo`
- [ ] Migration: `gen_EmployeeInfo.ReportsToID` (self-FK)
- [ ] Migration: `gen_EmployeeInfo.IsActive BIT DEFAULT 1` + backfill from `ResignDate`
- [ ] Migration: `gen_DepartmentInfo.ManagerEmployeeID`
- [ ] Migration: `Addata_JobCardInfo.ServiceAdvisorID` (additive — keep name string)
- [ ] Migration: `gen_JobCardType.ManagerEmployeeID` (§4.8 — required for L0 routing; {CT,BP}=Mgr X, {GR,WR}=Mgr Y)
- [ ] Update `vw_ActiveEmployees` to filter `IsActive=1`
- [ ] HR Settings page: Reports-To picker, Dept-Manager picker
- [ ] Workshop Settings page: JC business-type Manager picker (4 rows: CT/GR/BP/WR — picking the EmployeeID)
- [ ] Auth: include `employeeId` in JWT payload
- [ ] User Management: Linked-Employee picker
- [ ] JobCardForm: write `ServiceAdvisorID` on save (resolve from current advisor picker)
- [ ] Data: pick the 2 manager EmployeeIDs and assign — Manager X to CT + BP, Manager Y to GR + WR (see §4.8)

### Phase 1 — Schema + scaffolding
- [ ] Migration: all `dms_CRO_*` tables (Complaints, ComplaintActions, Attachments, EscalationRules, Surveys, SurveyTemplates, Inquiries, KYCFlags, KYCFlags_Acknowledgments, Campaigns, CampaignSends, ServiceReminders, Notifications, WhatsAppMessages, SystemRoles, AdminAudit)
- [ ] Module key `cro_workspace` / `cro_admin` / `cro_dept_responder` / `cro_reports`
- [ ] Seed `dms_CRO_SystemRoles` with `CRO_MANAGER` and `EXECUTIVE` keys
- [ ] Rename `gen_DepartmentInfo` row "Suzuki Customer Relations" → "Customer Relations"
- [ ] Multer + `uploads/cro/` storage path
- [ ] Twilio service stub + `.env` keys

### Phase 2 — Core complaint flow
- [ ] Complaint create UI (CRO Workspace front door)
- [ ] JC picker on complaint (filtered to customer's recent JCs)
- [ ] Department routing logic
- [ ] Complaint detail page (header + actions timeline + attachments + verdict capture)
- [ ] WhatsApp screenshot upload + state-machine gating
- [ ] CRO verification call screen
- [ ] Status transitions + audit writes

### Phase 3 — Escalation engine
- [ ] Cron job (every 15 min)
- [ ] Rule resolution per severity
- [ ] Cumulative chain notification fan-out (in-app + email)
- [ ] Manual escalate / reassign UI
- [ ] NotSatisfied → force-L3 logic
- [ ] Re-resolve gating (Service Manager ack + fresh proof)

### Phase 4 — Twilio integration
- [ ] `twilioWhatsAppService.js` real client (replace stub)
- [ ] Outbound: `sendTemplate`, `sendText`, `sendMedia`
- [ ] Inbound webhook `/api/cro/whatsapp/inbound` with signature verification
- [ ] Status callback webhook
- [ ] Opt-out keyword detection
- [ ] Template registry in config

### Phase 5 — Surveys + reminders + retention
- [ ] Post-JC survey trigger (post-commit hook)
- [ ] Post-Complaint survey trigger (on Close action)
- [ ] Public survey response endpoint + one-page form
- [ ] Service-reminder ladder computation
- [ ] Daily cron 09:00 → fire reminders
- [ ] `vw_CRO_CustomerServiceLadder` view + customer-profile UI

### Phase 6 — Inquiry + KYC
- [ ] Inquiry intake form
- [ ] Category-to-department routing
- [ ] Inquiry → Complaint conversion
- [ ] Inquiry → Booking conversion
- [ ] KYC flag create + JobCardForm banner integration
- [ ] KYC acknowledgment audit

### Phase 7 — Reports
- [ ] v1 priority reports (5 reports per §13)
- [ ] CRO Workspace dashboard composition

### Phase 8 — Campaigns
- [ ] Segment-rule builder UI
- [ ] Segment preview (count + sample)
- [ ] Bulk send queue + throttling
- [ ] Send tracking + response capture
- [ ] (v2) Campaign ROI report

### Deferred / not in v1
- v2/v3 reports (§13)
- Web public form for inquiries
- Customer self-service portal
- Voice-call recordings
- Multi-language UI (Urdu)
- Insurance-claim processing workflow

---

## 26. Out of Scope

- Sales-funnel / lead management (separate module, future)
- Insurance claim processing (separate workflow)
- Payroll / attendance based on HR enhancements (HR is a phase-2 build)
- Public customer portal
- Two-way WhatsApp conversational AI

---

## Appendix A: HR Module Gap Quick-Reference

| HR Field | Currently | Needed for CRO | Proposal |
|---|---|---|---|
| `GLUser.LinkedEmployeeID` | absent | route to logged-in user, "my queue" | add FK |
| `gen_EmployeeInfo.ReportsToID` | absent | escalation chain | add self-FK |
| `gen_EmployeeInfo.IsActive` | absent (only ResignDate) | skip inactive in escalation | add bit |
| `gen_DepartmentInfo.ManagerEmployeeID` | absent | dept-level escalation | add FK |
| `gen_DepartmentInfo.DefaultResponderEmployeeID` | absent | reduce manual routing | optional add |
| `addata_CustomerInfo.DoNotContact` | absent | opt-out compliance | add bit |
| `gen_JobCardType.ManagerEmployeeID` | absent | resolve L0 manager directly from JC type (CT/BP→Mgr X, GR/WR→Mgr Y) | add FK to `gen_EmployeeInfo` (§4.8) |
| `Addata_JobCardInfo.ServiceAdvisorID` | absent (free-text name only) | escalation engine — resolve advisor → EmployeeID for L0 notification | add FK (§4.7) |
| `dms_CRO_SystemRoles` | absent | resolve "Executive" / "CRO Manager" without hardcoding | new tiny table — role-key → EmployeeID |

---

_End of design v1.0 — all 14 decisions locked. Doc is build-ready._

---

## Design Session Summary (2026-05-15)

**Decisions locked**: 14 (see §22)
**HR enhancements surfaced**: 6 (see §4 — phase-0 prerequisite to CRO build)
**New tables drafted**: 15 (`dms_CRO_*`)
**Cross-module changes proposed**: 7 (see §21)
**Build phases**: 9 (see §25)

**What's locked**:
- Complaint lifecycle (Product + Service, always JC-linked, no stubs)
- 3-tier cumulative escalation chain (Service Advisor + Dept Manager → +CRO Manager → +Executive)
- Twilio WhatsApp integration shape with 5 named templates
- Survey, retention, campaign, inquiry, KYC, service-ladder mechanics
- Audit logging across 3 tables
- 10 edge cases resolved with explicit handling
- 8 items explicitly deferred to v2/v3

**What's next (when build starts)**:
- Phase 0 — HR foundation: 7 schema migrations + UI updates (prerequisites)
- Phase 1 — CRO scaffolding: 15 `dms_CRO_*` tables, 4 module keys, multer + Twilio service stub
- Phases 2–8 — incremental builds (complaint flow → escalation engine → Twilio wiring → surveys → inquiry/KYC → reports → campaigns)
