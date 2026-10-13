// Backend tests: run with `npm test` in supply/. Uses disposable in-memory data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../dev/platform.mjs';
import { DRIVE_FILES, WEEKLY_ID, MASTER_ID, DELETED_ID, GRAPH_ID, REF_ID, driveLink } from './fixtures.mjs';

const PW = 'a-long-test-password';
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]).toString('base64');

const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
function ok(r) { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; }
function bad(r, re) { assert.equal(r.ok, false, 'expected failure'); if (re) assert.match(r.error.message, re); return r.error; }

function freshApp(opts) {
  const app = createApp(Object.assign({ driveFiles: JSON.parse(JSON.stringify(DRIVE_FILES)) }, opts || {}));
  const code = app.backend.createAdminSetupCode();
  const token = ok(app.call('adminSetup', { setupCode: code, newPassword: PW, confirmPassword: PW })).token;
  app.token = token;
  app.admin = (action, body) => app.call(action, Object.assign({ token }, body || {}));
  return app;
}
function addItem(app, item) { return ok(app.admin('adminSaveItem', { item })).item; }
function addBev(app, product) { return ok(app.admin('adminSaveBevProduct', { product })).products.filter((p) => p.name === product.name)[0]; }
function at(app, iso) { app.state.clock = new Date(iso).getTime(); }

test('password hashing is standard PBKDF2-HMAC-SHA256', () => {
  const app = createApp();
  const salt = [1, 2, 3, 4, 5, 6, 7, 8];
  const ours = Buffer.from(app.backend.pbkdf2_('pässword', salt, 50));
  const node = crypto.pbkdf2Sync(Buffer.from('pässword'), Buffer.from(salt), 50, 32, 'sha256');
  assert.equal(ours.toString('hex'), node.toString('hex'));
});

test('admin setup, sign-in, wrong passwords and lockout', () => {
  const app = createApp();
  assert.equal(ok(app.call('adminSetupStatus')).configured, false);
  bad(app.call('adminLogin', { password: 'x' }), /not been set up/);
  bad(app.call('adminSetup', { setupCode: 'WRONG', newPassword: PW, confirmPassword: PW }), /not valid/);
  const code = app.backend.createAdminSetupCode();
  bad(app.call('adminSetup', { setupCode: code, newPassword: 'short', confirmPassword: 'short' }), /at least 10/);
  ok(app.call('adminSetup', { setupCode: code, newPassword: PW, confirmPassword: PW }));
  bad(app.call('adminSetup', { setupCode: code, newPassword: PW, confirmPassword: PW }), /not valid/); // single use
  // Plain password is never stored.
  const stored = JSON.stringify([...app.props.entries()]);
  assert.ok(!stored.includes(PW));
  // The wrong setup code above already counted as one failed attempt.
  for (let i = 0; i < 4; i++) bad(app.call('adminLogin', { password: 'wrong-password-' + i }), /not right/);
  bad(app.call('adminLogin', { password: PW }), /paused/);
  app.state.clock = Date.now() + 16 * 60000;
  const t = ok(app.call('adminLogin', { password: PW })).token;
  assert.equal(ok(app.call('adminDashboard', { token: t })).checklist.password, true);
  ok(app.call('adminLogout', { token: t }));
  bad(app.call('adminDashboard', { token: t }), /sign in/);
});

test('sessions expire, and a password change signs everyone out', () => {
  const app = freshApp();
  ok(app.admin('adminDashboard'));
  bad(app.admin('adminChangePassword', { currentPassword: 'nope-nope-nope', newPassword: 'another-password-1' }), /current password/);
  ok(app.admin('adminChangePassword', { currentPassword: PW, newPassword: 'another-password-1' }));
  bad(app.admin('adminDashboard'), /sign in/);
  const t = ok(app.call('adminLogin', { password: 'another-password-1' })).token;
  app.state.clock = Date.now() + 13 * 3600000;
  bad(app.call('adminDashboard', { token: t }), /sign in/);
});

test('every admin action refuses anonymous and forged tokens', () => {
  const app = freshApp();
  const src = app.backend.handleApi_.toString(); // sanity: dispatcher exists
  assert.ok(src.includes('checkSession_'));
  const adminActions = ['adminLogout', 'adminChangePassword', 'adminDashboard', 'adminItems', 'adminSaveItem', 'adminCounts', 'adminCountDetail',
    'adminSaveCount', 'adminCompleteCount', 'adminReopenCount', 'adminOrders', 'adminOrder', 'adminCreateDraft', 'adminSaveOrder', 'adminSubmitOrder',
    'adminCancelOrder', 'adminSetDesiredStock', 'adminRequests', 'adminPhoto', 'adminUpdateRequest', 'adminDeleteRequest', 'adminLists', 'adminSaveSupply',
    'adminRemoveItems', 'adminLooseSuggest', 'adminLooseApply', 'adminFillPreview', 'adminFillCommit', 'adminBackupStatus', 'adminBackupOn', 'adminBackupOff', 'adminBackupNow', 'adminSaveDrink', 'adminBev', 'adminSaveBevProduct', 'adminSaveDelivery', 'adminDeleteRecord', 'adminSaveSale', 'adminSaveAdjustment', 'adminBevReport',
    'adminBevHistory', 'adminSettings', 'adminSaveSettings', 'adminSendReportEmail', 'adminSendTestEmail', 'adminImportGinsbergPreview',
    'adminImportGinsbergCommit', 'adminImportRowsPreview', 'adminImportRowsCommit', 'adminBackup', 'adminSupplierHistory', 'adminAudit'];
  for (const a of adminActions) {
    for (const token of [undefined, '', 'x'.repeat(64), app.token.slice(0, -1) + (app.token.endsWith('a') ? 'b' : 'a')]) {
      const r = app.call(a, { token });
      assert.equal(r.ok, false, a + ' should be refused');
      assert.equal(r.error.code, 'auth', a);
    }
  }
  bad(app.call('somethingElse'), /Unknown/);
  bad(app.call('__proto__'), /Unknown/);
  bad(app.call('constructor'), /Unknown/);
});

test('staff count: not counted vs zero, resume, validation, incomplete finish', () => {
  const app = freshApp();
  const a = addItem(app, { name: 'Toilet paper', department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, unitsPerCase: 96, unitsPerCaseConfirmed: true, looseUnitLabel: 'rolls', desiredStock: 4, active: true });
  const b = addItem(app, { name: 'Tissues', department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, active: true });
  const inactive = addItem(app, { name: 'Candidate only', department: 'housekeeping' });
  const cafeItem = addItem(app, { name: 'Cups', department: 'cafe', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 3, active: true });
  // Activation needs department, confirmed unit and desired stock.
  bad(app.admin('adminSaveItem', { id: inactive.id, item: { active: true } }), /confirmed counting unit, desired stock/);

  let sheet = ok(app.call('countSheet', { kind: 'housekeeping' }));
  same(sheet.items.map((i) => i.name).sort(), ['Tissues', 'Toilet paper']);
  assert.equal(sheet.session, null);
  for (const it of sheet.items) same(Object.keys(it).sort(), ['allowLoose', 'category', 'countingUnit', 'desiredStock', 'id', 'locations', 'looseUnitLabel', 'minimumStock', 'name', 'unitsPerCase']);

  bad(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, fullCases: '-1' }), /whole number/);
  bad(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, fullCases: '1.5' }), /whole number/);
  bad(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, looseUnits: '-3' }), /0 or more/);
  bad(app.call('saveCount', { kind: 'housekeeping', itemId: b.id, looseUnits: '3' }), /full cases only/);
  bad(app.call('saveCount', { kind: 'housekeeping', itemId: inactive.id, fullCases: 1 }), /not on the/);
  bad(app.call('saveCount', { kind: 'housekeeping', itemId: cafeItem.id, fullCases: 1 }), /not on the/);

  ok(app.call('saveCount', { kind: 'housekeeping', itemId: b.id, fullCases: '0' }));
  sheet = ok(app.call('countSheet', { kind: 'housekeeping' }));
  assert.equal(sheet.entries[b.id].fullCases, 0); // explicit zero
  assert.equal(sheet.entries[a.id], undefined); // not counted
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, fullCases: '2', looseUnits: '30' }));
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, fullCases: '3', looseUnits: '' })); // edit keeps one entry
  sheet = ok(app.call('countSheet', { kind: 'housekeeping' }));
  assert.equal(sheet.entries[a.id].fullCases, 3);
  assert.equal(sheet.entries[a.id].looseUnits, null);
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, clear: true }));
  sheet = ok(app.call('countSheet', { kind: 'housekeeping' }));
  assert.equal(sheet.entries[a.id], undefined);
  const done = ok(app.call('completeCount', { kind: 'housekeeping', sessionId: sheet.session.id }));
  assert.equal(done.notCounted, 1); // allowed, but reported
  // The finished count stays on screen for fixes until the order is sent.
  const after = ok(app.call('countSheet', { kind: 'housekeeping' }));
  assert.equal(after.session.id, sheet.session.id);
  assert.equal(after.finished.mode, 'draft');
});

test('count snapshots keep the package size that was used at the time', () => {
  const app = freshApp();
  const a = addItem(app, { name: 'Cups', department: 'cafe', countingUnit: 'case', countingUnitConfirmed: true, unitsPerCase: 20, unitsPerCaseConfirmed: true, looseUnitLabel: 'sleeves', desiredStock: 3, active: true });
  ok(app.call('saveCount', { kind: 'cafe', itemId: a.id, fullCases: 1, looseUnits: 10 }));
  const s = ok(app.call('countSheet', { kind: 'cafe' })).session;
  ok(app.call('completeCount', { kind: 'cafe', sessionId: s.id }));
  ok(app.admin('adminSaveItem', { id: a.id, item: { unitsPerCase: 50 } }));
  const d = ok(app.admin('adminCountDetail', { sessionId: s.id }));
  assert.equal(d.entries[0].snapshot.unitsPerCase, 20);
  const draft = ok(app.admin('adminCreateDraft'));
  const line = draft.lines.filter((l) => l.itemId === a.id)[0];
  assert.equal(line.onHandCases, 1.5); // 1 case + 10/20, from the snapshot, not today's 50
});

test('Ginsberg draft: combined departments, suggestions, flags, minimum warning, manual submit only', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z'); // Monday
  const hk = addItem(app, { name: 'Toilet paper', department: 'housekeeping', supplierItemNumber: '070626', description: 'TISSUE', casePackRaw: '96 x CT', countingUnit: 'case', countingUnitConfirmed: true, unitsPerCase: 96, unitsPerCaseConfirmed: true, desiredStock: 4, active: true });
  const cafe1 = addItem(app, { name: 'Soup', department: 'cafe', supplierItemNumber: '81266', casePackRaw: '4 x 4#', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 6, active: true });
  const cafe2 = addItem(app, { name: 'Not counted item', department: 'cafe', supplierItemNumber: '1', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, active: true });
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: hk.id, fullCases: 1, looseUnits: 48 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: cafe1.id, fullCases: 0, flag: 'out' }));
  ok(app.call('completeCount', { kind: 'housekeeping' }));
  const d = ok(app.admin('adminCreateDraft'));
  assert.equal(d.order.status, 'draft');
  assert.equal(d.order.deliveryDate, '2026-10-15');
  const L = (id) => d.lines.filter((l) => l.itemId === id)[0];
  assert.equal(L(hk.id).department, 'housekeeping');
  assert.equal(L(hk.id).onHandCases, 1.5);
  assert.equal(L(hk.id).suggestedCases, 3); // ceil(4 - 1.5)
  assert.equal(L(hk.id).supplierItemNumber, '070626'); // leading zero kept
  assert.equal(L(cafe1.id).suggestedCases, 6);
  assert.ok(L(cafe1.id).flags.includes('reported-out'));
  assert.ok(L(cafe1.id).flags.includes('count-not-finished'));
  assert.equal(L(cafe2.id).suggestedCases, null);
  assert.ok(L(cafe2.id).flags.includes('not-counted'));
  assert.equal(d.totalCases, 9);
  assert.ok(d.warnings.some((w) => /below the 20-case minimum/.test(w)));
  assert.ok(/HOUSEKEEPING[\s\S]*#070626[\s\S]*CAFE/.test(d.exportText));
  // Todd edits quantities; whole numbers only.
  bad(app.admin('adminSaveOrder', { orderId: d.order.id, lines: [{ id: L(cafe2.id).id, finalCases: '1.5' }] }), /whole numbers/);
  const saved = ok(app.admin('adminSaveOrder', { orderId: d.order.id, lines: [{ id: L(cafe2.id).id, finalCases: '2' }] }));
  assert.equal(saved.totalCases, 11);
  // Never submitted without explicit confirmation; below minimum is still allowed.
  bad(app.admin('adminSubmitOrder', { orderId: d.order.id }), /confirm/);
  assert.equal(ok(app.admin('adminOrder', { orderId: d.order.id })).order.status, 'draft');
  const sub = ok(app.admin('adminSubmitOrder', { orderId: d.order.id, confirm: 'I-SENT-IT', method: 'text' }));
  assert.equal(sub.order.status, 'submitted');
  bad(app.admin('adminSaveOrder', { orderId: d.order.id, lines: [] }), /Only draft/);
  // Desired stock never changed by any of this.
  const items = ok(app.admin('adminItems')).items;
  assert.equal(items.filter((i) => i.id === hk.id)[0].desiredStock, 4);
  assert.equal(items.filter((i) => i.id === cafe1.id)[0].desiredStock, 6);
  ok(app.admin('adminSetDesiredStock', { itemId: cafe1.id, desiredStock: 8 }));
  assert.equal(ok(app.admin('adminItems')).items.filter((i) => i.id === cafe1.id)[0].desiredStock, 8);
  assert.equal(app.state.sentMail.length, 0); // nothing emailed to the supplier
});

test('deadline: Wednesday 4:00 PM New York time, across daylight saving', () => {
  const app = createApp();
  const nd = (iso) => app.backend.nextDelivery_(new Date(iso));
  assert.equal(nd('2026-10-14T19:59:00Z').deliveryDate, '2026-10-15'); // Wed 3:59 PM EDT
  assert.equal(nd('2026-10-14T20:01:00Z').deliveryDate, '2026-10-22'); // Wed 4:01 PM EDT
  assert.equal(nd('2026-10-14T19:59:00Z').deadline, '2026-10-14T20:00:00.000Z');
  assert.equal(nd('2026-11-11T20:30:00Z').deliveryDate, '2026-11-12'); // EST: 3:30 PM
  assert.equal(nd('2026-11-11T20:30:00Z').deadline, '2026-11-11T21:00:00.000Z');
  assert.equal(app.backend.weekPeriodOf_(new Date('2026-10-12T03:00:00Z')), '2026-10-05'); // Sunday 11 PM in NY
});

test('requests: validation, photos, two statuses, staff see no private data', () => {
  const app = freshApp();
  ok(app.admin('adminSaveDrink', { name: 'Root beer', routing: 'beverage' }));
  const drink = ok(app.call('requestOptions', { kind: 'drink' })).options[0];
  same(Object.keys(drink).sort(), ['id', 'name']); // no routing for staff
  bad(app.call('submitRequest', { kind: 'supply', itemName: '', quantity: 1 }), /item name/);
  bad(app.call('submitRequest', { kind: 'supply', itemName: 'Soap', quantity: 0 }), /more than 0/);
  bad(app.call('submitRequest', { kind: 'supply', itemName: 'Soap', quantity: -2 }), /more than 0/);
  bad(app.call('submitRequest', { kind: 'supply', itemName: 'Soap', quantity: 'abc' }), /more than 0/);
  bad(app.call('uploadPhoto', { data: Buffer.from('hello, not an image').toString('base64') }), /Only photos/);
  bad(app.call('uploadPhoto', { data: JPEG + 'A'.repeat(6 * 1024 * 1024) }), /too large/);
  const p1 = ok(app.call('uploadPhoto', { data: JPEG })).photoToken;
  const p2 = ok(app.call('uploadPhoto', { data: 'data:image/png;base64,' + PNG })).photoToken;
  bad(app.call('submitRequest', { kind: 'drink', itemName: 'x', quantity: 1, photoTokens: ['nope'] }), /not received/);
  const r = ok(app.call('submitRequest', { kind: 'drink', optionId: drink.id, itemName: 'Root beer', quantity: '2', quantityUnit: 'cases', note: 'Top shelf empty', photoTokens: [p1, p2] }));
  assert.equal(r.status, 'On shopping list');
  assert.equal(r.photoCount, 2);
  bad(app.call('submitRequest', { kind: 'drink', itemName: 'again', quantity: 1, photoTokens: [p1] }), /not received/); // tokens are single use
  const mine = ok(app.call('recentRequests', { kind: 'drink' })).requests[0];
  same(Object.keys(mine).sort(), ['createdAt', 'id', 'itemName', 'note', 'photoCount', 'quantity', 'quantityUnit', 'status']);
  assert.equal(mine.status, 'On shopping list');
  // Staff cannot change the status: there is no staff action for it.
  bad(app.call('adminUpdateRequest', { requestId: r.id, status: 'ordered' }), /sign in/);
  // Todd sees photos, routing, and changes status; only two statuses exist.
  const all = ok(app.admin('adminRequests')).requests;
  assert.equal(all[0].routing, 'beverage');
  const ph = ok(app.admin('adminPhoto', { photoId: all[0].photoIds[1] }));
  assert.equal(ph.mimeType, 'image/png');
  bad(app.admin('adminUpdateRequest', { requestId: r.id, status: 'received' }), /On shopping list/);
  ok(app.admin('adminUpdateRequest', { requestId: r.id, status: 'ordered', routingOverride: 'supply', adminNote: 'private' }));
  assert.equal(ok(app.call('recentRequests', { kind: 'drink' })).requests[0].status, 'Ordered');
  assert.equal(ok(app.admin('adminRequests')).requests[0].routing, 'supply');
  const staffJson = JSON.stringify(ok(app.call('recentRequests', { kind: 'drink' })));
  assert.ok(!staffJson.includes('private') && !staffJson.includes('supply') && !staffJson.includes('file-'));
  bad(app.admin('adminDeleteRequest', { requestId: r.id }), /confirm/);
  ok(app.admin('adminDeleteRequest', { requestId: r.id, confirm: 'DELETE' }));
  assert.equal(app.photos.size, 0);
});

test('a failed photo upload saves nothing and can be retried', () => {
  const app = freshApp();
  app.state.failNextPhotos = 1;
  bad(app.call('uploadPhoto', { data: JPEG }), /went wrong/);
  assert.equal(ok(app.admin('adminRequests')).requests.length, 0);
  const t = ok(app.call('uploadPhoto', { data: JPEG })).photoToken;
  ok(app.call('submitRequest', { kind: 'supply', itemName: 'Mop heads', quantity: 3, photoTokens: [t] }));
});

test('staff submissions are rate limited', () => {
  const app = freshApp();
  for (let i = 0; i < 40; i++) ok(app.call('submitRequest', { kind: 'supply', itemName: 'x' + i, quantity: 1 }));
  bad(app.call('submitRequest', { kind: 'supply', itemName: 'one too many', quantity: 1 }), /Too many/);
});

test('beverages: case size must be confirmed before activation or conversion', () => {
  const app = freshApp();
  bad(app.admin('adminSaveBevProduct', { product: { name: 'Guess IPA', type: 'beer', unitsPerCase: 24, active: true } }), /Confirm the package size/);
  const p = addBev(app, { name: 'Real IPA', type: 'beer', unitsPerCase: 24 });
  assert.equal(p.reviewStatus, 'needs-review');
  assert.equal(ok(app.call('countSheet', { kind: 'beverage' })).items.length, 0);
  ok(app.admin('adminSaveBevProduct', { id: p.id, product: { packageConfirmed: true, active: true } }));
  const items = ok(app.call('countSheet', { kind: 'beverage' })).items;
  assert.equal(items[0].unitsPerCase, 24);
  bad(app.call('saveCount', { kind: 'beverage', itemId: p.id, looseUnits: '2.5' }), /whole number/);
  // Changing the case size un-confirms it unless re-confirmed.
  ok(app.admin('adminSaveBevProduct', { id: p.id, product: { unitsPerCase: 12, active: false } }));
  assert.equal(ok(app.admin('adminBev')).products[0].packageConfirmed, false);
});

test('beverage report: depletion formula, delivery interval, missing data, negatives, adjustments, sales', () => {
  const app = freshApp();
  const ipa = addBev(app, { name: 'IPA', type: 'beer', unitsPerCase: 24, packageConfirmed: true, active: true });
  const soda = addBev(app, { name: 'Root beer', type: 'craft soda', unitsPerCase: 12, packageConfirmed: true, active: true });
  const cider = addBev(app, { name: 'Cider', type: 'cider', unitsPerCase: 6, packageConfirmed: true, active: true });
  const wine = addBev(app, { name: 'Wine', type: 'wine', unitsPerCase: 12, packageConfirmed: true, active: true });
  const later = addBev(app, { name: 'Lager', type: 'beer', unitsPerCase: 24, packageConfirmed: true, active: true });
  // Week 1 count
  at(app, '2026-10-05T15:00:00Z');
  ok(app.call('saveCount', { kind: 'beverage', itemId: ipa.id, fullCases: 2, looseUnits: 5 })); // 53
  ok(app.call('saveCount', { kind: 'beverage', itemId: soda.id, fullCases: 1, looseUnits: 0 })); // 12
  ok(app.call('saveCount', { kind: 'beverage', itemId: cider.id, fullCases: 1 })); // 6
  ok(app.call('saveCount', { kind: 'beverage', itemId: wine.id, fullCases: 0, looseUnits: 4 })); // 4
  // lager not counted in week 1
  ok(app.call('completeCount', { kind: 'beverage' }));
  // Deliveries: one before week 1 count (must be ignored), one inside, one after week 2 count.
  ok(app.admin('adminSaveDelivery', { productId: ipa.id, deliveredAt: '2026-10-05T14:00:00Z', fullCases: 5 }));
  ok(app.admin('adminSaveDelivery', { productId: ipa.id, deliveredAt: '2026-10-08T15:00:00Z', fullCases: 1, looseUnits: 0 })); // +24
  ok(app.admin('adminSaveDelivery', { productId: ipa.id, deliveredAt: '2026-10-13T15:00:00Z', fullCases: 9 }));
  ok(app.admin('adminSaveAdjustment', { productId: ipa.id, type: 'waste', at: '2026-10-09T15:00:00Z', units: 3 }));
  ok(app.admin('adminSaveSale', { productId: ipa.id, periodStart: '2026-10-05T16:00:00Z', periodEnd: '2026-10-11T23:00:00Z', units: 40 }));
  // Week 2 count
  at(app, '2026-10-12T15:00:00Z');
  ok(app.call('saveCount', { kind: 'beverage', itemId: ipa.id, fullCases: 1, looseUnits: 1 })); // 25
  ok(app.call('saveCount', { kind: 'beverage', itemId: soda.id, fullCases: 1 })); // 12, no change
  ok(app.call('saveCount', { kind: 'beverage', itemId: cider.id, fullCases: 2 })); // 12 > 6 with no delivery -> negative
  ok(app.call('saveCount', { kind: 'beverage', itemId: later.id, fullCases: 1 }));
  // wine not counted in week 2
  ok(app.call('completeCount', { kind: 'beverage' }));
  const rep = ok(app.admin('adminBevReport', {})).report;
  const R = (n) => rep.rows.filter((r) => r.name === n)[0];
  assert.equal(R('IPA').previousUnits, 53);
  assert.equal(R('IPA').deliveredUnits, 24); // only the delivery between the two count times
  assert.equal(R('IPA').currentUnits, 25);
  assert.equal(R('IPA').depletion, 52); // 53 + 24 - 25
  assert.equal(R('IPA').adjustmentUnits, 3);
  assert.equal(R('IPA').usageEstimate, 49);
  assert.equal(R('IPA').recordedSales, 40); // separate, never mixed in
  assert.equal(R('IPA').status, 'ok');
  assert.equal(R('Root beer').status, 'zero');
  assert.equal(R('Root beer').recordedSales, null); // missing sales is not zero
  assert.equal(R('Cider').status, 'review');
  assert.equal(R('Cider').depletion, -6);
  assert.equal(R('Wine').status, 'insufficient');
  assert.equal(R('Wine').usageEstimate, null);
  assert.equal(R('Lager').status, 'insufficient');
  assert.match(rep.basis, /not exact sales/);
  // First week has nothing to compare with.
  const first = ok(app.admin('adminBevReport', { sessionId: ok(app.admin('adminBevReport', {})).sessions[1].id })).report;
  assert.ok(first.rows.every((r) => r.status === 'insufficient'));
  const hist = ok(app.admin('adminBevHistory'));
  assert.equal(hist.weeks.length, 2);
  same(hist.weeks.map((w) => w.weekPeriod), ['2026-10-05', '2026-10-12']);
});

test('beverage report: a delivery without a confirmed case size makes the period insufficient', () => {
  const app = freshApp();
  const p = addBev(app, { name: 'IPA', type: 'beer', unitsPerCase: 24, packageConfirmed: true, active: true });
  at(app, '2026-10-05T15:00:00Z');
  ok(app.call('saveCount', { kind: 'beverage', itemId: p.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'beverage' }));
  ok(app.admin('adminSaveBevProduct', { id: p.id, product: { unitsPerCase: 12, active: false } })); // unconfirmed now
  ok(app.admin('adminSaveDelivery', { productId: p.id, deliveredAt: '2026-10-07T15:00:00Z', fullCases: 2 }));
  ok(app.admin('adminSaveBevProduct', { id: p.id, product: { unitsPerCase: 24, packageConfirmed: true, active: true } }));
  at(app, '2026-10-12T15:00:00Z');
  ok(app.call('saveCount', { kind: 'beverage', itemId: p.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'beverage' }));
  const r = ok(app.admin('adminBevReport', {})).report.rows[0];
  assert.equal(r.status, 'insufficient');
  assert.ok(r.notes.some((n) => /no confirmed case size/.test(n)));
});

test('weekly email: blank until configured, sent once per report version, failures retryable', () => {
  const app = freshApp();
  const p = addBev(app, { name: 'IPA', type: 'beer', unitsPerCase: 24, packageConfirmed: true, active: true });
  ok(app.call('saveCount', { kind: 'beverage', itemId: p.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'beverage' }));
  assert.equal(app.state.sentMail.length, 0);
  let s = ok(app.admin('adminSettings'));
  assert.equal(s.settings.email.recipient, ''); // never guessed
  assert.equal(s.emailLog[0].status, 'not-configured');
  bad(app.admin('adminSaveSettings', { email: { recipient: 'not an email', enabled: true } }), /does not look right/);
  ok(app.admin('adminSaveSettings', { email: { recipient: 'todd@example.com', enabled: true } }));
  bad(app.admin('adminSendTestEmail', {}), /confirm/);
  const sid = s.emailLog[0].sessionId;
  app.state.failMail = true;
  let r = ok(app.admin('adminSendReportEmail', { sessionId: sid }));
  assert.equal(r.result.status, 'failed');
  assert.match(r.result.error, /Simulated/);
  app.state.failMail = false;
  r = ok(app.admin('adminSendReportEmail', { sessionId: sid }));
  assert.equal(r.result.status, 'sent');
  assert.equal(app.state.sentMail.length, 1);
  assert.equal(app.state.sentMail[0].to, 'todd@example.com');
  assert.match(app.state.sentMail[0].html, /IPA/);
  assert.match(app.state.sentMail[0].attachments[0].content, /Product,Type/);
  r = ok(app.admin('adminSendReportEmail', { sessionId: sid }));
  assert.equal(r.result.status, 'duplicate');
  assert.equal(app.state.sentMail.length, 1);
  // Reopen + finish again = new report version = one new email automatically.
  ok(app.admin('adminReopenCount', { sessionId: sid }));
  ok(app.call('saveCount', { kind: 'beverage', itemId: p.id, fullCases: 2 }));
  ok(app.call('completeCount', { kind: 'beverage', sessionId: sid }));
  assert.equal(app.state.sentMail.length, 2);
  ok(app.call('completeCount', { kind: 'beverage', sessionId: sid })); // repeated tap
  assert.equal(app.state.sentMail.length, 2);
  // Staff completing a count do not see email results.
  ok(app.admin('adminSaveSettings', { email: { recipient: '', enabled: true } }));
  assert.equal(ok(app.admin('adminSettings')).settings.email.enabled, false);
});

test('Ginsberg import: inactive candidates, item numbers as text, prices dated, duplicates, refresh keeps Todd’s choices', () => {
  const app = freshApp();
  const links = { weeklySheet: driveLink(WEEKLY_ID), masterSheet: driveLink(MASTER_ID), deletedCsv: driveLink(DELETED_ID), graphCsv: driveLink(GRAPH_ID), referenceTxt: driveLink(REF_ID) };
  bad(app.admin('adminImportGinsbergPreview', { weeklySheet: 'not a link' }), /Google Drive link/);
  const prev = ok(app.admin('adminImportGinsbergPreview', links));
  assert.equal(prev.newCount, 7); // 90001-90006 + 00412
  assert.equal(prev.extraCount, 1); // "TEST Teas" without a number
  assert.equal(ok(app.admin('adminItems')).items.length, 0); // preview saves nothing
  const res = ok(app.admin('adminImportGinsbergCommit', links));
  assert.equal(res.added, 8);
  const items = ok(app.admin('adminItems')).items;
  assert.ok(items.every((i) => i.active === false));
  const by = (n) => items.filter((i) => i.supplierItemNumber === n)[0];
  assert.ok(by('00412'), 'leading zero preserved');
  assert.equal(by('00412').price, 4.44);
  assert.equal(by('00412').priceDate, '2026-10-09');
  assert.match(by('00412').priceSource, /confirm against the current guide/);
  assert.equal(by('90002').packsPerCase, 20);
  assert.equal(by('90002').packSize, '50 CT'); // 20 x 50 CT is not "20 cups"
  assert.equal(by('90002').unitsPerCase, null);
  assert.equal(by('90002').countingUnitConfirmed, false);
  assert.equal(by('90001').brand, 'TESTBRAND');
  assert.equal(by('90001').purchaseHistory.cases2023_24, 8);
  assert.equal(by('90001').purchaseHistory.dollars2020_2026, 999.99);
  assert.equal(by('90001').priceHistory.length, 2);
  assert.equal(by('90004').supplierStatus, 'Suspended');
  assert.equal(by('90004').replacementCandidate, '90003');
  assert.equal(by('90004').replacementApproved, false);
  assert.match(by('90004').replacementNote, /not approved/);
  assert.equal(by('90006').supplierStatus, 'Restricted');
  assert.equal(by('90005').supplierStatus, 'Guide only (no saved purchases)');
  assert.equal(by('90003').packsPerCase, 4);
  assert.equal(by('90003').packSize, '4#'); // weight pack stays as text
  const teas = items.filter((i) => i.name === 'TEST Teas')[0];
  assert.equal(teas.supplierItemNumber, '');
  const set = ok(app.admin('adminSettings')).settings.supplier;
  assert.equal(set.customerNumber, '99999');
  assert.match(set.contactsText, /test\.rep@example\.com/);
  // Todd configures an item, then re-imports with refresh: his choices survive.
  ok(app.admin('adminSaveItem', { id: by('90001').id, item: { name: 'Toilet paper', department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 5, active: true } }));
  const again = ok(app.admin('adminImportGinsbergCommit', links));
  assert.equal(again.added, 0);
  assert.equal(again.skippedDuplicates, 7);
  ok(app.admin('adminImportGinsbergCommit', Object.assign({ refreshExisting: true }, links)));
  const after = ok(app.admin('adminItems')).items.filter((i) => i.supplierItemNumber === '90001')[0];
  assert.equal(after.name, 'Toilet paper');
  assert.equal(after.desiredStock, 5);
  assert.equal(after.active, true);
  assert.equal(ok(app.admin('adminItems')).items.length, 8);
  // Staff never see prices or supplier details.
  const staff = JSON.stringify(ok(app.call('countSheet', { kind: 'housekeeping' })));
  assert.ok(!/price|supplier|11\.11|90001/i.test(staff));
  const hist = ok(app.admin('adminSupplierHistory'));
  assert.match(hist.basis, /not retail sales/);
});

test('spreadsheet file import: preview, validation, duplicates, history keeps its own package sizes', () => {
  const app = freshApp();
  const headers = ['id', 'Item Name', 'Department', 'Par Level', 'Item Number', 'Case Pack'];
  const rows = [['b1', 'Paper towels', 'Housekeeping', '6', '070849', '30 x CT'], ['b2', 'Cups', 'Cafe', '3', '', '20 x 50 CT'], ['b2', 'Cups', 'Cafe', '3', '', ''], ['b3', '', 'Cafe', '1', '', '']];
  const p = ok(app.admin('adminImportRowsPreview', { type: 'items', headers, rows, sourceName: 'old items.csv' }));
  assert.equal(p.valid, 2);
  assert.equal(p.duplicates.length, 1);
  assert.equal(p.invalid.length, 1);
  assert.equal(p.mapping.desiredStock, 3);
  const c = ok(app.admin('adminImportRowsCommit', { type: 'items', headers, rows, sourceName: 'old items.csv' }));
  assert.equal(c.imported, 2);
  const items = ok(app.admin('adminItems')).items;
  const towels = items.filter((i) => i.legacyId === 'b1')[0];
  assert.equal(towels.supplierItemNumber, '070849');
  assert.equal(towels.supplierNumberStatus, 'unverified');
  assert.equal(towels.active, false);
  assert.equal(towels.desiredStock, 6);
  assert.equal(towels.department, 'housekeeping');
  // Second import of the same file finds them all as duplicates.
  assert.equal(ok(app.admin('adminImportRowsPreview', { type: 'items', headers, rows, sourceName: 'x' })).valid, 0);
  // Historical counts
  const ch = ['Item', 'Department', 'Date', 'Cases', 'Loose', 'Units per case'];
  const cr = [['Paper towels', 'Housekeeping', '2026-01-10T15:00:00Z', '2', '5', '30'], ['Cups', 'Cafe', '2026-01-10T16:00:00Z', 'x', '', '']];
  const cp = ok(app.admin('adminImportRowsPreview', { type: 'counts', headers: ch, rows: cr, sourceName: 'counts.csv', mapping: { itemName: 0, department: 1, countedAt: 2, fullCases: 3, looseUnits: 4, unitsPerCase: 5 } }));
  assert.equal(cp.valid, 1);
  assert.equal(cp.invalid.length, 1);
  ok(app.admin('adminImportRowsCommit', { type: 'counts', headers: ch, rows: cr, sourceName: 'counts.csv', mapping: { itemName: 0, department: 1, countedAt: 2, fullCases: 3, looseUnits: 4, unitsPerCase: 5 } }));
  const sess = ok(app.admin('adminCounts')).sessions;
  assert.equal(sess.length, 1);
  assert.equal(sess[0].kind, 'housekeeping');
  const det = ok(app.admin('adminCountDetail', { sessionId: sess[0].id }));
  assert.equal(det.entries[0].snapshot.unitsPerCase, 30);
  assert.equal(det.entries[0].snapshot.imported, true);
  const mig = ok(app.admin('adminSettings')).settings.migration;
  same(Object.keys(mig).sort(), ['ginsberg', 'notes']);
  // Order history (one row per line)
  const oh = ['Order ID', 'Date', 'Department', 'Item #', 'Description', 'Cases'];
  const orr = [['o1', '2026-01-08', 'Cafe', '064572', 'CUP HOT', '2'], ['o1', '2026-01-08', 'Housekeeping', '070626', 'TISSUE', '3']];
  ok(app.admin('adminImportRowsCommit', { type: 'orders', headers: oh, rows: orr, sourceName: 'orders.csv' }));
  const ord = ok(app.admin('adminOrders')).orders;
  assert.equal(ord.length, 1);
  assert.equal(ord[0].status, 'submitted');
  assert.equal(ord[0].totalCases, 5);
});

test('the Google Sheets store keeps text exactly (leading zeros, long notes)', () => {
  const app = freshApp();
  const it = addItem(app, { name: 'Zero test', supplierItemNumber: '000123', notes: 'x'.repeat(1500) });
  const raw = app.ss.getSheetByName('items').data;
  const col = raw[0].indexOf('supplierItemNumber');
  assert.equal(raw[1][col], '000123');
  assert.equal(ok(app.admin('adminItems')).items.filter((i) => i.id === it.id)[0].supplierItemNumber, '000123');
  bad(app.admin('adminSaveItem', { item: { name: 'Bad', supplierItemNumber: '12 34' } }), /letters, digits/);
});

test('backup contains every table', () => {
  const app = freshApp();
  const b = ok(app.admin('adminBackup'));
  for (const t of ['items', 'sessions', 'entries', 'orders', 'orderLines', 'requests', 'photos', 'supplies', 'drinks', 'bevProducts', 'deliveries', 'sales', 'adjustments', 'emailLog', 'settings', 'audit']) {
    assert.ok(Array.isArray(b.tables[t]), t);
  }
});

test('remove and restore catalog items: hidden, history kept, never on a staff list, re-import skips them', () => {
  const app = freshApp();
  const links = { weeklySheet: driveLink(WEEKLY_ID) };
  ok(app.admin('adminImportGinsbergCommit', links));
  let items = ok(app.admin('adminItems')).items;
  const a = items.filter((i) => i.supplierItemNumber === '90001')[0];
  const b = items.filter((i) => i.supplierItemNumber === '90005')[0];
  ok(app.admin('adminSaveItem', { id: a.id, item: { department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, active: true } }));
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: a.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'housekeeping' }));
  bad(app.admin('adminRemoveItems', { ids: [] }), /at least one/);
  const r = ok(app.admin('adminRemoveItems', { ids: [a.id, b.id] }));
  assert.equal(r.changed, 2);
  items = ok(app.admin('adminItems')).items;
  const A = items.filter((i) => i.id === a.id)[0];
  assert.equal(A.archived, true);
  assert.equal(A.active, false); // removing also switches it off
  assert.equal(ok(app.call('countSheet', { kind: 'housekeeping' })).items.length, 0);
  bad(app.admin('adminSaveItem', { id: a.id, item: { active: true } }), /Restore this item/);
  // History is untouched.
  const sess = ok(app.admin('adminCounts')).sessions[0];
  assert.equal(ok(app.admin('adminCountDetail', { sessionId: sess.id })).entries.length, 1);
  // Re-import does not duplicate removed items, and says so.
  const prev = ok(app.admin('adminImportGinsbergPreview', links));
  assert.equal(prev.newCount, 0);
  assert.equal(prev.removedDuplicateCount, 2);
  assert.equal(ok(app.admin('adminDashboard')).catalog.removed, 2);
  // Restore brings it back inactive; Todd can activate it again.
  ok(app.admin('adminRemoveItems', { ids: [a.id], restore: true }));
  const back = ok(app.admin('adminItems')).items.filter((i) => i.id === a.id)[0];
  assert.equal(back.archived, false);
  assert.equal(back.active, false);
  assert.equal(back.desiredStock, 2); // settings kept
  ok(app.admin('adminSaveItem', { id: a.id, item: { active: true } }));
  assert.equal(ok(app.call('countSheet', { kind: 'housekeeping' })).items.length, 1);
  // Staff cannot remove items.
  bad(app.call('adminRemoveItems', { ids: [a.id] }), /sign in/);
});


// ---------------------------------------------------------------- minimum stock, auto drafts, prices, backup

function cafeItem(app, extra) {
  return addItem(app, Object.assign({ department: 'cafe', countingUnit: 'case', countingUnitConfirmed: true, active: true, supplierItemNumber: '1' }, extra));
}

test('minimum stock: editable, never above desired, importable from a spreadsheet', () => {
  const app = freshApp();
  bad(app.admin('adminSaveItem', { item: { name: 'X', desiredStock: 2, minimumStock: 3 } }), /can't be more than desired/);
  const it = addItem(app, { name: 'Y', desiredStock: 3, minimumStock: 1 });
  assert.equal(it.minimumStock, 1);
  const headers = ['Name', 'Department', 'Desired', 'Minimum', 'Notes'];
  const rows = [['Cups', 'Cafe', '3', '1', 'shelf B'], ['Lids', 'Cafe', '2', '5', '']];
  const p = ok(app.admin('adminImportRowsPreview', { type: 'items', headers, rows, sourceName: 'items.csv' }));
  assert.equal(p.valid, 1);
  assert.match(p.invalid[0].why, /minimum stock is more than desired/);
  ok(app.admin('adminImportRowsCommit', { type: 'items', headers, rows, sourceName: 'items.csv' }));
  const cups = ok(app.admin('adminItems')).items.filter((i) => i.name === 'Cups')[0];
  assert.equal(cups.minimumStock, 1);
  assert.match(cups.notes, /^shelf B/);
});

test('reorder rule: at or below minimum orders up to desired; above minimum orders nothing; no minimum is flagged', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z');
  const a = cafeItem(app, { name: 'At minimum', desiredStock: 3, minimumStock: 2 });
  const b = cafeItem(app, { name: 'Above minimum', desiredStock: 3, minimumStock: 2 });
  const c = cafeItem(app, { name: 'Min equals target', desiredStock: 1, minimumStock: 1 });
  const d = cafeItem(app, { name: 'No minimum', desiredStock: 4 });
  const e = cafeItem(app, { name: 'Below, fraction', desiredStock: 5, minimumStock: 2, unitsPerCase: 10, unitsPerCaseConfirmed: true, looseUnitLabel: 'packs' });
  ok(app.call('saveCount', { kind: 'cafe', itemId: a.id, fullCases: 2 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: b.id, fullCases: 3 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: c.id, fullCases: 1 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: d.id, fullCases: 3 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: e.id, fullCases: 1, looseUnits: 5 })); // 1.5 cases
  const done = ok(app.call('completeCount', { kind: 'cafe' }));
  assert.equal(done.draft, undefined); // staff don't see order details
  const orders = ok(app.admin('adminOrders')).orders;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, 'draft');
  const o = ok(app.admin('adminOrder', { orderId: orders[0].id }));
  const L = (id) => o.lines.filter((l) => l.itemId === id)[0];
  assert.equal(L(a.id).suggestedCases, 1);
  assert.equal(L(b.id).suggestedCases, 0);
  assert.equal(L(c.id).suggestedCases, 0); // 1 on hand, target 1
  assert.equal(L(d.id).suggestedCases, 1);
  assert.ok(L(d.id).flags.includes('no-minimum'));
  assert.equal(L(e.id).suggestedCases, 4); // ceil(5 - 1.5)
  assert.equal(o.summary.totalCases, 6);
  assert.equal(o.summary.minimumCases, 20);
  assert.equal(o.summary.deliveryDate, '2026-10-15');
  assert.equal(o.summary.deadline, '2026-10-14T20:00:00.000Z'); // Wed 4 PM New York
  assert.equal(o.summary.deadlinePassed, false);
  assert.ok(o.warnings.some((w) => /below the 20-case minimum/.test(w)));
  assert.ok(o.warnings.some((w) => /No Housekeeping count is in this draft yet/.test(w)));
  assert.equal(app.state.sentMail.length, 0);
});

test('auto draft: one per delivery, each count refreshes its own department, hand edits survive', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z');
  const cafe = cafeItem(app, { name: 'Soup', desiredStock: 6, minimumStock: 2 });
  const hk = addItem(app, { name: 'TP', department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 4, minimumStock: 2, active: true, supplierItemNumber: '2' });
  ok(app.call('saveCount', { kind: 'cafe', itemId: cafe.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'cafe' }));
  let o = ok(app.admin('adminOrder', { orderId: ok(app.admin('adminOrders')).orders[0].id }));
  assert.equal(o.lines.length, 1);
  assert.match(o.order.autoFrom, /Cafe count/);
  const line = o.lines[0];
  ok(app.admin('adminSaveOrder', { orderId: o.order.id, lines: [{ id: line.id, finalCases: '8' }] }));
  at(app, '2026-10-12T16:00:00Z');
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: hk.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'housekeeping' }));
  // Tuesday: staff fix the finished count (soup sold out); the draft updates right away.
  at(app, '2026-10-13T14:00:00Z');
  ok(app.call('saveCount', { kind: 'cafe', itemId: cafe.id, fullCases: 0 }));
  const all = ok(app.admin('adminOrders')).orders;
  assert.equal(all.length, 1); // still one draft for Thursday
  o = ok(app.admin('adminOrder', { orderId: all[0].id }));
  const soup = o.lines.filter((l) => l.itemId === cafe.id)[0];
  assert.equal(soup.suggestedCases, 6); // recalculated from the new count
  assert.equal(soup.finalCases, 8); // Todd's number kept
  assert.match(soup.countChange, /Count changed Tue 10:00 AM \(1 → 0\)/);
  assert.equal(o.lines.filter((l) => l.itemId === hk.id)[0].finalCases, 3);
  assert.equal(o.summary.totalCases, 11);
  // After the Wednesday deadline, the next count starts a draft for the following Thursday.
  at(app, '2026-10-14T21:00:00Z');
  ok(app.call('saveCount', { kind: 'cafe', itemId: cafe.id, fullCases: 1 }));
  ok(app.call('completeCount', { kind: 'cafe' }));
  const t2 = ok(app.call('adminLogin', { password: PW })).token; // the 12-hour session expired as the clock moved on
  const later = ok(app.call('adminOrders', { token: t2 })).orders;
  assert.equal(later.length, 2);
  assert.equal(later[0].deliveryDate, '2026-10-22');
  // A draft past its deadline says so.
  assert.equal(ok(app.call('adminOrder', { token: t2, orderId: later[1].id })).summary.deadlinePassed, true);
});

test('prices: own price first, else the newest price for the same item # anywhere in the catalog; running total', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z');
  addItem(app, { name: 'Old record', supplierItemNumber: '81266', price: 50, priceDate: '2024-02-22' });
  addItem(app, { name: 'Guide record', supplierItemNumber: '81266', price: 56.81, priceDate: '2026-10-09' });
  const soup = cafeItem(app, { name: 'Red lentil', supplierItemNumber: '81266', desiredStock: 3, minimumStock: 1 });
  const own = cafeItem(app, { name: 'Own price', supplierItemNumber: '9', price: 10, priceDate: '2026-01-01', desiredStock: 2, minimumStock: 1 });
  const none = cafeItem(app, { name: 'No price', supplierItemNumber: '77', desiredStock: 2, minimumStock: 1 });
  [soup, own, none].forEach((it) => ok(app.call('saveCount', { kind: 'cafe', itemId: it.id, fullCases: 0 })));
  ok(app.call('completeCount', { kind: 'cafe' }));
  const o = ok(app.admin('adminOrder', { orderId: ok(app.admin('adminOrders')).orders[0].id }));
  const L = (id) => o.lines.filter((l) => l.itemId === id)[0];
  assert.equal(L(soup.id).price, 56.81);
  assert.equal(L(soup.id).priceDate, '2026-10-09');
  assert.equal(L(own.id).price, 10);
  assert.equal(L(none.id).price, null);
  assert.equal(o.summary.totalDollars, 190.43); // 3 x 56.81 + 2 x 10
  assert.equal(o.summary.unpricedLines, 1);
  assert.ok(!/56\.81/.test(o.exportText)); // the text sent to Ginsberg's has no prices
});

test('fill from notes & Ginsberg records: preview first, never overwrites, verifies matching item #s', () => {
  const app = freshApp();
  ok(app.admin('adminImportGinsbergCommit', { weeklySheet: driveLink(WEEKLY_ID) }));
  const a = addItem(app, { name: 'Toilet paper', department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 3, active: true, supplierItemNumber: '90001', supplierNumberStatus: 'unverified', notes: 'Suggested minimum 2, target 3 cases (25/26: 14 cases over 10 orders).' });
  const b = addItem(app, { name: 'Kept', department: 'cafe', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 3, minimumStock: 1, active: true, supplierItemNumber: '55555', supplierNumberStatus: 'unverified', notes: 'Suggested minimum 2, target 3 cases.' });
  const c = addItem(app, { name: 'Too high', department: 'cafe', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 1, active: true, notes: 'Suggested minimum 4, target 1 cases.' });
  const prev = ok(app.admin('adminFillPreview'));
  assert.equal(ok(app.admin('adminItems')).items.filter((i) => i.id === a.id)[0].minimumStock, null); // preview saves nothing
  const R = (id) => prev.rows.filter((r) => r.id === id)[0];
  assert.equal(R(a.id).minimumStock, 2);
  assert.equal(R(a.id).price, 11.11);
  assert.equal(R(a.id).verified, true);
  assert.equal(R(b.id).minimumStock, null); // already had one
  assert.match(R(b.id).notes.join(' '), /not found/);
  assert.match(R(c.id).notes.join(' '), /above desired stock/);
  ok(app.admin('adminFillCommit'));
  const items = ok(app.admin('adminItems')).items;
  const A = items.filter((i) => i.id === a.id)[0];
  assert.equal(A.minimumStock, 2);
  assert.equal(A.price, 11.11);
  assert.equal(A.priceDate, '2026-10-09');
  assert.equal(A.supplierNumberStatus, 'from-supplier-records');
  assert.equal(A.purchaseHistory.cases2025_26, 14);
  assert.equal(items.filter((i) => i.id === b.id)[0].minimumStock, 1);
  assert.equal(items.filter((i) => i.id === c.id)[0].minimumStock, null);
  bad(app.call('adminFillCommit'), /sign in/);
});

test('split locations: Kitchen + Storage room counted separately and added up', () => {
  const app = freshApp();
  const cups = cafeItem(app, { name: 'Hot cups', category: 'Cups, to-go & utensils', desiredStock: 3, minimumStock: 1, unitsPerCase: 20, unitsPerCaseConfirmed: true, looseUnitLabel: 'sleeves' });
  const soup = cafeItem(app, { name: 'Soup', category: 'Frozen', desiredStock: 3, minimumStock: 1 });
  const sheet = ok(app.call('countSheet', { kind: 'cafe' }));
  same(sheet.items.filter((i) => i.id === cups.id)[0].locations, ['Kitchen', 'Storage room']);
  assert.equal(sheet.items.filter((i) => i.id === soup.id)[0].locations, null);
  bad(app.call('saveCount', { kind: 'cafe', itemId: cups.id, parts: [{ fullCases: '1.5' }, {}] }), /whole number/);
  const r = ok(app.call('saveCount', { kind: 'cafe', itemId: cups.id, parts: [{ fullCases: '1', looseUnits: '4' }, { fullCases: '2', looseUnits: '' }] }));
  assert.equal(r.entry.fullCases, 3);
  assert.equal(r.entry.looseUnits, 4);
  same(r.entry.parts.map((p) => p.location), ['Kitchen', 'Storage room']);
  const back = ok(app.call('countSheet', { kind: 'cafe' })).entries[cups.id];
  assert.equal(back.parts[1].fullCases, 2);
  ok(app.call('saveCount', { kind: 'cafe', itemId: cups.id, parts: [{}, { fullCases: '0' }] })); // explicit zero in one place only
  assert.equal(ok(app.call('countSheet', { kind: 'cafe' })).entries[cups.id].fullCases, 0);
});

test('home status for staff: next delivery and count progress, nothing private', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z');
  const a = cafeItem(app, { name: 'Soup', desiredStock: 3, minimumStock: 1, price: 50 });
  cafeItem(app, { name: 'Bread', desiredStock: 3, minimumStock: 1 });
  ok(app.call('saveCount', { kind: 'cafe', itemId: a.id, fullCases: 1 }));
  const h = ok(app.call('homeStatus'));
  assert.equal(h.nextDelivery.deliveryDate, '2026-10-15');
  assert.equal(h.counts.cafe.open.counted, 1);
  assert.equal(h.counts.cafe.total, 2);
  assert.equal(h.counts.housekeeping.open, null);
  assert.ok(!/price|50|supplier|Soup/.test(JSON.stringify(h)));
  ok(app.call('completeCount', { kind: 'cafe' }));
  const h2 = ok(app.call('homeStatus'));
  assert.equal(h2.counts.cafe.open, null);
  assert.equal(h2.counts.cafe.lastFinished.counted, 1);
});

test('weekly backup button: turns on, saves a first backup, can be turned off; a refusal is reported', () => {
  const app = freshApp();
  let s = ok(app.admin('adminBackupStatus'));
  assert.equal(s.enabled, false);
  app.state.failBackupInstall = true;
  s = ok(app.admin('adminBackupOn'));
  assert.equal(s.turnedOn, false);
  assert.match(s.error, /refused/);
  assert.equal(s.enabled, false);
  app.state.failBackupInstall = false;
  s = ok(app.admin('adminBackupOn'));
  assert.equal(s.turnedOn, true);
  assert.equal(s.enabled, true);
  assert.equal(s.triggerInstalled, true);
  assert.equal(app.state.backupFiles.length, 1);
  assert.ok(s.lastBackupAt);
  s = ok(app.admin('adminBackupNow'));
  assert.equal(app.state.backupFiles.length, 2);
  s = ok(app.admin('adminBackupOff'));
  assert.equal(s.enabled, false);
  assert.equal(s.triggerInstalled, false);
  for (const a of ['adminBackupOn', 'adminBackupOff', 'adminBackupNow', 'adminBackupStatus']) bad(app.call(a), /sign in/);
});

test('set up loose counting: suggestions from case packs, big counts start unticked, apply confirms', () => {
  const app = freshApp();
  const tp = addItem(app, { name: 'Toilet paper 2-ply', department: 'housekeeping', casePackRaw: '96 x CT', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 3, active: true });
  const soup = addItem(app, { name: 'Soup: red lentil', department: 'cafe', casePackRaw: '4 x 4#', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 3, active: true });
  const knives = addItem(app, { name: 'Plastic knives', department: 'cafe', casePackRaw: '1000 x CT', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 1, active: true });
  const lettuce = addItem(app, { name: 'Green leaf lettuce', department: 'cafe', casePackRaw: '1 x 10#', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 1, active: true });
  const sug = ok(app.admin('adminLooseSuggest')).rows;
  const R = (id) => sug.filter((x) => x.id === id)[0];
  assert.equal(R(tp.id).suggestedUnits, 96);
  assert.equal(R(tp.id).suggestedLabel, 'rolls');
  assert.equal(R(tp.id).checked, true);
  assert.equal(R(soup.id).suggestedLabel, 'bags');
  assert.equal(R(knives.id).checked, false);
  assert.equal(R(lettuce.id).suggestedUnits, null);
  bad(app.admin('adminLooseApply', { rows: [{ id: tp.id, unitsPerCase: 1, looseUnitLabel: 'rolls' }] }), /2 or more/);
  bad(app.admin('adminLooseApply', { rows: [{ id: tp.id, unitsPerCase: 96, looseUnitLabel: '' }] }), /name/);
  ok(app.admin('adminLooseApply', { rows: [{ id: tp.id, unitsPerCase: 96, looseUnitLabel: 'rolls' }, { id: soup.id, unitsPerCase: 4, looseUnitLabel: 'bags (4 lb)' }] }));
  const staff = ok(app.call('countSheet', { kind: 'housekeeping' })).items[0];
  assert.equal(staff.allowLoose, true);
  assert.equal(staff.unitsPerCase, 96);
  assert.equal(staff.looseUnitLabel, 'rolls');
  assert.equal(ok(app.admin('adminLooseSuggest')).rows.filter((x) => x.id === tp.id)[0].checked, false); // already set
  bad(app.call('adminLooseApply', { rows: [] }), /sign in/);
});

test('staff extras: added on top of the count, survive refreshes, and a hand-typed number stays', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z'); // Monday
  const soup = cafeItem(app, { name: 'Soup', desiredStock: 6, minimumStock: 2 });
  const rolls = cafeItem(app, { name: 'Rolls', desiredStock: 4, minimumStock: 1 });
  ok(app.call('saveCount', { kind: 'cafe', itemId: soup.id, fullCases: 1 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: rolls.id, fullCases: 3 }));
  ok(app.call('completeCount', { kind: 'cafe' }));
  bad(app.call('staffSuggest', { type: 'extra', department: 'cafe', itemId: soup.id, cases: 0 }), /1 to 50/);
  bad(app.call('staffSuggest', { type: 'extra', department: 'housekeeping', itemId: soup.id, cases: 1 }), /not on the/);
  const r = ok(app.call('staffSuggest', { type: 'extra', department: 'cafe', itemId: soup.id, cases: 1, note: 'group Friday' }));
  assert.match(r.message, /Added: 1 extra case of Soup/);
  ok(app.call('staffSuggest', { type: 'extra', department: 'cafe', itemId: rolls.id, cases: 2 }));
  let o = ok(app.admin('adminOrder', { orderId: ok(app.admin('adminOrders')).orders[0].id }));
  const line = (id) => o.lines.filter((l) => l.itemId === id)[0];
  assert.equal(line(soup.id).finalCases, 6); // 5 to get back to desired + 1 extra
  same(line(soup.id).staffNotes, ['+1 extra (staff: group Friday)']);
  assert.equal(line(rolls.id).finalCases, 2); // above its minimum, so only the extra
  // A later fix to the count keeps the extras.
  ok(app.call('saveCount', { kind: 'cafe', itemId: rolls.id, fullCases: 0 }));
  o = ok(app.admin('adminOrder', { orderId: o.order.id }));
  assert.equal(line(rolls.id).finalCases, 6); // 4 + 2 extra
  // Saving the draft unchanged does not mark lines as hand-edited.
  o = ok(app.admin('adminSaveOrder', { orderId: o.order.id, lines: o.lines.map((l) => ({ id: l.id, finalCases: String(l.finalCases) })) }));
  assert.equal(o.lines.some((l) => l.edited), false);
  // Extra on a hand-typed line adds to Todd's number.
  o = ok(app.admin('adminSaveOrder', { orderId: o.order.id, lines: [{ id: line(soup.id).id, finalCases: '3' }] }));
  ok(app.call('staffSuggest', { type: 'extra', department: 'cafe', itemId: soup.id, cases: 1 }));
  o = ok(app.admin('adminOrder', { orderId: o.order.id }));
  assert.equal(line(soup.id).finalCases, 4);
  assert.equal(ok(app.admin('adminSuggestions')).suggestions.filter((g) => g.kind === 'extra' && g.status === 'added').length, 3);
});

test('after the order is sent: count fixes and extras become notices, then roll into next week', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z'); // Monday
  const brownies = cafeItem(app, { name: 'Brownies', desiredStock: 3, minimumStock: 1 });
  ok(app.call('saveCount', { kind: 'cafe', itemId: brownies.id, fullCases: 2 }));
  ok(app.call('completeCount', { kind: 'cafe' }));
  const orderId = ok(app.admin('adminOrders')).orders[0].id;
  ok(app.admin('adminSubmitOrder', { orderId, confirm: 'I-SENT-IT', method: 'text' }));
  at(app, '2026-10-12T19:00:00Z'); // Monday 3 PM: bought out
  const sheet = ok(app.call('countSheet', { kind: 'cafe' }));
  assert.equal(sheet.finished.mode, 'sent');
  bad(app.call('saveCount', { kind: 'cafe', itemId: brownies.id, clear: true }), /already finished/);
  ok(app.call('saveCount', { kind: 'cafe', itemId: brownies.id, fullCases: 0 }));
  ok(app.call('saveCount', { kind: 'cafe', itemId: brownies.id, fullCases: 0, looseUnits: '' }));
  const extra = ok(app.call('staffSuggest', { type: 'extra', department: 'cafe', itemId: brownies.id, cases: 1 }));
  assert.match(extra.message, /already sent/);
  let open = ok(app.admin('adminDashboard')).staff;
  same(open.map((g) => g.kind).sort(), ['extra', 'late']); // one notice per item, not one per save
  assert.equal(open.filter((g) => g.kind === 'late')[0].detail.from.fullCases, 2);
  // The sent order is untouched.
  assert.equal(ok(app.admin('adminOrder', { orderId })).order.status, 'submitted');
  assert.equal(ok(app.admin('adminOrders')).orders.length, 1);
  // Next week: after the deadline the screen starts fresh, and the next draft carries both.
  at(app, '2026-10-19T14:00:00Z');
  const t2 = ok(app.call('adminLogin', { password: PW })).token;
  assert.equal(ok(app.call('countSheet', { kind: 'cafe' })).session, null);
  ok(app.call('saveCount', { kind: 'cafe', itemId: brownies.id, fullCases: 2 }));
  ok(app.call('completeCount', { kind: 'cafe' }));
  const next = ok(app.call('adminOrders', { token: t2 })).orders.filter((o) => o.status === 'draft')[0];
  const l = ok(app.call('adminOrder', { token: t2, orderId: next.id })).lines.filter((x) => x.itemId === brownies.id)[0];
  assert.equal(l.finalCases, 1); // above the minimum, so just the carried extra
  assert.equal(l.staffNotes.length, 2);
  assert.match(l.staffNotes.join(' '), /After the last order was sent, staff changed the count Mon 3:00 PM \(2 → 0\)/);
  assert.equal(ok(app.call('adminDashboard', { token: t2 })).staff.length, 0);
});

test('ordering paused: counts continue, no drafts, extras wait on Todd’s list and do not carry over', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z');
  const soap = addItem(app, { name: 'Soap', department: 'housekeeping', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, minimumStock: 1, active: true });
  ok(app.admin('adminSaveSettings', { ordering: { paused: true } }));
  assert.equal(ok(app.call('homeStatus')).paused, true);
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: soap.id, fullCases: 0 }));
  ok(app.call('completeCount', { kind: 'housekeeping' }));
  assert.equal(ok(app.admin('adminOrders')).orders.length, 0);
  // Still fixable for the rest of the week; no draft appears.
  assert.equal(ok(app.call('countSheet', { kind: 'housekeeping' })).finished.mode, 'paused');
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: soap.id, fullCases: 1 }));
  const r = ok(app.call('staffSuggest', { type: 'extra', department: 'housekeeping', itemId: soap.id, cases: 2, note: 'spring cleaning' }));
  assert.match(r.message, /paused/);
  assert.equal(ok(app.admin('adminOrders')).orders.length, 0);
  assert.equal(ok(app.admin('adminDashboard')).staff[0].detail.reason, 'paused');
  // New week: fresh screen. Turning ordering back on does not pull the paused extra in.
  at(app, '2026-10-19T14:00:00Z');
  const t2 = ok(app.call('adminLogin', { password: PW })).token;
  assert.equal(ok(app.call('countSheet', { kind: 'housekeeping' })).session, null);
  ok(app.call('adminSaveSettings', { token: t2, ordering: { paused: false } }));
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: soap.id, fullCases: 2 }));
  ok(app.call('completeCount', { kind: 'housekeeping' }));
  const o = ok(app.call('adminOrders', { token: t2 })).orders[0];
  assert.equal(ok(app.call('adminOrder', { token: t2, orderId: o.id })).lines[0].finalCases, 0);
  assert.equal(ok(app.call('adminDashboard', { token: t2 })).staff.length, 1); // still on Todd's list
});

test('need more / too many / not on this list: Todd approves or dismisses; nothing changes on its own', () => {
  const app = freshApp();
  at(app, '2026-10-12T14:00:00Z');
  const soup = cafeItem(app, { name: 'Soup', desiredStock: 6, minimumStock: 2 });
  ok(app.call('staffSuggest', { type: 'more', department: 'cafe', itemId: soup.id, note: 'out by Saturday twice' }));
  ok(app.call('staffSuggest', { type: 'less', department: 'cafe', itemId: soup.id }));
  bad(app.call('staffSuggest', { type: 'add', department: 'cafe', itemName: '' }), /item name/);
  const tok = ok(app.call('uploadPhoto', { data: JPEG })).photoToken;
  ok(app.call('staffSuggest', { type: 'add', department: 'cafe', itemName: 'Oat milk', note: 'case label photo', photoTokens: [tok] }));
  bad(app.call('staffSuggest', { type: 'add', department: 'cafe', itemName: 'Again', photoTokens: [tok] }), /not received/);
  assert.equal(ok(app.admin('adminItems')).items.filter((i) => i.id === soup.id)[0].desiredStock, 6);
  const list = ok(app.admin('adminSuggestions')).suggestions;
  same(list.map((g) => g.kind).sort(), ['add', 'less', 'more']);
  const add = list.filter((g) => g.kind === 'add')[0];
  assert.equal(add.photoIds.length, 1);
  assert.equal(ok(app.admin('adminPhoto', { photoId: add.photoIds[0] })).mimeType, 'image/jpeg');
  const more = list.filter((g) => g.kind === 'more')[0];
  ok(app.admin('adminHandleSuggestion', { id: more.id, act: 'done', desiredStock: 8 }));
  assert.equal(ok(app.admin('adminItems')).items.filter((i) => i.id === soup.id)[0].desiredStock, 8);
  ok(app.admin('adminHandleSuggestion', { id: list.filter((g) => g.kind === 'less')[0].id, act: 'dismiss' }));
  ok(app.admin('adminHandleSuggestion', { id: add.id, act: 'done' }));
  assert.equal(ok(app.admin('adminDashboard')).staff.length, 0);
  // Staff responses never include another person's notes or anything private.
  bad(app.call('adminSuggestions', {}), /sign in/);
});
