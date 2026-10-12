// Builds a single-file, clickable preview of the Supply Manager with TEST data.
// The real app code and the real backend (Code.gs) run inside the page against an
// in-browser stand-in for Google Sheets/Drive/Gmail. Nothing is sent anywhere.
//   node supply/dev/build-demo.mjs out.html
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadBackend, createPlatform, CODE_PATH } from './platform.mjs';
import { seedDemo } from './seed-demo.mjs';
import { DRIVE_FILES } from '../test/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sup = path.join(here, '..');
const out = process.argv[2] || path.join(sup, 'test', 'test-output', 'supply-preview.html');
const read = (f) => fs.readFileSync(path.join(sup, f), 'utf8');

// ---- disposable history: two weeks of counts, deliveries and a request with a photo
const backend = loadBackend();
const env = createPlatform(backend, {});
backend.setPlatform_(env.platform);
seedDemo(backend, env);
const call = (action, body) => { const r = backend.handleApi_(Object.assign({ action }, body || {})); if (!r.ok) throw new Error(action + ': ' + r.error.message); return r.data; };
const token = call('adminLogin', { password: 'test-password-123' }).token;
const day = 86400000;
const now = Date.now();
const at = (msAgo) => { env.state.clock = now - msAgo; };
const bev = call('adminBev', { token }).products.filter((p) => p.active);
const ipa = bev.filter((p) => p.type === 'beer')[0];
const rootbeer = bev.filter((p) => p.type === 'craft soda')[0];
function bevWeek(msAgo, ipaCount, rbCount) {
  at(msAgo);
  call('saveCount', { kind: 'beverage', itemId: ipa.id, fullCases: ipaCount[0], looseUnits: ipaCount[1] });
  if (rbCount) call('saveCount', { kind: 'beverage', itemId: rootbeer.id, fullCases: rbCount[0], looseUnits: rbCount[1] });
  call('completeCount', { kind: 'beverage' });
}
bevWeek(21 * day, [3, 4], [2, 0]);
at(18 * day); call('adminSaveDelivery', { token, productId: ipa.id, deliveredAt: new Date(now - 18 * day).toISOString(), fullCases: 2, looseUnits: 0 });
bevWeek(14 * day, [2, 10], [1, 6]);
at(10 * day); call('adminSaveDelivery', { token, productId: rootbeer.id, deliveredAt: new Date(now - 10 * day).toISOString(), fullCases: 1, looseUnits: 0 });
call('adminSaveAdjustment', { token, productId: ipa.id, type: 'waste', at: new Date(now - 9 * day).toISOString(), units: 2, note: 'TEST dented cans' });
bevWeek(7 * day, [1, 15], null); // root beer not counted this week -> insufficient data
at(1 * day);
const items = call('adminItems', { token }).items.filter((i) => i.active);
items.forEach((it, n) => call('saveCount', { kind: it.department, itemId: it.id, fullCases: n % 3, looseUnits: '' }));
call('completeCount', { kind: 'housekeeping' });
// a supply request with a (generated) photo
function png(w, h) {
  const t = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 148; raw[o + 1] = 217 - (y >> 2); raw[o + 2] = 244 - (x >> 3); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}
const photo = call('uploadPhoto', { data: png(320, 240).toString('base64') }).photoToken;
call('submitRequest', { kind: 'supply', itemName: 'TEST Batteries AA', optionId: call('requestOptions', { kind: 'supply' }).options[0].id, quantity: 2, quantityUnit: 'packs', note: 'TEST: for the trail radios', photoTokens: [photo] });
call('submitRequest', { kind: 'drink', itemName: 'TEST Lemonade', quantity: 1, quantityUnit: 'case', note: 'TEST: cooler shelf 2' });
call('adminLogout', { token });
env.state.clock = null;
const snapshot = env.snapshot();

// ---- page
const logo = 'data:image/svg+xml;base64,' + Buffer.from(read('assets/logo-horizontal.svg')).toString('base64');
const code = fs.readFileSync(CODE_PATH, 'utf8');
const fix = (js) => js.replace(/'assets\/logo-horizontal\.svg'/g, JSON.stringify(logo)).replace(/<\/script/gi, '<\\/script');

const browserPlatform = `
(function () {
  // ---- SHA-256 / HMAC (sync, small) for the preview only
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256(bytes) {
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, m = bytes.slice(); m.push(0x80);
    while ((m.length % 64) !== 56) m.push(0);
    const bits = l * 8; for (let i = 7; i >= 0; i--) m.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
    const w = new Array(64);
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3); const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0; const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = []; H.forEach((x) => out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255)); return out;
  }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = key.concat(new Array(64 - key.length).fill(0));
    return sha256(k.map((x) => x ^ 0x5c).concat(sha256(k.map((x) => x ^ 0x36).concat(msg))));
  }
  // ---- Sheets stand-in (same behavior as dev/platform.mjs)
  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.setNumberFormat = function () { return this; };
  Range.prototype.setValues = function (v) { v.forEach((row, i) => { const rr = this.r - 1 + i; while (this.sh.data.length <= rr) this.sh.data.push([]); row.forEach((x, j) => { this.sh.data[rr][this.c - 1 + j] = x; }); }); return this; };
  Range.prototype.getValues = function () { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const x = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(x === undefined ? '' : x); } o.push(row); } return o; };
  function Sheet(name, data) { this.name = name; this.data = data || []; }
  Sheet.prototype.getLastRow = function () { return this.data.length; };
  Sheet.prototype.getDataRange = function () { const cols = Math.max(1, ...this.data.map((r) => r.length)); return new Range(this, 1, 1, Math.max(1, this.data.length), cols); };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
  Sheet.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); };
  function Spreadsheet(json) { this.sheets = {}; Object.keys(json || {}).forEach((k) => { this.sheets[k] = new Sheet(k, json[k]); }); }
  Spreadsheet.prototype.getSheetByName = function (n) { return this.sheets[n] || null; };
  Spreadsheet.prototype.insertSheet = function (n) { return (this.sheets[n] = new Sheet(n)); };

  const KEY = 'supply-preview-state-v1';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; }
  const state = saved || window.SUPPLY_PREVIEW_SEED;
  const ss = new Spreadsheet(state.sheets);
  const props = new Map(Object.entries(state.props || {}));
  const photos = new Map(Object.entries(state.photos || {}));
  const cache = new Map();
  const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const sent = [];
  function persist() {
    try {
      const sheets = {}; Object.keys(ss.sheets).forEach((k) => { sheets[k] = ss.sheets[k].data; });
      localStorage.setItem(KEY, JSON.stringify({ sheets, props: Object.fromEntries(props), photos: Object.fromEntries(photos) }));
    } catch (e) { /* preview still works, it just forgets on reload */ }
  }
  setPlatform_({
    store: new SheetStore(ss, true),
    props: { get: (k) => (props.has(k) ? props.get(k) : null), set: (k, v) => props.set(k, String(v)), del: (k) => props.delete(k), keys: () => [...props.keys()] },
    cache: { get: (k) => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; }, put: (k, v, s) => cache.set(k, { v, exp: Date.now() + s * 1000 }) },
    withLock: (fn) => { const r = fn(); persist(); return r; },
    now: () => new Date(),
    uuid: () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3) | 8).toString(16); })),
    hmacSha256: hmac, sha256,
    localParts: (date, tz) => { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(date).forEach((x) => { p[x.type] = x.value; }); return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, wd: WD[p.weekday] }; },
    photos: { save: (b64, mime, name) => { const id = 'file-' + Date.now() + Math.random(); photos.set(id, { data: b64, mime, name }); return id; }, read: (id) => ({ data: photos.get(id).data }), trash: (id) => photos.delete(id) },
    mail: { remaining: () => 100, send: (m) => { sent.push(m); } }, // preview: emails are recorded, never sent
    drive: { readSpreadsheet: (id) => { const f = window.SUPPLY_PREVIEW_DRIVE[id]; if (!f || !f.tabs) throw new Error('not found'); return f.tabs; }, readText: (id) => { const f = window.SUPPLY_PREVIEW_DRIVE[id]; if (!f) throw new Error('not found'); return f.text; } },
    log: (m) => console.log(m),
  });
  window.SUPPLY_LOCAL_API = (payload) => new Promise((res) => setTimeout(() => res(JSON.parse(JSON.stringify(handleApi_(JSON.parse(JSON.stringify(payload)))))), 250));
  window.resetSupplyPreview = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } try { sessionStorage.clear(); } catch (e) { /* ignore */ } location.hash = '#/'; location.reload(); };
})();
`;

const html = `<title>Lapland Lake Supply Manager</title>
<meta name="color-scheme" content="light">
<style>
${read('styles.css')}
.preview-bar { background: #10282b; color: #fff; font-size: 0.85rem; padding: 8px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.preview-bar b { color: #fab20b; }
.preview-bar button { background: transparent; color: #fff; border: 1px solid #94d9f4; border-radius: 999px; padding: 4px 12px; font: inherit; cursor: pointer; min-height: 36px; }
</style>
<div class="preview-bar" role="note"><span><b>Preview with TEST data.</b> Everything stays in this browser. No emails or orders are sent. Admin password: <code>test-password-123</code></span><button type="button" onclick="resetSupplyPreview()">Reset preview</button></div>
<main id="app" aria-live="polite"><p class="wrap">Loading…</p></main>
<script>var module = undefined; window.SUPPLY_CONFIG = { apiUrl: 'preview' };
window.SUPPLY_PREVIEW_SEED = ${JSON.stringify(snapshot)};
window.SUPPLY_PREVIEW_DRIVE = ${JSON.stringify(DRIVE_FILES)};</script>
<script>${fix(code)}</script>
<script>${fix(browserPlatform)}</script>
<script>${fix(read('app.js'))}</script>
<script>${fix(read('charts.js'))}</script>
<script>${fix(read('admin.js'))}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
