# Post an existing Cash Paint GRN to a supplier

Open a **Posted** Cash Paint GRN and choose **Post to party**. Select a Paint Lab supplier and press **Post PKR … to party**. For PGRN-0075 this is PKR 35,810. The supplier must have a linked GL account and Paint Lab business access.

The action changes the header to Credit, assigns the supplier, and creates the normal posted Paint GRN purchase voucher and party subsidiary payable. It appears in the supplier ledger and Make Payment through the existing PAINT_GRN source. The financial journal uses the usual paint inventory, GST, AIT and discount accounts. Stock quantities, average costs, stock ledger entries and GRN lines are not rewritten. Original receipt status, date and finalization details remain intact.

The endpoint is `POST /api/paint/grn/:id/post-to-party`, body `{ "PartyID": 123 }`, protected by `paint_lab_grn:edit`. All changes share one transaction and the GRN header is locked. Duplicate calls, existing financial vouchers, non-Cash/non-Posted GRNs, invalid totals and any return document are rejected. Return creation also locks the source GRN so it cannot race with supplier conversion. The voucher records the actor and conversion from Cash, including the previous party ID. Failure rolls back the header, voucher and subsidiary ledger together.

No migration or new dependency is required. Deploy from the live server's Command Prompt:

```cmd
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Refresh with Ctrl+F5. Use **Post to party** directly on the posted receipt.

Validation: 21 feature tests pass, production frontend build passes, and the local SQL verification confirms a real balanced PKR 35,810 payable with all inventory rows/details identical, then rolls back every fixture and journal. Run the latter only against the development database with `node scripts/verify-paint-grn-party-posting.js`; it refuses a remote DB connection and avoids consuming a real voucher number. Full Jest run: 16 suites/290 tests pass; 4 existing suites fail on missing party/vendor GL fixtures in payment, store sale, job card and GRTN journal tests. Those builders and tests are unchanged. Browser interaction was not tested.

The live read-only investigation confirmed PGRN-0075 (PaintGRNID 27) is Posted/CASH, has no party or voucher, total 35,810, and has no returns. No live supplier was assigned and no live financial or stock records were changed by the agent.
