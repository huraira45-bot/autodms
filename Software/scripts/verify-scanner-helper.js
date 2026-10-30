// Windows integration check with a synthetic scanner executable. No USB scanner,
// user registry, business database, real customer documents or installed programs are changed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const express = require('express');
const routes = require('../routes/scannerRoutes');
const quote = value => `'${value.replace(/'/g, "''")}'`;
const powershell = path.join(process.env.WINDIR || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
let directory, server;
const localBatches = [];
const workers = new Set(), pausedRequests = new Map();
function pauseRequest(session, endpoint) {
    let entered, resume;
    const key = `/${session.id}${endpoint}`;
    const hold = { entered: new Promise(resolve => { entered = resolve; }), resumed: new Promise(resolve => { resume = resolve; }), signal: () => entered() };
    hold.release = () => { pausedRequests.delete(key); resume(); };
    pausedRequests.set(key, hold);
    return hold;
}
async function waitFor(check, message) {
    const deadline = Date.now() + 15000;
    while (!check()) {
        assert.ok(Date.now() < deadline, message);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}
async function runWorker(uri) {
    return new Promise((resolve, reject) => {
        const child = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'Start-AutoDMSScan.ps1'), '-ScanUri', uri, '-NonInteractive'], { windowsHide: true });
        workers.add(child);
        let output = '';
        child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Synthetic scanner helper timed out.')); }, 45000);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('exit', code => { workers.delete(child); clearTimeout(timer); resolve({ code, output }); });
    });
}
(async () => {
    assert.equal(process.platform, 'win32', 'Windows helper verification only.');
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autodms-scanner-integration-'));
    routes.store.root = path.join(directory, 'private-scans');
    const executable = path.join(directory, 'SyntheticScanner.exe');
    const compilePath = path.join(directory, 'compile.ps1');
    fs.writeFileSync(compilePath, `Add-Type -ReferencedAssemblies System.Drawing -OutputType ConsoleApplication -OutputAssembly ${quote(executable)} -TypeDefinition @'
using System; using System.IO; using System.Drawing; using System.Drawing.Imaging;
public class SyntheticScanner {
    public static int Main(string[] args) {
        if (Array.IndexOf(args,"--abandon")==0) {
            using(var mutex=new System.Threading.Mutex(false,args[1])) {
                var thread=new System.Threading.Thread(()=> { mutex.WaitOne(); });
                thread.Start(); thread.Join();
                File.WriteAllText(args[2],"Previous lock owner exited");
                var deadline=DateTime.UtcNow.AddSeconds(30);
                while(!File.Exists(args[2]+".release") && DateTime.UtcNow<deadline) System.Threading.Thread.Sleep(50);
            }
            return 0;
        }
        if (Array.IndexOf(args,"FAIL")>=0) return 1;
        var output=args[Array.IndexOf(args,"-o")+1];
        if (Array.IndexOf(args,"HOLD")>=0) {
            var folder=Path.GetDirectoryName(output);
            File.WriteAllText(Path.Combine(folder,"feeding"),"Synthetic feeder active");
            var deadline=DateTime.UtcNow.AddSeconds(30);
            while (!File.Exists(Path.Combine(folder,"continue"))) {
                if (DateTime.UtcNow>deadline) return 2;
                System.Threading.Thread.Sleep(50);
            }
        }
        if (output.EndsWith(".pdf")) File.WriteAllText(output,"%PDF-1.4\\nSynthetic PDF transfer fixture\\n%%EOF");
        else for (int i=1;i<=2;i++) using(var bitmap=new Bitmap(12,12)) {
            using(var graphics=Graphics.FromImage(bitmap)) graphics.Clear(Color.White);
            bitmap.Save(output.Replace("$(nnnn)",i.ToString("0000")),ImageFormat.Jpeg);
        }
        return 0;
    }
}
'@`, 'utf8');
    const compiled = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', compilePath], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(compiled.status, 0, compiled.stderr);
    // Isolate the test mutex from any real scan on this Windows desktop.
    const workerSource = fs.readFileSync(path.join(__dirname, '../scanner/Start-AutoDMSScan.ps1'), 'utf8');
    assert.ok(workerSource.includes("'Local\\AutoDMSScanner'"));
    const mutexName = 'Local\\AutoDMSScanner-Test-' + path.basename(directory);
    fs.writeFileSync(path.join(directory, 'Start-AutoDMSScan.ps1'), workerSource.replace("'Local\\AutoDMSScanner'", quote(mutexName)));
    const app = express(); app.use(express.json());
    app.use('/api/scanner/ingest', (req, _res, next) => {
        const hold = pausedRequests.get(req.path);
        if (!hold) return next();
        hold.signal(); hold.resumed.then(() => next());
    });
    app.use('/api/scanner/ingest', routes.ingestRouter);
    app.use('/api/scanner', (req, _res, next) => {
        req.user = { userId: Number(req.get('X-Test-User') || 12), modules: ['sales_executive'] }; next();
    }, routes.protectedRouter);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const configuration = { ServerOrigin: origin, Naps2Path: executable, Device: 'DR-M160', Profile: '' };
    const writeConfiguration = () => fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(configuration));
    writeConfiguration();
    const create = async format => {
        const response = await fetch(origin + '/api/scanner/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'duplex', format }) });
        assert.equal(response.status, 201); const session = await response.json(); localBatches.push(session.id); return session;
    };
    const first = await create('jpeg');
    const tampered = await runWorker(first.launchUrl + '&server=http%3A%2F%2Fexample.invalid');
    assert.equal(tampered.code, 1);
    assert.equal((await (await fetch(origin + `/api/scanner/sessions/${first.id}`)).json()).status, 'waiting', 'Extra launch parameters cannot redirect or start the helper.');
    const invalid = await fetch(origin + `/api/scanner/ingest/${first.id}/start`, { method: 'POST' });
    assert.equal(invalid.status, 401);
    assert.equal((await fetch(origin + `/api/scanner/sessions/${first.id}`, { headers: { 'X-Test-User': '99' } })).status, 403);
    const received = await runWorker(first.launchUrl); assert.equal(received.code, 0, received.output);
    const state = await (await fetch(origin + `/api/scanner/sessions/${first.id}`)).json();
    assert.equal(state.status, 'ready'); assert.equal(state.pages.length, 2);
    assert.ok(!JSON.stringify(state).includes(directory)); assert.ok(!JSON.stringify(state).includes(new URL(first.launchUrl).searchParams.get('token')));
    for (const page of state.pages) {
        const response = await fetch(origin + `/api/scanner/sessions/${first.id}/pages/${page.index}`);
        assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/jpeg/);
        const buffer = Buffer.from(await response.arrayBuffer()); assert.equal(buffer[0], 0xff); assert.equal(buffer[1], 0xd8);
    }
    assert.equal(fs.existsSync(path.join(os.tmpdir(), 'AutoDMSScanner', first.id)), false, 'Successful helper cleans its local temporary files.');
    const token = new URL(first.launchUrl).searchParams.get('token');
    assert.equal((await fetch(origin + `/api/scanner/ingest/${first.id}/start`, { method: 'POST', headers: { 'X-AutoDMS-Scan-Key': token } })).status, 409);
    await fetch(origin + `/api/scanner/sessions/${first.id}`, { method: 'DELETE' });
    assert.equal(fs.existsSync(routes.store.directory(first.id)), false);
    const pdf = await create('pdf'); configuration.Profile = 'Synthetic saved profile'; writeConfiguration();
    const pdfRun = await runWorker(pdf.launchUrl); assert.equal(pdfRun.code, 0, pdfRun.output);
    const pdfState = await (await fetch(origin + `/api/scanner/sessions/${pdf.id}`)).json();
    assert.equal(pdfState.status, 'ready'); assert.equal(pdfState.pages.length, 1); assert.equal(pdfState.pages[0].mime, 'application/pdf');
    const pdfResponse = await fetch(origin + `/api/scanner/sessions/${pdf.id}/pages/1`);
    assert.match(pdfResponse.headers.get('content-type'), /application\/pdf/); assert.ok((await pdfResponse.text()).startsWith('%PDF-'));
    await fetch(origin + `/api/scanner/sessions/${pdf.id}`, { method: 'DELETE' });
    // A stalled upload must not reserve hardware that has already finished feeding.
    configuration.Profile = ''; writeConfiguration();
    const uploading = await create('jpeg'), uploadHold = pauseRequest(uploading, '/pages/1');
    let enteredUpload = false; uploadHold.entered.then(() => { enteredUpload = true; });
    const uploadingRun = runWorker(uploading.launchUrl);
    try {
        await waitFor(() => enteredUpload, 'First helper did not reach its upload.');
        const next = await create('jpeg'), nextRun = await runWorker(next.launchUrl);
        assert.equal(nextRun.code, 0, 'Completed hardware scan kept its lock during upload: ' + nextRun.output);
        await fetch(origin + `/api/scanner/sessions/${next.id}`, { method: 'DELETE' });
    } finally { uploadHold.release(); assert.equal((await uploadingRun).code, 0); }
    await fetch(origin + `/api/scanner/sessions/${uploading.id}`, { method: 'DELETE' });
    // An error report can hang too; the lock must be released before the catch/UI.
    configuration.Device = 'FAIL'; writeConfiguration();
    const reporting = await create('jpeg'), errorHold = pauseRequest(reporting, '/complete');
    let enteredError = false; errorHold.entered.then(() => { enteredError = true; });
    const reportingRun = runWorker(reporting.launchUrl);
    try {
        await waitFor(() => enteredError, 'Failed helper did not reach error reporting.');
        configuration.Device = 'DR-M160'; writeConfiguration();
        const next = await create('jpeg'), nextRun = await runWorker(next.launchUrl);
        assert.equal(nextRun.code, 0, 'Failed scan kept its lock during error reporting: ' + nextRun.output);
        await fetch(origin + `/api/scanner/sessions/${next.id}`, { method: 'DELETE' });
    } finally { errorHold.release(); assert.equal((await reportingRun).code, 1); }
    await fetch(origin + `/api/scanner/sessions/${reporting.id}`, { method: 'DELETE' });
    // Keep the real concurrency guard: cancelling the server draft does not stop feeding.
    configuration.Device = 'HOLD'; writeConfiguration();
    const feeding = await create('jpeg'), feedingFolder = path.join(os.tmpdir(), 'AutoDMSScanner', feeding.id);
    const feedingRun = runWorker(feeding.launchUrl);
    try {
        await waitFor(() => fs.existsSync(path.join(feedingFolder, 'feeding')), 'Synthetic feeder did not start.');
        await fetch(origin + `/api/scanner/sessions/${feeding.id}`, { method: 'DELETE' });
        configuration.Device = 'DR-M160'; writeConfiguration();
        const busy = await create('jpeg'), busyRun = await runWorker(busy.launchUrl);
        assert.equal(busyRun.code, 1); assert.match(busyRun.output, /Another scan is still\s+running/);
        assert.equal(fs.existsSync(path.join(os.tmpdir(), 'AutoDMSScanner', busy.id, 'scanner.log')), false, 'Second helper must not invoke scanner while feeding.');
        await fetch(origin + `/api/scanner/sessions/${busy.id}`, { method: 'DELETE' });
    } finally { fs.writeFileSync(path.join(feedingFolder, 'continue'), ''); assert.equal((await feedingRun).code, 1); }
    const recovered = await create('jpeg'), recoveredRun = await runWorker(recovered.launchUrl);
    assert.equal(recoveredRun.code, 0, recoveredRun.output);
    await fetch(origin + `/api/scanner/sessions/${recovered.id}`, { method: 'DELETE' });
    // Windows grants ownership while throwing AbandonedMutexException.
    const marker = path.join(directory, 'abandoned-lock');
    const abandonedOwner = spawn(executable, ['--abandon', mutexName, marker], { windowsHide: true, stdio: 'ignore' });
    workers.add(abandonedOwner);
    const abandonedExit = new Promise((resolve, reject) => {
        abandonedOwner.on('error', reject); abandonedOwner.on('exit', code => { workers.delete(abandonedOwner); resolve(code); });
    });
    try {
        await waitFor(() => fs.existsSync(marker), 'Synthetic previous owner did not abandon mutex.');
        const abandoned = await create('jpeg'), abandonedRun = await runWorker(abandoned.launchUrl);
        assert.equal(abandonedRun.code, 0, abandonedRun.output);
        await fetch(origin + `/api/scanner/sessions/${abandoned.id}`, { method: 'DELETE' });
    } finally { fs.writeFileSync(marker + '.release', ''); assert.equal(await abandonedExit, 0); }
    const failed = await create('jpeg'); configuration.Profile = ''; configuration.Device = 'FAIL'; writeConfiguration();
    const failedRun = await runWorker(failed.launchUrl); assert.equal(failedRun.code, 1);
    const failedState = await (await fetch(origin + `/api/scanner/sessions/${failed.id}`)).json();
    assert.equal(failedState.status, 'error'); assert.match(failedState.error, /could not finish/);
    assert.ok(fs.existsSync(path.join(os.tmpdir(), 'AutoDMSScanner', failed.id, 'scanner.log')), 'Failed scan files/log retained for manual recovery.');
    const setup = await (await fetch(origin + '/api/scanner/setup')).text();
    assert.ok(setup.includes(origin)); assert.ok(!setup.includes('__AUTODMS_WORKER_BASE64__'));
    const setupFile = path.join(directory, 'Downloaded-Installer.ps1'); fs.writeFileSync(setupFile, setup);
    const parser = path.join(directory, 'parse.ps1');
    fs.writeFileSync(parser, `$errors=$null; $tokens=$null; [Management.Automation.Language.Parser]::ParseFile(${quote(setupFile)},[ref]$tokens,[ref]$errors)|Out-Null; if($errors.Count){$errors|ForEach-Object {$_.Message}; exit 1}`);
    const parsed = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', parser], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
    assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
    // Execute the downloaded updater in an isolated user folder with registry writes
    // intercepted. Updating must preserve settings, while explicit replacements win.
    const installRoot = path.join(directory, 'installed-user'), installFolder = path.join(installRoot, 'AutoDMSScanner');
    fs.mkdirSync(installFolder, { recursive: true });
    const installedConfig = path.join(installFolder, 'config.json');
    fs.writeFileSync(installedConfig, JSON.stringify({ ServerOrigin: origin, Naps2Path: executable, Device: 'Custom Canon', Profile: 'Saved profile' }));
    const installerCheck = path.join(directory, 'check-installer.ps1');
    fs.writeFileSync(installerCheck, `param([switch]$Override)
$env:LOCALAPPDATA=${quote(installRoot)}
function New-Item {
    param([string]$Path,[string]$ItemType,[switch]$Force)
    if($Path.StartsWith('HKCU:')) { return }
    Microsoft.PowerShell.Management\\New-Item @PSBoundParameters
}
function Set-Item {
    param([string]$Path,[string]$Value)
    if(-not $Path.StartsWith('HKCU:')) { throw 'Unexpected registry target' }
}
function New-ItemProperty {
    param([string]$Path,[string]$Name,[string]$Value,[string]$PropertyType,[switch]$Force)
    if(-not $Path.StartsWith('HKCU:')) { throw 'Unexpected registry target' }
}
function Read-Host { param([string]$Prompt) return '' }
if($Override) { & ${quote(setupFile)} -Naps2Path ${quote(executable)} -Device 'Replacement Canon' -ScannerProfile '' }
else { & ${quote(setupFile)} }
if($global:LASTEXITCODE -eq 1) { exit 1 }
`, 'utf8');
    for (const override of [false, true]) {
        const installed = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerCheck, ...(override ? ['-Override'] : [])], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
        assert.equal(installed.status, 0, installed.stdout + installed.stderr);
        const saved = JSON.parse(fs.readFileSync(installedConfig, 'utf8'));
        assert.equal(saved.Naps2Path, executable); assert.equal(saved.ServerOrigin, origin);
        assert.equal(saved.Device, override ? 'Replacement Canon' : 'Custom Canon');
        assert.equal(saved.Profile, override ? '' : 'Saved profile');
        assert.equal(fs.readFileSync(path.join(installFolder, 'Start-AutoDMSScan.ps1'), 'utf8'), workerSource);
    }
    console.log('PASS: actual Windows helper plus HTTP upload routes using a synthetic scanner: JPEG/PDF, scoped keys, owner privacy, replay rejection, hardware concurrency/cancellation, lock released before uploads/error reporting, abandoned-lock recovery, failed-scan recovery, generated installer syntax and setting preservation/overrides. No physical-scanner, registry, business data or ledger changes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    for (const hold of pausedRequests.values()) hold.release();
    for (const child of workers) child.kill();
    for (const id of localBatches) {
        await routes.store.remove(id).catch(() => {});
        const batchRoot = path.resolve(os.tmpdir(), 'AutoDMSScanner'), batch = path.resolve(batchRoot, id);
        if (/^[a-f0-9]{32}$/.test(id) && path.dirname(batch) === batchRoot) fs.rmSync(batch, { recursive: true, force: true });
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (directory && path.dirname(directory) === os.tmpdir()) fs.rmSync(directory, { recursive: true, force: true });
});
