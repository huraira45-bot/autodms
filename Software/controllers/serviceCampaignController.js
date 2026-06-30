/**
 * Service & Parts Campaigns
 *
 *   Promotional campaigns reducing a Job Card / Parts Sale bill.
 *
 *   BorneBy = 'Us'   → bills as expense (debit to a 5xxx Operating-Expense
 *                       account chosen at create time).
 *   BorneBy = 'MCML' → claimable from Master Changan Motors. The controller
 *                       AUTO-CREATES a new GL leaf under 102006 the first
 *                       time the campaign is saved (next available
 *                       102006xxx code) and links the campaign to it.
 *
 *   Eligibility — campaign declares qualifying parts (ItemIds) and labour
 *   (JobInfoIds). At JC/sale time the frontend will use these to suggest
 *   the campaign on matching lines. Application is enforced one-per-JC.
 *
 *   This file is the MASTER admin. Application logic (auto-suggest on JC
 *   creation + GL posting) is a separate next-phase concern.
 */
const { sql, getPool } = require('../config/db');

const MCML_PARENT_CODE = '102006';                       // Master Changan Motors (Current A/c)
const MCML_PARENT_LEVEL = 3;

const VALID_TYPES   = new Set(['Service', 'Parts', 'Both']);
const VALID_BORNEBY = new Set(['Us', 'MCML']);
const VALID_BENEFIT = new Set(['PercentDiscount', 'FixedDiscount', 'FreeService', 'FreeParts']);
// Per-side benefit (labour + parts can each independently be set):
const VALID_SIDE_BENEFIT = new Set(['None', 'Percent', 'Fixed', 'Free']);
const VALID_STATUS  = new Set(['Active', 'Paused', 'Closed']);

/**
 * Find the next free GL code under the MCML campaign parent (102006xxx).
 * Uses the dbo.seq_CampaignGLLeaf sequence so two concurrent campaign creates
 * cannot collide on the same suffix. The MCML_PARENT_CODE parameter is kept
 * for API symmetry but only 102006 is supported by the sequence today.
 */
async function nextChildGLCode(tx, parentCode) {
    if (parentCode !== MCML_PARENT_CODE) {
        throw new Error(`nextChildGLCode only supports parent ${MCML_PARENT_CODE}.`);
    }
    const r = await new sql.Request(tx)
        .query('SELECT NEXT VALUE FOR dbo.seq_CampaignGLLeaf AS n');
    const nextNum = r.recordset[0].n;
    return parentCode + String(nextNum).padStart(3, '0');
}

/**
 * Create a new L4 leaf under the MCML parent for an MCML campaign.
 * Returns the new GLCAID.
 */
async function createMCMLSubAccount(tx, campaignName, campaignCode) {
    // Confirm parent exists
    const parent = await new sql.Request(tx)
        .input('c', sql.NVarChar(50), MCML_PARENT_CODE)
        .query(`SELECT TOP 1 GLCAID, GLNature, GLType FROM GLChartOFAccount WHERE GLCode = @c`);
    if (!parent.recordset.length) throw new Error(`Parent GL ${MCML_PARENT_CODE} not found.`);
    const parentRow = parent.recordset[0];

    // Make sure parent is marked as a group
    await new sql.Request(tx)
        .input('id', sql.Int, parentRow.GLCAID)
        .query(`UPDATE GLChartOFAccount SET isParent = 1 WHERE GLCAID = @id AND isParent = 0`);

    const code = await nextChildGLCode(tx, MCML_PARENT_CODE);
    const title = `CAMPAIGN: ${campaignName} (${campaignCode})`.substring(0, 200);

    const ins = await new sql.Request(tx)
        .input('code',   sql.NVarChar(50),  code)
        .input('title',  sql.NVarChar(200), title)
        .input('level',  sql.TinyInt,       MCML_PARENT_LEVEL + 1)
        .input('nature', sql.TinyInt,       parentRow.GLNature)
        .input('co',     sql.Int,           1)
        .input('a1',     sql.NVarChar(50),  '01')
        .query(`INSERT INTO GLChartOFAccount
                    (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent,
                     Companyid, Status, AccountLevelOne, ReadOnly)
                OUTPUT INSERTED.GLCAID
                VALUES (@code, @title, @level, @nature, 0, 0,
                        @co, 1, @a1, 0)`);
    return { GLCAID: ins.recordset[0].GLCAID, GLCode: code, GLTitle: title };
}

// ============================================================
// Endpoints
// ============================================================

exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT c.*,
                   gl.GLCode AS GLCode, gl.GLTitle AS GLTitle,
                   (SELECT COUNT(*) FROM dms_ServiceCampaignEligibleItems e WHERE e.CampaignID = c.CampaignID) AS ItemCount,
                   (SELECT COUNT(*) FROM dms_ServiceCampaignEligibleJobs  j WHERE j.CampaignID = c.CampaignID) AS JobCount,
                   (SELECT COUNT(*) FROM dms_ServiceCampaignApplications a WHERE a.CampaignID = c.CampaignID AND a.Status='Active') AS UsedCount,
                   (SELECT ISNULL(SUM(a.BenefitAmount),0) FROM dms_ServiceCampaignApplications a WHERE a.CampaignID = c.CampaignID AND a.Status='Active') AS TotalGiven
            FROM dms_ServiceCampaigns c
            LEFT JOIN GLChartOFAccount gl ON c.GLAccountID = gl.GLCAID
            ORDER BY
                CASE c.Status WHEN 'Active' THEN 0 WHEN 'Paused' THEN 1 ELSE 2 END,
                c.ValidTo DESC`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getOne = async (req, res) => {
    try {
        const pool = await getPool();
        const id = parseInt(req.params.id);
        const [c, items, jobs] = await Promise.all([
            pool.request().input('id', sql.Int, id).query(`
                SELECT c.*, gl.GLCode, gl.GLTitle AS GLAccountTitle
                FROM dms_ServiceCampaigns c
                LEFT JOIN GLChartOFAccount gl ON c.GLAccountID = gl.GLCAID
                WHERE c.CampaignID = @id`),
            pool.request().input('id', sql.Int, id).query(`
                SELECT e.EligibleItemID, e.ItemId, i.ItemNumber, i.ItenName
                FROM dms_ServiceCampaignEligibleItems e
                JOIN InventItems i ON e.ItemId = i.ItemId
                WHERE e.CampaignID = @id
                ORDER BY i.ItenName`),
            pool.request().input('id', sql.Int, id).query(`
                -- "JobInfoId" in this eligibility table actually stores the
                -- InventItems.ItemId of a Service (labour catalog lives in
                -- InventItems with ItemType='Service'). Joining here so the
                -- admin form can echo the labour service name.
                SELECT e.EligibleJobID, e.JobInfoId, i.ItenName AS JobInfoName
                FROM dms_ServiceCampaignEligibleJobs e
                JOIN InventItems i ON e.JobInfoId = i.ItemId
                WHERE e.CampaignID = @id
                ORDER BY i.ItenName`),
        ]);
        if (!c.recordset.length) return res.status(404).json({ error: 'Campaign not found.' });
        res.json({ ...c.recordset[0], EligibleItems: items.recordset, EligibleJobs: jobs.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

function validateBody(b) {
    const errors = [];
    if (!b.CampaignCode?.trim()) errors.push('CampaignCode required');
    if (!b.CampaignName?.trim()) errors.push('CampaignName required');
    if (!VALID_TYPES.has(b.CampaignType))   errors.push('CampaignType must be Service / Parts / Both');
    if (!VALID_BORNEBY.has(b.BorneBy))      errors.push('BorneBy must be Us / MCML');
    if (!b.ValidFrom)                       errors.push('ValidFrom required');
    if (!b.ValidTo)                         errors.push('ValidTo required');
    if (b.ValidFrom && b.ValidTo && new Date(b.ValidFrom) > new Date(b.ValidTo))
        errors.push('ValidFrom must be ≤ ValidTo');
    if (b.BorneBy === 'Us' && !b.ExpenseGLAccountID)
        errors.push('Pick an Expense GL account when campaign is borne by us');

    // Side benefits: at least one of labour/parts must have a non-None benefit
    const lt = b.LabourBenefitType || 'None';
    const pt = b.PartsBenefitType  || 'None';
    if (!VALID_SIDE_BENEFIT.has(lt)) errors.push('LabourBenefitType invalid');
    if (!VALID_SIDE_BENEFIT.has(pt)) errors.push('PartsBenefitType invalid');
    if (lt === 'None' && pt === 'None')
        errors.push('At least one side (Labour or Parts) must have a benefit');
    if (lt === 'Percent' && !(b.LabourBenefitPercent > 0)) errors.push('Labour discount % required');
    if (lt === 'Fixed'   && !(b.LabourBenefitAmount  > 0)) errors.push('Labour fixed amount required');
    if (pt === 'Percent' && !(b.PartsBenefitPercent  > 0)) errors.push('Parts discount % required');
    if (pt === 'Fixed'   && !(b.PartsBenefitAmount   > 0)) errors.push('Parts fixed amount required');

    return errors;
}

// Derive a legacy-compatible BenefitType from the side configs (for older code
// paths + reports that still expect a single string).
function deriveLegacyBenefitType(b) {
    const lt = b.LabourBenefitType || 'None';
    const pt = b.PartsBenefitType  || 'None';
    if (lt === 'Free' && pt === 'None') return 'FreeService';
    if (pt === 'Free' && lt === 'None') return 'FreeParts';
    if (lt === 'Percent' || pt === 'Percent') return 'PercentDiscount';
    if (lt === 'Fixed'   || pt === 'Fixed')   return 'FixedDiscount';
    if (lt === 'Free' || pt === 'Free') return 'FreeService'; // mixed
    return 'PercentDiscount';  // fallback (shouldn't reach here after validation)
}

exports.create = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const b = req.body;
        const errs = validateBody(b);
        if (errs.length) { await tx.rollback(); return res.status(400).json({ error: errs.join('; ') }); }

        // Duplicate code check
        const dup = await new sql.Request(tx)
            .input('c', sql.NVarChar(30), b.CampaignCode.trim())
            .query(`SELECT TOP 1 CampaignID FROM dms_ServiceCampaigns WHERE CampaignCode = @c`);
        if (dup.recordset.length) { await tx.rollback(); return res.status(409).json({ error: `CampaignCode "${b.CampaignCode}" already exists.` }); }

        // Pick / auto-create GL
        let glAccountId = null;
        let glInfo = null;
        if (b.BorneBy === 'MCML') {
            glInfo = await createMCMLSubAccount(tx, b.CampaignName.trim(), b.CampaignCode.trim());
            glAccountId = glInfo.GLCAID;
        } else {
            glAccountId = parseInt(b.ExpenseGLAccountID);
        }

        // Insert master row
        const legacyType = deriveLegacyBenefitType(b);
        const ins = await new sql.Request(tx)
            .input('code', sql.NVarChar(30),  b.CampaignCode.trim())
            .input('name', sql.NVarChar(200), b.CampaignName.trim())
            .input('desc', sql.NVarChar(sql.MAX), b.Description || null)
            .input('type', sql.NVarChar(20),  b.CampaignType)
            .input('jcTypes', sql.NVarChar(200), b.ApplicableJobCardTypes || null)
            .input('borne', sql.NVarChar(20), b.BorneBy)
            .input('gl',    sql.Int,           glAccountId)
            // Legacy single benefit fields — kept for backward compat with old reports
            .input('btype', sql.NVarChar(30), legacyType)
            .input('bpct',  sql.Decimal(5,2), b.LabourBenefitPercent || b.PartsBenefitPercent || null)
            .input('bamt',  sql.Decimal(18,2),b.LabourBenefitAmount  || b.PartsBenefitAmount  || null)
            .input('bdesc', sql.NVarChar(500),b.BenefitDescription || null)
            .input('inctax',sql.Bit,          b.IncludesTax ? 1 : 0)
            // Split benefits
            .input('lbt',   sql.NVarChar(20), b.LabourBenefitType || 'None')
            .input('lbp',   sql.Decimal(5,2), b.LabourBenefitPercent || null)
            .input('lba',   sql.Decimal(18,2),b.LabourBenefitAmount  || null)
            .input('pbt',   sql.NVarChar(20), b.PartsBenefitType  || 'None')
            .input('pbp',   sql.Decimal(5,2), b.PartsBenefitPercent  || null)
            .input('pba',   sql.Decimal(18,2),b.PartsBenefitAmount   || null)

            .input('from',  sql.Date,          b.ValidFrom)
            .input('to',    sql.Date,          b.ValidTo)
            .input('doc',   sql.NVarChar(500), b.PolicyDocPath || null)
            .input('rem',   sql.NVarChar(sql.MAX), b.Remarks || null)
            .input('uid',   sql.Int,           req.user?.employeeId || null)
            .input('uname', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_ServiceCampaigns
                        (CampaignCode, CampaignName, Description, CampaignType,
                         ApplicableJobCardTypes, BorneBy, GLAccountID,
                         BenefitType, BenefitPercent, BenefitAmount, BenefitDescription, IncludesTax,
                         LabourBenefitType, LabourBenefitPercent, LabourBenefitAmount,
                         PartsBenefitType,  PartsBenefitPercent,  PartsBenefitAmount,
                         ValidFrom, ValidTo, PolicyDocPath, Remarks,
                         CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.CampaignID
                    VALUES (@code, @name, @desc, @type, @jcTypes, @borne, @gl,
                            @btype, @bpct, @bamt, @bdesc, @inctax,
                            @lbt, @lbp, @lba, @pbt, @pbp, @pba,
                            @from, @to, @doc, @rem, @uid, @uname)`);
        const campaignId = ins.recordset[0].CampaignID;

        // Eligibility lists
        for (const itemId of (b.EligibleItemIds || [])) {
            await new sql.Request(tx)
                .input('c', sql.Int, campaignId).input('i', sql.Int, parseInt(itemId))
                .query(`INSERT INTO dms_ServiceCampaignEligibleItems (CampaignID, ItemId) VALUES (@c, @i)`);
        }
        for (const jobId of (b.EligibleJobInfoIds || [])) {
            await new sql.Request(tx)
                .input('c', sql.Int, campaignId).input('j', sql.Int, parseInt(jobId))
                .query(`INSERT INTO dms_ServiceCampaignEligibleJobs (CampaignID, JobInfoId) VALUES (@c, @j)`);
        }

        await tx.commit();
        res.status(201).json({
            CampaignID: campaignId,
            GLAccountID: glAccountId,
            AutoCreatedGL: glInfo,    // null if BorneBy='Us'
            message: glInfo
                ? `Campaign created. New MCML sub-account ${glInfo.GLCode} (${glInfo.GLTitle}) auto-created.`
                : 'Campaign created.',
        });
    } catch (err) {
        if (tx._aborted !== true) await tx.rollback().catch(() => {});
        console.error('createCampaign:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.update = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const b = req.body;
        const errs = validateBody(b);
        if (errs.length) { await tx.rollback(); return res.status(400).json({ error: errs.join('; ') }); }

        // Note: the BorneBy field is NOT changeable after creation — it'd
        // mean orphaning the auto-created MCML sub-account or worse, double-
        // posting. If it really needs to change, close this campaign and
        // start a new one.
        const cur = await new sql.Request(tx).input('id', sql.Int, id)
            .query(`SELECT BorneBy, GLAccountID FROM dms_ServiceCampaigns WHERE CampaignID = @id`);
        if (!cur.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Campaign not found.' }); }
        if (cur.recordset[0].BorneBy !== b.BorneBy) {
            await tx.rollback();
            return res.status(409).json({ error: 'BorneBy cannot be changed after creation. Close this campaign and create a new one.' });
        }

        // For 'Us' campaigns we let the user re-pick the expense GL
        const glAccountId = b.BorneBy === 'Us' ? parseInt(b.ExpenseGLAccountID) : cur.recordset[0].GLAccountID;

        await new sql.Request(tx)
            .input('id',    sql.Int,           id)
            .input('name',  sql.NVarChar(200), b.CampaignName.trim())
            .input('desc',  sql.NVarChar(sql.MAX), b.Description || null)
            .input('type',  sql.NVarChar(20),  b.CampaignType)
            .input('jcTypes', sql.NVarChar(200), b.ApplicableJobCardTypes || null)
            .input('gl',    sql.Int,           glAccountId)
            .input('btype', sql.NVarChar(30),  deriveLegacyBenefitType(b))
            .input('bpct',  sql.Decimal(5,2),  b.LabourBenefitPercent || b.PartsBenefitPercent || null)
            .input('bamt',  sql.Decimal(18,2), b.LabourBenefitAmount  || b.PartsBenefitAmount  || null)
            .input('bdesc', sql.NVarChar(500), b.BenefitDescription || null)
            .input('inctax',sql.Bit,           b.IncludesTax ? 1 : 0)
            .input('lbt',   sql.NVarChar(20),  b.LabourBenefitType || 'None')
            .input('lbp',   sql.Decimal(5,2),  b.LabourBenefitPercent || null)
            .input('lba',   sql.Decimal(18,2), b.LabourBenefitAmount  || null)
            .input('pbt',   sql.NVarChar(20),  b.PartsBenefitType  || 'None')
            .input('pbp',   sql.Decimal(5,2),  b.PartsBenefitPercent  || null)
            .input('pba',   sql.Decimal(18,2), b.PartsBenefitAmount   || null)
            .input('from',  sql.Date,           b.ValidFrom)
            .input('to',    sql.Date,           b.ValidTo)
            .input('doc',   sql.NVarChar(500),  b.PolicyDocPath || null)
            .input('rem',   sql.NVarChar(sql.MAX), b.Remarks || null)
            .input('uid',   sql.Int,            req.user?.employeeId || null)
            .input('uname', sql.NVarChar(100),  req.user?.userName || null)
            .query(`UPDATE dms_ServiceCampaigns SET
                        CampaignName = @name, Description = @desc, CampaignType = @type,
                        ApplicableJobCardTypes = @jcTypes, GLAccountID = @gl,
                        BenefitType = @btype, BenefitPercent = @bpct, BenefitAmount = @bamt,
                        BenefitDescription = @bdesc, IncludesTax = @inctax,
                        LabourBenefitType = @lbt, LabourBenefitPercent = @lbp, LabourBenefitAmount = @lba,
                        PartsBenefitType  = @pbt, PartsBenefitPercent  = @pbp, PartsBenefitAmount  = @pba,
                        ValidFrom = @from, ValidTo = @to,
                        PolicyDocPath = @doc, Remarks = @rem,
                        UpdatedAt = GETDATE(), UpdatedByEmployeeID = @uid, UpdatedByName = @uname
                    WHERE CampaignID = @id`);

        // Replace eligibility lists
        await new sql.Request(tx).input('id', sql.Int, id)
            .query(`DELETE FROM dms_ServiceCampaignEligibleItems WHERE CampaignID = @id`);
        await new sql.Request(tx).input('id', sql.Int, id)
            .query(`DELETE FROM dms_ServiceCampaignEligibleJobs  WHERE CampaignID = @id`);
        for (const itemId of (b.EligibleItemIds || [])) {
            await new sql.Request(tx).input('c', sql.Int, id).input('i', sql.Int, parseInt(itemId))
                .query(`INSERT INTO dms_ServiceCampaignEligibleItems (CampaignID, ItemId) VALUES (@c, @i)`);
        }
        for (const jobId of (b.EligibleJobInfoIds || [])) {
            await new sql.Request(tx).input('c', sql.Int, id).input('j', sql.Int, parseInt(jobId))
                .query(`INSERT INTO dms_ServiceCampaignEligibleJobs (CampaignID, JobInfoId) VALUES (@c, @j)`);
        }

        await tx.commit();
        res.json({ message: 'Campaign updated.' });
    } catch (err) {
        if (tx._aborted !== true) await tx.rollback().catch(() => {});
        console.error('updateCampaign:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.changeStatus = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const newStatus = req.body.Status;
        if (!VALID_STATUS.has(newStatus)) return res.status(400).json({ error: 'Invalid status.' });
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, id)
            .input('st', sql.NVarChar(20), newStatus)
            .input('notes', sql.NVarChar(sql.MAX), req.body.ClosureNotes || null)
            .input('uid', sql.Int, req.user?.employeeId || null)
            .query(`UPDATE dms_ServiceCampaigns
                    SET Status = @st,
                        ClosedAt = CASE WHEN @st = 'Closed' THEN GETDATE() ELSE ClosedAt END,
                        ClosedByEmployeeID = CASE WHEN @st = 'Closed' THEN @uid ELSE ClosedByEmployeeID END,
                        ClosureNotes = COALESCE(@notes, ClosureNotes)
                    WHERE CampaignID = @id`);
        res.json({ message: `Campaign status set to ${newStatus}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ----- Lookups used by the admin form -----

exports.listJobInfo = async (req, res) => {
    try {
        // Labour catalog actually lives in InventItems with ItemType='Service'.
        // The legacy gen_JobInfo table is unused — keep this endpoint name for
        // backwards compat but read from the real source.
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT TOP 500
                ItemId   AS JobInfoId,         -- aliased so frontend doesn't need to change
                ItenName AS JobInfoName
            FROM InventItems
            WHERE ItemType = 'Service' AND ItemStatus = 1
            ORDER BY ItenName`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.listExpenseAccounts = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT GLCAID, GLCode, GLTitle
            FROM GLChartOFAccount
            WHERE GLLevel = 4 AND Status = 1 AND LEFT(GLCode, 1) = '5'
            ORDER BY GLCode`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================
// APPLICATION endpoints — attach a campaign to a JC or Store Sale
// ============================================================

/**
 * GET /api/service-campaigns/applicable?jobCardId=N  -or-  ?saleId=N
 *
 * Returns campaigns that:
 *   - Are Active AND within their ValidFrom..ValidTo window
 *   - Match the JC's JobCardType (if Applicable list is set on the campaign)
 *   - Either have no eligibility list, OR include at least one item/job that
 *     appears on the JC's lines.
 *
 * The frontend uses this to populate the "Apply Campaign" dropdown.
 */
exports.listApplicable = async (req, res) => {
    try {
        const pool = await getPool();
        // Use YYYY-MM-DD string for SQL DATE comparison — TZ-safe.
        const _now = new Date();
        const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
        const jobCardId = req.query.jobCardId ? parseInt(req.query.jobCardId) : null;
        const saleId    = req.query.saleId    ? parseInt(req.query.saleId)    : null;
        if (!jobCardId && !saleId) return res.status(400).json({ error: 'jobCardId or saleId required.' });

        // Load this JC's / sale's per-line totals so we can compute
        // eligible-only gross per campaign.
        let labourLines = [], partsLines = [], jobCardTypeId = null;
        if (jobCardId) {
            const head = await pool.request().input('id', sql.Int, jobCardId)
                .query(`SELECT JobTypeId FROM Addata_JobCardInfo WHERE JobCardId = @id`);
            if (!head.recordset.length) return res.status(404).json({ error: 'Job Card not found.' });
            jobCardTypeId = head.recordset[0].JobTypeId;
            // Labour lines with their gross (after line discount)
            const jobs = await pool.request().input('id', sql.Int, jobCardId)
                .query(`SELECT JobInfoId,
                               ISNULL(Price, 0) - ISNULL(DiscAmt, 0) AS LineGross
                        FROM Addata_JobCardInfoDetail
                        WHERE JobCardId = @id`);
            labourLines = jobs.recordset;
            // Parts issued
            const items = await pool.request().input('id', sql.Int, jobCardId)
                .query(`SELECT ItemId,
                               (ISNULL(IssueQuantity, 0) * ISNULL(ItemRate, 0)) - ISNULL(DiscAmt, 0) AS LineGross
                        FROM data_StockIssuetoJobCardDetail
                        WHERE JobCardId = @id`);
            partsLines = items.recordset;
        } else {
            const items = await pool.request().input('id', sql.Int, saleId)
                .query(`SELECT ItemID AS ItemId,
                               (ISNULL(Quantity, 0) * ISNULL(SaleRate, 0)) - ISNULL(DiscountAmount, 0) AS LineGross
                        FROM data_StoreSaleDetail WHERE SaleID = @id`);
            partsLines = items.recordset;
        }
        const lineItemIds = [...new Set(partsLines.map(r => r.ItemId).filter(Boolean))];
        const lineJobIds  = [...new Set(labourLines.map(r => r.JobInfoId).filter(Boolean))];

        // Fetch all currently-active campaigns (today as 'YYYY-MM-DD' literal)
        const camps = await pool.request().input('today', sql.NVarChar(10), today).query(`
            SELECT c.*, gl.GLCode, gl.GLTitle AS GLAccountTitle
            FROM dms_ServiceCampaigns c
            LEFT JOIN GLChartOFAccount gl ON c.GLAccountID = gl.GLCAID
            WHERE c.Status = 'Active' AND c.ValidFrom <= @today AND c.ValidTo >= @today
            ORDER BY c.CampaignName`);

        // Get eligibility lists per campaign (single round-trip)
        const idsCsv = camps.recordset.map(c => c.CampaignID).join(',') || '0';
        const eligItems = await pool.request().query(
            `SELECT CampaignID, ItemId FROM dms_ServiceCampaignEligibleItems WHERE CampaignID IN (${idsCsv})`);
        const eligJobs = await pool.request().query(
            `SELECT CampaignID, JobInfoId FROM dms_ServiceCampaignEligibleJobs WHERE CampaignID IN (${idsCsv})`);
        const itemsByCamp = {};
        const jobsByCamp  = {};
        for (const r of eligItems.recordset) (itemsByCamp[r.CampaignID] = itemsByCamp[r.CampaignID] || new Set()).add(r.ItemId);
        for (const r of eligJobs.recordset)  (jobsByCamp[r.CampaignID]  = jobsByCamp[r.CampaignID]  || new Set()).add(r.JobInfoId);

        const lineItemSet = new Set(lineItemIds);
        const lineJobSet  = new Set(lineJobIds);

        const applicable = [];
        for (const c of camps.recordset) {
            // Skip cross-domain mismatches: a JC needs CampaignType in [Service, Both]; a sale needs [Parts, Both]
            if (jobCardId && c.CampaignType === 'Parts') continue;
            if (saleId    && c.CampaignType === 'Service') continue;

            // JobCardType filter
            if (jobCardId && c.ApplicableJobCardTypes) {
                const types = c.ApplicableJobCardTypes.split(',').map(s => parseInt(s)).filter(Boolean);
                if (types.length && !types.includes(jobCardTypeId)) continue;
            }

            // Eligibility match — if either list is set, at least one entry must be on the JC/sale.
            // If both lists are empty, campaign applies to anything (still listed).
            const itSet = itemsByCamp[c.CampaignID];
            const jbSet = jobsByCamp[c.CampaignID];
            if (itSet || jbSet) {
                let matches = false;
                if (itSet) for (const id of itSet) if (lineItemSet.has(id)) { matches = true; break; }
                if (!matches && jbSet) for (const id of jbSet) if (lineJobSet.has(id)) { matches = true; break; }
                if (!matches) continue;
            }
            // Eligible-only gross for THIS campaign — only labour lines whose
            // JobInfoId is in this campaign's labour-eligibility list count.
            // Same for parts. If a list is empty, the campaign applies to all
            // lines on that side (catch-all).
            const sumLines = (lines, idField, allowSet) => {
                if (!allowSet || allowSet.size === 0) {
                    return lines.reduce((s, l) => s + Math.max(0, Number(l.LineGross) || 0), 0);
                }
                return lines.reduce((s, l) => {
                    return allowSet.has(l[idField])
                        ? s + Math.max(0, Number(l.LineGross) || 0)
                        : s;
                }, 0);
            };
            const eligibleLabourGross = sumLines(labourLines, 'JobInfoId', jbSet);
            const eligiblePartsGross  = sumLines(partsLines,  'ItemId',    itSet);

            applicable.push({
                CampaignID:         c.CampaignID,
                CampaignCode:       c.CampaignCode,
                CampaignName:       c.CampaignName,
                CampaignType:       c.CampaignType,
                BorneBy:            c.BorneBy,
                BenefitType:        c.BenefitType,
                BenefitPercent:     c.BenefitPercent,
                BenefitAmount:      c.BenefitAmount,
                BenefitDescription: c.BenefitDescription,
                IncludesTax:        !!c.IncludesTax,
                LabourBenefitType:    c.LabourBenefitType   || 'None',
                LabourBenefitPercent: c.LabourBenefitPercent,
                LabourBenefitAmount:  c.LabourBenefitAmount,
                PartsBenefitType:     c.PartsBenefitType    || 'None',
                PartsBenefitPercent:  c.PartsBenefitPercent,
                PartsBenefitAmount:   c.PartsBenefitAmount,
                GLCode:             c.GLCode,
                GLAccountTitle:     c.GLAccountTitle,
                ValidFrom:          c.ValidFrom,
                ValidTo:            c.ValidTo,
                // Per-campaign eligible gross — the apply modal uses these instead
                // of the whole-JC gross. If the campaign restricted itself to
                // specific items / job codes, only those line totals count.
                EligibleLabourGross: +eligibleLabourGross.toFixed(2),
                EligiblePartsGross:  +eligiblePartsGross.toFixed(2),
            });
        }

        res.json(applicable);
    } catch (err) { console.error('listApplicable:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /api/service-campaigns/applications/by-jobcard/:id
 * GET /api/service-campaigns/applications/by-sale/:id
 *
 * Returns the active campaign application for this JC/sale (if any).
 */
async function loadApplicationFor(pool, where, id) {
    const r = await pool.request().input('id', sql.Int, id).query(`
        SELECT a.*, c.CampaignCode, c.CampaignName, c.BorneBy, c.BenefitType,
               c.BenefitPercent, c.BenefitAmount, c.BenefitDescription,
               gl.GLCode, gl.GLTitle AS GLAccountTitle
        FROM dms_ServiceCampaignApplications a
        JOIN dms_ServiceCampaigns c   ON a.CampaignID = c.CampaignID
        LEFT JOIN GLChartOFAccount gl ON c.GLAccountID = gl.GLCAID
        WHERE a.${where} = @id AND a.Status = 'Active'`);
    return r.recordset[0] || null;
}
exports.applicationByJobCard = async (req, res) => {
    try {
        const pool = await getPool();
        res.json(await loadApplicationFor(pool, 'JobCardId', parseInt(req.params.id)));
    } catch (err) { res.status(500).json({ error: err.message }); }
};
exports.applicationBySale = async (req, res) => {
    try {
        const pool = await getPool();
        res.json(await loadApplicationFor(pool, 'SaleID', parseInt(req.params.id)));
    } catch (err) { res.status(500).json({ error: err.message }); }
};

/**
 * POST /api/service-campaigns/:campaignId/apply
 *   body: { JobCardId? | SaleID?, BenefitAmount, AppliedLines? (array), Remarks? }
 *
 * Records the application. Refuses if:
 *   - Campaign isn't Active / in date
 *   - JC/sale already has an Active application (no stacking)
 *   - JC is finalized
 *
 * GL posting on the JC/sale invoice is handled at finalization time — the
 * application row carries BenefitAmount which the finalize flow uses to
 * split the customer receivable into (Customer) + (Campaign GL account).
 */
exports.applyCampaign = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const campaignId = parseInt(req.params.id);
        const { JobCardId, SaleID, BenefitAmount, AppliedLines, Remarks } = req.body;
        if (!JobCardId && !SaleID) { await tx.rollback(); return res.status(400).json({ error: 'JobCardId or SaleID required.' }); }
        if (!(BenefitAmount > 0))  { await tx.rollback(); return res.status(400).json({ error: 'BenefitAmount must be > 0.' }); }

        // Campaign sanity
        const c = await new sql.Request(tx).input('id', sql.Int, campaignId).query(`
            SELECT Status, ValidFrom, ValidTo, CampaignType FROM dms_ServiceCampaigns WHERE CampaignID = @id`);
        if (!c.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Campaign not found.' }); }
        const camp = c.recordset[0];
        if (camp.Status !== 'Active') { await tx.rollback(); return res.status(409).json({ error: `Campaign is ${camp.Status}.` }); }
        // Compare as YYYY-MM-DD strings to avoid TZ skew — SQL DATE columns
        // come back as UTC midnight, local "today" can be a day off.
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const fromISO = camp.ValidFrom.toISOString().slice(0, 10);
        const toISO   = camp.ValidTo.toISOString().slice(0, 10);
        if (todayISO < fromISO || todayISO > toISO) {
            await tx.rollback();
            return res.status(409).json({ error: `Campaign is outside its validity window (${fromISO} → ${toISO}; today is ${todayISO}).` });
        }

        // JC finalized check
        if (JobCardId) {
            const jc = await new sql.Request(tx).input('id', sql.Int, JobCardId)
                .query(`SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId = @id`);
            if (!jc.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Job Card not found.' }); }
            if (jc.recordset[0].IsFinalized) { await tx.rollback(); return res.status(423).json({ error: 'Job Card is finalized.' }); }
        }
        if (SaleID) {
            const s = await new sql.Request(tx).input('id', sql.Int, SaleID)
                .query(`SELECT IsFinalized FROM data_StoreSaleInfo WHERE SaleID = @id`);
            if (!s.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Sale not found.' }); }
            if (s.recordset[0].IsFinalized) { await tx.rollback(); return res.status(423).json({ error: 'Sale is finalized.' }); }
        }

        // No stacking — refuse if there's already an active application
        const exists = await new sql.Request(tx)
            .input('jc', sql.Int, JobCardId || null)
            .input('sale', sql.Int, SaleID || null)
            .query(`SELECT TOP 1 ApplicationID FROM dms_ServiceCampaignApplications
                    WHERE Status = 'Active'
                      AND ((@jc IS NOT NULL AND JobCardId = @jc) OR (@sale IS NOT NULL AND SaleID = @sale))`);
        if (exists.recordset.length) {
            await tx.rollback();
            return res.status(409).json({ error: 'This JC/Sale already has an active campaign. Reverse it first if you want to apply a different one.' });
        }

        const ins = await new sql.Request(tx)
            .input('cid',   sql.Int,           campaignId)
            .input('jc',    sql.Int,           JobCardId || null)
            .input('sale',  sql.Int,           SaleID || null)
            .input('amt',   sql.Decimal(18,2), BenefitAmount)
            .input('lines', sql.NVarChar(sql.MAX), AppliedLines ? JSON.stringify(AppliedLines) : null)
            .input('rem',   sql.NVarChar(sql.MAX), Remarks || null)
            .input('uid',   sql.Int,           req.user?.employeeId || null)
            .input('uname', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_ServiceCampaignApplications
                        (CampaignID, JobCardId, SaleID, BenefitAmount, AppliedLines, Remarks,
                         AppliedByEmployeeID, AppliedByName)
                    OUTPUT INSERTED.ApplicationID
                    VALUES (@cid, @jc, @sale, @amt, @lines, @rem, @uid, @uname)`);

        await tx.commit();
        res.status(201).json({
            ApplicationID: ins.recordset[0].ApplicationID,
            message: 'Campaign applied. GL impact will post when the JC/sale is finalized.',
        });
    } catch (err) {
        if (tx._aborted !== true) await tx.rollback().catch(() => {});
        console.error('applyCampaign:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-campaigns/applications/:appId/reverse
 *
 * Marks an application as Reversed (so the user can apply a different
 * campaign instead). Only allowed if the JC/sale isn't finalized — once
 * the GL hits, you can't undo from here.
 */
exports.reverseApplication = async (req, res) => {
    try {
        const id = parseInt(req.params.appId);
        const pool = await getPool();
        const app = await pool.request().input('id', sql.Int, id).query(
            `SELECT a.*, ISNULL(j.IsFinalized, 0) AS JCFinalized, ISNULL(s.IsFinalized, 0) AS SaleFinalized
             FROM dms_ServiceCampaignApplications a
             LEFT JOIN Addata_JobCardInfo j ON a.JobCardId = j.JobCardId
             LEFT JOIN data_StoreSaleInfo s ON a.SaleID = s.SaleID
             WHERE a.ApplicationID = @id`);
        if (!app.recordset.length) return res.status(404).json({ error: 'Application not found.' });
        const a = app.recordset[0];
        if (a.Status === 'Reversed') return res.status(409).json({ error: 'Already reversed.' });
        if (a.JCFinalized || a.SaleFinalized)
            return res.status(423).json({ error: 'Cannot reverse — JC/Sale is finalized.' });

        await pool.request()
            .input('id', sql.Int, id)
            .input('reason', sql.NVarChar(sql.MAX), req.body.Reason || 'User reversed.')
            .input('uid', sql.Int, req.user?.employeeId || null)
            .query(`UPDATE dms_ServiceCampaignApplications
                    SET Status = 'Reversed',
                        Remarks = CONCAT(ISNULL(Remarks, ''), CHAR(10), 'Reversed by emp #', @uid, ': ', @reason)
                    WHERE ApplicationID = @id`);
        res.json({ message: 'Application reversed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
