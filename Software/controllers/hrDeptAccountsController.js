/**
 * HR — per-department salary GL account setup.
 *
 * Endpoints (routes/hrSalaryRoutes.js mounts at /api/hr/dept-accounts):
 *   GET  /                    — list all depts with their 8 GL slots
 *                                (LEFT JOINs so unmapped depts show as NULL)
 *   PUT  /:departmentId       — upsert one department's 8 GL slots
 */
const { sql, getPool } = require('../config/db');

const GL_FIELDS = [
    'SalaryExpenseEobiGLID',
    'SalaryExpenseNonEobiGLID',
    'FuelExpenseGLID',
    'AbsentFineGLID',
    'LateFineGLID',
    'ManualFineGLID',
    'MessRecoveryGLID',
    'EobiPayableGLID',
];

exports.list = async (_req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT d.DepartmentID, d.DepartmentName,
                   a.SalaryExpenseEobiGLID,     glSE.GLCode  AS SalaryExpenseEobiCode,     glSE.GLTitle  AS SalaryExpenseEobiTitle,
                   a.SalaryExpenseNonEobiGLID,  glSN.GLCode  AS SalaryExpenseNonEobiCode,  glSN.GLTitle  AS SalaryExpenseNonEobiTitle,
                   a.FuelExpenseGLID,           glF.GLCode   AS FuelExpenseCode,           glF.GLTitle   AS FuelExpenseTitle,
                   a.AbsentFineGLID,            glAF.GLCode  AS AbsentFineCode,            glAF.GLTitle  AS AbsentFineTitle,
                   a.LateFineGLID,              glLF.GLCode  AS LateFineCode,              glLF.GLTitle  AS LateFineTitle,
                   a.ManualFineGLID,            glMF.GLCode  AS ManualFineCode,            glMF.GLTitle  AS ManualFineTitle,
                   a.MessRecoveryGLID,          glME.GLCode  AS MessRecoveryCode,          glME.GLTitle  AS MessRecoveryTitle,
                   a.EobiPayableGLID,           glEP.GLCode  AS EobiPayableCode,           glEP.GLTitle  AS EobiPayableTitle,
                   a.UpdatedAt, a.UpdatedByName,
                   (SELECT COUNT(*) FROM gen_EmployeeInfo e WHERE e.DepartmentID = d.DepartmentID AND e.IsActive = 1) AS ActiveEmployees
              FROM gen_DepartmentInfo d
              LEFT JOIN hr_DepartmentSalaryAccounts a ON a.DepartmentID = d.DepartmentID
              LEFT JOIN GLChartOFAccount glSE ON glSE.GLCAID = a.SalaryExpenseEobiGLID
              LEFT JOIN GLChartOFAccount glSN ON glSN.GLCAID = a.SalaryExpenseNonEobiGLID
              LEFT JOIN GLChartOFAccount glF  ON glF.GLCAID  = a.FuelExpenseGLID
              LEFT JOIN GLChartOFAccount glAF ON glAF.GLCAID = a.AbsentFineGLID
              LEFT JOIN GLChartOFAccount glLF ON glLF.GLCAID = a.LateFineGLID
              LEFT JOIN GLChartOFAccount glMF ON glMF.GLCAID = a.ManualFineGLID
              LEFT JOIN GLChartOFAccount glME ON glME.GLCAID = a.MessRecoveryGLID
              LEFT JOIN GLChartOFAccount glEP ON glEP.GLCAID = a.EobiPayableGLID
             ORDER BY d.DepartmentName`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.upsert = async (req, res) => {
    const deptId = parseInt(req.params.departmentId);
    if (!Number.isFinite(deptId)) return res.status(400).json({ error: 'Invalid departmentId' });
    const b = req.body || {};
    try {
        const pool = await getPool();
        const rq = pool.request()
            .input('d',  sql.Int, deptId)
            .input('un', sql.NVarChar(100), req.user?.userName || null);
        GL_FIELDS.forEach(f => {
            const v = b[f];
            rq.input(f, sql.Int, v == null || v === '' ? null : Number(v));
        });
        await rq.query(`
            MERGE hr_DepartmentSalaryAccounts AS tgt
            USING (SELECT @d AS DepartmentID) AS src ON tgt.DepartmentID = src.DepartmentID
            WHEN MATCHED THEN UPDATE SET
                SalaryExpenseEobiGLID = @SalaryExpenseEobiGLID,
                SalaryExpenseNonEobiGLID = @SalaryExpenseNonEobiGLID,
                FuelExpenseGLID = @FuelExpenseGLID,
                AbsentFineGLID = @AbsentFineGLID,
                LateFineGLID = @LateFineGLID,
                ManualFineGLID = @ManualFineGLID,
                MessRecoveryGLID = @MessRecoveryGLID,
                EobiPayableGLID = @EobiPayableGLID,
                UpdatedAt = GETDATE(),
                UpdatedByName = @un
            WHEN NOT MATCHED THEN INSERT
                (DepartmentID, SalaryExpenseEobiGLID, SalaryExpenseNonEobiGLID,
                 FuelExpenseGLID, AbsentFineGLID, LateFineGLID, ManualFineGLID,
                 MessRecoveryGLID, EobiPayableGLID, UpdatedByName)
            VALUES
                (@d, @SalaryExpenseEobiGLID, @SalaryExpenseNonEobiGLID,
                 @FuelExpenseGLID, @AbsentFineGLID, @LateFineGLID, @ManualFineGLID,
                 @MessRecoveryGLID, @EobiPayableGLID, @un);
        `);
        res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.GL_FIELDS = GL_FIELDS;
