/**
 * Store Sale finalize → ledger posting service.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.9.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { buildStoreSaleJournalLines } = require('../utils/storeSaleJournalBuilder');

async function resolveStoreSaleAccounts(/* transaction */) {
    // Credit-customer A/R uses the party's own PartyGLID — not a system role —
    // mirroring the JC posting path.
    const roles = ['CASH_BOOK', 'GENERAL_CUSTOMER', 'GST_PAYABLE', 'POS_CLEARING',
                   'DEFAULT_DISCOUNT_GIVEN', 'CHEQUES_ON_HAND',
                   'PARTS_REVENUE', 'COGS_PARTS', 'INVENTORY_PARTS'];
    const out = {};
    for (const r of roles) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

// Load the credit customer's chosen A/R leaf. Returns null for walk-in /
// cash sales (no PartyID); the builder then routes to GENERAL_CUSTOMER.
async function loadPartyGL(partyId, transaction) {
    if (!partyId) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, partyId)
        .query('SELECT PartyName, PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id');
    if (!r.recordset.length) throw new Error(`Customer party #${partyId} not found.`);
    const p = r.recordset[0];
    if (!p.PartyGLID) throw new Error(`Customer "${p.PartyName}" has no GL account linked. Edit the party and pick one before finalizing.`);
    return { GLCAID: p.PartyGLID };
}

async function loadStoreSaleData(saleId, transaction) {
    const hdr = await new sql.Request(transaction)
        .input('id', sql.Int, saleId)
        .query(`SELECT SaleID, InvoiceNo, PartyID, PaymentMode, PaymentBankID
                FROM data_StoreSaleInfo WHERE SaleID=@id`);
    if (!hdr.recordset.length) throw new Error(`Store Sale ${saleId} not found.`);

    const lines = await new sql.Request(transaction)
        .input('id', sql.Int, saleId)
        .query(`SELECT Quantity, SaleRate, TaxPercent, TaxAmount, DiscountAmount, UnitLandedCost
                FROM data_StoreSaleDetail WHERE SaleID=@id`);

    return { storeSale: hdr.recordset[0], lines: lines.recordset };
}

/**
 * Load the active campaign attached to this Store Sale (Phase 3).
 */
async function loadCampaignApplication(saleId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, saleId)
        .query(`
            SELECT TOP 1 a.ApplicationID, a.CampaignID, a.BenefitAmount,
                   c.CampaignName, c.BorneBy, c.GLAccountID
            FROM dms_ServiceCampaignApplications a
            JOIN dms_ServiceCampaigns c ON a.CampaignID = c.CampaignID
            WHERE a.SaleID = @id AND a.Status = 'Active'`);
    if (!r.recordset.length) return null;
    const camp = r.recordset[0];
    if (!camp.GLAccountID) {
        throw new Error(`Campaign "${camp.CampaignName}" has no GL account set — cannot finalize.`);
    }
    return camp;
}

async function resolvePaymentBank(storeSale, transaction) {
    if (storeSale.PaymentMode !== 'Bank Transfer' || !storeSale.PaymentBankID) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, storeSale.PaymentBankID)
        .query('SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1');
    if (!r.recordset.length) throw new Error('Bank account for Bank Transfer is not active or not configured.');
    return { GLCAID: r.recordset[0].GLCAID };
}

async function postStoreSaleVoucher(saleId, userInfo, transaction) {
    const { storeSale, lines } = await loadStoreSaleData(saleId, transaction);
    const campaign = await loadCampaignApplication(saleId, transaction);
    const accounts = await resolveStoreSaleAccounts(transaction);
    const paymentBank = await resolvePaymentBank(storeSale, transaction);
    const partyGL = await loadPartyGL(storeSale.PartyID, transaction);
    const built = buildStoreSaleJournalLines({ storeSale, lines, accounts, paymentBank, campaign, partyGL });

    if (built.lines.length === 0) return null;

    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='SS'");
    if (!vt.recordset.length) throw new Error('SS voucher type missing — run migration 001.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        "SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo"
    );
    const voucherNo = `SS-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const hdrRes = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,     new Date())
        .input('vno',     sql.NVarChar(50), voucherNo)
        .input('vtId',    sql.Int,          voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), built.header.Narration)
        .input('total',   sql.Decimal(18,2), built.header.TotalAmount)
        .input('src',     sql.NVarChar(20), built.header.SourceDocType)
        .input('srcId',   sql.Int,          built.header.SourceDocID)
        .input('cby',     sql.Int,          userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    for (const line of built.lines) {
        await new sql.Request(transaction)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           line.GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX), line.Narration)
            .input('dr',   sql.Decimal(18,2), line.Debit  || 0)
            .input('cr',   sql.Decimal(18,2), line.Credit || 0)
            .input('pid',  sql.Int,           line.PartyID  || null)
            .input('jcid', sql.Int,           line.JobCardID || null)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid)`);
    }

    for (const sub of built.subsidiaryWrites) {
        await new sql.Request(transaction)
            .input('pid',  sql.Int,           sub.PartyID || null)
            .input('jcid', sql.Int,           sub.JobCardID || null)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           sub.GLCAID)
            .input('dr',   sql.Decimal(18,2), sub.Debit  || 0)
            .input('cr',   sql.Decimal(18,2), sub.Credit || 0)
            .input('nar',  sql.NVarChar(500), sub.Narration || null)
            .query(`INSERT INTO dms_PartyLedger
                        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar)`);
    }

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Link the campaign application to this voucher (so reports can audit it)
    if (campaign && built.appliedCampaignID) {
        await new sql.Request(transaction)
            .input('aid', sql.Int, built.appliedCampaignID)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE dms_ServiceCampaignApplications
                    SET AccountVoucherID = @vid
                    WHERE ApplicationID = @aid`);
    }

    // POS auto-settle. Mirror of the Job Card path — when the customer paid by
    // POS at the counter, post the receipt CRV in this same transaction so the
    // customer A/R closes immediately. The POS Settlement module handles the
    // later POS_CLEARING → Bank reconciliation when the acquirer pays out.
    if ((storeSale.PaymentMode || '').toUpperCase() === 'POS' && built.customerARDr) {
        await postPOSAutoSettleForStoreSale({
            transaction, ssVoucherId: voucherId, storeSale, userInfo,
            ar: built.customerARDr, posClearingGL: accounts.POS_CLEARING.GLCAID,
        });
    }

    return voucherId;
}

async function postPOSAutoSettleForStoreSale({ transaction, ssVoucherId, storeSale, userInfo, ar, posClearingGL }) {
    const ref = storeSale.InvoiceNo || `SS-${storeSale.SaleID}`;

    const vt = await new sql.Request(transaction).query(
        "SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='CRV' ORDER BY Voucherid");
    if (!vt.recordset.length) throw new Error('CRV voucher type missing.');
    const crvTypeId = vt.recordset[0].Voucherid;

    const seq = await new sql.Request(transaction).query(
        "SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo");
    const crvNo = `CRV-${String(seq.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = `POS receipt at finalize — ${ref}`;
    const hdr = await new sql.Request(transaction)
        .input('vd',    sql.DateTime,     new Date())
        .input('vno',   sql.NVarChar(50), crvNo)
        .input('vtId',  sql.Int,          crvTypeId)
        .input('rem',   sql.NVarChar(sql.MAX), narration)
        .input('tot',   sql.Decimal(18,2), ar.Amount)
        .input('src',   sql.NVarChar(20), 'STORE_SALE')
        .input('srcId', sql.Int,          storeSale.SaleID)
        .input('cby',   sql.Int,          userInfo?.userId || null)
        .input('cbyN',  sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const crvId = hdr.recordset[0].VoucherID;

    // Dr POS_CLEARING
    await new sql.Request(transaction)
        .input('vid',  sql.Int,           crvId)
        .input('gl',   sql.Int,           posClearingGL)
        .input('nar',  sql.NVarChar(sql.MAX), `POS swipe — ${ref}`)
        .input('dr',   sql.Decimal(18,2), ar.Amount)
        .input('cr',   sql.Decimal(18,2), 0)
        .query(`INSERT INTO data_FinanceVoucherDetail
                    (VoucherID, GLCAID, Narration, Debit, Credit)
                VALUES (@vid, @gl, @nar, @dr, @cr)`);

    // Cr customer subsidiary — allocated to the SS we just posted
    await new sql.Request(transaction)
        .input('vid',   sql.Int,           crvId)
        .input('gl',    sql.Int,           ar.GLCAID)
        .input('nar',   sql.NVarChar(sql.MAX), `Settled by POS — ${ref}`)
        .input('dr',    sql.Decimal(18,2), 0)
        .input('cr',    sql.Decimal(18,2), ar.Amount)
        .input('pid',   sql.Int,           ar.PartyID || null)
        .input('alloc', sql.Int,           ssVoucherId)
        .query(`INSERT INTO data_FinanceVoucherDetail
                    (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, AllocatedToVoucherID)
                VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @alloc)`);

    // Subsidiary-ledger Cr only for named-party sales (walk-in store sales have
    // no PartyID/JobCardID tag — CK_PartyLedger_Tag would reject the row).
    if (ar.PartyID) {
        await new sql.Request(transaction)
            .input('pid',   sql.Int,           ar.PartyID)
            .input('vid',   sql.Int,           crvId)
            .input('gl',    sql.Int,           ar.GLCAID)
            .input('dr',    sql.Decimal(18,2), 0)
            .input('cr',    sql.Decimal(18,2), ar.Amount)
            .input('nar',   sql.NVarChar(500), `Settled by POS — ${ref}`)
            .input('alloc', sql.Int,           ssVoucherId)
            .query(`INSERT INTO dms_PartyLedger
                        (PartyID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
                    VALUES (@pid, @vid, @gl, @dr, @cr, @nar, @alloc)`);
    }

    await new sql.Request(transaction)
        .input('vid', sql.Int, crvId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);
}

module.exports = { postStoreSaleVoucher };
