/**
 * Paint Lab — master-data controller (Phase 0).
 *
 * Covers: UOM, Category, Brand, Warehouse, Paint Item master, Paint
 * Settings (allowed JC business types + system-account resolution helpers).
 *
 * GRN, GRTN, Issue endpoints ship in subsequent phases in their own files
 * (paintGRNController.js etc.). Everything here is master-data only —
 * no stock movement, no GL posting.
 *
 * Owner ask 2026-07-04.
 */
const { sql, getPool } = require('../config/db');

// Small helper — every list/read/write handler follows the same shape.
async function q(handler) {
    const pool = await getPool();
    return handler(pool);
}

// ────────────────────────────────────────────────────────────────
// Paint UOM
// ────────────────────────────────────────────────────────────────
exports.uomList = async (_req, res) => {
    try {
        const r = await q(p => p.request().query('SELECT PaintUOMID, UOMName, Scale, IsActive FROM paint_UOM WHERE IsActive=1 ORDER BY UOMName'));
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.uomCreate = async (req, res) => {
    try {
        const { UOMName, Scale } = req.body || {};
        if (!UOMName) return res.status(400).json({ error: 'UOMName required' });
        const r = await q(p => p.request()
            .input('n', sql.NVarChar(50), UOMName)
            .input('s', sql.Decimal(18,4), Number(Scale) || 1)
            .query('INSERT INTO paint_UOM (UOMName, Scale) OUTPUT INSERTED.PaintUOMID VALUES (@n, @s)'));
        res.status(201).json({ PaintUOMID: r.recordset[0].PaintUOMID });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.uomDelete = async (req, res) => {
    try {
        // Soft-delete — a UOM referenced by paint_Item / paint_GRNDetail /
        // paint_IssueDetail must remain resolvable in history.
        await q(p => p.request().input('id', sql.Int, req.params.id)
            .query('UPDATE paint_UOM SET IsActive=0 WHERE PaintUOMID=@id'));
        res.json({ message: 'UOM archived' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Paint Categories
// ────────────────────────────────────────────────────────────────
exports.categoryList = async (_req, res) => {
    try {
        const r = await q(p => p.request().query('SELECT PaintCategoryID, CategoryName, Description, IsActive FROM paint_Category WHERE IsActive=1 ORDER BY CategoryName'));
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.categoryCreate = async (req, res) => {
    try {
        const { CategoryName, Description } = req.body || {};
        if (!CategoryName) return res.status(400).json({ error: 'CategoryName required' });
        const r = await q(p => p.request()
            .input('n', sql.NVarChar(100), CategoryName)
            .input('d', sql.NVarChar(500), Description || null)
            .query('INSERT INTO paint_Category (CategoryName, Description) OUTPUT INSERTED.PaintCategoryID VALUES (@n, @d)'));
        res.status(201).json({ PaintCategoryID: r.recordset[0].PaintCategoryID });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.categoryDelete = async (req, res) => {
    try {
        await q(p => p.request().input('id', sql.Int, req.params.id)
            .query('UPDATE paint_Category SET IsActive=0 WHERE PaintCategoryID=@id'));
        res.json({ message: 'Category archived' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Paint Brands
// ────────────────────────────────────────────────────────────────
exports.brandList = async (_req, res) => {
    try {
        const r = await q(p => p.request().query('SELECT PaintBrandID, BrandName, IsActive FROM paint_Brand WHERE IsActive=1 ORDER BY BrandName'));
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.brandCreate = async (req, res) => {
    try {
        const { BrandName } = req.body || {};
        if (!BrandName) return res.status(400).json({ error: 'BrandName required' });
        const r = await q(p => p.request()
            .input('n', sql.NVarChar(100), BrandName)
            .query('INSERT INTO paint_Brand (BrandName) OUTPUT INSERTED.PaintBrandID VALUES (@n)'));
        res.status(201).json({ PaintBrandID: r.recordset[0].PaintBrandID });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.brandDelete = async (req, res) => {
    try {
        await q(p => p.request().input('id', sql.Int, req.params.id)
            .query('UPDATE paint_Brand SET IsActive=0 WHERE PaintBrandID=@id'));
        res.json({ message: 'Brand archived' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Paint Warehouses
// ────────────────────────────────────────────────────────────────
exports.warehouseList = async (_req, res) => {
    try {
        const r = await q(p => p.request().query('SELECT PaintWHID, WHCode, WHDesc, LocationAddress FROM paint_Warehouse WHERE ISNULL(InActive,0)=0 ORDER BY WHDesc'));
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.warehouseCreate = async (req, res) => {
    try {
        const { WHCode, WHDesc, LocationAddress } = req.body || {};
        if (!WHDesc) return res.status(400).json({ error: 'WHDesc required' });
        const r = await q(p => p.request()
            .input('c', sql.NVarChar(50),  WHCode || null)
            .input('d', sql.NVarChar(200), WHDesc)
            .input('a', sql.NVarChar(500), LocationAddress || null)
            .query('INSERT INTO paint_Warehouse (WHCode, WHDesc, LocationAddress) OUTPUT INSERTED.PaintWHID VALUES (@c, @d, @a)'));
        res.status(201).json({ PaintWHID: r.recordset[0].PaintWHID });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.warehouseDelete = async (req, res) => {
    try {
        await q(p => p.request().input('id', sql.Int, req.params.id)
            .query('UPDATE paint_Warehouse SET InActive=1 WHERE PaintWHID=@id'));
        res.json({ message: 'Warehouse archived' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Paint Items
// ────────────────────────────────────────────────────────────────
exports.itemList = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['pi.IsActive=1'];
        if (req.query.search) {
            rq.input('s', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(pi.PaintCode LIKE @s OR pi.PaintName LIKE @s)');
        }
        if (req.query.categoryId) {
            rq.input('c', sql.Int, parseInt(req.query.categoryId));
            conds.push('pi.PaintCategoryID = @c');
        }
        if (req.query.brandId) {
            rq.input('b', sql.Int, parseInt(req.query.brandId));
            conds.push('pi.PaintBrandID = @b');
        }
        const r = await rq.query(`
            SELECT pi.PaintItemID, pi.PaintCode, pi.PaintName,
                   pi.PaintCategoryID, cat.CategoryName,
                   pi.PaintBrandID,    br.BrandName,
                   pi.PaintUOMID,      u.UOMName,
                   pi.ReorderLevel, pi.GSTDefaultOn, pi.IsActive,
                   pi.StockQty, pi.AvgCost, pi.StockValue,
                   pi.CreatedAt, pi.UpdatedAt
            FROM paint_Item pi
            LEFT JOIN paint_Category cat ON pi.PaintCategoryID = cat.PaintCategoryID
            LEFT JOIN paint_Brand    br  ON pi.PaintBrandID    = br.PaintBrandID
            LEFT JOIN paint_UOM      u   ON pi.PaintUOMID      = u.PaintUOMID
            WHERE ${conds.join(' AND ')}
            ORDER BY pi.PaintName
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.itemCreate = async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.PaintCode) return res.status(400).json({ error: 'PaintCode required' });
        if (!b.PaintName) return res.status(400).json({ error: 'PaintName required' });
        const pool = await getPool();
        const r = await pool.request()
            .input('cd', sql.NVarChar(50),  b.PaintCode)
            .input('nm', sql.NVarChar(200), b.PaintName)
            .input('ci', sql.Int, b.PaintCategoryID || null)
            .input('bi', sql.Int, b.PaintBrandID    || null)
            .input('ui', sql.Int, b.PaintUOMID      || null)
            .input('rl', sql.Decimal(18,3), b.ReorderLevel != null && b.ReorderLevel !== '' ? Number(b.ReorderLevel) : null)
            .input('gst', sql.Bit, b.GSTDefaultOn === false ? 0 : 1)
            .query(`INSERT INTO paint_Item
                        (PaintCode, PaintName, PaintCategoryID, PaintBrandID, PaintUOMID, ReorderLevel, GSTDefaultOn)
                    OUTPUT INSERTED.PaintItemID
                    VALUES (@cd, @nm, @ci, @bi, @ui, @rl, @gst)`);
        res.status(201).json({ PaintItemID: r.recordset[0].PaintItemID });
    } catch (err) {
        if (err.number === 2601 || err.number === 2627) return res.status(409).json({ error: 'Paint code already exists.' });
        res.status(400).json({ error: err.message });
    }
};

exports.itemUpdate = async (req, res) => {
    try {
        const b = req.body || {};
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .input('nm', sql.NVarChar(200), b.PaintName)
            .input('ci', sql.Int, b.PaintCategoryID || null)
            .input('bi', sql.Int, b.PaintBrandID    || null)
            .input('ui', sql.Int, b.PaintUOMID      || null)
            .input('rl', sql.Decimal(18,3), b.ReorderLevel != null && b.ReorderLevel !== '' ? Number(b.ReorderLevel) : null)
            .input('gst', sql.Bit, b.GSTDefaultOn === false ? 0 : 1)
            .input('act', sql.Bit, b.IsActive === false ? 0 : 1)
            .query(`UPDATE paint_Item SET
                        PaintName        = COALESCE(@nm, PaintName),
                        PaintCategoryID  = @ci,
                        PaintBrandID     = @bi,
                        PaintUOMID       = @ui,
                        ReorderLevel     = @rl,
                        GSTDefaultOn     = @gst,
                        IsActive         = @act,
                        UpdatedAt        = GETDATE()
                    WHERE PaintItemID = @id`);
        res.json({ message: 'Paint item updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Paint Item — Alternate UoMs with factor to base (owner ask 2026-07-07)
// The item's PaintUOMID is the *base* accounting unit; paint_ItemUOM
// lists every UoM the operator can select on GRN / Issue lines together
// with a factor:  base_qty = line_qty * FactorToBase.
// ────────────────────────────────────────────────────────────────
// Bulk read — every item + every allowed UoM, used by GRN/Issue line
// pickers so each row can offer only the UoMs configured on its item.
exports.itemUomAll = async (_req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT iu.PaintItemID, iu.PaintUOMID, iu.FactorToBase, u.UOMName,
                   CASE WHEN iu.PaintUOMID = i.PaintUOMID THEN 1 ELSE 0 END AS IsBase
            FROM   paint_ItemUOM iu
            JOIN   paint_UOM  u ON iu.PaintUOMID = u.PaintUOMID
            JOIN   paint_Item i ON iu.PaintItemID = i.PaintItemID
            WHERE  i.IsActive = 1
            ORDER  BY iu.PaintItemID, IsBase DESC, u.UOMName
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.itemUomList = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT iu.PaintUOMID, iu.FactorToBase, u.UOMName,
                           CASE WHEN iu.PaintUOMID = i.PaintUOMID THEN 1 ELSE 0 END AS IsBase
                    FROM   paint_ItemUOM iu
                    JOIN   paint_UOM u ON iu.PaintUOMID = u.PaintUOMID
                    JOIN   paint_Item i ON iu.PaintItemID = i.PaintItemID
                    WHERE  iu.PaintItemID = @id
                    ORDER  BY IsBase DESC, u.UOMName`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// PUT — replace the full alt-UoM list. Base UoM is always re-seeded with
// factor 1 regardless of what the client sends, so an operator can never
// lock themselves out of the item's own unit.
exports.itemUomReplace = async (req, res) => {
    const itemId = parseInt(req.params.id);
    const incoming = Array.isArray(req.body?.uoms) ? req.body.uoms : [];
    for (const [i, row] of incoming.entries()) {
        if (!row || !row.PaintUOMID) return res.status(400).json({ error: `Row ${i + 1}: PaintUOMID is required.` });
        const f = Number(row.FactorToBase);
        if (!(f > 0)) return res.status(400).json({ error: `Row ${i + 1}: FactorToBase must be > 0.` });
    }
    try {
        const pool = await getPool();
        const baseRes = await pool.request().input('id', sql.Int, itemId)
            .query('SELECT PaintUOMID FROM paint_Item WHERE PaintItemID = @id');
        if (!baseRes.recordset.length) return res.status(404).json({ error: 'Paint item not found.' });
        const baseUomId = baseRes.recordset[0].PaintUOMID;
        if (!baseUomId) return res.status(400).json({ error: 'This paint item has no base UoM assigned. Set it on the item master first.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx).input('id', sql.Int, itemId)
                .query('DELETE FROM paint_ItemUOM WHERE PaintItemID = @id');
            await new sql.Request(tx)
                .input('i', sql.Int, itemId).input('u', sql.Int, baseUomId).input('f', sql.Decimal(18,6), 1)
                .query('INSERT INTO paint_ItemUOM (PaintItemID, PaintUOMID, FactorToBase) VALUES (@i, @u, @f)');
            const seen = new Set([baseUomId]);
            for (const row of incoming) {
                const uid = parseInt(row.PaintUOMID);
                if (seen.has(uid)) continue;
                seen.add(uid);
                await new sql.Request(tx)
                    .input('i', sql.Int, itemId)
                    .input('u', sql.Int, uid)
                    .input('f', sql.Decimal(18,6), Number(row.FactorToBase))
                    .query('INSERT INTO paint_ItemUOM (PaintItemID, PaintUOMID, FactorToBase) VALUES (@i, @u, @f)');
            }
            await tx.commit();
            res.json({ message: 'Alternate UoMs updated', count: seen.size });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Shared helper — GRN + Issue call this to convert a line's quantity from
// its chosen UoM into the item's base UoM. Errors clearly if the operator
// picked a UoM that isn't configured on that item.
async function resolveBaseQty(tx, paintItemID, paintUomID, qty) {
    const r = await new sql.Request(tx)
        .input('i', sql.Int, paintItemID)
        .input('u', sql.Int, paintUomID)
        .query('SELECT FactorToBase FROM paint_ItemUOM WHERE PaintItemID=@i AND PaintUOMID=@u');
    if (!r.recordset.length) {
        const n = await new sql.Request(tx)
            .input('i', sql.Int, paintItemID).input('u', sql.Int, paintUomID)
            .query(`SELECT (SELECT PaintCode FROM paint_Item WHERE PaintItemID=@i) AS PaintCode,
                           (SELECT PaintName FROM paint_Item WHERE PaintItemID=@i) AS PaintName,
                           (SELECT UOMName  FROM paint_UOM   WHERE PaintUOMID=@u)  AS UOMName`);
        const row = n.recordset[0] || {};
        throw new Error(
            `Paint item "${row.PaintCode || paintItemID} ${row.PaintName || ''}" ` +
            `is not configured to use UoM "${row.UOMName || paintUomID}". ` +
            `Add it under Alternate Units on the item master (with a conversion factor to the base UoM).`
        );
    }
    const factor = Number(r.recordset[0].FactorToBase);
    return {
        factor,
        baseQty: Math.round((Number(qty) || 0) * factor * 10000) / 10000,
    };
}
exports._resolveBaseQty = resolveBaseQty;

// ────────────────────────────────────────────────────────────────
// Paint Settings — allowed Job Card business types for Paint Issue
// ────────────────────────────────────────────────────────────────
exports.allowedBusinessTypesList = async (_req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT abt.PaintABTID, abt.JobCardTypeId, t.CardCode, t.Title
            FROM paint_AllowedBusinessType abt
            INNER JOIN gen_JobCardType t ON abt.JobCardTypeId = t.JobCardTypeId
            ORDER BY t.Title
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.allowedBusinessTypesReplace = async (req, res) => {
    try {
        // Body: { JobCardTypeIds: [1, 5, 7] } — full replace, empty array clears.
        const ids = Array.isArray(req.body?.JobCardTypeIds) ? req.body.JobCardTypeIds : [];
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx).query('DELETE FROM paint_AllowedBusinessType');
            for (const id of ids) {
                await new sql.Request(tx)
                    .input('t', sql.Int, parseInt(id))
                    .query('INSERT INTO paint_AllowedBusinessType (JobCardTypeId) VALUES (@t)');
            }
            await tx.commit();
            res.json({ message: 'Allowed business types updated', count: ids.length });
        } catch (e) { await tx.rollback(); throw e; }
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Setup preview — every mapping the accountant needs before GRN/Issue
// can post. Read-only diagnostic used by Paint Settings.
// ────────────────────────────────────────────────────────────────
exports.setupStatus = async (_req, res) => {
    try {
        const pool = await getPool();
        const [sa, abt] = await Promise.all([
            pool.request().query(`
                SELECT sa.RoleKey, sa.GLCAID, coa.GLCode, coa.GLTitle
                FROM dms_SystemAccounts sa
                LEFT JOIN GLChartOFAccount coa ON sa.GLCAID = coa.GLCAID
                WHERE sa.RoleKey IN ('PAINT_INVENTORY','PAINT_CONSUMPTION')
            `),
            pool.request().query(`
                SELECT abt.PaintABTID, abt.JobCardTypeId, t.CardCode, t.Title
                FROM paint_AllowedBusinessType abt
                INNER JOIN gen_JobCardType t ON abt.JobCardTypeId = t.JobCardTypeId
                ORDER BY t.Title
            `),
        ]);
        res.json({
            systemAccounts: sa.recordset,
            allowedBusinessTypes: abt.recordset,
            ready: sa.recordset.length === 2, // both roles mapped
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
