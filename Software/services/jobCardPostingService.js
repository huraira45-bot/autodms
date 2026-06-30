/**
 * Job Card finalize → ledger posting service.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.6.
 *
 * Orchestration only — the math lives in utils/jobCardJournalBuilder.js (pure).
 * This service:
 *   - loads job card + labour + sublet + parts within the caller's transaction,
 *   - resolves system accounts via systemAccountsController.resolveRole,
 *   - resolves the Bank account for Bank Transfer mode (from dms_BankAccounts),
 *   - calls the pure builder,
 *   - inserts the voucher header (Status='Posted' — triggers balanced-entry check),
 *   - inserts every detail line and every subsidiary-ledger row,
 *   - returns the new VoucherID.
 *
 * Throws on any error so the caller's transaction rolls back.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { buildJournalLines } = require('../utils/jobCardJournalBuilder');

// Resolve only the system roles the builder will actually consume. Trade
// debtors/creditors are no longer system fallbacks — every party carries its
// own PartyGLID (set at party creation) so customer A/R and sublet-vendor A/P
// post to the party's chosen leaf account, not a system-wide bucket.
async function resolveAllAccounts() {
    const roles = [
        'CASH_BOOK', 'GENERAL_CUSTOMER', 'GST_PAYABLE', 'INPUT_GST', 'PST_PAYABLE',
        'POS_CLEARING', 'DEFAULT_DISCOUNT_GIVEN', 'ROUNDING_ADJUSTMENT',
        'PURCHASE_RETURN_VARIANCE', 'CUSTOMER_ADVANCE_RECEIVED', 'SUPPLIER_ADVANCE_PAID',
        'CHEQUES_ON_HAND',
        'INVENTORY_PARTS', 'PARTS_REVENUE', 'SERVICE_REVENUE', 'SUBLET_REVENUE',
        'COGS_PARTS', 'SUBLET_COST',
    ];
    const out = {};
    for (const r of roles) {
        out[r] = { GLCAID: await resolveRole(r) };
    }
    return out;
}

// For each sublet vendor referenced on the JC, look up that vendor's PartyGLID.
// Returns a Map<vendorId, { GLCAID }>. Throws if any vendor has no PartyGLID
// (we refuse to silently fall back to a system bucket).
async function loadSubletVendorGLs(subletLines, transaction) {
    const vendorIds = [...new Set(subletLines.map(l => l.VendorID).filter(Boolean))];
    if (!vendorIds.length) return new Map();
    const r = await new sql.Request(transaction)
        .query(`SELECT PartyID, PartyName, PartyGLID FROM gen_PartiesInfo WHERE PartyID IN (${vendorIds.join(',')})`);
    const map = new Map();
    const missing = [];
    for (const v of r.recordset) {
        if (!v.PartyGLID) missing.push(`#${v.PartyID} ${v.PartyName}`);
        else map.set(v.PartyID, { GLCAID: v.PartyGLID });
    }
    if (missing.length) {
        throw new Error(`Sublet vendor(s) without GL account: ${missing.join(', ')}. Edit each party and assign a GL account.`);
    }
    return map;
}

/**
 * Load the active campaign attached to this JC (Phase 3). Returns null if no
 * application or if the campaign isn't in a valid state for posting.
 *
 *   Result: { ApplicationID, CampaignID, BenefitAmount, GLAccountID,
 *             CampaignName, BorneBy }
 */
async function loadCampaignApplication(jobCardId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`
            SELECT TOP 1 a.ApplicationID, a.CampaignID, a.BenefitAmount,
                   c.CampaignName, c.BorneBy, c.GLAccountID
            FROM dms_ServiceCampaignApplications a
            JOIN dms_ServiceCampaigns c ON a.CampaignID = c.CampaignID
            WHERE a.JobCardId = @id AND a.Status = 'Active'`);
    if (!r.recordset.length) return null;
    const camp = r.recordset[0];
    if (!camp.GLAccountID) {
        throw new Error(`Campaign "${camp.CampaignName}" has no GL account set — cannot finalize.`);
    }
    return camp;
}

/**
 * Look up a party's chosen receivable/payable GL account. Each party has a
 * PartyGLID pointing at one specific L4 leaf under 102xxx or 201xxx (set by
 * the user when the party was created). That's the account to debit/credit
 * when posting transactions for this party — NOT the legacy system-role
 * "TRADE_DEBTORS" account, which doesn't exist after the COA renumber.
 */
async function loadPartyGL(partyId, transaction) {
    if (!partyId) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, partyId)
        .query(`SELECT p.PartyID, p.PartyName, p.PartyGLID,
                       g.GLCode, g.GLTitle
                FROM gen_PartiesInfo p
                LEFT JOIN GLChartOFAccount g ON p.PartyGLID = g.GLCAID
                WHERE p.PartyID = @id`);
    if (!r.recordset.length) throw new Error(`Party #${partyId} not found.`);
    const p = r.recordset[0];
    if (!p.PartyGLID) throw new Error(`Party "${p.PartyName}" has no GL account linked. Edit the party and pick one before finalizing.`);
    return { GLCAID: p.PartyGLID, GLCode: p.GLCode, GLTitle: p.GLTitle, PartyName: p.PartyName };
}

// For MCML-claim style JCs (SFS / FFS / PDS / PPM): the JC has no PartyID but
// the JobCardType's ReceivableAccount points at a 102006xxx leaf. We look up
// the party that owns that GL leaf so the invoice voucher line carries that
// PartyID — without it, the claim can't be settled by party in Receive Payment.
async function loadPartyForReceivableGL(glcaid, transaction) {
    if (!glcaid) return null;
    const r = await new sql.Request(transaction)
        .input('gl', sql.Int, glcaid)
        .query(`SELECT TOP 1 p.PartyID, p.PartyName, p.PartyGLID,
                       g.GLCode, g.GLTitle
                FROM gen_PartiesInfo p
                LEFT JOIN GLChartOFAccount g ON p.PartyGLID = g.GLCAID
                WHERE p.PartyGLID = @gl
                ORDER BY p.PartyID`);
    if (!r.recordset.length) return null;
    const p = r.recordset[0];
    return { PartyID: p.PartyID, GLCAID: p.PartyGLID, GLCode: p.GLCode, GLTitle: p.GLTitle, PartyName: p.PartyName };
}

async function loadJobCardData(jobCardId, transaction) {
    const hdr = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT j.JobCardId, j.JobCardNo, j.JobCardDate, j.Status AS PaymentType, j.PartyID, j.PaymentBankID,
                       j.JobTypeId,
                       t.JobRevenueAccount   AS TypeServiceRevenueGL,
                       t.PartsRevenueAccount AS TypePartsRevenueGL,
                       t.ReceivableAccount   AS TypeReceivableGL,
                       t.CardCode AS JobTypeCode, t.Title AS JobTypeTitle
                FROM Addata_JobCardInfo j
                LEFT JOIN gen_JobCardType t ON j.JobTypeId = t.JobCardTypeId
                WHERE j.JobCardId=@id`);
    if (!hdr.recordset.length) throw new Error(`Job Card ${jobCardId} not found.`);
    const jobCard = hdr.recordset[0];

    const labour = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT Price, Discount, DiscAmt, DiscType, TaxRate, TaxAmount, Remarks AS WorkDescription
                FROM Addata_JobCardInfoDetail WHERE JobCardId=@id`);

    const sublet = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT VendorID, Remarks, InvoiceAmount, PayableAmount, TaxRate, TaxAmount
                FROM Addata_JobCardInfoSubletJobDetail WHERE JobCardId=@id`);

    // Parts come from data_StockIssuetoJobCardDetail (line table) joined to the issue header.
    // One Job Card may have multiple issue events; we aggregate all their line items.
    const parts = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT d.ItemId, d.IssueQuantity AS Quantity, d.ItemRate AS Rate,
                       d.UnitLandedCost, d.Discount, d.DiscAmt, d.TaxRate, d.TaxAmount
                FROM data_StockIssuetoJobCardDetail d
                INNER JOIN data_StockIssuetoJobCard h ON d.StockIssueID = h.StockIssueID
                WHERE h.JobCardId=@id`);

    // Insurance-claim depreciation total — the portion of customerPays that
    // belongs to the END CUSTOMER, not the insurer. The builder splits the AR
    // leg when this is > 0.
    const depRs = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT ISNULL(SUM(DepAmount), 0) AS Total
                FROM dms_JobCardPartsDepreciation WHERE JobCardId=@id`);
    const depreciationTotal = Number(depRs.recordset[0].Total) || 0;

    return {
        jobCard,
        labourLines: labour.recordset,
        subletLines: sublet.recordset,
        partsLines: parts.recordset,
        depreciationTotal,
    };
}

async function resolvePaymentBank(jobCard, transaction) {
    if (jobCard.PaymentType !== 'Bank Transfer' || !jobCard.PaymentBankID) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, jobCard.PaymentBankID)
        .query(`SELECT b.GLCAID FROM dms_BankAccounts b WHERE b.GLCAID=@id AND b.IsActive=1`);
    if (!r.recordset.length) throw new Error('Bank account for Bank Transfer is not active or not configured.');
    return { GLCAID: r.recordset[0].GLCAID };
}

/**
 * Posts the voucher for a finalized Job Card.
 * Must be called inside a transaction that already updated IsFinalized=1.
 * Returns the new VoucherID.
 *
 * @param {number} jobCardId
 * @param {object} userInfo  — { userId, userName }
 * @param {sql.Transaction} transaction
 */
async function postJobCardVoucher(jobCardId, userInfo, transaction) {
    // 1. Load all job-card data + any active campaign application
    const { jobCard, labourLines, subletLines, partsLines, depreciationTotal } = await loadJobCardData(jobCardId, transaction);
    const campaign = await loadCampaignApplication(jobCardId, transaction);

    // 2. Resolve system accounts + per-party GLs. Customer A/R uses the JC
    //    party's PartyGLID; sublet vendor A/P uses each vendor's own PartyGLID.
    const accounts        = await resolveAllAccounts();
    let   partyGL         = await loadPartyGL(jobCard.PartyID, transaction);
    const subletVendorGLs = await loadSubletVendorGLs(subletLines, transaction);

    // For MCML-claim JC types (SFS / FFS / PDS / PPM) with no named customer:
    // resolve the party that owns the JC type's ReceivableAccount and treat it
    // as the JC's party so Receive Payment can settle it by party.
    if (!jobCard.PartyID && jobCard.TypeReceivableGL) {
        const claimParty = await loadPartyForReceivableGL(jobCard.TypeReceivableGL, transaction);
        if (claimParty) {
            jobCard.PartyID = claimParty.PartyID;
            partyGL = claimParty;
        }
    }

    // 3. Build journal lines via the pure builder
    const built = buildJournalLines({
        jobCard,
        labourLines, subletLines, partsLines,
        accounts, campaign, partyGL, subletVendorGLs,
        depreciationTotal,
    });

    // Refuse to finalize an empty Job Card. Previously this silently returned null,
    // which left IsFinalized=1 with no SI voucher / no party ledger entry — making
    // the JC invisible to Receive Payment and Trial Balance. Force the caller to
    // either add lines or delete the JC.
    if (built.lines.length === 0) {
        throw new Error(`Job Card ${jobCard.JobCardNo} has no labour, sublet, or parts lines — nothing to invoice. Add lines or delete the Job Card.`);
    }

    // 4. Get the SI voucher type ID
    const vt = await new sql.Request(transaction).query(
        "SELECT Voucherid FROM GLVoucherType WHERE Title='SI'"
    );
    if (!vt.recordset.length) throw new Error('SI voucher type missing — run migration 001.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    // 5. Generate voucher number (SI-<sequential>)
    const seqResult = await new sql.Request(transaction).query(
        "SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo"
    );
    const voucherNo = `SI-${String(seqResult.recordset[0].nextNo).padStart(4, '0')}`;

    // 6. Insert header — Status starts as 'Draft', flipped to 'Posted' after detail inserts
    // so the balanced-entry trigger fires once all lines are in place.
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

    // 7. Insert all detail lines
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

    // 8. Insert subsidiary ledger rows
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

    // 9. Flip Status to 'Posted' — triggers the balanced-entry guard
    await new sql.Request(transaction)
        .input('vid',   sql.Int,            voucherId)
        .input('pby',   sql.Int,            userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // 10. If a campaign was applied, link the application row back to this voucher
    if (campaign && built.appliedCampaignID) {
        await new sql.Request(transaction)
            .input('aid', sql.Int, built.appliedCampaignID)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE dms_ServiceCampaignApplications
                    SET AccountVoucherID = @vid
                    WHERE ApplicationID = @aid`);
    }

    // 11. POS auto-settle. When the JC is paid by POS at the counter the card
    //     terminal has already cleared the customer's balance — only the bank
    //     settlement (POS_CLEARING → Bank) is pending, and that's what the POS
    //     Settlement module handles. So we post the receipt CRV in this same
    //     transaction (Dr POS_CLEARING / Cr customer subsidiary, allocated to
    //     the SI we just posted). Skipped when the AR is split (insurer + dep)
    //     because POS would only cover the customer's dep portion — that edge
    //     case still flows through Receive Payment.
    if ((jobCard.PaymentType || '').toUpperCase() === 'POS' && built.customerARDr) {
        await postPOSAutoSettleForJobCard({
            transaction, siVoucherId: voucherId, jobCard, userInfo,
            ar: built.customerARDr, posClearingGL: accounts.POS_CLEARING.GLCAID,
        });
    }

    return voucherId;
}

// Posts the POS receipt CRV that auto-settles a POS-paid JC's customer A/R.
// Inserts header + Dr POS_CLEARING + Cr customer-subsidiary (with AllocatedToVoucherID
// pointing at the SI voucher), writes a subsidiary-ledger Cr row, then flips to Posted.
async function postPOSAutoSettleForJobCard({ transaction, siVoucherId, jobCard, userInfo, ar, posClearingGL }) {
    const jcNo = jobCard.JobCardNo || jobCard.JobCardId;

    const vt = await new sql.Request(transaction).query(
        "SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='CRV' ORDER BY Voucherid");
    if (!vt.recordset.length) throw new Error('CRV voucher type missing.');
    const crvTypeId = vt.recordset[0].Voucherid;

    const seq = await new sql.Request(transaction).query(
        "SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo");
    const crvNo = `CRV-${String(seq.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = `POS receipt at finalize — JC-${jcNo}`;
    const hdr = await new sql.Request(transaction)
        .input('vd',    sql.DateTime,     new Date())
        .input('vno',   sql.NVarChar(50), crvNo)
        .input('vtId',  sql.Int,          crvTypeId)
        .input('rem',   sql.NVarChar(sql.MAX), narration)
        .input('tot',   sql.Decimal(18,2), ar.Amount)
        .input('src',   sql.NVarChar(20), 'JOBCARD')
        .input('srcId', sql.Int,          jobCard.JobCardId)
        .input('cby',   sql.Int,          userInfo?.userId || null)
        .input('cbyN',  sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const crvId = hdr.recordset[0].VoucherID;

    // Dr POS_CLEARING — tagged by JobCardID so POS Settlement / GL Detail can trace it back
    await new sql.Request(transaction)
        .input('vid',  sql.Int,           crvId)
        .input('gl',   sql.Int,           posClearingGL)
        .input('nar',  sql.NVarChar(sql.MAX), `POS swipe — JC-${jcNo}`)
        .input('dr',   sql.Decimal(18,2), ar.Amount)
        .input('cr',   sql.Decimal(18,2), 0)
        .input('jcid', sql.Int,           jobCard.JobCardId)
        .query(`INSERT INTO data_FinanceVoucherDetail
                    (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                VALUES (@vid, @gl, @nar, @dr, @cr, @jcid)`);

    // Cr customer subsidiary — allocated to SI so Walk-in Outstanding subtracts this
    await new sql.Request(transaction)
        .input('vid',   sql.Int,           crvId)
        .input('gl',    sql.Int,           ar.GLCAID)
        .input('nar',   sql.NVarChar(sql.MAX), `Settled by POS — JC-${jcNo}`)
        .input('dr',    sql.Decimal(18,2), 0)
        .input('cr',    sql.Decimal(18,2), ar.Amount)
        .input('pid',   sql.Int,           ar.PartyID || null)
        .input('jcid',  sql.Int,           jobCard.JobCardId)
        .input('alloc', sql.Int,           siVoucherId)
        .query(`INSERT INTO data_FinanceVoucherDetail
                    (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
                VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid, @alloc)`);

    // Subsidiary-ledger Cr — PartyID-tagged for named-party JCs, JobCardID-tagged for walk-ins
    await new sql.Request(transaction)
        .input('pid',   sql.Int,           ar.PartyID || null)
        .input('jcid',  sql.Int,           ar.PartyID ? null : jobCard.JobCardId)
        .input('vid',   sql.Int,           crvId)
        .input('gl',    sql.Int,           ar.GLCAID)
        .input('dr',    sql.Decimal(18,2), 0)
        .input('cr',    sql.Decimal(18,2), ar.Amount)
        .input('nar',   sql.NVarChar(500), `Settled by POS — JC-${jcNo}`)
        .input('alloc', sql.Int,           siVoucherId)
        .query(`INSERT INTO dms_PartyLedger
                    (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
                VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar, @alloc)`);

    await new sql.Request(transaction)
        .input('vid', sql.Int, crvId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);
}

module.exports = { postJobCardVoucher, resolveAllAccounts };
