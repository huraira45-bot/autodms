# Putting DealerDesk on a tablet with no browser showing

The service tablet can run full screen — no address bar, no tabs, its own icon
in the launcher. Chrome only does that for a page it has *installed*, and it
only installs pages served over HTTPS. So DealerDesk now listens on a second,
encrypted port (5443) alongside the ordinary one (5000), using a certificate it
signs itself.

Because DealerDesk signs that certificate rather than a company like GoDaddy,
each tablet has to be told once that DealerDesk can be trusted. That is the
only extra step, it takes about two minutes per tablet, and it never has to be
repeated — the certificate is good until 2036.

The desktop ERP is unaffected. It keeps using `http://192.168.3.10:5000`
exactly as it does today.

---

## Part 1 — on the server, once

**1. Make the certificate.** In a command prompt:

```
cd /d "D:\saher 2.0\autodms\Software"
node scripts\make_tls_cert.js 192.168.3.10
```

It prints where it put the files and when they expire. The private keys stay in
`Software\certs\` and are deliberately excluded from git — they never travel.

**2. Open the port.** In a command prompt **run as Administrator**:

```
netsh advfirewall firewall add rule name="DealerDesk tablets (TCP 5443)" dir=in action=allow protocol=TCP localport=5443 remoteip=localsubnet profile=domain,private
```

`remoteip=localsubnet` keeps the port reachable only from the workshop network.

**3. Restart DealerDesk.**

```
cd /d "D:\saher 2.0\autodms" && git pull && cd Software && cd frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env
```

The log should now say `HTTPS is running on port 5443`. If instead it says
`no certificate` , step 1 did not run in the right folder.

---

## Part 2 — on each tablet, once

**1. Download the certificate.** Open Chrome on the tablet and go to:

```
http://192.168.3.10:5000/dealerdesk-ca.crt
```

Chrome saves it to Downloads. (This one file is served unencrypted on purpose —
the tablet cannot trust the encrypted port until it has it.)

**2. Install it.** Android hides this in a different place on nearly every
version. Try:

> Settings → Security → *More security settings* → Encryption & credentials →
> Install a certificate → **CA certificate** → *Install anyway* → pick
> **dealerdesk-ca.crt** from Downloads

If you cannot find it, search the Settings app for **"certificate"**.

Android will warn that a third party may be able to monitor the network. That
warning is normal and appears for every privately installed certificate; you may
also get a standing notification saying the network may be monitored.

**3. Open the app over HTTPS.**

```
https://192.168.3.10:5443/tablet
```

You should see a padlock and no warning. If you get "Your connection is not
private", step 2 did not take — see below.

**4. Install it.** Chrome menu ⋮ → **Install and create shortcut** → *Install*
(older Chrome calls this *Add to Home screen*). Choose **Install**, not
*Create shortcut* — only Install removes the browser.

It now opens full screen from the launcher icon.

**5. Delete the old icon** if the tablet still has the HTTP shortcut from
before, so nobody opens the wrong one.

---

## If something goes wrong

**"Your connection is not private" / NET::ERR_CERT_AUTHORITY_INVALID**
The certificate did not install, or it went into the wrong store. Redo Part 2
step 2 and make sure you pick **CA certificate**, not "VPN and app user
certificate".

**"Your connection is not private" naming a different address**
The certificate only covers the addresses it was built for. If the server's IP
has changed, re-run step 1 with the new address — the trust installed on the
tablets still holds, so nothing needs redoing on them:

```
node scripts\make_tls_cert.js 192.168.3.10 192.168.3.55
```

**The menu offers only "Create shortcut", never "Install"**
Chrome did not consider the page installable. Check the address really is
`https://` , and that `https://192.168.3.10:5443/tablet-sw.js` loads.

**The page will not load at all over 5443**
The firewall rule (Part 1 step 2) did not get added, or was added without
Administrator rights.

**Everything still works on `http://…:5000`.** Nothing was taken away — the old
address remains for the desktop ERP and as a fallback if a tablet has trouble.
