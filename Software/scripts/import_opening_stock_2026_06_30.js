/**
 * Owner import 2026-06-30: 5 parts opening stock, effects to Capital.
 *
 * For each row:
 *   - If an InventItems row with matching ManualNumber (part number) exists,
 *     reuse it. Otherwise create a fresh Part row with the given rate as
 *     purchase price + weighted-average seed.
 *   - Add the qty via a StockArrival document (mirrors the pattern from
 *     import_stock_opening.js).
 *
 * Then one balanced JV dated 2026-06-30:
 *   Dr 102001009 SPARE STOCKS         204,950.87
 *   Cr 301001001 CAPITAL ACCOUNT      204,950.87
 *
 * Idempotent: refuses to run twice by checking for a voucher already numbered
 * 'JV-OB-STK-2026-06-30'.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const CAPITAL_CODE  = '301001001';
const INVENTORY_CODE = '102001009';   // SPARE STOCKS
const VOUCHER_PREFIX = 'JV-OB-STK-2026-06-30';
const VOUCHER_DATE = new Date('2026-06-30T00:00:00');   // 30 Jun 2026

const ROWS = [
    { category: 'OIL & CHEMICAL',   partNo: 'CMGOI-TO002',      name: 'TRANSMISSION OIL OSHAN  (BOT 351 C4)',            location: 'A01 A 04 - A03', qty: 37, rate: 4898.94 },
    { category: 'SUBLET PARTS',     partNo: '48815-01245',      name: 'STEERING BOOT',                                   location: 'A03 A 03 - E01', qty: 4,  rate: 475.00 },
    { category: 'BODY PARTS',       partNo: 'C857F270904-0100', name: 'BODY LOWER PROTECT TRIM ASSY LH SO5',             location: 'B03 A 03 - A06', qty: 1,  rate: 10163.78 },
    { category: 'MECHNICAL PARTS',  partNo: '08886-01206',      name: 'POWER OIL',                                       location: 'A01 A 05 C04',   qty: 1,  rate: 10000.00 },
    { category: 'MECHNICAL PARTS',  partNo: 'CB10014-0004',     name: 'THERMOSTAT ASSY KAR M8 M9',                       location: 'A01 A 03 - D03', qty: 1,  rate: 1626.31 },
];

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

(async () => {
    console.log('Connecting to database...');
    const pool = await getPool();
    console.log('Connected.');

    // Idempotency guard
    const dup = await pool.request()
        .input('p', sql.NVarChar(50), VOUCHER_PREFIX + '%')
        .query(`SELECT TOP 1 VoucherNo FROM data_FinanceVoucherInfo WHERE VoucherNo LIKE @p`);
    if (dup.recordset.length) {
        console.error(`Refusing to run — voucher '${dup.recordset[0].VoucherNo}' already exists. Delete it first if you need to re-import.`);
        process.exit(2);
    }

    // Resolve accounts
    const cap = await pool.request().input('c', sql.NVarChar(50), CAPITAL_CODE)
        .query(`SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND isParent=0`);
    if (!cap.recordset.length) throw new Error(`Capital ${CAPITAL_CODE} not found.`);
    const capitalGLCAID = cap.recordset[0].GLCAID;

    const inv = await pool.request().input('c', sql.NVarChar(50), INVENTORY_CODE)
        .query(`SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND isParent=0`);
    if (!inv.recordset.length) throw new Error(`Inventory ${INVENTORY_CODE} not found.`);
    const inventoryGLCAID = inv.recordset[0].GLCAID;

    // Resolve default UOM (Nos / EA) and default warehouse
    const uomRes = await pool.request().query(`SELECT TOP 1 UOMId FROM gen_UOMInfo ORDER BY UOMId`);
    if (!uomRes.recordset.length) throw new Error('No UOMs configured.');
    const defaultUomId = uomRes.recordset[0].UOMId;

    const whRes = await pool.request().query(`SELECT TOP 1 WHID FROM InventWareHouse ORDER BY WHID`);
    if (!whRes.recordset.length) throw new Error('No warehouses configured.');
    const whid = whRes.recordset[0].WHID;
    console.log(`Using default UOM=${defaultUomId}, Warehouse=${whid}`);

    // Resolve categories (must already exist)
    const catRes = await pool.request().query(`SELECT CategoryID, CategoryName FROM InventCategory`);
    const catByName = new Map(catRes.recordset.map(r => [r.CategoryName, r.CategoryID]));
    for (const row of ROWS) {
        if (!catByName.has(row.category)) {
            throw new Error(`Category '${row.category}' not found. Create it in Inventory Config first.`);
        }
    }

    // Resolve JV voucher type
    const vt = await pool.request().query(`SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid`);
    if (!vt.recordset.length) throw new Error('JV voucher type missing.');
    const jvTypeId = vt.recordset[0].Voucherid;

    const seq = await pool.request().query('SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo');
    const voucherNo = `${VOUCHER_PREFIX}-${String(seq.recordset[0].nextNo).padStart(4, '0')}`;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // 1. Resolve or create InventItems
        const resolved = [];
        for (const row of ROWS) {
            const existing = await new sql.Request(tx)
                .input('mn', sql.NVarChar(100), row.partNo)
                .query(`SELECT TOP 1 ItemId, ItenName FROM InventItems
                        WHERE ManualNumber = @mn
                          AND (ItemStatus = 1 OR ItemStatus IS NULL)`);
            if (existing.recordset.length) {
                console.log(`  reuse ItemId ${existing.recordset[0].ItemId} for ${row.partNo}`);
                resolved.push({ ...row, itemId: existing.recordset[0].ItemId, created: false });
            } else {
                const catId = catByName.get(row.category);
                const ins = await new sql.Request(tx)
                    .input('cat',    sql.Int,           catId)
                    .input('manual', sql.NVarChar(100), row.partNo)
                    .input('nm',     sql.NVarChar(200), row.name)
                    .input('uom',    sql.Int,           defaultUomId)
                    .input('sp',     sql.Decimal(18,2), 0)
                    .input('pp',     sql.Decimal(18,2), row.rate)
                    .input('wh',     sql.Int,           whid)
                    .input('bin',    sql.NVarChar(50),  row.location)
                    .input('wr',     sql.Numeric(18,4), row.rate)
                    .query(`INSERT INTO InventItems
                                (CategoryID, ManualNumber, ItenName, UOMId,
                                 ItemSalesPrice, ItemPurchasePrice, WHID, BinLocation,
                                 WeightedRate, ItemType, ItemStatus, CompanyID)
                            OUTPUT INSERTED.ItemId
                            VALUES (@cat, @manual, @nm, @uom,
                                    @sp, @pp, @wh, @bin,
                                    @wr, 'Part', 1, 1)`);
                console.log(`  created ItemId ${ins.recordset[0].ItemId} for ${row.partNo}`);
                resolved.push({ ...row, itemId: ins.recordset[0].ItemId, created: true });
            }
        }

        // 2. Stock arrival — one header, one detail per row
        const arrNoRes = await new sql.Request(tx)
            .query('SELECT ISNULL(MAX(ArrivalNo), 0) + 1 AS NextNo FROM data_StockArrivalInfo');
        const arrivalNo = arrNoRes.recordset[0].NextNo;
        const arrIns = await new sql.Request(tx)
            .input('no',  sql.Int,      arrivalNo)
            .input('dt',  sql.DateTime, VOUCHER_DATE)
            .input('wh',  sql.Int,      whid)
            .input('cid', sql.Int,      1)
            .input('rem', sql.NVarChar(sql.MAX), 'Opening stock 2026-06-30 (owner request)')
            .input('mn',  sql.NVarChar(50), 'OPEN-STK-2026-06-30')
            .query(`INSERT INTO data_StockArrivalInfo
                        (ArrivalNo, ArrivalDate, ArrivalToWHID, CompanyID, isManual, Remarks, ManualNo, EntryUserDateTime)
                    OUTPUT INSERTED.ArrivalID
                    VALUES (@no, @dt, @wh, @cid, 1, @rem, @mn, GETDATE())`);
        const arrivalId = arrIns.recordset[0].ArrivalID;
        for (const it of resolved) {
            if (it.qty <= 0) continue;
            await new sql.Request(tx)
                .input('aid', sql.Int,           arrivalId)
                .input('iid', sql.Int,           it.itemId)
                .input('qty', sql.Numeric(18,3), it.qty)
                .input('rt',  sql.Numeric(18,2), it.rate)
                .query(`INSERT INTO data_StockArrivalDetail (ArrivalID, ItemId, Quantity, StockRate)
                        VALUES (@aid, @iid, @qty, @rt)`);
        }
        console.log(`Stock arrival ${arrivalNo} posted with ${resolved.length} lines.`);

        // 3. Opening JV: Dr Inventory / Cr Capital
        const totalValue = r2(resolved.reduce((s, it) => s + it.qty * it.rate, 0));
        const hdr = await new sql.Request(tx)
            .input('vd',      sql.DateTime,         VOUCHER_DATE)
            .input('vno',     sql.NVarChar(50),     voucherNo)
            .input('vtId',    sql.Int,              jvTypeId)
            .input('remarks', sql.NVarChar(sql.MAX),'Opening stock 2026-06-30 — 5 parts (owner request)')
            .input('total',   sql.Decimal(18,2),    totalValue)
            .input('src',     sql.NVarChar(20),     'VOUCHER')
            .input('cbyN',    sql.NVarChar(100),    'import_opening_stock_2026_07_02')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @remarks, @total,
                            'Draft', 0, @src, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, inventoryGLCAID)
            .input('nar', sql.NVarChar(sql.MAX), 'Opening stock — Spare parts inventory (5 parts, 2026-06-30)')
            .input('dr',  sql.Decimal(18,2), totalValue)
            .input('cr',  sql.Decimal(18,2), 0)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                    VALUES (@vid, @gl, @nar, @dr, @cr)`);

        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, capitalGLCAID)
            .input('nar', sql.NVarChar(sql.MAX), 'Capital plug — opening stock 5 parts')
            .input('dr',  sql.Decimal(18,2), 0)
            .input('cr',  sql.Decimal(18,2), totalValue)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                    VALUES (@vid, @gl, @nar, @dr, @cr)`);

        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\n✓ Posted voucher ${voucherNo} (VoucherID=${voucherId}), total ${totalValue.toLocaleString('en-PK')}.`);
        console.log(`   Dr SPARE STOCKS (${INVENTORY_CODE})    ${totalValue.toLocaleString('en-PK')}`);
        console.log(`   Cr CAPITAL ACCOUNT (${CAPITAL_CODE})    ${totalValue.toLocaleString('en-PK')}`);
    } catch (err) {
        await tx.rollback();
        console.error('\n✗ Rolled back:', err.message);
        process.exit(1);
    } finally {
        await pool.close();
    }
})();
