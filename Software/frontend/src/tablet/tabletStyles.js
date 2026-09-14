/**
 * Shared look for the service tablet screens: touch-sized controls (at least
 * 48px tall), large readable type, and the DealerDesk aubergine brand.
 */
export const T = {
    brand:     '#714b67',
    brandDark: '#5c3d54',
    ink:       '#0f172a',
    muted:     '#64748b',
    line:      '#e2e8f0',
    bg:        '#f1f5f9',
    ok:        '#15803d',
    okBg:      '#f0fdf4',
    bad:       '#b91c1c',
    badBg:     '#fef2f2',
    warn:      '#b45309',
    warnBg:    '#fffbeb',
};

export const tStyles = {
    page: {
        minHeight: '100vh', background: T.bg, color: T.ink,
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    },
    bar: {
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        background: T.brand, color: '#fff', position: 'sticky', top: 0, zIndex: 10,
    },
    barTitle: { fontSize: 19, fontWeight: 700, letterSpacing: 0.2 },
    body:  { padding: 20, maxWidth: 920, margin: '0 auto' },
    card:  { background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 16 },
    h1:    { fontSize: 24, fontWeight: 700, margin: '0 0 6px' },
    h2:    { fontSize: 19, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 },
    p:     { fontSize: 15, lineHeight: 1.5, color: T.muted, margin: '0 0 12px' },
    label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#475569', margin: '0 0 6px' },
    input: {
        width: '100%', boxSizing: 'border-box', fontSize: 18, padding: '14px 16px',
        border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', color: T.ink,
    },
    btn: {
        minHeight: 52, padding: '0 22px', fontSize: 17, fontWeight: 600, borderRadius: 10,
        border: 'none', background: T.brand, color: '#fff', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnGhost: {
        minHeight: 52, padding: '0 22px', fontSize: 17, fontWeight: 600, borderRadius: 10,
        border: `1px solid #cbd5e1`, background: '#fff', color: T.ink, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
    result: (tone) => ({
        marginTop: 14, padding: '12px 14px', borderRadius: 10, fontSize: 15, lineHeight: 1.5,
        background: tone === 'ok' ? T.okBg : tone === 'bad' ? T.badBg : T.warnBg,
        color:      tone === 'ok' ? T.ok   : tone === 'bad' ? T.bad   : T.warn,
        border: `1px solid ${tone === 'ok' ? '#bbf7d0' : tone === 'bad' ? '#fecaca' : '#fde68a'}`,
    }),
};
