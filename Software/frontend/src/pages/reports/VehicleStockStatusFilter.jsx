const statuses = { AtDealer: 'At Dealer', InTransit: 'In Transit', AtMaster: 'At Master', Allocated: 'Allocated' };
export const stockStatusLabel = value => statuses[value] || 'All statuses';
export default function VehicleStockStatusFilter({ params, updateParam }) {
    return <label>Stock status <select aria-label="Vehicle stock status" value={params.stockStatus || ''}
        onChange={event => updateParam('stockStatus', event.target.value || undefined)}
        style={{ padding: 7, border: '1px solid #cbd5e1', borderRadius: 5 }}>
        <option value="">All statuses</option>
        {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>;
}
