// End-to-end test in a real (headless) Chromium at phone widths, against the local
// preview server with disposable TEST data. Run: npm run test:e2e (in supply/).
// Screenshots go to the folder given by SHOTS (default: test-output/ next to this file).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8799;
const BASE = 'http://localhost:' + PORT;
// The API is called on a different origin (127.0.0.1 vs localhost), as with the real
// Apps Script address, and the test server refuses CORS preflight like Apps Script does.
const APP = BASE + '/supply/?api=' + encodeURIComponent('http://127.0.0.1:' + PORT + '/api');
const SHOTS = process.env.SHOTS || path.join(here, 'test-output');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (err) { results.push(['FAIL', name, err.message]); console.log('FAIL', name, '-', err.message.split('\n')[0]); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const hook = (p) => fetch(BASE + '/__test/' + p).then((r) => r.json());

// A real (tiny) PNG generated here, so photo tests use genuine image files.
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = (rgb[1] + x) & 255; raw[o + 2] = rgb[2]; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const photoFiles = [
  { name: 'shelf-1.png', mimeType: 'image/png', buffer: png(640, 480, [200, 40, 40]) },
  { name: 'shelf-2.png', mimeType: 'image/png', buffer: png(480, 640, [40, 120, 200]) },
  { name: 'shelf-3.png', mimeType: 'image/png', buffer: png(300, 300, [40, 160, 60]) },
];

const server = spawn(process.execPath, [path.join(here, '..', 'dev', 'server.mjs'), '--port', String(PORT), '--seed', 'demo'], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill());
process.on('uncaughtException', (e) => { console.error(e); server.kill(); process.exit(1); });
await new Promise((res) => server.stdout.once('data', res));

const launchOpts = {};
if (fs.existsSync('/opt/pw-browsers/chromium')) {
  // Use the pre-installed browser if this Playwright build doesn't have its own.
  try { await chromium.launch().then((b) => b.close()); } catch (e) { launchOpts.executablePath = '/opt/pw-browsers/chromium'; }
}
const browser = await chromium.launch(launchOpts);
const pageErrors = [];
async function newPage(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(width + ': ' + e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  return page;
}
async function noHScroll(page, label) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw <= w, label + ': page is ' + sw + 'px wide at ' + w + 'px (horizontal scroll)');
}

try {
  for (const width of [360, 390, 430]) {
    const page = await newPage(width);
    await check(width + 'px home: logo, rule, subtitle, five buttons, delivery info, admin link, no sideways scroll', async () => {
      await page.goto(APP);
      await page.waitForSelector('.home-btn');
      expect(await page.locator('img.logo[src$="logo-horizontal.svg"]').isVisible(), 'logo missing');
      const logoOk = await page.evaluate(() => { const i = document.querySelector('img.logo'); return i.complete && i.naturalWidth > 0; });
      expect(logoOk, 'logo did not load');
      expect(await page.locator('hr.lake-rule').isVisible(), 'light-blue rule missing');
      expect((await page.textContent('.subtitle')) === 'Supply inventory & ordering', 'subtitle');
      const labels = await page.locator('.home-btn').allTextContents();
      expect(JSON.stringify(labels) === JSON.stringify(['Housekeeping Orders', 'Cafe Orders', 'Other Supply Requests', 'Drink Cooler', 'Beer / Cider / Wine']), 'buttons: ' + labels);
      const del = await page.textContent('.delivery');
      expect(/Delivery Thursday · Preferable order by Tuesday afternoon\.\s*Latest order by Wednesday at 4:00 PM · 20-case minimum\./.test(del), 'delivery text: ' + del);
      expect((await page.textContent('.admin-link')) === 'Admin', 'admin link');
      await page.waitForSelector('.status-dates');
      const card = await page.textContent('.status-card');
      expect(/Next delivery\s*Thursday/.test(card) && /Order deadline\s*Wed/.test(card), 'delivery dates: ' + card);
      expect(/Housekeeping count:/.test(card) && /Cafe count:/.test(card), 'count status');
      const btnH = await page.locator('.home-btn').first().evaluate((e) => e.getBoundingClientRect().height);
      expect(btnH >= 60, 'buttons too small: ' + btnH);
      await noHScroll(page, 'home');
      await page.screenshot({ path: path.join(SHOTS, `home-${width}.png`), fullPage: true });
    });
    await check(width + 'px each home button opens the right section', async () => {
      const want = [['Housekeeping Orders', 'Housekeeping count'], ['Cafe Orders', 'Cafe count'], ['Other Supply Requests', 'Other supply request'], ['Drink Cooler', 'Drink Cooler restock'], ['Beer / Cider / Wine', 'Beer / Cider / Wine count']];
      for (const [btn, heading] of want) {
        await page.goto(APP);
        await page.click('.home-btn >> text="' + btn + '"');
        await page.waitForSelector('.dept-heading');
        const got = await page.textContent('.dept-heading');
        expect(got === heading, btn + ' -> ' + got);
        expect((await page.textContent('.topbar h1')) === btn, 'title for ' + btn);
        await noHScroll(page, btn);
      }
    });
    await page.context().close();
  }

  const page = await newPage(390);
  await check('Housekeeping count: saves as you type, blank vs zero, survives leaving and coming back', async () => {
    await page.goto(APP + '#/count/housekeeping');
    await page.waitForSelector('.item');
    const tp = page.locator('.item', { hasText: 'TEST Toilet tissue' });
    expect(/96 rolls per case/.test(await tp.textContent()), 'units per case not shown');
    expect(/Minimum: 4 · Desired: 4 cases/.test(await tp.textContent()), 'minimum/desired stock not shown');
    await tp.locator('input').nth(0).fill('2');
    await tp.locator('input').nth(1).fill('30');
    await tp.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    const soap = page.locator('.item', { hasText: 'TEST Hand soap refills' });
    await soap.locator('input').first().fill('0');
    await soap.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    expect(/2 of 2 counted/.test(await page.textContent('.progress')), 'progress');
    await page.screenshot({ path: path.join(SHOTS, 'count-housekeeping-390.png'), fullPage: true });
    await page.goto(APP);
    await page.goto(APP + '#/count/housekeeping');
    await page.waitForSelector('.item');
    const v = await page.locator('.item', { hasText: 'TEST Toilet tissue' }).locator('input').evaluateAll((els) => els.map((e) => e.value));
    expect(v[0] === '2' && v[1] === '30', 'values after return: ' + v);
    expect((await page.locator('.item', { hasText: 'TEST Hand soap refills' }).locator('input').first().inputValue()) === '0', 'zero kept');
  });
  await check('Count validation: fractional cases rejected and not saved', async () => {
    const soap = page.locator('.item', { hasText: 'TEST Hand soap refills' });
    await soap.locator('input').first().fill('1.5');
    await soap.locator('.save-state', { hasText: 'whole number' }).waitFor({ timeout: 4000 });
    await soap.locator('input').first().fill('1');
    await soap.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
  });
  await check('Failed save is shown as not saved, with Retry that works', async () => {
    await hook('offline?on=1');
    const tp = page.locator('.item', { hasText: 'TEST Toilet tissue' });
    try {
      await tp.locator('input').first().fill('3');
      await tp.locator('.save-state', { hasText: /^Not saved:/ }).waitFor({ timeout: 10000 });
      expect(await tp.locator('button', { hasText: 'Retry' }).isVisible(), 'retry button');
      expect(/not saved yet/.test(await page.textContent('.progress')), 'progress should mention unsaved');
      await page.screenshot({ path: path.join(SHOTS, 'count-save-failed-390.png') });
    } finally {
      await hook('offline?on=0');
    }
    await tp.locator('button', { hasText: 'Retry' }).click();
    await tp.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
  });
  await check('Cafe count: storage areas in walk-through order with per-area progress, Kitchen + Storage room boxes, amber Low badge', async () => {
    await page.goto(APP + '#/count/cafe');
    await page.waitForSelector('.area-head');
    const heads = await page.locator('.area-head h3').allTextContents();
    expect(heads.join('|') === 'Frozen|Dry & shelf-stable|Cups, to-go & utensils', 'area order: ' + heads.join('|'));
    const frozen = page.locator('.area', { hasText: 'Frozen' }).first();
    expect((await frozen.locator('.sec-count').textContent()) === '0 of 1', 'frozen progress before');
    const soup = page.locator('.item', { hasText: 'TEST Soup red lentil' });
    expect(await soup.locator('button', { hasText: 'Need more or less?' }).isVisible(), 'Suggest button');
    expect((await soup.locator('button', { hasText: /^(Out|Report low)$/ }).count()) === 0, 'Out and Report low are gone');
    await soup.locator('input').first().fill('2'); // minimum is 2
    await soup.locator('.low-badge').waitFor({ state: 'visible' });
    await soup.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    expect((await frozen.locator('.sec-count').textContent()) === '1 of 1', 'frozen progress after');
    await page.screenshot({ path: path.join(SHOTS, 'count-cafe-areas-390.png'), fullPage: true });
    await soup.locator('input').first().fill('5');
    await soup.locator('.low-badge').waitFor({ state: 'hidden' });
    const cups = page.locator('.item', { hasText: 'TEST CUP HOT 12OZ' });
    const places = await cups.locator('.place').allTextContents();
    expect(places.join('|') === 'Kitchen|Storage room', 'places: ' + places.join('|'));
    await cups.locator('.count-box').nth(0).locator('input').first().fill('1');
    await cups.locator('.count-box').nth(1).locator('input').first().fill('2');
    await cups.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    expect(/Total: 3 cases/.test(await cups.locator('.split-total').textContent()), 'split total');
    await page.screenshot({ path: path.join(SHOTS, 'count-cafe-split-390.png'), fullPage: false });
    // Leave the soup uncounted again for the next check.
    await soup.locator('button', { hasText: 'Clear' }).click();
    await soup.locator('.save-state', { hasText: /^Not counted/ }).waitFor({ timeout: 8000 });
    await noHScroll(page, 'cafe areas');
  });
  await check('Cafe count: correct heading; incomplete finish warns and is allowed', async () => {
    await page.goto(APP + '#/count/cafe');
    await page.waitForSelector('.item');
    expect((await page.textContent('.dept-heading')) === 'Cafe count', 'heading');
    const cups = page.locator('.item', { hasText: 'TEST CUP HOT 12OZ' });
    expect(/20 sleeves \(50 cups each\) per case/.test(await cups.textContent()), 'pack text: ' + await cups.textContent());
    // Sold out: staff just type 0 (in both places).
    await cups.locator('.count-box').nth(0).locator('input').first().fill('0');
    await cups.locator('.count-box').nth(1).locator('input').first().fill('0');
    await cups.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    await page.click('text=Finish count');
    await page.waitForSelector('.modal');
    const dialogText = await page.textContent('.modal-msg');
    await page.screenshot({ path: path.join(SHOTS, 'count-incomplete-warning-390.png') });
    await page.click('.modal button:has-text("OK")');
    await page.waitForSelector('.notice.ok');
    expect(/not been counted/.test(dialogText), 'warning dialog: ' + dialogText);
    expect(/2 items were left uncounted/.test(await page.textContent('.notice.ok')), 'finish message');
  });
  await check('After Finish: staff fix a number, ask for an extra, report an item not on the list; the admin sees it all', async () => {
    await page.goto(APP + '#/');
    await page.goto(APP + '#/count/cafe');
    await page.waitForSelector('.finished-note');
    expect(!(await page.locator('button', { hasText: 'Finish count' }).isVisible()), 'no Finish button once finished');
    const soup = page.locator('.item', { hasText: 'TEST Soup red lentil' });
    await soup.locator('input').first().fill('1');
    await soup.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    const sugar = page.locator('.item', { hasText: 'TEST Sugar packets' });
    await sugar.locator('button', { hasText: 'Need more or less?' }).click();
    await page.waitForSelector('.modal .choice');
    await page.screenshot({ path: path.join(SHOTS, 'staff-suggest-390.png') });
    await page.click('.modal .choice:has-text("+ Extra for this week")');
    await page.click('.modal .stepper button[aria-label="One more"]');
    await page.fill('#sg-note', 'group coming Friday');
    await page.click('.modal button:has-text("Send")');
    await page.waitForSelector('.modal-msg');
    const extraMsg = await page.textContent('.modal-msg');
    expect(/Added to this week’s order ✓ \(\+2 cases of TEST Sugar packets\)/.test(extraMsg), 'extra message: ' + extraMsg);
    await page.click('.modal button:has-text("OK")');
    await page.click('button:has-text("Item not on this list?")');
    await page.fill('#nl-name', 'TEST Oat milk');
    await page.click('.modal button:has-text("Send")');
    await page.waitForSelector('.modal-msg');
    expect(/Sent ✓ "TEST Oat milk"/.test(await page.textContent('.modal-msg')), 'not-listed message');
    await page.click('.modal button:has-text("OK")');
    await noHScroll(page, 'finished count');
  });
  await check('Other Supply request: quantity check, 3 photos with previews, remove one, upload failure keeps everything, retry succeeds', async () => {
    await page.goto(APP + '#/request/supply');
    await page.waitForSelector('#opt option:nth-child(2)', { state: 'attached' });
    await page.selectOption('#opt', '__other');
    await page.fill('#itemName', 'TEST Paper towels for tupa 3');
    await page.fill('#qty', '0');
    await page.click('button:has-text("Send request")');
    expect(/more than 0/.test(await page.textContent('.notice.err')), 'quantity error');
    await page.fill('#qty', '2');
    await page.fill('#unit', 'packs');
    await page.fill('#note', 'Shelf by the door is empty');
    expect(await page.locator('#cam').getAttribute('capture') === 'environment', 'Take photo should use the camera');
    expect(await page.locator('#pick').getAttribute('multiple') !== null, 'Choose photos should allow several');
    await page.setInputFiles('#pick', photoFiles);
    await page.waitForFunction(() => document.querySelectorAll('.thumb img').length === 3 && !document.body.textContent.includes('Preparing'));
    await page.locator('.thumb .rm').nth(2).click();
    expect((await page.locator('.thumb').count()) === 2, 'remove photo');
    await page.screenshot({ path: path.join(SHOTS, 'request-previews-390.png'), fullPage: true });
    await hook('failPhotos?n=1'); // the first photo upload will fail on the server
    await page.click('button:has-text("Send request")');
    await page.waitForSelector('.notice.err');
    expect(/did not upload[\s\S]*Nothing is lost/.test(await page.textContent('.notice.err')), 'upload error text: ' + await page.textContent('.notice.err'));
    expect((await page.inputValue('#itemName')) === 'TEST Paper towels for tupa 3' && (await page.inputValue('#qty')) === '2', 'fields kept');
    expect((await page.locator('.thumb').count()) === 2, 'photos kept');
    await page.screenshot({ path: path.join(SHOTS, 'request-upload-failed-390.png'), fullPage: true });
    await page.click('button:has-text("Send request")');
    await page.waitForSelector('.notice.ok', { timeout: 15000 });
    expect(/with 2 photos[\s\S]*On shopping list/.test(await page.textContent('.notice.ok')), 'success text');
    await page.waitForSelector('.req');
    expect(/TEST Paper towels for tupa 3[\s\S]*On shopping list/.test(await page.textContent('.req')), 'recent list');
  });
  await check('Drink Cooler request from the list; staff page shows no routing', async () => {
    await page.goto(APP + '#/request/drink');
    await page.waitForSelector('#opt option:nth-child(3)', { state: 'attached' });
    const opts = await page.locator('#opt option').allTextContents();
    expect(opts.some((o) => /TEST Craft root beer/.test(o)), 'drink list');
    await page.selectOption('#opt', { label: 'TEST Craft root beer 12 oz bottle' });
    expect(await page.locator('#itemName').isHidden(), 'name box should hide when a drink is chosen');
    await page.fill('#qty', '6');
    await page.setInputFiles('#pick', [photoFiles[0]]);
    await page.waitForSelector('.thumb img');
    await page.click('button:has-text("Send request")');
    await page.waitForSelector('.notice.ok', { timeout: 15000 });
    const html = await page.content();
    expect(!/beverage|Beer \/ Cider \/ Wine list|routing/i.test(html.replace(/Beer \/ Cider \/ Wine<\/span>/g, '')), 'routing words visible to staff');
  });
  await check('Beer / Cider / Wine count: cases + loose bottles/cans, finish', async () => {
    await page.goto(APP + '#/count/beverage');
    await page.waitForSelector('.item');
    const names = await page.locator('.item .name').allTextContents();
    expect(!names.some((n) => /not confirmed/.test(n)), 'unconfirmed product shown to staff');
    const ipa = page.locator('.item', { hasText: 'TEST IPA 12 oz can' });
    expect(/24 cans per case/.test(await ipa.textContent()), 'case size');
    await ipa.locator('input').nth(0).fill('2');
    await ipa.locator('input').nth(1).fill('5');
    await ipa.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    const rb = page.locator('.item', { hasText: 'TEST Craft root beer' });
    await rb.locator('input').nth(0).fill('1');
    await rb.locator('.save-state', { hasText: /^Saved/ }).waitFor({ timeout: 8000 });
    await page.click('text=Finish count');
    await page.click('.modal button:has-text("OK")');
    await page.waitForSelector('.notice.ok');
  });
  await check('Anonymous API calls cannot reach Admin data', async () => {
    for (const action of ['adminRequests', 'adminPhoto', 'adminItems', 'adminSettings', 'adminUpdateRequest', 'adminBackup']) {
      const r = await (await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify({ action, token: 'forged-token-forged-token-forged-token' }) })).json();
      expect(!r.ok && r.error.code === 'auth', action + ' was not refused');
    }
  });

  const admin = await newPage(390);
  await check('Admin sign-in (password checked on the server); wrong password refused', async () => {
    await admin.goto(APP + '#/admin');
    await admin.waitForSelector('#pw');
    expect((await admin.getAttribute('#pw', 'type')) === 'text', 'password visible by default');
    await admin.click('button.pw-toggle');
    expect((await admin.getAttribute('#pw', 'type')) === 'password', 'Hide switches to dots');
    await admin.click('button.pw-toggle');
    expect((await admin.getAttribute('#pw', 'type')) === 'text', 'Show switches back');
    await admin.fill('#pw', 'wrong-password-123');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-signin-390.png') });
    await admin.click('button:has-text("Sign in")');
    await admin.waitForSelector('.notice.err');
    await admin.fill('#pw', 'test-password-123');
    await admin.click('button:has-text("Sign in")');
    await admin.waitForSelector('text=Setup checklist');
    await noHScroll(admin, 'admin overview');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-overview-390.png'), fullPage: true });
  });
  await check('the admin sees the count fix and the extra on the draft, and the item to add on the Overview', async () => {
    // Admin: the draft shows the fix and the extra.
    await admin.goto(APP + '#/admin/orders');
    await admin.locator('.list-item', { hasText: 'Draft' }).locator('a').first().click();
    await admin.waitForSelector('.order-summary');
    const soupRow = await admin.locator('tr', { hasText: 'TEST Soup red lentil' }).first().textContent();
    expect(/Count changed .*\(not counted → 1\)/.test(soupRow), 'count change note: ' + soupRow);
    const sugarRow = await admin.locator('tr', { hasText: 'TEST Sugar packets' }).first().textContent();
    expect(/\+2 extra \(staff: group coming Friday\)/.test(sugarRow), 'extra note: ' + sugarRow);
    await admin.screenshot({ path: path.join(SHOTS, 'admin-draft-staff-notes-390.png'), fullPage: true });
    // Overview: the item to add, with Find in catalog.
    await admin.goto(APP + '#/admin/home');
    await admin.waitForSelector('.staff-card');
    expect(/TEST Oat milk/.test(await admin.textContent('.staff-card')), 'from staff card');
    await admin.click('.staff-card button:has-text("Find in catalog")');
    await admin.waitForFunction(() => location.hash === '#/admin/catalog');
    await admin.goto(APP + '#/admin/requests/add');
    await admin.waitForSelector('.staff-card');
    await admin.click('.staff-card button:has-text("Done")');
    await admin.waitForSelector('.staff-card .chip:has-text("Done")');
  });
  await check('Admin sees every photo and changes status; staff then see "Ordered"', async () => {
    await admin.goto(APP + '#/admin/requests/supply');
    const card = admin.locator('.card', { hasText: 'TEST Paper towels for tupa 3' });
    await card.waitFor();
    await card.locator('button', { hasText: 'Show 2 photos' }).click();
    await admin.waitForFunction(() => document.querySelectorAll('.photos-admin img').length === 2);
    const loaded = await admin.evaluate(() => [...document.querySelectorAll('.photos-admin img')].every((i) => i.complete && i.naturalWidth > 0));
    expect(loaded, 'photos did not render');
    await card.locator('select').first().selectOption('ordered');
    await card.locator('button', { hasText: 'Save' }).click();
    await card.locator('.notice.ok').waitFor();
    await admin.screenshot({ path: path.join(SHOTS, 'admin-requests-390.png'), fullPage: true });
    await page.goto(APP + '#/request/supply');
    await page.waitForSelector('.req');
    expect(/TEST Paper towels for tupa 3[\s\S]*Ordered/.test(await page.textContent('.req')), 'staff status');
  });
  await check('Drink routing is private: root beer is on the Beer / Cider / Wine list for the admin', async () => {
    await admin.goto(APP + '#/admin/requests/beverage');
    await admin.locator('.card', { hasText: 'TEST Craft root beer' }).waitFor();
    await noHScroll(admin, 'admin requests');
  });
  await check('Ginsberg draft: department headings, below-20 warning, stays a draft until the admin confirms', async () => {
    await admin.goto(APP + '#/admin/orders');
    await admin.click('button:has-text("Start a new draft")');
    await admin.waitForSelector('text=Draft order');
    const heads = await admin.locator('h2.dept-heading').allTextContents();
    expect(heads.join('|') === 'Housekeeping|Cafe', 'headings: ' + heads);
    expect(/short of the 20-case minimum/.test(await admin.textContent('body')), 'minimum warning');
    expect(/#90001/.test(await admin.textContent('pre.export')), 'export has item numbers');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-order-draft-390.png'), fullPage: true });
    await admin.click('button:has-text("Mark as submitted")');
    await admin.waitForSelector('.modal');
    expect(/confirm you sent/.test(await admin.textContent('.modal-msg')), 'should require the checkbox');
    await admin.click('.modal button:has-text("OK")');
    expect(/Draft order/.test(await admin.textContent('body')), 'still a draft');
    await admin.check('text=I have sent this order to Ginsberg’s myself');
    await admin.click('button:has-text("Mark as submitted")');
    await admin.waitForSelector('text=Submitted order');
    expect(JSON.parse(JSON.stringify(await hook('mail'))).length === 0, 'no email sent');
  });
  await check('Finishing the Cafe count built a draft: case total, progress toward 20, deadline, prices with a running total', async () => {
    await admin.goto(APP + '#/admin/orders');
    await admin.waitForSelector('text=Updated from the Cafe count');
    await admin.locator('.list-item', { hasText: 'Updated from the Cafe count' }).locator('a').first().click();
    await admin.waitForSelector('.order-summary .min-bar');
    const sum = await admin.textContent('.order-summary');
    expect(/Order by .* for .* delivery/.test(sum), 'deadline line: ' + sum);
    expect(/short of the 20-case minimum/.test(sum), 'minimum warning');
    expect(/\$242\.19/.test(sum), 'dollar total (cups 3 x $22.22 + soup 5 x $33.33 + sugar 2 extra x $4.44): ' + sum);
    const w = await admin.locator('.min-bar > div').evaluate((e) => e.style.width);
    expect(w === '50%', 'progress width ' + w);
    // Editing a quantity updates the totals right away.
    await admin.locator('tr', { hasText: 'TEST CUP HOT' }).locator('input.line-input').fill('5');
    expect(/\$286\.63/.test(await admin.textContent('.order-summary')), 'live total after edit');
    await noHScroll(admin, 'draft');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-auto-draft-390.png'), fullPage: true });
  });
  await check('Pause ordering: home says "Ordering paused"; turning it back on restores the deadline', async () => {
    await admin.goto(APP + '#/admin/settings');
    await admin.waitForSelector('text=Pause ordering');
    await admin.check('label:has-text("Pause ordering") input');
    await admin.click('.card:has-text("Pause ordering") button:has-text("Save")');
    await admin.waitForSelector('text=Ordering is paused. Counts continue');
    await page.goto(APP + '#/');
    await page.waitForSelector('.paused-note');
    expect(!(await page.locator('.status-card .delivery').isVisible()), 'deadline text hidden while paused');
    await page.screenshot({ path: path.join(SHOTS, 'home-paused-390.png') });
    await admin.uncheck('label:has-text("Pause ordering") input');
    await admin.click('.card:has-text("Pause ordering") button:has-text("Save")');
    await admin.waitForSelector('text=Ordering is on');
    await page.goto(APP + '#/count/cafe');
    await page.goto(APP + '#/');
    await page.waitForSelector('.status-dates');
    expect(!(await page.locator('.paused-note').count()), 'paused note gone');
  });
  await check('Beverage report: graph, table, missing data separate, CSV download', async () => {
    await admin.goto(APP + '#/admin/reports/weekly');
    await admin.waitForSelector('svg.chart');
    const txt = await admin.textContent('body');
    expect(/Missing data \(not treated as zero\)/.test(txt), 'missing-data section');
    expect(/not exact sales/.test(txt), 'basis text');
    const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('button:has-text("Download CSV")')]);
    expect(/beverage-report-.*\.csv/.test(dl.suggestedFilename()), 'download name');
    await noHScroll(admin, 'report');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-report-390.png'), fullPage: true });
  });
  await check('Catalog: remove several unused items, find them under Removed items, restore one', async () => {
    await admin.goto(APP + '#/admin/catalog');
    await admin.waitForSelector('.card select');
    await admin.fill('input[placeholder^="Search name"]', ''); // "Find in catalog" earlier left a search
    await admin.locator('.card select').first().selectOption('candidates');
    await admin.waitForSelector('text=Select all shown');
    const before = await admin.locator('.list-item').count();
    await admin.locator('.list-item input[type=checkbox]').nth(0).check();
    await admin.locator('.list-item input[type=checkbox]').nth(1).check();
    await admin.click('button:has-text("Remove selected (2)")');
    await admin.waitForSelector('.modal');
    expect(/Nothing is deleted/.test(await admin.textContent('.modal-msg')), 'reassurance text');
    await admin.click('.modal button:has-text("Remove")');
    await admin.waitForFunction((n) => document.querySelectorAll('.list-item').length === n - 2, before);
    await admin.locator('.card select').first().selectOption('removed');
    await admin.waitForFunction(() => document.querySelectorAll('.list-item').length === 2);
    await admin.screenshot({ path: path.join(SHOTS, 'admin-catalog-removed-390.png'), fullPage: true });
    await admin.locator('.list-item input[type=checkbox]').nth(0).check();
    await admin.click('button:has-text("Restore selected (1)")');
    await admin.click('.modal button:has-text("Restore")');
    await admin.waitForFunction(() => document.querySelectorAll('.list-item').length === 1);
    await admin.locator('.card select').first().selectOption('active');
    await noHScroll(admin, 'catalog remove');
  });
  await check('Catalog: "Fill from notes & Ginsberg’s records" shows a preview before changing anything', async () => {
    await admin.goto(APP + '#/admin/catalog');
    await admin.click('button:has-text("Fill from notes")');
    await admin.waitForSelector('text=/Preview \\(nothing saved yet\\)|Nothing to fill/');
  });
  await check('Catalog: "Set up loose counting" suggests from case packs and staff then get a Loose box', async () => {
    await admin.goto(APP + '#/admin/catalog');
    await admin.click('button:has-text("Set up loose counting")');
    await admin.waitForSelector('text=Set up loose counting (nothing saved yet)');
    const soupRow = admin.locator('tr', { hasText: 'TEST Soup red lentil' });
    expect((await soupRow.locator('input[type=checkbox]').isChecked()), 'soup ticked by default');
    expect((await soupRow.locator('input.line-input').inputValue()) === '4', 'soup 4 per case');
    expect((await soupRow.locator('input').nth(2).inputValue()) === 'bags', 'soup label');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-loose-setup-390.png'), fullPage: true });
    await admin.click('button:has-text("Apply to ticked items")');
    await admin.waitForSelector('text=/Loose counting is on for/');
    await page.goto(APP + '#/count/cafe');
    await page.waitForSelector('.item');
    expect(/Loose bags/.test(await page.locator('.item', { hasText: 'TEST Soup red lentil' }).textContent()), 'staff loose box');
  });
  await check('Backup: Google refusal shows the one-time steps; then "Turn on weekly backup" works', async () => {
    await hook('failBackup?on=1');
    await admin.goto(APP + '#/admin/import');
    await admin.click('button:has-text("Turn on weekly backup")');
    await admin.waitForSelector('text=One-time steps instead');
    expect(/installWeeklyDriveBackup/.test(await admin.textContent('body')), 'manual steps');
    await hook('failBackup?on=0');
    await admin.click('button:has-text("Turn on weekly backup")');
    await admin.waitForSelector('text=/On: a copy of everything/');
    await admin.waitForSelector('button:has-text("Back up now")');
    await admin.screenshot({ path: path.join(SHOTS, 'admin-backup-390.png'), fullPage: false });
  });
  for (const [hash, label] of [['#/admin/catalog', 'catalog'], ['#/admin/beverages', 'beverages'], ['#/admin/import', 'import'], ['#/admin/settings', 'settings'], ['#/admin/counts', 'counts']]) {
    await check('Admin ' + label + ' page loads without sideways scroll at 360px', async () => {
      await admin.setViewportSize({ width: 360, height: 800 });
      await admin.goto(APP + hash);
      await admin.waitForSelector('.card');
      await admin.waitForTimeout(300);
      expect(!(await admin.locator('.notice.err').count()), 'error shown: ' + (await admin.locator('.notice.err').allTextContents()));
      await noHScroll(admin, label);
      await admin.screenshot({ path: path.join(SHOTS, 'admin-' + label + '-360.png'), fullPage: true });
    });
  }
  await check('No JavaScript errors on any page', async () => { expect(!pageErrors.length, pageErrors.join('; ')); });
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => r[0] === 'FAIL');
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
fs.writeFileSync(path.join(SHOTS, 'e2e-results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
