export const stockTypeLabel = value => ({ Booked: 'Booked', OpenAllocation: 'Open Allocation' }[value] || 'Not set');
export default function VehicleStockTypeFilter({ params, updateParam }) {
    return <label>Stock type <select aria-label="Vehicle stock type" value={params.allocationType || ''}
        onChange={event=>updateParam('allocationType',event.target.value||undefined)} style={{padding:7,border:'1px solid #cbd5e1',borderRadius:5}}>
        <option value="">All stock types</option><option value="Booked">Booked</option><option value="OpenAllocation">Open Allocation</option>
    </select></label>;
}
