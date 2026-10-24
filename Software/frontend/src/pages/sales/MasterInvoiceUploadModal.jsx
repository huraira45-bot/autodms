import { useState } from 'react';
import axios from 'axios';
import { Shell, Field, Err, Actions, inputStyle } from './VehicleModelsAdmin';

const allowed = /\.(pdf|jpe?g|png|webp|gif)$/i;
export default function MasterInvoiceUploadModal({ booking, onClose, onSaved }) {
    const [number, setNumber] = useState(booking.MasterInvoiceNo || '');
    const [date, setDate] = useState(booking.MasterInvoiceDate?.slice(0,10) || '');
    const [file, setFile] = useState(null);
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        if (!number.trim() || !date || !file) { setError('Enter invoice number and date, and select the invoice file.'); return; }
        if (!allowed.test(file.name) || file.size<=0 || file.size>10*1024*1024) {
            setError('Select a PDF or JPG/PNG/WEBP/GIF image, up to 10 MB.'); return;
        }
        setBusy(true);setError('');
        try {
            const form = new FormData();
            form.append('MasterInvoiceNo',number.trim());form.append('MasterInvoiceDate',date);
            form.append('Notes',notes.trim());
            const extensions={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
            const typed=file.type ? file : new File([file],file.name,{type:extensions[file.name.split('.').pop().toLowerCase()]});
            form.append('file',typed,file.name);
            const result=await axios.post(`/api/sales/bookings/${booking.BookingID}/master-invoice-document`,form);
            onSaved(result.data);
        } catch(err) { setError(err.response?.data?.error || err.message); }
        finally { setBusy(false); }
    };
    return <Shell title={`Record Master Invoice${booking.BookingNo ? ` — ${booking.BookingNo}` : ''}`} onClose={busy ? () => {} : onClose}>
        <p style={{fontSize:13}}>Enter the invoice details and upload the invoice issued by Master Motors. Available after gate pass and closure; this saves the invoice paperwork.</p>
        {error && <Err>{error}</Err>}
        <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
            <Field label="Master invoice number *"><input value={number} maxLength={100} onChange={e=>setNumber(e.target.value)} style={inputStyle} /></Field>
            <Field label="Invoice date *"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="Master invoice file *"><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" onChange={e=>setFile(e.target.files?.[0] || null)} style={inputStyle} /></Field>
            <p style={{fontSize:12,color:'#64748b'}}>PDF or image, up to 10 MB. The record is complete only when the file is saved.</p>
            <Field label="Notes (optional)"><textarea rows={2} value={notes} maxLength={500} onChange={e=>setNotes(e.target.value)} style={inputStyle} /></Field>
        </fieldset>
        <Actions onCancel={onClose} onConfirm={save} confirmLabel="Upload and save invoice" busy={busy} disabled={!number.trim() || !date || !file} />
    </Shell>;
}
