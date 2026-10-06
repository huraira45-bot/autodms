-- request_unfinalize_oct_salary.sql
--
-- Owner ask 2026-10-06: raise the unfinalize requests for the salary run
-- posted on 5 Oct 2026 under the WRONG payroll month (2026-10).
--
-- The seven vouchers, all Posted, all from 2026-10-05 16:35:
--   JV-1216   accrual, EOBI            2,483,235.85   60 emp
--   JV-1217   accrual, Non-EOBI        1,502,395.71   41 emp
--   CPV-0706  Non-EOBI cash            1,502,395.71   41 emp
--   CPV-0707  EOBI cash                  218,153.33    9 emp
--   BPV-0518  bank GL 32197            1,738,882.53   46 emp
--   BPV-0519  bank GL 32187              397,033.33    3 emp
--   BPV-0520  bank GL 32192              129,166.66    2 emp
--                                      -------------
--                        accrued = disbursed = 3,985,631.56, 101 employees
--
-- This only RAISES the requests (Status PENDING). Nothing in the ledger
-- moves until the Accounts Manager approves and an admin executes, and the
-- execute step posts a reversing voucher rather than deleting anything.
--
-- It repeats the three guards the API applies, so a voucher that should not
-- be touched is skipped rather than queued:
--   1. the voucher is still 'Posted'
--   2. nothing else Posted is allocated against it
--   3. it has no PENDING / AM_APPROVED request already
--
-- Safe to re-run: a second run inserts nothing.
SET NOCOUNT ON;

-- Who is asking. Audit fields only; change if you raise these as someone else.
DECLARE @by     INT           = 1;
DECLARE @byName NVARCHAR(100) = 'admin';

DECLARE @reason NVARCHAR(MAX) = N'Posted under the wrong payroll month. '
    + N'This run was booked as 2026-10 on 5 Oct 2026, before October''s attendance, '
    + N'advances, fines, mess days and holds were entered - the accrual and the '
    + N'disbursement come to the same 3,985,631.56, which only happens when the '
    + N'month carries no deductions at all. Reversing the whole run so the payroll '
    + N'can be posted against the correct month.';

DECLARE @targets TABLE (VoucherNo NVARCHAR(50) PRIMARY KEY);
INSERT INTO @targets (VoucherNo) VALUES
    ('JV-1216'), ('JV-1217'),
    ('CPV-0706'), ('CPV-0707'),
    ('BPV-0518'), ('BPV-0519'), ('BPV-0520');

-- What will be skipped, and why, before anything is written.
SELECT  t.VoucherNo,
        CASE
            WHEN v.VoucherID IS NULL              THEN 'SKIP - no such voucher'
            WHEN v.Status <> 'Posted'             THEN 'SKIP - status is ' + v.Status
            WHEN EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                         JOIN data_FinanceVoucherInfo o ON o.VoucherID = d.VoucherID
                         WHERE d.AllocatedToVoucherID = v.VoucherID
                           AND o.Status = 'Posted' AND o.VoucherID <> v.VoucherID)
                                                  THEN 'SKIP - another posted voucher is allocated against it'
            WHEN EXISTS (SELECT 1 FROM dms_UnfinalizeRequests r
                         WHERE r.EntityType = 'VOUCHER' AND r.EntityID = v.VoucherID
                           AND r.Status IN ('PENDING','AM_APPROVED'))
                                                  THEN 'SKIP - a request is already open'
            ELSE 'WILL REQUEST'
        END AS Verdict,
        v.Status, v.TotalAmount, v.VoucherDate
FROM    @targets t
LEFT    JOIN data_FinanceVoucherInfo v ON v.VoucherNo = t.VoucherNo
ORDER   BY t.VoucherNo;

INSERT INTO dms_UnfinalizeRequests
        (EntityType, EntityID, EntityRef, RequestedBy, RequestedByName, Reason)
SELECT  'VOUCHER', v.VoucherID, v.VoucherNo, @by, @byName, @reason
FROM    @targets t
JOIN    data_FinanceVoucherInfo v ON v.VoucherNo = t.VoucherNo
WHERE   v.Status = 'Posted'
  AND   NOT EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                    JOIN data_FinanceVoucherInfo o ON o.VoucherID = d.VoucherID
                    WHERE d.AllocatedToVoucherID = v.VoucherID
                      AND o.Status = 'Posted' AND o.VoucherID <> v.VoucherID)
  AND   NOT EXISTS (SELECT 1 FROM dms_UnfinalizeRequests r
                    WHERE r.EntityType = 'VOUCHER' AND r.EntityID = v.VoucherID
                      AND r.Status IN ('PENDING','AM_APPROVED'));

PRINT CONCAT(@@ROWCOUNT, ' unfinalize request(s) raised.');

-- What is now waiting for the Accounts Manager.
SELECT  r.RequestID, r.EntityRef, r.Status, r.RequestedByName, r.RequestedAt
FROM    dms_UnfinalizeRequests r
JOIN    @targets t ON t.VoucherNo = r.EntityRef
WHERE   r.EntityType = 'VOUCHER'
  AND   r.Status IN ('PENDING','AM_APPROVED')
ORDER   BY r.EntityRef;
