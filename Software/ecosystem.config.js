/**
 * PM2 process config for the AutoDMS backend.
 *
 * On the live server, install PM2 once:
 *     npm install -g pm2
 *     pm2 install pm2-windows-startup     ← Windows-only autostart helper
 *     pm2-startup install                  ← registers PM2 to launch on boot
 *
 * Then to start (first time):
 *     cd C:\AutoDMS\Software
 *     pm2 start ecosystem.config.js
 *     pm2 save                             ← persists across reboots
 *
 * Day-to-day, `deploy.bat` calls `pm2 reload` for zero-downtime restart.
 *
 * Logs:
 *     pm2 logs autodms        — live tail
 *     pm2 monit               — interactive dashboard
 *     %USERPROFILE%\.pm2\logs ← stored logs
 */
module.exports = {
    apps: [
        {
            name: 'autodms',
            script: 'server.js',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',         // mssql connection pool is per-process; stick to 1 for now
            autorestart: true,
            watch: false,              // we redeploy via `pm2 reload`, not file-watching
            max_memory_restart: '1G',
            env: { NODE_ENV: 'production' },
            error_file:  './logs/pm2-error.log',
            out_file:    './logs/pm2-out.log',
            merge_logs:  true,
            time:        true,         // timestamp each log line
        },
    ],
};
