/**
 * Sales Module — Vehicle Catalog CRUD.
 *
 * Three entities: Model → Variant → Vehicle (per-VIN).
 * Source spec: .claude/planning/sales-module-design.md §8.
 *
 *   Models   — high-level (Changan Alsvin, Changan Karvaan)
 *   Variants — trim/spec/pricing per Model. Has tax-treatment per decision #26.
 *   Vehicles — physical chassis. Allocation type + status.
 *
 * Permissions (per modules.js):
 *   - read:  sales_executive / sales_agm / sales_gm / sales_admin_settings / sales_reports
 *   - write: sales_admin_settings (catalog edits)
 *   - vehicle receive (status flip AtMaster → InTransit → AtDealer): sales_master_settlement
 *   - vehicle allocate to booking: sales_agm / sales_gm  (decision #22)
 */
const { sql, getPool } = require('../config/db');

const VALID_TAX_TREATMENTS = new Set(['NoTax', 'WHTWithheld', 'PlusGST_PrepayRequired', 'PlusGST_DeferredPay']);
const VALID_VEHICLE_STATUS = new Set(['AtMaster', 'InTransit', 'AtDealer', 'Allocated', 'Delivered', 'Returned', 'Sold']);
const VALID_ALLOCATION_TYPES = new Set(['Booked', 'OpenAllocation']);

// ============================================================================
// MODELS
// ============================================================================

// GET /api/sales/models?activeOnly=1&search=
exports.listModels = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.activeOnly === '1') conds.push('IsActive = 1');
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(ModelCode LIKE @q OR ModelName LIKE @q OR BrandName LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT m.ModelID, m.ModelCode, m.ModelName, m.BrandName, m.IsActive,
                   m.CreatedAt, m.CreatedByName,
                   (SELECT COUNT(*) FROM dms_VehicleVariant WHERE ModelID=m.ModelID AND IsActive=1) AS ActiveVariantCount
            FROM dms_VehicleModel m
            ${where}
            ORDER BY m.IsActive DESC, m.ModelCode
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getModel = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT * FROM dms_VehicleModel WHERE ModelID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Model not found' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createModel = async (req, res) => {
    try {
        const { ModelCode, ModelName, BrandName } = req.body || {};
        if (!ModelCode?.trim() || !ModelName?.trim()) {
            return res.status(400).json({ error: 'ModelCode and ModelName are required.' });
        }
        const pool = await getPool();
        const r = await pool.request()
            .input('code', sql.NVarChar(20), ModelCode.trim())
            .input('name', sql.NVarChar(200), ModelName.trim())
            .input('brand', sql.NVarChar(100), BrandName?.trim() || 'Changan')
            .input('by', sql.Int, req.user?.employeeId || null)
            .input('byN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_VehicleModel (ModelCode, ModelName, BrandName, CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.ModelID, INSERTED.ModelCode, INSERTED.ModelName
                    VALUES (@code, @name, @brand, @by, @byN)`);
        res.status(201).json(r.recordset[0]);
    } catch (err) {
        if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'ModelCode already exists.' });
        console.error('createModel:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateModel = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const r = pool.request().input('id', sql.Int, id);
        const sets = ['UpdatedAt = GETDATE()', 'UpdatedByEmployeeID = @by', 'UpdatedByName = @byN'];
        r.input('by', sql.Int, req.user?.employeeId || null);
        r.input('byN', sql.NVarChar(100), req.user?.userName || null);
        if (b.ModelName !== undefined)  { r.input('name', sql.NVarChar(200), b.ModelName);   sets.push('ModelName=@name'); }
        if (b.BrandName !== undefined)  { r.input('brand', sql.NVarChar(100), b.BrandName); sets.push('BrandName=@brand'); }
        if (b.IsActive !== undefined)   { r.input('active', sql.Bit, b.IsActive ? 1 : 0);   sets.push('IsActive=@active'); }
        if (sets.length === 3) return res.status(400).json({ error: 'Nothing to update.' });
        const out = await r.query(`UPDATE dms_VehicleModel SET ${sets.join(', ')} OUTPUT INSERTED.ModelID WHERE ModelID=@id`);
        if (!out.recordset.length) return res.status(404).json({ error: 'Model not found' });
        res.json({ message: 'Updated', ModelID: id });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteModel = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        // Refuse if there are any variants
        const vu = await pool.request().input('id', sql.Int, id)
            .query(`SELECT COUNT(*) AS n FROM dms_VehicleVariant WHERE ModelID=@id`);
        if (vu.recordset[0].n > 0) {
            return res.status(409).json({ error: `Model has ${vu.recordset[0].n} variant(s). Deactivate the model instead.` });
        }
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_VehicleModel OUTPUT DELETED.ModelID WHERE ModelID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Model not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================================
// VARIANTS
// ============================================================================

exports.listVariants = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.modelId) { r.input('mid', sql.Int, parseInt(req.query.modelId)); conds.push('v.ModelID = @mid'); }
        if (req.query.activeOnly === '1') conds.push('v.IsActive = 1');
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(v.VariantCode LIKE @q OR v.VariantName LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT v.VariantID, v.ModelID, m.ModelCode, m.ModelName, m.BrandName,
                   v.VariantCode, v.VariantName,
                   v.StandardPrice, v.WholesalePrice, v.MinimumBookingAmount,
                   v.StandardIncentiveAmount, v.StandardIncentiveTaxTreatment,
                   v.IsActive, v.EffectivePriceFrom,
                   v.CreatedAt, v.CreatedByName,
                   (SELECT COUNT(*) FROM dms_Vehicle WHERE VariantID=v.VariantID) AS VehicleCount
            FROM dms_VehicleVariant v
            JOIN dms_VehicleModel m ON v.ModelID = m.ModelID
            ${where}
            ORDER BY m.ModelCode, v.VariantCode
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getVariant = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT v.*, m.ModelCode, m.ModelName, m.BrandName
                    FROM dms_VehicleVariant v JOIN dms_VehicleModel m ON v.ModelID=m.ModelID
                    WHERE v.VariantID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Variant not found' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createVariant = async (req, res) => {
    try {
        const b = req.body || {};
        const errors = [];
        if (!b.ModelID)                                errors.push('ModelID is required');
        if (!b.VariantCode?.trim())                    errors.push('VariantCode is required');
        if (!b.VariantName?.trim())                    errors.push('VariantName is required');
        if (b.StandardPrice == null || b.StandardPrice < 0) errors.push('StandardPrice must be ≥ 0');
        if (b.WholesalePrice == null || b.WholesalePrice < 0) errors.push('WholesalePrice must be ≥ 0');
        if (b.StandardIncentiveTaxTreatment && !VALID_TAX_TREATMENTS.has(b.StandardIncentiveTaxTreatment)) {
            errors.push('Invalid StandardIncentiveTaxTreatment');
        }
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const pool = await getPool();
        const r = await pool.request()
            .input('mid', sql.Int, parseInt(b.ModelID))
            .input('code', sql.NVarChar(50), b.VariantCode.trim())
            .input('name', sql.NVarChar(300), b.VariantName.trim())
            .input('sp', sql.Decimal(18, 2), b.StandardPrice)
            .input('wp', sql.Decimal(18, 2), b.WholesalePrice)
            .input('mb', sql.Decimal(18, 2), b.MinimumBookingAmount || 0)
            .input('si', sql.Decimal(18, 2), b.StandardIncentiveAmount || 0)
            .input('tt', sql.NVarChar(30), b.StandardIncentiveTaxTreatment || 'NoTax')
            .input('specs', sql.NVarChar(sql.MAX), b.SpecsJSON ? JSON.stringify(b.SpecsJSON) : null)
            .input('by', sql.Int, req.user?.employeeId || null)
            .input('byN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_VehicleVariant
                        (ModelID, VariantCode, VariantName, StandardPrice, WholesalePrice,
                         MinimumBookingAmount,
                         StandardIncentiveAmount, StandardIncentiveTaxTreatment, SpecsJSON,
                         CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.VariantID
                    VALUES (@mid, @code, @name, @sp, @wp, @mb, @si, @tt, @specs, @by, @byN)`);
        res.status(201).json({ message: 'Variant created', VariantID: r.recordset[0].VariantID });
    } catch (err) {
        if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'VariantCode already exists.' });
        if (err.number === 547) return res.status(400).json({ error: 'ModelID does not exist.' });
        console.error('createVariant:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateVariant = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const r = pool.request().input('id', sql.Int, id);
        const sets = ['UpdatedAt = GETDATE()', 'UpdatedByEmployeeID=@by', 'UpdatedByName=@byN'];
        r.input('by', sql.Int, req.user?.employeeId || null);
        r.input('byN', sql.NVarChar(100), req.user?.userName || null);
        if (b.VariantName !== undefined)     { r.input('name', sql.NVarChar(300), b.VariantName); sets.push('VariantName=@name'); }
        if (b.StandardPrice !== undefined)   { r.input('sp', sql.Decimal(18, 2), b.StandardPrice); sets.push('StandardPrice=@sp'); }
        if (b.WholesalePrice !== undefined)  { r.input('wp', sql.Decimal(18, 2), b.WholesalePrice); sets.push('WholesalePrice=@wp'); }
        if (b.StandardIncentiveAmount !== undefined) { r.input('si', sql.Decimal(18, 2), b.StandardIncentiveAmount); sets.push('StandardIncentiveAmount=@si'); }
        if (b.MinimumBookingAmount !== undefined) { r.input('mb', sql.Decimal(18, 2), b.MinimumBookingAmount); sets.push('MinimumBookingAmount=@mb'); }
        if (b.StandardIncentiveTaxTreatment !== undefined) {
            if (!VALID_TAX_TREATMENTS.has(b.StandardIncentiveTaxTreatment)) return res.status(400).json({ error: 'Invalid tax treatment' });
            r.input('tt', sql.NVarChar(30), b.StandardIncentiveTaxTreatment); sets.push('StandardIncentiveTaxTreatment=@tt');
        }
        if (b.SpecsJSON !== undefined)       { r.input('specs', sql.NVarChar(sql.MAX), b.SpecsJSON ? JSON.stringify(b.SpecsJSON) : null); sets.push('SpecsJSON=@specs'); }
        if (b.IsActive !== undefined)        { r.input('active', sql.Bit, b.IsActive ? 1 : 0); sets.push('IsActive=@active'); }
        if (sets.length === 3) return res.status(400).json({ error: 'Nothing to update.' });
        const out = await r.query(`UPDATE dms_VehicleVariant SET ${sets.join(', ')} OUTPUT INSERTED.VariantID WHERE VariantID=@id`);
        if (!out.recordset.length) return res.status(404).json({ error: 'Variant not found' });
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteVariant = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const u = await pool.request().input('id', sql.Int, id)
            .query(`SELECT COUNT(*) AS n FROM dms_Vehicle WHERE VariantID=@id`);
        if (u.recordset[0].n > 0) return res.status(409).json({ error: `Variant has ${u.recordset[0].n} vehicle(s). Deactivate instead.` });
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_VehicleVariant OUTPUT DELETED.VariantID WHERE VariantID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Variant not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================================
// VEHICLES (per-VIN)
// ============================================================================

exports.listVehicles = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.variantId) { r.input('vid', sql.Int, parseInt(req.query.variantId)); conds.push('v.VariantID=@vid'); }
        if (req.query.status)    { r.input('s', sql.NVarChar(20), req.query.status); conds.push('v.Status=@s'); }
        if (req.query.allocationType) { r.input('at', sql.NVarChar(20), req.query.allocationType); conds.push('v.AllocationType=@at'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(100), `%${req.query.search}%`);
            conds.push('(v.ChasisNo LIKE @q OR v.EngineNo LIKE @q OR v.Color LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT v.VehicleID, v.VariantID, var.VariantCode, var.VariantName,
                   var.ModelID, m.ModelCode, m.ModelName, m.BrandName,
                   v.ChasisNo, v.EngineNo, v.Color, v.ManufactureYear,
                   v.AllocationType, v.Status, v.Location,
                   v.CurrentBookingID, b.BookingNo AS CurrentBookingNo,
                   v.MasterInvoiceVoucherID,
                   v.ReceivedAt, v.SoldDeliveredAt,
                   v.CreatedAt
            FROM dms_Vehicle v
            JOIN dms_VehicleVariant var ON v.VariantID = var.VariantID
            JOIN dms_VehicleModel m     ON var.ModelID = m.ModelID
            LEFT JOIN dms_SalesBookings b ON v.CurrentBookingID = b.BookingID
            ${where}
            ORDER BY v.Status, v.CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getVehicle = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT v.*, var.VariantCode, var.VariantName, var.StandardPrice, var.WholesalePrice,
                           m.ModelCode, m.ModelName, m.BrandName,
                           b.BookingNo AS CurrentBookingNo
                    FROM dms_Vehicle v
                    JOIN dms_VehicleVariant var ON v.VariantID = var.VariantID
                    JOIN dms_VehicleModel m ON var.ModelID = m.ModelID
                    LEFT JOIN dms_SalesBookings b ON v.CurrentBookingID = b.BookingID
                    WHERE v.VehicleID = @id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Vehicle not found' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createVehicle = async (req, res) => {
    try {
        const b = req.body || {};
        const errors = [];
        if (!b.VariantID)            errors.push('VariantID is required');
        if (!b.ChasisNo?.trim())     errors.push('ChasisNo is required');
        if (!b.EngineNo?.trim())     errors.push('EngineNo is required');
        if (b.AllocationType && !VALID_ALLOCATION_TYPES.has(b.AllocationType)) errors.push('Invalid AllocationType');
        if (b.Status && !VALID_VEHICLE_STATUS.has(b.Status)) errors.push('Invalid Status');
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const pool = await getPool();
        const r = await pool.request()
            .input('vid', sql.Int, parseInt(b.VariantID))
            .input('cn', sql.NVarChar(50), b.ChasisNo.trim())
            .input('en', sql.NVarChar(50), b.EngineNo.trim())
            .input('col', sql.NVarChar(50), b.Color || null)
            .input('yr', sql.Int, b.ManufactureYear || null)
            .input('at', sql.NVarChar(20), b.AllocationType || 'Booked')
            .input('st', sql.NVarChar(20), b.Status || 'AtMaster')
            .input('loc', sql.NVarChar(100), b.Location || null)
            .input('by', sql.Int, req.user?.employeeId || null)
            .input('byN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_Vehicle (VariantID, ChasisNo, EngineNo, Color, ManufactureYear,
                                              AllocationType, Status, Location, CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.VehicleID
                    VALUES (@vid, @cn, @en, @col, @yr, @at, @st, @loc, @by, @byN)`);

        const vehicleId = r.recordset[0].VehicleID;

        // If open allocation, auto-create the memo ledger row
        if ((b.AllocationType || 'Booked') === 'OpenAllocation') {
            await pool.request()
                .input('vid', sql.Int, vehicleId)
                .input('by', sql.Int, req.user?.employeeId || null)
                .input('byN', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_OpenAllocationLedger (VehicleID, AllocatedToUsAt, CreatedByEmployeeID, CreatedByName)
                        VALUES (@vid, GETDATE(), @by, @byN)`);
        }

        res.status(201).json({ message: 'Vehicle created', VehicleID: vehicleId });
    } catch (err) {
        if (err.number === 2627 || err.number === 2601) {
            const which = /Chasis/i.test(err.message) ? 'ChasisNo' : 'EngineNo';
            return res.status(409).json({ error: `${which} already exists.` });
        }
        if (err.number === 547) return res.status(400).json({ error: 'VariantID does not exist.' });
        console.error('createVehicle:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateVehicle = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const r = pool.request().input('id', sql.Int, id);
        const sets = ['UpdatedAt = GETDATE()', 'UpdatedByEmployeeID=@by', 'UpdatedByName=@byN'];
        r.input('by', sql.Int, req.user?.employeeId || null);
        r.input('byN', sql.NVarChar(100), req.user?.userName || null);
        if (b.Color !== undefined)        { r.input('col', sql.NVarChar(50), b.Color);              sets.push('Color=@col'); }
        if (b.ManufactureYear !== undefined) { r.input('yr', sql.Int, b.ManufactureYear || null);   sets.push('ManufactureYear=@yr'); }
        if (b.Status !== undefined) {
            if (!VALID_VEHICLE_STATUS.has(b.Status)) return res.status(400).json({ error: 'Invalid Status' });
            r.input('st', sql.NVarChar(20), b.Status); sets.push('Status=@st');
            if (b.Status === 'AtDealer')  sets.push('ReceivedAt = COALESCE(ReceivedAt, GETDATE())');
        }
        if (b.Location !== undefined)     { r.input('loc', sql.NVarChar(100), b.Location);          sets.push('Location=@loc'); }
        if (sets.length === 3) return res.status(400).json({ error: 'Nothing to update.' });
        const out = await r.query(`UPDATE dms_Vehicle SET ${sets.join(', ')} OUTPUT INSERTED.VehicleID WHERE VehicleID=@id`);
        if (!out.recordset.length) return res.status(404).json({ error: 'Vehicle not found' });
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteVehicle = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        // Refuse if vehicle is allocated/delivered/sold (anything past Booking)
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status, CurrentBookingID FROM dms_Vehicle WHERE VehicleID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Vehicle not found' });
        const v = cur.recordset[0];
        if (['Allocated', 'Delivered', 'Sold'].includes(v.Status) || v.CurrentBookingID) {
            return res.status(409).json({ error: `Vehicle is ${v.Status} (linked to booking). Cannot delete.` });
        }
        await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_OpenAllocationLedger WHERE VehicleID=@id;
                    DELETE FROM dms_Vehicle WHERE VehicleID=@id`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
