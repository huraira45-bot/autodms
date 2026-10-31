// Local SQL verification. All schema, roster, HR and booking changes roll back.
require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');
const { sql } = db;
const realGetPool = db.getPool;
let tx;
db.getPool = async () => ({ request: () => new sql.Request(tx) });
const service = require('../services/salesExecutiveService');
const controller = require('../controllers/salesExecutiveController');
const admin = { groupId: 1, userId: 1, userName: 'Roster verification' };
const query = text => new sql.Request(tx).query(text);
const response = () => ({ code:200,status(code){this.code=code;return this;},json(data){this.data=data;} });
async function options() {
    const res = response(); await controller.options({}, res);
    assert.equal(res.code, 200, res.data?.error); return res.data;
}
async function main() {
    assert.equal(process.env.DB_NAME, 'temp_db1', 'Run only against the local development database.');
    assert.ok(['localhost','.','127.0.0.1'].includes(process.env.DB_SERVER.toLowerCase()), 'Local SQL only.');
    const pool = await realGetPool();
    tx = new sql.Transaction(pool); await tx.begin();
    let aborted = false; tx.on('rollback', () => { aborted = true; });
    try {
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/168_sales_executives.sql'), 'utf8');
        await query(migration); await query(migration);
        const employees = (await query(`SELECT TOP(3) EmployeeID FROM gen_EmployeeInfo
            WHERE IsActive=1 AND ResignDate IS NULL ORDER BY EmployeeID`)).recordset;
        assert.equal(employees.length, 3, 'Need three active local employees for verification.');
        const [a,b,c] = employees.map(e => e.EmployeeID);
        const before = (await query(`SELECT (SELECT * FROM dms_SalesBookings ORDER BY BookingID FOR JSON PATH,INCLUDE_NULL_VALUES) AS Bookings,
            (SELECT COUNT_BIG(*) FROM GLvMAIN) AS Vouchers,(SELECT COUNT_BIG(*) FROM GLvDetail) AS Lines`)).recordset[0];
        await query('UPDATE dbo.dms_SalesExecutives SET IsEnabled=0');
        assert.equal((await options()).length, 0, 'Never fall back to all HR employees.');
        await service.setEnabled(tx,a,true,admin);
        await service.setEnabled(tx,b,true,admin);
        await service.setEnabled(tx,c,true,admin);
        assert.deepEqual((await options()).map(e=>e.EmployeeID).sort((x,y)=>x-y), [a,b,c].sort((x,y)=>x-y));
        assert.equal((await service.requireExecutive(tx,a)).EmployeeID,a);
        await service.setEnabled(tx,b,false,admin);
        await assert.rejects(()=>service.requireExecutive(tx,b), /not an enabled Sales Executive/);
        await new sql.Request(tx).input('id',sql.Int,c).query('UPDATE gen_EmployeeInfo SET IsActive=0 WHERE EmployeeID=@id');
        assert.deepEqual((await options()).map(e=>e.EmployeeID),[a]);
        await assert.rejects(()=>service.requireExecutive(tx,c), /not an enabled Sales Executive/);
        await assert.rejects(()=>service.setEnabled(tx,c,true,admin), /Only active employees/);
        await new sql.Request(tx).input('id',sql.Int,c).query("UPDATE gen_EmployeeInfo SET IsActive=1,ResignDate='2026-10-01' WHERE EmployeeID=@id");
        await assert.rejects(()=>service.requireExecutive(tx,c), /not an enabled Sales Executive/);
        const oldAuditCount=(await query('SELECT COUNT_BIG(*) AS n FROM dms_SalesExecutiveChanges')).recordset[0].n;
        await service.setEnabled(tx,a,true,admin);
        assert.equal((await query('SELECT COUNT_BIG(*) AS n FROM dms_SalesExecutiveChanges')).recordset[0].n,oldAuditCount, 'Unchanged save is idempotent.');
        await assert.rejects(()=>service.setEnabled(tx,a,false,{groupId:2,modules:['sales_executive']}), /permission/);
        const setupRes=response(); await controller.setup({},setupRes);assert.equal(setupRes.code,200,setupRes.data?.error);
        assert.ok(setupRes.data.find(e=>e.EmployeeID===b && !e.IsEnabled), 'Disabled member remains in setup.');
        const after = (await query(`SELECT (SELECT * FROM dms_SalesBookings ORDER BY BookingID FOR JSON PATH,INCLUDE_NULL_VALUES) AS Bookings,
            (SELECT COUNT_BIG(*) FROM GLvMAIN) AS Vouchers,(SELECT COUNT_BIG(*) FROM GLvDetail) AS Lines`)).recordset[0];
        assert.deepEqual(after,before,'Existing bookings and voucher/line counts must remain unchanged.');
        console.log('PASS: migration idempotence, empty list, enable/disable, HR inactive/resigned exclusion, server validation, permissions, audit idempotence, setup query and existing booking/finance preservation.');
    } finally {
        if (!aborted) await tx.rollback();
        console.log('All local SQL changes rolled back.');
    }
}
main().then(()=>sql.close()).catch(async error=>{ console.error(error); await sql.close(); process.exitCode=1; });
