/**
 * Makes the certificate the tablets need.
 *
 *   node scripts/make_tls_cert.js                      # server's own LAN IPs
 *   node scripts/make_tls_cert.js 192.168.3.10 dms.local
 *
 * Chrome will only install a page as an app — the thing that removes the
 * address bar and the tabs — over HTTPS. On a workshop LAN there is no public
 * hostname to get a certificate for, so DealerDesk signs its own:
 *
 *   certs/dealerdesk-ca.crt      install this once on each tablet
 *   certs/dealerdesk-ca.key      NEVER leaves the server (it can mint certs)
 *   certs/dealerdesk-server.crt  what the HTTPS port presents
 *   certs/dealerdesk-server.key  ditto
 *
 * The CA is reused if it already exists, so re-running this to add an address
 * does NOT mean re-installing anything on the tablets.
 *
 * Every address the tablets might type has to be listed — Android ignores the
 * certificate's common name and looks only at the subjectAltName list. Ten
 * year lifetimes are fine here: Chrome's 398-day cap applies to publicly
 * trusted roots, not to one you installed yourself.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CERT_DIR = process.env.TLS_DIR || path.join(__dirname, '..', 'certs');
const CA_CRT = path.join(CERT_DIR, 'dealerdesk-ca.crt');
const CA_KEY = path.join(CERT_DIR, 'dealerdesk-ca.key');
const SRV_CRT = path.join(CERT_DIR, 'dealerdesk-server.crt');
const SRV_KEY = path.join(CERT_DIR, 'dealerdesk-server.key');
const DAYS = 3650;

/**
 * Finds openssl. On the live server this runs in cmd.exe, where Git for
 * Windows' copy is installed but not on the PATH, so look there too rather
 * than failing on a machine that has it.
 */
function findOpenssl() {
    const candidates = [
        process.env.OPENSSL_BIN,
        'openssl',
        // Forward slashes on purpose — Windows accepts them and they keep
        // this list readable.
        'C:/Program Files/Git/usr/bin/openssl.exe',
        'C:/Program Files (x86)/Git/usr/bin/openssl.exe',
        'C:/Program Files/Git/mingw64/bin/openssl.exe',
        'C:/Program Files/OpenSSL-Win64/bin/openssl.exe',
    ].filter(Boolean);
    for (const bin of candidates) {
        try {
            execFileSync(bin, ['version'], { stdio: 'pipe' });
            return bin;
        } catch { /* not here — try the next */ }
    }
    return null;
}

const OPENSSL = findOpenssl();
const openssl = (args, opts = {}) => execFileSync(OPENSSL, args, { stdio: 'pipe', ...opts });

/** Every IPv4 address this machine answers on, so the cert covers them all. */
const localIPs = () => Object.values(os.networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal)
    .map(n => n.address);

const extra = process.argv.slice(2);
const ips = [...new Set(['127.0.0.1', ...localIPs(), ...extra.filter(a => /^\d+\.\d+\.\d+\.\d+$/.test(a))])];
const hosts = [...new Set(['localhost', ...extra.filter(a => !/^\d+\.\d+\.\d+\.\d+$/.test(a))])];

fs.mkdirSync(CERT_DIR, { recursive: true });

if (!OPENSSL) {
    console.error([
        'Could not find openssl.',
        '',
        'Git for Windows ships a copy. If Git is installed somewhere unusual,',
        'point at it directly, e.g.:',
        '  set OPENSSL_BIN=C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
        '  node scripts\\make_tls_cert.js 192.168.3.10',
    ].join('\n'));
    process.exit(1);
}
console.log(`Using ${OPENSSL}`);

// ---- the CA: made once, then left alone ----
if (fs.existsSync(CA_CRT) && fs.existsSync(CA_KEY)) {
    console.log('Reusing the existing CA — nothing to re-install on the tablets.');
} else {
    console.log('Creating the DealerDesk local CA…');
    openssl(['genrsa', '-out', CA_KEY, '4096']);
    openssl(['req', '-x509', '-new', '-nodes', '-key', CA_KEY, '-sha256', '-days', String(DAYS),
             '-out', CA_CRT,
             '-subj', '/CN=DealerDesk Local CA/O=Changan Multan Motors',
             '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
             '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
}

// ---- the server certificate, reissued whenever the addresses change ----
const san = [...hosts.map(h => `DNS:${h}`), ...ips.map(i => `IP:${i}`)].join(',');
const extFile = path.join(CERT_DIR, 'server.ext.cnf');
fs.writeFileSync(extFile, [
    'basicConstraints=CA:FALSE',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=${san}`,
    '',
].join('\n'));

const csr = path.join(CERT_DIR, 'server.csr');
console.log(`Issuing a server certificate for ${san}`);
openssl(['genrsa', '-out', SRV_KEY, '2048']);
openssl(['req', '-new', '-key', SRV_KEY, '-out', csr, '-subj', '/CN=DealerDesk/O=Changan Multan Motors']);
openssl(['x509', '-req', '-in', csr, '-CA', CA_CRT, '-CAkey', CA_KEY, '-CAcreateserial',
         '-out', SRV_CRT, '-days', String(DAYS), '-sha256', '-extfile', extFile]);
fs.unlinkSync(csr);
fs.unlinkSync(extFile);

const expires = openssl(['x509', '-in', SRV_CRT, '-noout', '-enddate']).toString().trim().split('=')[1];
console.log(`
Done. Certificates are in ${CERT_DIR}

  Restart DealerDesk and it will open the HTTPS port as well as the usual one.
  Then, once per tablet, copy dealerdesk-ca.crt across and install it:
      Settings > Security > Encryption & credentials > Install a certificate > CA certificate

  Valid until ${expires}
`);
