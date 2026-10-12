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
    'adminRemoveItems', 'adminSaveDrink', 'adminBev', 'adminSaveBevProduct', 'adminSaveDelivery', 'adminDeleteRecord', 'adminSaveSale', 'adminSaveAdjustment', 'adminBevReport',
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
  for (const it of sheet.items) same(Object.keys(it).sort(), ['allowLoose', 'countingUnit', 'desiredStock', 'id', 'looseUnitLabel', 'name', 'unitsPerCase']);

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
  assert.equal(ok(app.call('countSheet', { kind: 'housekeeping' })).session, null);
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

test('file import (e.g. Base44 export): preview, validation, duplicates, history keeps its own package sizes', () => {
  const app = freshApp();
  const headers = ['id', 'Item Name', 'Department', 'Par Level', 'Item Number', 'Case Pack'];
  const rows = [['b1', 'Paper towels', 'Housekeeping', '6', '070849', '30 x CT'], ['b2', 'Cups', 'Cafe', '3', '', '20 x 50 CT'], ['b2', 'Cups', 'Cafe', '3', '', ''], ['b3', '', 'Cafe', '1', '', '']];
  const p = ok(app.admin('adminImportRowsPreview', { type: 'items', headers, rows, sourceName: 'Base44 export items.csv', isBase44: true }));
  assert.equal(p.valid, 2);
  assert.equal(p.duplicates.length, 1);
  assert.equal(p.invalid.length, 1);
  assert.equal(p.mapping.desiredStock, 3);
  const c = ok(app.admin('adminImportRowsCommit', { type: 'items', headers, rows, sourceName: 'Base44 export items.csv', isBase44: true }));
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
  assert.equal(mig.base44, 'partly imported');
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
