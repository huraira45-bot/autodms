/**
 * Idempotent migration runner — applies every `migrations/NNN_*.sql` file
 * that isn't already recorded in `dms_AppliedMigrations`.
 *
 * Reads files in alphanumeric order (so 050 < 051 < 100) and runs each via
 * sqlcmd. If a file fails, the run aborts — fix the issue and re-run.
 * Migrations are applied once per DB; tracking table is auto-created.
 *
 *   node Software/scripts/run-pending-migrations.js
 *
 * The deploy.bat calls this on every deploy. Safe to invoke manually too.
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const DB_SERVER = process.env.DB_SERVER || 'localhost';
const DB_NAME   = process.env.DB_NAME   || 'temp_db1';

async function ensureTrackingTable(pool) {
    await pool.request().query(`
        IF OBJECT_ID('dms_AppliedMigrations') IS NULL
        CREATE TABLE dms_AppliedMigrations (
            Filename     NVARCHAR(255) NOT NULL PRIMARY KEY,
            AppliedAt    DATETIME NOT NULL DEFAULT GETDATE(),
            DurationMs   INT NULL,
            Checksum     NVARCHAR(64) NULL
        );
    `);
}

async function loadApplied(pool) {
    const r = await pool.request().query('SELECT Filename FROM dms_AppliedMigrations');
    return new Set(r.recordset.map(x => x.Filename));
}

function listMigrationFiles() {
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => /^\d+_.*\.sql$/i.test(f))
        .sort();   // 001 < 002 < ... < 051
}

function applyOne(file) {
    const full = path.join(MIGRATIONS_DIR, file);
    // -E Windows-auth, -I QUOTED_IDENTIFIER ON (required for some triggers/views),
    // -b exit non-zero on error so we abort the run, -r1 stderr inline.
    const cmd = `sqlcmd -S "${DB_SERVER}" -d "${DB_NAME}" -E -I -b -r1 -i "${full}"`;
    console.log(`  > ${file}`);
    const t0 = Date.now();
    try {
        execSync(cmd, { stdio: 'inherit' });
        return Date.now() - t0;
    } catch (err) {
        throw new Error(`Migration failed: ${file}`);
    }
}

async function main() {
    const markAll = process.argv.includes('--mark-all-applied');
    const dryRun  = process.argv.includes('--dry-run');
    const pool = await getPool();
    await ensureTrackingTable(pool);
    const applied = await loadApplied(pool);
    const all = listMigrationFiles();
    const pending = all.filter(f => !applied.has(f));

    console.log(`Migrations: ${all.length} total · ${applied.size} applied · ${pending.length} pending`);

    // One-time bootstrap: on a DB where all migrations have already been
    // applied manually, record them in the tracking table without re-running.
    // Use this on the existing dev DB so the runner doesn't try to re-create
    // tables that already exist.
    if (markAll) {
        console.log(`Marking all ${pending.length} pending migrations as already applied (no SQL run):`);
        for (const file of pending) {
            console.log(`  ~ ${file}`);
            await pool.request()
                .input('f',  sql.NVarChar(255), file)
                .input('ms', sql.Int, 0)
                .query('INSERT INTO dms_AppliedMigrations (Filename, DurationMs) VALUES (@f, @ms)');
        }
        console.log('\nBootstrap done.');
        process.exit(0);
    }

    if (!pending.length) { console.log('Nothing to do.'); process.exit(0); }

    if (dryRun) {
        console.log('\nDry-run — would apply:');
        for (const f of pending) console.log(`  > ${f}`);
        process.exit(0);
    }

    console.log('Applying pending migrations:');
    for (const file of pending) {
        const ms = applyOne(file);
        await pool.request()
            .input('f',  sql.NVarChar(255), file)
            .input('ms', sql.Int, ms)
            .query('INSERT INTO dms_AppliedMigrations (Filename, DurationMs) VALUES (@f, @ms)');
    }
    console.log(`\nApplied ${pending.length} migration(s).`);
    process.exit(0);
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
