# Gate-pass query timeout — BK-2026-0265

The live booking was fully paid, allocated and reconciled to Master. Gate-pass creation timed out in the voucher-source locking SELECT. SQL Server showed an expensive CXPACKET parallel plan with no blocking session; it was not an unpaid-balance rejection. No gate-pass or delivery voucher had been created for the booking.

Source discovery now starts with the booking's linked pay orders, using two narrow UNION branches for customer and separate opening sources. The helper then locks unique voucher IDs by primary key in ascending order before reading Master capacities. Shared-source protection, payment checks and approval behavior are preserved.

Read-only tracing of the revised delivery path on live booking265 completed in454ms, including source discovery31ms and individual locks3/1ms. The diagnostic stopped before any voucher insert and used no numbering sequence; all diagnostic locks were rolled back. This verifies the pre-write path, not an actual issued gate pass.

199 tests across11 suites and44 synthetic SQL pay-order scenarios/11 mappings/source-ID checks pass. No migration or frontend change is required.

Run on the server:

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Refresh and retry gate-pass issuance. If the matched delivery creates a Draft delivery voucher, its existing finalize/review workflow still applies.
