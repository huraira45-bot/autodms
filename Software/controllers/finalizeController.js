const { sql, getPool } = require('../config/db');
const { postJobCardVoucher, applyWalkInAdvanceForJC } = require('../services/jobCardPostingService');
const { postGRNVoucher } = require('../services/grnPostingService');
const { postGRTNVoucher } = require('../services/grtnPostingService');
const { postStoreSaleVoucher } = require('../services/storeSalePostingService');
const { postSSRVoucher } = require('../services/ssrPostingService');
const { postReversalVoucher } = require('../services/voucherReversalService');
const { postPaintConsumptionForJC, unlockPaintIssuesForJC } = require('../services/paintIssueConsumptionService');
const { getDownstreamRefs } = require('../services/downstreamRefsService');
const { createFollowUpForJobCard } = require('../services/crdFollowUpService');
const { triggerPostJobCard } = require('../services/croSurveyService');
const { generateForJobCard } = require('../services/croReminderService');

// Best-effort actions fired AFTER the finalize transaction commits.
// Failures here are logged but do not affect the HTTP response.
const POST_COMMIT_HOOKS = {
    JOBCARD: async (id, user) => {
        await createFollowUpForJobCard(id, user);
        await triggerPostJobCard(id);
        await generateForJobCard(id);
    },
    // Sales-module vouchers sit in Draft until finalized here (owner ask
    // 2026-08-07) — this is the other half of that wait, dispatched by the
    // voucher's own SourceDocType so each sales flow's booking-side status
    // only advances once its voucher is actually posted, not when the
    // booking action originally happened. See salesVoucherPostHookService.js.
    VOUCHER: async (id) => {
        const pool = await getPool();
        const v = await pool.request().input('id', sql.Int, id)
            .query(`SELECT SourceDocType, SourceDocID FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
        const row = v.recordset[0];
        if (!row?.SourceDocType || row.SourceDocID == null) return;
        const { handleSalesVoucherPosted } = require('../services/salesVoucherPostHookService');
        await handleSalesVoucherPosted(id, row.SourceDocType, row.SourceDocID);
    },
};

const ENTITY_MAP = Object.freeze({
    JOBCARD:    { table: 'Addata_JobCardInfo',           pk: 'JobCardId',        refCol: 'JobCardNo'         },
    GRN:        { table: 'data_PurchaseInfo',             pk: 'PurchaseID',       refCol: 'PurchaseVoucherNo' },
    GRTN:       { table: 'data_PurchaseReturnInfo',       pk: 'PurchaseReturnID', refCol: 'PurchaseReturnNo'  },
    STORE_SALE: { table: 'data_StoreSaleInfo',            pk: 'SaleID',           refCol: 'InvoiceNo'         },
    SSR:        { table: 'data_StoreSaleReturnInfo',      pk: 'ReturnID',         refCol: 'ReturnNo'          },
    // Manual vouchers — finalize means Draft → Posted; unfinalize means a reversal voucher is posted.
    // Status column drives the state machine instead of IsFinalized.
    VOUCHER:    { table: 'data_FinanceVoucherInfo',       pk: 'VoucherID',        refCol: 'VoucherNo', isVoucher: true },
});

// Defense-in-depth: each table/pk/refCol value is interpolated directly into
// queries. Validate the shape at module load so any future hand-edit that
// accidentally introduces a quote / space / semicolon fails fast.
const SQL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
for (const [k, v] of Object.entries(ENTITY_MAP)) {
    if (!SQL_IDENT.test(v.table) || !SQL_IDENT.test(v.pk) || !SQL_IDENT.test(v.refCol)) {
        throw new Error(`ENTITY_MAP[${k}] has an unsafe identifier (must match [A-Za-z_][A-Za-z0-9_]*).`);
    }
}

// Posting hooks fired inside the finalize transaction. Each function takes
// (entityId, userInfo, transaction) and returns the new VoucherID (or null).
// Throwing here rolls back the entire finalize (lock + posting are atomic).
// JOBCARD posts TWO vouchers: the main JC voucher (revenue + parts + services)
// and a SEPARATE Paint Consumption voucher (Dr PAINT_CONSUMPTION / Cr
// PAINT_INVENTORY) for the Paint Issues linked to this JC. Both are posted
// inside the same finalize transaction. Returns the main JC voucher ID for
// backwards compatibility with the /finalize response payload.
async function postJobCardVoucherWithPaint(id, userInfo, tx) {
    const mainVoucherId = await postJobCardVoucher(id, userInfo, tx);
    // Paint consumption is best-effort inside the tx: if the JC didn't
    // consume any paint, the service returns null and no voucher is posted.
    await postPaintConsumptionForJC(id, userInfo, tx);
    // Clear any walk-in advance taken before finalize against this JC's
    // own Gen-Cust balance (Dr Customer Advance / Cr General Customer).
    // Best-effort: returns null if there's nothing to apply.
    await applyWalkInAdvanceForJC(id, userInfo, tx);
    return mainVoucherId;
}

const POSTING_HOOKS = {
    JOBCARD: postJobCardVoucherWithPaint,
    GRN: postGRNVoucher,
    GRTN: postGRTNVoucher,
    STORE_SALE: postStoreSaleVoucher,
    SSR: postSSRVoucher,
    // VOUCHER (manual JV finalize) → wired in item 12 of §14.22
};

// POST /api/finalize/:entity/:id
exports.finalize = async (req, res) => {
    const entityType = req.params.entity.toUpperCase();
    const entityId = parseInt(req.params.id);
    const em = ENTITY_MAP[entityType];
    if (!em) return res.status(400).json({ error: 'Invalid entity type' });
    if (!req.user.modules.includes('finalize')) return res.status(403).json({ error: 'Finalize permission required' });

    try {
        const pool = await getPool();

        // Precheck — manual vouchers use Status; everything else uses IsFinalized.
        const stateCols = em.isVoucher ? 'Status, CreatedBy' : 'IsFinalized, CreatedBy';
        const check = await pool.request()
            .input('id', sql.Int, entityId)
            .query(`SELECT ${stateCols} FROM ${em.table} WHERE ${em.pk}=@id`);
        if (!check.recordset.length) return res.status(404).json({ error: 'Record not found' });

        if (em.isVoucher) {
            const s = check.recordset[0].Status;
            if (s === 'Posted')   return res.status(409).json({ error: 'Voucher is already posted.' });
            if (s === 'Reversed') return res.status(409).json({ error: 'Voucher has been reversed.' });
            // s === 'Draft' is the only finalize-able state
        } else if (check.recordset[0].IsFinalized) {
            return res.status(409).json({ error: 'Already finalized' });
        }

        // Owner ask 2026-07-05: drop the creator-only gate for physical
        // documents too. Anyone whose group has the `finalize` module can
        // finalize any JC / GRN / GRTN / Store Sale / SSR — matches the
        // frontend button rule set on JobCardForm. The `finalize` module
        // check above (line 76) is the only permission gate now.

        // Owner ask 2026-07-17: block JC finalize when the linked customer
        // profile is missing CNIC or DOB. DMS Job Card Number is a *soft*
        // warning (owner ask 2026-07-18) — the frontend prompts the user;
        // when they confirm, the request comes back with skipDmsWarning=1
        // and finalize proceeds. Only runs for JOBCARD.
        if (entityType === 'JOBCARD') {
            const cust = await pool.request()
                .input('id', sql.Int, entityId)
                .query(`
                    SELECT j.EndUserID,
                           j.DMSJobCardNo,
                           ci.CNIC,
                           ci.DOB,
                           ci.endUserName AS CustomerName
                    FROM   Addata_JobCardInfo j
                    LEFT   JOIN addata_CustomerInfo ci ON ci.ProfileID = j.EndUserID
                    WHERE  j.JobCardId = @id
                `);
            const c = cust.recordset[0] || {};
            const dmsMissing  = !c.DMSJobCardNo || !String(c.DMSJobCardNo).trim();
            const cnicMissing = !c.CNIC         || !String(c.CNIC).trim();
            const dobMissing  = !c.DOB;
            const skipDms = req.body?.skipDmsWarning === true || req.body?.skipDmsWarning === 1 || req.query?.skipDmsWarning === '1';

            // Hard blockers — CNIC / DOB / customer profile — always enforced.
            const hardMissing = [];
            if (!c.EndUserID) hardMissing.push('customer profile');
            if (cnicMissing)  hardMissing.push('CNIC');
            if (dobMissing)   hardMissing.push('DOB');
            if (hardMissing.length) {
                return res.status(422).json({
                    error: `Cannot finalize: ${hardMissing.join(' + ')} ${hardMissing.length > 1 ? 'are' : 'is'} missing. Fill in the missing field${hardMissing.length > 1 ? 's' : ''} before finalizing.`,
                    missing: hardMissing,
                });
            }

            // Soft blocker — DMS Job Card Number. Return 428 the first time
            // so the frontend can confirm with the user; the next request
            // includes skipDmsWarning=1 and passes.
            if (dmsMissing && !skipDms) {
                return res.status(428).json({
                    error: 'DMS Job Card Number is empty. Finalize anyway?',
                    warning: 'dms_missing',
                });
            }
        }

        // Lock + post inside one transaction.  If the posting hook throws, the lock rolls back.
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            if (em.isVoucher) {
                // Flip Draft → Posted. The balanced-entry trigger fires on this UPDATE.
                await new sql.Request(transaction)
                    .input('id', sql.Int, entityId)
                    .input('by', sql.Int, req.user.userId)
                    .query(`UPDATE ${em.table}
                            SET Status='Posted', Posted=1, PostedBy=@by, PostedAt=GETDATE()
                            WHERE ${em.pk}=@id`);
                await transaction.commit();

                const postHook = POST_COMMIT_HOOKS.VOUCHER;
                if (postHook) {
                    postHook(entityId, { userId: req.user.userId, userName: req.user.userName })
                        .catch(e => console.error(`[POST_COMMIT] VOUCHER ${entityId}:`, e.message));
                }

                return res.json({ message: 'Voucher posted', voucherId: entityId });
            }

            await new sql.Request(transaction)
                .input('id', sql.Int, entityId)
                .input('by', sql.Int, req.user.userId)
                .input('byName', sql.NVarChar(100), req.user.userName)
                .query(`UPDATE ${em.table} SET IsFinalized=1, FinalizedBy=@by, FinalizedByName=@byName, FinalizedAt=GETDATE() WHERE ${em.pk}=@id`);

            let voucherId = null;
            const hook = POSTING_HOOKS[entityType];
            if (hook) {
                voucherId = await hook(entityId, { userId: req.user.userId, userName: req.user.userName }, transaction);
            }
            await transaction.commit();

            // Fire post-commit hooks (best-effort; failures logged but do not affect response)
            const postHook = POST_COMMIT_HOOKS[entityType];
            if (postHook) {
                postHook(entityId, { userId: req.user.userId, userName: req.user.userName })
                    .catch(e => console.error(`[POST_COMMIT] ${entityType} ${entityId}:`, e.message));
            }

            res.json({ message: 'Finalized', voucherId });
        } catch (err) {
            try { await transaction.rollback(); } catch {}
            throw err;
        }
    } catch (err) {
        console.error('finalize error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/finalize/:entity/:id/downstream-refs
// Preflight check — returns the list of blockers so the UI can warn before the user types a reason.
exports.checkDownstreamRefs = async (req, res) => {
    const entityType = req.params.entity.toUpperCase();
    const entityId = parseInt(req.params.id);
    const em = ENTITY_MAP[entityType];
    if (!em) return res.status(400).json({ error: 'Invalid entity type' });
    try {
        const pool = await getPool();
        const blockers = await getDownstreamRefs(entityType, entityId, pool);
        res.json({ blockers, canUnfinalize: blockers.length === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/finalize/:entity/:id/request-unfinalize
exports.requestUnfinalize = async (req, res) => {
    const entityType = req.params.entity.toUpperCase();
    const entityId = parseInt(req.params.id);
    const em = ENTITY_MAP[entityType];
    if (!em) return res.status(400).json({ error: 'Invalid entity type' });
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Reason is required' });

    try {
        const pool = await getPool();
        const stateCol = em.isVoucher ? 'Status' : 'IsFinalized';
        const rec = await pool.request()
            .input('id', sql.Int, entityId)
            .query(`SELECT ${stateCol} AS State, ${em.refCol} FROM ${em.table} WHERE ${em.pk}=@id`);
        if (!rec.recordset.length) return res.status(404).json({ error: 'Record not found' });
        if (em.isVoucher) {
            if (rec.recordset[0].State !== 'Posted')
                return res.status(409).json({ error: `Voucher is not in Posted state (current: ${rec.recordset[0].State}).` });
        } else if (!rec.recordset[0].State) {
            return res.status(409).json({ error: 'Record is not finalized' });
        }

        // Cascade-block (§14.22 item 13): refuse if any downstream document depends on this one.
        const blockers = await getDownstreamRefs(entityType, entityId, pool);
        if (blockers.length > 0) {
            return res.status(409).json({
                error: 'Cannot unfinalize: downstream references exist.',
                blockers
            });
        }

        const pending = await pool.request()
            .input('et', sql.NVarChar(10), entityType)
            .input('eid', sql.Int, entityId)
            .query(`SELECT 1 FROM dms_UnfinalizeRequests WHERE EntityType=@et AND EntityID=@eid AND Status IN ('PENDING','AM_APPROVED')`);
        if (pending.recordset.length) return res.status(409).json({ error: 'A request is already pending' });

        await pool.request()
            .input('et', sql.NVarChar(10), entityType)
            .input('eid', sql.Int, entityId)
            .input('eref', sql.NVarChar(50), rec.recordset[0][em.refCol] || '')
            .input('by', sql.Int, req.user.userId)
            .input('byName', sql.NVarChar(100), req.user.userName)
            .input('reason', sql.NVarChar(sql.MAX), reason.trim())
            .query(`INSERT INTO dms_UnfinalizeRequests (EntityType,EntityID,EntityRef,RequestedBy,RequestedByName,Reason)
                    VALUES (@et,@eid,@eref,@by,@byName,@reason)`);
        res.status(201).json({ message: 'Request submitted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/finalize/requests
exports.getRequests = async (req, res) => {
    const isAM    = req.user.modules.includes('am_approve');
    const isAdmin = req.user.modules.includes('admin_unfinalize');
    if (!isAM && !isAdmin) return res.status(403).json({ error: 'Insufficient permissions' });

    try {
        const pool = await getPool();
        let statusClause;
        if (isAdmin && isAM)    statusClause = `Status IN ('PENDING','AM_APPROVED','COMPLETED','REJECTED')`;
        else if (isAdmin)       statusClause = `Status IN ('AM_APPROVED','COMPLETED','REJECTED')`;
        else                    statusClause = `Status IN ('PENDING','AM_APPROVED','REJECTED')`;

        const result = await pool.request()
            .query(`SELECT * FROM dms_UnfinalizeRequests WHERE ${statusClause} ORDER BY RequestedAt DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/reports/unfinalize-log?from&to&status&search&requester
// Full history of Job Card unfinalize requests across every workflow state.
// Filters:
//   from / to  — YYYY-MM-DD, matched against DATE(RequestedAt)
//   status     — ALL | PENDING | AM_APPROVED | COMPLETED | REJECTED
//   search     — matches JobCardNo (RO#) or EntityRef LIKE
//   requester  — matches RequestedByName LIKE (case-insensitive)
// Payload shape (rows + total + summary) matches ReportShell's expectations.
exports.getUnfinalizeLog = async (req, res) => {
    try {
        const { from, to, status, search, requester } = req.query;
        const pool = await getPool();
        const request = pool.request();
        const where = [`ur.EntityType = 'JOBCARD'`];

        if (from) { request.input('from', sql.NVarChar(10), String(from).slice(0,10)); where.push('CAST(ur.RequestedAt AS DATE) >= @from'); }
        if (to)   { request.input('to',   sql.NVarChar(10), String(to).slice(0,10));   where.push('CAST(ur.RequestedAt AS DATE) <= @to'); }
        if (status && status !== 'ALL') {
            request.input('st', sql.NVarChar(20), String(status));
            where.push('ur.Status = @st');
        }
        if (search) {
            request.input('s', sql.NVarChar(60), `%${String(search).trim()}%`);
            where.push('(ur.EntityRef LIKE @s OR j.JobCardNo LIKE @s)');
        }
        if (requester) {
            request.input('rq', sql.NVarChar(120), `%${String(requester).trim()}%`);
            where.push('ur.RequestedByName LIKE @rq');
        }

        const whereSql = 'WHERE ' + where.join(' AND ');

        const r = await request.query(`
            SELECT ur.RequestID, ur.EntityType, ur.EntityID, ur.EntityRef,
                   ur.RequestedBy, ur.RequestedByName, ur.RequestedAt,
                   ur.Reason, ur.Status,
                   ur.AMApprovedBy, ur.AMApprovedByName, ur.AMApprovedAt,
                   ur.AdminApprovedBy, ur.AdminApprovedByName, ur.AdminApprovedAt,
                   ur.RejectedBy, ur.RejectedByName, ur.RejectedAt, ur.RejectionReason,
                   j.JobCardNo, j.jobCode, j.JobCardDate,
                   j.ServiceAdvisor, j.VehicleRegNo,
                   c.endUserName AS CustomerName,
                   p.PartyName,
                   j.IsFinalized AS JCIsFinalizedNow
            FROM   dms_UnfinalizeRequests ur
            LEFT   JOIN Addata_JobCardInfo   j ON j.JobCardId = ur.EntityID
            LEFT   JOIN addata_CustomerInfo  c ON c.ProfileID = j.EndUserID
            LEFT   JOIN gen_PartiesInfo      p ON p.PartyID   = j.PartyID
            ${whereSql}
            ORDER  BY ur.RequestedAt DESC, ur.RequestID DESC
        `);

        const rows = r.recordset;
        const count = (st) => rows.filter(x => x.Status === st).length;
        res.json({
            rows,
            total: rows.length,
            summary: {
                requestCount: rows.length,
                pending:      count('PENDING'),
                amApproved:   count('AM_APPROVED'),
                completed:    count('COMPLETED'),
                rejected:     count('REJECTED'),
            },
        });
    } catch (err) {
        console.error('getUnfinalizeLog:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/finalize/requests/:requestId/am-approve
exports.amApprove = async (req, res) => {
    if (!req.user.modules.includes('am_approve')) return res.status(403).json({ error: 'AM approval permission required' });
    const requestId = parseInt(req.params.requestId);
    try {
        const pool = await getPool();
        const check = await pool.request()
            .input('id', sql.Int, requestId)
            .query(`SELECT Status FROM dms_UnfinalizeRequests WHERE RequestID=@id`);
        if (!check.recordset.length) return res.status(404).json({ error: 'Request not found' });
        if (check.recordset[0].Status !== 'PENDING') return res.status(409).json({ error: 'Request is not pending' });

        await pool.request()
            .input('id', sql.Int, requestId)
            .input('by', sql.Int, req.user.userId)
            .input('byName', sql.NVarChar(100), req.user.userName)
            .query(`UPDATE dms_UnfinalizeRequests SET Status='AM_APPROVED', AMApprovedBy=@by, AMApprovedByName=@byName, AMApprovedAt=GETDATE() WHERE RequestID=@id`);
        res.json({ message: 'Approved by AM' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// PUT /api/finalize/requests/:requestId/reject
exports.reject = async (req, res) => {
    const isAM    = req.user.modules.includes('am_approve');
    const isAdmin = req.user.modules.includes('admin_unfinalize');
    if (!isAM && !isAdmin) return res.status(403).json({ error: 'Insufficient permissions' });
    const requestId = parseInt(req.params.requestId);
    const { reason } = req.body;

    try {
        const pool = await getPool();
        const check = await pool.request()
            .input('id', sql.Int, requestId)
            .query(`SELECT Status FROM dms_UnfinalizeRequests WHERE RequestID=@id`);
        if (!check.recordset.length) return res.status(404).json({ error: 'Request not found' });
        const s = check.recordset[0].Status;
        if (!['PENDING','AM_APPROVED'].includes(s)) return res.status(409).json({ error: 'Cannot reject this request' });
        if (s === 'AM_APPROVED' && !isAdmin) return res.status(403).json({ error: 'Only admin can reject AM-approved requests' });

        await pool.request()
            .input('id', sql.Int, requestId)
            .input('by', sql.Int, req.user.userId)
            .input('byName', sql.NVarChar(100), req.user.userName)
            .input('reason', sql.NVarChar(sql.MAX), reason || '')
            .query(`UPDATE dms_UnfinalizeRequests SET Status='REJECTED', RejectedBy=@by, RejectedByName=@byName, RejectedAt=GETDATE(), RejectionReason=@reason WHERE RequestID=@id`);
        res.json({ message: 'Request rejected' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// PUT /api/finalize/requests/:requestId/admin-unfinalize
exports.adminUnfinalize = async (req, res) => {
    if (!req.user.modules.includes('admin_unfinalize')) return res.status(403).json({ error: 'Admin unfinalize permission required' });
    const requestId = parseInt(req.params.requestId);
    try {
        const pool = await getPool();
        const reqRec = await pool.request()
            .input('id', sql.Int, requestId)
            .query(`SELECT * FROM dms_UnfinalizeRequests WHERE RequestID=@id`);
        if (!reqRec.recordset.length) return res.status(404).json({ error: 'Request not found' });
        const r = reqRec.recordset[0];
        if (r.Status !== 'AM_APPROVED') return res.status(409).json({ error: 'Request must be AM-approved first' });

        const em = ENTITY_MAP[r.EntityType];
        if (!em) return res.status(400).json({ error: 'Invalid entity type in request' });

        // Re-check downstream refs — they may have appeared between request and approval.
        const blockers = await getDownstreamRefs(r.EntityType, r.EntityID, pool);
        if (blockers.length > 0) {
            return res.status(409).json({
                error: 'Cannot unfinalize: downstream references exist now (added after the request was submitted).',
                blockers
            });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            let reversalInfo = null;
            if (em.isVoucher) {
                // Manual voucher unfinalize = post a reversal voucher (§14.5).
                // Original voucher Status flips to 'Reversed'; reversal voucher is Posted.
                reversalInfo = await postReversalVoucher(
                    r.EntityID,
                    { userId: req.user.userId, userName: req.user.userName },
                    transaction
                );
            } else {
                // For non-voucher entities (JOBCARD, GRN, GRTN, STORE_SALE, SSR) we
                // (a) reverse the source-document's auto-posted voucher (if any) so
                //     the GL doesn't carry a duplicate when the record is re-finalized,
                // (b) flip IsFinalized=0 on the record itself,
                // (c) reactivate any campaign application that was linked to the
                //     reversed voucher (so the user can re-apply / change it before
                //     re-finalizing).
                // Reverse ALL open non-reversal vouchers tied to this source
                // doc. Historically only the main voucher existed and TOP 1
                // was fine; the Paint Consumption voucher (JOBCARD → also
                // posts JC_PAINT_CONS) means a JC can have two open vouchers,
                // both of which must be reversed to keep the GL flat.
                const srcTypes = r.EntityType === 'JOBCARD'
                    ? [r.EntityType, 'JC_PAINT_CONS', 'JC_ADV_APPLY']
                    : [r.EntityType];
                const openVouchers = await new sql.Request(transaction)
                    .input('srcId', sql.Int, r.EntityID)
                    .query(`SELECT VoucherID FROM data_FinanceVoucherInfo
                            WHERE SourceDocType IN ('${srcTypes.join("','")}')
                              AND SourceDocID = @srcId
                              AND Status = 'Posted' AND ReversesVoucherID IS NULL
                            ORDER BY VoucherID DESC`);
                const reversals = [];
                for (const row of openVouchers.recordset) {
                    const info = await postReversalVoucher(
                        row.VoucherID,
                        { userId: req.user.userId, userName: req.user.userName },
                        transaction
                    );
                    reversals.push(info);
                }
                reversalInfo = reversals.length === 1 ? reversals[0]
                              : reversals.length > 1  ? { reversals }
                              : null;

                await new sql.Request(transaction)
                    .input('id', sql.Int, r.EntityID)
                    .query(`UPDATE ${em.table} SET IsFinalized=0, FinalizedBy=NULL, FinalizedByName=NULL, FinalizedAt=NULL WHERE ${em.pk}=@id`);

                // JC unfinalize: unlock paint_Issue rows so the user can
                // edit them again before the next finalize.
                if (r.EntityType === 'JOBCARD') {
                    await unlockPaintIssuesForJC(r.EntityID, transaction);
                }
            }

            await new sql.Request(transaction)
                .input('id', sql.Int, requestId)
                .input('by', sql.Int, req.user.userId)
                .input('byName', sql.NVarChar(100), req.user.userName)
                .query(`UPDATE dms_UnfinalizeRequests SET Status='COMPLETED', AdminApprovedBy=@by, AdminApprovedByName=@byName, AdminApprovedAt=GETDATE() WHERE RequestID=@id`);

            await transaction.commit();
            res.json({
                message: em.isVoucher ? 'Voucher reversed' : 'Record unfinalized',
                reversal: reversalInfo
            });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};
