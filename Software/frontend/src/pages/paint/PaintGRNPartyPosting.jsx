import { useState } from 'react';
import axios from 'axios';
import SearchableSelect from '../../components/SearchableSelect';

export default function PaintGRNPartyPosting({ grnId, grnNo, amount, parties, initialPartyId, onBusy, onSaved, onClose }) {
    const [partyId, setPartyId] = useState(initialPartyId || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const formatted = Number(amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const post = async () => {
        setBusy(true); onBusy(true); setError('');
        try {
            const { data } = await axios.post(`/api/paint/grn/${grnId}/post-to-party`, { PartyID: Number(partyId) });
            await onSaved(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setBusy(false); onBusy(false); }
    };
    return <div className="paint-card" style={{ borderColor: '#b9d6e8' }}>
        <div className="paint-card-title">Post {grnNo} to party</div>
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>
            Put PKR <strong>{formatted}</strong> on the selected supplier’s payable balance and change this GRN to Credit.
            {' '}Stock quantities, average costs, and stock ledger entries stay unchanged.
        </p>
        {error && <div className="erp-alert warning" role="alert">{error}</div>}
        <label style={{ display: 'block', maxWidth: 480, marginBottom: 12 }}>Supplier *
            <SearchableSelect value={partyId} onChange={setPartyId} disabled={busy}
                options={parties} placeholder="Select supplier…" title="Pick supplier for payable" />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || !partyId} onClick={post}>
                {busy ? 'Posting…' : `Post PKR ${formatted} to party`}
            </button>
            <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
    </div>;
}
