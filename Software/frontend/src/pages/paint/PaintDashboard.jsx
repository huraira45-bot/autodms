/**
 * Paint Lab Dashboard (Phase 0 stub).
 * Full KPIs + charts land in Phase 4 once GRN/GRTN/Issue post real data.
 */
import React from 'react';
import { Paintbrush } from 'lucide-react';
import { ErpControlPanel, ErpEmptyState } from '../../components/erp';

export default function PaintDashboard() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title="Paint Lab Dashboard"
                subtitle="Paint stock value, low-stock items, pending GRNs/GRTNs, recent issues, consumption summary."
            />
            <ErpEmptyState
                icon={Paintbrush}
                title="Paint Lab is being rolled out in phases"
                message="Master data + settings are live (Paint Items, Paint Settings). GRN, GRTN, Issue and the dashboard KPIs land next."
            />
        </div>
    );
}
