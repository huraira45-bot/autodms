# Job-card credit invoice Office exports

Open a finalized job card and click **Invoice exports**. The credit invoice opens as a preview with **Print Invoice**, **Export Word**, and **Export Excel** buttons. The existing Print -> Credit Invoice flow continues to auto-print; the preview route uses `?preview=1` to avoid opening the print dialog before downloading.

Word downloads a native editable `.docx`. Excel downloads a native `.xlsx`. Both contain the current invoice's customer/party details, party NTN, vehicle, jobs, sublet, spares, tax/depreciation totals and signatures. Word includes the configured business text header and an optional PNG/JPEG logo.

The invoice uses the existing `invoice-data` API's resolved Recipient for the party NTN and party name. This follows the linked party / type-receivable claim party resolution used by the tax invoices. Missing NTN stays blank in exports. Excel keeps NTN and item codes as text, including leading zeros, while quantities and financial amounts remain numeric. Exported values are snapshots of the displayed invoice; no accounting record is edited.

The existing Job Card Register Excel/CSV export also includes a **Party NTN** column, populated from `gen_PartiesInfo.NTNNO` through `CreditPartyNTN`. Its other columns and filters remain unchanged.

No dependency installation or database migration is required. The browser builds standards-based Office ZIP packages in `creditInvoiceOffice.js`.

Verification: production frontend build passed; `node Software/scripts/verify-credit-invoice-exports.mjs` independently checked archive CRCs, XML, Word content/embedded logo, Excel round-trip values and text identifiers, empty fields, literal formula-like text, and Job Card Register column alignment. The validation script uses the existing backend xlsx development dependency and local Python. No real invoice was exported during validation, and desktop Word/browser interaction was not performed.

Run this line in Command Prompt on the live server:

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Refresh the application with Ctrl+F5 after deployment.
