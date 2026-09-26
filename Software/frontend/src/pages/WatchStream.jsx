/**
 * What the customer sees when they open their bay camera link.
 *
 * Owner ask 2026-09-26. The camera is not connected to this yet — streaming
 * and recording are a later job — so this page says so plainly rather than
 * showing a dead player or a spinner that never resolves. A customer who
 * opens it should understand immediately that their car is being worked on
 * and that video is not available, not wonder whether their phone is broken.
 *
 * Public: no login, and it bypasses AuthProvider entirely (see
 * RootDispatcher), the same way the survey page does. The token in the URL is
 * the only credential, and the server gives back nothing but the registration
 * and the bay.
 *
 * It re-checks every half minute, so on the day the camera is wired up a page
 * left open starts playing without the customer reloading anything.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io as socketIO } from 'socket.io-client';
import { Video, VideoOff, Wrench, AlertTriangle, Loader2 } from 'lucide-react';

const CSS = `
:root { color-scheme: dark; }
.w-body { min-height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center;
          padding: 20px; background: radial-gradient(900px 420px at 50% -10%, #17223c 0%, transparent 70%), #070b14;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #e8eef7; }
.w-card { width: 100%; max-width: 520px; background: #111a2e; border: 1px solid #24314f;
          border-radius: 12px; padding: 26px 22px; box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
.w-reg { font-family: ui-monospace, Consolas, monospace; font-size: 34px; font-weight: 700;
         letter-spacing: 3px; margin: 2px 0 4px; word-break: break-all; }
.w-muted { color: #94a3b8; font-size: 14px; }
.w-stage { margin: 18px 0 14px; border: 1px dashed #2c3c5e; border-radius: 10px; background: #0b1424;
           min-height: 190px; display: flex; flex-direction: column; align-items: center;
           justify-content: center; gap: 10px; text-align: center; padding: 22px 16px; }
.w-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.w-tag { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #22d3ee; }
.w-foot { font-size: 12px; color: #64748b; margin-top: 14px; line-height: 1.5; }
@media (max-width: 420px) { .w-reg { font-size: 27px; } }
`;

export default function WatchStream() {
    const { token } = useParams();
    const [state, setState] = useState({ status: 'loading' });
    // The picture, as it arrives. PROOF OF CONCEPT: these are JPEG frames over
    // a socket, not video -- see services/bayStreamRelay.js. `live` is true
    // only while frames are actually arriving, so a camera switched off at the
    // bay stops claiming to be live.
    const [frame, setFrame] = useState(null);
    const [live, setLive] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await axios.get(`/api/stream/${encodeURIComponent(token)}`);
            setState({ status: 'ok', data: r.data });
        } catch (e) {
            // Wrong, expired and revoked all answer the same way on purpose,
            // so there is only one thing to say here.
            setState({
                status: 'invalid',
                message: e.response?.data?.error
                    || 'This link is not valid. Ask the service advisor for a new one.',
            });
        }
    }, [token]);

    // The picture comes over its own socket, authorised by the same token in
    // the address -- the customer has no login, and this namespace accepts
    // nothing else.
    useEffect(() => {
        if (state.status !== 'ok') return undefined;
        // axios.defaults.baseURL is where the server actually is -- empty when
        // the page is served by the server itself, and http://localhost:5000
        // under the Vite dev server, where the page is on 5173. A relative
        // namespace would connect to 5173, which has no socket server.
        const socket = socketIO(`${axios.defaults.baseURL || ''}/watch`, {
            path: '/socket.io',
            auth: { token },
            transports: ['websocket', 'polling'],
        });
        let idle = null;
        const seen = () => {
            setLive(true);
            clearTimeout(idle);
            // No frame for two seconds means the bay stopped sending. Saying
            // "live" over a frozen picture would be worse than saying nothing.
            idle = setTimeout(() => setLive(false), 2000);
        };
        socket.on('watch:frame', ({ frame: f }) => { setFrame(f); seen(); });
        socket.on('watch:stopped', () => { setLive(false); });
        socket.on('disconnect', () => setLive(false));
        return () => { clearTimeout(idle); socket.disconnect(); };
    }, [state.status, token]);

    useEffect(() => {
        load();
        // Left open on a waiting-room phone, this picks up the camera the day
        // it is connected, with no reload.
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, [load]);

    const shell = (children) => (
        <div className="w-body">
            <style>{CSS}</style>
            <div className="w-card">{children}</div>
        </div>
    );

    if (state.status === 'loading') {
        return shell(
            <div className="w-row" style={{ justifyContent: 'center', color: '#94a3b8' }}>
                <Loader2 size={18} className="animate-spin" /> Checking your link…
            </div>
        );
    }

    if (state.status === 'invalid') {
        return shell(
            <>
                <div className="w-row"><AlertTriangle size={20} color="#f59e0b" />
                    <strong style={{ fontSize: 17 }}>Link not valid</strong>
                </div>
                <p className="w-muted" style={{ marginTop: 10 }}>{state.message}</p>
                <div className="w-foot">
                    Links stop working once the work is finished, and after twelve hours.
                </div>
            </>
        );
    }

    const d = state.data || {};
    return shell(
        <>
            <div className="w-tag">Your vehicle</div>
            <div className="w-reg">{d.VehicleRegNo || 'Your vehicle'}</div>
            <div className="w-row w-muted">
                <Wrench size={15} />
                {d.BayName ? `In ${d.BayName}` : 'In the workshop'}
                {d.JobCardNo ? ` · ${d.JobCardNo}` : ''}
            </div>

            <div className="w-stage" style={frame ? { padding: 0, border: 'none' } : null}>
                {frame ? (
                    <>
                        <img src={frame} alt="Your vehicle in the workshop"
                             style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                        <div className="w-row" style={{ justifyContent: 'center', marginTop: 8 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%',
                                           background: live ? '#22d3ee' : '#475569',
                                           boxShadow: live ? '0 0 10px #22d3ee' : 'none' }} />
                            <span className="w-muted" style={{ fontSize: 13 }}>
                                {live ? 'Live from the workshop' : 'Paused — waiting for the camera'}
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        <VideoOff size={30} color="#475569" />
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Live video is not available yet</div>
                        <div className="w-muted" style={{ maxWidth: 340 }}>
                            {d.message || 'The camera for this bay is not connected yet.'}
                            {' '}Your vehicle is being worked on — this page will start playing
                            on its own once the camera is running.
                        </div>
                    </>
                )}
            </div>

            <div className="w-foot">
                Keep this page open to follow along. The link is private to your vehicle — please
                do not pass it on.
            </div>
        </>
    );
}
