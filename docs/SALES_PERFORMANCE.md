# Sales performance — 24 October 2026

## Findings

Read-only checks confirmed the server was on timeout-fix commit acc37d2.
At the diagnostic snapshot, CPU load was 0%, about 58 GB of 64 GB RAM was free,
and no active database requests were blocking the sales queries. Those snapshots
do not establish resource usage at every other time.

Cached historical-payment statements averaged roughly 4–6 seconds with hundreds
of thousands of logical reads. The shared historical pay-order helper used a
correlated OR to repeatedly search voucher/account balances for direct pay
orders and separate opening balances. Booking detail, readiness, Master payment
position and reports use this helper. The previous payment-report fix removed
per-booking repetitions but still ran this slow shared helper once per report.

Booking Account Reconciliation also repeated the complete balance calculation
for every open booking. The bookings list itself returned 322 rows in 63 ms
during the check.

## Changes

- Historical matching aggregates voucher/account balances first, joins direct
  and separate-opening candidates in two disjoint branches, then counts all
  candidates per payment before applying eligibility and capacity rules.
- Global requested capacity still includes payments outside the selected
  booking/report scope. Ambiguous candidates, generated vouchers, reversals,
  insufficient customer credits, explicit allocations and existing tagged
  entries retain their original handling.
- Reconciliation now materializes global eligible pay orders once and aggregates
  gross debits/credits for the open-booking scope in one batch. It includes
  delivery settlements; the payment-status report continues to exclude them.
- No indexes, permissions, timeouts, permanent schema, financial records or
  frontend behavior were changed.

## Validation

These are query timings measured by executing candidates against live data;
they exclude browser rendering and network latency.

| Calculation | Before | Candidate after | Comparison |
| --- | ---: | ---: | --- |
| Booking Payment Status | 6,930 ms | 864 ms | 322 bookings, zero differences |
| Booking Account Reconciliation | 15,222 ms | 164 ms | 207 bookings, zero debit/credit differences |
| Reconciliation, separate initial run | — | 454 ms | 207 bookings |
| Booking Master balance component | Cached shared statements 4–6 seconds | 488 ms | Query component only |

All 127 live historical pay-order matches were compared with the previous
helper: no additions or omissions. Twenty read-only SQL fixtures passed,
including ambiguous accounts, separate openings, filtered-out shared capacity,
delivery, voids, drafts, legacy/source tags and gross reconciliation balances.
176 focused tests passed across nine suites. No live files or processes were
changed during testing; only SELECTs and session-local temporary calculations
were used.

## Deploy

No migration, dependency installation or frontend rebuild is needed for this
backend change. Run from the server's Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```
