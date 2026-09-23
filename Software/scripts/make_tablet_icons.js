/**
 * Generates the home-screen icons for the service tablet app.
 *
 *   node scripts/make_tablet_icons.js
 *
 * Writes frontend/public/tablet-icon-{192,512}.png plus a maskable 512 (the
 * glyph pulled into the safe zone, so Android can crop it to whatever shape
 * the launcher uses).
 *
 * Drawn in code with zlib rather than with an image library: there is no image
 * tooling on the server, and this way the icon can be recoloured or resized in
 * seconds. The mark is the same one the tablet app wears in its bar and on its
 * sign-in card — a white wrench on the DealerDesk aubergine.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'frontend', 'public');
const BRAND = [0x71, 0x4b, 0x67];   // #714b67, T.brand in tablet/tabletStyles.js
const WHITE = [255, 255, 255];
const SS = 4;                       // subsamples per axis — smooth edges

// ---------- a tiny PNG writer (RGBA, no dependencies) ----------
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
};
function writePNG(file, size, pixels) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;    // 8 bits per channel
    ihdr[9] = 6;    // colour type 6 = RGBA
    const stride = size * 4 + 1;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0;        // filter: none
        pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
    }
    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]));
}

// ---------- shapes, in 0..1 of the icon's width ----------
const insideRoundedRect = (x, y, x0, y0, w, h, r) => {
    if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
    const dx = Math.max(x0 + r - x, x - (x0 + w - r), 0);
    const dy = Math.max(y0 + r - y, y - (y0 + h - r), 0);
    return dx * dx + dy * dy <= r * r;
};
const insideCapsule = (x, y, ax, ay, bx, by, halfW) => {
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
    return dx * dx + dy * dy <= halfW * halfW;
};
/** Ring with a wedge cut out of it — the open jaws of a spanner. */
const insideOpenRing = (x, y, cx, cy, rOuter, rInner, jawDir, jawHalf) => {
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > rOuter || d < rInner) return false;
    let a = Math.atan2(dy, dx) - jawDir;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return Math.abs(a) > jawHalf;          // outside the jaw opening
};

/** The wrench, as a predicate on normalised coordinates. */
const inWrench = (x, y) => {
    const HEAD = { cx: 0.645, cy: 0.352, ro: 0.208, ri: 0.104 };
    // Jaws open up and to the right, away from the handle.
    if (insideOpenRing(x, y, HEAD.cx, HEAD.cy, HEAD.ro, HEAD.ri, -Math.PI / 4, 0.60)) return true;
    // Handle: down-left from the head's outer rim to the bottom-left corner.
    return insideCapsule(x, y, 0.515, 0.482, 0.250, 0.747, 0.074);
};

const draw = (size, { maskable = false, square = false }) => {
    const px = Buffer.alloc(size * size * 4);
    // Maskable icons must survive an aggressive crop: keep the glyph inside
    // the middle 80%, and let the background bleed to every edge. iOS rounds
    // the corners itself, so its icon is square too — a transparent corner
    // there shows up black on the home screen.
    const glyphScale = maskable ? 0.76 : 1;
    const bgRadius = (maskable || square) ? 0 : 0.215;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let bg = 0, fg = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const u = (x + (sx + 0.5) / SS) / size;
                    const v = (y + (sy + 0.5) / SS) / size;
                    if (insideRoundedRect(u, v, 0, 0, 1, 1, bgRadius)) bg++;
                    const gu = 0.5 + (u - 0.5) / glyphScale;
                    const gv = 0.5 + (v - 0.5) / glyphScale;
                    if (inWrench(gu, gv)) fg++;
                }
            }
            const n = SS * SS;
            const alpha = bg / n;                       // the tile itself
            const glyph = Math.min(fg / n, alpha);      // never outside the tile
            const i = (y * size + x) * 4;
            for (let c = 0; c < 3; c++) {
                px[i + c] = alpha > 0
                    ? Math.round((BRAND[c] * (alpha - glyph) + WHITE[c] * glyph) / alpha)
                    : 0;
            }
            px[i + 3] = Math.round(alpha * 255);
        }
    }
    return px;
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size, opts] of [
    ['tablet-icon-192.png', 192, {}],
    ['tablet-icon-512.png', 512, {}],
    ['tablet-icon-maskable-512.png', 512, { maskable: true }],
    ['tablet-icon-apple-180.png', 180, { square: true }],
]) {
    const file = path.join(OUT_DIR, name);
    writePNG(file, size, draw(size, opts));
    console.log(`${name.padEnd(30)} ${fs.statSync(file).size} bytes`);
}
console.log('\nicons written to frontend/public/');
