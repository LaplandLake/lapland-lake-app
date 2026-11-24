// Tests for the AI door (counts by voice or chat) and its relay. Run with `npm test` in supply/.
// Uses disposable in-memory data only; nothing here contacts Google, Cloudflare or any AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../dev/platform.mjs';
import relay from '../relay/worker.js';

const PW = 'a-long-test-password';
function ok(r) { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; }
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b)); // values come from another JS realm
function bad(r, re) { assert.equal(r.ok, false, 'expected failure'); if (re) assert.match(r.error.message, re); return r.error; }

function freshApp(opts) {
  const app = createApp(opts || {});
  const code = app.backend.createAdminSetupCode();
  const token = ok(app.call('adminSetup', { setupCode: code, newPassword: PW, confirmPassword: PW })).token;
  app.admin = (action, body) => app.call(action, Object.assign({ token }, body || {}));
  const item = (name, department, category, extra) => ok(app.admin('adminSaveItem', { item: Object.assign({ name, department, category, countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, minimumStock: 1, active: true }, extra || {}) })).item;
  app.items = {
    chili: item('Chili with beans', 'cafe', 'Frozen'),
    lentil: item('Red lentil soup', 'cafe', 'Frozen'),
    glovesM: item('Vinyl gloves, medium', 'cafe', 'Kitchen supplies'),
    glovesL: item('Vinyl gloves, large', 'cafe', 'Kitchen supplies'),
    towels: item('Paper towel rolls', 'housekeeping', 'Paper products', { supplierItemNumber: '70849' }),
  };
  const bev = (name) => ok(app.admin('adminSaveBevProduct', { product: { name, type: 'beer', container: 'can', unitsPerCase: 24, packageConfirmed: true, active: true } })).products.filter((p) => p.name === name)[0];
  app.bev = { ipa: bev('Test IPA 12 oz can') };
  app.key = (name) => ok(app.admin('adminAiKeyAdd', { name })).newKey.key;
  // One message through the door, as the relay would hand it over.
  app.rpc = (key, method, params) => app.backend.handleAiDoor_(key, { jsonrpc: '2.0', id: 1, method, params });
  app.tool = (key, name, args) => {
    const r = app.rpc(key, 'tools/call', { name, arguments: args || {} });
    assert.ok(r.result, JSON.stringify(r.error));
    return Object.assign(JSON.parse(r.result.content[0].text), { isError: r.result.isError });
  };
  app.entries = () => app.platform.store.all('entries');
  return app;
}
const save = (app, key, it, kind, extra) => app.tool(key, 'save_count', Object.assign({ countType: kind, itemId: it.id, itemName: it.name }, extra));

test('the door only opens with a key that is known and turned on', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  assert.match(claude, /^ll_[0-9a-f]{64}$/);
  for (const key of [undefined, '', 'nope', claude + 'x']) {
    for (const method of ['initialize', 'tools/list', 'tools/call']) {
      const r = app.rpc(key, method, { name: 'count_overview' });
      assert.equal(r.error.code, -32001);
      assert.match(r.error.message, /missing, not right, or turned off/);
    }
  }
  const init = app.rpc(claude, 'initialize', { protocolVersion: '2025-06-18' }).result;
  assert.equal(init.protocolVersion, '2025-06-18');
  assert.equal(init.serverInfo.name, 'Lapland Lake Supply Manager counts');
  assert.match(init.instructions, /Never guess/);
  // A notice from the AI's side gets no reply.
  assert.equal(app.backend.handleAiDoor_(claude, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('the key is shown once and never stored: not in the properties, not in the Sheet', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  save(app, claude, app.items.chili, 'cafe', { fullCases: 2 });
  const snap = JSON.stringify(app.snapshot());
  assert.ok(!snap.includes(claude));
  assert.ok(!JSON.stringify(ok(app.admin('adminAiKeys'))).includes(claude));
});

test('an AI can do six things and nothing else', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  const tools = app.rpc(claude, 'tools/list').result.tools;
  same(tools.map((t) => t.name), ['count_overview', 'list_items', 'find_item', 'start_count', 'save_count', 'finish_count']);
  tools.forEach((t) => { assert.equal(t.run, undefined); assert.equal(t.annotations.destructiveHint === true, false); });
  // No way to reach the app's other actions through the door.
  for (const name of ['adminSaveItem', 'adminRemoveItems', 'adminSubmitOrder', 'adminSaveSettings', 'adminDeleteRequest', 'submitRequest', 'saveCount']) {
    assert.equal(app.rpc(claude, 'tools/call', { name, arguments: {} }).error.code, -32602);
  }
  assert.equal(app.rpc(claude, 'resources/list').error.code, -32601);
  // "clear" (un-counting an item) is not offered: an extra field is ignored, the number is saved.
  const r = save(app, claude, app.items.chili, 'cafe', { fullCases: 1, clear: true });
  assert.equal(r.saved, true);
  assert.equal(app.entries().length, 1);
  // The app's own screens still work through the same entry point, and an AI key is no Admin sign-in.
  assert.equal(JSON.parse(app.backend.handlePost_(JSON.stringify({ action: 'homeStatus' }), {})).ok, true);
  bad(app.call('adminItems', { token: claude }), /sign in/);
});

test('a count entered through an AI key carries that AI\'s name', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  const started = app.tool(claude, 'start_count', { countType: 'cafe' });
  assert.equal(started.started, true);
  assert.equal(app.tool(claude, 'start_count', { countType: 'cafe' }).started, false); // safe to call twice
  assert.equal(app.platform.store.all('sessions').length, 1);
  assert.equal(app.platform.store.all('sessions')[0].origin, 'ai:Claude');
  const r = save(app, claude, app.items.chili, 'cafe', { fullCases: 2.5 });
  same(r.now, { fullCases: 2.5, looseUnits: null });
  assert.equal(r.before, 'not counted');
  assert.equal(app.entries()[0].origin, 'ai:Claude');
  // Staff see the number on their count screen like any other.
  assert.equal(ok(app.call('countSheet', { kind: 'cafe' })).entries[app.items.chili.id].fullCases, 2.5);
  // Staff enter one, then the AI changes it: the change carries the AI's name.
  ok(app.call('saveCount', { kind: 'cafe', itemId: app.items.lentil.id, fullCases: 4 }));
  assert.equal(app.entries().filter((e) => e.itemId === app.items.lentil.id)[0].origin, 'app');
  const ch = save(app, claude, app.items.lentil, 'cafe', { fullCases: 3 });
  same(ch.before, { fullCases: 4, looseUnits: null });
  assert.equal(app.entries().filter((e) => e.itemId === app.items.lentil.id)[0].origin, 'ai:Claude');
  const list = app.tool(claude, 'list_items', { countType: 'cafe' });
  assert.equal(list.items.filter((i) => i.name === 'Red lentil soup')[0].saved.enteredBy, 'Claude');
  // The history shows who did what.
  const audit = app.platform.store.all('audit').filter((a) => a.actor === 'ai:Claude');
  same(audit.map((a) => a.action), ['count-started', 'count-saved', 'count-saved']);
});

test('the same count sent twice is saved once', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  const first = save(app, claude, app.items.chili, 'cafe', { fullCases: 2 });
  const savedAt = app.entries()[0].countedAt;
  app.state.clock = Date.now() + 60000;
  const again = save(app, claude, app.items.chili, 'cafe', { fullCases: 2 });
  assert.equal(first.alreadySaved, undefined);
  assert.equal(again.alreadySaved, true);
  assert.equal(app.entries().length, 1);
  assert.equal(app.entries()[0].countedAt, savedAt); // not written again
  assert.equal(app.platform.store.all('audit').filter((a) => a.action === 'count-saved').length, 1);
  assert.equal(app.platform.store.all('sessions').length, 1);
  // A late retry of an old message (same requestId) does not undo a newer number.
  save(app, claude, app.items.lentil, 'cafe', { fullCases: 5, requestId: 'spoken-1' });
  save(app, claude, app.items.lentil, 'cafe', { fullCases: 6, requestId: 'spoken-2' });
  const retry = save(app, claude, app.items.lentil, 'cafe', { fullCases: 5, requestId: 'spoken-1' });
  assert.equal(retry.alreadySaved, true);
  assert.equal(app.entries().filter((e) => e.itemId === app.items.lentil.id)[0].fullCases, 6);
});

test('when the item is not clear, the door says to ask, and refuses a mismatched save', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  const one = app.tool(claude, 'find_item', { words: 'chili' });
  assert.equal(one.sure, true);
  assert.equal(one.matches[0].name, 'Chili with beans');
  const two = app.tool(claude, 'find_item', { words: 'gloves' });
  assert.equal(two.sure, false);
  same(two.matches.map((m) => m.name).sort(), ['Vinyl gloves, large', 'Vinyl gloves, medium']);
  assert.match(two.advice, /Ask the person/);
  assert.equal(app.tool(claude, 'find_item', { words: 'medium gloves' }).sure, true);
  assert.equal(app.tool(claude, 'find_item', { words: '70849' }).matches[0].name, 'Paper towel rolls');
  const none = app.tool(claude, 'find_item', { words: 'snow shovels' });
  assert.equal(none.sure, false);
  assert.equal(none.matches.length, 0);
  assert.match(none.advice, /do not guess/);
  // The id and the name must go together.
  const mixed = app.tool(claude, 'save_count', { countType: 'cafe', itemId: app.items.glovesM.id, itemName: 'Vinyl gloves, large', fullCases: 1 });
  assert.equal(mixed.isError, true);
  assert.match(mixed.problem, /do not go together/);
  // An item that is not on the list, a missing number and a bad number are all refused.
  assert.match(app.tool(claude, 'save_count', { countType: 'cafe', itemId: 'nope', itemName: 'Chili with beans', fullCases: 1 }).problem, /not on the Cafe count list/);
  assert.match(save(app, claude, app.items.chili, 'cafe', {}).problem, /0 is a real count/);
  assert.match(save(app, claude, app.items.chili, 'cafe', { fullCases: -1 }).problem, /0 or more/);
  assert.match(save(app, claude, app.items.chili, 'cafe', { fullCases: 1, looseUnits: 3 }).problem, /full cases only/);
  assert.equal(app.entries().length, 0);
  // An item that was turned off cannot be counted.
  ok(app.admin('adminSaveItem', { id: app.items.chili.id, item: { active: false } }));
  assert.equal(save(app, claude, app.items.chili, 'cafe', { fullCases: 1 }).isError, true);
});

test('items kept in two places: the place is asked for, and one place never wipes the other', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  const t = app.items.towels;
  const ask = save(app, claude, t, 'housekeeping', { fullCases: 3 });
  assert.equal(ask.isError, true);
  assert.match(ask.problem, /Lodge storage room and Housekeeping/);
  ok(app.call('saveCount', { kind: 'housekeeping', itemId: t.id, parts: [null, { fullCases: 1 }] }));
  const r = save(app, claude, t, 'housekeeping', { fullCases: 3, place: 'lodge storage room' });
  assert.equal(r.place, 'Lodge storage room');
  same(r.totalAllPlaces, { fullCases: 4, looseUnits: null });
  const e = app.entries()[0];
  same(e.parts.map((p) => p.fullCases), [3, 1]);
  assert.equal(save(app, claude, t, 'housekeeping', { fullCases: 3, place: 'Lodge storage room' }).alreadySaved, true);
});

test('finishing: tells which items have no count first, and the beverage email goes out once', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  ok(app.admin('adminSaveSettings', { email: { recipient: 'admin@example.com', enabled: true } }));
  const p2 = ok(app.admin('adminSaveBevProduct', { product: { name: 'Test cider 12 oz can', type: 'cider', container: 'can', unitsPerCase: 24, packageConfirmed: true, active: true } }));
  assert.equal(p2.products.length, 2);
  assert.match(app.tool(claude, 'finish_count', { countType: 'beverage' }).problem, /no Beer \/ Cider \/ Wine count in progress/);
  save(app, claude, app.bev.ipa, 'beverage', { fullCases: 2, looseUnits: 5 });
  const hold = app.tool(claude, 'finish_count', { countType: 'beverage' });
  assert.equal(hold.finished, false);
  same(hold.notCounted, ['Test cider 12 oz can']);
  assert.equal(app.state.sentMail.length, 0);
  const done = app.tool(claude, 'finish_count', { countType: 'beverage', finishWithUncounted: true });
  assert.equal(done.finished, true);
  assert.equal(done.weeklyEmail, 'sent');
  const twice = app.tool(claude, 'finish_count', { countType: 'beverage', finishWithUncounted: true });
  assert.equal(twice.alreadyFinished, true);
  assert.equal(app.state.sentMail.length, 1);
  const s = app.platform.store.all('sessions')[0];
  assert.equal(s.status, 'completed');
  assert.equal(s.completedBy, 'ai:Claude');
  assert.equal(app.platform.store.all('emailLog').filter((m) => m.status === 'sent').length, 1);
});

test('a finished cafe count builds the draft the same way as a staff count; the AI gets no order details', () => {
  const app = freshApp({ now: '2026-12-08T15:00:00Z' }); // a Tuesday in season
  const claude = app.key('Claude');
  save(app, claude, app.items.chili, 'cafe', { fullCases: 0 });
  const done = app.tool(claude, 'finish_count', { countType: 'cafe', finishWithUncounted: true });
  assert.equal(done.finished, true);
  assert.equal(done.draft, undefined);
  assert.equal(ok(app.admin('adminOrders')).orders.filter((o) => o.status === 'draft').length, 1);
  assert.equal(app.platform.store.all('orders').filter((o) => o.status === 'submitted').length, 0);
  // After finishing, a changed number goes into this week's count as a fix, like a staff fix.
  const fix = save(app, claude, app.items.chili, 'cafe', { fullCases: 1 });
  assert.match(fix.note, /already finished; this changed it/);
  assert.equal(app.platform.store.all('sessions').length, 1);
});

test('each AI has its own key; one can be turned off or renewed without touching the others', () => {
  const app = freshApp();
  const claude = app.key('Claude');
  const duet = app.key('Duet');
  bad(app.admin('adminAiKeyAdd', { name: 'claude' }), /already a key/);
  bad(app.admin('adminAiKeyAdd', { name: '<b>' }), /short name/);
  const keys = ok(app.admin('adminAiKeys')).keys;
  ok(app.admin('adminAiKeySet', { id: keys[0].id, enabled: false }));
  assert.equal(app.rpc(claude, 'tools/list').error.code, -32001);
  assert.equal(save(app, duet, app.items.chili, 'cafe', { fullCases: 2 }).saved, true);
  assert.equal(app.entries()[0].origin, 'ai:Duet');
  ok(app.admin('adminAiKeySet', { id: keys[0].id, enabled: true }));
  assert.equal(app.tool(claude, 'count_overview').counts.length, 3);
  const renewed = ok(app.admin('adminAiKeyRenew', { id: keys[0].id })).newKey.key;
  assert.notEqual(renewed, claude);
  assert.equal(app.rpc(claude, 'tools/list').error.code, -32001);
  assert.equal(app.tool(renewed, 'count_overview').counts.length, 3);
  assert.ok(ok(app.admin('adminAiKeys')).keys[0].lastUsedAt);
  // Not signed in: no key list, no new keys.
  bad(app.call('adminAiKeys'), /sign in/);
  bad(app.call('adminAiKeyAdd', { name: 'Sneaky' }), /sign in/);
  // The relay address is saved once and used to build the full connection address.
  bad(app.admin('adminAiRelay', { relayUrl: 'http://example.com/mcp' }), /https/);
  ok(app.admin('adminAiRelay', { relayUrl: 'https://relay.example.com/mcp' }));
  const added = ok(app.admin('adminAiKeyAdd', { name: 'ChatGPT' })).newKey;
  assert.equal(added.address, 'https://relay.example.com/mcp?key=' + added.key);
});

/* ---- through the relay, the way Claude reaches it */

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port }));
  });
}
function readBody(req) {
  return new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => resolve(s)); });
}

test('through the relay: no redirect reaches the AI, and the whole round trip works', async () => {
  const app = freshApp();
  const claude = app.key('Claude');
  // A stand-in for the Apps Script web app: it answers every POST with a redirect to a one-time address.
  const echoes = new Map();
  let n = 0;
  const gas = await listen(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/exec' && req.method === 'POST') {
      const id = String(++n);
      echoes.set(id, app.backend.handlePost_(await readBody(req), Object.fromEntries(u.searchParams)));
      res.writeHead(302, { location: '/echo?id=' + id });
      return res.end();
    }
    if (u.pathname === '/echo' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(echoes.get(u.searchParams.get('id'))); }
    res.writeHead(404); res.end();
  });
  const env = { DOOR_URL: gas.url + '/exec' };
  const front = await listen(async (req, res) => {
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    const out = await relay.fetch(new Request('http://relay.test' + req.url, { method: req.method, headers: req.headers, body }), env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(await out.text());
  });
  try {
    // Like Claude: a redirect is an error, never followed.
    const post = (path, msg, headers) => fetch(front.url + path, { method: 'POST', redirect: 'error', headers: Object.assign({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, headers || {}), body: JSON.stringify(msg) });
    const call = async (path, method, params, headers) => {
      const res = await post(path, { jsonrpc: '2.0', id: 7, method, params }, headers);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /application\/json/);
      return res.json();
    };
    const path = '/mcp?key=' + claude;
    // Straight at the Apps Script stand-in, the same client gets nowhere. This is why the relay exists.
    await assert.rejects(fetch(gas.url + '/exec?key=' + claude, { method: 'POST', redirect: 'error', body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}' }));

    const init = await call(path, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.id, 7);
    assert.equal(init.result.serverInfo.name, 'Lapland Lake Supply Manager counts');
    const note = await post(path, { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(note.status, 202);
    assert.equal(await note.text(), '');
    assert.equal((await call(path, 'tools/list')).result.tools.length, 6);
    const saved = await call(path, 'tools/call', { name: 'save_count', arguments: { countType: 'cafe', itemId: app.items.chili.id, itemName: 'Chili with beans', fullCases: 2 } });
    assert.equal(JSON.parse(saved.result.content[0].text).saved, true);
    assert.equal(app.entries()[0].origin, 'ai:Claude');
    // The key can also travel the hidden way, in a header.
    assert.equal((await call('/mcp', 'tools/list', null, { authorization: 'Bearer ' + claude })).result.tools.length, 6);
    assert.equal((await call('/mcp', 'tools/list', null, { 'x-api-key': claude })).result.tools.length, 6);
    // No key, or a wrong one: a clear refusal, and nothing more.
    assert.equal((await call('/mcp', 'tools/list')).error.code, -32001);
    assert.equal((await call('/mcp?key=wrong', 'tools/list')).error.code, -32001);
    // The relay passes messages and nothing else.
    assert.equal((await fetch(front.url + path, { redirect: 'error' })).status, 405);
    assert.equal((await fetch(front.url + '/other', { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await fetch(front.url + path, { method: 'POST', body: 'not json' })).status, 400);
    // The Supply Manager is down or the address is wrong: a plain message, not a crash.
    env.DOOR_URL = gas.url + '/missing';
    const down = await post(path, { jsonrpc: '2.0', id: 9, method: 'tools/list' });
    assert.equal(down.status, 502);
    assert.equal((await down.json()).id, 9);
  } finally {
    gas.server.close();
    front.server.close();
  }
});
