/**
 * CRO in-app notifications — insertion helper.
 *
 * Writes rows to dms_CRO_Notifications. Used by:
 *   - croComplaintService.createComplaint  (L0 fan-out to Service Advisor + BU Manager)
 *   - escalationCron.applyEscalation       (L1/L2 fan-out to newcomers at each level)
 *
 * Caller must pass an open sql.Transaction so notification inserts share atomicity
 * with the complaint/escalation row they belong to. We do NOT begin/commit here.
 */
const { sql } = require('../config/db');

/**
 * Insert one notification per recipient.
 * - recipientEmployeeIds: array of EmployeeIDs. Null/undefined entries are filtered.
 * - Duplicates within the array are deduped.
 */
async function emitNotifications(tx, complaint, recipientEmployeeIds, opts) {
    const list = [...new Set((recipientEmployeeIds || []).filter(x => x))];
    if (!list.length) return 0;

    const subject = opts.subject;
    const body    = opts.body;
    const link    = opts.link || `/cro/complaints/${complaint.ComplaintID}`;
    const sourceType = opts.sourceType || 'Complaint';

    for (const empId of list) {
        await new sql.Request(tx)
            .input('emp',   sql.Int,            empId)
            .input('subj',  sql.NVarChar(200),  subject)
            .input('body',  sql.NVarChar(sql.MAX), body)
            .input('link',  sql.NVarChar(500),  link)
            .input('stype', sql.NVarChar(30),   sourceType)
            .input('sid',   sql.Int,            complaint.ComplaintID)
            .query(`
                INSERT INTO dms_CRO_Notifications
                    (RecipientEmployeeID, Channel, Subject, Body, LinkURL, SourceType, SourceID, SentAt)
                VALUES (@emp, 'InApp', @subj, @body, @link, @stype, @sid, GETDATE())
            `);
    }
    return list.length;
}

module.exports = { emitNotifications };
