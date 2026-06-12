---
title: "Accounting Module — Design Document"
subtitle: "Workshop Management System"
author: "Huraira Muzaffar"
date: "2026-05-12"
toc: true
toc-depth: 2
numbersections: false
---

\newpage

# Cover

**Title:** Accounting Module — Design Document

**Subtitle:** Workshop Management System

**Prepared by:** Huraira Muzaffar

**Date:** 2026-05-12

**Version:** 1.0

**Status:** Approved Design — Pending Implementation

\newpage

# Executive Summary

The Accounting Module is the financial backbone of the Workshop Management System. It records every workshop transaction — vehicle service jobs, parts received from suppliers, parts returned, counter sales, and manual financial entries — into a double-entry general ledger with full per-customer and per-supplier tracking. Every financial movement is dated, attributed to a user, and traceable to a source document.

This module matters because it delivers three outcomes the business cannot operate without: **regulatory compliance** with FBR (Federal Board of Revenue) tax filing requirements, **financial integrity** through immutable audit trails on every journal entry, and **audit readiness** so the workshop can answer any question — from a customer asking *"what does my account balance show?"* to an auditor asking *"what was the GST rate on this specific sale eighteen months ago?"* — without manual reconstruction.

## What Is In Scope

- Job Card finalisation and revenue recognition (parts, labour, sublet)
- Goods Receipt Notes (GRN) and Goods Return Notes (GRTN) — purchases and returns to suppliers
- Store Sale and Store Sale Returns (SSR) — over-the-counter parts sales
- Manual journal entries via Voucher Entry
- Receive Payment from customers and Make Payment to suppliers
- Cash, Cheque, POS card, and Bank Transfer payment handling
- Customer and supplier advance payments
- Insurance jobs with split receivables between vehicle owner and insurance company
- GST (Sales Tax on parts) and PST (Provincial Sales Tax on labour) with full historical rate tracking
- Three-party approval workflow for reversing finalised records
- Twenty-six standard reports for daily operations, compliance, and management
- Three-tier audit trail covering compliance, operational, and security events

## What Is Out of Scope

This design intentionally excludes domains that warrant their own focused design effort: vehicle sales (selling cars from inventory), payroll processing for staff salaries, and incentive distribution to departments and salespeople. The foundation laid out in this document accommodates each of these as future extensions without architectural rework.

## Timeline Expectation

The build effort is structured around a thirteen-item implementation checklist (see Section 18). Each item is independently estimable; the team can sequence them based on capacity and dependency. The complete module — from database schema through user interface — is the next deliverable following approval of this design.

\newpage

# 1. Foundational Principles

These ten principles are the non-negotiable foundation of the module. Every implementation choice descends from these.

1. **Posting only on Finalisation.** Working drafts of any document have no effect on the books. Financial records appear only when the document is explicitly committed. This keeps reports honest and never shows provisional numbers.

2. **One voucher per finalisation event.** A single Job Card finalisation produces exactly one voucher containing all related journal lines — sales, taxes, cost of goods, sublet payables, and the cash receipt. This simplifies audit and reversal.

3. **Posted journal lines are immutable.** Once a journal entry is committed, its amounts can never be edited. Any correction must take the form of a separate reversal entry. This is universal accounting practice and a hard requirement for regulatory compliance.

4. **Reversals are mirror entries.** When a finalised document is unfinalised, the system creates a new voucher with debits and credits flipped. Both vouchers remain visible; the audit trail is never erased.

5. **Per-party subsidiary tracking.** Each customer and supplier carries its own running balance. The general ledger holds only summary "control accounts" that aggregate all parties together. This keeps the chart of accounts small while preserving per-party history.

6. **Per-line tax snapshot.** Every line on a Job Card or purchase document stores its own tax rate and tax amount at the time it was saved. Future rate changes never silently re-price open documents.

7. **Discount before tax.** Tax is calculated on the discounted (net) amount, never on the gross. This is the FBR-correct approach and prevents the workshop from over-paying tax on discounted sales.

8. **Revenue at gross; discount as separate line.** Revenue is reported at list price, with discount given recorded as its own contra-revenue line. Management can see both total revenue and total discount cost.

9. **Finalisation applies to every voucher.** Whether a voucher was auto-generated from a document or manually keyed by the accountant, it goes through the same Draft → Posted → Reversed lifecycle and the same three-party approval chain for unfinalisation. There are no back-door changes to the books.

10. **Block unfinalise on downstream dependencies.** If a document has been consumed downstream (parts issued, items returned, payments received), it cannot be unfinalised until the dependents are reversed first. This guarantees clean cascading and prevents inconsistent states.

\newpage

# 2. Chart of Accounts Structure

The chart of accounts follows a five-level hierarchy organised by the standard accounting classes: Assets, Liabilities, Equity, Revenue, and Expenses. Customer and supplier balances are tracked in a separate *subsidiary ledger*[^1] linked to the general ledger via summary "control accounts."

[^1]: **Subsidiary ledger** — A separate per-party balance table that rolls up to a single summary account ("control account") in the main ledger. Allows thousands of customers without bloating the chart of accounts.

## Hierarchy

**1. Assets**

- 1.1 Current Assets
  - 1.1.01 Cash & Bank — includes the designated Cash Book and one or more Bank accounts marked as banks
  - 1.1.02 POS Clearing[^2]
  - 1.1.03 Cheques on Hand
  - 1.1.04 Inventory (Parts)
  - 1.1.05 Receivables
    - Trade Debtors — control account for all credit customers
    - General Customer — system account for walk-in cash customers
  - 1.1.06 Input GST — recoverable from FBR
  - 1.1.07 Supplier Advance Paid

[^2]: **POS Clearing** — A temporary holding account for credit-card payments. Funds sit here from the moment a customer pays at the terminal until the bank deposits them into our account 1–2 days later.

**2. Liabilities**

- 2.1 Current Liabilities
  - 2.1.01 Trade Creditors — control account for all suppliers and sublet vendors
  - 2.1.02 GST Payable
  - 2.1.03 PST Payable
  - 2.1.04 Customer Advance Received

**4. Revenue**

- 4.1 Workshop Revenue
  - Service Revenue — labour performed by our own staff
  - Parts Sales Revenue
  - Sublet Revenue — outsourced repair work resold to the customer
  - Purchase Return Variance — small income from returns at carrying cost

**5. Expenses**

- 5.1 Cost of Goods Sold (parts consumed in Job Cards or Store Sales)
- 5.2 Cost of Services (Sublet Cost — what we pay outsourced vendors)
- 5.3 Operating Expenses
  - Default Discount Given
  - Rounding Adjustment
  - Bank Charges

## Control Accounts and Subsidiary Ledger

Trade Debtors and Trade Creditors are *control accounts* — they hold a single rolled-up balance in the main ledger. Each individual customer and supplier carries its own running balance in the party master table. The total of all subsidiary balances must always equal the control account balance. This relationship is enforced atomically: every party transaction writes both the general ledger entry and the subsidiary entry in the same database transaction.

\newpage

# 3. System Accounts

The module recognises twelve "system roles" — designated single-purpose accounts that automated postings rely on. Each role points to exactly one chart-of-accounts entry. Administrators can re-point a role to a different account; old postings stay where they were originally posted.

## System Accounts Registry

| # | Role | Account Type | Purpose | Reassignment Rule |
|---|------|--------------|---------|-------------------|
| 1 | Cash Book | Asset | Receives and disburses physical cash | Re-point only |
| 2 | General Customer | Asset (subsidiary) | Catch-all for walk-in cash customers | Re-point only |
| 3 | GST Payable | Liability | GST collected from customers on parts | Re-point only |
| 4 | Input GST | Asset | GST paid to suppliers — recoverable from FBR | Re-point only |
| 5 | PST Payable | Liability | PST collected on labour and sublet revenue | Re-point only |
| 6 | POS Clearing | Asset | Card payments awaiting bank settlement | Re-point only |
| 7 | Default Discount Given | Expense | Care-Off discounts applied to Job Cards | Re-point only |
| 8 | Rounding Adjustment | Either | Tiny rounding orphans from tax calculations | Re-point only |
| 9 | Purchase Return Variance | Revenue | Small income from supplier returns at carrying cost | Re-point only |
| 10 | Customer Advance Received | Liability | Customer pre-payments and overpayments | Re-point only |
| 11 | Supplier Advance Paid | Asset | Pre-payments to suppliers | Re-point only |
| 12 | Cheques on Hand | Either | Cheques received or issued before bank clearance | Re-point only |

## How Reassignment Works

When an administrator changes the account that fills a system role, the change is forward-looking only. All journal entries already posted to the previous account stay exactly where they were — the audit trail is never altered. All new postings made after the change land in the newly assigned account.

If the administrator attempts to reassign a role whose previous account has historical postings, the system displays a confirmation warning that names the previous account and indicates the balance and posting count. The administrator must explicitly confirm before the change takes effect. Every reassignment is permanently logged with the changing user, the date, the previous account, and the new account.

This design avoids the dangerous alternative of having the system silently move historical balances behind the user's back. If the administrator needs to consolidate the old balance into the new account, they post an explicit manual journal entry — visible, dated, and auditable like any other transaction.

\newpage

# 4. Tax Handling

## Tax Rates

Two taxes apply to workshop transactions in Pakistan:

- **GST (General Sales Tax)** — applied to parts only. Default rate: 17%.
- **PST (Provincial Sales Tax)** — applied to labour and sublet revenue only. Default rate: 16%.

Both rates are configurable. Administrators with the appropriate permission can change them at any time through a dedicated settings screen.

## Where Tax Rates Live

The system maintains a complete history of every rate ever in effect. The tax rates table records, for each rate:

- Which tax (GST or PST)
- The rate value
- The date the rate took effect
- The date it was superseded (blank for the current rate)
- The user who changed it and the timestamp

A rate change does not overwrite the previous rate — it closes the previous row by stamping its end date and opens a new row for the new rate. This allows the system to answer compliance questions like *"what GST rate applied to a specific invoice dated 14 March 2024?"* with certainty, even years later.

## Who Can Change Tax Rates

Only administrators with the Accounting Settings permission may modify tax rates. Every change is automatically captured in the historical record without requiring any additional action.

## What Happens to Existing Records When the Rate Changes

This is one of the most important guarantees the module provides:

- **Already-finalised documents** are unaffected. Their tax amounts are locked at the rate that applied when they were committed. They will never silently re-price.
- **Open (saved but not yet finalised) documents** keep their existing line-level tax rates as long as those lines are not edited. The system records a *snapshot*[^3] of the rate on each line at the moment it was saved.
- **New lines added** to an open document after the rate change use the new current rate.
- **Existing lines that are edited** (price or quantity changed) refresh their snapshot to the current rate.

[^3]: **Snapshot** — A copy of a value at a specific point in time, frozen against subsequent changes. The line stores both the rate that applied when saved and the calculated tax amount.

This rule eliminates the most common cause of accounting errors at rate-change boundaries: open documents being silently re-priced.

## Calculation Order

Tax is always calculated on the **net** amount — that is, after any discount is applied to the line. This is the FBR-correct treatment and ensures the workshop does not pay tax on revenue it did not collect.

The flow is:

> Net price = Line price − Discount
> Tax = Net price × Tax rate
> Line total = Net price + Tax

The discount itself is recorded as a separate line in the journal entry, posted to the Default Discount Given account. Revenue is recorded at the gross (list) price. This separation allows management to see both total revenue and the cost of discounts given.

## Filing with FBR

At month-end, the accountant posts a manual journal entry that nets the Input GST account against the GST Payable account. The remaining balance is the net amount owed to (or refunded from) FBR. The same pattern applies to PST filing with the provincial revenue authority.

\newpage

# 5. Voucher Lifecycle

Every financial transaction in the books is recorded as a *voucher*[^4] — a balanced collection of journal lines with metadata about who created it, when, and why. Vouchers move through three distinct states.

[^4]: **Voucher** — A balanced collection of journal entries posted to the general ledger as a single unit, with a unique number, date, narration, and metadata identifying who created and approved it.

## The Three States

**Draft.** The voucher has been created but not yet committed to the books. It has no effect on account balances or reports. Draft vouchers are used in two situations: when an administrator is reviewing an automatically generated batch entry (such as a POS settlement) before finalising it, and when an accountant is entering a manual journal entry but has not yet committed it. Draft vouchers can be edited freely.

**Posted.** The voucher has been committed. Its amounts now affect the relevant accounts and appear in all reports, the trial balance, and the audit trail. A posted voucher is *immutable* — its amounts cannot be edited under any circumstance. Corrections must take the form of a separate reversal voucher.

**Reversed.** A posted voucher has been paired with a mirror reversal voucher. The original voucher remains visible, the reversal voucher is also posted with debits and credits flipped, and the net effect on every account is zero. Both vouchers stay in the books permanently. The original is marked as having been reversed; the reversal is linked back to the original.

## State Transitions

> **Draft → Posted.** The user clicks Post. The voucher becomes immutable and affects the books.
>
> **Posted → Reversed.** Requires the three-party approval chain. The administrator who initiates the reversal cannot complete it alone — an Account Manager must approve, and then a separate administrator with reversal authority executes it. At execution, the reversal voucher is generated and both the original and the reversal are marked appropriately.
>
> **Draft → discarded.** A draft can be deleted without trace, because it never affected the books.

## Why This Matters

The Draft / Posted / Reversed model gives the workshop two safety properties simultaneously:

- **Operational flexibility.** Routine batch operations (POS settlement, monthly payroll, year-end adjustments) can be auto-calculated and reviewed by an administrator before being committed. Mistakes caught in the Draft state can be corrected without leaving a trace.
- **Regulatory rigour.** Once committed, no transaction can disappear. Every correction is a visible, dated, attributable event. This is what FBR auditors expect to see, and it is what every mature accounting system in the world implements.

\newpage

# 6. Worked Examples

The following scenarios show how the module records real workshop transactions. Each example presents the business scenario, the journal entry that results, and a brief explanation of what the entry achieves.

## 6.1 Job Card Finalisation

**Scenario.** A walk-in customer brings a car in for service. The Service Advisor adds an oil filter (PKR 500 cost to customer), an oil change service (PKR 1,500 with a 10% Care-Off discount), a brake inspection (PKR 500 with the same 10% discount), and a wheel alignment performed by an outsourced vendor (PKR 1,000 to customer, PKR 800 cost to us). The customer pays cash at delivery: PKR 3,833 total.

**Journal Entry**

| Account | Debit | Credit | Party |
|---------|------:|-------:|-------|
| General Customer | 3,833 | | Walk-in |
| Parts Sales Revenue | | 500 | |
| Service Revenue | | 2,000 | |
| Sublet Revenue | | 1,000 | |
| Default Discount Given | 200 | | |
| GST Payable | | 85 | |
| PST Payable | | 448 | |
| Cost of Goods Sold — Parts | 195 | | |
| Inventory — Parts | | 195 | |
| Sublet Cost | 800 | | |
| Trade Creditors | | 800 | Karachi Wheel Center |
| Cash Book | 3,833 | | |
| General Customer | | 3,833 | Walk-in |
| **Totals** | **8,861** | **8,861** | |

**What this achieves.** The customer's invoice is recognised at list-price revenue (PKR 3,500 across all line types), with the PKR 200 discount visible as a separate cost. Taxes are recorded as liabilities owed to FBR. Inventory is reduced at its landed cost. The vendor who performed the wheel alignment becomes a creditor for the PKR 800 we owe them. Cash received is deposited to the Cash Book. The General Customer account transits to zero — the activity is visible for daily reconciliation, but no permanent receivable balance remains.

## 6.2 Goods Receipt (GRN)

**Scenario.** Goods received from ABC Auto Parts: 100 oil filters at PKR 200 each, plus 50 brake pads at PKR 400 each. The supplier provides a PKR 1,000 trade discount after tax and charges PKR 500 for freight. Both freight and parts are subject to GST. The supplier's invoice total of PKR 46,385 is on 30-day credit terms.

**Landed Cost Calculation.** The freight is added and the discount is subtracted across line totals proportionally, yielding a landed cost of PKR 197.50 per oil filter and PKR 395.00 per brake pad.

**Journal Entry**

| Account | Debit | Credit | Party |
|---------|------:|-------:|-------|
| Inventory — Parts | 39,500 | | |
| Input GST | 6,885 | | |
| Trade Creditors | | 46,385 | ABC Auto Parts |
| **Totals** | **46,385** | **46,385** | |

**What this achieves.** The full landed cost of all received parts (including the share of freight, minus the share of discount) is added to inventory at the per-unit cost the workshop actually paid. The full GST shown on the supplier's invoice is recorded as recoverable from FBR. The supplier becomes a creditor for the net amount payable. The PKR 1,000 trade discount is not shown as a separate line in the journal — it has already reduced inventory cost, which is the accounting-correct treatment.

## 6.3 Goods Return (GRTN)

**Scenario.** Twenty of the oil filters from the previous GRN turn out to be defective. The workshop returns them to ABC Auto Parts. The supplier issues a credit note for PKR 4,000 in parts and PKR 680 in GST — total credit PKR 4,680.

**Carrying Cost.** The 20 filters were sitting in inventory at the landed cost of PKR 197.50 each — total carrying value PKR 3,950.

**Journal Entry**

| Account | Debit | Credit | Party |
|---------|------:|-------:|-------|
| Trade Creditors | 4,680 | | ABC Auto Parts |
| Inventory — Parts | | 3,950 | |
| Input GST | | 680 | |
| Purchase Return Variance | | 50 | |
| **Totals** | **4,680** | **4,680** | |

**What this achieves.** The supplier reduces our payable by the credit note amount. Inventory is reduced at the carrying cost so that the remaining 80 filters still sit at their original PKR 197.50 each — the per-unit cost is preserved cleanly. The PKR 50 variance — representing the share of discount and freight benefit retained on the returned units — is recognised as a tiny income line.

## 6.4 Store Sale and Sale Return

**Scenario.** A walk-in customer buys 2 oil filters at PKR 500 each from the counter. Cost to the workshop is PKR 197.50 each (landed). Customer pays cash.

**Journal Entry — Store Sale**

| Account | Debit | Credit | Party |
|---------|------:|-------:|-------|
| General Customer | 1,170 | | Walk-in |
| Parts Sales Revenue | | 1,000 | |
| GST Payable | | 170 | |
| Cost of Goods Sold — Parts | 395 | | |
| Inventory — Parts | | 395 | |
| Cash Book | 1,170 | | |
| General Customer | | 1,170 | Walk-in |
| **Totals** | **2,735** | **2,735** | |

**What this achieves.** Counter sale revenue, GST collected, inventory consumption at landed cost, and cash receipt all in one balanced entry. Same architecture as a Job Card, simpler shape because there is no labour or sublet.

**Sale Return Scenario.** The customer returns one of the two filters the next day. Workshop refunds PKR 585 (PKR 500 plus PKR 85 GST).

**Journal Entry — SSR**

| Account | Debit | Credit | Party |
|---------|------:|-------:|-------|
| Parts Sales Revenue | 500 | | |
| GST Payable | 85 | | |
| Inventory — Parts | 197.50 | | |
| General Customer | 585 | | Walk-in |
| Cost of Goods Sold — Parts | | 197.50 | |
| General Customer | | 585 | Walk-in |
| Cash Book | | 585 | |
| **Totals** | **1,367.50** | **1,367.50** | |

**What this achieves.** Revenue and tax are reversed on the returned unit. The part is restored to inventory at its original carrying cost. The customer is refunded in cash, with the General Customer account transiting cleanly to zero.

## 6.5 Insurance Job

**Scenario.** Customer Ali's vehicle is repaired under his EFU General Insurance policy. Total invoice is PKR 70,100 (parts plus labour plus GST plus PST plus COGS). Per the policy: depreciation of PKR 5,000 and under-insurance of PKR 2,100 are payable by Ali. The insurance company pays the remaining PKR 63,000.

**Journal Entry**

| Account | Debit | Credit | Party |
|---------|------:|-------:|-------|
| Trade Debtors | 7,100 | | Ali (customer) |
| Trade Debtors | 63,000 | | EFU Insurance |
| Parts Sales Revenue | | 50,000 | |
| Service Revenue | | 10,000 | |
| GST Payable | | 8,500 | |
| PST Payable | | 1,600 | |
| Cost of Goods Sold — Parts | 30,000 | | |
| Inventory — Parts | | 30,000 | |
| **Totals** | **100,100** | **100,100** | |

**What this achieves.** A single physical Job Card produces a single voucher, but the receivable is split between two parties. Ali appears on the customer statement at PKR 7,100. EFU Insurance appears on its statement at PKR 63,000. Revenue is recognised in full against Ali (the actual service recipient); the insurance company is simply paying part of his bill. When each party pays — likely Ali at delivery and EFU some weeks later — a separate Receive Payment voucher closes the relevant balance.

\newpage

# 7. Payment Flows

## Receive Payment from Customers

When a customer pays an invoice, a dedicated Receive Payment screen handles the full workflow:

- The user selects the customer (or specifies "walk-in deposit against a particular Job Card").
- The screen displays the customer's outstanding invoices with their ages and any unallocated advance balance.
- The user enters one or more payment lines — multiple modes are permitted in a single receipt (e.g., partly cash, partly cheque).
- The user allocates the payment across one or more outstanding invoices. By default, the oldest invoice is settled first; the user can override.
- If the customer pays more than the outstanding total, the excess routes automatically to the Customer Advance Received account, tagged to that customer.
- If the customer pays before any invoice exists (a deposit), the full amount goes to Customer Advance Received tagged to the customer or, for a walk-in deposit, to a specific Job Card number.

Each receipt produces a single balanced voucher. The rule is: one voucher per party per payment event. Two different parties paying on the same day are recorded as two separate vouchers.

## Make Payment to Suppliers

Symmetric to Receive Payment. The user picks the supplier or sublet vendor, sees outstanding invoices, enters payment lines, and allocates. Overpayments go to the Supplier Advance Paid account. The voucher debits the supplier's subsidiary (clearing what we owe) and credits Cash, Bank, or Cheques on Hand depending on the payment mode.

## Cheque Handling

The workshop accepts cheques from customers and pays suppliers by cheque. Cheques carry timing risk (1–7 days to clear; occasional bouncing). The module handles this through a single Cheques on Hand account that captures cheques in either direction:

- **Cheque received from customer:** debited to Cheques on Hand; the customer's subsidiary is credited immediately.
- **Cheque clears at our bank:** debited to the specific Bank account; Cheques on Hand is credited (net effect: cheque is now actual cash).
- **Cheque bounces:** Cheques on Hand is credited; the customer's subsidiary is debited (their balance returns to what it was before the failed payment).
- **Cheque issued to supplier:** the supplier's subsidiary is debited; Cheques on Hand is credited (it goes negative, representing a future outflow).
- **Issued cheque clears at our bank:** Cheques on Hand is debited; the Bank account is credited.

The balance of the Cheques on Hand account at any moment shows the net amount of cheques in transit.

## POS Clearing Settlement

When a customer pays by card, the system holds the funds in the POS Clearing account until the bank settles 1–2 days later, typically less a small commission. The settlement is processed in a hybrid workflow:

- An auto-generated draft voucher proposes the settlement using the commission rate configured for that bank.
- An administrator reviews the draft against the actual bank statement, adjusting amounts, excluding any transactions the bank rejected, and confirming the deposit value.
- Once posted, the settlement voucher debits the Bank account (the net deposit), debits Bank Charges (the commission), and credits POS Clearing (clearing the in-transit amount).

This hybrid approach catches bank-side anomalies that fully automated reconciliation would silently miss, while still saving the routine work of reconstructing the settlement from scratch.

## Advance Payments

Customers occasionally pay before any Job Card has been created — either to secure a future repair slot or because they happened to leave cash. The system handles three variations:

- **Named customer with no current invoice:** The advance is credited to Customer Advance Received, tagged to that customer. When their next invoice is created, the system prompts to apply the advance.
- **Walk-in deposit against a specific Job Card:** The advance is credited to Customer Advance Received, tagged to that Job Card number rather than to a customer party. When that specific Job Card is finalised, the system finds the advance via the Job Card number and applies it automatically.
- **Customer overpays an invoice:** The portion settling the invoice closes it; the excess routes to Customer Advance Received, tagged to the customer.

The same Customer Advance Received account handles all three cases; only the subsidiary "tag" differs.

The mirror pattern applies on the supplier side: prepayments to suppliers route to Supplier Advance Paid, tagged to the supplier party.

\newpage

# 8. Invoice Presentation

Every printed customer invoice presents amounts in a **tax-exclusive** format: line items are shown at their net (post-discount) prices, with GST and PST appearing as separate visible lines, and the final total at the bottom.

## Specimen Layout

> ```
> JOB CARD JC-CT-0042
> ───────────────────────────────────
> Oil Change Service         1,500.00
> Brake Inspection             500.00
>                          ──────────
> Labour subtotal            2,000.00
> Discount (10%)              -200.00
>                          ──────────
> Net labour                 1,800.00
>
> Parts:
> Oil Filter (×1)              500.00
>
>                          ──────────
> Subtotal                   2,300.00
> PST 16% (on labour)          288.00
> GST 17% (on parts)            85.00
>                          ──────────
> TOTAL                      2,673.00
> ```

The tax-exclusive presentation is preferred by FBR and is unambiguous for corporate customers, fleet managers, and insurance assessors who need to reconcile tax amounts against their own records. Tax-inclusive invoices (where prices already contain tax) are not supported by this design.

\newpage

# 9. Reports

The module produces twenty-six standard reports grouped into six categories. Together they cover daily operations, regulatory compliance, party balances, financial statements, audit trails, and management analysis.

## Daily Operations

| # | Report | Purpose | Primary Users | Frequency |
|---|--------|---------|---------------|-----------|
| 14 | Daily Cash Book | All cash in and out for a day; reconciles physical cash drawer | Cashier, Manager | Daily |
| 15 | POS Settlement Pending | All card receipts not yet settled by bank | Cashier, Accountant | Daily |
| 16 | Cheques on Hand | Cheques in transit, by status | Accountant | Daily / weekly |
| 17 | Bank Balance Summary | Balance per bank account | Manager, Accountant | Daily |
| 23 | General Customer Daily Reconciliation | Transit lines for a day; should sum to zero at close | Cashier, Accountant | Daily |

## Compliance and Tax

| # | Report | Purpose | Primary Users | Frequency |
|---|--------|---------|---------------|-----------|
| 10 | GST Output Summary | GST collected on parts sales during a period | Accountant | Monthly (FBR filing) |
| 11 | GST Input Summary | GST paid on purchases during a period | Accountant | Monthly (FBR filing) |
| 12 | PST Output Summary | PST collected on labour and sublet | Accountant | Monthly (provincial filing) |
| 13 | Tax Rate Change History | When tax rates changed, by whom | Auditor, Manager | On demand |

## Party Balances

| # | Report | Purpose | Primary Users | Frequency |
|---|--------|---------|---------------|-----------|
| 6 | Customer Statement | Per-customer ledger with running balance | Accountant, Customer | On demand |
| 7 | Supplier Statement | Per-supplier ledger with running balance | Accountant, Supplier | On demand |
| 8 | Receivables Aging | Customer balances by age bucket (current / 1–30 / 31–60 / 61–90 / 90+) | Manager, Accountant | Weekly |
| 9 | Payables Aging | Supplier balances by age bucket | Manager, Accountant | Weekly |

## Financial Statements

| # | Report | Purpose | Primary Users | Frequency |
|---|--------|---------|---------------|-----------|
| 1 | Trial Balance | All account balances at a point in time | Manager, Accountant, Auditor | Monthly |
| 2 | General Ledger Detail | All transactions in a chosen account for a period | Accountant, Auditor | On demand |
| 3 | Profit and Loss | Revenue, COGS, expenses, net profit for a period | Manager, Owner | Monthly |
| 4 | Balance Sheet | Assets, Liabilities, Equity at a point in time | Manager, Owner | Monthly |
| 5 | Day Book | All vouchers posted on a given day | Accountant, Auditor | Daily |

## Audit Trail

| # | Report | Purpose | Primary Users | Frequency |
|---|--------|---------|---------------|-----------|
| 24 | Voucher Audit Trail | All vouchers in a period, by status (Draft / Posted / Reversed) | Auditor, Manager | On demand |
| 25 | System Account Reassignment Log | Every change to which account fills a system role | Auditor, Manager | On demand |
| 26 | Care-Off Audit | Every Care-Off creation, modification, and discount application | Manager | On demand |

## Management Analysis

| # | Report | Purpose | Primary Users | Frequency |
|---|--------|---------|---------------|-----------|
| 18 | Discount Given Report | Total discounts applied, broken down by Care-Off authoriser | Manager, Owner | Monthly |
| 19 | Sales Register | All invoiced Job Cards, GRN, GRTN, Store Sale for a period | Manager | Daily / monthly |
| 20 | Insurance Claims Aging | Outstanding insurance receivables by claim age | Manager, Accountant | Weekly |
| 21 | Gross Margin Report | Revenue minus discount, COGS, and sublet cost — by Job Card or period | Manager, Owner | Monthly |
| 22 | Inventory Valuation | Current stock at landed cost per item | Manager, Accountant | Monthly |

\newpage

# 10. Audit Trail

The module captures audit information at three tiers. Each tier serves a different audience and a different question. All three are implemented through specific, focused audit tables — never a single generic log.

## Tier 1 — Compliance

These records satisfy regulatory and financial-integrity requirements. They cannot be skipped.

- **Voucher creation, posting, and reversal.** Captured intrinsically in the voucher header — every voucher carries the creating user, creation timestamp, posting timestamp, and (if reversed) a pointer to the reversal voucher.
- **Finalise and unfinalise events.** Captured on the source document and in the unfinalise request table — every finaliser, approver, and admin executor is named and timestamped.
- **Tax rate changes.** Captured in the effective-dated tax rates table itself.
- **System account reassignments.** Captured in a dedicated system-account audit table.

## Tier 2 — Operational

These records help internal users answer *"who changed this?"* questions and catch operational mistakes.

- **Care-Off operations.** Every Care-Off creation, modification, and discount application is logged.
- **Customer and supplier master-data edits.** Changes to party name, address, contact details, or party type are captured in a dedicated party audit table with before-and-after values.
- **Bank designation toggles.** When an account is marked or unmarked as a bank.

## Tier 3 — Security

These records support security review and user-account management.

- **Login and logout events**, including failed login attempts.
- **Password changes and resets.**
- **User role and permission changes.**

Each tier writes to its own dedicated audit table. Audit data is never edited or deleted — it is append-only.

\newpage

# 11. Edge Cases and Resolutions

## Resolved Edge Cases

| Edge Case | Resolution |
|-----------|------------|
| Tax rate changes while documents are open | Per-line snapshot rule applies automatically. Lines not edited keep their existing rate; new lines and edited lines use the current rate. |
| Cheque bounces | A standard reversal voucher restores the customer's outstanding balance and clears the Cheques on Hand entry. |
| POS bank settles for a different amount than expected | The administrator edits the draft settlement voucher to match the actual deposit before posting. |
| Supplier discount netting | Trade discount reduces inventory cost; full GST input is still claimed (matching what the supplier reports to FBR). |
| Walk-in customer leaves a deposit against a specific Job Card | The advance is recorded against the Job Card number, not against a customer party, and auto-applies when that Job Card is finalised. |
| Customer pays multiple invoices in one transaction | Single Receive Payment voucher with multiple allocation lines, each closing one invoice. |
| Customer overpays | Excess routes to Customer Advance Received, ready for application to a future invoice. |

## Deferred Edge Cases

| Edge Case | Reason Deferred |
|-----------|-----------------|
| Insurance company approves only part of the claim | Rare in practice. When it does occur, the accountant posts a manual journal entry (write off as bad debt, or charge back to the customer). No dedicated workflow needed. |
| Unfinalising a document whose downstream effects already exist | The system blocks the attempt with a clear error listing the dependent documents. The user must reverse the downstream documents first. No partial unfinalise is permitted. |

\newpage

# 12. Decisions Log

All thirty design decisions, in chronological order, with reasoning.

| # | Decision | Reasoning |
|---|----------|-----------|
| 1 | Chart of accounts uses subsidiary ledger pattern | Customer and supplier count will grow; the main ledger must stay small. Per-party balances live separately, rolling up to control accounts. |
| 2 | Freight on supplier bills is capitalised into inventory cost | Standards-compliant treatment (IAS 2). Produces honest unit costs and accurate margin reports. |
| 3 | Twelve system accounts for the workshop scope | Limited to what the workshop module needs. Will grow when car sales, payroll, and incentives are added in their own design sessions. |
| 4 | System role reassignment is re-point only | Simplest, safest pattern. Avoids "magic" journal entries. Consolidation, if ever needed, is done by explicit manual entry. |
| 5 | Tax rates stored in effective-dated history table | FBR audit can answer "what was the rate on date X?" with certainty. |
| 6 | Per-line tax snapshot at save time | Open documents are not silently re-priced when rates change. |
| 7 | Tax calculated on net amount (discount before tax) | FBR-correct. The workshop does not over-pay tax on discounted sales. |
| 8 | Supplier discount post-tax reduces inventory cost; full GST input claimed | Matches what the supplier reports to FBR. Trade discount reduces inventory cost in books. |
| 9 | PST applies to labour and sublet; no Input PST account | Sublet vendors are typically unregistered and do not charge PST. Our customer-side PST applies to all services rendered. |
| 10 | Posting is triggered only on finalisation | The ledger always reflects committed reality. Reports stay trustworthy. |
| 11 | Unfinalise creates a mirror reversal voucher | Audit trail is never altered. FBR-safe. Universal practice. |
| 12 | One voucher per finalisation event | Cleaner audit and reversal than splitting into multiple vouchers. The chart of accounts itself provides reporting granularity. |
| 13 | Cash, POS, Bank, and Cheque receipts at finalise combine with the sale into one voucher, via General Customer transit | Provides a daily cash-sales audit trail. Consistent flow across payment modes. |
| 14 | Revenue at gross; discount as its own separate line | Lets management see both list revenue and total discount cost. |
| 15 | Freight taxability on GRN configured per-GRN; defaults to taxable | Matches the actual supplier invoice. Some suppliers charge GST on freight, others do not. |
| 16 | GTRN reduces inventory at landed cost; variance to Purchase Return Variance | Preserves unit cost stability across the remaining inventory. |
| 17 | Receive Payment and Make Payment have dedicated workflow screens | Front-desk staff and cashiers are not accountants. A workflow-aware screen prevents the misallocations that raw voucher entry produces. |
| 18 | Customer Advance Received supports tagging by party or by Job Card number | Walk-in deposits against a specific Job Card need no customer record to be tracked. |
| 19 | Single Cheques on Hand account handles both directions | Balance represents net amount in transit. Simpler than two separate accounts. |
| 20 | Insurance jobs use one Job Card with a split receivable | One physical job; the receivable splits between two subsidiaries — the customer and the insurance company. |
| 21 | Receive Payment may contain multiple payment modes in one voucher; one voucher per party per payment event | Matches how customers actually pay. Clean audit. |
| 22 | POS Clearing settlement uses hybrid auto-batch with administrator review | Catches bank-side variance manually while reducing routine work. |
| 23 | Invoices display tax-exclusive only | FBR-preferred. Unambiguous for corporate and insurance customers. |
| 24 | This design session covers workshop accounting only | Car sales, payroll, and incentive distribution each warrant their own focused design session. |
| 25 | Store Sale finalisation follows the same pattern as a Job Card (parts-only) | Reuses the Job Card voucher structure minus labour, sublet, and PST. |
| 26 | Sale Return Voucher references the original Store Sale | Prevents fraudulent returns; mirrors the GRN-to-GRTN reference pattern. |
| 27 | Audit log covers all three tiers; specific tables per event type | Domain-specific audit tables are queryable and reportable. A generic god-table is impractical. |
| 28 | Finalise and unfinalise apply to all vouchers (auto and manual). Voucher Status: Draft / Posted / Reversed | Manual journal entries get the same audit discipline as auto-posted ones. No back-door changes to the books. |
| 29 | Insurance partial approval handled via manual journal entry, no dedicated UI | Rare scenario. Accountant has full ability to handle through standard voucher entry. |
| 30 | Unfinalise blocked when downstream references exist | Forces clean cascade. No partial reversal complexity. |

\newpage

# 13. Out of Scope

This design intentionally does not address the following. Each has a clear reason for exclusion, and each can be added later without rework to the foundation laid out here.

- **Vehicle sales** (selling cars from inventory to retail customers). Distinct domain with its own per-VIN inventory tracking, pay-order handling, withholding tax, vehicle sales tax, and trade-in flows. Will be its own design session.
- **Payroll processing** (monthly staff salaries, deductions, EOBI, withholding tax). Distinct domain with its own posting cycle and tax rules. Will be its own design session.
- **Incentive distribution** (department-wise service bonuses and individual car-sales commissions). Builds on top of payroll. Will be its own design session.
- **Stock-take adjustments** (correcting inventory based on physical counts). Will be added after the core module ships.
- **Inter-branch transfers.** Not currently a business need; the workshop operates from a single location.
- **Multi-company and multi-fiscal-year operation.** The database schema supports both, but the user interface for them is deferred.
- **IFRS-style Cash Flow Statement.** Trial Balance and Daily Cash Book cover practical needs for a workshop. Formal cash flow statements are typically not required until external financing or audited statements are needed.

\newpage

# 14. Deferred Items

Three substantial domains are explicitly deferred to their own design sessions. The current design's foundation accommodates all three without architectural change.

## Future Session A — Car Sales Accounting

**What it will cover.** Per-VIN vehicle inventory; pay-order handling from buyers; vehicle sales tax (separate from GST); withholding tax on advances; customer financing via leasing companies; trade-in vehicle valuation; relationship with the parent company including incentives, target bonuses, and demo-car allocations.

**Why deferred.** A separate domain with substantially different accounting treatment (per-VIN tracking rather than quantity inventory; different tax rules; different regulatory reporting). Adding it to the current session would have tripled the scope and diluted depth.

**Likely addition to system accounts.** Five to eight new accounts (Vehicle Inventory, Vehicle Sales Revenue, Vehicle Cost, Withholding Tax Payable, Pay-orders in Transit, Trade-in Settlement, Parent Company Incentive Receivable).

## Future Session B — Payroll and HR

**What it will cover.** Monthly salary run; additions (overtime, allowances, commissions); deductions (advances, EOBI, withholding tax, fines, loans); posting structure by department; separate vouchers for paying staff, EOBI authority, and tax authority.

**Why deferred.** Standard payroll module with its own tax engine, calculation rules, and approval workflow. Best handled by a focused session, ideally with the HR lead and the accountant in the room.

**Likely addition to system accounts.** Five to eight new accounts (Salary Payable, EOBI Payable, Income Tax Withheld, Staff Advances Receivable, Staff Loans Receivable, and similar).

## Future Session C — Incentive Distribution

**What it will cover.** Department-wise service bonus pools (when service department hits a target, pool gets distributed to its staff); individual car sales commissions (per car sold, commission allocated to the responsible salesperson); accrual versus cash basis decisions; approval workflow; integration with payroll.

**Why deferred.** Builds on top of payroll. Hard to design in isolation; better positioned after payroll is fixed.

**Likely addition to system accounts.** Two to three new accounts (Incentive Payable, Commission Expense, and related).

\newpage

# 15. Implementation Checklist

The build effort breaks into thirteen items. The order shown reflects natural dependency — earlier items unblock later ones — but team capacity may justify reordering parallel-eligible items.

| # | Build Item | Notes | Complexity |
|---|------------|-------|------------|
| 1 | Create new database tables for system accounts, system account audit, tax rates, party audit, login audit, password audit, and permission audit | Schema-only work; no application logic | Low |
| 2 | Extend the voucher header table to support Draft / Posted / Reversed status, source document reference, and reversal pointer | Schema migration on an existing table; care needed to preserve existing manual voucher data | Medium |
| 3 | Extend the voucher detail table to support party tagging and Job Card tagging for subsidiary tracking | Schema migration; required for advance handling | Medium |
| 4 | Extend the bank accounts table to support per-bank POS commission rate and Bank Charges account designation | Small schema change; UI follows | Low |
| 5 | Build the party-level subsidiary ledger table and associated maintenance logic | Foundation for all per-party balance reporting | Medium |
| 6 | Seed initial system accounts through an administrator UI | Twelve roles to assign; should be a one-time setup screen | Low |
| 7 | Seed default tax rates (GST 17%, PST 16%) | Single seed record per tax | Low |
| 8 | Implement the five auto-posting flows: Job Card, GRN, GTRN, Store Sale, SSR | The core of the module; each flow follows the worked example exactly | High |
| 9 | Build Receive Payment and Make Payment screens | Workflow-aware UI with party search, allocation, and multi-mode payment support | High |
| 10 | Build POS Settlement screen with hybrid auto-batch and admin review | Includes draft voucher generation, edit, and post | Medium |
| 11 | Build the twenty-six standard reports | Prioritise Trial Balance, Customer Statement, Supplier Statement, Daily Cash Book, and the two tax summaries first | High |
| 12 | Extend the unfinalise workflow to manual vouchers (add the Voucher entity to the approval-chain entity map) | Small extension to existing approval-chain logic | Low |
| 13 | Implement the unfinalise cascade-block rule for documents with downstream references | Pre-approval check across all entity types; clear error message format | Medium |

**Overall effort estimate.** This is a substantial module — measured in weeks, not days. The lowest-complexity items can be parallelised; the high-complexity items (auto-posting flows, payment screens, reports) are sequential within themselves. A realistic plan involves the team estimating each line item against current capacity once the design is approved.

\newpage

# Appendix A — Glossary

Plain-English definitions for every domain term used in this document.

**Advance Payment.** A payment received from a customer before any invoice has been issued, or a payment made to a supplier before goods have been delivered. Held as a balance until applied against a future invoice.

**Audit Trail.** A permanent, append-only record of who did what and when. Cannot be edited or deleted.

**Care-Off.** A discount authority granted to a named employee, capped at a maximum percentage. The employee may approve discounts up to the cap on Job Cards.

**Cheques on Hand.** An account holding cheques (incoming or outgoing) that have not yet cleared at the bank.

**Chart of Accounts.** The complete list of financial accounts the workshop uses, organised in a five-level hierarchy.

**Clearing Account.** A temporary holding account used when funds are in transit between two places. Examples: POS Clearing (between customer's card and our bank) and Cheques on Hand.

**COGS (Cost of Goods Sold).** The cost of parts consumed in a sale or service, recognised at the moment the parts leave inventory.

**Control Account.** A summary account in the main ledger that holds the total balance of many subsidiary entries.

**Credit Sale.** A sale where the customer agrees to pay later. The customer's outstanding balance increases at the moment of sale; payment is received in a separate transaction.

**Discount Before Tax.** The tax-correct method of calculation: discount is subtracted from the line price first, and tax is applied to the resulting net amount.

**Double-Entry.** The fundamental accounting principle that every transaction has two equal sides — a debit and a credit — and total debits always equal total credits.

**FBR.** Federal Board of Revenue. Pakistan's national tax authority.

**Finalisation.** Locking a document so that its contents cannot be edited, and posting its journal entry to the books.

**General Customer.** A designated account that serves as the catch-all customer for walk-in and cash sales. Every cash receipt transits through this account, creating a daily reconciliation audit trail.

**General Ledger.** The main book of accounts where every committed transaction is recorded.

**GRN (Goods Receipt Note).** A document recording parts received from a supplier.

**GRTN (Goods Return Note).** A document recording parts returned to a supplier.

**GST (General Sales Tax).** A national tax on goods (parts) in Pakistan, currently 17%. Charged to customers and remitted to FBR; offset against GST paid on purchases.

**Input GST.** GST paid by us when we purchase from suppliers. Recoverable from FBR by offset against output GST collected from customers.

**Insurance Job.** A workshop service paid for in part by the customer (depreciation, under-insurance, excess) and in part by the customer's insurance company.

**Inventory.** Parts held in the workshop's stock, valued at landed cost.

**Job Card.** The primary workshop document recording all work performed on a vehicle, including parts, labour, sublet, and customer details.

**Landed Cost.** The total cost of a part by the time it sits on the shelf — supplier price plus a proportional share of freight, minus any trade discount.

**Mirror Reversal.** A new voucher posted to undo a previous voucher, with all debits and credits flipped. The original voucher is never deleted or edited.

**PST (Provincial Sales Tax).** A provincial tax on services (labour) in Pakistan, currently 16%.

**POS Clearing.** An account holding card payments after the customer has paid at the terminal but before the bank has settled the funds to our bank account.

**Posting.** Writing a voucher's journal lines into the general ledger and the relevant subsidiary ledgers.

**Receivable.** Money owed to the workshop by a customer or insurance company.

**Reversal.** The act of cancelling a previously posted voucher by creating a mirror voucher. The original stays visible.

**Snapshot.** A copy of a value frozen at a specific point in time. Each Job Card line stores a snapshot of the tax rate that applied when it was saved.

**SSR (Store Sale Return).** A return of parts previously sold over the counter through a Store Sale.

**Store Sale.** An over-the-counter sale of parts to a customer without a Job Card.

**Sublet.** Repair work outsourced to an external vendor (e.g., wheel alignment, panel work). Billed to the customer at our markup; the vendor is paid separately.

**Subsidiary Ledger.** A separate per-party balance system that rolls up to a control account in the main ledger.

**System Account.** One of twelve designated accounts the module's automated postings always reach. Each role points to exactly one chart-of-accounts entry; administrators can re-point a role.

**Tax Snapshot.** See Snapshot.

**Trade Creditors.** The control account for all suppliers and sublet vendors. Each supplier carries an individual balance in the subsidiary.

**Trade Debtors.** The control account for all credit customers. Each customer carries an individual balance in the subsidiary.

**Trial Balance.** A list of every account in the general ledger with its current balance. Total debits must equal total credits.

**Unfinalise.** The act of unlocking a previously finalised document, achieved through a three-party approval chain.

**Variance.** A small income or expense arising from differences between recorded amounts and actual amounts. The Purchase Return Variance account captures the benefit retained when goods are returned to suppliers at carrying cost.

**Voucher.** A balanced collection of journal lines posted as a single unit. Every transaction in the books is a voucher.

\newpage

# Appendix B — Document Control

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-12 | Huraira Muzaffar | Initial release. Approved design pending implementation. |

## Approval

**Document Owner.** Huraira Muzaffar

**Status.** Approved Design — Pending Implementation

**Implementation Authority.** To be assigned at the start of the build session.

## References

This document derives from the Accounting Module — Design section of the Workshop Management System internal documentation. The original technical specification lives with the engineering team and contains additional implementation detail not required for executive review.

## Distribution

This document is intended for the management of the dealership and the engineering team responsible for implementation. Future revisions will be issued through the same channel as the build effort progresses.
