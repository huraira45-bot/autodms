/**
 * Placeholder used for Paint GRN / GRTN / Issue / Reports until each ships
 * its own page in a later phase. Provides users with an accurate readiness
 * message rather than a 404.
 */
import React from 'react';
import { Paintbrush, Wrench } from 'lucide-react';
import { ErpControlPanel, ErpEmptyState } from '../../components/erp';

export default function PaintPlaceholder({ title, subtitle, phase }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title={title} subtitle={subtitle} />
            <ErpEmptyState
                icon={Wrench}
                title={`${title} lands in ${phase}`}
                message="Paint Lab foundation (schema, permissions, master data) is deployed. This screen is queued for the next Paint Lab phase."
            />
        </div>
    );
}
