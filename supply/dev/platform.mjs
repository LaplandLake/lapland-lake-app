// Runs supply/backend/Code.gs in Node for tests and the local preview server.
// Google services are replaced by small in-memory fakes; the SheetStore code that talks
// to "Google Sheets" is the real one from Code.gs, running against FakeSpreadsheet.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CODE_PATH = path.join(here, '..', 'backend', 'Code.gs');

export function loadBackend() {
  const ctx = { console, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), ctx, { filename: 'Code.gs' });
  return ctx.module.exports;
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) throw new Error('setValues: size mismatch');
    vals.forEach((row, i) => {
      const rr = this.r - 1 + i;
      while (this.sheet.data.length <= rr) this.sheet.data.push([]);
      row.forEach((v, j) => {
        if (typeof v !== 'string') throw new Error('Store wrote a non-string value: ' + v);
        if (v.length > 50000) throw new Error('Cell over 50,000 characters');
        this.sheet.data[rr][this.c - 1 + j] = v;
      });
    });
    return this;
  }
  setNumberFormat() { return this; }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
}

class FakeSheet {
  constructor(name, data) { this.name = name; this.data = data || []; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getDataRange() {
    if (!this.data.length) return new FakeRange(this, 1, 1, 1, 1);
    return new FakeRange(this, 1, 1, this.data.length, Math.max(1, this.getLastColumn()));
  }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr || 1, nc || 1); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
}

export class FakeSpreadsheet {
  constructor(json) {
    this.sheets = {};
    if (json) Object.keys(json).forEach((k) => { this.sheets[k] = new FakeSheet(k, json[k]); });
  }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new FakeSheet(n); return this.sheets[n]; }
  toJSON() { const o = {}; Object.keys(this.sheets).forEach((k) => { o[k] = this.sheets[k].data; }); return o; }
}

const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function createPlatform(backend, opts = {}) {
  const props = new Map(Object.entries(opts.props || {}));
  const cache = new Map();
  const photos = new Map(Object.entries(opts.photos || {}));
  const ss = new FakeSpreadsheet(opts.sheets);
  const state = {
    clock: opts.now ? new Date(opts.now).getTime() : null,
    sentMail: [],
    failMail: false,
    failNextPhotos: 0,
    driveFiles: opts.driveFiles || {},
    backupInstalled: false,
    failBackupInstall: false,
    backupFiles: [],
    logs: [],
  };
  const platform = {
    store: new backend.SheetStore(ss, opts.strict !== false),
    props: {
      get: (k) => (props.has(k) ? props.get(k) : null),
      set: (k, v) => props.set(k, String(v)),
      del: (k) => props.delete(k),
      keys: () => [...props.keys()],
    },
    cache: {
      get: (k) => { const e = cache.get(k); return e && e.exp > platform.now().getTime() ? e.v : null; },
      put: (k, v, s) => cache.set(k, { v, exp: platform.now().getTime() + s * 1000 }),
    },
    withLock: (fn) => { const r = fn(); if (opts.onWrite) opts.onWrite(); return r; },
    now: () => (state.clock === null ? new Date() : new Date(state.clock)),
    uuid: () => crypto.randomUUID(),
    hmacSha256: (key, msg) => [...crypto.createHmac('sha256', Buffer.from(key)).update(Buffer.from(msg)).digest()],
    sha256: (bytes) => [...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()],
    localParts: (date, tz) => {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' });
      const p = {};
      f.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
      return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, wd: WD[p.weekday] };
    },
    photos: {
      save: (b64, mime, name) => {
        if (state.failNextPhotos > 0) { state.failNextPhotos--; throw new Error('Simulated Drive failure'); }
        const id = 'file-' + crypto.randomUUID();
        photos.set(id, { data: b64, mime, name });
        return id;
      },
      read: (id) => { const f = photos.get(id); if (!f) throw new Error('missing file'); return { data: f.data }; },
      trash: (id) => photos.delete(id),
    },
    mail: {
      remaining: () => 100,
      send: (m) => { if (state.failMail) throw new Error('Simulated mail failure'); state.sentMail.push(m); },
    },
    backup: {
      install: () => { if (state.failBackupInstall) throw new Error('Simulated: Google refused to create the timer'); state.backupInstalled = true; },
      remove: () => { state.backupInstalled = false; },
      isInstalled: () => !!state.backupInstalled,
      save: (name, text) => { state.backupFiles.push({ name, size: text.length }); return 'backup-' + state.backupFiles.length; },
      folderUrl: () => 'https://drive.google.com/drive/folders/TEST-BACKUPS',
    },
    drive: {
      readSpreadsheet: (id) => { const f = state.driveFiles[id]; if (!f || !f.tabs) throw new Error('No access to file ' + id); return f.tabs; },
      readText: (id) => { const f = state.driveFiles[id]; if (!f || f.text === undefined) throw new Error('No access to file ' + id); return f.text; },
    },
    log: (m) => state.logs.push(m),
  };
  return {
    platform, state, ss, props, photos,
    snapshot: () => ({ sheets: ss.toJSON(), props: Object.fromEntries(props), photos: Object.fromEntries(photos) }),
  };
}

// Convenience for tests: a backend with its own fake Google account.
export function createApp(opts = {}) {
  const backend = loadBackend();
  const env = createPlatform(backend, opts);
  backend.setPlatform_(env.platform);
  const call = (action, body = {}) => backend.handleApi_(Object.assign({ action }, body));
  return Object.assign(env, { backend, call });
}
