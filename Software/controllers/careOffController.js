const { sql, getPool } = require('../config/db');

exports.getCareOffs = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT c.CareOffID, c.EmployeeID, c.MaxDiscountPct, c.IsActive, c.CreatedAt, c.UpdatedAt,
                   e.EmployeeName
            FROM dms_CareOff c
            JOIN gen_EmployeeInfo e ON c.EmployeeID = e.EmployeeID
            ORDER BY e.EmployeeName
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getActiveCareOffs = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT c.CareOffID, c.EmployeeID, c.MaxDiscountPct, e.EmployeeName
            FROM dms_CareOff c
            JOIN gen_EmployeeInfo e ON c.EmployeeID = e.EmployeeID
            WHERE c.IsActive = 1
            ORDER BY e.EmployeeName
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveCareOff = async (req, res) => {
    try {
        const { CareOffID, EmployeeID, MaxDiscountPct, IsActive } = req.body;
        if (!EmployeeID) return res.status(400).json({ error: 'Employee is required.' });
        const pct = Number(MaxDiscountPct);
        if (isNaN(pct) || pct < 0 || pct > 100)
            return res.status(400).json({ error: 'Max discount must be between 0 and 100.' });

        const pool = await getPool();
        if (CareOffID) {
            await pool.request()
                .input('id', sql.Int, CareOffID)
                .input('pct', sql.Decimal(5, 2), pct)
                .input('active', sql.Bit, IsActive ? 1 : 0)
                .input('by', sql.Int, req.user?.userId || null)
                .query('UPDATE dms_CareOff SET MaxDiscountPct=@pct, IsActive=@active, UpdatedBy=@by, UpdatedAt=GETDATE() WHERE CareOffID=@id');
            res.json({ message: 'Care-Off updated' });
        } else {
            const dup = await pool.request()
                .input('empId', sql.Int, EmployeeID)
                .query('SELECT CareOffID FROM dms_CareOff WHERE EmployeeID=@empId');
            if (dup.recordset.length)
                return res.status(400).json({ error: 'This employee is already configured as a Care-Off.' });
            await pool.request()
                .input('empId', sql.Int, EmployeeID)
                .input('pct', sql.Decimal(5, 2), pct)
                .input('by', sql.Int, req.user?.userId || null)
                .query('INSERT INTO dms_CareOff (EmployeeID, MaxDiscountPct, IsActive, CreatedBy) VALUES (@empId, @pct, 1, @by)');
            res.status(201).json({ message: 'Care-Off created' });
        }
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.deleteCareOff = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('by', sql.Int, req.user?.userId || null)
            .query('UPDATE dms_CareOff SET IsActive=0, UpdatedBy=@by, UpdatedAt=GETDATE() WHERE CareOffID=@id');
        res.json({ message: 'Care-Off deactivated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.getAuditLog = async (req, res) => {
    try {
        const { jobCardId } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let query = 'SELECT * FROM dms_CareOffAudit';
        if (jobCardId) {
            request.input('jcId', sql.Int, parseInt(jobCardId));
            query += ' WHERE JobCardID = @jcId';
        }
        query += ' ORDER BY ChangedAt DESC';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
