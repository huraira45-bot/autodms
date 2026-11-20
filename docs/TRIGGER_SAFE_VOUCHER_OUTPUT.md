# ID returns on protected tables

SQL Server rejects OUTPUT returned directly from INSERT/UPDATE when the target has an enabled trigger for that action (error 334). The permanent-booking and month-lock protections exposed this compatibility problem in existing application queries. The reported Pay Master case is BK-2026-0010.

Active controllers and services now return identity/result IDs using a local INT table variable: DECLARE, OUTPUT INSERTED.ID INTO the variable, then SELECT the same ID column. This supports inserts, document updates and bulk voucher-line updates without disabling protections or changing the API result shape. The original DML, accounts, amounts, parameters, permissions and transactions are unchanged. An inverse comparison against HEAD verified every modified application file differs only by this SQL conversion. Historical maintenance scripts were excluded from the release.

Validation: 182 tests passed in 10 affected regression suites, including a new scan preventing direct OUTPUT on protected application tables. JavaScript syntax passed for every changed application file. A rollback-only live test of the corrected Pay Master service used booking BK-2026-0010 and active bank 102002016 with protection triggers enabled. It returned the correct ID and created a balanced Draft with two PKR 1 lines. The transaction was rolled back, and an independent query confirmed no test voucher remained. No payment was committed.

The full suite also ran: four unchanged legacy journal-builder suites have existing failures for missing fixture GL mappings and older Store Sale journal expectations. A fifth failure was the Paint GRN SQL mock assuming INSERT was the first statement; that mock was updated for the table-variable declaration and all its tests now pass. Those four legacy suites and their builder code are unchanged by this release.

Deployment requires a Git pull and application restart only. No migration, lock removal, frontend build or data correction is required. Source deployment remains manual on the server.
