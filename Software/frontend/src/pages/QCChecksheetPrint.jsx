/**
 * The QC Inspection Checksheet on paper.
 *
 * Laid out to read like the dealership's own sheet (owner ask 2026-09-25):
 * a numbered run of points down the page in their sections, a confirmation
 * column and a remarks column, with the job card and vehicle at the top.
 *
 * A point nobody looked at prints as an empty box, exactly as the paper sheet
 * would, rather than as a tick or a cross. A sheet completed with points
 * outstanding says so at the foot, because the owner's rule is that an
 * incomplete sheet is recorded and never blocks the car going out — so the
 * paper has to be honest about what was actually checked.
 */
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../components/PrintBusinessHeader';

const when = v => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

const CSS = `
@page { size: A4 portrait; margin: 10mm; }
.qc-wrap { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9pt; }
.qc-title { text-align: center; font-size: 13pt; font-weight: 700; letter-spacing: 1px; margin: 6pt 0 2pt; }
.qc-sub { text-align: center; font-size: 8pt; margin-bottom: 7pt; }
.qc-meta { width: 100%; border-collapse: collapse; margin-bottom: 7pt; }
.qc-meta td { border: 0.6pt solid #000; padding: 3pt 5pt; font-size: 8.5pt; }
.qc-meta td.k { background: #eee; font-weight: 700; width: 70pt; }
.qc-tbl { width: 100%; border-collapse: collapse; }
.qc-tbl th, .qc-tbl td { border: 0.6pt solid #000; padding: 2.5pt 4pt; font-size: 8.5pt; vertical-align: top; }
.qc-tbl th { background: #ddd; font-size: 8pt; text-align: left; }
.qc-sec td { background: #f0f0f0; font-weight: 700; font-size: 8pt; letter-spacing: 0.5px; text-transform: uppercase; }
.qc-no { width: 22pt; text-align: center; }
.qc-conf { width: 52pt; text-align: center; font-weight: 700; }
.qc-rem { width: 150pt; }
.qc-box { display: inline-block; width: 9pt; height: 9pt; border: 0.8pt solid #000; }
.qc-foot { margin-top: 8pt; font-size: 8.5pt; }
.qc-sign { display: flex; gap: 30pt; margin-top: 22pt; }
.qc-sign > div { flex: 1; border-top: 0.6pt solid #000; padding-top: 3pt; font-size: 8pt; }
.qc-warn { margin-top: 6pt; border: 0.8pt solid #000; padding: 4pt 6pt; font-size: 8.5pt; }
`;

export default function QCChecksheetPrint({ apiBase = '/api/workshop' }) {
    const { inspectionId } = useParams();
    const [sheet, setSheet] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`${apiBase}/qc/${inspectionId}`)
            .then(r => { setSheet(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [inspectionId, apiBase]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!sheet) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const p = sheet.Progress || {};
    let n = 0;
    const sections = [];
    for (const row of (sheet.Results || [])) {
        const last = sections[sections.length - 1];
        if (!last || last.name !== row.Section) sections.push({ name: row.Section, rows: [row] });
        else last.rows.push(row);
    }

    return (
        <div className="qc-wrap">
            <style>{CSS}</style>
            <PrintBusinessHeader />

            <div className="qc-title">QC INSPECTION CHECKSHEET</div>
            <div className="qc-sub">To be completed before the vehicle is handed back to the customer.</div>

            <table className="qc-meta">
                <tbody>
                    <tr>
                        <td className="k">Job Card No.</td><td>{sheet.JobCardNo || '—'}</td>
                        <td className="k">Registration</td><td>{sheet.VehicleRegNo || '—'}</td>
                    </tr>
                    <tr>
                        <td className="k">Model</td><td>{sheet.VehicleModel || '—'}</td>
                        <td className="k">Odometer</td>
                        <td>{sheet.Odometer != null ? `${Number(sheet.Odometer).toLocaleString('en-PK')} km` : '—'}</td>
                    </tr>
                    <tr>
                        <td className="k">Inspected by</td><td>{sheet.InspectedByName || '—'}</td>
                        <td className="k">Date</td>
                        <td>{when(sheet.CompletedAt || sheet.StartedAt)}</td>
                    </tr>
                </tbody>
            </table>

            <table className="qc-tbl">
                <thead>
                    <tr>
                        <th className="qc-no">Sr.</th>
                        <th>Inspection Area / Point</th>
                        <th className="qc-conf">Confirmation</th>
                        <th className="qc-rem">Remarks</th>
                    </tr>
                </thead>
                <tbody>
                    {sections.map(sec => (
                        <Fragment key={sec.name}>
                            <tr className="qc-sec">
                                <td colSpan={4}>{sec.name}</td>
                            </tr>
                            {sec.rows.map(row => {
                                n += 1;
                                return (
                                    <tr key={row.ResultID}>
                                        <td className="qc-no">{n}</td>
                                        <td>{row.PointText}</td>
                                        <td className="qc-conf">
                                            {/* Untouched prints as an empty box, the way the
                                                paper sheet would — never as a pass. */}
                                            {row.Confirmed === true ? '✓'
                                                : row.Confirmed === false ? '✗'
                                                : <span className="qc-box" />}
                                        </td>
                                        <td>{row.Remarks || ''}</td>
                                    </tr>
                                );
                            })}
                        </Fragment>
                    ))}
                </tbody>
            </table>

            <div className="qc-foot">
                <b>{p.confirmed || 0}</b> confirmed
                {p.failed ? <> · <b>{p.failed}</b> not OK</> : null}
                {p.outstanding ? <> · <b>{p.outstanding}</b> not checked</> : null}
                {' '}of {p.total || 0} points.
                {sheet.Notes ? <> &nbsp;|&nbsp; {sheet.Notes}</> : null}
            </div>

            {sheet.Status === 'Completed' && p.outstanding > 0 && (
                <div className="qc-warn">
                    This sheet was completed with {p.outstanding} point{p.outstanding === 1 ? '' : 's'} left
                    unchecked. The empty boxes above were not inspected.
                </div>
            )}

            <div className="qc-sign">
                <div>Inspected By {sheet.InspectedByName ? `— ${sheet.InspectedByName}` : ''}</div>
                <div>Workshop Manager</div>
                <div>Customer</div>
            </div>
        </div>
    );
}
