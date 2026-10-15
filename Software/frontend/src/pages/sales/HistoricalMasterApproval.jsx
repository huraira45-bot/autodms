import React, { useState } from 'react';
import axios from 'axios';
import { inputStyle, Field, Err, Shell } from './VehicleModelsAdmin';
import { masterAmountDue } from '../../utils/salesMasterAmount';

export function HistoricalMasterApprovalPanel({ booking, onSaved }) {
    const target=masterAmountDue(booking);
    const [amount,setAmount]=useState(String(booking.HistoricalMasterApprovedAmount||target));
    const [notes,setNotes]=useState(booking.HistoricalMasterApprovalNotes||'');
    const [busy,setBusy]=useState(false);
    const [error,setError]=useState('');
    const base=`/api/sales/historical/bookings/${booking.BookingID}/master-approval`;
    const save=async()=>{
        setBusy(true);setError('');
        try{const {data}=await axios.post(base,{Amount:Number(amount),Notes:notes});onSaved(data.message);}
        catch(e){setError(e.response?.data?.error||e.message);setBusy(false);}
    };
    const revoke=async()=>{
        setBusy(true);setError('');
        try{const {data}=await axios.delete(base);onSaved(data.message);}
        catch(e){setError(e.response?.data?.error||e.message);setBusy(false);}
    };
    return <div>
        <div style={{padding:10,background:'#f0f9ff',borderRadius:4,marginBottom:12,fontSize:'0.82rem'}}>
            Confirm the total already paid to Master on this historical booking. It counts as paid for the Master gate-pass check.
            {' '}No voucher is required and no new payment is posted. You can still match a voucher later without counting the payment twice.
        </div>
        {error&&<Err>{error}</Err>}
        {Number(booking.HistoricalMasterApprovedAmount)>0&&<div style={{fontSize:'0.82rem',marginBottom:12}}>
            Approved: <strong>PKR {Number(booking.HistoricalMasterApprovedAmount).toLocaleString('en-PK')}</strong>
            {booking.HistoricalMasterApprovedByName&&<> by {booking.HistoricalMasterApprovedByName}</>}
            {booking.HistoricalMasterApprovedAt&&<> · {new Date(booking.HistoricalMasterApprovedAt).toLocaleDateString('en-PK')}</>}
        </div>}
        <Field label="Total already paid to Master (PKR)">
            <input type="number" min="0.01" step="0.01" max={target} value={amount}
                onChange={e=>setAmount(e.target.value)} style={inputStyle} disabled={busy}/>
        </Field>
        <Field label="Notes (optional)">
            <input value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)} style={inputStyle} disabled={busy}/>
        </Field>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            {Number(booking.HistoricalMasterApprovedAmount)>0&&<button className="btn-sm" disabled={busy} onClick={revoke}>Remove approval</button>}
            <button className="btn" disabled={busy||!(Number(amount)>0)||Number(amount)>target} onClick={save}>
                {busy?'Saving...':'Approve Master payment'}
            </button>
        </div>
    </div>;
}
export function HistoricalMasterApprovalModal({ booking, onClose, onSaved }) {
    return <Shell title={`${booking.BookingNo} - approve historical Master payment`} width={640} onClose={onClose}>
        <HistoricalMasterApprovalPanel booking={booking} onSaved={onSaved}/>
    </Shell>;
}
