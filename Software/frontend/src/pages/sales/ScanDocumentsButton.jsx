import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ScanLine, Loader2, Settings, Download, X } from 'lucide-react';

const API = '/api/scanner';
const REQUEST = { timeout: 15000 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export default function ScanDocumentsButton({ disabled = false, onScanned, format = 'jpeg', onBusyChange }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [status, setStatus] = useState(null), [setup, setSetup] = useState(false);
    const [duplex, setDuplex] = useState(true), [setupBusy, setSetupBusy] = useState(false);
    const [attempts, setAttempts] = useState(null), [attemptsBusy, setAttemptsBusy] = useState(false);
    const job = useRef(null), generation = useRef(0), mounted = useRef(true), callback = useRef(onScanned);
    const starting = useRef(false);
    const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange;
    callback.current = onScanned;
    useEffect(() => { busyCallback.current?.(busy); }, [busy]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false; generation.current++;
            busyCallback.current?.(false);
            if (job.current) axios.delete(`${API}/sessions/${job.current.id}`, REQUEST).catch(() => {});
        };
    }, []);
    const cancel = async (keepBusy = false) => {
        generation.current++;
        const previous = job.current;
        try {
            if (previous) await axios.delete(`${API}/sessions/${previous.id}`, REQUEST);
        } catch (err) {
            if (![404, 410].includes(err.response?.status)) {
                setBusy(false); setError(err.response?.data?.error || 'Could not cancel the old scan. Try again.'); return false;
            }
        }
        job.current = null;
        setBusy(keepBusy); setStatus(null); setError('');
        return true;
    };
    const loadAttempts = async () => {
        setAttemptsBusy(true);
        try {
            const { data } = await axios.get(`${API}/sessions`, REQUEST);
            if (mounted.current) setAttempts(data);
        } catch (err) { if (mounted.current) setError(err.response?.data?.error || err.message); }
        finally { if (mounted.current) setAttemptsBusy(false); }
    };
    const removeAttempt = async attempt => {
        setAttemptsBusy(true);
        try {
            if (job.current?.id === attempt.id) { if (!await cancel()) return; }
            else {
                try { await axios.delete(`${API}/sessions/${attempt.id}`, REQUEST); }
                catch (err) { if (![404, 410].includes(err.response?.status)) throw err; }
            }
            setError(''); await loadAttempts();
        } catch (err) { setError(err.response?.data?.error || err.message); }
        finally { if (mounted.current) setAttemptsBusy(false); }
    };
    const receive = async (session, run) => {
        const current = () => mounted.current && generation.current === run;
        try {
            while (current()) {
                if (Date.now() >= session.expiresAt) throw new Error('The scan session expired. Start a new scan.');
                const { data } = await axios.get(`${API}/sessions/${session.id}`, REQUEST);
                if (!current()) return;
                setStatus(data);
                if (data.status === 'error') throw new Error(data.error || 'The scanner could not finish.');
                if (data.status === 'ready') {
                    const files = [];
                    for (const page of data.pages) {
                        const result = await axios.get(`${API}/sessions/${session.id}/pages/${page.index}`, { responseType: 'blob', timeout: 60000 });
                        if (!current()) return;
                        files.push(new File([result.data], `Scan-${session.id.slice(0, 8)}-${page.name}`, { type: page.mime }));
                    }
                    callback.current(files);
                    job.current = null;
                    await axios.delete(`${API}/sessions/${session.id}`, REQUEST).catch(() => {});
                    if (current()) { setStatus(null); setBusy(false); }
                    return;
                }
                await delay(1200);
            }
        } catch (err) {
            if (current()) { setError(err.response?.data?.error || err.message); setBusy(false); }
        }
    };
    const start = async () => {
        if (starting.current) return;
        starting.current = true;
        setBusy(true); setError('');
        let run;
        try {
            if (!await cancel(true)) return;
            run = ++generation.current;
            const { data } = await axios.post(`${API}/sessions`, { source: duplex ? 'duplex' : 'feeder', format }, REQUEST);
            if (!mounted.current || generation.current !== run) { axios.delete(`${API}/sessions/${data.id}`, REQUEST).catch(() => {}); return; }
            job.current = data; setAttempts(null); setStatus({ status: 'waiting', pages: [] });
            window.location.assign(data.launchUrl);
            starting.current = false;
            await receive(data, run);
        } catch (err) {
            if (mounted.current && generation.current === run) {
                setError(err.response?.data?.error || err.message); setBusy(false);
                if (err.response?.status === 429) await loadAttempts();
            }
        } finally { starting.current = false; }
    };
    const downloadSetup = async () => {
        setSetupBusy(true); setError('');
        try {
            const result = await axios.get(`${API}/setup`, { responseType: 'blob', ...REQUEST });
            const url = URL.createObjectURL(result.data), link = document.createElement('a');
            link.href = url; link.download = 'Install-AutoDMSScanner.ps1'; document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) { setError(err.message); }
        setSetupBusy(false);
    };
    return <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={disabled || busy || attemptsBusy} onClick={start}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                {busy ? 'Scanning documents...' : 'Scan Documents'}
            </button>
            <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={duplex} disabled={disabled || busy} onChange={event => setDuplex(event.target.checked)} /> Both sides
            </label>
            <button type="button" className="btn" onClick={() => setSetup(!setup)}><Settings size={14} /> Scanner setup</button>
            <button type="button" className="btn" disabled={disabled || busy || attemptsBusy} onClick={loadAttempts}>Manage scans</button>
            {job.current && <button type="button" className="btn" onClick={() => cancel()}><X size={14} /> Cancel scan</button>}
        </div>
        {attempts !== null && <div style={{ marginTop: 8, padding: 10, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>
            <strong>Your scan attempts</strong>
            <div>Cancel old attempts here, including attempts left after refreshing. Cancelling removes that attempt's temporary pages. Finish or cancel any running NAPS2 scan separately.</div>
            {!attempts.length && <div>No previous scan attempts. You can start a new scan.</div>}
            {attempts.map(attempt => <div key={attempt.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <span>Scan {attempt.id.slice(0, 8)}: {attempt.status} · {attempt.pages.length} file(s) · expires {new Date(attempt.expiresAt).toLocaleTimeString()}</span>
                <button type="button" className="btn" disabled={disabled || busy || attemptsBusy} onClick={() => removeAttempt(attempt)}>Cancel attempt</button>
            </div>)}
        </div>}
        {status && <div role="status" style={{ fontSize: 12, marginTop: 6, color: '#475569' }}>
            {status.status === 'waiting' ? <>
                Allow your browser to open AutoDMS Scanner. If nothing opens, install the helper using Scanner setup.
                <button type="button" className="btn" onClick={() => job.current && window.location.assign(job.current.launchUrl)}>Open scanner</button>
            </> : status.status === 'ready' ? 'Receiving scanned pages...' : `${status.pages?.length || 0} page(s) received. Keep the documents in the feeder until scanning finishes.`}
        </div>}
        {error && <div role="alert" style={{ color: '#b91c1c', marginTop: 6, fontSize: 12 }}>{error}
            {job.current && status?.status !== 'error' && <button type="button" className="btn" disabled={busy} onClick={() => {
                setError(''); setBusy(true); receive(job.current, ++generation.current);
            }}>Retry receiving pages</button>}
        </div>}
        {setup && <div style={{ marginTop: 8, padding: 10, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>
            <strong>One-time setup on this Windows Sales PC</strong>
            <ol style={{ paddingLeft: 20 }}>
                <li>Connect the Canon DR-M160II by USB and install its <a href="https://my.canon/en/support/0101031719?model=DR-M160+II" target="_blank" rel="noreferrer">Canon TWAIN driver</a>.</li>
                <li>Install <a href="https://www.naps2.com/download" target="_blank" rel="noreferrer">NAPS2</a> and verify that it can scan from the Canon feeder.</li>
                <li>Download the helper below. Right-click the downloaded PowerShell file and choose <strong>Run with PowerShell</strong>, using the same Windows user who opens AutoDMS.</li>
                <li>Return here, load the feeder and click <strong>Scan Documents</strong>. Allow the browser to open the helper.</li>
            </ol>
            <button type="button" className="btn" disabled={disabled || setupBusy} onClick={downloadSetup}><Download size={14} /> Download scanner helper</button>
            <div style={{ marginTop: 6 }}>{format === 'pdf' ? 'The scanned batch is combined into one PDF for this form, up to 10 MB.' : 'Each page appears below for you to choose its document type and description before uploading. Up to 100 pages, 10 MB per page.'}</div>
        </div>}
    </div>;
}
