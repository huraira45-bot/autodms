// Local temp_db1 only. Migration and every payroll/employee/voucher fixture roll back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const XLSX = require('xlsx');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, point = 0, failSnapshot = false;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'SalarySnapshot' + (++point); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request {
    constructor(context) { super(context?.outer || context); }
    query(text) {
        if (failSnapshot && text.includes('INSERT hr_SalarySheetSnapshots')) return Promise.reject(new Error('Synthetic snapshot write failure'));
        return super.query(text);
    }
}
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => outer;
const controller = require('../controllers/hrSalaryController');
const snapshots = require('../services/salarySheetSnapshotService');
const rq = () => new sql.Request(outer);
const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; }, setHeader(k, v) { this.headers[k] = v; }, send(body) { this.body = body; } });
async function call(fn, req, expected = 200) {
    const res = response();
    try { await fn(req, res); } catch (error) {
        error.message = `${req.body?.MonthID || req.params?.monthId}: controller call ${point}: ${error.message}`;
        throw error;
    }
    assert.equal(res.code, expected, res.body?.error); return res;
}
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    assert.ok(['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host) && process.env.DB_NAME === 'temp_db1', 'Local development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin();
    try {
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/166_salary_sheet_snapshots.sql'), 'utf8');
        for (let attempt = 0; attempt < 2; attempt++)
            for (const batch of migration.split(/^\s*GO\s*$/mi).filter(x => x.trim())) await rq().query(batch);
        const marker = 'SAL' + Date.now(), user = { userId: 1, userName: 'Synthetic payroll verifier' };
        const month = '2091-09';
        assert.equal((await rq().query("SELECT COUNT(*) AS N FROM hr_SalaryPostings WHERE MonthID LIKE '2091-%' OR MonthID='2092-01'" )).recordset[0].N, 0, 'Reserved verification months must be empty.');
        await rq().query('UPDATE gen_EmployeeInfo SET IsOnPayroll=0');
        const gl = [];
        for (const label of ['expense', 'employeeA', 'employeeB', 'cash', 'bank', 'changedBank']) {
            gl.push((await rq().input('code', sql.NVarChar(30), `${marker}${gl.length}`)
                .input('title', sql.NVarChar(500), `${marker} ${label}`).query(`
                    INSERT GLChartOFAccount(GLCode,GLTitle,GLLevel,GLNature,GLType,isParent,Companyid,Status,AccountLevelOne,ReadOnly)
                    OUTPUT INSERTED.GLCAID VALUES(@code,@title,4,1,0,0,1,1,'01',0)`)).recordset[0].GLCAID);
        }
        for (const bankGL of gl.slice(4))
            await rq().input('gl', sql.Int, bankGL).query('INSERT dms_BankAccounts(GLCAID,IsActive) VALUES(@gl,1)');
        await rq().input('gl', sql.Int, gl[3]).query("UPDATE dms_SystemAccounts SET GLCAID=@gl WHERE RoleKey='CASH_BOOK'; IF @@ROWCOUNT=0 INSERT dms_SystemAccounts(RoleKey,GLCAID) VALUES('CASH_BOOK',@gl)");
        const dept = (await rq().input('name', sql.VarChar(100), marker).query('INSERT gen_DepartmentInfo(DepartmentName) OUTPUT INSERTED.DepartmentID VALUES(@name)')).recordset[0].DepartmentID;
        await rq().input('dept', sql.Int, dept).input('gl', sql.Int, gl[0]).query(`INSERT hr_DepartmentSalaryAccounts
            (DepartmentID,SalaryExpenseEobiGLID,SalaryExpenseNonEobiGLID,FuelExpenseGLID,AbsentFineGLID,LateFineGLID,ManualFineGLID,MessRecoveryGLID,EobiPayableGLID,TaxPayableGLID)
            VALUES(@dept,@gl,@gl,@gl,@gl,@gl,@gl,@gl,@gl,@gl)`);
        async function addEmployee(label, salary, employeeGL, bank = false) {
            return (await rq().input('name', sql.VarChar(50), marker + label).input('dept', sql.Int, dept)
                .input('salary', sql.Decimal(8,2), salary).input('gl', sql.Int, employeeGL)
                .input('bank', sql.Bit, bank).input('bankGL', sql.Int, gl[4]).query(`
                INSERT gen_EmployeeInfo(EmployeeName,DepartmentID,BasicSalary,EmployeeGLID,IsActive,IsOnPayroll,IsTechnician,
                    HasEOBI,EOBI,IsPaidByBank,BankPortionAmount,PaymentBankGLCAID,BankAccountNumber,HasMess,MessAmount)
                OUTPUT INSERTED.EmployeeID VALUES(@name,@dept,@salary,@gl,1,1,0,@bank,0,@bank,1000,@bankGL,'OriginalBankAccount',1,50)`)).recordset[0].EmployeeID;
        }
        const a = await addEmployee('A', 3000, gl[1]), b = await addEmployee('B', 4000, gl[2], true);
        await call(controller.saveSalaryEntry, { user, body: { EmployeeID: a, MonthID: month, PaidDays: 30, MessDays: 2, Advance: 100 } });
        await call(controller.saveSalaryEntry, { user, body: { EmployeeID: b, MonthID: month, PaidDays: 30 } });
        const before = await controller._buildSheet(outer, month);
        assert.equal(before.rows.length, 2); assert.equal(before.isFrozen, false);
        const posted = (await call(controller.postAccrual, { user, body: { MonthID: month, PostDate: '2026-10-30' } })).body;
        assert.equal(posted.vouchers.length, 2);
        const fixed = await controller._buildSheet(outer, month), originalJSON = JSON.stringify(fixed);
        assert.equal(fixed.isFrozen, true); assert.equal(fixed.snapshot.basis, 'POSTED');
        assert.deepEqual(fixed.rows, JSON.parse(JSON.stringify(before.rows)));
        await call(controller.postAccrual, { user, body: { MonthID: month, PostDate: '2026-10-30' } }, 409);
        await call(controller.saveSalaryEntry, { user, body: { EmployeeID: a, MonthID: month, Advance: 999 } }, 423);
        await rq().input('a', sql.Int, a).input('b', sql.Int, b).input('bank', sql.Int, gl[5]).query(`
            UPDATE gen_EmployeeInfo SET IsActive=0,BasicSalary=90000,EmployeeName='Changed after posting' WHERE EmployeeID=@a;
            UPDATE gen_EmployeeInfo SET BasicSalary=80000,HasEOBI=0,PaymentBankGLCAID=@bank,BankAccountNumber='ChangedBankAccount' WHERE EmployeeID=@b;
            UPDATE gen_DepartmentInfo SET DepartmentName='Changed department' WHERE DepartmentID=(SELECT DepartmentID FROM gen_EmployeeInfo WHERE EmployeeID=@b);
            UPDATE hr_FineSettings SET LateFinePerMinute=987;
            UPDATE hr_SalaryEntries SET Advance=777 WHERE MonthID='2091-09';`);
        const added = await addEmployee('NEW', 9000, gl[1]);
        assert.equal(JSON.stringify(await controller._buildSheet(outer, month)), originalJSON, 'Employee/department/payroll-setting changes must not alter saved payroll.');
        const future = await controller._buildSheet(outer, '2091-10');
        assert.equal(future.isFrozen, false); assert.ok(future.rows.some(row => row.EmployeeID === added));
        assert.ok(!future.rows.some(row => row.EmployeeID === a));
        const slip = (await call(controller.getEmployeeSlip, { params: { monthId: month, employeeId: a } })).body;
        assert.equal(slip.row.Name, marker + 'A'); assert.equal(slip.isFrozen, true);
        await call(controller.getEmployeeSlip, { params: { monthId: month, employeeId: added } }, 404);
        const excel = (await call(controller.getSalarySheetExcel, { params: { monthId: month } })).body;
        const cells = XLSX.utils.sheet_to_json(XLSX.read(excel, { type: 'buffer' }).Sheets['Salary Sheet'], { header: 1 });
        assert.ok(cells.some(row => row[1] === marker + 'A'));
        assert.ok(!cells.some(row => row[1] === marker + 'NEW'));
        const paid = (await call(controller.postDisbursement, { user, body: { MonthID: month, PostDate: '2026-10-30' } })).body;
        assert.equal(paid.totalPaid, fixed.totalNet, 'Disbursement uses saved net, not later salary changes.');
        const bankVoucher = paid.vouchers.find(v => v.label.startsWith('Bank'));
        const bankLegs = (await rq().input('v', sql.Int, bankVoucher.voucherId).query('SELECT GLCAID,Credit FROM data_FinanceVoucherDetail WHERE VoucherID=@v AND Credit>0')).recordset;
        assert.equal(bankLegs[0].GLCAID, gl[4], 'Saved paying bank is retained.');
        assert.equal(JSON.stringify(await controller._buildSheet(outer, month)), originalJSON, 'Disbursement must not replace the accrual snapshot.');
        const counts = async () => JSON.stringify((await rq().query("SELECT COUNT(*) AS N FROM data_FinanceVoucherInfo;SELECT COUNT(*) AS N FROM hr_SalaryPostings;SELECT COUNT(*) AS N FROM hr_SalarySheetSnapshots")).recordsets);
        const prior = await counts(); failSnapshot = true;
        await call(controller.postAccrual, { user, body: { MonthID: '2091-11', PostDate: '2026-10-30' } }, 400);
        failSnapshot = false; assert.equal(await counts(), prior, 'Failed snapshot must roll back every new salary voucher and posting record.');
        await rq().input('v', sql.Int, posted.vouchers[0].voucherId).query("INSERT hr_SalaryPostings(MonthID,PostingType,VoucherID,TotalAmount,EmployeeCount) VALUES('2091-12','ACCRUAL',@v,0,0)");
        const legacy = await controller._buildSheet(outer, '2091-12');
        assert.equal(legacy.legacyPosted, true); assert.equal(legacy.isFrozen, false);
        const legacySheet = await snapshots.freezeSnapshot(outer, legacy, user, 'LEGACY_CURRENT', posted.vouchers[0].voucherId);
        assert.equal(legacySheet.snapshot.basis, 'LEGACY_CURRENT');
        assert.equal((await snapshots.freezeSnapshot(outer, { ...legacy, rows: [] }, user, 'LEGACY_CURRENT', 0)).rows.length, legacy.rows.length, 'Baseline capture is idempotent.');
        const payFirst = (await call(controller.postDisbursement, { user, body: { MonthID: '2092-01', PostDate: '2026-10-30' } })).body;
        assert.ok(payFirst.vouchers.length); assert.equal((await controller._buildSheet(outer, '2092-01')).snapshot.basis, 'POSTED');
        // Last: the trigger may leave the outer verification transaction uncommittable, which is rolled back below.
        const immutable = await rq().query(`BEGIN TRY UPDATE hr_SalarySheetSnapshots SET SheetJSON=N'{}' WHERE MonthID='2091-09';
            SELECT 0 AS ErrorNumber; END TRY BEGIN CATCH DECLARE @error INT=ERROR_NUMBER();
            IF XACT_STATE()<>0 ROLLBACK TRANSACTION; SELECT @error AS ErrorNumber; END CATCH`);
        assert.equal(immutable.recordset[0].ErrorNumber, 51068);
        console.log('PASS: idempotent migration, real accrual/disbursement snapshots, frozen roster and figures after employee/settings changes, archived slip/Excel, future month remains dynamic, read-only edits, duplicate accrual prevention, snapshot failure rolls back vouchers, labelled/idempotent legacy baselines, first disbursement capture and immutable snapshot guard. All fixtures rolled back.');
    } finally { try { await outer.rollback(); } catch {} }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
