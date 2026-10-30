# Scan Sales documents with the Canon DR-M160II

The scanner is connected by USB to the **Sales desk PC**, as confirmed by the user. Scanning runs on that PC; the app server receives temporary copies for review. No scanner subscription, database migration or new server dependency is required. Canon supplies a TWAIN driver and NAPS2 provides the scan command. See [Canon driver support](https://my.canon/en/support/0101031719?model=DR-M160+II), [NAPS2 download](https://www.naps2.com/download), and [NAPS2 command-line documentation](https://www.naps2.com/doc/command-line).

## Server update

Run in Command Prompt on the server after the commit is pushed:

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Refresh AutoDMS with Ctrl+F5. This update does not run the earlier salary migration or archive utility; those remain separate deployment steps.

## One-time setup on the Sales desk PC

1. Install the Canon DR-M160II ISIS/TWAIN driver and connect the scanner by USB.
2. Install NAPS2 from its official download page. Confirm a feeder scan works in NAPS2 using the Canon TWAIN device. Choose the version for the Sales PC's Windows version; the current NAPS2 release targets Windows 10/11. The helper requires Windows PowerShell 5.1.
3. In AutoDMS, open a booking's **Documents** panel (or the new booking form), click **Scanner setup**, then **Download scanner helper**.
4. Run the downloaded `Install-AutoDMSScanner.ps1` as the Windows user who uses AutoDMS. Right-click and choose **Run with PowerShell**, or run:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\Downloads\Install-AutoDMSScanner.ps1"
```

5. The installer registers `autodms-scan:` for the current Windows user and saves the helper/configuration under `%LOCALAPPDATA%\AutoDMSScanner`. No always-running service or local listening port is installed. The destination server is fixed in this local configuration, not accepted from a scan launch link.

If NAPS2 is portable, pass `-Naps2Path "C:\your folder\NAPS2.Console.exe"`. If a different device name or a saved NAPS2 profile is needed, pass `-Device "your TWAIN device name"` or `-ScannerProfile "profile name"` when installing. `NAPS2.Console.exe --listdevices --driver twain` lists devices. The default device match is `DR-M160`; the default is a 300 DPI, A4, color TWAIN scan with deskew. A saved profile can supply device-specific size/blank-page settings. Editing the local `config.json` is also supported for these settings. No drivers or NAPS2 executables are bundled or automatically downloaded.

### Updating an existing helper after the scanner-busy fix

The first helper held its hardware lock during uploads and error dialogs. The corrected helper releases the lock immediately when NAPS2 exits, before checking results, uploading pages, reporting errors or showing a dialog. A genuinely active scan still blocks a second scan. Windows abandoned-mutex ownership is handled explicitly.

1. On the Sales PC, close old **AutoDMS Scanner** error windows. Finish/cancel any running NAPS2 scan before retrying; do not terminate unrelated PowerShell processes.
2. Update source on the server (this helper-only fix needs no frontend build or database migration):

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

3. On the Sales PC, download a fresh helper from **Documents > Scanner setup > Download scanner helper**, then right-click that newly downloaded file and choose **Run with PowerShell**. Existing NAPS2 executable/device/profile settings are preserved unless explicitly overridden. Updating the server alone does not replace the installed PC helper.
4. In AutoDMS, click **Cancel scan** for the old attempt, load the feeder and start a new scan.

## Daily use

1. Put the batch in the feeder and open the correct booking (or a new booking form).
2. Click **Scan Documents**. **Both sides** is enabled by default; turn it off for a single-sided batch. Allow the browser to open AutoDMS Scanner. The first use may show a browser confirmation; select its always-allow option if offered.
3. Scanning consumes the feeder batch. Each page returns as a separate preview in the existing document upload area. Click a thumbnail for the full image.
4. Choose **PBO**, **CNIC**, **Authority letter**, **Proof of payment** (where available), or **Other** for each page, and edit its description. Scanned pages deliberately start without a document type. Remove blank/unwanted pages before saving.
5. On an existing booking, click **Upload documents** after classification. On a new booking, the classified files upload after the booking is created. Booking/invoice submission waits while scanning is active. Scan completion alone does not attach paperwork or record a payment.

In **Record Master Invoice**, the same scan button returns the feeder batch as **one PDF**. Enter the invoice number/date and click the existing **Upload and save invoice** button. Scanning does not bypass invoice requirements, permissions or existing Master incentive rules.

## Limits and recovery

- Standard batch: up to 100 page images, 10 MB per page, 200 MB in total. Master invoice PDF: one file up to 10 MB, matching the existing upload limit.
- Temporary sessions expire after 30 minutes. The server uses the existing single-process PM2 configuration. A server restart expires active scans; start a new batch if this happens.
- If the browser did not open the helper, use **Open scanner** or complete the setup. **Retry receiving pages** retries a completed scan's transfer without scanning again.
- If AutoDMS says **Open Manage scans and cancel an old attempt**, click **Manage scans** beside the scan button. It lists your own attempts, including those left by a browser refresh, with status/file count/expiry. **Cancel attempt** removes only that selected temporary draft and frees its slot. Attempts with pages are retained until you cancel or they expire. Empty failed attempts are automatically cleared when you start a new scan. The limit screen opens this list automatically. Cancellation errors stay visible instead of silently losing the current attempt.
- **Cancel scan** removes/revokes the server draft. It does not forcibly stop scanner hardware already feeding; cancel NAPS2's progress dialog if necessary.
- Successful helper runs delete their local temporary files. A failed run preserves files/logs under `%TEMP%\AutoDMSScanner\<session-id>` and shows the recovery folder. They can be uploaded manually using the existing file picker.
- Temporary server drafts are under `Software/.scanner-temp`, outside the public uploads mount and excluded from Git. Only the owning signed-in user can read them. They are removed after transfer/cancellation or cleaned up after expiry. Restart-orphaned folders are cleaned after their expiry window.
- The helper receives an unpredictable, short-lived **one-batch upload key**, not the user's login token. It cannot read bookings, attach final documents or post financial entries. Existing Sales document/invoice upload permissions remain authoritative.

## Verification

`npm test -- --runInBand __tests__/scannerSession.test.js` covers scoped keys/owner access, replay prevention, page order/count/type/signature/size limits, missing pages, expiration/cancellation/path containment, quota concurrency and roles.

The session-recovery update changes the browser and server: run the full **Server update** command above, including the frontend build, then refresh with Ctrl+F5. It does not change the local helper. If Windows blocks the downloaded installer, launch it with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\DELL\Downloads\Install-AutoDMSScanner (2).ps1"` using the actual downloaded filename. This sets policy only for that process.

On Windows, `node scripts/verify-scanner-helper.js` runs the real PowerShell worker and HTTP routes against a synthetic scanner executable with an isolated test mutex. It checks JPEG/PDF and saved-profile paths, downloads, error recovery and cleanup. Concurrency checks prove that stalled page uploads and error reporting release the scanner, while an active feeder retains its lock even if the browser cancels its draft; later scans recover. It also checks abandoned-mutex recovery and executes the downloaded installer with an isolated user folder/intercepted registry commands to verify settings survive updates and explicit overrides work. It does not register protocols, install programs, use SQL Server or touch a physical scanner. The Canon hardware and the actual Sales browser still require an on-site check.
