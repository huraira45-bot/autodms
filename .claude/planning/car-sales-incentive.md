# Car Sales + OEM Incentive Module — Design

> **Status**: Design in progress (parallel to accounting build session).
> **Started**: 2026-05-12
> **Mode**: Read-only / design-only. Build session to follow once accounting module ships.
> **Scope**: New-car sales for a Changan Motors Pakistan dealership + incentive claim/settlement workflow against the OEM.

---

## Context snapshot (read from existing system)

- **Existing legacy tables (untouched, available to reuse / wrap)**:
  - `addata_VehicleBookingInfo` — initial customer booking
  - `addata_VehicleCommitmentInformation` / `addata_VehicleCommitmentDetail` — committed allocation
  - `addata_VehicleReceiveInformation` (+ `_LogInfo`) — stock receipt from OEM
  - `addata_VehicleSaleInformation` / `addata_VehicleSaleDetail` (+ `_Log` variants) — sale header / lines
  - `addata_VehicleDeliveryInfo` — gate-pass at handover
  - `addata_VehiclePaymentInformation` / `addata_VehiclePaymentDetail` — customer payment schedule
  - `addata_VehiclePaperInHandtInformation` — registration / documents tracking
  - `addata_VehicleTransferInformation` — inter-branch transfer
  - `addata_VehicleRecoveryInformation` / `addata_VehicleRecoveryDetail` (+ logs) — recovery / repossession
  - `addata_VehicleServicesPaymentInformation` / `addata_VehicleServicesPaymentDetail` — bundled service payments
- **Existing accounting hook**: `dms_BankAccounts.VehicleSaleGLID` — already anticipates car-sale GL routing
- **Existing frontend**: `pages/Vehicles.jsx` — `InventItems` CRUD where `ItemType='Vehicle'`. Placeholder only. No booking / sale / delivery flow.
- **Already deferred** (per PROJECT_STATE.md): Car Sales and Incentive Distribution were listed as separate future design sessions. User has now merged them into one design.

---

## Open design questions

(filled in sequentially, one at a time, in the order asked)

### Q1 — Inventory ownership model: how cars enter the dealership
**Answer**: Mixed — methods (a) **outright purchase** (own funds / supplier credit) and (c) **consignment** (Changan retains ownership; dealership only owes on sale). **No bank floor-plan financing.**

**Implications locked**:
- Every received vehicle must carry a `StockType` flag: `OWNED` (method a) or `CONSIGNMENT` (method c).
- GL posting splits by stock type:
  - **OWNED receipt** → `Inventory ↑ / Supplier Payable ↑` (Changan)
  - **CONSIGNMENT receipt** → **memo-only** (physical register, no financial entry); inventory is NOT on the books
  - **OWNED sale** → `COGS ↑ / Inventory ↓` + `AR ↑ / Revenue ↑`
  - **CONSIGNMENT sale** → at moment of customer sale, recognise both legs at once: `COGS ↑ / Changan Payable ↑` AND `AR ↑ / Revenue ↑` (no Inventory touched — it was never on the books)
- Stock-on-hand reports must show both populations but separate them (owned stock value goes to the balance sheet; consignment stock is footnote / off-balance-sheet).
- GST on consignment cars: input tax claimed only at moment of sale, not at physical receipt (because invoice from Changan only crystallises then). To confirm in tax question later.

### Q2 — Owned vs. consignment split logic
**Answer**: Pattern (C) — **Booking + open stock**. The dealership operates with **three distinct stock populations**:

1. **Open stock (OWNED)** — Popular variants pre-purchased from Changan, held on premises for walk-in customers who want immediate delivery. On the dealership's books. Carries unsold-stock risk.
2. **Booked stock (OWNED, pre-sold)** — Cars ordered from Changan against a confirmed customer booking. Briefly held between Changan dispatch and customer collection. Owned, but already committed to a customer.
3. **Demo / display (CONSIGNMENT)** — Test-drive vehicles, showroom display units. Owned by Changan; on the dealership's premises only. Off-balance-sheet.

**Customer advance handling — additional lock**: When a customer pays a booking deposit (or even full payment) at the time of booking, **the dealership holds the cash** for a period before transferring it to Changan. This means:

- Customer money does **not** flow directly to Changan.
- The dealership becomes a temporary **cash custodian** — booking advances sit as a liability (`Customer Booking Advances`) on the dealership's books.
- Transfer to Changan happens later (likely when Changan invoices for the dispatched car, or per a payment-to-OEM cycle).
- Float period between "customer paid" and "OEM paid" is real and must be reportable.

**Implications locked**:
- Every booking record needs `StockSource` enum: `FROM_OPEN_STOCK` (allocate an already-owned car) or `BOOK_TO_ORDER` (order new from Changan).
- For BOOK_TO_ORDER bookings, the booking → Changan-order → receipt chain must be tracked.
- Customer advances: separate GL liability, aged by `(today − ReceiptDate)`, with a "transferred to Changan" lifecycle event.
- Demo/consignment cars: stored in same vehicle master with a `StockType` flag, but excluded from all financial valuations.

### Q3 — Customer payment milestones
**Answer**: Option (v) — **Mixed; varies per customer**. Some pay full at booking, some pay token + balance on delivery, some are bank-financed. No fixed milestone count.

**Late penalties**: "yes it might be" — penalties exist but are **case-by-case / negotiable**, not auto-enforced.

**Price fixed at booking?**: "can be fixed and can't be" — interpreted as **varies per booking**: some bookings have a locked price; others are "price subject to OEM revision at delivery". _**(Flagged for confirmation in Q4.)**_

**Implications locked**:
- **Booking payment plan must be a flexible line-set** — not a rigid 3-stage schema. Each booking has N milestones (1 ≤ N ≤ many), each with `DueDate`, `ExpectedAmount`, `Description` (free text: "token", "allocation", "balance", "bank disbursement", etc.), and a status: Pending / Paid / Waived / Overdue.
- **Penalty policy stored, not auto-enforced**: each booking records its own `PenaltyClause` (free text) + a structured `TokenForfeitureRule` enum (Full Forfeit / Refundable / Partial-with-amount). When a booking is cancelled, the system shows the clause; staff applies it manually via a refund voucher.
- **Bank-financed bookings**: model the bank as a third party on the booking. When delivery happens, the bank's disbursement is one milestone payment posted just like cash from the customer, but the receipt is from the bank's bank account, not the customer.
- **Price-lock flag**: per-booking boolean `IsPriceLocked` + a `PriceRevisionClause` text field. If `IsPriceLocked = false` and OEM revises price before delivery, system triggers a price-revision event (supplementary invoice or refund). _**(Mechanism to be finalised in Q4.)**_

### Q4 — Price-lock semantics (clarification)
**Answer**: Option (C) — **Per-booking flag, decided at booking time**. Some customers get a locked price (priority / premium bookings); others sign a "price subject to OEM revision" booking. The contract — not the day-of-delivery negotiation — decides who eats a price hike.

**Implications locked**:
- Booking record has a non-null boolean `IsPriceLocked` set at booking creation, immutable thereafter.
- For `IsPriceLocked = true`: the agreed price is the contractual price. If OEM revises, dealership absorbs the variance (impacts dealer margin reporting — need a "price-lock loss" GL line).
- For `IsPriceLocked = false`: a price-revision event can fire between booking and delivery. System captures `OriginalPrice`, `RevisedPrice`, `RevisionReason`, `RevisedAt`, `RevisedBy`. Customer is liable for the new total; system generates a delta-invoice or extra-payment milestone.
- Admin override: even on locked bookings, an admin role (`car_sales_admin` or similar) can force a price change with a mandatory reason — audit-logged. This is the safety valve so the system never blocks legitimate edge cases.

---

## ALL REMAINING OPEN QUESTIONS (Q5–Q20) — batched at user's request

### Q5 — Booking lifecycle / states
Proposed: `DRAFT → BOOKED → ALLOCATED → READY → DELIVERED → COMPLETED`; exception path → `CANCELLED → REFUND_DUE → REFUNDED`.
- Q5a. Need distinct **ALLOCATED** state, or skip directly BOOKED → READY?
- Q5b. For FROM_OPEN_STOCK bookings: `BOOKED → READY → DELIVERED` (no ALLOCATED)?
- Q5c. **Finalize fires on which state — DELIVERED (before full payment) or COMPLETED (after all payments cleared)?**

### Q6 — Pricing structure breakdown
What components make up the total a customer pays? Check all that apply:
- (a) Ex-showroom price (OEM base + dealer margin + tax already inside)
- (b) Registration fees (excise, token tax, number plate)
- (c) Insurance (1st-year policy)
- (d) DAP / "on-money" / dealer premium above ex-showroom
- (e) Freight / transport (port → showroom)
- (f) Accessories / dealer-fit add-ons
- (g) Other taxes / withholdings outside ex-showroom (FED, IT, etc.)

### Q7 — Insurance handling
- (i) Customer arranges own; dealership doesn't touch
- (ii) Dealership sells partner insurance and earns commission
- (iii) Dealership wraps insurance into the car invoice
- (iv) Mixed

### Q8 — Registration handling
- (i) Customer registers themselves at excise
- (ii) Dealership handles on customer's behalf for a service fee
- (iii) Mixed

### Q9 — Trade-in / exchange
- (i) No trade-ins
- (ii) Trade-ins accepted; dealership values and takes the old car as stock
- (iii) Trade-ins referred to a third-party used-car desk
- (iv) Trade-ins via Changan certified-pre-owned tie-up

### Q10 — Cancellation & refund
- Q10a. Can cancellation happen after ALLOCATED, or only while BOOKED?
- Q10b. Typical refund: token forfeit %, or full refund?
- Q10c. Does a cancellation auto-release the chassis to the next customer in queue?

### Q11 — Sales staff commission
- (i) No commission (fixed salary)
- (ii) Flat per car
- (iii) % of margin
- (iv) Tied to OEM incentive (cut of the incentive)
- Q11a. Set by deal or by a pre-defined table per-model?
- Q11b. Paid on booking / delivery / month-end / when incentive cash received?

### Q12 — Delivery document set
Which are mandatory at delivery? Check all:
- Tax invoice (GST-compliant)
- Sales certificate / Form-H
- Gate pass
- Owner manual / warranty card / service book
- Registration papers (if dealership-handled)
- Insurance certificate
- Number plate
- Anything else (e.g. accessories checklist, vehicle condition report)

### Q13 — OEM incentive types from Changan
Check all that apply:
- (a) Per-unit fixed incentive (Rs/car on every delivery)
- (b) Volume bonus (extra Rs/car when monthly/quarterly target met)
- (c) Model-mix incentive (slow-moving / specific models)
- (d) Demo car subsidy
- (e) Marketing co-op reimbursement
- (f) Warranty claim labour reimbursement
- (g) Training / certification credit
- (h) Year-end achievement bonus
- (i) Spot / one-off campaign payouts
- (j) Anything else specific to Changan

### Q14 — Incentive accrual timing (per type)
For each type chosen in Q13: recognise when? Options:
- On booking
- On delivery
- On Changan announcement
- On Changan claim approval
- On cash received
- (Default proposal: most incentives accrue on delivery; volume bonuses on target hit; demo subsidy on demo car receipt.)

### Q15 — Incentive claim & settlement
- Q15a. Does dealership file claims to Changan, or does Changan auto-credit?
- Q15b. Settlement form — cash transfer / credit note against next car invoice / mix?
- Q15c. Reconciliation frequency — monthly / quarterly / per-shipment?

### Q16 — Incentive accounting treatment
- (i) Net against COGS (reduces cost of car sold)
- (ii) Separate "Other Income — OEM Incentive"
- (iii) Reduction of supplier payable
- (iv) Mixed by type

### Q17 — Does any incentive flow to staff?
- (i) None — 100% dealership profit
- (ii) Fixed % of per-unit incentive to sales staff
- (iii) Mixed / ad-hoc

### Q18 — Reports needed
Tick what you actually need:
- Booking pipeline (count by state)
- Customer advance liability aging
- Open-stock aging (unsold > 30/60/90 days)
- Daily delivery log
- Sales by model / variant / month
- Overdue collections schedule
- Cancellation report
- Incentive accrual (earned, not yet received)
- Incentive claim status
- Sales staff commission report
- OEM payment reconciliation
- Anything else specific

### Q19 — RBAC module keys
Proposed — confirm or adjust:
- `car_sales_bookings` — create / view / edit
- `car_sales_delivery` — perform delivery / gate-pass
- `car_sales_admin` — price override, cancel approval, finalize
- `car_sales_stock` — receive cars from Changan
- `car_sales_reports`
- `oem_incentive_claims` — record / reconcile
- `oem_incentive_admin` — close incentive period
- `sales_commission_admin` — set commission rules

### Q20 — Table strategy: legacy ERP tables vs. new `dms_*`
Three options:
- (i) Extend legacy `addata_Vehicle*` tables (add DMS columns; mirror Phase-4 finalize pattern)
- (ii) Build new `dms_CarBookings`, `dms_CarSales`, `dms_OEMIncentives` and ignore legacy
- (iii) Wrap legacy in `dms_*` views; write via follow-up UPDATE (mirror `sp_SavePurchaseGRN` pattern)

---

## Locked decisions

_(none yet)_

---

## Deferred / out of scope for this design

_(none yet)_

---

## Build-session checklist

_(to be populated at end of design)_
