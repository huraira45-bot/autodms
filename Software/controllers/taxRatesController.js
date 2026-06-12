const { sql, getPool } = require('../config/db');

const VALID_TYPES = ['GST', 'PST'];

// Internal helper — resolves the applicable rate for a date.
// Used by posting flows (Job Card finalize, GRN finalize, Store Sale finalize)
// to snapshot the rate onto each line at save time.
// Returns the Rate (decimal) or throws if not configured for that date.
exports.resolveRate = async (taxType, asOfDate = null) => {
    if (!VALID_TYPES.includes(taxType)) {
        throw new Error(`Invalid tax type '${taxType}'.`);
    }
    const pool = await getPool();
    const req = pool.request().input('tt', sql.NVarChar(10), taxType);
    let query;
    if (asOfDate) {
        req.input('asOf', sql.Date, asOfDate);
        query = `SELECT TOP 1 Rate FROM dms_TaxRates
                 WHERE TaxType=@tt
                   AND EffectiveFrom <= @asOf
                   AND (EffectiveTo IS NULL OR EffectiveTo > @asOf)
                 ORDER BY EffectiveFrom DESC`;
    } else {
        query = `SELECT TOP 1 Rate FROM dms_TaxRates
                 WHERE TaxType=@tt
                   AND EffectiveFrom <= CAST(GETDATE() AS DATE)
                   AND (EffectiveTo IS NULL OR EffectiveTo > CAST(GETDATE() AS DATE))
                 ORDER BY EffectiveFrom DESC`;
    }
    const r = await req.query(query);
    if (!r.recordset.length) {
        const err = new Error(`No ${taxType} rate configured for the given date.`);
        err.code = 'TAX_RATE_NOT_CONFIGURED';
        throw err;
    }
    return parseFloat(r.recordset[0].Rate);
};

// GET /api/tax-rates  — current rates for all tax types
exports.getCurrent = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT TaxType, Rate, EffectiveFrom, EffectiveTo, ChangedBy, ChangedByName, ChangedAt
            FROM dms_TaxRates
            WHERE EffectiveFrom <= CAST(GETDATE() AS DATE)
              AND (EffectiveTo IS NULL OR EffectiveTo > CAST(GETDATE() AS DATE))
            ORDER BY TaxType`);
        // Also include any future-scheduled rates so UI can show "GST changes to 18% on 2026-06-01"
        const future = await pool.request().query(`
            SELECT TaxType, Rate, EffectiveFrom, EffectiveTo, ChangedBy, ChangedByName, ChangedAt
            FROM dms_TaxRates
            WHERE EffectiveFrom > CAST(GETDATE() AS DATE)
              AND (EffectiveTo IS NULL)
            ORDER BY TaxType, EffectiveFrom`);
        res.json({ current: result.recordset, scheduled: future.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/tax-rates/:taxType/history
exports.getHistory = async (req, res) => {
    try {
        const tt = req.params.taxType;
        if (!VALID_TYPES.includes(tt)) return res.status(400).json({ error: 'Invalid tax type.' });
        const pool = await getPool();
        const r = await pool.request()
            .input('tt', sql.NVarChar(10), tt)
            .query(`SELECT TaxRateID, TaxType, Rate, EffectiveFrom, EffectiveTo,
                           ChangedBy, ChangedByName, ChangedAt
                    FROM dms_TaxRates
                    WHERE TaxType=@tt
                    ORDER BY EffectiveFrom DESC`);
        res.json(r.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/tax-rates/:taxType   body: { Rate, EffectiveFrom?, Reason? }
// Atomic: close current rate (set EffectiveTo = new EffectiveFrom) + insert new row.
exports.changeRate = async (req, res) => {
    const tt = req.params.taxType;
    if (!VALID_TYPES.includes(tt)) return res.status(400).json({ error: 'Invalid tax type.' });

    const newRate = parseFloat(req.body.Rate);
    if (isNaN(newRate) || newRate < 0 || newRate > 100) {
        return res.status(400).json({ error: 'Rate must be between 0 and 100.' });
    }
    // Default effective date = today; admin can pass a future date
    const effectiveFrom = req.body.EffectiveFrom
        ? new Date(req.body.EffectiveFrom)
        : new Date(new Date().toISOString().slice(0, 10));
    const reason = req.body.Reason || null;

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        // Find the rate currently in effect on or before EffectiveFrom
        const cur = await new sql.Request(transaction)
            .input('tt', sql.NVarChar(10), tt)
            .input('ef', sql.Date, effectiveFrom)
            .query(`SELECT TOP 1 TaxRateID, Rate FROM dms_TaxRates
                    WHERE TaxType=@tt AND EffectiveFrom <= @ef AND EffectiveTo IS NULL
                    ORDER BY EffectiveFrom DESC`);

        if (cur.recordset.length && parseFloat(cur.recordset[0].Rate) === newRate) {
            await transaction.rollback();
            return res.status(400).json({ error: `${tt} is already ${newRate}%. No change to apply.` });
        }

        // Close any rate that's currently open (EffectiveTo IS NULL) — set its EffectiveTo = our EffectiveFrom
        if (cur.recordset.length) {
            await new sql.Request(transaction)
                .input('id', sql.Int, cur.recordset[0].TaxRateID)
                .input('ef', sql.Date, effectiveFrom)
                .query(`UPDATE dms_TaxRates SET EffectiveTo=@ef WHERE TaxRateID=@id`);
        }

        // Insert the new rate
        const ins = await new sql.Request(transaction)
            .input('tt', sql.NVarChar(10), tt)
            .input('rate', sql.Decimal(8, 4), newRate)
            .input('ef', sql.Date, effectiveFrom)
            .input('by', sql.Int, req.user?.userId || null)
            .input('byName', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_TaxRates (TaxType, Rate, EffectiveFrom, EffectiveTo, ChangedBy, ChangedByName)
                    OUTPUT INSERTED.TaxRateID
                    VALUES (@tt, @rate, @ef, NULL, @by, @byName)`);

        await transaction.commit();
        res.json({
            message: `${tt} rate changed to ${newRate}% effective ${effectiveFrom.toISOString().slice(0, 10)}.`,
            taxType: tt,
            newRate,
            effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
            taxRateId: ins.recordset[0].TaxRateID,
            reason
        });
    } catch (err) {
        try { await transaction.rollback(); } catch {}
        res.status(400).json({ error: err.message });
    }
};
