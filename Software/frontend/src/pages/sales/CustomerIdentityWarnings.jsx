import { useEffect, useState } from 'react';
import axios from 'axios';

export function CustomerIdentityWarningList({ warnings = [] }) {
    if (!warnings.length) return null;
    return <div role="status" style={{ padding: 10, margin: '10px 0', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
        <strong>Existing customer identity — warning only</strong>
        {warnings.map(warning => <div key={warning.PartyID}>{warning.message}</div>)}
    </div>;
}
export default function CustomerIdentityWarnings({ cnic, ntn, excludeId }) {
    const [warnings, setWarnings] = useState([]);
    const [unavailable, setUnavailable] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setWarnings([]); setUnavailable(false);
        const cnicDigits = (cnic || '').replace(/\D/g, ''), ntnDigits = (ntn || '').replace(/\D/g, '');
        if (!cnicDigits && !ntnDigits) return () => controller.abort();
        const timer = setTimeout(async () => {
            try {
                const { data } = await axios.get('/api/sales/customer-identity-warnings', {
                    params: { CNIC: cnicDigits.length === 13 ? cnic : undefined, NTNNO: /^[0-9]{7,9}$/.test(ntnDigits) ? ntn : undefined, excludeId },
                    signal: controller.signal,
                });
                if (!controller.signal.aborted) setWarnings(data.warnings || []);
            } catch (error) { if (!controller.signal.aborted) setUnavailable(true); }
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [cnic, ntn, excludeId]);
    return <><CustomerIdentityWarningList warnings={warnings} />{unavailable && <p style={{ color: '#92400e', fontSize: 12 }}>Identity warnings could not be checked. They will be checked again when you save.</p>}</>;
}
