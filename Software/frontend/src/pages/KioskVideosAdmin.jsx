/**
 * Lobby Videos — what the job board plays between refreshes.
 *
 * Owner ask 2026-09-23: the lobby TV shows the job board for a minute, plays a
 * video to the end, comes back to the board for a minute, plays the next, and
 * loops round to the first after the last. This screen is the playlist: upload
 * clips, put them in order, switch one off for a while, delete it for good.
 *
 * Changes reach the TV on its own — it re-reads the playlist every few minutes,
 * so nobody has to go and restart the browser in the lounge.
 */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    MonitorPlay, Upload, Trash2, ArrowUp, ArrowDown, Eye, EyeOff,
    Loader2, Clock, Play,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { useCan } from '../context/AuthContext';
import { EmptyState } from '../components/UXPrimitives';
import { ErpControlPanel } from '../components/erp';

const API = '/api/kiosk-videos';
const MB = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;

export default function KioskVideosAdmin() {
    const { notify, confirm } = useFeedback();
    const { canInsert, canEdit, canDelete } = useCan('workshop_kiosk_videos');
    const [videos, setVideos] = useState([]);
    const [boardSeconds, setBoardSeconds] = useState(60);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [preview, setPreview] = useState(null);
    const fileRef = useRef(null);

    const load = async () => {
        setLoading(true);
        try {
            const r = await axios.get(API);
            setVideos(r.data?.videos || []);
            setBoardSeconds(r.data?.boardSeconds || 60);
        } catch (err) {
            notify('error', err.response?.data?.error || 'Could not load the videos.');
        }
        setLoading(false);
    };
    useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    const onPick = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';                 // so the same file can be retried
        if (!file) return;

        const body = new FormData();
        body.append('video', file);
        body.append('Title', file.name.replace(/\.[^.]+$/, ''));

        setUploading(true);
        setProgress(0);
        try {
            await axios.post(API, body, {
                // These are tens of megabytes over the workshop LAN — without a
                // bar it looks like nothing is happening.
                onUploadProgress: (p) => p.total && setProgress(Math.round(p.loaded / p.total * 100)),
            });
            notify('success', `"${file.name}" added — it will play last.`);
            load();
        } catch (err) {
            notify('error', err.response?.data?.error || 'The upload failed.');
        }
        setUploading(false);
    };

    const toggle = async (v) => {
        try {
            await axios.patch(`${API}/${v.VideoID}`, { IsActive: !v.IsActive });
            setVideos(vs => vs.map(x => x.VideoID === v.VideoID ? { ...x, IsActive: !x.IsActive } : x));
        } catch (err) {
            notify('error', err.response?.data?.error || 'Could not change that.');
        }
    };

    const move = async (idx, by) => {
        const next = [...videos];
        const to = idx + by;
        if (to < 0 || to >= next.length) return;
        [next[idx], next[to]] = [next[to], next[idx]];
        setVideos(next);                      // move on screen at once
        try {
            await axios.put(`${API}/order`, { order: next.map(v => v.VideoID) });
        } catch (err) {
            notify('error', err.response?.data?.error || 'Could not save the order.');
            load();                           // put it back the way it really is
        }
    };

    const remove = async (v) => {
        const ok = await confirm({
            title: `Delete "${v.Title}"?`,
            message: 'The video file is deleted from the server as well. If you only want it off the '
                   + 'TV for now, switch it off instead — that keeps the file.',
            confirmLabel: 'Delete for good',
            danger: true,
        });
        if (!ok) return;
        try {
            await axios.delete(`${API}/${v.VideoID}`);
            notify('success', 'Video removed.');
            load();
        } catch (err) {
            notify('error', err.response?.data?.error || 'Could not delete it.');
        }
    };

    const saveSeconds = async (secs) => {
        try {
            await axios.put(`${API}/settings`, { boardSeconds: secs });
            setBoardSeconds(secs);
            notify('success', `The board will show for ${secs} seconds between videos.`);
        } catch (err) {
            notify('error', err.response?.data?.error || 'Could not save that.');
            load();
        }
    };

    const playing = videos.filter(v => v.IsActive);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <MonitorPlay size={20} /> Lobby Videos
                </span>}
                subtitle={playing.length
                    ? `${playing.length} playing, ${boardSeconds}s of job board between each`
                    : 'Nothing playing — the lobby TV shows the job board only'}
                actions={canInsert && (
                    <>
                        <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/ogg"
                               style={{ display: 'none' }} onChange={onPick} />
                        <button type="button" className="erp-btn erp-btn-sm erp-btn-primary"
                                disabled={uploading} onClick={() => fileRef.current?.click()}>
                            {uploading
                                ? <><Loader2 size={14} className="animate-spin" /> {progress}%</>
                                : <><Upload size={14} /> Add video</>}
                        </button>
                    </>
                )}
            />

            <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Clock size={16} color="#64748b" />
                    <span style={{ fontSize: '0.9rem' }}>Show the job board for</span>
                    <select value={boardSeconds} disabled={!canEdit}
                            onChange={e => saveSeconds(Number(e.target.value))}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                        {[30, 45, 60, 90, 120, 180, 300].map(s => (
                            <option key={s} value={s}>{s < 60 ? `${s} seconds` : `${s / 60} minute${s > 60 ? 's' : ''}`}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: '0.9rem' }}>between videos.</span>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: 'auto' }}>
                        Each video plays to the end, then the board comes back. After the last one it starts again at the first.
                    </span>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <Loader2 size={22} className="animate-spin" />
                </div>
            ) : !videos.length ? (
                <EmptyState
                    icon={MonitorPlay}
                    title="No videos yet"
                    message={canInsert
                        ? 'Add an MP4 and it will start playing on the lobby TV between refreshes of the job board.'
                        : 'Nobody has added a video for the lobby TV yet.'}
                />
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={th}>#</th>
                                <th style={th}>Video</th>
                                <th style={th}>Size</th>
                                <th style={th}>Added</th>
                                <th style={{ ...th, textAlign: 'right' }}>Order</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {videos.map((v, i) => (
                                <tr key={v.VideoID} style={{ borderTop: '1px solid #e2e8f0', opacity: v.IsActive ? 1 : 0.5 }}>
                                    <td style={{ ...td, width: 40, color: '#64748b' }}>
                                        {v.IsActive ? playing.findIndex(p => p.VideoID === v.VideoID) + 1 : '—'}
                                    </td>
                                    <td style={td}>
                                        <div style={{ fontWeight: 600 }}>{v.Title}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            {v.OriginalName}
                                            {!v.IsActive && <strong style={{ color: '#b45309' }}> · switched off</strong>}
                                        </div>
                                    </td>
                                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{MB(v.SizeBytes)}</td>
                                    <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748b' }}>
                                        {new Date(v.UploadedAt).toLocaleDateString('en-PK')}
                                        {v.UploadedByName ? ` · ${v.UploadedByName}` : ''}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button className="btn-icon" title="Play earlier" disabled={!canEdit || i === 0}
                                                onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                                        <button className="btn-icon" title="Play later" disabled={!canEdit || i === videos.length - 1}
                                                onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                                    </td>
                                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button className="btn-icon" title="Watch it" onClick={() => setPreview(v)}>
                                            <Play size={15} />
                                        </button>
                                        {canEdit && (
                                            <button className="btn-icon" onClick={() => toggle(v)}
                                                    title={v.IsActive ? 'Stop playing this on the TV' : 'Start playing it again'}>
                                                {v.IsActive ? <Eye size={15} /> : <EyeOff size={15} />}
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button className="btn-icon" title="Delete for good" onClick={() => remove(v)}>
                                                <Trash2 size={15} color="#b91c1c" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {preview && (
                <div onClick={() => setPreview(null)}
                     style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <video src={preview.url} controls autoPlay
                           style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8 }}
                           onClick={e => e.stopPropagation()} />
                </div>
            )}
        </div>
    );
}

const th = { padding: '10px 14px', fontSize: '0.76rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' };
const td = { padding: '10px 14px', fontSize: '0.88rem', verticalAlign: 'top' };
