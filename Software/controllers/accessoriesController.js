const { sql, getPool } = require('../config/db');

exports.getMaster = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM dms_AccessoriesMaster WHERE IsActive=1 ORDER BY SortOrder, Title');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllMaster = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM dms_AccessoriesMaster ORDER BY SortOrder, Title');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveMaster = async (req, res) => {
    try {
        const { AccessoryID, Title, IsActive, SortOrder } = req.body;
        if (!Title?.trim()) return res.status(400).json({ error: 'Title is required.' });
        const pool = await getPool();
        if (AccessoryID) {
            await pool.request()
                .input('id', sql.Int, AccessoryID)
                .input('title', sql.NVarChar(100), Title.trim())
                .input('active', sql.Bit, IsActive ? 1 : 0)
                .input('sort', sql.Int, SortOrder || 0)
                .query('UPDATE dms_AccessoriesMaster SET Title=@title, IsActive=@active, SortOrder=@sort WHERE AccessoryID=@id');
            res.json({ message: 'Accessory updated' });
        } else {
            const r = await pool.request()
                .input('title', sql.NVarChar(100), Title.trim())
                .input('sort', sql.Int, SortOrder || 0)
                .query('INSERT INTO dms_AccessoriesMaster (Title, SortOrder) OUTPUT INSERTED.AccessoryID VALUES (@title, @sort)');
            res.status(201).json({ message: 'Accessory created', AccessoryID: r.recordset[0].AccessoryID });
        }
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.deleteMaster = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE dms_AccessoriesMaster SET IsActive=0 WHERE AccessoryID=@id');
        res.json({ message: 'Accessory deactivated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.getForJobCard = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('jcId', sql.Int, req.params.jobCardId)
            .query(`
                SELECT m.AccessoryID, m.Title, m.SortOrder,
                       ISNULL(j.IsChecked, 0) AS IsChecked,
                       ISNULL(j.Qty, 0) AS Qty
                FROM dms_AccessoriesMaster m
                LEFT JOIN dms_JobCardAccessories j
                    ON m.AccessoryID = j.AccessoryID AND j.JobCardID = @jcId
                WHERE m.IsActive = 1
                ORDER BY m.SortOrder, m.Title
            `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveForJobCard = async (req, res) => {
    try {
        const jobCardId = parseInt(req.params.jobCardId);
        const { accessories } = req.body; // [{ AccessoryID, IsChecked, Qty }]
        if (!Array.isArray(accessories)) return res.status(400).json({ error: 'accessories array required' });
        const pool = await getPool();
        await pool.request().input('jcId', sql.Int, jobCardId)
            .query('DELETE FROM dms_JobCardAccessories WHERE JobCardID=@jcId');
        for (const acc of accessories) {
            await pool.request()
                .input('jcId', sql.Int, jobCardId)
                .input('accId', sql.Int, acc.AccessoryID)
                .input('chk', sql.Bit, acc.IsChecked ? 1 : 0)
                .input('qty', sql.Int, acc.Qty || 0)
                .query('INSERT INTO dms_JobCardAccessories (JobCardID,AccessoryID,IsChecked,Qty) VALUES (@jcId,@accId,@chk,@qty)');
        }
        res.json({ message: 'Accessories saved' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};
