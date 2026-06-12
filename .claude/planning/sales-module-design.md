# Sales Module — Design Planning

> **Status:** Active design session — 2026-05-16. Drafting in parallel with the user.
> **Out of scope of edit:** §14 Accounting principles, voucher lifecycle, system-account roles, tax handling, finalize chain. Only chart-of-account additions and new system-account roles may be proposed here.
> **Integration contract owners:** Accounting §14 (this doc adds accounts), HR (this doc adds hierarchy + incentive policies), CRO §16 (this doc adds inquiry→booking conversion), Customer (Party-based).

## Decisions Locked

| # | Decision | Source |
|---|---|---|
| 1 | Vehicle catalog is hierarchical: **Model → Variant → Vehicle unit**. Each Variant has its own standard price, specs, and may have its own incentive structure with Master. | User, 2026-05-16 |
| 2 | **No price edits by sales staff.** Negotiated/discounted prices require admin special-permission approval, with full audit trail (proposer, approver, original price, negotiated price, reason). Once approved, the negotiated price is **snapshotted onto the booking**; later policy changes don't affect already-approved bookings. (Same snapshot pattern as §14 tax rates.) | User, 2026-05-16 |
| 3 | **Master incentive accrual trigger = Master Changan invoice posted in our system.** Delivery alone does not accrue. The invoice is a first-class entity with its own state (Pending → Posted). Posting fires the incentive accrual journal. | User, 2026-05-16 |
| 4 | Customer documents at booking — proof of payment (full/partial), PBO/purchase order (optional), CNIC, authority letter, "other". User must type a description before each upload. | User, 2026-05-16 |
| 5 | Two customer-payment paths: (a) **Direct to us** (bank/cash → our account) and (b) **Pay order to Master Changan Motors** (customer's bank issues PO in Master's favor, we never receive cash but a receivable to Master exists on our books). | User, 2026-05-16 |
| 6 | Two Master-allocation patterns for vehicles: **Booked** (Master already received payment, vehicle is ours pending physical delivery) and **Open allocation** (vehicle is physically with us but ownership stays with Master; we pay Master only on retail sale). | User, 2026-05-16 |
| 7 | §14 principles are immutable. Sales module makes additions only. | Pre-locked |

## Open Questions (ordered by blocking impact)

1. 🔴 **Sales staff incentive trigger** — at sale / at customer-full-payment / at Master-invoice-posted / at delivery. Drives the recognition journal and the clawback policy. *(Asked at end of this reply.)*
2. 🟡 Booking account structure — one GL account per vehicle vs one control account + subsidiary ledger per BookingID. (Recommending subsidiary — §14 pattern.)
3. 🟡 Open-allocation accounting — consignment-style memo (off-balance until sale) vs full inventory recognition with deferred liability. (Recommending memo, but need user confirmation re: tax treatment.)
4. 🟡 Negotiation approval threshold — does any discount need admin, or only above a configurable %? (Locked decision #2 says "admin permission" but didn't specify a threshold below which sales staff can autonomously discount.)
5. 🟡 Incentive base — calculated on **standard price** or **negotiated price**?
6. 🟡 Per-variant incentive policies — does each Variant have a different incentive structure with Master, or is it a Model-level policy that variants inherit?
7. 🟡 Premium recognition timing — at customer-overpayment-receipt / at invoice / at delivery?
8. 🟡 Sales hierarchy targets — monthly / quarterly / annual; unit-based vs revenue-based.
9. 🟡 Override incentives — does executive's sale trigger AGM/GM incremental incentive?
10. 🟡 Recovery system — installment plans, aging buckets, collection workflow ownership.
11. 🟡 PBO → Delivery → Gate Pass — stage gates and approvers.
12. 🟡 CRO inquiry → sales staff — auto-route by territory/availability vs manual pick by Sales Manager?
13. 🟡 Customer vs corporate-client schema — one Party row with `PartyType` flag vs separate entities.
14. 🟡 Corporate buyer authorized-signatory + intended-driver — separate records?
15. 🟡 Partial-payment delivery — does delivery require 100% paid, or can vehicle leave under a recovery plan?
16. 🟡 Multi-vehicle bookings for corporate — one booking with line items vs separate booking per VIN?

---

## 1. Overview

The Sales module manages the sale of new vehicles from Master Changan Motors (manufacturer) through Master Changan Multan Motors (dealership) to retail/corporate customers. It owns the **booking → invoice → delivery → gate-pass lifecycle**, the **vehicle inventory** (per-VIN), the **Master settlement flow**, **sales-staff hierarchy + targets + incentives**, and integrates **CRO inquiries** as the upstream funnel.

The module's accounting hooks plug into the §14 voucher lifecycle (one voucher per finalize event, posted on finalize). It introduces **booking-clearing accounts** (per-booking subsidiary against a single GL control account) that net to zero on delivery, mirroring the §14 customer-advance and trade-debtor subsidiary patterns.

🟢 [ASSUMED — auto-dealer industry standard]: A *Booking* is the entity that holds the contract between the dealership and the customer for one specific vehicle (by Model+Variant; the actual VIN may be allocated later). The Booking is the unit of clearing — payments collect against it, Master settlement clears it, delivery closes it.

## 2. Roles & Permissions

🟢 [ASSUMED — confirm or change]:

| Role / module key | Powers |
|---|---|
| `sales_executive` | Create bookings, take payment, upload documents, view own bookings + own customers, view own targets/incentives. |
| `sales_agm` | Sales-Executive permissions + view all executives reporting to them, override-incentive visibility, daily review queue. |
| `sales_gm` | All-team visibility, target setting, incentive-policy edit, monthly close. |
| `sales_admin_pricing` | **Special permission**: approve negotiated price. Cannot create bookings themselves (separation of duties). |
| `sales_admin_settings` | Edit vehicle catalog (Model/Variant), edit Master incentive policies, edit COA-additions. |
| `sales_master_settlement` | Post Master Changan invoices into the system. Triggers incentive accrual. |
| `sales_recovery` | Manage installment plans, recovery follow-ups, write-offs. |
| `sales_reports` | Read-only access to sales reports, incentive runs, aging. |

Hierarchy: `gen_EmployeeInfo.ReportsToID` (already exists from CRO Phase 0) — used to construct the override-incentive tree.

## 3. HR Module Dependencies + Proposed Enhancements

**Already in place** (from CRO Phase 0):
- `gen_EmployeeInfo.ReportsToID` — hierarchy
- `gen_EmployeeInfo.DepartmentID` — for Sales dept membership
- `gen_DepartmentInfo.ManagerEmployeeID` — for "Sales GM is the dept manager"
- `gen_JobCardType.ManagerEmployeeID` — workshop pattern (sales has no JobCardType equivalent, see new entity below)

**Proposed additions:**

### 3.1 `dms_SalesTargets` (NEW)
Per-employee, per-period target. Period granularity is the blocking question #8.

| Column | Notes |
|---|---|
| `TargetID PK` | |
| `EmployeeID` | FK to `gen_EmployeeInfo` |
| `PeriodStart`, `PeriodEnd` | Date range |
| `UnitsTarget` | Optional — # of cars |
| `RevenueTarget` | Optional — PKR |
| `AssignedByEmployeeID`, `AssignedByName`, `AssignedAt` | Audit |

🟡 [PENDING: monthly vs quarterly vs annual — same employee can have multiple overlapping periods, e.g., monthly + annual stretch goal.]

### 3.2 `dms_SalesIncentivePolicies` (NEW)
A flat-or-tiered incentive structure assignable to one or many employees.

| Column | Notes |
|---|---|
| `PolicyID PK` | |
| `Name` | "GM Standard 2026", "Bumper Q3", etc. |
| `RecognitionTrigger` | 🟡 PENDING — see question #1 |
| `BaseType` | `FlatPerCar` / `PercentOfMargin` / `PercentOfStandardPrice` / `PercentOfNegotiatedPrice` |
| `BaseAmount` | Decimal — meaning depends on BaseType |
| `TiersJSON` | Optional — tier structure if not flat. Snapshot at booking time so policy changes don't retro-apply. |
| `OverrideForReportingChain` | Bit — when true, ALL ancestors in `ReportsToID` chain also accrue their own policies on this sale |
| `EffectiveFrom`, `EffectiveTo` | Effective-dated history, same pattern as §14 tax rates |

### 3.3 `dms_SalesIncentiveAssignments` (NEW)
Many-to-many: which employees are assigned to which policies.

### 3.4 Sales hierarchy module key
🟢 [ASSUMED]: needs a new `sales_hierarchy` admin module key in `config/modules.js` to mark which employees are sales-org members and to assign hierarchy roles.

## 4. Accounting Module Dependencies + Proposed Chart of Accounts Additions

⚠ All additions; no §14 principle changes.

### 4.1 New COA leaf accounts

| Suggested code | Account name | Type | Why |
|---|---|---|---|
| 1.1.08 | **Vehicle Inventory** | Asset (Current) | Booked vehicles physically with us, ownership ours, awaiting customer delivery. |
| 1.1.09 | **Vehicles on Consignment (Memo)** | Asset (Off-balance / memo) | 🟡 [PENDING question #3]: if we go memo-only for open-allocation, this is an extra-bookkeeping ledger, not real GL. If we go full recognition, this becomes a real asset offset by a "Master Consignment Liability". |
| 1.1.10 | **Booking Clearing** | Asset OR Liability (control) | Control account; per-booking balance in subsidiary. Holds the running net of (Customer paid) − (Master invoiced) − (Vehicle delivered). Closes to zero on full lifecycle completion. |
| 1.1.11 | **Master Changan — Incentive Receivable** | Asset (subsidiary by Party=Master) | Accrued incentive after Master invoice posts. Cleared on receipt. |
| 1.1.12 | **Master Changan — Special/Additional Incentive Receivable** | Asset | Same pattern as 1.1.11 but separate so reports can distinguish. (May merge with 1.1.11 with a sub-classification — confirm.) |
| 2.1.05 | **Master Changan — Payable** | Liability (subsidiary by Party=Master) | What we owe Master for booked-and-paid vehicles + sold open-allocation cars. |
| 2.1.06 | **Customer Booking Advance** | Liability | Customer payment received before vehicle allocation. (May simply piggyback the existing `CUSTOMER_ADVANCE_RECEIVED` system role tagged by BookingID — see 4.2.) |
| 4.2 | **Vehicle Sale Revenue** | Revenue | Gross sale revenue per vehicle delivered (at standard price). |
| 4.3 | **Vehicle Premium Income** | Revenue | Premium above standard price that hits us directly (not passed to Master). |
| 4.4 | **Vehicle Sales Discount** | Contra-revenue or Expense | Difference between standard and negotiated price. Same pattern as §14 `DEFAULT_DISCOUNT_GIVEN`. |
| 4.5 | **Master Incentive Income — Standard** | Revenue / Other Income | Recognized on Master invoice posted. |
| 4.6 | **Master Incentive Income — Special** | Revenue / Other Income | Policy-driven (campaign-specific). |
| 4.7 | **Master Incentive Income — Additional** | Revenue / Other Income | Policy-driven (target-bonus-specific). |
| 5.4 | **Vehicle Cost of Goods Sold** | Expense | Cost at which Master invoices us for each delivered vehicle. |
| 5.5 | **Sales Staff Incentive Expense** | Expense | Accrued when staff incentive policy triggers. Paid via payroll voucher later. |

### 4.2 Proposed new system-account roles (registered in `dms_SystemAccounts`)

| RoleKey | Maps to |
|---|---|
| `VEHICLE_INVENTORY` | 1.1.08 |
| `BOOKING_CLEARING` | 1.1.10 |
| `MASTER_INCENTIVE_RECEIVABLE` | 1.1.11 |
| `MASTER_PAYABLE` | 2.1.05 |
| `VEHICLE_SALE_REVENUE` | 4.2 |
| `VEHICLE_PREMIUM_INCOME` | 4.3 |
| `VEHICLE_SALES_DISCOUNT` | 4.4 |
| `MASTER_INCENTIVE_INCOME_STANDARD` | 4.5 |
| `MASTER_INCENTIVE_INCOME_SPECIAL` | 4.6 |
| `MASTER_INCENTIVE_INCOME_ADDITIONAL` | 4.7 |
| `VEHICLE_COGS` | 5.4 |
| `SALES_INCENTIVE_EXPENSE` | 5.5 |

🟡 [PENDING question #3]: if open-allocation goes full-recognition: add `MASTER_CONSIGNMENT_LIABILITY` (2.1.0X).

### 4.3 New voucher types

Proposed (auto-posted, follow §14.5 voucher lifecycle):
- `VBV-XXXX` — **Vehicle Booking Voucher** — fires when customer makes a payment against a booking.
- `VSV-XXXX` — **Vehicle Sale Voucher** — fires on Delivery + Gate Pass.
- `VIV-XXXX` — **Vehicle Invoice Voucher** — fires when Master Changan invoice is posted (this is the incentive accrual trigger).
- `MSV-XXXX` — **Master Settlement Voucher** — fires when we pay Master.
- `MRV-XXXX` — **Master Receipt Voucher** — fires when Master pays us (incentive collection).

All five obey the finalize/unfinalize approval chain per §14.9.

## 5. CRO Integration Contract (inquiry handoff)

**Contract:**

A `dms_CRO_Inquiries` row with `Category='ProductInfo'` (or `'Other'` when manually re-routed) is the upstream funnel. The Sales module exposes a conversion endpoint:

`POST /api/sales/inquiries/:inquiryId/convert-to-booking`

Body:
```json
{
  "PartyID": 123,             // existing Party or null to create
  "VehicleModelID": 5,
  "VehicleVariantID": 12,
  "SalesExecutiveID": 87,
  "PreliminaryAmount": null   // optional — partial payment recorded at conversion
}
```

On success: creates a `dms_SalesBookings` row, sets `dms_CRO_Inquiries.LinkedBookingID`, status=`Converted` (existing column from inquiry controller).

🟡 [PENDING question #12]: routing — auto by territory/availability or manual pick by Sales Manager?

🟢 [ASSUMED]: the CRO Inquiry's `ContactName`/`ContactPhone` become the booking's customer contact unless overridden. If the contact is later resolved to an existing Party, link via `PartyID`.

## 6. Schema Overview (entities, relationships)

```
                  ┌──────────────────┐
                  │ gen_PartiesInfo  │  (universal AR/AP party — § 14.2)
                  │ PartyID PK       │
                  │ PartyType        │  ← 'Customer' / 'CorporateCustomer' / 'Supplier' / 'Master'
                  └────────┬─────────┘
                           │
       ┌───────────────────┼──────────────────────────────┐
       │                   │                              │
┌──────▼──────────┐   ┌────▼─────────────┐         ┌──────▼──────────────┐
│ dms_SalesCust   │   │ dms_SalesBookings│         │ dms_SalesCorpClient │
│ (1:1 with Party │   │                  │         │ (1:1 with Party     │
│  when sales-    │   │  BookingID PK    │         │  when type='Corp')  │
│  side details   │   │  PartyID FK      │         │  authorized signer  │
│  needed)        │   │  VehicleModelID  │         │  intended drivers   │
└─────────────────┘   │  VehicleVariantID│         └─────────────────────┘
                      │  AllocatedVehicleID (null until allocated)
                      │  StandardPrice (snapshot at booking)
                      │  NegotiatedPrice (null = use standard)
                      │  PriceApprovalID (FK to NegotiationApproval if discounted)
                      │  Status (Draft/PendingPayment/PaymentReceived/Allocated/Invoiced/Delivered/Cancelled)
                      │  PBONumber (optional)
                      │  CreatedBy_SalesExecutiveID
                      └──────────┬───────────┘
                                 │
              ┌──────────────────┼──────────────────────────┐
              │                  │                          │
       ┌──────▼─────────┐  ┌─────▼────────────┐    ┌────────▼─────────┐
       │ dms_SalesPmts  │  │ dms_SalesDocs    │    │ dms_VehicleInvFromMaster │
       │ Payment(s) on  │  │ proof of payment │    │ Master's invoice  │
       │ a booking      │  │ PBO, CNIC, etc.  │    │ to us — incentive │
       │ Path: Direct / │  │ each row needs   │    │ accrual trigger   │
       │ PayOrder       │  │ user-typed desc  │    │ Status: Pending/Posted │
       └────────────────┘  └──────────────────┘    └───────────────────┘

┌──────────────────┐    ┌────────────────────┐    ┌──────────────────────┐
│ dms_VehicleModel │ ←→ │ dms_VehicleVariant │ ←→ │ dms_Vehicle (per-VIN) │
│ Brand/Series     │    │ Trim, std price,   │    │ ChasisNo, EngineNo,   │
│                  │    │ specs, incentive    │    │ AllocationType,       │
│                  │    │ structure ref       │    │ Status, LocationID    │
└──────────────────┘    └────────────────────┘    └──────────────────────┘

┌──────────────────────────┐   ┌────────────────────────────┐
│ dms_NegotiationApprovals │   │ dms_SalesIncentiveAccruals │
│ proposer/approver/audit  │   │ one row per sale per       │
│ snapshotted prices       │   │ employee with policy snap  │
└──────────────────────────┘   └────────────────────────────┘

┌────────────────────────┐   ┌──────────────────────────┐
│ dms_GatePass           │   │ dms_SalesRecoveryPlans   │
│ Vehicle exit record    │   │ Installment schedule per │
│ Issued by sec officer  │   │ booking under recovery   │
└────────────────────────┘   └──────────────────────────┘
```

## 7. Customer & Corporate Client Model

🟢 [ASSUMED — confirm or change]:

- All buyers (individual + corporate) are rows in `gen_PartiesInfo` (universal AR party).
- `gen_PartiesInfo.PartyType` is extended with values `'Customer'` and `'CorporateCustomer'` (existing values stay).
- Sales-side optional details (CNIC for individuals, NTN/STRN for corporates, authorized-signatory list for corporates, intended-driver list for corporates) live in `dms_SalesCustomerProfile` (1:1 with Party).
- Same Party can also be a workshop customer (`addata_CustomerInfo` row) — joined by PartyID — but the two profiles capture different facets.

🟡 [PENDING question #13]: separate schemas vs one schema with PartyType flag. Recommending the single-Party approach above — minimizes joins, AR subsidiary pattern (§14.5) already supports it.

🟡 [PENDING question #14]: corporate buyer authorized-signatory + intended-driver separation. Recommended: `dms_SalesCorpAuthorizedPersons(PartyID, PersonName, CNIC, Role)` where Role is `'Signatory'` or `'IntendedDriver'`.

## 8. Vehicle Catalog: Models, Variants & Standard Pricing

```
dms_VehicleModel
  ModelID PK, ModelCode (e.g. 'CT'), ModelName ('Changan Alsvin'),
  BrandName (default 'Changan'), IsActive

dms_VehicleVariant
  VariantID PK, ModelID FK, VariantCode ('CT-1.5L-LUX'),
  VariantName ('Alsvin 1.5L Luxury Auto'),
  StandardPrice DECIMAL(18,2),
  SpecsJSON,
  IncentivePolicyJSON  (optional — per-variant incentive structure with Master, see §10)
  IsActive

dms_Vehicle  (one row per physical VIN)
  VehicleID PK, VariantID FK,
  ChasisNo UNIQUE, EngineNo UNIQUE, Color, Year,
  AllocationType ('Booked' | 'OpenAllocation'),
  Status ('AtMaster' | 'InTransit' | 'AtDealer' | 'Allocated' | 'Delivered' | 'Returned'),
  LocationID FK,
  CurrentBookingID FK (null when free),
  MasterInvoiceVoucherID FK (null until Master invoices us)
```

🟡 [PENDING question #6]: per-variant incentive policies — Model-level inherited vs Variant-level overrides.

Example (illustrative):
- **Model: Changan Alsvin** (`CT`)
  - Variant: Alsvin 1.3L Comfort → Standard PKR 4,850,000
  - Variant: Alsvin 1.5L Luxury → Standard PKR 5,650,000
  - Variant: Alsvin 1.5L Luxury Auto → Standard PKR 5,950,000
- **Model: Changan Karvaan** (`KR`)
  - Variant: Karvaan Standard → Standard PKR 2,500,000

## 9. Vehicle Inventory & Allocation Types

| Type | Ownership before sale | Settlement to Master | Inventory recognition |
|---|---|---|---|
| **Booked** | Ours (Master already paid by customer or by us on customer's behalf) | Already settled before vehicle arrives | Full asset (Dr Vehicle Inventory, Cr Master Payable or Customer Advance) |
| **Open Allocation** | Master's (consignment) | We pay Master only on retail sale | 🟡 [PENDING question #3]: memo-only (off-balance, just a tracker) or full-recognition (Dr Vehicle Inventory / Cr Master Consignment Liability). |

🟢 [ASSUMED — recommended]: **Memo-only for open-allocation.** Cleaner books, no inventory inflation, simpler tax position. Open-allocation cars appear in a `dms_OpenAllocationLedger` table and on physical-stock reports, but they do NOT hit the trial balance until sold (at which point a single Vehicle Sale Voucher posts: Dr Customer-AR / Cr Revenue & Cr Master Payable). Confirm before locking.

## 10. Negotiation & Special Pricing Approval Workflow

```
[Sales Executive proposes price < standard]
         │
         ▼
┌───────────────────────────┐
│ dms_NegotiationRequests   │
│ Status: Pending            │
│ BookingID, ProposerEmpID  │
│ StandardPrice, ProposedPrice
│ DiscountAmt, DiscountPct  │
│ Reason (mandatory text)    │
└───────────┬───────────────┘
            │
            ▼
[Admin Special-Permission role reviews]
    Approve ──→ Status: Approved + snapshot ProposedPrice onto Booking.NegotiatedPrice
                Audit row: ApproverEmpID, ApprovedAt, ApproverComments
    Reject  ──→ Status: Rejected + rejection reason
                Booking stays at standard price
```

🟡 [PENDING question #4]: is ANY discount required to go through approval, or only beyond a configurable threshold (e.g., > 1% off standard)?

🟢 [ASSUMED — recommended threshold]: 0% threshold (any discount needs approval). Simpler audit; fits the user's "fully audited" statement in locked decision #2.

## 11. Payment Intake Flows

### 11a. Direct payment to us (Cash, Bank, Cheque, POS)

**Event:** Customer hands over cash / transfers to our bank / gives cheque / POS-swipes.

**Voucher:** `VBV-XXXX` (Vehicle Booking Voucher)

| # | Account | Dr | Cr | Why |
|---|---|---|---|---|
| 1 | Cash Book OR Bank OR Cheques on Hand OR POS Clearing | X |  | We received money |
| 2 | Booking Clearing (subsidiary: BookingID) |  | X | Customer's "I've paid X toward this car" — increases what we owe them in vehicle |

This is a deposit/advance pattern. Booking Clearing carries a credit balance per booking (= customer has paid in but not yet received the car). On delivery, this credit is closed by the sale revenue recognition. Net of all postings against this booking = 0 at lifecycle end.

🟢 [ASSUMED]: piggyback on existing `CUSTOMER_ADVANCE_RECEIVED` (system role from §14.3) tagged by BookingID — same as the §14 pattern for Job Card advance deposits. The "Booking Clearing" account is then just the existing customer-advance control account but with BookingID-keyed subsidiary instead of JobCardID-keyed. **Pending confirmation.**

### 11b. Pay order to Master Changan Motors

**Event:** Customer's bank issues a Pay Order in *Master's* name. We never receive funds; we file the document. Customer's intent is "applied this PO toward booking X".

**Voucher:** `VBV-XXXX` (same type, different leg)

| # | Account | Dr | Cr | Why |
|---|---|---|---|---|
| 1 | Master Changan — Payable (subsidiary: Party=Master) | X |  | Customer paid Master directly on our behalf → reduces what we owe Master |
| 2 | Booking Clearing (subsidiary: BookingID) |  | X | Customer's payment toward this car is recorded just like 11a |

This is the key insight: even though we never touched cash, the customer's payment to Master **discharges part of our future Master Payable**. We recognize that reduction (Dr Master Payable) with the offsetting Cr to Booking Clearing — same Booking Clearing credit balance as path 11a, so delivery accounting is identical regardless of which path the customer used.

🟡 If Master hasn't invoiced us yet (open allocation case), there's no Master Payable to reduce. In that case the customer's PO sits as `Dr Master Changan — Customer-Origin Advance / Cr Booking Clearing`. When Master eventually invoices us, the Customer-Origin Advance gets reclassified against Master Payable. **Pending confirmation re: account naming.**

## 12. Booking Account Lifecycle

(Stage-by-stage debit/credit table — to be expanded once question #1 resolves the incentive trigger and question #3 resolves open-allocation treatment. Skeleton below; full tables in Stage 12.X subsections to follow.)

| Stage | Event | Booking Clearing balance | Vehicle Inventory | Master Payable | Master Incentive Receivable | Revenue |
|---|---|---|---|---|---|---|
| 1 | Booking created | 0 | — | — | — | — |
| 2 | Customer pays (any path) | +Cr (customer money owed back to them as a car) | unchanged | possibly −Dr (path 11b) | — | — |
| 3 | Master allocates vehicle (Booked or Open) | unchanged | +Dr (Booked only) | +Cr (Booked only) | — | — |
| 4 | We pay Master | unchanged | unchanged | −Dr | — | — |
| 5 | Delivery + Gate Pass | reduce by sale amount | −Cr (asset moves out) | unchanged | — | +Cr (Vehicle Sale Revenue) |
| 6 | Master invoice posted | unchanged | unchanged | unchanged | +Dr | +Cr (Master Incentive Income) |
| 7 | Master pays incentive | unchanged | unchanged | unchanged | −Cr | unchanged |
| End | All net zero | **0** | **0** | **0** | **0** | recognized in P&L |

## 13. Master Changan Motors Settlement Flow

(To be drafted next iteration.)

## 14. Premium Recognition

🟡 [PENDING question #7]: premium = the customer-paid amount above the standard price that we keep (Master takes only standard). Three timing options:
- **At customer receipt** — when premium hits our bank, recognize as `Vehicle Premium Income` immediately. Risk: refund if deal falls through.
- **At delivery** — defer premium as a separate liability (Customer Booking Advance — Premium portion) until delivery; then move to income. Conservative.
- **At Master invoice posted** — mirror standard sale recognition. Most consistent.

🟢 [ASSUMED — recommended]: at delivery. Same trigger as Vehicle Sale Revenue; symmetric treatment.

## 15. Incentive System (standard, special, additional)

(To be drafted in next iteration once question #1 + question #6 resolve.)

## 16. Vehicle Lifecycle & Invoice-Driven Incentive Accrual

(Detailed staging — Stage 1 / 2 / 3 — to be expanded with debit/credit per the §14 voucher pattern. Skeleton already covered in §12.)

🔒 **Locked rule:** Incentive recognition trigger = Master invoice posted in our system, NOT delivery, NOT sale-close. Enforced via code-level guard in the accrual posting hook. No accrual path bypasses Master invoice post. Audit trail mandatory.

## 17. Document Management

🟢 [ASSUMED — confirm or change]:

| DocType | Mandatory? | Notes |
|---|---|---|
| `ProofOfPayment` | At every payment line | Bank slip / pay-order copy / cash receipt scan |
| `PBO` (Purchase Order) | Optional | Corporate buyers; not required for retail |
| `CNIC` | Mandatory for individual buyer | Both sides |
| `AuthorityLetter` | Mandatory for corporate buyer | Authorizes signatory |
| `Other` | Optional | User must enter description ≥ 5 chars before upload |

UI rule: file picker is disabled until DocType is chosen AND a `Description` field has been filled by the user.

Reuse existing multer pattern: `middleware/croUpload.js` style; `Software/uploads/sales/`. Soft-delete with `DeletedAt`.

## 18. Sales Workflow: PBO → Invoice → Delivery → Gate Pass

```
[Booking Created]
   │
   ▼
[Payment(s) Recorded]  ──── ProofOfPayment uploads at each payment
   │
   ▼
[Vehicle Allocated]   ──── chassis/engine assigned (from Booked stock or Open Allocation)
   │
   ▼
[Master Invoice Pending]  ←──── (could remain in this state for weeks)
   │
   ▼
[Vehicle Invoice Posted by sales_master_settlement role]
   │      └──→ fires incentive accrual journal
   │
   ▼
[Delivery Approved]   ←──── requires 🟡 [PENDING question #15: 100% paid?]
   │
   ▼
[Gate Pass Issued]    ←──── physical exit; auto-fires Vehicle Sale Voucher
   │
   ▼
[Closed]               ←──── all subsidiary accounts net to zero
```

🟡 [PENDING question #11]: detailed approver per stage. Default — Sales Executive creates booking, AGM/GM approves delivery, security officer issues gate pass.

## 19. Sales Staff Hierarchy, Targets & Incentive Policies

(Skeleton in §3. Full draft after question #1 lock.)

## 20. Recovery System

🟡 [PENDING question #10]: installment plans, aging buckets, ownership.

🟢 [ASSUMED — recommended starting point]:
- `dms_SalesRecoveryPlans(BookingID, InstallmentJSON, OwnerEmployeeID)` — only created when delivery proceeds without 100% paid (if that's allowed; see #15).
- Daily cron flags overdue installments → notification to recovery-owner.
- 30/60/90-day aging report.
- Write-off requires admin approval, posts as Bad Debt Expense.

## 21. CRO Inquiry → Sales Assignment Flow

Contract from §5 above. Detailed routing rule pending question #12.

## 22. Reports

🟢 [ASSUMED priority list — confirm and reorder]:

v1 (build first):
1. **Booking Pipeline** — funnel: inquiries → bookings → allocated → invoiced → delivered.
2. **Vehicle Stock Position** — booked vs open vs sold-pending-invoice vs delivered, by Model/Variant.
3. **Master Invoice Aging** — vehicles delivered awaiting Master invoice; threshold trigger for finance to chase.
4. **Sales Staff Performance** — target vs actual, accrued incentive, paid incentive, by hierarchy roll-up.
5. **Incentive Receivable Aging** — accrued but not collected from Master.

v2:
6. Negotiation Audit — every discount approved, by approver.
7. Premium Capture — premium income by model/variant.
8. Recovery Aging — overdue installments.
9. Corporate vs Retail mix.
10. Per-Variant Profitability — standard price vs negotiated + incentive realized.

## 23. Audit Logging

Every state transition and every approval logs to a `dms_SalesAuditLog` table — pattern mirrors the existing `dms_CRO_AdminAudit`. Mandatory fields: `BookingID`, `EntityType`, `EntityID`, `Action`, `OldValue`, `NewValue`, `ActorEmployeeID`, `ActorName`, `At`.

## 24. Edge Cases

**Resolved (designed-for):**
- Customer cancels after partial payment but before delivery → refund flow; booking moves to `Cancelled`, all Booking Clearing entries reverse.
- Master invoice arrives for a returned/cancelled vehicle → 🟡 must define reversal path. Likely: incentive reversal voucher; if cash was received, Dr Master Incentive Income / Cr Bank.
- Incentive policy changes between delivery and invoice arrival → snapshot policy at invoice-post date (consistent with §14 tax-rate snapshot rule).

**Deferred:**
- Master invoice never arrives (expected incentive write-off after configurable aging + admin approval).
- Vehicle physical loss / damage in transit.
- Mid-month employee transfer between policy assignments — defer to v2.
- Multi-currency (Master in USD/CNY) — defer; assume PKR throughout.

## 25. Decisions Log

See "Decisions Locked" at top. Will sync here after each session.

## 26. Open Questions

See "Open Questions" at top.

## 27. Deferred Items

- Multi-currency Master invoicing.
- Insurance financing partner integration.
- Used-car trade-in (counter-credit against new car).
- Master incentive write-off workflow (aged-out accruals).

## 28. Build Checklist

(Populated after design freeze.)

## 29. Out of Scope

- Workshop accounting (covered by §14 already).
- Service campaigns to existing vehicle owners (covered by CRO Campaigns module).
- Vehicle insurance sales / financing (out of MVP scope).
- Pre-owned car sales.
