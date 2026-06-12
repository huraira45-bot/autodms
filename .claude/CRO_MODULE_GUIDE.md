# CRO Module — Operator's Guide

A short map of what's where, what it does, and how it's wired. Read this before changing the CRO module so you don't break the chain of post-commit hooks and auto-triggers.

## 1. Page map (sidebar — "CUSTOMER RELATION")

| Page | Route | Module key | What it does |
|---|---|---|---|
| Follow-Ups | `/crd/follow-ups` | `crd_followups` | Daily out-bound check-in queue. One row auto-created per JC finalize. Take satisfaction survey inline during the call. Outcome=Complaint converts into a CRO complaint (linked back). |
| CRO Workspace | `/cro/workspace` | `cro_workspace` | Complaint inbox. KPIs, filters, "Assigned to me". |
| Complaint Detail | `/cro/complaints/:id` | `cro_workspace` | Action timeline, screenshots, resolve / record verdict / escalate / reassign. |
| Surveys | `/cro/surveys` | `cro_workspace` | List all surveys. Create manually, copy public link, capture by phone, edit responses, delete. |
| Survey Templates | `/cro/survey-templates` | `cro_admin` | CRUD over question sets. Activating a template auto-deactivates the previous version. |
| Service Reminders | `/cro/reminders` | `cro_workspace` | Upcoming service queue. Auto-generated when JC finalizes; daily 09:00 cron flips to Sent on due date. |
| KYC Flags | `/cro/kyc-flags` | `cro_workspace` | Tag chronic / payment-risk / VIP chassis. Banner appears on JobCardForm; advisor must acknowledge before save. |
| Inquiries | `/cro/inquiries` | `cro_workspace` | Walk-in / phone / online questions. Category routes to a department. Convertable to complaint. |
| Campaigns | `/cro/campaigns` | `cro_admin` (create), `cro_workspace`/`cro_reports` (view) | Bulk WhatsApp blasts. Segment-rule builder, recipient preview, template editor, throttled background send. |
| CRO Reports | `/cro/reports` | `cro_reports` | **13 reports — all tiers complete** (v1 5/5 · v2 5/5 · v3 3/3). |
| Survey (public) | `/survey/:token` | none | Mobile-friendly customer-facing form. No auth. |

## 2. Auto-trigger chain (the "magic" that fires on a JC finalize / complaint close)

```
JC finalize  ──┬──→  CRD follow-up row              (dms_CRDFollowUps)
               ├──→  PostJobCard survey              (dms_CRO_Surveys, status=Triggered)
               └──→  Service reminder                (dms_CRO_ServiceReminders, status=Scheduled)
                     └─ daily cron 09:00 flips Scheduled → Sent when DueDate hits

Complaint create  ──→  L0 notifications to Service Advisor + BU Manager (dms_CRO_Notifications)

Complaint open + 72h elapsed  ──→  L1 escalation (cron @ */15min)
   └─ Critical: 36h, Low: 144h. CRO Manager added to recipients.
Complaint open + 96h elapsed  ──→  L2 escalation. Executive added.

Complaint verdict=Satisfied  ──→  Closed + PostComplaint survey auto-created
Complaint verdict=NotSatisfied ──→  Forced L2 + ReOpened action
```

All post-commit hooks are best-effort — failures here MUST NOT roll back the finalize/close. Errors land in console only.

## 3. Services & cron jobs

| Service | What | When |
|---|---|---|
| `services/croComplaintService.js` | `createComplaint(input, user, tx?)` — shared between controller and CRD bridge | On-demand |
| `services/croSurveyService.js` | `createSurvey`, `triggerPostJobCard`, `triggerPostComplaint`, `recordResponse` | On-demand + post-commit hooks |
| `services/croReminderService.js` | `generateForJobCard(jcId)`, `computeKmPerDay`, `computeNextReminder` | Post-commit + daily cron |
| `services/croNotificationService.js` | `emitNotifications(tx, complaint, recipientIds, opts)` | Inside complaint create + escalation tick |
| `services/escalationEngine.js` | Pure: `evaluateComplaint`, `resolveRecipients`, `thresholdHours` | Called by cron |
| `services/escalationCron.js` | `node-cron` `*/15 * * * *` | Always-on |
| `services/reminderCron.js` | `node-cron` `0 9 * * *` (configurable via `REMINDER_CRON`) | Always-on |
| `services/twilioWhatsAppService.js` | `sendTemplate`, `sendText`, `sendMedia`, `verifyWebhookSignature` | On-demand (stub mode when env keys missing) |
| `services/croCampaignService.js` | `previewSegment`, `executeCampaign`, `buildSegmentSQL` | On-demand (segment preview + throttled send) |

## 4. Going live with Twilio

Stub mode is the default — every outbound call logs to `dms_CRO_WhatsAppMessages` with a fake SID but no HTTP call. To switch to live:

1. `.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   PUBLIC_API_BASE=https://your-public-host.example.com
   ```
2. In Twilio Console → WhatsApp Sandbox / Sender → set:
   - **When a message comes in**: `POST {PUBLIC_API_BASE}/api/cro/whatsapp/inbound`
   - **Status callback URL**: `POST {PUBLIC_API_BASE}/api/cro/whatsapp/status`
3. Restart the server. Log line should switch from "Running in STUB mode" to "Live mode — Twilio client initialized for whatsapp:+...".

Signature verification: enabled automatically when `IS_STUB=false`. Webhooks return 403 if the X-Twilio-Signature header is missing/invalid.

## 5. RBAC — module keys

| Key | Purpose |
|---|---|
| `cro_workspace` | Day-to-day use: file/view/verify complaints, work surveys, work reminders, log inquiries, raise KYC flags |
| `cro_admin` | Manager-level: manual escalation, override WhatsApp-proof gate, delete surveys / KYC flags, resolve KYC, edit templates, run debug endpoints |
| `cro_dept_responder` | For Service Advisor / BU Manager roles — read assigned complaints, mark resolved, upload screenshots |
| `cro_reports` | Read-only access to `/cro/reports` |

Grant in `/admin/permissions` per role.

## 6. Tests

| Suite | What |
|---|---|
| `__tests__/escalationEngine.test.js` | 22 tests — threshold lookup, evaluateComplaint, recipient resolution, severity multipliers |
| `__tests__/reminderEngine.test.js` | 8 tests — ladder rules, km-vs-time picker, edge cases |

Run: `cd Software && npx jest`. Currently 130/130 green.

## 7. Known gaps / deferred

- **None within CRO scope.** All 13 reports shipped. Twilio go-live pending discussion (see `memory/project_twilio_pending.md`).
- **Real Twilio template SIDs** — when going live, swap the placeholder template names in any code that calls `sendTemplate({ templateSid, ... })` with the SIDs from your Twilio Content Builder.
- **Holiday / business-day handling** in escalation engine — currently assumes 7-day operation per `cro-module-design.md` §9.

## 8. Useful debug endpoints (cro_admin)

| | |
|---|---|
| `POST /api/cro/debug/escalation-tick` | Fire one escalation tick immediately |
| `POST /api/cro/reminders/debug/tick`   | Fire one reminder tick immediately |
| `POST /api/cro/reminders/regenerate`   | Back-fill reminders for finalized JCs without one |
