/**
 * Drag-and-drop booking documents (owner ask 2026-09-14): PBO, CNIC, authority
 * letter or any other paperwork, several files at once.
 *
 * Two ways to use it:
 *   - New Booking: <BookingDocumentDrop items={docs} onChange={setDocs} />
 *     The files wait here and the page uploads them with
 *     uploadBookingDocuments() as soon as the booking exists.
 *   - Booking Detail: <BookingDocumentDrop bookingId={id} onUploaded={...} />
 *     Shows an Upload button that sends them straight away.
 *
 * Files go to the existing POST /api/sales/bookings/:id/documents, one request
 * per file, with the same limits the server enforces: PDF or JPG/PNG/WEBP/GIF,
 * 10 MB each, a document type, and a description of at least 5 characters.
 */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { inputStyle, Err } from './VehicleModelsAdmin';

export const MAX_DOC_BYTES = 10 * 1024 * 1024;   // same as middleware/salesUpload.js

const MIME_BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));

export const DOC_TYPE_LABELS = {
    PBO: 'PBO',
    CNIC: 'CNIC',
    AuthorityLetter: 'Authority letter',
    ProofOfPayment: 'Proof of payment',
    Other: 'Other document',
};

// Some apps hand over a file with no type; fall back to its extension so the
// server sees a real content type instead of refusing it.
function mimeOf(file) {
    if (file.type) return file.type;
    const ext = String(file.name).split('.').pop().toLowerCase();
    return MIME_BY_EXT[ext] || '';
}

function guessDocType(name, types) {
    const n = String(name).toLowerCase();
    const has = (t) => types.includes(t);
    if (has('PBO') && (/(^|[^a-z])pbo([^a-z]|$)/.test(n) || /pay[\s_-]*order|booking[\s_-]*order/.test(n))) return 'PBO';
    if (has('CNIC') && (/cnic|(^|[^a-z])nic([^a-z]|$)|id[\s_-]*card|identity/.test(n))) return 'CNIC';
    if (has('AuthorityLetter') && /authori[sz]/.test(n)) return 'AuthorityLetter';
    if (has('ProofOfPayment') && /receipt|deposit|bank[\s_-]*slip|payment/.test(n)) return 'ProofOfPayment';
    return has('Other') ? 'Other' : types[0];
}

const autoDescription = (docType, fileName) => `${DOC_TYPE_LABELS[docType] || docType}: ${fileName}`.slice(0, 500);

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Messages for anything that would be refused, or [] when all are fine. */
export function validateDocumentItems(items) {
    return items
        .filter(it => String(it.description || '').trim().length < 5)
        .map(it => `${it.file.name}: the description needs at least 5 characters.`);
}

/**
 * Uploads each item to the booking. Never throws; returns one result per item:
 * { key, name, ok, error }.
 */
export async function uploadBookingDocuments(bookingId, items, onProgress) {
    const results = [];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        onProgress?.(i + 1, items.length, it);
        try {
            const fd = new FormData();
            fd.append('DocType', it.docType);
            fd.append('Description', String(it.description).trim());
            const typed = it.file.type ? it.file : new File([it.file], it.file.name, { type: mimeOf(it.file) });
            fd.append('file', typed, it.file.name);
            await axios.post(`/api/sales/bookings/${bookingId}/documents`, fd);
            results.push({ key: it.key, name: it.file.name, ok: true });
        } catch (e) {
            results.push({ key: it.key, name: it.file.name, ok: false, error: e.response?.data?.error || e.message });
        }
    }
    return results;
}

export default function BookingDocumentDrop({
    items, onChange, bookingId, onUploaded,
    types = ['PBO', 'CNIC', 'AuthorityLetter', 'Other'],
    disabled = false,
}) {
    const [ownItems, setOwnItems] = useState([]);
    const list = items ?? ownItems;
    const setList = onChange ?? setOwnItems;

    const [dragging, setDragging] = useState(false);
    const [rejected, setRejected] = useState([]);
    const [uploading, setUploading] = useState(null);   // { done, total }
    const inputRef = useRef(null);
    const dragDepth = useRef(0);

    // Free the image previews when the box goes away.
    const latest = useRef(list);
    latest.current = list;
    useEffect(() => () => {
        for (const it of latest.current) if (it.preview) URL.revokeObjectURL(it.preview);
    }, []);

    const addFiles = (fileList) => {
        if (disabled) return;
        const accepted = [];
        const refused = [];
        for (const file of Array.from(fileList || [])) {
            const mime = mimeOf(file);
            if (!ALLOWED_MIME.has(mime)) {
                refused.push(`${file.name}: only PDF or JPG / PNG / WEBP / GIF pictures can be attached.`);
            } else if (file.size > MAX_DOC_BYTES) {
                refused.push(`${file.name}: ${kb(file.size)} is over the 10 MB limit.`);
            } else if ([...list, ...accepted].some(x => x.file.name === file.name && x.file.size === file.size)) {
                refused.push(`${file.name}: already added.`);
            } else {
                const docType = guessDocType(file.name, types);
                accepted.push({
                    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file,
                    docType,
                    description: autoDescription(docType, file.name),
                    autoDescription: true,
                    preview: mime.startsWith('image/') ? URL.createObjectURL(file) : null,
                    error: null,
                });
            }
        }
        setRejected(refused);
        if (accepted.length) setList([...list, ...accepted]);
    };

    const update = (key, patch) => setList(list.map(it => (it.key === key ? { ...it, ...patch, error: null } : it)));

    const changeType = (it, docType) => update(it.key, it.autoDescription
        ? { docType, description: autoDescription(docType, it.file.name) }
        : { docType });

    const remove = (it) => {
        if (it.preview) URL.revokeObjectURL(it.preview);
        setList(list.filter(x => x.key !== it.key));
    };

    const uploadNow = async () => {
        const problems = validateDocumentItems(list);
        if (problems.length) { setRejected(problems); return; }
        setRejected([]);
        setUploading({ done: 0, total: list.length });
        const results = await uploadBookingDocuments(bookingId, list, (done, total) => setUploading({ done, total }));
        setUploading(null);
        const failed = new Map(results.filter(r => !r.ok).map(r => [r.key, r.error]));
        for (const it of list) if (!failed.has(it.key) && it.preview) URL.revokeObjectURL(it.preview);
        setList(list.filter(it => failed.has(it.key)).map(it => ({ ...it, error: failed.get(it.key) })));
        onUploaded?.(results);
    };

    const onDragEnter = (e) => { e.preventDefault(); dragDepth.current += 1; if (!disabled) setDragging(true); };
    const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; };
    const onDragLeave = (e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
    const onDrop = (e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(e.dataTransfer.files);
    };

    return (
        <div>
            <div
                role="button"
                tabIndex={0}
                onClick={() => !disabled && inputRef.current?.click()}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                    border: `2px dashed ${dragging ? '#1e40af' : '#cbd5e1'}`,
                    background: dragging ? '#eff6ff' : '#f8fafc',
                    borderRadius: 8, padding: '18px 12px', textAlign: 'center',
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
                    transition: 'background 0.15s, border-color 0.15s',
                }}>
                <Upload size={26} style={{ color: '#1e40af' }} />
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 4 }}>
                    {dragging ? 'Drop the files here' : 'Drag PBO, CNIC or any other documents here'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                    or click to choose · several at once · PDF, JPG, PNG, WEBP · up to 10 MB each
                </div>
                <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
                       accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif"
                       onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {rejected.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <Err>{rejected.map(r => <div key={r}>{r}</div>)}</Err>
                </div>
            )}

            {list.length > 0 && (
                <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    {list.map(it => (
                        <div key={it.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                            {it.preview
                                ? <img src={it.preview} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid #e2e8f0' }} />
                                : <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: '#fef2f2', borderRadius: 4 }}><FileText size={22} style={{ color: '#b91c1c' }} /></div>}
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, wordBreak: 'break-all' }}>
                                    {it.file.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({kb(it.file.size)})</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                    <select value={it.docType} disabled={disabled || !!uploading}
                                            onChange={(e) => changeType(it, e.target.value)}
                                            style={{ ...inputStyle, width: 170, padding: 6 }}>
                                        {types.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t] || t}</option>)}
                                    </select>
                                    <input value={it.description} maxLength={500} disabled={disabled || !!uploading}
                                           onChange={(e) => update(it.key, { description: e.target.value, autoDescription: false })}
                                           placeholder="Description (min 5 characters)"
                                           style={{ ...inputStyle, flex: 1, minWidth: 180, padding: 6 }} />
                                </div>
                                {it.error && <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: 4 }}>Not uploaded: {it.error}</div>}
                            </div>
                            <button type="button" className="btn-icon" title="Remove" disabled={disabled || !!uploading}
                                    onClick={() => remove(it)} style={{ color: '#b91c1c' }}>
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                    {bookingId && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 10 }}>
                            <button type="button" onClick={uploadNow} disabled={disabled || !!uploading}
                                    style={{ padding: '8px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {uploading
                                    ? <><Loader2 size={14} className="animate-spin" /> Uploading {uploading.done} of {uploading.total}…</>
                                    : <><Upload size={14} /> Upload {list.length} document{list.length === 1 ? '' : 's'}</>}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
