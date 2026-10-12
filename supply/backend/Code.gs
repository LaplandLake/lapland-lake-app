/* Lapland Lake Supply Manager: backend (Google Apps Script).

   Runs in Todd's Google account. Data lives in a Google Sheet ("Lapland Lake Supply
   Manager Data") and request photos in a private Drive folder, both owned by Todd.
   Nothing here is shared publicly: photos are only returned to a signed-in Admin.

   Setup (once): see supply/README.md. In short:
     1. script.google.com > New project > paste this whole file as Code.gs.
     2. Run "setup" once and approve the permissions.
     3. Run "createAdminSetupCode", copy the code from the log, and use it on the
        app's Admin screen to choose your password. (Never paste the password here.)
     4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
        Put the web app address in supply/config.js.
   After pasting a new version: Deploy > Manage deployments > pencil > New version.

   The same file runs in Node for automated tests (see supply/test). Everything that
   touches Google services goes through the "platform" object at the bottom. */

const APP_VERSION = '1.0.0';
const TZ = 'America/New_York';
const DATA_SPREADSHEET_NAME = 'Lapland Lake Supply Manager Data';
const DRIVE_FOLDER_NAME = 'Lapland Lake Supply Manager';
const SESSION_HOURS = 12;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MINUTES = 15;
const PBKDF2_ITERATIONS = 3000;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS_PER_REQUEST = 6;
const STAFF_LIMITS = { request: 40, photo: 120, count: 3000 }; // per hour, whole app

const KINDS = ['housekeeping', 'cafe', 'beverage'];
const DEPARTMENTS = ['housekeeping', 'cafe'];
const KIND_LABEL = { housekeeping: 'Housekeeping', cafe: 'Cafe', beverage: 'Beer / Cider / Wine' };
const STATUS_LABEL = { shopping: 'On shopping list', ordered: 'Ordered' };
const BEV_TYPES = ['beer', 'cider', 'wine', 'craft soda', 'other'];
const ADJUSTMENT_TYPES = ['waste', 'transfer', 'return', 'other'];

/* ---------------------------------------------------------------- schema */

const TABLES = {
  items: {
    id: 's', name: 's', department: 's', active: 'b', category: 's',
    supplierItemNumber: 's', supplierNumberStatus: 's', description: 's', brand: 's',
    casePackRaw: 's', packsPerCase: 'n', packSize: 's',
    countingUnit: 's', countingUnitConfirmed: 'b', unitsPerCase: 'n', unitsPerCaseConfirmed: 'b', looseUnitLabel: 's',
    desiredStock: 'n', archived: 'b', supplierStatus: 's', replacementNote: 's', replacementCandidate: 's',
    replacementApproved: 'b', price: 'n', priceDate: 's', priceSource: 's',
    priceHistory: 'j', purchaseHistory: 'j', sourceRefs: 'j', notes: 's',
    origin: 's', legacyId: 's', legacy: 'j', sortOrder: 'n', createdAt: 's', updatedAt: 's',
  },
  sessions: {
    id: 's', kind: 's', status: 's', weekPeriod: 's', startedAt: 's', completedAt: 's',
    completedBy: 's', incompleteAtCompletion: 'n', totalAtCompletion: 'n', reportVersion: 'n',
    note: 's', origin: 's', legacyId: 's', createdAt: 's', updatedAt: 's',
  },
  entries: {
    id: 's', sessionId: 's', kind: 's', itemId: 's', fullCases: 'n', looseUnits: 'n',
    flag: 's', note: 's', countedAt: 's', snapshot: 'j', origin: 's', legacyId: 's',
    createdAt: 's', updatedAt: 's',
  },
  orders: {
    id: 's', supplier: 's', status: 's', deliveryDate: 's', deadline: 's', note: 's',
    basedOn: 'j', totalCases: 'n', submittedAt: 's', submittedMethod: 's', submittedNote: 's',
    origin: 's', legacyId: 's', legacy: 'j', createdAt: 's', updatedAt: 's',
  },
  orderLines: {
    id: 's', orderId: 's', itemId: 's', department: 's', supplierItemNumber: 's',
    description: 's', casePackRaw: 's', onHandCases: 'n', desiredStock: 'n',
    suggestedCases: 'n', finalCases: 'n', flags: 'j', snapshot: 'j', sortOrder: 'n', note: 's',
  },
  requests: {
    id: 's', kind: 's', itemName: 's', optionId: 's', quantity: 'n', quantityUnit: 's',
    note: 's', status: 's', photoIds: 'j', routingOverride: 's', adminNote: 's',
    statusChangedAt: 's', origin: 's', legacyId: 's', legacy: 'j', createdAt: 's', updatedAt: 's',
  },
  photos: { id: 's', requestId: 's', fileId: 's', mimeType: 's', bytes: 'n', status: 's', createdAt: 's' },
  supplies: { id: 's', name: 's', defaultUnit: 's', active: 'b', sortOrder: 'n', createdAt: 's', updatedAt: 's' },
  drinks: {
    id: 's', name: 's', active: 'b', routing: 's', beverageProductId: 's', sortOrder: 'n',
    createdAt: 's', updatedAt: 's',
  },
  bevProducts: {
    id: 's', name: 's', type: 's', container: 's', unitsPerCase: 'n', packageConfirmed: 'b',
    active: 'b', reviewStatus: 's', source: 's', notes: 's', sortOrder: 'n', origin: 's',
    legacyId: 's', createdAt: 's', updatedAt: 's',
  },
  deliveries: {
    id: 's', productId: 's', deliveredAt: 's', fullCases: 'n', looseUnits: 'n',
    unitsPerCaseSnapshot: 'n', packageConfirmedSnapshot: 'b', totalUnits: 'n', note: 's',
    origin: 's', legacyId: 's', createdAt: 's',
  },
  sales: {
    id: 's', productId: 's', periodStart: 's', periodEnd: 's', units: 'n', source: 's',
    note: 's', createdAt: 's',
  },
  adjustments: { id: 's', productId: 's', at: 's', type: 's', units: 'n', note: 's', createdAt: 's' },
  emailLog: {
    id: 's', reportKey: 's', sessionId: 's', reportVersion: 'n', status: 's', recipient: 's',
    at: 's', error: 's', trigger: 's',
  },
  settings: { id: 's', value: 'j' },
  audit: { id: 's', at: 's', actor: 's', action: 's', detail: 'j' },
};

/* ---------------------------------------------------------------- errors */

function UserError(message, code) {
  this.message = message;
  this.code = code || 'invalid';
}

function fail_(message, code) { throw new UserError(message, code); }

/* ---------------------------------------------------------------- web entry points */

function doGet() {
  return jsonOut_({ ok: true, app: 'Lapland Lake Supply Manager', version: APP_VERSION });
}

function doPost(e) {
  let body = null;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return jsonOut_({ ok: false, error: { code: 'invalid', message: 'The request could not be read.' } });
  }
  return jsonOut_(handleApi_(body));
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------- dispatcher */

// Every action is listed here with who may call it. Anything not listed is refused.
// "admin" actions check the session token on the server before running.
const ACTIONS = {
  // staff (no sign-in)
  publicConfig: { role: 'staff', fn: (b) => publicConfig_() },
  countSheet: { role: 'staff', fn: (b) => countSheet_(b) },
  saveCount: { role: 'staff', write: true, fn: (b) => saveCount_(b, 'staff') },
  completeCount: { role: 'staff', write: true, fn: (b) => completeCount_(b, 'staff') },
  requestOptions: { role: 'staff', fn: (b) => requestOptions_(b) },
  uploadPhoto: { role: 'staff', write: true, fn: (b) => uploadPhoto_(b) },
  submitRequest: { role: 'staff', write: true, fn: (b) => submitRequest_(b) },
  recentRequests: { role: 'staff', fn: (b) => recentRequests_(b) },
  adminSetupStatus: { role: 'staff', fn: () => ({ configured: !!platform_().props.get('ADMIN_HASH') }) },
  adminSetup: { role: 'staff', write: true, fn: (b) => adminSetup_(b) },
  adminLogin: { role: 'staff', write: true, fn: (b) => adminLogin_(b) },
  // Todd only
  adminLogout: { role: 'admin', write: true, fn: (b) => adminLogout_(b) },
  adminChangePassword: { role: 'admin', write: true, fn: (b) => adminChangePassword_(b) },
  adminDashboard: { role: 'admin', fn: () => adminDashboard_() },
  adminItems: { role: 'admin', fn: () => ({ items: sortItems_(db_().all('items')) }) },
  adminSaveItem: { role: 'admin', write: true, fn: (b) => adminSaveItem_(b) },
  adminRemoveItems: { role: 'admin', write: true, fn: (b) => adminRemoveItems_(b) },
  adminCounts: { role: 'admin', fn: (b) => adminCounts_(b) },
  adminCountDetail: { role: 'admin', fn: (b) => adminCountDetail_(b) },
  adminSaveCount: { role: 'admin', write: true, fn: (b) => saveCount_(b, 'admin') },
  adminCompleteCount: { role: 'admin', write: true, fn: (b) => completeCount_(b, 'admin') },
  adminReopenCount: { role: 'admin', write: true, fn: (b) => adminReopenCount_(b) },
  adminOrders: { role: 'admin', fn: () => adminOrders_() },
  adminOrder: { role: 'admin', fn: (b) => adminOrder_(b.orderId) },
  adminCreateDraft: { role: 'admin', write: true, fn: (b) => adminCreateDraft_(b) },
  adminSaveOrder: { role: 'admin', write: true, fn: (b) => adminSaveOrder_(b) },
  adminSubmitOrder: { role: 'admin', write: true, fn: (b) => adminSubmitOrder_(b) },
  adminCancelOrder: { role: 'admin', write: true, fn: (b) => adminCancelOrder_(b) },
  adminSetDesiredStock: { role: 'admin', write: true, fn: (b) => adminSetDesiredStock_(b) },
  adminRequests: { role: 'admin', fn: () => adminRequests_() },
  adminPhoto: { role: 'admin', fn: (b) => adminPhoto_(b) },
  adminUpdateRequest: { role: 'admin', write: true, fn: (b) => adminUpdateRequest_(b) },
  adminDeleteRequest: { role: 'admin', write: true, fn: (b) => adminDeleteRequest_(b) },
  adminLists: { role: 'admin', fn: () => adminLists_() },
  adminSaveSupply: { role: 'admin', write: true, fn: (b) => adminSaveSimple_('supplies', b) },
  adminSaveDrink: { role: 'admin', write: true, fn: (b) => adminSaveSimple_('drinks', b) },
  adminBev: { role: 'admin', fn: () => adminBev_() },
  adminSaveBevProduct: { role: 'admin', write: true, fn: (b) => adminSaveBevProduct_(b) },
  adminSaveDelivery: { role: 'admin', write: true, fn: (b) => adminSaveDelivery_(b) },
  adminDeleteRecord: { role: 'admin', write: true, fn: (b) => adminDeleteRecord_(b) },
  adminSaveSale: { role: 'admin', write: true, fn: (b) => adminSaveSale_(b) },
  adminSaveAdjustment: { role: 'admin', write: true, fn: (b) => adminSaveAdjustment_(b) },
  adminBevReport: { role: 'admin', fn: (b) => bevReport_(b.sessionId) },
  adminBevHistory: { role: 'admin', fn: () => bevHistory_() },
  adminSettings: { role: 'admin', fn: () => ({ settings: allSettings_(), emailLog: emailLogList_() }) },
  adminSaveSettings: { role: 'admin', write: true, fn: (b) => adminSaveSettings_(b) },
  adminSendReportEmail: { role: 'admin', write: true, fn: (b) => adminSendReportEmail_(b) },
  adminSendTestEmail: { role: 'admin', write: true, fn: (b) => adminSendTestEmail_(b) },
  adminImportGinsbergPreview: { role: 'admin', fn: (b) => importGinsberg_(b, false) },
  adminImportGinsbergCommit: { role: 'admin', write: true, fn: (b) => importGinsberg_(b, true) },
  adminImportRowsPreview: { role: 'admin', fn: (b) => importRows_(b, false) },
  adminImportRowsCommit: { role: 'admin', write: true, fn: (b) => importRows_(b, true) },
  adminBackup: { role: 'admin', fn: () => backup_() },
  adminSupplierHistory: { role: 'admin', fn: () => supplierHistory_() },
  adminAudit: { role: 'admin', fn: () => ({ audit: db_().all('audit').slice(-300).reverse() }) },
};

function handleApi_(body) {
  const p = platform_();
  try {
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') fail_('Unknown request.');
    const def = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!def) fail_('Unknown request.');
    if (def.role === 'admin' && !checkSession_(body.token)) {
      fail_('Please sign in to Admin again.', 'auth');
    }
    const run = () => {
      db_().reset();
      return def.fn(body);
    };
    const data = def.write ? p.withLock(run) : run();
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: { code: err.code, message: err.message } };
    p.log('Error in ' + (body && body.action) + ': ' + (err && err.stack ? err.stack : err));
    return { ok: false, error: { code: 'server', message: 'Something went wrong on the server. Nothing was saved for this step. Please try again.' } };
  }
}

/* ---------------------------------------------------------------- small helpers */

function nowIso_() { return platform_().now().toISOString(); }
function newId_(prefix) { return (prefix || '') + platform_().uuid().replace(/-/g, '').slice(0, 20); }
function str_(v, max, label) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (max && s.length > max) fail_((label || 'Text') + ' is too long (limit ' + max + ' characters).');
  return s;
}
function num_(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : NaN;
}
function round2_(n) { return Math.round(n * 100) / 100; }
function bool_(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }
function byId_(rows) { const m = {}; rows.forEach((r) => { m[r.id] = r; }); return m; }
function audit_(actor, action, detail) {
  db_().insert('audit', { id: newId_('a'), at: nowIso_(), actor, action, detail: detail || null });
}
function setting_(key, fallback) {
  const row = db_().get('settings', key);
  return row && row.value !== null && row.value !== undefined ? row.value : fallback;
}
function putSetting_(key, value) {
  if (db_().get('settings', key)) db_().update('settings', key, { value });
  else db_().insert('settings', { id: key, value });
}
function rateLimit_(bucket) {
  const p = platform_();
  const hour = Math.floor(p.now().getTime() / 3600000);
  const key = 'rl:' + bucket + ':' + hour;
  const n = Number(p.cache.get(key) || 0) + 1;
  p.cache.put(key, String(n), 3700);
  if (n > STAFF_LIMITS[bucket]) {
    fail_('Too many submissions in the last hour. Please wait a bit and try again, or tell Todd.', 'rate');
  }
}

/* ---------------------------------------------------------------- dates (America/New_York) */

// Wall-clock parts of a moment in New York time.
function nyParts_(date) {
  return platform_().localParts(date, TZ);
}
function ymd_(parts) {
  return parts.y + '-' + String(parts.mo).padStart(2, '0') + '-' + String(parts.d).padStart(2, '0');
}
// UTC moment for a New York wall-clock time.
function nyToDate_(y, mo, d, h, mi) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = nyParts_(new Date(guess));
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    const diff = asUtc - Date.UTC(y, mo - 1, d, h, mi);
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}
function addDaysYmd_(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}
// Weekly period = the Monday (New York date) of the week the count started.
function weekPeriodOf_(date) {
  const p = nyParts_(date);
  return addDaysYmd_(ymd_(p), 1 - p.wd);
}
// Next Ginsberg's delivery (Thursday) whose Wednesday 4:00 PM deadline has not passed.
function nextDelivery_(fromDate) {
  const p = nyParts_(fromDate);
  const today = ymd_(p);
  let daysToThu = (4 - p.wd + 7) % 7;
  let thu = addDaysYmd_(today, daysToThu);
  for (let i = 0; i < 3; i++) {
    const wed = addDaysYmd_(thu, -1).split('-').map(Number);
    const deadline = nyToDate_(wed[0], wed[1], wed[2], 16, 0);
    if (deadline.getTime() > fromDate.getTime()) {
      const tue = addDaysYmd_(thu, -2).split('-').map(Number);
      return {
        deliveryDate: thu,
        deadline: deadline.toISOString(),
        preferredBy: nyToDate_(tue[0], tue[1], tue[2], 17, 0).toISOString(),
      };
    }
    thu = addDaysYmd_(thu, 7);
  }
  return null;
}

/* ---------------------------------------------------------------- auth */

function utf8_(s) {
  const out = [];
  const enc = unescape(encodeURIComponent(String(s)));
  for (let i = 0; i < enc.length; i++) out.push(enc.charCodeAt(i));
  return out;
}
function hex_(bytes) { return bytes.map((b) => (b & 255).toString(16).padStart(2, '0')).join(''); }
function fromHex_(h) { const out = []; for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16)); return out; }

// PBKDF2-HMAC-SHA256, one 32-byte block.
function pbkdf2_(password, saltBytes, iterations) {
  const p = platform_();
  const key = utf8_(password);
  let u = p.hmacSha256(key, saltBytes.concat([0, 0, 0, 1]));
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = p.hmacSha256(key, u);
    for (let j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return t;
}
function sameBytes_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ^ b[i]);
  return diff === 0;
}
function randomToken_() { const p = platform_(); return (p.uuid() + p.uuid()).replace(/-/g, ''); }
function tokenKey_(token) { return 'S_' + hex_(platform_().sha256(utf8_(token))).slice(0, 40); }

function setPassword_(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    fail_('Choose a password with at least ' + MIN_PASSWORD_LENGTH + ' characters.');
  }
  if (password.length > 200) fail_('That password is too long.');
  const salt = fromHex_(randomToken_().slice(0, 32));
  const hash = pbkdf2_(password, salt, PBKDF2_ITERATIONS);
  const props = platform_().props;
  props.set('ADMIN_HASH', JSON.stringify({ salt: hex_(salt), hash: hex_(hash), iterations: PBKDF2_ITERATIONS }));
  // Changing the password signs out every device.
  props.keys().filter((k) => k.indexOf('S_') === 0).forEach((k) => props.del(k));
}

function checkPassword_(password) {
  const raw = platform_().props.get('ADMIN_HASH');
  if (!raw || typeof password !== 'string') return false;
  const rec = JSON.parse(raw);
  return sameBytes_(pbkdf2_(password, fromHex_(rec.salt), rec.iterations), fromHex_(rec.hash));
}

function loginGuard_() {
  const props = platform_().props;
  const until = Number(props.get('LOGIN_LOCK_UNTIL') || 0);
  if (until > platform_().now().getTime()) {
    const mins = Math.ceil((until - platform_().now().getTime()) / 60000);
    fail_('Too many wrong attempts. Admin sign-in is paused for ' + mins + ' more minute(s).', 'locked');
  }
}
function loginFailed_() {
  const props = platform_().props;
  const fails = Number(props.get('LOGIN_FAILS') || 0) + 1;
  if (fails >= LOGIN_MAX_FAILS) {
    props.set('LOGIN_LOCK_UNTIL', String(platform_().now().getTime() + LOGIN_LOCK_MINUTES * 60000));
    props.set('LOGIN_FAILS', '0');
  } else {
    props.set('LOGIN_FAILS', String(fails));
  }
}

function adminLogin_(b) {
  loginGuard_();
  const props = platform_().props;
  if (!props.get('ADMIN_HASH')) fail_('Admin has not been set up yet. Use first-time setup.', 'setup');
  if (!checkPassword_(b.password)) {
    loginFailed_();
    fail_('That password is not right.', 'auth');
  }
  props.set('LOGIN_FAILS', '0');
  const now = platform_().now().getTime();
  props.keys().filter((k) => k.indexOf('S_') === 0).forEach((k) => {
    if (Number(props.get(k)) < now) props.del(k);
  });
  const token = randomToken_();
  props.set(tokenKey_(token), String(now + SESSION_HOURS * 3600000));
  audit_('admin', 'login', null);
  return { token, expiresInHours: SESSION_HOURS };
}

function checkSession_(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return false;
  const props = platform_().props;
  const key = tokenKey_(token);
  const exp = Number(props.get(key) || 0);
  if (!exp) return false;
  if (exp < platform_().now().getTime()) { props.del(key); return false; }
  return true;
}

function adminLogout_(b) {
  platform_().props.del(tokenKey_(b.token));
  return { signedOut: true };
}

function adminChangePassword_(b) {
  if (!checkPassword_(b.currentPassword)) fail_('Your current password is not right.');
  setPassword_(b.newPassword);
  audit_('admin', 'password-changed', null);
  return { changed: true, signedOut: true };
}

// Run this from the Apps Script editor (only Todd can). It writes a one-time code to the
// execution log, valid for 30 minutes, used on the Admin screen to set or reset the password.
function createAdminSetupCode() {
  const code = randomToken_().slice(0, 10).toUpperCase();
  const props = platform_().props;
  props.set('SETUP_CODE', JSON.stringify({ hash: hex_(platform_().sha256(utf8_(code))), expires: platform_().now().getTime() + 30 * 60000 }));
  props.set('LOGIN_LOCK_UNTIL', '0');
  props.set('LOGIN_FAILS', '0');
  platform_().log('Your one-time Admin setup code is: ' + code + '  (valid for 30 minutes)');
  return code;
}

function adminSetup_(b) {
  loginGuard_();
  const props = platform_().props;
  const raw = props.get('SETUP_CODE');
  const rec = raw ? JSON.parse(raw) : null;
  const code = String(b.setupCode || '').trim().toUpperCase();
  const valid = rec && rec.expires > platform_().now().getTime() &&
    sameBytes_(platform_().sha256(utf8_(code)), fromHex_(rec.hash));
  if (!valid) {
    loginFailed_();
    fail_('That setup code is not valid or has expired. Run createAdminSetupCode in the Apps Script editor for a new one.', 'auth');
  }
  if (b.newPassword !== b.confirmPassword) fail_('The two passwords do not match.');
  setPassword_(b.newPassword);
  props.del('SETUP_CODE');
  audit_('admin', 'password-set-with-setup-code', null);
  return adminLogin_({ password: b.newPassword });
}

/* ---------------------------------------------------------------- settings */

const DEFAULT_SETTINGS = {
  supplier: {
    name: "Ginsberg's Foods",
    customerNumber: '',
    customerName: '',
    deliveryDay: 'Thursday',
    minimumCases: 20,
    deadlineText: 'Wednesday at 4:00 PM (America/New_York)',
    preferredText: 'Tuesday afternoon (earlier in the week preferred)',
    contactsText: '',
    orderingNotes: '',
  },
  email: { recipient: '', enabled: false },
  backup: { driveBackupEnabled: false, lastBackupAt: '' },
  migration: { base44: 'not-imported', ginsberg: 'not-imported', notes: '' },
};

function allSettings_() {
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach((k) => {
    out[k] = Object.assign({}, DEFAULT_SETTINGS[k], setting_(k, {}));
  });
  return out;
}

function adminSaveSettings_(b) {
  const cur = allSettings_();
  if (b.supplier) {
    const s = b.supplier;
    const min = num_(s.minimumCases);
    if (min === null || isNaN(min) || min < 0 || min > 1000) fail_('Minimum cases must be a number.');
    putSetting_('supplier', Object.assign(cur.supplier, {
      name: str_(s.name, 120), customerNumber: str_(s.customerNumber, 40),
      customerName: str_(s.customerName, 200), deliveryDay: str_(s.deliveryDay, 40),
      minimumCases: min, deadlineText: str_(s.deadlineText, 200),
      preferredText: str_(s.preferredText, 200), contactsText: str_(s.contactsText, 4000),
      orderingNotes: str_(s.orderingNotes, 4000),
    }));
  }
  if (b.email) {
    const r = str_(b.email.recipient, 200);
    if (r && !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(r)) fail_('That email address does not look right.');
    putSetting_('email', { recipient: r, enabled: !!b.email.enabled && !!r });
  }
  if (b.migration) {
    putSetting_('migration', Object.assign(cur.migration, { notes: str_(b.migration.notes, 4000) }));
  }
  audit_('admin', 'settings-saved', { sections: Object.keys(b).filter((k) => k !== 'action' && k !== 'token') });
  return { settings: allSettings_() };
}

function publicConfig_() {
  const s = allSettings_().supplier;
  return {
    appVersion: APP_VERSION,
    delivery: {
      day: s.deliveryDay,
      minimumCases: s.minimumCases,
      text: 'Delivery Thursday · Preferable order by Tuesday afternoon. Latest order by Wednesday at 4:00 PM · 20-case minimum.',
    },
    statusLabels: STATUS_LABEL,
  };
}

/* ---------------------------------------------------------------- catalog helpers */

function sortItems_(items) {
  return items.slice().sort((a, b) => (a.department || 'zz').localeCompare(b.department || 'zz') ||
    (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));
}

// Parse "20 x 50 CT" into packs per case (20) and the size of each pack ("50 CT").
// Weight/volume sizes are kept as text; nothing is converted to piece counts.
function parseCasePack_(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([\d.]+)\s*[x×]\s*(.*)$/i);
  if (!m) return { packsPerCase: null, packSize: s };
  const n = Number(m[1]);
  return { packsPerCase: isFinite(n) && n > 0 ? n : null, packSize: m[2].trim() };
}

// What staff need, and nothing else (no prices, supplier status or private notes).
function staffItem_(it) {
  const loose = !!(it.unitsPerCaseConfirmed && it.unitsPerCase && it.unitsPerCase > 1);
  return {
    id: it.id,
    name: it.name,
    countingUnit: it.countingUnitConfirmed ? (it.countingUnit || 'case') : 'case',
    unitsPerCase: loose ? it.unitsPerCase : null,
    looseUnitLabel: loose ? (it.looseUnitLabel || 'units') : '',
    allowLoose: loose,
    desiredStock: it.desiredStock,
  };
}

function itemSnapshot_(it) {
  return {
    name: it.name, supplierItemNumber: it.supplierItemNumber || '', casePackRaw: it.casePackRaw || '',
    countingUnit: it.countingUnit || 'case', countingUnitConfirmed: !!it.countingUnitConfirmed,
    unitsPerCase: it.unitsPerCase, unitsPerCaseConfirmed: !!it.unitsPerCaseConfirmed,
    looseUnitLabel: it.looseUnitLabel || '', desiredStock: it.desiredStock, department: it.department,
  };
}

function bevSnapshot_(p) {
  return {
    name: p.name, type: p.type, container: p.container, unitsPerCase: p.unitsPerCase,
    packageConfirmed: !!p.packageConfirmed,
  };
}

function activeCountables_(kind) {
  if (kind === 'beverage') {
    return db_().all('bevProducts').filter((p) => p.active && p.packageConfirmed && p.unitsPerCase > 0)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  }
  return sortItems_(db_().all('items').filter((it) => it.active && !it.archived && it.department === kind));
}

/* ---------------------------------------------------------------- counts */

function checkKind_(kind) { if (KINDS.indexOf(kind) < 0) fail_('Unknown count type.'); }

function openSession_(kind) {
  return db_().all('sessions').filter((s) => s.kind === kind && s.status === 'open')
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] || null;
}

function countSheet_(b) {
  checkKind_(b.kind);
  const session = openSession_(b.kind);
  const countables = activeCountables_(b.kind);
  const entries = {};
  if (session) {
    db_().all('entries').filter((e) => e.sessionId === session.id).forEach((e) => {
      entries[e.itemId] = { fullCases: e.fullCases, looseUnits: e.looseUnits, flag: e.flag, countedAt: e.countedAt };
    });
  }
  const items = b.kind === 'beverage'
    ? countables.map((p) => ({
      id: p.id, name: p.name, type: p.type, countingUnit: 'case', unitsPerCase: p.unitsPerCase,
      looseUnitLabel: p.container ? p.container + 's' : 'bottles/cans', allowLoose: true, desiredStock: null,
    }))
    : countables.map(staffItem_);
  return {
    kind: b.kind,
    title: KIND_LABEL[b.kind],
    session: session ? { id: session.id, startedAt: session.startedAt, weekPeriod: session.weekPeriod } : null,
    items,
    entries,
  };
}

function validateCount_(kind, it, b) {
  const fc = num_(b.fullCases);
  const lu = num_(b.looseUnits);
  if (fc !== null && (isNaN(fc) || fc < 0 || Math.floor(fc) !== fc || fc > 9999)) {
    fail_('Full cases must be a whole number, 0 or more.');
  }
  if (lu !== null && (isNaN(lu) || lu < 0 || lu > 99999)) fail_('Loose units must be 0 or more.');
  if (lu !== null && kind === 'beverage' && Math.floor(lu) !== lu) fail_('Loose bottles/cans must be a whole number.');
  if (lu !== null && round2_(lu) !== lu) fail_('Use at most two decimal places.');
  const allowLoose = kind === 'beverage' ? true : staffItem_(it).allowLoose;
  if (lu !== null && lu > 0 && !allowLoose) fail_('This item is counted in full cases only.');
  const flag = str_(b.flag, 10);
  if (['', 'low', 'out'].indexOf(flag) < 0) fail_('Unknown flag.');
  return { fullCases: fc, looseUnits: lu, flag };
}

function saveCount_(b, actor) {
  checkKind_(b.kind);
  if (actor === 'staff') rateLimit_('count');
  const table = b.kind === 'beverage' ? 'bevProducts' : 'items';
  const it = db_().get(table, str_(b.itemId, 60));
  const countable = it && activeCountables_(b.kind).some((c) => c.id === it.id);
  if (!countable) fail_('That item is not on the ' + KIND_LABEL[b.kind] + ' count list any more. Reload the page.');
  let session = null;
  if (actor === 'admin' && b.sessionId) {
    session = db_().get('sessions', str_(b.sessionId, 60));
    if (!session || session.kind !== b.kind) fail_('Count not found.');
    if (session.status !== 'open') fail_('Reopen this count before changing it.');
  } else {
    session = openSession_(b.kind);
  }
  const clear = !!b.clear;
  const v = clear ? null : validateCount_(b.kind, it, b);
  if (!clear && v.fullCases === null && v.looseUnits === null && !v.flag) {
    fail_('Enter a count, or use "Clear" to mark the item as not counted.');
  }
  const now = nowIso_();
  if (!session) {
    if (clear) return { cleared: true, session: null };
    session = {
      id: newId_('s'), kind: b.kind, status: 'open', weekPeriod: weekPeriodOf_(platform_().now()),
      startedAt: now, completedAt: '', completedBy: '', incompleteAtCompletion: null,
      totalAtCompletion: null, reportVersion: 0, note: '', origin: 'app', legacyId: '',
      createdAt: now, updatedAt: now,
    };
    db_().insert('sessions', session);
  }
  const existing = db_().all('entries').filter((e) => e.sessionId === session.id && e.itemId === it.id)[0];
  if (clear) {
    if (existing) db_().remove('entries', existing.id);
    return { cleared: true, session: { id: session.id } };
  }
  const snap = b.kind === 'beverage' ? bevSnapshot_(it) : itemSnapshot_(it);
  const rec = {
    sessionId: session.id, kind: b.kind, itemId: it.id, fullCases: v.fullCases, looseUnits: v.looseUnits,
    flag: v.flag, note: str_(b.note, 300), countedAt: now, snapshot: snap, updatedAt: now,
  };
  if (existing) db_().update('entries', existing.id, rec);
  else db_().insert('entries', Object.assign({ id: newId_('e'), origin: actor === 'admin' ? 'admin' : 'app', legacyId: '', createdAt: now }, rec));
  return {
    saved: true,
    session: { id: session.id, startedAt: session.startedAt, weekPeriod: session.weekPeriod },
    entry: { fullCases: v.fullCases, looseUnits: v.looseUnits, flag: v.flag, countedAt: now },
  };
}

function isCounted_(e) { return !!e && (e.fullCases !== null || e.looseUnits !== null); }

function completeCount_(b, actor) {
  checkKind_(b.kind);
  const session = b.sessionId ? db_().get('sessions', str_(b.sessionId, 60)) : openSession_(b.kind);
  if (!session || session.kind !== b.kind) fail_('There is no count in progress to finish.');
  if (session.status !== 'open') {
    return { alreadyCompleted: true, completedAt: session.completedAt };
  }
  const countables = activeCountables_(b.kind);
  const entries = db_().all('entries').filter((e) => e.sessionId === session.id);
  const counted = {};
  entries.forEach((e) => { if (isCounted_(e)) counted[e.itemId] = true; });
  const missing = countables.filter((c) => !counted[c.id]).length;
  const now = nowIso_();
  const version = (session.reportVersion || 0) + 1;
  db_().update('sessions', session.id, {
    status: 'completed', completedAt: now, completedBy: actor, incompleteAtCompletion: missing,
    totalAtCompletion: countables.length, reportVersion: version, updatedAt: now,
  });
  audit_(actor, 'count-completed', { kind: b.kind, sessionId: session.id, missing });
  const out = { completed: true, notCounted: missing, total: countables.length };
  if (b.kind === 'beverage') {
    // Staff only learn that the count is done; the email result is shown to Todd in Admin.
    const res = sendWeeklyReport_(session.id, 'auto', false);
    if (actor === 'admin') out.email = res;
  }
  return out;
}

function adminCounts_() {
  const sessions = db_().all('sessions').slice().sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const entries = db_().all('entries');
  const counts = {};
  entries.forEach((e) => { if (isCounted_(e)) counts[e.sessionId] = (counts[e.sessionId] || 0) + 1; });
  return { sessions: sessions.map((s) => Object.assign({}, s, { countedItems: counts[s.id] || 0 })) };
}

function adminCountDetail_(b) {
  const s = db_().get('sessions', str_(b.sessionId, 60));
  if (!s) fail_('Count not found.');
  const entries = db_().all('entries').filter((e) => e.sessionId === s.id);
  const table = s.kind === 'beverage' ? 'bevProducts' : 'items';
  const cat = byId_(db_().all(table));
  return {
    session: s,
    entries: entries.map((e) => Object.assign({}, e, { currentName: cat[e.itemId] ? cat[e.itemId].name : '(removed)' })),
    notCounted: s.status === 'open'
      ? activeCountables_(s.kind).filter((c) => !entries.some((e) => e.itemId === c.id && isCounted_(e))).map((c) => ({ id: c.id, name: c.name }))
      : [],
  };
}

function adminReopenCount_(b) {
  const s = db_().get('sessions', str_(b.sessionId, 60));
  if (!s) fail_('Count not found.');
  if (s.status === 'open') return { reopened: false };
  const other = openSession_(s.kind);
  if (other) fail_('Another ' + KIND_LABEL[s.kind] + ' count is already in progress. Finish it first.');
  db_().update('sessions', s.id, { status: 'open', updatedAt: nowIso_() });
  audit_('admin', 'count-reopened', { sessionId: s.id });
  return { reopened: true };
}

/* ---------------------------------------------------------------- Ginsberg's orders */

function onHandFromEntry_(e) {
  if (!isCounted_(e)) return { onHand: null, flags: ['not-counted'] };
  const flags = [];
  const snap = e.snapshot || {};
  let onHand = e.fullCases || 0;
  if (e.looseUnits) {
    if (snap.unitsPerCaseConfirmed && snap.unitsPerCase > 0) onHand += e.looseUnits / snap.unitsPerCase;
    else flags.push('loose-units-not-converted');
  }
  return { onHand: round2_(onHand), flags };
}

function latestSession_(kind) {
  return db_().all('sessions').filter((s) => s.kind === kind)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] || null;
}

function suggestLine_(it, e) {
  const r = onHandFromEntry_(e);
  const flags = r.flags.slice();
  if (e && e.flag) flags.push('reported-' + e.flag);
  if (!it.countingUnitConfirmed) flags.push('counting-unit-unconfirmed');
  if (it.desiredStock === null || it.desiredStock === undefined) flags.push('no-desired-stock');
  if (it.supplierStatus && /suspend|restrict|not in guide/i.test(it.supplierStatus)) flags.push('supplier-status');
  if (!it.supplierItemNumber || it.supplierNumberStatus === 'unverified') flags.push('item-number-unverified');
  let suggested = null;
  if (r.onHand !== null && it.desiredStock !== null && it.desiredStock !== undefined) {
    suggested = Math.max(0, Math.ceil(it.desiredStock - r.onHand - 1e-9));
  }
  return { onHand: r.onHand, suggested, flags };
}

function adminCreateDraft_(b) {
  const now = nowIso_();
  const nd = nextDelivery_(platform_().now());
  const order = {
    id: newId_('o'), supplier: 'ginsbergs', status: 'draft', deliveryDate: nd ? nd.deliveryDate : '',
    deadline: nd ? nd.deadline : '', note: '', basedOn: {}, totalCases: 0, submittedAt: '',
    submittedMethod: '', submittedNote: '', origin: 'app', legacyId: '', legacy: null,
    createdAt: now, updatedAt: now,
  };
  const lines = [];
  let sort = 0;
  DEPARTMENTS.forEach((dept) => {
    const s = latestSession_(dept);
    order.basedOn[dept] = s ? { sessionId: s.id, status: s.status, startedAt: s.startedAt, completedAt: s.completedAt } : null;
    const entries = s ? db_().all('entries').filter((e) => e.sessionId === s.id) : [];
    activeCountables_(dept).forEach((it) => {
      const e = entries.filter((x) => x.itemId === it.id)[0] || null;
      const sug = suggestLine_(it, e);
      if (s && s.status === 'open') sug.flags.push('count-not-finished');
      lines.push({
        id: newId_('l'), orderId: order.id, itemId: it.id, department: dept,
        supplierItemNumber: it.supplierItemNumber || '', description: it.description || it.name,
        casePackRaw: it.casePackRaw || '', onHandCases: sug.onHand, desiredStock: it.desiredStock,
        suggestedCases: sug.suggested, finalCases: sug.suggested === null ? 0 : sug.suggested,
        flags: sug.flags, snapshot: itemSnapshot_(it), sortOrder: sort++, note: '',
      });
    });
  });
  order.totalCases = lines.reduce((t, l) => t + (l.finalCases || 0), 0);
  db_().insert('orders', order);
  db_().insertMany('orderLines', lines);
  audit_('admin', 'order-draft-created', { orderId: order.id });
  return adminOrder_(order.id);
}

function orderWarnings_(order, lines) {
  const min = allSettings_().supplier.minimumCases;
  const w = [];
  const total = lines.reduce((t, l) => t + (l.finalCases || 0), 0);
  if (total < min) w.push('This order is ' + total + ' case(s), below the ' + min + '-case minimum. You can still send it.');
  const flagged = lines.filter((l) => (l.flags || []).length).length;
  if (flagged) w.push(flagged + ' line(s) have flags (missing count, unconfirmed package size, etc.). Check them before sending.');
  ['housekeeping', 'cafe'].forEach((d) => {
    const bo = order.basedOn && order.basedOn[d];
    if (!bo) w.push('No ' + KIND_LABEL[d] + ' count was found.');
    else if (bo.status === 'open') w.push('The ' + KIND_LABEL[d] + ' count was not marked finished when this draft was made.');
  });
  if (order.status === 'draft' && order.deadline && platform_().now().getTime() > new Date(order.deadline).getTime()) {
    w.push('The Wednesday 4:00 PM deadline for this delivery has passed.');
  }
  return { warnings: w, totalCases: total };
}

function adminOrder_(orderId) {
  const order = db_().get('orders', str_(orderId, 60));
  if (!order) fail_('Order not found.');
  const lines = db_().all('orderLines').filter((l) => l.orderId === order.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const w = orderWarnings_(order, lines);
  return { order, lines, warnings: w.warnings, totalCases: w.totalCases, supplier: allSettings_().supplier, exportText: orderExportText_(order, lines) };
}

function adminOrders_() {
  const lines = db_().all('orderLines');
  const totals = {};
  lines.forEach((l) => { totals[l.orderId] = (totals[l.orderId] || 0) + (l.finalCases || 0); });
  return {
    orders: db_().all('orders').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((o) => Object.assign({}, o, { totalCases: totals[o.id] || 0 })),
    nextDelivery: nextDelivery_(platform_().now()),
  };
}

function adminSaveOrder_(b) {
  const order = db_().get('orders', str_(b.orderId, 60));
  if (!order) fail_('Order not found.');
  if (order.status !== 'draft') fail_('Only draft orders can be changed.');
  const lines = db_().all('orderLines').filter((l) => l.orderId === order.id);
  const byLine = byId_(lines);
  (b.lines || []).forEach((u) => {
    const l = byLine[u.id];
    if (!l) fail_('Order line not found.');
    const q = num_(u.finalCases);
    if (q === null || isNaN(q) || q < 0 || Math.floor(q) !== q || q > 9999) fail_('Order quantities must be whole numbers of cases, 0 or more.');
    db_().update('orderLines', l.id, { finalCases: q, note: str_(u.note, 300) });
  });
  db_().update('orders', order.id, { note: str_(b.note, 2000), updatedAt: nowIso_() });
  return adminOrder_(order.id);
}

// Todd marks the order as submitted after he has sent it himself. Nothing is sent from here.
function adminSubmitOrder_(b) {
  const order = db_().get('orders', str_(b.orderId, 60));
  if (!order) fail_('Order not found.');
  if (order.status !== 'draft') fail_('This order is not a draft.');
  if (b.confirm !== 'I-SENT-IT') fail_('Please confirm that you have sent the order yourself.');
  const lines = db_().all('orderLines').filter((l) => l.orderId === order.id);
  const total = lines.reduce((t, l) => t + (l.finalCases || 0), 0);
  db_().update('orders', order.id, {
    status: 'submitted', submittedAt: nowIso_(), submittedMethod: str_(b.method, 60),
    submittedNote: str_(b.note, 1000), totalCases: total, updatedAt: nowIso_(),
  });
  audit_('admin', 'order-marked-submitted', { orderId: order.id, totalCases: total });
  return adminOrder_(order.id);
}

function adminCancelOrder_(b) {
  const order = db_().get('orders', str_(b.orderId, 60));
  if (!order) fail_('Order not found.');
  if (order.status !== 'draft') fail_('Only drafts can be discarded.');
  db_().update('orders', order.id, { status: 'discarded', updatedAt: nowIso_() });
  audit_('admin', 'order-draft-discarded', { orderId: order.id });
  return { discarded: true };
}

// Desired stock only ever changes when Todd approves a value here or in the catalog.
function adminSetDesiredStock_(b) {
  const it = db_().get('items', str_(b.itemId, 60));
  if (!it) fail_('Item not found.');
  const v = num_(b.desiredStock);
  if (v === null || isNaN(v) || v < 0 || v > 9999) fail_('Desired stock must be 0 or more.');
  db_().update('items', it.id, { desiredStock: round2_(v), updatedAt: nowIso_() });
  audit_('admin', 'desired-stock-approved', { itemId: it.id, from: it.desiredStock, to: round2_(v) });
  return { item: db_().get('items', it.id) };
}

function orderExportText_(order, lines) {
  const s = allSettings_().supplier;
  const out = [];
  out.push('Lapland Lake order for ' + (s.name || "Ginsberg's Foods"));
  if (s.customerNumber) out.push('Customer #' + s.customerNumber + (s.customerName ? ' (' + s.customerName + ')' : ''));
  if (order.deliveryDate) out.push('For delivery Thursday ' + order.deliveryDate);
  let total = 0;
  DEPARTMENTS.forEach((d) => {
    const ls = lines.filter((l) => l.department === d && l.finalCases > 0);
    if (!ls.length) return;
    out.push('');
    out.push(KIND_LABEL[d].toUpperCase());
    ls.forEach((l) => {
      total += l.finalCases;
      out.push((l.supplierItemNumber ? '#' + l.supplierItemNumber : '(no item #)') + '  ' + l.description +
        (l.casePackRaw ? ' (' + l.casePackRaw + ')' : '') + ' - ' + l.finalCases + (l.finalCases === 1 ? ' case' : ' cases'));
    });
  });
  out.push('');
  out.push('Total: ' + total + ' case(s)');
  return out.join('\n');
}

/* ---------------------------------------------------------------- requests and photos */

function requestOptions_(b) {
  if (b.kind === 'drink') {
    return { options: db_().all('drinks').filter((d) => d.active).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)).map((d) => ({ id: d.id, name: d.name })) };
  }
  return {
    options: db_().all('supplies').filter((s) => s.active).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
      .map((s) => ({ id: s.id, name: s.name, defaultUnit: s.defaultUnit || '' })),
  };
}

const B64_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64Head_(b64, n) {
  const out = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < b64.length && out.length < n; i++) {
    const v = B64_.indexOf(b64[i]);
    if (v < 0) break;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
  return out;
}
function sniffImage_(b64) {
  const h = b64Head_(b64, 12);
  if (h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF) return 'image/jpeg';
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4E && h[3] === 0x47) return 'image/png';
  if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) return 'image/webp';
  return null;
}

// Photos are uploaded first (one at a time, so staff see progress). Each upload returns a
// token; the request is only created once every photo is safely stored.
function uploadPhoto_(b) {
  rateLimit_('photo');
  const data = String(b.data || '').replace(/^data:[^,]*,/, '');
  if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data)) fail_('That photo could not be read. Try choosing it again.');
  const bytes = Math.floor(data.replace(/\s/g, '').length * 3 / 4);
  if (bytes > MAX_PHOTO_BYTES) fail_('That photo is too large (limit 4 MB after resizing).');
  const mime = sniffImage_(data);
  if (!mime) fail_('Only photos (JPEG, PNG or WebP) can be attached.');
  const id = newId_('p');
  const fileId = platform_().photos.save(data, mime, id + (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg'));
  db_().insert('photos', { id, requestId: '', fileId, mimeType: mime, bytes, status: 'staged', createdAt: nowIso_() });
  return { photoToken: id };
}

function submitRequest_(b) {
  rateLimit_('request');
  const kind = b.kind === 'drink' ? 'drink' : b.kind === 'supply' ? 'supply' : fail_('Unknown request type.');
  const itemName = str_(b.itemName, 120, 'Item name');
  if (!itemName) fail_(kind === 'drink' ? 'Please choose or type the drink.' : 'Please enter the item name.');
  const q = num_(b.quantity);
  if (q === null || isNaN(q) || q <= 0) fail_('Quantity must be more than 0.');
  if (q > 10000 || round2_(q) !== q) fail_('Please check the quantity.');
  const unit = str_(b.quantityUnit, 40, 'Unit');
  const note = str_(b.note, 1000, 'Note');
  let optionId = str_(b.optionId, 60);
  if (optionId) {
    const opt = db_().get(kind === 'drink' ? 'drinks' : 'supplies', optionId);
    if (!opt || !opt.active) optionId = '';
  }
  const tokens = Array.isArray(b.photoTokens) ? b.photoTokens.map((t) => str_(t, 60)) : [];
  if (tokens.length > MAX_PHOTOS_PER_REQUEST) fail_('Please attach at most ' + MAX_PHOTOS_PER_REQUEST + ' photos.');
  const photos = tokens.map((t) => {
    const ph = db_().get('photos', t);
    if (!ph || ph.status !== 'staged') fail_('One of the photos was not received. Please remove it and add it again.');
    return ph;
  });
  const now = nowIso_();
  const id = newId_('r');
  db_().insert('requests', {
    id, kind, itemName, optionId, quantity: q, quantityUnit: unit, note, status: 'shopping',
    photoIds: photos.map((p) => p.id), routingOverride: '', adminNote: '', statusChangedAt: now,
    origin: 'app', legacyId: '', legacy: null, createdAt: now, updatedAt: now,
  });
  photos.forEach((ph) => db_().update('photos', ph.id, { requestId: id, status: 'attached' }));
  return { id, status: STATUS_LABEL.shopping, photoCount: photos.length };
}

// Staff list: only what they entered and the two statuses. No routing, no admin notes.
function recentRequests_(b) {
  const kind = b.kind === 'drink' ? 'drink' : 'supply';
  const cutoff = platform_().now().getTime() - 45 * 86400000;
  return {
    requests: db_().all('requests').filter((r) => r.kind === kind && new Date(r.createdAt).getTime() >= cutoff)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 60)
      .map((r) => ({
        id: r.id, itemName: r.itemName, quantity: r.quantity, quantityUnit: r.quantityUnit, note: r.note,
        status: STATUS_LABEL[r.status] || STATUS_LABEL.shopping, createdAt: r.createdAt,
        photoCount: (r.photoIds || []).length,
      })),
  };
}

function effectiveRouting_(r, drinks) {
  if (r.kind !== 'drink') return 'supply';
  if (r.routingOverride) return r.routingOverride;
  const d = r.optionId ? drinks[r.optionId] : null;
  return d && d.routing ? d.routing : 'unassigned';
}

function adminRequests_() {
  const drinks = byId_(db_().all('drinks'));
  const reqs = db_().all('requests').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    requests: reqs.map((r) => Object.assign({}, r, {
      statusLabel: STATUS_LABEL[r.status], routing: effectiveRouting_(r, drinks),
      drinkDefaultRouting: r.kind === 'drink' && r.optionId && drinks[r.optionId] ? drinks[r.optionId].routing || '' : '',
    })),
  };
}

function adminPhoto_(b) {
  const ph = db_().get('photos', str_(b.photoId, 60));
  if (!ph) fail_('Photo not found.');
  const f = platform_().photos.read(ph.fileId);
  return { id: ph.id, mimeType: ph.mimeType, data: f.data };
}

function adminUpdateRequest_(b) {
  const r = db_().get('requests', str_(b.requestId, 60));
  if (!r) fail_('Request not found.');
  const patch = { updatedAt: nowIso_() };
  if (b.status !== undefined) {
    if (!STATUS_LABEL[b.status]) fail_('Status must be "On shopping list" or "Ordered".');
    if (b.status !== r.status) { patch.status = b.status; patch.statusChangedAt = nowIso_(); }
  }
  if (b.routingOverride !== undefined) {
    if (['', 'supply', 'beverage'].indexOf(b.routingOverride) < 0) fail_('Unknown list.');
    if (r.kind !== 'drink') fail_('Only Drink Cooler requests have a list choice.');
    patch.routingOverride = b.routingOverride;
  }
  if (b.adminNote !== undefined) patch.adminNote = str_(b.adminNote, 1000);
  db_().update('requests', r.id, patch);
  audit_('admin', 'request-updated', { requestId: r.id, status: patch.status, routingOverride: patch.routingOverride });
  return { request: db_().get('requests', r.id) };
}

function adminDeleteRequest_(b) {
  const r = db_().get('requests', str_(b.requestId, 60));
  if (!r) fail_('Request not found.');
  if (b.confirm !== 'DELETE') fail_('Please confirm deleting this request.');
  (r.photoIds || []).forEach((pid) => {
    const ph = db_().get('photos', pid);
    if (ph) { try { platform_().photos.trash(ph.fileId); } catch (e) { /* already gone */ } db_().remove('photos', pid); }
  });
  db_().remove('requests', r.id);
  audit_('admin', 'request-deleted', { requestId: r.id, itemName: r.itemName });
  return { deleted: true };
}

/* ---------------------------------------------------------------- simple lists (supplies, drinks) */

function adminLists_() {
  return {
    supplies: db_().all('supplies').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)),
    drinks: db_().all('drinks').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)),
    bevProducts: db_().all('bevProducts').map((p) => ({ id: p.id, name: p.name })),
  };
}

function adminSaveSimple_(table, b) {
  const now = nowIso_();
  const name = str_(b.name, 120, 'Name');
  if (!name) fail_('Name is required.');
  const rec = { name, active: b.active === undefined ? true : !!b.active, sortOrder: num_(b.sortOrder) || 0, updatedAt: now };
  if (table === 'supplies') rec.defaultUnit = str_(b.defaultUnit, 40);
  if (table === 'drinks') {
    if (['', 'supply', 'beverage'].indexOf(b.routing || '') < 0) fail_('Unknown list.');
    rec.routing = b.routing || '';
    rec.beverageProductId = str_(b.beverageProductId, 60);
  }
  let id = str_(b.id, 60);
  if (id) {
    if (!db_().get(table, id)) fail_('Not found.');
    db_().update(table, id, rec);
  } else {
    id = newId_(table === 'drinks' ? 'd' : 'u');
    db_().insert(table, Object.assign({ id, createdAt: now }, rec));
  }
  audit_('admin', table + '-saved', { id, name });
  return adminLists_();
}

/* ---------------------------------------------------------------- catalog editing */

function adminSaveItem_(b) {
  const now = nowIso_();
  const id = str_(b.id, 60);
  const cur = id ? db_().get('items', id) : null;
  if (id && !cur) fail_('Item not found.');
  const f = b.item || {};
  const next = Object.assign({}, cur || {});
  const setStr = (k, max) => { if (f[k] !== undefined) next[k] = str_(f[k], max); };
  ['name', 'category', 'description', 'brand', 'casePackRaw', 'packSize', 'countingUnit', 'looseUnitLabel',
    'supplierStatus', 'replacementNote', 'replacementCandidate', 'priceDate', 'priceSource', 'notes', 'supplierNumberStatus']
    .forEach((k) => setStr(k, k === 'notes' || k === 'replacementNote' ? 2000 : 200));
  if (f.supplierItemNumber !== undefined) {
    const sn = str_(f.supplierItemNumber, 30);
    if (sn && !/^[A-Za-z0-9-]+$/.test(sn)) fail_('Supplier item numbers can only contain letters, digits and dashes.');
    next.supplierItemNumber = sn; // kept as text, so leading zeros stay
  }
  if (f.department !== undefined) {
    if (['', 'housekeeping', 'cafe'].indexOf(f.department) < 0) fail_('Unknown department.');
    next.department = f.department;
  }
  ['packsPerCase', 'unitsPerCase', 'desiredStock', 'price', 'sortOrder'].forEach((k) => {
    if (f[k] === undefined) return;
    const v = num_(f[k]);
    if (v !== null && (isNaN(v) || v < 0)) fail_('Numbers must be 0 or more.');
    next[k] = v;
  });
  if (next.unitsPerCase !== null && next.unitsPerCase !== undefined && Math.floor(next.unitsPerCase) !== next.unitsPerCase) {
    fail_('Units per case must be a whole number.');
  }
  ['countingUnitConfirmed', 'unitsPerCaseConfirmed', 'replacementApproved', 'active', 'archived'].forEach((k) => {
    if (f[k] !== undefined) next[k] = !!f[k];
  });
  if (!next.name) fail_('Item name is required.');
  if (next.unitsPerCaseConfirmed && !(next.unitsPerCase > 0)) fail_('Enter units per case before confirming it.');
  if (next.archived && next.active) fail_('Restore this item before making it active.');
  if (next.active) {
    const missing = [];
    if (!next.department) missing.push('department');
    if (!next.countingUnitConfirmed) missing.push('confirmed counting unit');
    if (next.desiredStock === null || next.desiredStock === undefined) missing.push('desired stock');
    if (missing.length) fail_('Before this item can be active it needs: ' + missing.join(', ') + '.');
  }
  next.updatedAt = now;
  if (cur) {
    db_().update('items', id, next);
  } else {
    next.id = newId_('i');
    next.origin = 'admin';
    next.createdAt = now;
    db_().insert('items', next);
  }
  audit_('admin', 'item-saved', { id: next.id || id, name: next.name, active: !!next.active });
  return { item: db_().get('items', next.id || id) };
}

// "Remove" hides items from the catalog without deleting them, so their history stays
// and they can be restored later. Removed items are never on a staff count.
function adminRemoveItems_(b) {
  const ids = Array.isArray(b.ids) ? b.ids.map((x) => str_(x, 60)) : [];
  if (!ids.length) fail_('Choose at least one item.');
  if (ids.length > 1000) fail_('Too many items at once.');
  const restore = !!b.restore;
  const now = nowIso_();
  let changed = 0;
  ids.forEach((id) => {
    const it = db_().get('items', id);
    if (!it) return;
    if (restore ? !it.archived : it.archived) return;
    db_().update('items', id, restore ? { archived: false, updatedAt: now } : { archived: true, active: false, updatedAt: now });
    changed++;
  });
  audit_('admin', restore ? 'items-restored' : 'items-removed', { count: changed, ids: ids.slice(0, 50) });
  return { changed, items: sortItems_(db_().all('items')) };
}

/* ---------------------------------------------------------------- beverages */

function adminBev_() {
  const sessions = db_().all('sessions').filter((s) => s.kind === 'beverage')
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return {
    products: db_().all('bevProducts').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)),
    deliveries: db_().all('deliveries').slice().sort((a, b) => String(b.deliveredAt).localeCompare(String(a.deliveredAt))),
    sales: db_().all('sales').slice().sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd))),
    adjustments: db_().all('adjustments').slice().sort((a, b) => String(b.at).localeCompare(String(a.at))),
    sessions,
  };
}

function adminSaveBevProduct_(b) {
  const now = nowIso_();
  const f = b.product || {};
  const id = str_(b.id, 60);
  const cur = id ? db_().get('bevProducts', id) : null;
  if (id && !cur) fail_('Product not found.');
  const next = Object.assign({}, cur || {});
  if (f.name !== undefined) next.name = str_(f.name, 120, 'Name');
  if (f.type !== undefined) {
    if (BEV_TYPES.indexOf(f.type) < 0) fail_('Type must be beer, cider, wine, craft soda or other.');
    next.type = f.type;
  }
  if (f.container !== undefined) next.container = str_(f.container, 40);
  if (f.notes !== undefined) next.notes = str_(f.notes, 1000);
  if (f.sortOrder !== undefined) next.sortOrder = num_(f.sortOrder) || 0;
  if (f.unitsPerCase !== undefined) {
    const v = num_(f.unitsPerCase);
    if (v !== null && (isNaN(v) || v <= 0 || Math.floor(v) !== v)) fail_('Bottles/cans per case must be a whole number above 0.');
    if (cur && cur.packageConfirmed && v !== cur.unitsPerCase && !f.packageConfirmed) next.packageConfirmed = false;
    next.unitsPerCase = v;
  }
  if (f.packageConfirmed !== undefined) next.packageConfirmed = !!f.packageConfirmed;
  if (f.active !== undefined) next.active = !!f.active;
  if (!next.name) fail_('Product name is required.');
  if (next.packageConfirmed && !(next.unitsPerCase > 0)) fail_('Enter bottles/cans per case before confirming.');
  if (next.active && !next.packageConfirmed) fail_('Confirm the package size (bottles/cans per case) before making this product active.');
  next.reviewStatus = next.packageConfirmed ? 'confirmed' : 'needs-review';
  next.updatedAt = now;
  if (cur) db_().update('bevProducts', id, next);
  else {
    next.id = newId_('b');
    next.type = next.type || 'other';
    next.source = next.source || 'Entered by Todd';
    next.origin = 'admin';
    next.createdAt = now;
    db_().insert('bevProducts', next);
  }
  audit_('admin', 'bev-product-saved', { id: next.id || id, name: next.name });
  return adminBev_();
}

function parseWhen_(v, label) {
  const s = str_(v, 40);
  const t = new Date(s);
  if (!s || isNaN(t.getTime())) fail_((label || 'Date') + ' is missing or not valid.');
  return t.toISOString();
}

function adminSaveDelivery_(b) {
  const p = db_().get('bevProducts', str_(b.productId, 60));
  if (!p) fail_('Choose a product.');
  const fc = num_(b.fullCases);
  const lu = num_(b.looseUnits);
  if (fc === null && lu === null) fail_('Enter cases and/or loose bottles/cans.');
  if (fc !== null && (isNaN(fc) || fc < 0 || Math.floor(fc) !== fc)) fail_('Full cases must be a whole number, 0 or more.');
  if (lu !== null && (isNaN(lu) || lu < 0 || Math.floor(lu) !== lu)) fail_('Loose bottles/cans must be a whole number, 0 or more.');
  const confirmed = !!(p.packageConfirmed && p.unitsPerCase > 0);
  const total = (fc || 0) > 0 && !confirmed ? null : (fc || 0) * (p.unitsPerCase || 0) + (lu || 0);
  const rec = {
    id: newId_('dl'), productId: p.id, deliveredAt: parseWhen_(b.deliveredAt, 'Delivery date/time'),
    fullCases: fc, looseUnits: lu, unitsPerCaseSnapshot: p.unitsPerCase, packageConfirmedSnapshot: confirmed,
    totalUnits: total, note: str_(b.note, 500), origin: 'admin', legacyId: '', createdAt: nowIso_(),
  };
  db_().insert('deliveries', rec);
  audit_('admin', 'delivery-recorded', { id: rec.id, productId: p.id });
  return adminBev_();
}

function adminSaveSale_(b) {
  const p = db_().get('bevProducts', str_(b.productId, 60));
  if (!p) fail_('Choose a product.');
  const u = num_(b.units);
  if (u === null || isNaN(u) || u < 0 || Math.floor(u) !== u) fail_('Units sold must be a whole number, 0 or more.');
  const ps = parseWhen_(b.periodStart, 'Start');
  const pe = parseWhen_(b.periodEnd, 'End');
  if (pe < ps) fail_('The end must be after the start.');
  db_().insert('sales', { id: newId_('sa'), productId: p.id, periodStart: ps, periodEnd: pe, units: u, source: str_(b.source, 120), note: str_(b.note, 500), createdAt: nowIso_() });
  audit_('admin', 'sales-recorded', { productId: p.id, units: u });
  return adminBev_();
}

function adminSaveAdjustment_(b) {
  const p = db_().get('bevProducts', str_(b.productId, 60));
  if (!p) fail_('Choose a product.');
  if (ADJUSTMENT_TYPES.indexOf(b.type) < 0) fail_('Choose waste, transfer, return or other.');
  const u = num_(b.units);
  if (u === null || isNaN(u) || u <= 0 || Math.floor(u) !== u) fail_('Units must be a whole number above 0.');
  db_().insert('adjustments', { id: newId_('ad'), productId: p.id, at: parseWhen_(b.at, 'Date/time'), type: b.type, units: u, note: str_(b.note, 500), createdAt: nowIso_() });
  audit_('admin', 'adjustment-recorded', { productId: p.id, type: b.type, units: u });
  return adminBev_();
}

function adminDeleteRecord_(b) {
  const allowed = ['deliveries', 'sales', 'adjustments'];
  if (allowed.indexOf(b.table) < 0) fail_('That record cannot be deleted here.');
  const r = db_().get(b.table, str_(b.id, 60));
  if (!r) fail_('Record not found.');
  db_().remove(b.table, r.id);
  audit_('admin', b.table + '-deleted', r);
  return adminBev_();
}

/* ---------------------------------------------------------------- beverage reports */

function entryUnits_(e) {
  if (!isCounted_(e)) return { units: null, why: 'Not counted' };
  const snap = e.snapshot || {};
  const full = e.fullCases || 0;
  if (full > 0 && !(snap.packageConfirmed && snap.unitsPerCase > 0)) return { units: null, why: 'Case size not confirmed at count time' };
  return { units: full * (snap.unitsPerCase || 0) + (e.looseUnits || 0), why: '' };
}

function completedBevSessions_() {
  return db_().all('sessions').filter((s) => s.kind === 'beverage' && s.status === 'completed')
    .sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
}

// Inventory depletion = previous counted units + delivered units between the two count
// timestamps - current counted units. Adjustments (waste, transfers, returns) recorded in the
// same interval are shown separately and subtracted for the usage estimate. Recorded sales
// are shown on their own and never mixed into the estimate. Missing data is never zero.
function bevReport_(sessionId) {
  const sessions = completedBevSessions_();
  if (!sessions.length) return { report: null, message: 'No completed Beer / Cider / Wine count yet.' };
  const idx = sessionId ? sessions.map((s) => s.id).indexOf(sessionId) : sessions.length - 1;
  if (idx < 0) fail_('That count is not completed.');
  const cur = sessions[idx];
  const prev = idx > 0 ? sessions[idx - 1] : null;
  const entries = db_().all('entries');
  const curE = {}, prevE = {};
  entries.forEach((e) => {
    if (e.sessionId === cur.id) curE[e.itemId] = e;
    if (prev && e.sessionId === prev.id) prevE[e.itemId] = e;
  });
  const deliveries = db_().all('deliveries');
  const adjustments = db_().all('adjustments');
  const sales = db_().all('sales');
  const products = db_().all('bevProducts').filter((p) => p.active || curE[p.id] || prevE[p.id])
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  const rows = products.map((p) => {
    const c = entryUnits_(curE[p.id]);
    const pr = prev ? entryUnits_(prevE[p.id]) : { units: null, why: 'No earlier completed count' };
    const row = {
      productId: p.id, name: (curE[p.id] && curE[p.id].snapshot && curE[p.id].snapshot.name) || p.name, type: p.type,
      previousUnits: pr.units, currentUnits: c.units, deliveredUnits: null, adjustmentUnits: null,
      depletion: null, usageEstimate: null, recordedSales: null,
      previousCountedAt: prevE[p.id] ? prevE[p.id].countedAt : '', currentCountedAt: curE[p.id] ? curE[p.id].countedAt : '',
      status: 'ok', notes: [],
    };
    if (pr.units === null) row.notes.push('Previous: ' + pr.why);
    if (c.units === null) row.notes.push('Current: ' + c.why);
    const from = row.previousCountedAt, to = row.currentCountedAt;
    let deliveryProblem = false;
    if (from && to) {
      const inWindow = (t) => t > from && t <= to;
      const dl = deliveries.filter((d) => d.productId === p.id && inWindow(d.deliveredAt));
      row.deliveredUnits = 0;
      dl.forEach((d) => {
        if (d.totalUnits === null || d.totalUnits === undefined) deliveryProblem = true;
        else row.deliveredUnits += d.totalUnits;
      });
      if (deliveryProblem) { row.deliveredUnits = null; row.notes.push('A delivery in this period has no confirmed case size'); }
      row.adjustmentUnits = adjustments.filter((a) => a.productId === p.id && inWindow(a.at)).reduce((t, a) => t + a.units, 0);
      const sl = sales.filter((s) => s.productId === p.id && s.periodEnd > from && s.periodEnd <= to);
      if (sl.length) row.recordedSales = sl.reduce((t, s) => t + s.units, 0);
    }
    if (pr.units === null || c.units === null || row.deliveredUnits === null) {
      row.status = 'insufficient';
      return row;
    }
    row.depletion = pr.units + row.deliveredUnits - c.units;
    row.usageEstimate = row.depletion - row.adjustmentUnits;
    if (row.depletion < 0 || row.usageEstimate < 0) {
      row.status = 'review';
      row.notes.push('Negative result: more counted than was there before plus deliveries. Check the counts and deliveries.');
    } else if (row.recordedSales !== null && row.recordedSales > row.depletion) {
      row.status = 'review';
      row.notes.push('Recorded sales are higher than the stock that left the shelf. Check the entries.');
    } else if (row.depletion === 0 && row.deliveredUnits === 0 && row.adjustmentUnits === 0 && !row.recordedSales) {
      row.status = 'zero';
    }
    return row;
  });
  return {
    report: {
      sessionId: cur.id, reportVersion: cur.reportVersion || 1, weekPeriod: cur.weekPeriod,
      completedAt: cur.completedAt, previousSessionId: prev ? prev.id : '',
      previousCompletedAt: prev ? prev.completedAt : '', previousWeekPeriod: prev ? prev.weekPeriod : '',
      basis: 'Estimated usage = previous count + deliveries recorded between the two count times - current count, minus recorded waste/transfers/returns. This is inventory depletion, not exact sales. Recorded sales (if any) are shown separately.',
      rows,
      summary: {
        ok: rows.filter((r) => r.status === 'ok').length,
        zero: rows.filter((r) => r.status === 'zero').length,
        insufficient: rows.filter((r) => r.status === 'insufficient').length,
        review: rows.filter((r) => r.status === 'review').length,
      },
    },
    sessions: sessions.map((s) => ({ id: s.id, weekPeriod: s.weekPeriod, completedAt: s.completedAt })).reverse(),
  };
}

function bevHistory_() {
  const sessions = completedBevSessions_();
  const weeks = sessions.map((s) => {
    const r = bevReport_(s.id).report;
    return { sessionId: s.id, weekPeriod: s.weekPeriod, completedAt: s.completedAt, rows: r.rows };
  });
  return { weeks };
}

function csvCell_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function reportCsv_(report) {
  const head = ['Product', 'Type', 'Previous count (units)', 'Delivered (units)', 'Current count (units)',
    'Inventory depletion', 'Waste/transfers/returns', 'Estimated usage', 'Recorded sales', 'Result', 'Notes'];
  const label = { ok: 'OK', zero: 'No activity', insufficient: 'Insufficient data', review: 'Needs review' };
  const lines = [head.map(csvCell_).join(',')];
  report.rows.forEach((r) => {
    lines.push([r.name, r.type, r.previousUnits, r.deliveredUnits, r.currentUnits, r.depletion, r.adjustmentUnits,
      r.usageEstimate, r.recordedSales === null ? 'Not recorded' : r.recordedSales, label[r.status], r.notes.join('; ')].map(csvCell_).join(','));
  });
  return lines.join('\n');
}

/* ---------------------------------------------------------------- weekly email */

function esc_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtNy_(iso) {
  if (!iso) return '';
  const p = nyParts_(new Date(iso));
  const h12 = ((p.h + 11) % 12) + 1;
  return ymd_(p) + ' ' + h12 + ':' + String(p.mi).padStart(2, '0') + (p.h < 12 ? ' AM' : ' PM');
}

function reportEmailHtml_(report) {
  const max = Math.max(1, ...report.rows.map((r) => Math.max(r.usageEstimate || 0, r.recordedSales || 0)));
  const label = { ok: 'OK', zero: 'No activity', insufficient: 'Insufficient data', review: 'Needs review' };
  const bar = (v, color) => v === null || v === undefined || v <= 0 ? '' :
    '<div style="background:' + color + ';height:12px;width:' + Math.max(2, Math.round(220 * v / max)) + 'px;border-radius:3px"></div>';
  let html = '<div style="font-family:Arial,sans-serif;color:#10282b;max-width:680px">';
  html += '<h2 style="color:#276b76;margin:0 0 4px">Beer / Cider / Wine weekly count</h2>';
  html += '<p style="margin:0 0 12px">Week of ' + esc_(report.weekPeriod) + ' · count finished ' + esc_(fmtNy_(report.completedAt)) + '<br>' +
    (report.previousCompletedAt ? 'Compared with the count finished ' + esc_(fmtNy_(report.previousCompletedAt)) : 'No earlier count to compare with yet.') + '</p>';
  html += '<p style="margin:0 0 12px;font-size:13px;color:#3b5357">' + esc_(report.basis) + '</p>';
  html += '<p style="margin:0 0 8px"><b>Summary:</b> ' + report.summary.ok + ' with an estimate, ' + report.summary.zero + ' with no activity, ' +
    report.summary.insufficient + ' with insufficient data, ' + report.summary.review + ' need review.</p>';
  html += '<p style="font-size:13px;margin:0 0 6px"><span style="display:inline-block;width:10px;height:10px;background:#276b76"></span> Estimated usage (units) &nbsp; ' +
    '<span style="display:inline-block;width:10px;height:10px;background:#fab20b"></span> Recorded sales (units)</p>';
  html += '<table style="border-collapse:collapse;width:100%;font-size:14px">';
  html += '<tr style="background:#eaf6fb;text-align:left"><th style="padding:6px">Product</th><th style="padding:6px">Before</th><th style="padding:6px">Delivered</th><th style="padding:6px">Now</th><th style="padding:6px">Est. usage</th><th style="padding:6px">Graph</th><th style="padding:6px">Result</th></tr>';
  report.rows.forEach((r) => {
    const show = (v) => v === null || v === undefined ? '—' : String(v);
    html += '<tr style="border-top:1px solid #d3e2e4;vertical-align:top">' +
      '<td style="padding:6px"><b>' + esc_(r.name) + '</b><br><span style="color:#3b5357;font-size:12px">' + esc_(r.type) + '</span></td>' +
      '<td style="padding:6px">' + show(r.previousUnits) + '</td><td style="padding:6px">' + show(r.deliveredUnits) + '</td>' +
      '<td style="padding:6px">' + show(r.currentUnits) + '</td><td style="padding:6px">' + show(r.usageEstimate) +
      (r.recordedSales !== null ? '<br><span style="font-size:12px">Sales: ' + r.recordedSales + '</span>' : '') + '</td>' +
      '<td style="padding:6px">' + bar(r.usageEstimate, '#276b76') + '<div style="height:3px"></div>' + bar(r.recordedSales, '#fab20b') + '</td>' +
      '<td style="padding:6px">' + label[r.status] + (r.notes.length ? '<br><span style="font-size:12px;color:#6b4a00">' + esc_(r.notes.join('; ')) + '</span>' : '') + '</td></tr>';
  });
  html += '</table><p style="font-size:12px;color:#3b5357">Sent automatically by Lapland Lake Supply Manager after the weekly count was marked finished. A CSV copy is attached.</p></div>';
  return html;
}

function emailLogList_() {
  return db_().all('emailLog').slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50);
}

function sendWeeklyReport_(sessionId, trigger, allowResend) {
  const s = db_().get('sessions', sessionId);
  if (!s || s.kind !== 'beverage' || s.status !== 'completed') fail_('That count is not completed.');
  const key = s.id + ':v' + (s.reportVersion || 1);
  const email = allSettings_().email;
  const log = (status, error) => {
    const rec = { id: newId_('m'), reportKey: key, sessionId: s.id, reportVersion: s.reportVersion || 1, status, recipient: email.recipient || '', at: nowIso_(), error: error || '', trigger };
    db_().insert('emailLog', rec);
    return rec;
  };
  if (!email.recipient) return log('not-configured', 'No recipient set in Admin > Settings.');
  if (!email.enabled) return log('disabled', 'Weekly email is turned off in Admin > Settings.');
  const already = db_().all('emailLog').some((m) => m.reportKey === key && m.status === 'sent');
  if (already && !allowResend) return { status: 'duplicate', reportKey: key, error: 'This report version was already emailed.' };
  const rep = bevReport_(s.id).report;
  try {
    if (platform_().mail.remaining() < 1) return log('failed', 'Daily Google email quota used up. Try again tomorrow, or download the report.');
    platform_().mail.send({
      to: email.recipient,
      subject: 'Lapland Lake beverage count: week of ' + rep.weekPeriod,
      html: reportEmailHtml_(rep),
      attachments: [{ name: 'beverage-report-' + rep.weekPeriod + '.csv', mimeType: 'text/csv', content: reportCsv_(rep) }],
    });
    return log('sent', '');
  } catch (err) {
    return log('failed', String(err && err.message ? err.message : err).slice(0, 300));
  }
}

function adminSendReportEmail_(b) {
  const r = sendWeeklyReport_(str_(b.sessionId, 60), b.resend ? 'manual-resend' : 'retry', b.resend === 'RESEND');
  return { result: r, emailLog: emailLogList_() };
}

// Only runs when Todd presses "Send test email" in Admin.
function adminSendTestEmail_(b) {
  if (b.confirm !== 'SEND-TEST') fail_('Please confirm sending a test email.');
  const email = allSettings_().email;
  if (!email.recipient) fail_('Set the recipient first.');
  try {
    platform_().mail.send({ to: email.recipient, subject: 'Lapland Lake Supply Manager: test email', html: '<p>This is a test email from Lapland Lake Supply Manager. Weekly beverage reports will come from this address.</p>', attachments: [] });
    db_().insert('emailLog', { id: newId_('m'), reportKey: 'test', sessionId: '', reportVersion: 0, status: 'sent', recipient: email.recipient, at: nowIso_(), error: '', trigger: 'test' });
  } catch (err) {
    db_().insert('emailLog', { id: newId_('m'), reportKey: 'test', sessionId: '', reportVersion: 0, status: 'failed', recipient: email.recipient, at: nowIso_(), error: String(err && err.message ? err.message : err).slice(0, 300), trigger: 'test' });
  }
  return { emailLog: emailLogList_() };
}

/* ---------------------------------------------------------------- dashboard */

function adminDashboard_() {
  const items = db_().all('items');
  const reqs = db_().all('requests');
  const drinks = byId_(db_().all('drinks'));
  const open = {};
  KINDS.forEach((k) => {
    const s = openSession_(k);
    open[k] = s ? { id: s.id, startedAt: s.startedAt } : null;
  });
  const settings = allSettings_();
  const bev = db_().all('bevProducts');
  return {
    counts: open,
    catalog: {
      active: items.filter((i) => i.active).length,
      candidates: items.filter((i) => !i.active && !i.archived).length,
      removed: items.filter((i) => i.archived).length,
      activeHousekeeping: items.filter((i) => i.active && i.department === 'housekeeping').length,
      activeCafe: items.filter((i) => i.active && i.department === 'cafe').length,
    },
    requests: {
      shopping: reqs.filter((r) => r.status === 'shopping').length,
      unassignedDrinks: reqs.filter((r) => r.kind === 'drink' && r.status === 'shopping' && effectiveRouting_(r, drinks) === 'unassigned').length,
    },
    drafts: db_().all('orders').filter((o) => o.status === 'draft').length,
    beverages: { active: bev.filter((p) => p.active).length, needsReview: bev.filter((p) => !p.packageConfirmed).length },
    nextDelivery: nextDelivery_(platform_().now()),
    checklist: {
      password: true,
      activeCatalog: items.some((i) => i.active),
      countingUnits: items.filter((i) => i.active).every((i) => i.countingUnitConfirmed),
      beverageProducts: bev.some((p) => p.active),
      emailRecipient: !!settings.email.recipient,
      supplierInfo: !!settings.supplier.customerNumber,
      ginsbergImported: settings.migration.ginsberg !== 'not-imported',
      base44Imported: settings.migration.base44 !== 'not-imported',
      driveBackup: !!settings.backup.driveBackupEnabled,
    },
    migration: settings.migration,
  };
}

/* ---------------------------------------------------------------- Ginsberg's source import */

function driveIdFrom_(v) {
  const s = str_(v, 500);
  if (!s) return '';
  const m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{20,})/) || s.match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) fail_('That does not look like a Google Drive link: ' + s.slice(0, 80));
  return m[1];
}

function normHeader_(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9#/]+/g, ' ').trim(); }

// Finds a header row containing all the given headers. Returns { row, col: {header: index} }.
function findTable_(values, required) {
  for (let r = 0; r < Math.min(values.length, 25); r++) {
    const heads = values[r].map(normHeader_);
    const col = {};
    heads.forEach((h, i) => { if (h && col[h] === undefined) col[h] = i; });
    if (required.every((h) => col[normHeader_(h)] !== undefined)) return { row: r, col, heads };
  }
  return null;
}
function cell_(row, t, header) {
  const i = t.col[normHeader_(header)];
  return i === undefined ? '' : String(row[i] === null || row[i] === undefined ? '' : row[i]).trim();
}
function colMatching_(t, re) {
  for (let i = 0; i < t.heads.length; i++) if (re.test(t.heads[i])) return i;
  return -1;
}
function money_(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,]/g, ''));
  return isFinite(n) ? n : null;
}
function numText_(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
function isoFromLongDate_(text) {
  const m = String(text || '').match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!m) return '';
  const mo = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(m[1].toLowerCase()) + 1;
  return m[3] + '-' + String(mo).padStart(2, '0') + '-' + String(Number(m[2])).padStart(2, '0');
}

function parseCsv_(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Reads Todd's source files and turns them into inactive review candidates.
// Sources (all optional except at least one): the "Ginsbergs Weekly Ordering" Google Sheet,
// the Ordering Master saved as a Google Sheet, the deleted-items CSV, the graph-data CSV,
// and the ordering/contact reference text file.
function collectGinsberg_(b) {
  const drive = platform_().drive;
  const cands = {}; // by supplier item number
  const extras = []; // master-list lines without an item number
  const notes = [];
  const sources = [];
  const get = (num) => {
    const key = String(num).trim();
    if (!cands[key]) {
      cands[key] = {
        supplierItemNumber: key, name: '', description: '', brand: '', category: '', casePackRaw: '',
        supplierStatus: '', price: null, priceDate: '', priceSource: '', priceHistory: [], purchaseHistory: {},
        replacementNote: '', replacementCandidate: '', notes: [], sourceRefs: [],
      };
    }
    return cands[key];
  };
  const addRef = (c, ref) => { if (c.sourceRefs.indexOf(ref) < 0) c.sourceRefs.push(ref); };

  const weeklyId = driveIdFrom_(b.weeklySheet);
  if (weeklyId) {
    const tabs = drive.readSpreadsheet(weeklyId);
    sources.push('Weekly ordering sheet (' + tabs.map((t) => t.name).join(', ') + ')');
    let priceDate = '';
    tabs.forEach((tab) => { tab.values.slice(0, 6).forEach((r) => { const d = isoFromLongDate_(r.join(' ')); if (d && !priceDate) priceDate = d; }); });
    tabs.forEach((tab) => {
      const v = tab.values;
      const pr = findTable_(v, ['Category', 'Item #', 'Item', 'Case pack', 'Supplier status', 'Use']);
      if (pr) {
        const priceCol = colMatching_(pr, /case price/);
        const c2324 = colMatching_(pr, /2023\/24 cases/), c2526 = colMatching_(pr, /2025\/26 cases/), call = colMatching_(pr, /2020 2026 cases/);
        for (let r = pr.row + 1; r < v.length; r++) {
          const num = cell_(v[r], pr, 'Item #');
          if (!num) continue;
          const c = get(num);
          c.name = c.name || cell_(v[r], pr, 'Item');
          c.category = c.category || cell_(v[r], pr, 'Category');
          c.casePackRaw = c.casePackRaw || cell_(v[r], pr, 'Case pack');
          c.supplierStatus = cell_(v[r], pr, 'Supplier status') || c.supplierStatus;
          const price = priceCol >= 0 ? money_(v[r][priceCol]) : null;
          if (price !== null) { c.price = price; c.priceDate = priceDate; c.priceSource = 'Supplier guide (' + (priceDate || 'date not found') + ') via weekly ordering sheet'; }
          c.purchaseHistory = {
            cases2023_24: c2324 >= 0 ? numText_(v[r][c2324]) : null,
            cases2025_26: c2526 >= 0 ? numText_(v[r][c2526]) : null,
            cases2020_2026: call >= 0 ? numText_(v[r][call]) : null,
            basis: 'Invoice-listed shipped cases (seasons) and supplier sales report (2020-2026). Purchases from the supplier, not retail sales or usage.',
          };
          addRef(c, tab.name + ' row ' + (r + 1));
        }
        return;
      }
      const wo = findTable_(v, ['Category', 'Item', 'Item #', 'Case pack', 'Supplier status', 'Notes']);
      if (wo) {
        for (let r = wo.row + 1; r < v.length; r++) {
          const num = cell_(v[r], wo, 'Item #');
          if (!num) continue;
          const c = get(num);
          c.name = c.name || cell_(v[r], wo, 'Item');
          c.category = c.category || cell_(v[r], wo, 'Category');
          c.casePackRaw = c.casePackRaw || cell_(v[r], wo, 'Case pack');
          c.supplierStatus = c.supplierStatus || cell_(v[r], wo, 'Supplier status');
          const n = cell_(v[r], wo, 'Notes');
          if (n && c.notes.indexOf(n) < 0) c.notes.push(n);
          addRef(c, tab.name + ' row ' + (r + 1));
        }
        return;
      }
      const pc = findTable_(v, ['Category', 'Item', 'Item #', 'Case pack', 'Comparison notes']);
      if (pc) {
        const guideCol = colMatching_(pc, /guide price/);
        const pairs = [];
        pc.heads.forEach((h, i) => { const m = h.match(/^(\d{4}\/\d{2}) last price$/); if (m) pairs.push({ season: m[1], i }); });
        for (let r = pc.row + 1; r < v.length; r++) {
          const num = cell_(v[r], pc, 'Item #');
          if (!num) continue;
          const c = get(num);
          const cat = cell_(v[r], pc, 'Category');
          c.name = c.name || cell_(v[r], pc, 'Item');
          if (cat !== 'Guide only') c.category = c.category || cat;
          if (cat === 'Guide only' && !c.supplierStatus) c.supplierStatus = 'Guide only (no saved purchases)';
          c.casePackRaw = c.casePackRaw || cell_(v[r], pc, 'Case pack');
          pairs.forEach((p) => {
            const price = money_(v[r][p.i]);
            const date = String(v[r][p.i + 1] || '').trim();
            if (price !== null && !c.priceHistory.some((h) => h.date === date && h.price === price)) {
              c.priceHistory.push({ price, date, source: p.season + ' invoice (last listed price)' });
            }
          });
          const gp = guideCol >= 0 ? money_(v[r][guideCol]) : null;
          if (gp !== null && c.price === null) { c.price = gp; c.priceDate = priceDate; c.priceSource = 'Supplier guide (' + (priceDate || 'date not found') + ') via price comparison tab'; }
          const n = cell_(v[r], pc, 'Comparison notes');
          if (n && !/^No saved invoice price/.test(n) && c.notes.indexOf(n) < 0) c.notes.push(n);
          addRef(c, tab.name + ' row ' + (r + 1));
        }
      }
    });
  }

  const masterId = driveIdFrom_(b.masterSheet);
  if (masterId) {
    const tabs = drive.readSpreadsheet(masterId);
    sources.push('Ordering master (' + tabs.map((t) => t.name).join(', ') + ')');
    tabs.forEach((tab) => {
      const v = tab.values;
      const g = findTable_(v, ['Item #', 'Brand', 'Supplier description', 'Pack', 'Size per pack', 'Case price']);
      if (g) {
        let date = '';
        v.slice(0, g.row).forEach((r) => { date = date || isoFromLongDate_(r.join(' ')); });
        for (let r = g.row + 1; r < v.length; r++) {
          const num = cell_(v[r], g, 'Item #');
          if (!num) continue;
          const c = get(num);
          c.brand = cell_(v[r], g, 'Brand') || c.brand;
          c.description = cell_(v[r], g, 'Supplier description') || c.description;
          const pack = cell_(v[r], g, 'Pack'), size = cell_(v[r], g, 'Size per pack');
          if (!c.casePackRaw && pack) c.casePackRaw = pack + ' x ' + size;
          const price = money_(cell_(v[r], g, 'Case price'));
          if (price !== null && c.price === null) { c.price = price; c.priceDate = date; c.priceSource = 'Supplier guide (' + (date || 'date not found') + ')'; }
          if (!c.supplierStatus) c.supplierStatus = 'Listed in guide';
          addRef(c, tab.name + ' row ' + (r + 1) + (cell_(v[r], g, 'PDF page') ? ' (guide PDF page ' + cell_(v[r], g, 'PDF page') + ')' : ''));
        }
        return;
      }
      const m = findTable_(v, ['Category', 'Kathy item', 'Old item #', 'Status', 'Candidate #', 'Issue / next step']);
      if (m) {
        for (let r = m.row + 1; r < v.length; r++) {
          const kathy = cell_(v[r], m, 'Kathy item');
          if (!kathy) continue;
          const old = cell_(v[r], m, 'Old item #');
          const cand = cell_(v[r], m, 'Candidate #');
          const candDesc = cell_(v[r], m, 'Candidate description');
          const candPack = cell_(v[r], m, 'Candidate case pack');
          const issue = cell_(v[r], m, 'Issue / next step');
          const status = cell_(v[r], m, 'Status');
          const candText = cand ? 'Candidate (not approved): #' + cand + ' ' + candDesc + (candPack ? ' (' + candPack + ')' : '') : '';
          if (old) {
            const c = get(old);
            c.formName = c.formName || kathy;
            if (status && c.notes.indexOf('Order form status: ' + status) < 0) c.notes.push('Order form status: ' + status);
            if (issue && c.notes.indexOf(issue) < 0) c.notes.push(issue);
            if (candText && cand !== old) { c.replacementCandidate = cand; c.replacementNote = candText; }
            addRef(c, tab.name + ' row ' + (r + 1));
          } else {
            extras.push({ category: cell_(v[r], m, 'Category'), name: kathy, status, candidate: cand, candidateText: candText, issue, ref: tab.name + ' row ' + (r + 1) });
          }
        }
        return;
      }
      const si = findTable_(v, ['Old item #', 'Supplier status', 'Description', 'Brand', 'Old case pack']);
      if (si) {
        for (let r = si.row + 1; r < v.length; r++) {
          const num = cell_(v[r], si, 'Old item #');
          if (!num) continue;
          const c = get(num);
          c.supplierStatus = cell_(v[r], si, 'Supplier status') || c.supplierStatus;
          c.brand = c.brand || cell_(v[r], si, 'Brand');
          c.description = c.description || cell_(v[r], si, 'Description');
          c.casePackRaw = c.casePackRaw || cell_(v[r], si, 'Old case pack');
          addRef(c, tab.name + ' row ' + (r + 1));
        }
      }
    });
  }

  const deletedId = driveIdFrom_(b.deletedCsv);
  if (deletedId) {
    const rows = parseCsv_(drive.readText(deletedId));
    sources.push('Deleted items CSV (' + rows.length + ' lines)');
    let status = '';
    rows.forEach((r, i) => {
      const grp = String(r[1] || '').match(/Problem\s*:\s*([A-Za-z]+)/);
      if (grp) { status = grp[1]; return; }
      const num = String(r[1] || '').trim();
      if (!/^[A-Za-z0-9-]+$/.test(num) || i === 0) return;
      const c = get(num);
      c.supplierStatus = status || c.supplierStatus;
      c.brand = c.brand || String(r[2] || '').trim();
      c.description = c.description || String(r[5] || '').trim();
      if (!c.casePackRaw && r[3]) c.casePackRaw = String(r[3]).trim() + ' x ' + String(r[4] || '').trim();
      addRef(c, 'Deleted items CSV line ' + (i + 1));
    });
  }

  const graphId = driveIdFrom_(b.graphCsv);
  if (graphId) {
    const rows = parseCsv_(drive.readText(graphId));
    sources.push('Graph data CSV (' + Math.max(0, rows.length - 1) + ' rows)');
    const head = (rows[0] || []).map(normHeader_);
    const iDesc = head.indexOf('description'), iSales = head.indexOf('historical sales');
    rows.slice(1).forEach((r, i) => {
      const num = String(r[0] || '').trim();
      if (!num) return;
      const c = get(num);
      if (iDesc >= 0) c.description = c.description || String(r[iDesc] || '').trim();
      if (iSales >= 0) c.purchaseHistory.dollars2020_2026 = money_(r[iSales]);
      addRef(c, 'Graph data CSV line ' + (i + 2));
    });
  }

  let supplierInfo = null;
  const refId = driveIdFrom_(b.referenceTxt);
  if (refId) {
    const text = drive.readText(refId).replace(/\\([_<>!#&-])/g, '$1');
    sources.push('Ordering & email reference text');
    const contacts = text.match(/CONTACTS\s*\n([\s\S]*?)(?:\n\s*\n\s*SAVED ATTACHMENTS|\n\s*SAVED ATTACHMENTS)/);
    const cust = text.match(/Customer number[^:]*:\s*(\d+)\s*\(([^)]+)\)/i);
    supplierInfo = {
      contactsText: contacts ? contacts[1].split('\n').map((l) => l.trim()).filter(Boolean).join('\n') : '',
      customerNumber: cust ? cust[1] : '',
      customerName: cust ? cust[2].trim() : '',
    };
    if (!supplierInfo.contactsText) notes.push('Could not find the CONTACTS section in the reference text; enter contacts by hand.');
  }

  const list = Object.keys(cands).map((k) => cands[k]);
  if (!list.length && !extras.length && !supplierInfo) fail_('Nothing was read. Paste at least one source link.');
  return { list, extras, notes, sources, supplierInfo };
}

function candidateToItem_(c, now) {
  const pack = parseCasePack_(c.casePackRaw);
  const unclear = /not in guide|suspend|restrict|guide only/i.test(c.supplierStatus);
  return {
    id: newId_('i'), name: c.formName || c.name || c.description || ('Item #' + c.supplierItemNumber), department: '',
    active: false, category: c.category, supplierItemNumber: c.supplierItemNumber,
    supplierNumberStatus: 'from-supplier-records', description: c.description || c.name, brand: c.brand,
    casePackRaw: c.casePackRaw, packsPerCase: pack.packsPerCase, packSize: pack.packSize,
    countingUnit: '', countingUnitConfirmed: false, unitsPerCase: null, looseUnitLabel: '',
    unitsPerCaseConfirmed: false, desiredStock: null, supplierStatus: c.supplierStatus,
    replacementNote: c.replacementNote, replacementCandidate: c.replacementCandidate, replacementApproved: false,
    price: c.price, priceDate: c.priceDate, priceSource: c.price !== null ? c.priceSource + ' - confirm against the current guide or invoice before relying on it.' : '',
    priceHistory: c.priceHistory, purchaseHistory: c.purchaseHistory, sourceRefs: c.sourceRefs,
    notes: c.notes.concat(unclear ? ['Listing status needs confirmation with the supplier before ordering.'] : []).join('\n'),
    origin: 'ginsberg-import', legacyId: '', legacy: null, sortOrder: 0, createdAt: now, updatedAt: now,
  };
}

function importGinsberg_(b, commit) {
  const got = collectGinsberg_(b);
  const existing = db_().all('items');
  const byNum = {};
  existing.forEach((it) => { if (it.supplierItemNumber) byNum[it.supplierItemNumber] = it; });
  const byName = {};
  existing.forEach((it) => { byName[String(it.name).toLowerCase()] = it; });
  const newOnes = [], dupes = [], problems = [];
  got.list.forEach((c) => {
    if (!/^[A-Za-z0-9-]+$/.test(c.supplierItemNumber)) { problems.push('Skipped odd item number "' + c.supplierItemNumber + '"'); return; }
    if (!c.name && !c.description) problems.push('#' + c.supplierItemNumber + ' has no description in the sources');
    if (byNum[c.supplierItemNumber]) dupes.push({ c, existing: byNum[c.supplierItemNumber] });
    else newOnes.push(c);
  });
  const extraNew = got.extras.filter((x) => !byName[x.name.toLowerCase()]);
  const preview = {
    sources: got.sources,
    notes: got.notes,
    problems,
    newCount: newOnes.length,
    duplicateCount: dupes.length,
    extraCount: extraNew.length,
    supplierInfo: got.supplierInfo,
    sample: newOnes.slice(0, 40).map((c) => ({
      supplierItemNumber: c.supplierItemNumber, name: c.formName || c.name, description: c.description,
      casePackRaw: c.casePackRaw, supplierStatus: c.supplierStatus, price: c.price, priceDate: c.priceDate,
      replacementNote: c.replacementNote,
    })),
    duplicates: dupes.slice(0, 40).map((d) => ({ supplierItemNumber: d.c.supplierItemNumber, existingName: d.existing.name, removed: !!d.existing.archived })),
    removedDuplicateCount: dupes.filter((d) => d.existing.archived).length,
    extras: extraNew.slice(0, 60),
    refreshExisting: !!b.refreshExisting,
  };
  if (!commit) return preview;
  const now = nowIso_();
  const rows = newOnes.map((c) => candidateToItem_(c, now));
  extraNew.forEach((x) => {
    rows.push({
      id: newId_('i'), name: x.name, department: '', active: false, category: x.category, supplierItemNumber: '',
      supplierNumberStatus: 'none', description: '', brand: '', casePackRaw: '', packsPerCase: null, packSize: '',
      countingUnit: '', countingUnitConfirmed: false, unitsPerCase: null, looseUnitLabel: '', unitsPerCaseConfirmed: false,
      desiredStock: null, supplierStatus: x.status || 'Identify item', replacementNote: x.candidateText,
      replacementCandidate: x.candidate, replacementApproved: false, price: null, priceDate: '', priceSource: '',
      priceHistory: [], purchaseHistory: {}, sourceRefs: [x.ref], notes: x.issue,
      origin: 'ginsberg-import', legacyId: '', legacy: null, sortOrder: 0, createdAt: now, updatedAt: now,
    });
  });
  db_().insertMany('items', rows);
  let refreshed = 0;
  if (b.refreshExisting) {
    // Only supplier reference fields are refreshed. Todd's choices (active, department,
    // counting unit, units per case, desired stock, name) are never touched.
    dupes.forEach((d) => {
      const c = d.c;
      db_().update('items', d.existing.id, {
        supplierStatus: c.supplierStatus || d.existing.supplierStatus,
        price: c.price !== null ? c.price : d.existing.price,
        priceDate: c.price !== null ? c.priceDate : d.existing.priceDate,
        priceSource: c.price !== null ? c.priceSource + ' - confirm against the current guide or invoice before relying on it.' : d.existing.priceSource,
        priceHistory: c.priceHistory.length ? c.priceHistory : d.existing.priceHistory,
        purchaseHistory: Object.keys(c.purchaseHistory).length ? c.purchaseHistory : d.existing.purchaseHistory,
        sourceRefs: c.sourceRefs, updatedAt: now,
      });
      refreshed++;
    });
  }
  if (got.supplierInfo) {
    const s = allSettings_().supplier;
    putSetting_('supplier', Object.assign(s, {
      contactsText: s.contactsText || got.supplierInfo.contactsText,
      customerNumber: s.customerNumber || got.supplierInfo.customerNumber,
      customerName: s.customerName || got.supplierInfo.customerName,
    }));
  }
  const mig = allSettings_().migration;
  putSetting_('migration', Object.assign(mig, { ginsberg: 'imported ' + now.slice(0, 10) + ' (' + rows.length + ' candidates)' }));
  audit_('admin', 'ginsberg-import', { added: rows.length, refreshed, sources: got.sources });
  return { added: rows.length, refreshed, skippedDuplicates: b.refreshExisting ? 0 : dupes.length };
}

function supplierHistory_() {
  const items = db_().all('items').filter((it) => it.purchaseHistory && (it.purchaseHistory.cases2023_24 !== undefined || it.purchaseHistory.cases2020_2026 !== undefined));
  return {
    basis: 'Purchases from Ginsberg\'s (invoice-listed shipped cases by season, and the supplier\'s 2020-2026 sales report covering both Lapland Lake customer accounts). These are not retail sales, usage or inventory.',
    rows: items.map((it) => ({
      id: it.id, name: it.name, supplierItemNumber: it.supplierItemNumber, casePackRaw: it.casePackRaw,
      c2324: it.purchaseHistory.cases2023_24, c2526: it.purchaseHistory.cases2025_26,
      all: it.purchaseHistory.cases2020_2026, dollars: it.purchaseHistory.dollars2020_2026 === undefined ? null : it.purchaseHistory.dollars2020_2026,
    })).sort((a, b) => ((b.c2324 || 0) + (b.c2526 || 0)) - ((a.c2324 || 0) + (a.c2526 || 0))),
  };
}

/* ---------------------------------------------------------------- generic import (Base44 or other exports) */

const IMPORT_TYPES = {
  items: {
    label: 'Catalog items',
    fields: {
      legacyId: ['id', '_id', 'item id', 'record id'],
      name: ['name', 'item', 'item name', 'product', 'product name', 'title'],
      department: ['department', 'dept', 'area', 'location'],
      supplierItemNumber: ['supplier item number', 'item number', 'item #', 'sku', 'supplier sku', 'ginsberg number', 'product code'],
      description: ['description', 'supplier description'],
      casePackRaw: ['case pack', 'pack', 'pack size', 'package'],
      countingUnit: ['counting unit', 'unit', 'count unit', 'uom'],
      unitsPerCase: ['units per case', 'per case', 'case size', 'qty per case'],
      desiredStock: ['desired stock', 'par', 'par level', 'target', 'desired', 'target stock', 'desired amount'],
      active: ['active', 'is active', 'enabled'],
      category: ['category', 'type', 'group'],
    },
    required: ['name'],
  },
  counts: {
    label: 'Historical counts',
    fields: {
      legacyId: ['id', '_id'],
      itemName: ['item', 'item name', 'name', 'product'],
      itemLegacyId: ['item id', 'inventory item id', 'product id'],
      department: ['department', 'dept', 'area'],
      countedAt: ['counted at', 'date', 'created date', 'created at', 'timestamp', 'count date'],
      fullCases: ['full cases', 'cases', 'case count'],
      looseUnits: ['loose units', 'units', 'loose', 'quantity', 'count', 'qty'],
      unitsPerCase: ['units per case', 'case size'],
      countingUnit: ['counting unit', 'unit'],
      sessionKey: ['session', 'session id', 'count id', 'batch'],
    },
    required: ['itemName', 'countedAt'],
  },
  requests: {
    label: 'Supply requests',
    fields: {
      legacyId: ['id', '_id'],
      itemName: ['item', 'item name', 'name', 'request', 'product'],
      quantity: ['quantity', 'qty', 'amount'],
      quantityUnit: ['unit', 'quantity unit'],
      note: ['note', 'notes', 'comment', 'details'],
      status: ['status'],
      createdAt: ['created date', 'created at', 'date', 'timestamp'],
      kind: ['kind', 'type', 'source'],
    },
    required: ['itemName'],
  },
  orders: {
    label: 'Order history (one row per order line)',
    fields: {
      orderKey: ['order id', 'order', 'order number', 'po'],
      legacyId: ['id', '_id', 'line id'],
      date: ['date', 'order date', 'created date', 'created at', 'submitted at'],
      status: ['status'],
      department: ['department', 'dept'],
      supplierItemNumber: ['item number', 'item #', 'sku', 'supplier item number'],
      description: ['description', 'item', 'item name', 'name', 'product'],
      cases: ['cases', 'quantity', 'qty', 'final cases', 'order quantity'],
      casePackRaw: ['case pack', 'pack'],
    },
    required: ['orderKey', 'description', 'cases'],
  },
  bevProducts: {
    label: 'Beer / cider / wine / craft soda products (imported for review, never active)',
    fields: {
      legacyId: ['id', '_id'],
      name: ['name', 'product', 'product name', 'item'],
      type: ['type', 'category', 'kind'],
      container: ['container', 'bottle/can', 'unit'],
      unitsPerCase: ['units per case', 'per case', 'case size', 'bottles per case', 'cans per case'],
    },
    required: ['name'],
  },
};

function mapHeaders_(type, headers) {
  const spec = IMPORT_TYPES[type];
  const map = {};
  const used = {};
  Object.keys(spec.fields).forEach((f) => {
    const syns = spec.fields[f];
    for (let i = 0; i < headers.length; i++) {
      const h = normHeader_(headers[i]);
      if (!used[i] && (syns.indexOf(h) >= 0 || normHeader_(f) === h)) { map[f] = i; used[i] = true; break; }
    }
  });
  return { map, unmapped: headers.filter((h, i) => !used[i]) };
}

function importRows_(b, commit) {
  const type = b.type;
  if (!IMPORT_TYPES[type]) fail_('Choose what kind of data this file holds.');
  const headers = Array.isArray(b.headers) ? b.headers.map((h) => str_(h, 200)) : [];
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!headers.length || !rows.length) fail_('The file has no rows.');
  if (rows.length > 5000) fail_('Import at most 5,000 rows at a time.');
  const source = str_(b.sourceName, 200) || 'uploaded file';
  const m = b.mapping && typeof b.mapping === 'object' ? { map: b.mapping, unmapped: [] } : mapHeaders_(type, headers);
  const spec = IMPORT_TYPES[type];
  const missing = spec.required.filter((f) => m.map[f] === undefined || m.map[f] === null || m.map[f] === '');
  const out = { type, headers, mapping: m.map, unmapped: m.unmapped, missingRequired: missing, valid: 0, invalid: [], duplicates: [], sample: [] };
  if (missing.length) return out;
  const val = (row, f) => (m.map[f] === undefined || m.map[f] === null || m.map[f] === '') ? '' : str_(row[m.map[f]], 5000);
  const raw = (row) => { const o = {}; headers.forEach((h, i) => { o[h] = row[i]; }); return o; };
  const existingLegacy = {};
  const tableFor = { items: 'items', counts: 'entries', requests: 'requests', orders: 'orderLines', bevProducts: 'bevProducts' }[type];
  const legacyTable = type === 'orders' ? 'orders' : tableFor;
  db_().all(legacyTable).forEach((r) => { if (r.legacyId) existingLegacy[r.legacyId] = true; });
  const seen = {};
  const good = [];
  rows.forEach((row, i) => {
    if (!Array.isArray(row)) { out.invalid.push({ row: i + 2, why: 'Not a row' }); return; }
    const lid = val(row, type === 'orders' ? 'orderKey' : 'legacyId');
    const why = [];
    spec.required.forEach((f) => { if (!val(row, f)) why.push('missing ' + f); });
    if (type === 'counts') {
      ['fullCases', 'looseUnits'].forEach((f) => { const v = num_(val(row, f)); if (v !== null && (isNaN(v) || v < 0)) why.push(f + ' is not a number 0 or more'); });
      if (val(row, 'countedAt') && isNaN(new Date(val(row, 'countedAt')).getTime())) why.push('date not readable');
    }
    if (type === 'requests') { const q = num_(val(row, 'quantity')); if (q !== null && (isNaN(q) || q < 0)) why.push('quantity not readable'); }
    if (type === 'orders') { const q = num_(val(row, 'cases')); if (q === null || isNaN(q) || q < 0) why.push('cases not readable'); }
    if (why.length) { out.invalid.push({ row: i + 2, why: why.join(', ') }); return; }
    const dupKey = type === 'orders' ? lid + '|' + val(row, 'legacyId') + '|' + val(row, 'description') : (lid || JSON.stringify(row));
    if ((type !== 'orders' && lid && existingLegacy[lid]) || (type === 'orders' && existingLegacy[lid] && !b.allowExistingOrders)) {
      out.duplicates.push({ row: i + 2, why: 'Already imported (same original id ' + lid + ')' }); return;
    }
    if (seen[dupKey]) { out.duplicates.push({ row: i + 2, why: 'Same as row ' + seen[dupKey] }); return; }
    seen[dupKey] = i + 2;
    good.push({ row, i });
  });
  out.valid = good.length;
  out.sample = good.slice(0, 15).map((g) => { const o = {}; Object.keys(m.map).forEach((f) => { o[f] = val(g.row, f); }); return o; });
  if (!commit) return out;
  const now = nowIso_();
  const tag = 'import:' + source;
  if (type === 'items') {
    db_().insertMany('items', good.map((g) => {
      const r = g.row;
      const dept = val(r, 'department').toLowerCase();
      return {
        id: newId_('i'), name: val(r, 'name').slice(0, 120), department: dept.indexOf('house') >= 0 ? 'housekeeping' : dept.indexOf('caf') >= 0 ? 'cafe' : '',
        active: false, category: val(r, 'category'), supplierItemNumber: val(r, 'supplierItemNumber').slice(0, 30),
        supplierNumberStatus: val(r, 'supplierItemNumber') ? 'unverified' : 'none', description: val(r, 'description'),
        brand: '', casePackRaw: val(r, 'casePackRaw'), packsPerCase: parseCasePack_(val(r, 'casePackRaw')).packsPerCase,
        packSize: parseCasePack_(val(r, 'casePackRaw')).packSize, countingUnit: val(r, 'countingUnit'), countingUnitConfirmed: false,
        unitsPerCase: (function () { const v = num_(val(r, 'unitsPerCase')); return v === null || isNaN(v) ? null : v; })(),
        looseUnitLabel: '', unitsPerCaseConfirmed: false,
        desiredStock: (function () { const v = num_(val(r, 'desiredStock')); return v === null || isNaN(v) ? null : v; })(),
        supplierStatus: '', replacementNote: '', replacementCandidate: '', replacementApproved: false, price: null, priceDate: '', priceSource: '',
        priceHistory: [], purchaseHistory: {}, sourceRefs: [source + ' row ' + (g.i + 2)],
        notes: 'Imported from ' + source + '. Was ' + (bool_(val(r, 'active')) ? 'active' : 'not marked active') + ' there. Item number (if any) is unverified until matched to the supplier guide.',
        origin: tag, legacyId: val(r, 'legacyId'), legacy: raw(r), sortOrder: 0, createdAt: now, updatedAt: now,
      };
    }));
  } else if (type === 'counts') {
    // Historical counts keep the package information from the file itself, never today's catalog.
    const sessions = {};
    const entries = [];
    good.forEach((g) => {
      const r = g.row;
      const dept = val(r, 'department').toLowerCase().indexOf('caf') >= 0 ? 'cafe' : val(r, 'department').toLowerCase().indexOf('house') >= 0 ? 'housekeeping' : 'unknown';
      const at = new Date(val(r, 'countedAt')).toISOString();
      const sk = (val(r, 'sessionKey') || dept + ':' + at.slice(0, 10));
      if (!sessions[sk]) {
        sessions[sk] = { id: newId_('s'), kind: dept === 'unknown' ? 'housekeeping' : dept, status: 'completed', weekPeriod: weekPeriodOf_(new Date(at)), startedAt: at, completedAt: at, completedBy: 'import', incompleteAtCompletion: null, totalAtCompletion: null, reportVersion: 1, note: 'Imported from ' + source + (dept === 'unknown' ? ' (department not given in file)' : ''), origin: tag, legacyId: sk, createdAt: now, updatedAt: now };
      }
      const s = sessions[sk];
      if (at < s.startedAt) s.startedAt = at;
      if (at > s.completedAt) s.completedAt = at;
      const upc = num_(val(r, 'unitsPerCase'));
      entries.push({
        id: newId_('e'), sessionId: s.id, kind: s.kind, itemId: 'legacy:' + (val(r, 'itemLegacyId') || val(r, 'itemName')),
        fullCases: num_(val(r, 'fullCases')), looseUnits: num_(val(r, 'looseUnits')), flag: '', note: '', countedAt: at,
        snapshot: { name: val(r, 'itemName'), countingUnit: val(r, 'countingUnit'), unitsPerCase: upc === null || isNaN(upc) ? null : upc, unitsPerCaseConfirmed: false, countingUnitConfirmed: false, imported: true },
        origin: tag, legacyId: val(r, 'legacyId'), createdAt: now, updatedAt: now,
      });
    });
    db_().insertMany('sessions', Object.keys(sessions).map((k) => sessions[k]));
    db_().insertMany('entries', entries);
  } else if (type === 'requests') {
    db_().insertMany('requests', good.map((g) => {
      const r = g.row;
      const st = val(r, 'status').toLowerCase();
      const at = val(r, 'createdAt') && !isNaN(new Date(val(r, 'createdAt')).getTime()) ? new Date(val(r, 'createdAt')).toISOString() : now;
      const q = num_(val(r, 'quantity'));
      return {
        id: newId_('r'), kind: /drink|cooler/i.test(val(r, 'kind')) ? 'drink' : 'supply', itemName: val(r, 'itemName').slice(0, 120),
        optionId: '', quantity: q === null || isNaN(q) ? null : q, quantityUnit: val(r, 'quantityUnit'), note: val(r, 'note'),
        status: /order/.test(st) ? 'ordered' : 'shopping', photoIds: [], routingOverride: '',
        adminNote: 'Imported from ' + source + (st ? ' (original status: ' + val(r, 'status') + ')' : ''),
        statusChangedAt: at, origin: tag, legacyId: val(r, 'legacyId'), legacy: raw(r), createdAt: at, updatedAt: now,
      };
    }));
  } else if (type === 'orders') {
    const orders = {};
    const lines = [];
    good.forEach((g, n) => {
      const r = g.row;
      const key = val(r, 'orderKey');
      if (!orders[key]) {
        const d = val(r, 'date') && !isNaN(new Date(val(r, 'date')).getTime()) ? new Date(val(r, 'date')).toISOString() : '';
        orders[key] = { id: newId_('o'), supplier: 'ginsbergs', status: /draft/i.test(val(r, 'status')) ? 'draft' : 'submitted', deliveryDate: '', deadline: '', note: 'Imported from ' + source, basedOn: {}, totalCases: 0, submittedAt: d, submittedMethod: 'imported', submittedNote: val(r, 'status'), origin: tag, legacyId: key, legacy: null, createdAt: d || now, updatedAt: now };
      }
      const o = orders[key];
      const cases = num_(val(r, 'cases'));
      o.totalCases += cases;
      const dept = val(r, 'department').toLowerCase();
      lines.push({ id: newId_('l'), orderId: o.id, itemId: '', department: dept.indexOf('caf') >= 0 ? 'cafe' : dept.indexOf('house') >= 0 ? 'housekeeping' : '', supplierItemNumber: val(r, 'supplierItemNumber'), description: val(r, 'description'), casePackRaw: val(r, 'casePackRaw'), onHandCases: null, desiredStock: null, suggestedCases: null, finalCases: cases, flags: ['imported'], snapshot: { imported: true, raw: raw(r) }, sortOrder: n, note: '' });
    });
    db_().insertMany('orders', Object.keys(orders).map((k) => orders[k]));
    db_().insertMany('orderLines', lines);
  } else if (type === 'bevProducts') {
    db_().insertMany('bevProducts', good.map((g) => {
      const r = g.row;
      const t = val(r, 'type').toLowerCase();
      const upc = num_(val(r, 'unitsPerCase'));
      return {
        id: newId_('b'), name: val(r, 'name').slice(0, 120), type: BEV_TYPES.indexOf(t) >= 0 ? t : 'other', container: val(r, 'container'),
        unitsPerCase: upc === null || isNaN(upc) ? null : upc, packageConfirmed: false, active: false, reviewStatus: 'needs-review',
        source: source, notes: 'Imported for review. Confirm the exact product and case size before activating.', sortOrder: 0,
        origin: tag, legacyId: val(r, 'legacyId'), createdAt: now, updatedAt: now,
      };
    }));
  }
  if (/base44/i.test(source) || b.isBase44) {
    const mig = allSettings_().migration;
    mig.base44 = 'partly imported';
    mig.base44Log = (mig.base44Log || []).concat([{ at: now, type, rows: good.length, source }]);
    putSetting_('migration', mig);
  }
  audit_('admin', 'rows-import', { type, rows: good.length, source });
  return Object.assign(out, { imported: good.length });
}

/* ---------------------------------------------------------------- backup */

function backup_() {
  const out = { app: 'Lapland Lake Supply Manager', version: APP_VERSION, exportedAt: nowIso_(), tables: {} };
  Object.keys(TABLES).forEach((t) => { out.tables[t] = db_().all(t); });
  return out;
}

// Optional: run "installWeeklyDriveBackup" once in the editor to save a JSON backup to Drive weekly.
function installWeeklyDriveBackup() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'driveBackup').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('driveBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  db_().reset();
  putSetting_('backup', Object.assign(allSettings_().backup, { driveBackupEnabled: true }));
  driveBackup();
}
function driveBackup() {
  db_().reset();
  const data = JSON.stringify(backup_());
  const folder = gasFolder_(['Backups']);
  folder.createFile('supply-backup-' + nowIso_().slice(0, 10) + '.json', data, 'application/json');
  putSetting_('backup', Object.assign(allSettings_().backup, { lastBackupAt: nowIso_() }));
}

/* ---------------------------------------------------------------- data store */

function encode_(type, v) {
  if (v === null || v === undefined) return '';
  if (type === 'b') return v ? 'TRUE' : 'FALSE';
  if (type === 'n') return typeof v === 'number' && isFinite(v) ? String(v) : '';
  if (type === 'j') return JSON.stringify(v).slice(0, 49000);
  return String(v);
}
function decode_(type, v) {
  if (type === 's') return v === null || v === undefined ? '' : String(v);
  if (v === '' || v === null || v === undefined) return type === 'b' ? false : null;
  if (type === 'b') return v === true || String(v).toUpperCase() === 'TRUE';
  if (type === 'n') { const n = Number(v); return isFinite(n) ? n : null; }
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}

// Google Sheets store: one tab per table, header row of field names, every cell plain text
// so item numbers keep their leading zeros. Rows are cached for the length of one request.
function SheetStore(ss, strict) {
  this.ss = ss;
  this.cache = {};
  this.strict = !!strict; // tests: fail on fields that are not in the schema
}
SheetStore.prototype.check_ = function (table, obj) {
  if (!this.strict) return;
  Object.keys(obj).forEach((k) => { if (!TABLES[table][k] && k !== '__row') throw new Error('Unknown field ' + table + '.' + k); });
};
SheetStore.prototype.reset = function () { this.cache = {}; };
SheetStore.prototype.sheet_ = function (table) {
  let sh = this.ss.getSheetByName(table);
  const fields = Object.keys(TABLES[table]);
  if (!sh) {
    sh = this.ss.insertSheet(table);
    sh.getRange(1, 1, 1, fields.length).setValues([fields]);
  }
  return sh;
};
SheetStore.prototype.load_ = function (table) {
  if (this.cache[table]) return this.cache[table];
  const sh = this.sheet_(table);
  const values = sh.getDataRange().getValues();
  let header = values[0].map(String);
  const fields = Object.keys(TABLES[table]);
  const missing = fields.filter((f) => header.indexOf(f) < 0);
  if (missing.length) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    header = header.concat(missing);
  }
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (values[r].every((v) => v === '' || v === null)) continue;
    const o = {};
    fields.forEach((f) => { const i = header.indexOf(f); o[f] = decode_(TABLES[table][f], i < values[r].length ? values[r][i] : ''); });
    o.__row = r + 1;
    rows.push(o);
  }
  this.cache[table] = { sh, header, rows };
  return this.cache[table];
};
SheetStore.prototype.toRow_ = function (table, header, obj) {
  return header.map((h) => (TABLES[table][h] ? encode_(TABLES[table][h], obj[h]) : ''));
};
SheetStore.prototype.clean_ = function (o) { const c = Object.assign({}, o); delete c.__row; return c; };
SheetStore.prototype.all = function (table) { return this.load_(table).rows.map((r) => this.clean_(r)); };
SheetStore.prototype.get = function (table, id) {
  const r = this.load_(table).rows.filter((x) => x.id === id)[0];
  return r ? this.clean_(r) : null;
};
SheetStore.prototype.insertMany = function (table, objs) {
  if (!objs.length) return;
  objs.forEach((o) => this.check_(table, o));
  const t = this.load_(table);
  const start = t.sh.getLastRow() + 1;
  const vals = objs.map((o) => this.toRow_(table, t.header, o));
  const range = t.sh.getRange(start, 1, vals.length, t.header.length);
  range.setNumberFormat('@');
  range.setValues(vals);
  objs.forEach((o, i) => {
    const copy = {};
    Object.keys(TABLES[table]).forEach((f) => { copy[f] = decode_(TABLES[table][f], encode_(TABLES[table][f], o[f])); });
    copy.__row = start + i;
    t.rows.push(copy);
  });
};
SheetStore.prototype.insert = function (table, obj) { this.insertMany(table, [obj]); };
SheetStore.prototype.update = function (table, id, patch) {
  const t = this.load_(table);
  const r = t.rows.filter((x) => x.id === id)[0];
  if (!r) throw new Error('update: ' + table + ' ' + id + ' not found');
  this.check_(table, patch);
  Object.keys(patch).forEach((k) => { if (TABLES[table][k]) r[k] = decode_(TABLES[table][k], encode_(TABLES[table][k], patch[k])); });
  const range = t.sh.getRange(r.__row, 1, 1, t.header.length);
  range.setNumberFormat('@');
  range.setValues([this.toRow_(table, t.header, r)]);
};
SheetStore.prototype.remove = function (table, id) {
  const t = this.load_(table);
  const r = t.rows.filter((x) => x.id === id)[0];
  if (!r) return;
  t.sh.deleteRow(r.__row);
  t.rows = t.rows.filter((x) => x !== r);
  t.rows.forEach((x) => { if (x.__row > r.__row) x.__row--; });
};

function db_() { return platform_().store; }

/* ---------------------------------------------------------------- Google platform */

let PLATFORM_ = null;
function platform_() {
  if (!PLATFORM_) PLATFORM_ = gasPlatform_();
  return PLATFORM_;
}
function setPlatform_(p) { PLATFORM_ = p; }

function toUnsigned_(bytes) { const out = []; for (let i = 0; i < bytes.length; i++) out.push(bytes[i] & 255); return out; }
function toSigned_(bytes) { return bytes.map((b) => (b > 127 ? b - 256 : b)); }

function gasFolder_(path) {
  const props = PropertiesService.getScriptProperties();
  let folder;
  const rootId = props.getProperty('DRIVE_FOLDER_ID');
  if (rootId) folder = DriveApp.getFolderById(rootId);
  else {
    folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
    props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  }
  path.forEach((name) => {
    const it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
  });
  return folder;
}

function gasSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DATA_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create(DATA_SPREADSHEET_NAME);
  props.setProperty('DATA_SPREADSHEET_ID', ss.getId());
  DriveApp.getFileById(ss.getId()).moveTo(gasFolder_([]));
  return ss;
}

function gasPlatform_() {
  const props = PropertiesService.getScriptProperties();
  return {
    store: new SheetStore(gasSpreadsheet_()),
    props: {
      get: (k) => props.getProperty(k),
      set: (k, v) => props.setProperty(k, v),
      del: (k) => props.deleteProperty(k),
      keys: () => props.getKeys(),
    },
    cache: {
      get: (k) => CacheService.getScriptCache().get(k),
      put: (k, v, s) => CacheService.getScriptCache().put(k, v, s),
    },
    withLock: (fn) => {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) throw new UserError('The app is busy. Please try again in a moment.', 'busy');
      try { return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
    },
    now: () => new Date(),
    uuid: () => Utilities.getUuid(),
    hmacSha256: (key, msg) => toUnsigned_(Utilities.computeHmacSha256Signature(toSigned_(msg), toSigned_(key))),
    sha256: (bytes) => toUnsigned_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, toSigned_(bytes))),
    localParts: (date, tz) => {
      const s = Utilities.formatDate(date, tz, 'yyyy-MM-dd-HH-mm-u').split('-').map(Number);
      return { y: s[0], mo: s[1], d: s[2], h: s[3], mi: s[4], wd: s[5] };
    },
    photos: {
      save: (b64, mime, name) => gasFolder_(['Request Photos']).createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, name)).getId(),
      read: (fileId) => ({ data: Utilities.base64Encode(DriveApp.getFileById(fileId).getBlob().getBytes()) }),
      trash: (fileId) => DriveApp.getFileById(fileId).setTrashed(true),
    },
    mail: {
      remaining: () => MailApp.getRemainingDailyQuota(),
      send: (m) => MailApp.sendEmail({
        to: m.to, subject: m.subject, htmlBody: m.html, name: 'Lapland Lake Supply Manager',
        attachments: (m.attachments || []).map((a) => Utilities.newBlob(a.content, a.mimeType, a.name)),
      }),
    },
    drive: {
      readSpreadsheet: (id) => SpreadsheetApp.openById(id).getSheets().map((sh) => ({ name: sh.getName(), values: sh.getDataRange().getDisplayValues() })),
      readText: (id) => DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'),
    },
    log: (m) => console.log(m),
  };
}

// Run once from the editor: creates the data spreadsheet and Drive folders.
function setup() {
  const p = platform_();
  Object.keys(TABLES).forEach((t) => p.store.all(t));
  gasFolder_(['Request Photos']);
  p.log('Ready. Data spreadsheet: ' + gasSpreadsheet_().getUrl());
  p.log('Next: run createAdminSetupCode, then Deploy > New deployment > Web app.');
}

if (typeof module !== 'undefined') {
  module.exports = { handleApi_, setPlatform_, TABLES, SheetStore, parseCasePack_, nextDelivery_, weekPeriodOf_, createAdminSetupCode, pbkdf2_, parseCsv_, bevReport_ };
}
