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
async function runWorker(uri) {
    return new Promise((resolve, reject) => {
        const child = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'Start-AutoDMSScan.ps1'), '-ScanUri', uri, '-NonInteractive'], { windowsHide: true });
        let output = '';
        child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Synthetic scanner helper timed out.')); }, 45000);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('exit', code => { clearTimeout(timer); resolve({ code, output }); });
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
        if (Array.IndexOf(args,"FAIL")>=0) return 1;
        var output=args[Array.IndexOf(args,"-o")+1];
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
    fs.copyFileSync(path.join(__dirname, '../scanner/Start-AutoDMSScan.ps1'), path.join(directory, 'Start-AutoDMSScan.ps1'));
    const app = express(); app.use(express.json());
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
    console.log('PASS: actual Windows helper plus HTTP upload routes using a synthetic scanner: feeder page ordering/JPEG transfer, PDF/profile mode, scoped keys, owner privacy, duplicate launch rejection, cancellation cleanup, failed-scan recovery, generated installer syntax. No physical-scanner, registry, business data or ledger changes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    for (const id of localBatches) {
        await routes.store.remove(id).catch(() => {});
        const batchRoot = path.resolve(os.tmpdir(), 'AutoDMSScanner'), batch = path.resolve(batchRoot, id);
        if (/^[a-f0-9]{32}$/.test(id) && path.dirname(batch) === batchRoot) fs.rmSync(batch, { recursive: true, force: true });
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (directory && path.dirname(directory) === os.tmpdir()) fs.rmSync(directory, { recursive: true, force: true });
});
