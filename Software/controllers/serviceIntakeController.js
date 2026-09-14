/**
 * Service tablet app — backend.
 * Plan: C:\Users\ServerDeskop\.claude\plans\do-you-have-database-glowing-crayon.md
 *
 * Phase 0: diagnostics. The public reachability check lives in server.js,
 *          ahead of the auth middleware; the test upload is here.
 * Phase 1: the ESTIMATE — what the advisor builds at the vehicle before any
 *          job card exists. The job card is opened only once the customer
 *          signs (Phase 2), so a customer who walks away never consumes an RO
 *          number.
 */
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../config/db');
const { resolveRate } = require('./taxRatesController');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('../middleware/serviceMediaUpload');
const workshop = require('./workshopController');
const { createJobCardInTx, insertLabourLine } = require('../services/jobCardSaveService');
const { findOverlongFields, describeOverlong } = require('../services/jobCardFieldLimits');
const events = require('../services/serviceEvents');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Identical to the job card's snapshotTax (workshopController): tax on the line
// AFTER discount, rounded to paisa. Kept the same on purpose so an estimate's
// totals are exactly what the job card will charge once it is opened.
const lineTax = (gross, discAmt, rate) => {
    const net = Math.max(0, (Number(gross) || 0) - (Number(discAmt) || 0));
    return Math.round((net * ((Number(rate) || 0) / 100)) * 100) / 100;
};

/** An error the handler returns to the tablet as-is, with this status. */
const httpError = (statusCode, message, extra) => Object.assign(new Error(message), { statusCode, extra });

/**
 * sha256 of everything the customer sees and signs on an estimate: who and
 * which car, the visit details, every line with its price and tax, and the
 * total. The signature step refuses a hash that no longer matches, so a
 * customer can only ever sign what was on the screen in front of them.
 */
function contentHash(head, lines) {
    const canon = {
        EndUserID: head.EndUserID ?? null,
        VehicleID: head.VehicleID ?? null,
        JobCardID: head.JobCardID ?? null,
        JobTypeId: head.JobTypeId ?? null,
        KiloMeter: head.KiloMeter == null ? null : Number(head.KiloMeter).toFixed(2),
        CustomerRemarks: head.CustomerRemarks || '',
        GrandTotal: Number(head.GrandTotal || 0).toFixed(2),
        Lines: lines.map(l => [
            l.LineType, l.ItemID, l.Description,
            Number(l.Quantity).toFixed(2), Number(l.Rate).toFixed(2),
            Number(l.TaxRate).toFixed(4), Number(l.TaxAmount).toFixed(2), Number(l.LineTotal).toFixed(2),
        ]),
    };
    return crypto.createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

// =========================================================================
// Phase 0 — diagnostics
// =========================================================================

/**
 * POST /api/service-intake/diagnostics/upload   multipart, field "video"
 *
 * Receives a test video, reports what arrived so the tablet can compare it
 * with what it sent, then deletes it. Upload speed is measured on the tablet
 * from progress events — that is the figure that matters to the advisor
 * standing at the car.
 */
exports.diagnosticsUpload = (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'No file received. Send it in the "video" field.' });

    const result = {
        ok: true,
        bytes: f.size,
        megabytes: +(f.size / 1048576).toFixed(2),
        mimetype: f.mimetype,
        originalName: f.originalname,
        serverReceivedAt: new Date().toISOString(),
        note: 'Test upload deleted — nothing was stored.',
    };

    fs.unlink(f.path, (err) => {
        if (err) console.warn('diagnosticsUpload: could not delete test file', f.path, err.message);
    });
    res.json(result);
};

// =========================================================================
// Phase 1 — estimates
// =========================================================================

async function currentRates() {
    let pst = 0, gst = 0;
    try { pst = await resolveRate('PST'); } catch (e) { console.warn('Estimate: PST rate not configured —', e.message); }
    try { gst = await resolveRate('GST'); } catch (e) { console.warn('Estimate: GST rate not configured —', e.message); }
    return { pst, gst };
}

// ---- Lookups for the intake screens ------------------------------------
// An advisor's role holds workshop_tablet, not the desk permissions
// (workshop_customers, workshop_jobs, parts_spare) that guard the desk
// equivalents. These return only what intake needs, and adding a customer or
// vehicle here can never edit an existing one.

const tooLong = (fields) => fields
    .filter(([, value, max]) => value != null && String(value).length > max)
    .map(([label, , max]) => `${label} can be at most ${max} characters.`);

/** GET /api/service-intake/lookups/job-types */
exports.lookupJobTypes = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT JobCardTypeId, CardCode, Title
            FROM   gen_JobCardType
            WHERE  Status = 1
            ORDER  BY SNo`);
        res.json(r.recordset);
    } catch (err) {
        console.error('lookupJobTypes:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/service-intake/catalog?type=LABOUR|PART&search=&limit=30
 * Labour = active catalog services; parts = active parts with on-hand stock
 * (same formula as /api/items/stock-on-hand, only for the rows returned).
 * Also returns the tax rate that will apply, so the screen can show it.
 */
exports.searchCatalog = async (req, res) => {
    try {
        const type = String(req.query.type || '').toUpperCase();
        if (type !== 'LABOUR' && type !== 'PART') {
            return res.status(400).json({ error: 'type must be LABOUR or PART.' });
        }
        const search = String(req.query.search || '').trim();
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);

        const pool = await getPool();
        const rq = pool.request().input('lim', sql.Int, limit);
        const conds = [
            '(i.ItemStatus = 1 OR i.ItemStatus IS NULL)',
            type === 'LABOUR' ? `i.ItemType = 'Service'` : `ISNULL(i.ItemType, 'Part') = 'Part'`,
        ];
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            conds.push(`(i.ItenName LIKE @s OR i.ManualNumber LIKE @s
                         OR CAST(i.ItemNumber AS NVARCHAR(30)) LIKE @s OR i.SupersededByNumber LIKE @s)`);
        }
        const onHand = type === 'PART'
            ? `, ISNULL((SELECT SUM(ISNULL(a.Quantity, 0))  FROM data_StockArrivalDetail a  WHERE a.ItemId  = i.ItemId), 0)
               + ISNULL((SELECT SUM(ISNULL(io.Quantity, 0)) FROM data_StockInOutDetail   io WHERE io.ItemId = i.ItemId), 0) AS OnHand`
            : '';
        const r = await rq.query(`
            SELECT TOP (@lim) i.ItemId, i.ItenName, i.ManualNumber, i.ItemNumber, i.ItemSalesPrice,
                   i.SupersededByNumber ${onHand}
            FROM   InventItems i
            WHERE  ${conds.join(' AND ')}
            ORDER  BY i.ItenName`);

        const { pst, gst } = await currentRates();
        res.json({
            taxRate: type === 'LABOUR' ? pst : gst,
            rows: r.recordset.map(x => ({
                ...x,
                ItemSalesPrice: Number(x.ItemSalesPrice) || 0,
                ...(type === 'PART' ? { OnHand: Number(x.OnHand) || 0 } : {}),
            })),
        });
    } catch (err) {
        console.error('searchCatalog:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/customers
 * Body: { CustomerName, PhoneNo, CNIC, Email, Address, force }
 * Adds a new customer through the desk's own saveCustomer. A ProfileID in the
 * body is dropped, so this can never overwrite an existing customer. A mobile
 * number already on file comes back as 409 with the matches, so the advisor
 * can pick the existing customer instead; force=true adds anyway (family
 * members often share one number).
 */
exports.createCustomer = async (req, res) => {
    try {
        const b = req.body || {};
        const name  = String(b.CustomerName || '').trim();
        const phone = String(b.PhoneNo || '').trim();
        const cnic  = String(b.CNIC || '').trim();
        const email = String(b.Email || '').trim();
        const addr  = String(b.Address || '').trim();

        if (!name)  return res.status(400).json({ error: 'Enter the customer name.' });
        if (!phone) return res.status(400).json({ error: 'Enter the customer mobile number.' });
        const long = tooLong([['Name', name, 150], ['Mobile', phone, 150], ['CNIC', cnic, 150],
                              ['Email', email, 150], ['Address', addr, 150]]);
        if (long.length) return res.status(400).json({ error: long.join(' ') });

        const digits = phone.replace(/\D/g, '');
        if (!b.force && digits.length >= 10) {
            const pool = await getPool();
            const dup = await pool.request()
                .input('last10', sql.NVarChar(10), digits.slice(-10))
                .query(`SELECT TOP 5 ProfileID, endUserName AS CustomerName, PhoneNo
                        FROM   addata_CustomerInfo
                        WHERE  RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(PhoneNo, '-', ''), ' ', ''), '+', ''), '.', ''), 10) = @last10`);
            if (dup.recordset.length) {
                return res.status(409).json({
                    error: 'A customer with this mobile number is already on file.',
                    existing: dup.recordset,
                });
            }
        }

        req.body = { CustomerName: name, PhoneNo: phone, CNIC: cnic || null, Email: email || null,
                     Address: addr || null, DOB: null };
        return workshop.saveCustomer(req, res);
    } catch (err) {
        console.error('createCustomer:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/customers/:id/vehicles
 * Body: { RegistrationNo, ChasisNo, EngineNo, BrandName, VehicleModel, VehicleColor, force }
 * Adds a vehicle through the desk's addCustomerVehicle. The same registration
 * or chassis already on this customer is refused with the existing vehicle
 * (pick it instead); on another customer it is a 409 warning — the car may
 * have been sold — that force=true overrides.
 */
exports.addVehicle = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const v = {
            RegistrationNo: String(b.RegistrationNo || '').trim().toUpperCase(),
            ChasisNo:       String(b.ChasisNo || '').trim().toUpperCase(),
            EngineNo:       String(b.EngineNo || '').trim().toUpperCase(),
            BrandName:      String(b.BrandName || '').trim(),
            VehicleModel:   String(b.VehicleModel || '').trim(),
            VehicleColor:   String(b.VehicleColor || '').trim(),
        };
        if (!v.RegistrationNo && !v.ChasisNo) {
            return res.status(400).json({ error: 'Enter the registration number or the chassis number.' });
        }
        const long = tooLong([['Registration', v.RegistrationNo, 150], ['Chassis', v.ChasisNo, 150],
                              ['Engine', v.EngineNo, 150], ['Make', v.BrandName, 150],
                              ['Model', v.VehicleModel, 150], ['Colour', v.VehicleColor, 100]]);
        if (long.length) return res.status(400).json({ error: long.join(' ') });

        const pool = await getPool();
        const cust = await pool.request().input('id', sql.Int, id)
            .query('SELECT ProfileID FROM addata_CustomerInfo WHERE ProfileID = @id');
        if (!cust.recordset.length) return res.status(404).json({ error: 'Customer not found.' });

        const dup = await pool.request()
            .input('reg', sql.NVarChar(150), v.RegistrationNo.replace(/[\s-]/g, ''))
            .input('ch',  sql.NVarChar(150), v.ChasisNo)
            .query(`SELECT TOP 5 w.VehicleID, w.EndUserID, w.RegistrationNo, w.ChasisNo, w.VehicleModel,
                           c.endUserName AS CustomerName
                    FROM   WorkshopVehicles w
                    LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = w.EndUserID
                    WHERE  (@reg <> '' AND REPLACE(REPLACE(w.RegistrationNo, ' ', ''), '-', '') = @reg)
                       OR  (@ch  <> '' AND w.ChasisNo = @ch)`);
        const own = dup.recordset.find(x => x.EndUserID === id);
        if (own) {
            return res.status(409).json({ error: 'This vehicle is already on this customer.', existingVehicle: own });
        }
        if (dup.recordset.length && !b.force) {
            return res.status(409).json({
                error: `This vehicle is already registered to ${dup.recordset[0].CustomerName || 'another customer'}.`,
                others: dup.recordset,
            });
        }

        req.body = { ...v, EngineNo: v.EngineNo || null, BrandName: v.BrandName || null,
                     VehicleModel: v.VehicleModel || null, ChasisNo: v.ChasisNo || null,
                     RegistrationNo: v.RegistrationNo || null };
        return workshop.addCustomerVehicle(req, res);
    } catch (err) {
        console.error('addVehicle:', err);
        res.status(500).json({ error: err.message });
    }
};

async function loadEstimate(pool, id) {
    const head = await pool.request().input('id', sql.Int, id).query(`
        SELECT e.*,
               c.endUserName  AS CustomerName,
               c.PhoneNo      AS CustomerPhone,
               c.CNIC         AS CustomerCNIC,
               c.Address      AS CustomerAddress,
               t.CardCode     AS JobTypeCode,
               t.Title        AS JobTypeName,
               jc.JobCardNo,
               ISNULL(jc.IsFinalized, 0) AS JobCardFinalized,
               bay.BayName
        FROM   dms_ServiceEstimates e
        LEFT   JOIN addata_CustomerInfo c ON c.ProfileID     = e.EndUserID
        LEFT   JOIN gen_JobCardType     t ON t.JobCardTypeId = e.JobTypeId
        LEFT   JOIN Addata_JobCardInfo jc ON jc.JobCardId    = e.JobCardID
        LEFT   JOIN dms_Bays          bay ON bay.BayID       = e.BayID
        WHERE  e.EstimateID = @id`);
    if (!head.recordset.length) return null;

    // One query at a time, not Promise.all: this also runs inside the
    // signature transaction, which takes a single request at a time.
    const lines = await pool.request().input('id', sql.Int, id).query(`
            SELECT l.LineID, l.LineSeq, l.LineType, l.ItemID, l.Description, l.PartNumber,
                   l.Quantity, l.Rate, l.DiscAmt, l.TaxRate, l.TaxAmount, l.LineTotal,
                   -- Live stock for part lines, so a reopened estimate still
                   -- shows what the parts counter has (display only).
                   CASE WHEN l.LineType = 'PART' THEN
                        ISNULL((SELECT SUM(ISNULL(a.Quantity, 0))  FROM data_StockArrivalDetail a  WHERE a.ItemId  = l.ItemID), 0)
                      + ISNULL((SELECT SUM(ISNULL(io.Quantity, 0)) FROM data_StockInOutDetail   io WHERE io.ItemId = l.ItemID), 0)
                   END AS OnHand
            FROM   dms_ServiceEstimateLines l
            WHERE  l.EstimateID = @id
            ORDER  BY l.LineSeq`);
    const media = await pool.request().input('id', sql.Int, id).query(`
            SELECT MediaID, MediaType, OriginalName, MimeType, SizeBytes, CapturedByName, CapturedAt
            FROM   dms_ServiceMedia
            WHERE  EstimateID = @id AND DeletedAt IS NULL
            ORDER  BY MediaID`);
    const signature = await pool.request().input('id', sql.Int, id).query(`
            SELECT SignatureID, SignerName, SignerMobile, SignedAt, GrandTotal, BayName, CapturedByName
            FROM   dms_ServiceEstimateSignatures
            WHERE  EstimateID = @id`);
    const h = head.recordset[0];
    return {
        ...h,
        Lines: lines.recordset,
        Media: media.recordset,
        Signature: signature.recordset[0] || null,
        ContentHash: contentHash(h, lines.recordset),
    };
}

async function estimateStatus(pool, id) {
    const r = await pool.request().input('id', sql.Int, id)
        .query('SELECT Status FROM dms_ServiceEstimates WHERE EstimateID = @id');
    return r.recordset[0]?.Status || null;
}

/** POST /api/service-intake/estimates — start a new draft at the vehicle. */
exports.createEstimate = async (req, res) => {
    try {
        const pool = await getPool();
        const n = (await pool.request().query('SELECT NEXT VALUE FOR dbo.seq_ServiceEstimateNo AS n')).recordset[0].n;
        const estimateNo = 'EST-' + String(n).padStart(5, '0');
        const ins = await pool.request()
            .input('no',    sql.NVarChar(20),  estimateNo)
            .input('uid',   sql.Int,           req.user?.userId || null)
            .input('uname', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_ServiceEstimates (EstimateNo, AdvisorUserID, AdvisorName)
                    OUTPUT INSERTED.EstimateID
                    VALUES (@no, @uid, @uname)`);
        res.status(201).json(await loadEstimate(pool, ins.recordset[0].EstimateID));
    } catch (err) {
        console.error('createEstimate:', err);
        res.status(500).json({ error: err.message });
    }
};

/** GET /api/service-intake/estimates?status=open|all&mine=1&search= */
exports.listEstimates = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = [];
        if (req.query.status !== 'all') conds.push(`e.Status IN ('Draft', 'AwaitingSignature')`);
        if (req.query.mine === '1') {
            rq.input('uid', sql.Int, req.user?.userId || -1);
            conds.push('e.AdvisorUserID = @uid');
        }
        const search = (req.query.search || '').trim();
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            conds.push('(e.EstimateNo LIKE @s OR e.VehicleRegNo LIKE @s OR c.endUserName LIKE @s OR c.PhoneNo LIKE @s OR jc.JobCardNo LIKE @s)');
        }
        const r = await rq.query(`
            SELECT TOP 100
                   e.EstimateID, e.EstimateNo, e.Status, e.VehicleRegNo, e.VehicleModel,
                   e.GrandTotal, e.AdvisorName, e.CreatedAt, e.UpdatedAt, e.JobCardID,
                   c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone, jc.JobCardNo,
                   (SELECT COUNT(*) FROM dms_ServiceMedia m
                    WHERE m.EstimateID = e.EstimateID AND m.DeletedAt IS NULL) AS MediaCount,
                   (SELECT COUNT(*) FROM dms_ServiceEstimateLines l
                    WHERE l.EstimateID = e.EstimateID) AS LineCount
            FROM   dms_ServiceEstimates e
            LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = e.EndUserID
            LEFT   JOIN Addata_JobCardInfo jc ON jc.JobCardId = e.JobCardID
            ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
            ORDER  BY e.EstimateID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('listEstimates:', err);
        res.status(500).json({ error: err.message });
    }
};

/** GET /api/service-intake/estimates/:id */
exports.getEstimate = async (req, res) => {
    try {
        const pool = await getPool();
        const est = await loadEstimate(pool, parseInt(req.params.id));
        if (!est) return res.status(404).json({ error: 'Estimate not found.' });
        res.json(est);
    } catch (err) {
        console.error('getEstimate:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * PUT /api/service-intake/estimates/:id
 * Body: { EndUserID, VehicleID, KiloMeter, JobTypeId, CustomerRemarks,
 *         Lines: [{ LineType: 'LABOUR'|'PART', ItemID, Quantity }] }
 *
 * The tablet sends only WHICH customer, vehicle and items, and how many.
 * Everything with money or identity in it is resolved here on the server:
 *   - vehicle registration / chassis / engine / model are copied from the
 *     customer's vehicle record, and the vehicle must belong to that customer
 *   - labour must be a catalog service (catalog-only rule) and parts a part;
 *     description and price come from the catalog, never from the tablet
 *   - PST on labour, GST on parts, at today's configured rates
 *   - labour lines are always quantity 1, as on the job card
 * so an estimate cannot carry a price or a vehicle nobody set in DealerDesk.
 */
exports.updateEstimate = async (req, res) => {
    const id = parseInt(req.params.id);
    const b = req.body || {};
    try {
        const pool = await getPool();

        const status = await estimateStatus(pool, id);
        if (!status) return res.status(404).json({ error: 'Estimate not found.' });
        if (status !== 'Draft') {
            return res.status(423).json({ error: `Estimate is ${status} and can no longer be edited.` });
        }

        // Additional work on an open job card keeps the job card's customer
        // and vehicle, whatever the tablet sends.
        const cur = (await pool.request().input('id', sql.Int, id)
            .query('SELECT EndUserID, VehicleID, JobCardID FROM dms_ServiceEstimates WHERE EstimateID = @id')).recordset[0];
        const endUserId = cur.JobCardID ? cur.EndUserID : (b.EndUserID ? parseInt(b.EndUserID) : null);
        const vehicleId = cur.JobCardID ? cur.VehicleID : (endUserId && b.VehicleID ? parseInt(b.VehicleID) : null);

        let vehicle = null;
        if (vehicleId) {
            const v = await pool.request().input('vid', sql.Int, vehicleId).query(`
                SELECT VehicleID, EndUserID, RegistrationNo, ChasisNo, EngineNo, VehicleModel
                FROM   WorkshopVehicles WHERE VehicleID = @vid`);
            if (!v.recordset.length) return res.status(400).json({ error: 'The selected vehicle no longer exists.' });
            vehicle = v.recordset[0];
            if (vehicle.EndUserID !== endUserId) {
                return res.status(400).json({ error: 'That vehicle is registered to a different customer.' });
            }
        }

        const rawLines = Array.isArray(b.Lines) ? b.Lines : [];
        const itemIds = [...new Set(rawLines.map(l => parseInt(l.ItemID)).filter(n => Number.isInteger(n) && n > 0))];
        let items = new Map();
        if (itemIds.length) {
            // Safe to inline: every id passed Number.isInteger above.
            const itRes = await pool.request().query(`
                SELECT ItemId, ItenName, ManualNumber, ItemNumber, ItemSalesPrice, ItemType, ItemStatus
                FROM   InventItems WHERE ItemId IN (${itemIds.join(',')})`);
            items = new Map(itRes.recordset.map(i => [i.ItemId, i]));
        }

        const { pst, gst } = await currentRates();
        const lines = [];
        const problems = [];
        rawLines.forEach((l, i) => {
            const type = String(l.LineType || '').toUpperCase();
            const item = items.get(parseInt(l.ItemID));
            const n = i + 1;
            if (type !== 'LABOUR' && type !== 'PART') { problems.push(`Line ${n}: unknown line type.`); return; }
            if (!item) { problems.push(`Line ${n}: item not found in the catalog.`); return; }

            // Same rules as the desk catalog: vw_ActiveItems treats a NULL
            // status as active, and stock-on-hand treats a NULL type as a part.
            const kind = String(item.ItemType || 'Part').trim().toLowerCase();
            if (item.ItemStatus === false) { problems.push(`Line ${n}: ${item.ItenName} is no longer active in the catalog.`); return; }
            if (type === 'LABOUR' && kind !== 'service') { problems.push(`Line ${n}: ${item.ItenName} is not a labour service.`); return; }
            if (type === 'PART' && kind !== 'part')      { problems.push(`Line ${n}: ${item.ItenName} is not a spare part.`); return; }

            const qty = type === 'LABOUR' ? 1 : Number(l.Quantity);
            if (!(qty > 0)) { problems.push(`Line ${n}: quantity must be more than zero.`); return; }

            const rate = r2(item.ItemSalesPrice);
            const gross = r2(rate * qty);
            const taxRate = type === 'LABOUR' ? pst : gst;
            const taxAmount = lineTax(gross, 0, taxRate);
            lines.push({
                type,
                itemId: item.ItemId,
                description: String(item.ItenName || '').slice(0, 300),
                partNumber: item.ManualNumber || (item.ItemNumber != null ? String(item.ItemNumber) : null),
                qty, rate, taxRate, taxAmount,
                lineTotal: r2(gross + taxAmount),
            });
        });
        if (problems.length) return res.status(400).json({ error: problems.join(' ') });

        const sum = (arr, f) => r2(arr.reduce((s, x) => s + f(x), 0));
        const labour = lines.filter(l => l.type === 'LABOUR');
        const parts  = lines.filter(l => l.type === 'PART');
        const labourTotal = sum(labour, l => l.rate * l.qty);
        const labourTax   = sum(labour, l => l.taxAmount);
        const partsTotal  = sum(parts,  l => l.rate * l.qty);
        const partsTax    = sum(parts,  l => l.taxAmount);
        const grandTotal  = r2(labourTotal + labourTax + partsTotal + partsTax);

        const km = b.KiloMeter === '' || b.KiloMeter == null ? null : Number(b.KiloMeter);
        if (km != null && !(km >= 0)) return res.status(400).json({ error: 'Odometer reading must be a positive number.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // Re-check inside the transaction: it must not have been signed or
            // cancelled between the read above and this write.
            const again = await new sql.Request(tx).input('id', sql.Int, id)
                .query('SELECT Status FROM dms_ServiceEstimates WITH (UPDLOCK) WHERE EstimateID = @id');
            if (again.recordset[0]?.Status !== 'Draft') {
                await tx.rollback();
                return res.status(423).json({ error: `Estimate is ${again.recordset[0]?.Status} and can no longer be edited.` });
            }

            await new sql.Request(tx)
                .input('id',     sql.Int,              id)
                .input('eu',     sql.Int,              endUserId)
                .input('vid',    sql.Int,              vehicle ? vehicle.VehicleID : null)
                .input('reg',    sql.NVarChar(150),    vehicle?.RegistrationNo || null)
                .input('ch',     sql.NVarChar(150),    vehicle?.ChasisNo || null)
                .input('eng',    sql.NVarChar(150),    vehicle?.EngineNo || null)
                .input('model',  sql.NVarChar(300),    vehicle?.VehicleModel || null)
                .input('km',     sql.Decimal(18, 2),   km)
                .input('jt',     sql.Int,              b.JobTypeId ? parseInt(b.JobTypeId) : null)
                .input('rem',    sql.NVarChar(sql.MAX), b.CustomerRemarks ? String(b.CustomerRemarks) : null)
                .input('pst',    sql.Decimal(8, 4),    pst)
                .input('gst',    sql.Decimal(8, 4),    gst)
                .input('lt',     sql.Decimal(18, 2),   labourTotal)
                .input('ltax',   sql.Decimal(18, 2),   labourTax)
                .input('pt',     sql.Decimal(18, 2),   partsTotal)
                .input('ptax',   sql.Decimal(18, 2),   partsTax)
                .input('gt',     sql.Decimal(18, 2),   grandTotal)
                .query(`UPDATE dms_ServiceEstimates SET
                            EndUserID = @eu, VehicleID = @vid,
                            VehicleRegNo = @reg, ChasisNo = @ch, EngineNo = @eng, VehicleModel = @model,
                            KiloMeter = @km, JobTypeId = @jt, CustomerRemarks = @rem,
                            PSTRate = @pst, GSTRate = @gst,
                            LabourTotal = @lt, LabourTax = @ltax, PartsTotal = @pt, PartsTax = @ptax,
                            GrandTotal = @gt, UpdatedAt = GETDATE()
                        WHERE EstimateID = @id`);

            await new sql.Request(tx).input('id', sql.Int, id)
                .query('DELETE FROM dms_ServiceEstimateLines WHERE EstimateID = @id');

            for (let i = 0; i < lines.length; i++) {
                const l = lines[i];
                await new sql.Request(tx)
                    .input('id',   sql.Int,            id)
                    .input('seq',  sql.Int,            i + 1)
                    .input('type', sql.NVarChar(10),   l.type)
                    .input('item', sql.Int,            l.itemId)
                    .input('desc', sql.NVarChar(300),  l.description)
                    .input('pn',   sql.NVarChar(100),  l.partNumber ? String(l.partNumber).slice(0, 100) : null)
                    .input('qty',  sql.Decimal(18, 2), l.qty)
                    .input('rate', sql.Decimal(18, 2), l.rate)
                    .input('tr',   sql.Decimal(8, 4),  l.taxRate)
                    .input('ta',   sql.Decimal(18, 2), l.taxAmount)
                    .input('tot',  sql.Decimal(18, 2), l.lineTotal)
                    .query(`INSERT INTO dms_ServiceEstimateLines
                                (EstimateID, LineSeq, LineType, ItemID, Description, PartNumber,
                                 Quantity, Rate, DiscAmt, TaxRate, TaxAmount, LineTotal)
                            VALUES (@id, @seq, @type, @item, @desc, @pn,
                                    @qty, @rate, 0, @tr, @ta, @tot)`);
            }
            await tx.commit();
        } catch (e) {
            try { await tx.rollback(); } catch { /* already rolled back */ }
            throw e;
        }

        res.json(await loadEstimate(pool, id));
    } catch (err) {
        console.error('updateEstimate:', err);
        res.status(500).json({ error: err.message });
    }
};

/** GET /api/service-intake/estimates/:id/print-data — the estimate plus the letterhead. */
exports.getEstimatePrintData = async (req, res) => {
    try {
        const pool = await getPool();
        const est = await loadEstimate(pool, parseInt(req.params.id));
        if (!est) return res.status(404).json({ error: 'Estimate not found.' });
        const bp = await pool.request().query('SELECT TOP 1 * FROM dms_BusinessProfile ORDER BY ProfileID');
        res.json({ estimate: est, business: bp.recordset[0] || null });
    } catch (err) {
        console.error('getEstimatePrintData:', err);
        res.status(500).json({ error: err.message });
    }
};

// =========================================================================
// Phase 2 — the customer's signature opens the job card
// =========================================================================

const SIGNATURE_DIR = path.join(UPLOAD_DIR, 'signatures');
fs.mkdirSync(SIGNATURE_DIR, { recursive: true });
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// Multipart, not JSON: a signature PNG from a high-density tablet screen can
// be larger than the 100 kB JSON body limit.
exports.signatureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => (file.mimetype === 'image/png'
        ? cb(null, true)
        : cb(new Error('The signature must be a PNG image.'))),
}).single('signature');

function assertSignable(est, hash) {
    if (est.Status !== 'Draft') {
        throw httpError(423, `${est.EstimateNo} is ${est.Status === 'Converted' ? 'already signed' : est.Status.toLowerCase()}.`);
    }
    const missing = [];
    if (!est.EndUserID) missing.push('the customer');
    if (!est.VehicleID) missing.push('the vehicle');
    if (!est.JobCardID && !est.JobTypeId) missing.push('the job type');
    if (!est.Lines.length) missing.push('at least one job or part');
    if (missing.length) throw httpError(400, `Still needed before signing: ${missing.join(', ')}.`);
    if (!hash || hash !== est.ContentHash) {
        throw httpError(409,
            'The estimate changed after it was shown to the customer. Show them the updated estimate and ask them to sign again.',
            { code: 'content_changed' });
    }
}

const labourItemsFor = (est, bayName) => est.Lines
    .filter(l => l.LineType === 'LABOUR')
    .map(l => ({
        JobInfoId: l.ItemID,
        WorkDescription: l.Description,
        Price: Number(l.Rate),
        Discount: 0,
        DiscAmt: 0,
        DiscType: null,
        BayNo: bayName,
    }));

const jobCardBodyFor = (est, { jobCode, promised, signerName, vehicleColor, user, bayName }) => ({
    jobCode,
    DMSJobCardNo: null,
    JobTypeId: est.JobTypeId,
    OrderTypeId: null,
    EndUserID: est.EndUserID,
    VehicleRegNo: est.VehicleRegNo,
    ChasisNo: est.ChasisNo,
    EngineNo: est.EngineNo,
    VersionCode: est.VehicleModel,
    VehicleCode: null,
    VehicleColor: vehicleColor || null,
    KiloMeter: est.KiloMeter,
    PromisedDate: promised || null,
    Remarks: `Opened on the service tablet from estimate ${est.EstimateNo}, signed by ${signerName}.`,
    VOCRemarks: est.CustomerRemarks || '',
    PaymentType: 'Cash',
    CustomerType: 'Walk-in',
    ServiceAdvisor: user?.employeeName || user?.userName || null,
    ServiceAdvisorID: user?.employeeId || null,
    LabourItems: labourItemsFor(est, bayName),
    Accessories: [],
    DamageMarks: [],
});

/**
 * POST /api/service-intake/estimates/:id/sign   multipart
 * Fields: ContentHash, SignerName, SignerMobile, BayID, JobCode (new visit
 * only), PromisedDate ("YYYY-MM-DDTHH:MM", optional); file "signature" (PNG).
 *
 * In ONE transaction:
 *   - a new visit opens a job card through the same code as the desk form
 *     (RO number, header, labour lines with PST), every job line on the chosen
 *     bay; additional work appends its job lines to the open job card instead
 *   - the signature is recorded with the server's clock and the content hash
 *   - the parts go to the parts counter as a requisition, at the signed prices
 *   - the estimate becomes Converted and its media is linked to the job card
 * The ContentHash must match the estimate as it stands — checked again under a
 * row lock — so the customer can only sign what was on the screen.
 */
exports.signEstimate = async (req, res) => {
    const id = parseInt(req.params.id);
    const b = req.body || {};
    let filePath = null;
    try {
        const signerName = String(b.SignerName || '').trim();
        const signerMobile = String(b.SignerMobile || '').trim();
        const jobCode = String(b.JobCode || '').trim();
        const promised = String(b.PromisedDate || '').trim();
        const bayId = parseInt(b.BayID);

        if (!signerName) throw httpError(400, 'Enter the name of the person signing.');
        const long = tooLong([['Name of person signing', signerName, 150], ['Mobile', signerMobile, 30]]);
        if (long.length) throw httpError(400, long.join(' '));
        const png = req.file?.buffer;
        if (!png || png.length < 200) throw httpError(400, 'The signature is missing. Ask the customer to sign in the box.');
        if (!png.subarray(0, 8).equals(PNG_MAGIC)) throw httpError(400, 'The signature must be a PNG image.');
        if (!Number.isInteger(bayId)) throw httpError(400, 'Pick the bay where the car will be worked on.');
        if (promised && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(promised)) {
            throw httpError(400, 'Promised delivery is not a valid date and time.');
        }

        const pool = await getPool();
        const pre = await loadEstimate(pool, id);
        if (!pre) throw httpError(404, 'Estimate not found.');
        assertSignable(pre, b.ContentHash);
        const isRevision = !!pre.JobCardID;
        if (!isRevision && !jobCode) throw httpError(400, 'Enter the job number, as on the desk job card form.');

        // The total the customer sees was taxed at the rates in force when the
        // estimate was last saved. If a rate has changed since, the job card
        // would charge a different total from the one signed for.
        const { pst, gst } = await currentRates();
        const hasLabour = pre.Lines.some(l => l.LineType === 'LABOUR');
        const hasParts = pre.Lines.some(l => l.LineType === 'PART');
        if ((hasLabour && Number(pre.PSTRate) !== pst) || (hasParts && Number(pre.GSTRate) !== gst)) {
            throw httpError(409,
                'The tax rate has changed since this estimate was last saved. Recalculate it and ask the customer to sign again.',
                { code: 'rates_changed' });
        }

        const bay = (await pool.request().input('b', sql.Int, bayId)
            .query('SELECT BayID, BayName FROM dms_Bays WHERE BayID = @b AND IsActive = 1')).recordset[0];
        if (!bay) throw httpError(400, 'That bay is not active. Pick another bay.');
        if (String(bay.BayName).length > 20) {
            throw httpError(400, `The bay name "${bay.BayName}" is longer than the 20 characters a job line holds. Shorten it in Workshop Settings.`);
        }

        const vehicleColor = (await pool.request().input('v', sql.Int, pre.VehicleID)
            .query('SELECT VehicleColor FROM WorkshopVehicles WHERE VehicleID = @v')).recordset[0]?.VehicleColor;
        const bodyArgs = { jobCode, promised, signerName, vehicleColor, user: req.user, bayName: bay.BayName };
        const overlong = await findOverlongFields(pool, isRevision
            ? { LabourItems: labourItemsFor(pre, bay.BayName) }
            : jobCardBodyFor(pre, bodyArgs));
        if (overlong.length) throw httpError(400, describeOverlong(overlong));

        filePath = path.join(SIGNATURE_DIR, `est${id}_${Date.now()}.png`);
        await fs.promises.writeFile(filePath, png);

        const tx = new sql.Transaction(pool);
        await tx.begin();
        let result;
        try {
            await new sql.Request(tx).input('id', sql.Int, id)
                .query('SELECT Status FROM dms_ServiceEstimates WITH (UPDLOCK, HOLDLOCK) WHERE EstimateID = @id');
            const est = await loadEstimate(tx, id);
            assertSignable(est, b.ContentHash);

            let jobCardId, jobCardNo;
            if (est.JobCardID) {
                const jc = (await new sql.Request(tx).input('jc', sql.Int, est.JobCardID)
                    .query('SELECT JobCardNo, IsFinalized FROM Addata_JobCardInfo WITH (UPDLOCK) WHERE JobCardId = @jc')).recordset[0];
                if (!jc) throw httpError(404, 'The job card for this additional work no longer exists.');
                if (jc.IsFinalized) throw httpError(423, `${jc.JobCardNo} is finalized, so work can no longer be added to it.`);
                for (const item of labourItemsFor(est, bay.BayName)) {
                    await insertLabourLine(tx, est.JobCardID, item, pst);
                }
                await new sql.Request(tx).input('jc', sql.Int, est.JobCardID)
                    .query('UPDATE Addata_JobCardInfo SET ModifyDate = GETDATE() WHERE JobCardId = @jc');
                jobCardId = est.JobCardID;
                jobCardNo = jc.JobCardNo;
            } else {
                const created = await createJobCardInTx(tx, jobCardBodyFor(est, bodyArgs), req.user, pst);
                jobCardId = created.JobCardId;
                jobCardNo = created.JobCardNo;
            }

            const sig = await new sql.Request(tx)
                .input('id',    sql.Int,           id)
                .input('jc',    sql.Int,           jobCardId)
                .input('rev',   sql.Int,           est.RevisionNo)
                .input('name',  sql.NVarChar(150), signerName)
                .input('mob',   sql.NVarChar(30),  signerMobile || null)
                .input('file',  sql.NVarChar(260), path.basename(filePath))
                .input('hash',  sql.Char(64),      est.ContentHash)
                .input('total', sql.Decimal(18, 2), est.GrandTotal)
                .input('bay',   sql.Int,           bay.BayID)
                .input('bayN',  sql.NVarChar(50),  bay.BayName)
                .input('uid',   sql.Int,           req.user?.userId || null)
                .input('uname', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_ServiceEstimateSignatures
                            (EstimateID, JobCardID, RevisionNo, SignerName, SignerMobile, SignatureFile, ContentHash,
                             GrandTotal, BayID, BayName, CapturedByUserID, CapturedByName)
                        OUTPUT INSERTED.SignatureID
                        VALUES (@id, @jc, @rev, @name, @mob, @file, @hash, @total, @bay, @bayN, @uid, @uname)`);
            const signatureId = sig.recordset[0].SignatureID;

            let requisitionNo = null;
            const partLines = est.Lines.filter(l => l.LineType === 'PART');
            if (partLines.length) {
                const n = (await new sql.Request(tx).query('SELECT NEXT VALUE FOR dbo.seq_PartsRequisitionNo AS n')).recordset[0].n;
                requisitionNo = 'PR-' + String(n).padStart(5, '0');
                const reqIns = await new sql.Request(tx)
                    .input('no',    sql.NVarChar(20),  requisitionNo)
                    .input('jc',    sql.Int,           jobCardId)
                    .input('jcNo',  sql.NVarChar(100), jobCardNo)
                    .input('est',   sql.Int,           id)
                    .input('sig',   sql.Int,           signatureId)
                    .input('uid',   sql.Int,           req.user?.userId || null)
                    .input('uname', sql.NVarChar(100), req.user?.userName || null)
                    .query(`INSERT INTO dms_PartsRequisitions
                                (RequisitionNo, JobCardID, JobCardNo, EstimateID, SignatureID, RequestedByUserID, RequestedByName)
                            OUTPUT INSERTED.RequisitionID
                            VALUES (@no, @jc, @jcNo, @est, @sig, @uid, @uname)`);
                const requisitionId = reqIns.recordset[0].RequisitionID;
                for (let i = 0; i < partLines.length; i++) {
                    const l = partLines[i];
                    await new sql.Request(tx)
                        .input('rid',  sql.Int,            requisitionId)
                        .input('seq',  sql.Int,            i + 1)
                        .input('item', sql.Int,            l.ItemID)
                        .input('desc', sql.NVarChar(300),  l.Description)
                        .input('pn',   sql.NVarChar(100),  l.PartNumber || null)
                        .input('qty',  sql.Decimal(18, 2), l.Quantity)
                        .input('rate', sql.Decimal(18, 2), l.Rate)
                        .input('eln',  sql.Int,            l.LineID)
                        .query(`INSERT INTO dms_PartsRequisitionLines
                                    (RequisitionID, LineSeq, ItemID, Description, PartNumber, QtyRequested, Rate, EstimateLineID)
                                VALUES (@rid, @seq, @item, @desc, @pn, @qty, @rate, @eln)`);
                }
            }

            await new sql.Request(tx)
                .input('id',  sql.Int, id)
                .input('jc',  sql.Int, jobCardId)
                .input('bay', sql.Int, bay.BayID)
                .query(`UPDATE dms_ServiceEstimates
                        SET Status = 'Converted', JobCardID = @jc, BayID = @bay, UpdatedAt = GETDATE()
                        WHERE EstimateID = @id;
                        UPDATE dms_ServiceMedia SET JobCardID = @jc WHERE EstimateID = @id;`);

            await tx.commit();
            result = {
                JobCardId: jobCardId, JobCardNo: jobCardNo, RequisitionNo: requisitionNo,
                BayName: bay.BayName, isRevision: !!est.JobCardID,
            };
        } catch (e) {
            try { await tx.rollback(); } catch { /* already rolled back */ }
            throw e;
        }

        filePath = null;   // committed: the signature file stays
        events.bayJobsChanged({ JobCardId: result.JobCardId });
        if (result.RequisitionNo) events.requisitionsChanged({ JobCardId: result.JobCardId });
        events.advisorJobCardChanged(req.user?.userId, { JobCardId: result.JobCardId });
        res.status(201).json({ ...result, estimate: await loadEstimate(pool, id) });
    } catch (err) {
        if (filePath) fs.unlink(filePath, () => {});
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, ...(err.extra || {}) });
        console.error('signEstimate:', err);
        res.status(500).json({ error: err.message });
    }
};

/** GET /api/service-intake/estimates/:id/signature — the signature PNG (login required). */
exports.getSignatureImage = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT SignatureFile FROM dms_ServiceEstimateSignatures WHERE EstimateID = @id');
        if (!r.recordset.length) return res.status(404).json({ error: 'This estimate has not been signed.' });
        res.set('Cache-Control', 'private, no-store');
        res.sendFile(path.join(SIGNATURE_DIR, path.basename(r.recordset[0].SignatureFile)), (err) => {
            if (err && !res.headersSent) res.status(404).json({ error: 'The signature image file is missing.' });
        });
    } catch (err) {
        console.error('getSignatureImage:', err);
        res.status(500).json({ error: err.message });
    }
};

/** POST /api/service-intake/estimates/:id/cancel   { Reason } — customer walked away. */
exports.cancelEstimate = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = String(req.body?.Reason || '').trim().slice(0, 300) || null;
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('reason', sql.NVarChar(300), reason)
            .query(`UPDATE dms_ServiceEstimates
                    SET Status = 'Cancelled', CancelledAt = GETDATE(), CancelReason = @reason, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.EstimateID
                    WHERE EstimateID = @id AND Status IN ('Draft', 'AwaitingSignature')`);
        if (!r.recordset.length) {
            const status = await estimateStatus(pool, id);
            if (!status) return res.status(404).json({ error: 'Estimate not found.' });
            return res.status(423).json({ error: `Estimate is ${status} and cannot be cancelled.` });
        }
        res.json(await loadEstimate(pool, id));
    } catch (err) {
        console.error('cancelEstimate:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/estimates/:id/media   multipart, field "media"
 *
 * Attaches a walk-around video or photo. The permission check runs before the
 * upload reaches disk (see routes); anything refused after that point — a
 * missing or closed estimate — has its file deleted, so no orphan video is
 * left filling the disk.
 */
exports.uploadEstimateMedia = async (req, res) => {
    const f = req.file;
    const discard = () => { if (f) fs.unlink(f.path, () => {}); };
    try {
        if (!f) return res.status(400).json({ error: 'No file received. Send it in the "media" field.' });
        const id = parseInt(req.params.id);
        const pool = await getPool();

        const status = await estimateStatus(pool, id);
        if (!status) { discard(); return res.status(404).json({ error: 'Estimate not found.' }); }
        if (status === 'Converted' || status === 'Cancelled') {
            discard();
            return res.status(423).json({ error: `Estimate is ${status}; media can no longer be added.` });
        }

        const ins = await pool.request()
            .input('id',    sql.Int,           id)
            .input('type',  sql.NVarChar(10),  String(f.mimetype).startsWith('video/') ? 'VIDEO' : 'PHOTO')
            .input('file',  sql.NVarChar(260), path.basename(f.path))
            .input('orig',  sql.NVarChar(260), String(f.originalname || '').slice(0, 260) || null)
            .input('mime',  sql.NVarChar(100), f.mimetype)
            .input('size',  sql.BigInt,        f.size)
            .input('uid',   sql.Int,           req.user?.userId || null)
            .input('uname', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_ServiceMedia
                        (EstimateID, MediaType, FileName, OriginalName, MimeType, SizeBytes, CapturedByUserID, CapturedByName)
                    OUTPUT INSERTED.MediaID, INSERTED.MediaType, INSERTED.OriginalName, INSERTED.MimeType,
                           INSERTED.SizeBytes, INSERTED.CapturedByName, INSERTED.CapturedAt
                    VALUES (@id, @type, @file, @orig, @mime, @size, @uid, @uname)`);
        res.status(201).json(ins.recordset[0]);
    } catch (err) {
        discard();
        console.error('uploadEstimateMedia:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * DELETE /api/service-intake/estimates/:id/media/:mediaId
 * For a video recorded by mistake, while the estimate is still a draft. The
 * row is kept (marked deleted) for the record; the file itself is removed to
 * give the disk back.
 */
exports.deleteEstimateMedia = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const mediaId = parseInt(req.params.mediaId);
        const pool = await getPool();

        const status = await estimateStatus(pool, id);
        if (!status) return res.status(404).json({ error: 'Estimate not found.' });
        if (status !== 'Draft') return res.status(423).json({ error: `Estimate is ${status}; its media is kept as a record.` });

        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('mid', sql.Int, mediaId)
            .query(`UPDATE dms_ServiceMedia SET DeletedAt = GETDATE()
                    OUTPUT INSERTED.FileName
                    WHERE MediaID = @mid AND EstimateID = @id AND DeletedAt IS NULL`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Media not found on this estimate.' });

        // basename() again, so a stored name can never point outside the folder.
        const file = path.join(UPLOAD_DIR, path.basename(r.recordset[0].FileName));
        fs.unlink(file, (err) => {
            if (err && err.code !== 'ENOENT') console.warn('deleteEstimateMedia: could not remove', file, err.message);
        });
        res.json({ ok: true, MediaID: mediaId });
    } catch (err) {
        console.error('deleteEstimateMedia:', err);
        res.status(500).json({ error: err.message });
    }
};
