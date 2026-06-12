const { sql, getPool } = require('../config/db');
const { postJobCardVoucher } = require('../services/jobCardPostingService');
const { postGRNVoucher } = require('../services/grnPostingService');
const { postGRTNVoucher } = require('../services/grtnPostingService');
const { postStoreSaleVoucher } = require('../services/storeSalePostingService');
const { postSSRVoucher } = require('../services/ssrPostingService');
const { postReversalVoucher } = require('../services/voucherReversalService');
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
};

const ENTITY_MAP = {
    JOBCARD:    { table: 'Addata_JobCardInfo',           pk: 'JobCardId',        refCol: 'JobCardNo'         },
    GRN:        { table: 'data_PurchaseInfo',             pk: 'PurchaseID',       refCol: 'PurchaseVoucherNo' },
    GRTN:       { table: 'data_PurchaseReturnInfo',       pk: 'PurchaseReturnID', refCol: 'PurchaseReturnNo'  },
    STORE_SALE: { table: 'data_StoreSaleInfo',            pk: 'SaleID',           refCol: 'InvoiceNo'         },
    SSR:        { table: 'data_StoreSaleReturnInfo',      pk: 'ReturnID',         refCol: 'ReturnNo'          },
    // Manual vouchers — finalize means Draft → Posted; unfinalize means a reversal voucher is posted.
    // Status column drives the state machine instead of IsFinalized.
    VOUCHER:    { table: 'data_FinanceVoucherInfo',       pk: 'VoucherID',        refCol: 'VoucherNo', isVoucher: true },
};

// Posting hooks fired inside the finalize transaction. Each function takes
// (entityId, userInfo, transaction) and returns the new VoucherID (or null).
// Throwing here rolls back the entire finalize (lock + posting are atomic).
const POSTING_HOOKS = {
    JOBCARD: postJobCardVoucher,
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

        const isAdmin = req.user.modules.includes('admin_unfinalize');
        if (!isAdmin && check.recordset[0].CreatedBy !== req.user.userId) {
            return res.status(403).json({ error: 'Only the creator of this record can finalize it.' });
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
                await new sql.Request(transaction)
                    .input('id', sql.Int, r.EntityID)
                    .query(`UPDATE ${em.table} SET IsFinalized=0, FinalizedBy=NULL, FinalizedByName=NULL, FinalizedAt=NULL WHERE ${em.pk}=@id`);
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
