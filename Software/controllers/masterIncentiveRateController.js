const { sql, getPool } = require('../config/db');
const { createRate, endRate } = require('../services/masterIncentiveRateService');
exports.options = async (req, res) => {
    try { res.json((await (await getPool()).request().query('SELECT VariantID,VariantCode,VariantName FROM dms_VehicleVariant ORDER BY VariantName')).recordset); }
    catch (error) { res.status(500).json({ error: error.message }); }
};
exports.list = async (req, res) => {
    try {
        const pool = await getPool(), r = pool.request(); let where = '';
        if (req.query.variantId) {
            const id = Number(req.query.variantId);
            if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return res.status(400).json({ error: 'Invalid variant.' });
            r.input('variant', sql.Int, id); where = 'WHERE r.VariantID=@variant';
        }
        const rows = (await r.query(`SELECT r.*,v.VariantCode,v.VariantName,m.ModelName,
                CASE WHEN CAST(GETDATE() AS DATE)<r.EffectiveFrom THEN 'Scheduled'
                     WHEN CAST(GETDATE() AS DATE)>r.EffectiveTo THEN 'Previous' ELSE 'Current' END AS PeriodStatus
                FROM dms_MasterIncentiveRates r JOIN dms_VehicleVariant v ON v.VariantID=r.VariantID
                JOIN dms_VehicleModel m ON m.ModelID=v.ModelID ${where}
                ORDER BY v.VariantName,r.EffectiveFrom DESC,r.RateID DESC`)).recordset;
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
};
exports.create = async (req, res) => {
    let tx;
    try {
        tx = new sql.Transaction(await getPool()); await tx.begin();
        const saved = await createRate(tx, req.body || {}, req.user);
        await tx.commit(); res.status(201).json(saved);
    } catch (error) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(error.status || 500).json({ error: error.message });
    }
};
exports.end = async (req, res) => {
    let tx;
    try { tx = new sql.Transaction(await getPool()); await tx.begin();
        const result = await endRate(tx, Number(req.params.id), req.body || {}, req.user);
        await tx.commit(); res.json(result);
    } catch (error) { if (tx) { try { await tx.rollback(); } catch (_) {} } res.status(error.status || 500).json({ error: error.message }); }
};
