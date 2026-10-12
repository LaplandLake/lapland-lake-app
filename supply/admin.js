/* Lapland Lake Supply Manager: Todd's Admin area.
   Every action here is checked again on the server; hiding a button is never the only guard. */
(function () {
  'use strict';
  const { h, mount, ask, tell, api, store, fmtDateTime, plural, topbar, KIND_HEADING } = window.SM;
  const C = window.SMCharts;
  const TOKEN_KEY = 'sm-admin-token';

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t, remember) {
    try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t); } catch (e) { /* storage blocked: stays signed in until reload */ }
    memToken = t;
  }
  function clearToken() {
    memToken = '';
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  }
  let memToken = '';
  function token() { return memToken || getToken(); }

  async function aapi(action, body) {
    try {
      return await api(action, Object.assign({ token: token() }, body || {}));
    } catch (err) {
      if (err.code === 'auth' && action !== 'adminLogin' && action !== 'adminSetup' && action !== 'adminChangePassword') {
        clearToken();
        renderLogin('Your Admin session ended. Please sign in again.');
      }
      throw err;
    }
  }

  const TABS = [
    ['home', 'Overview'], ['orders', 'Ginsberg orders'], ['requests', 'Requests'], ['catalog', 'Catalog'],
    ['counts', 'Counts'], ['beverages', 'Beverages'], ['reports', 'Reports'], ['import', 'Import & backup'], ['settings', 'Settings'],
  ];
  function shell(tab, ...content) {
    mount(topbar('Todd — Admin', '#/'),
      h('div', { class: 'wrap wide' },
        h('nav', { class: 'tabs', 'aria-label': 'Admin sections' }, TABS.map((t) => h('a', { href: '#/admin/' + t[0], 'aria-current': t[0] === tab ? 'page' : null }, t[1]))),
        ...content));
  }
  function loading() { return h('p', { class: 'muted' }, 'Loading…'); }
  function errBox(err) { return h('div', { class: 'notice err', role: 'alert' }, err.message || String(err)); }
  function okBox(text) { return h('div', { class: 'notice ok', role: 'status' }, text); }
  // On phones, tables become stacked rows; each cell gets its column name as a label.
  function labelize(table) {
    const heads = Array.from(table.querySelectorAll('thead th')).map((t) => t.textContent);
    table.querySelectorAll('tbody tr').forEach((tr) => Array.from(tr.children).forEach((td, i) => {
      td.setAttribute('data-label', heads[i] || '');
      if (td.childNodes.length > 1) { const box = document.createElement('div'); while (td.firstChild) box.appendChild(td.firstChild); td.appendChild(box); }
    }));
    table.classList.add('resp');
    if (table.parentElement && table.parentElement.classList.contains('table-wrap')) table.parentElement.classList.add('resp');
  }
  function replace(el, ...kids) {
    el.innerHTML = '';
    kids.flat().forEach((k) => k && el.appendChild(k));
    el.querySelectorAll('table.data').forEach(labelize);
  }
  function field(label, input, hint) {
    const id = input.id || ('f' + Math.random().toString(36).slice(2, 9));
    input.id = id;
    return h('div', null, h('label', { for: id }, label), input, hint ? h('div', { class: 'small muted' }, hint) : null);
  }
  function inp(value, attrs) { return h('input', Object.assign({ type: 'text', value: value === null || value === undefined ? '' : String(value), autocomplete: 'off' }, attrs || {})); }
  function check(checked, label, attrs) {
    const c = h('input', Object.assign({ type: 'checkbox', checked: !!checked, style: 'width:24px;height:24px;margin-right:10px;vertical-align:middle' }, attrs || {}));
    return { box: c, el: h('label', { style: 'font-weight:600;display:flex;align-items:center;min-height:44px' }, c, label) };
  }
  function selectEl(value, options, attrs) {
    const s = h('select', attrs || {}, options.map((o) => h('option', { value: o[0], selected: o[0] === value }, o[1])));
    return s;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function csv(rows) {
    return rows.map((r) => r.map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied ✓'; }
    catch (e) {
      // Clipboard refused: select the text so it can be copied by hand.
      const pre = document.querySelector('pre.export');
      if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      btn.textContent = 'Selected: copy it now';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 2500);
  }
  function busy(btn, fn) {
    return async (e) => {
      if (e) e.preventDefault();
      if (btn.disabled) return;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Working…';
      try { await fn(); } finally { btn.disabled = false; if (btn.isConnected) btn.textContent = label; }
    };
  }
  const nyDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '');
  const localInputValue = (d) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 16);
  };

  /* ------------------------------------------------------------ sign in */
  async function renderLogin(message) {
    const box = h('div', { class: 'wrap' }, loading());
    mount(topbar('Todd — Admin', '#/'), box);
    let configured = true;
    try { configured = (await api('adminSetupStatus')).configured; } catch (err) { replace(box, errBox(err)); return; }
    if (!configured) return renderSetup(box);
    const pw = h('input', { type: 'password', autocomplete: 'current-password', id: 'pw' });
    const remember = check(false, 'Keep me signed in on this device (12 hours)');
    const msg = h('div', null, message ? h('div', { class: 'notice warn' }, message) : null);
    const btn = h('button', { class: 'btn block', type: 'submit' }, 'Sign in');
    const form = h('form', { class: 'card', onsubmit: (e) => busy(btn, async () => {
      try {
        const r = await api('adminLogin', { password: pw.value });
        setToken(r.token, remember.box.checked);
        pw.value = '';
        route(['home']);
      } catch (err) { replace(msg, errBox(err)); }
    })(e) }, h('h2', null, 'Sign in'), msg, field('Password', pw), remember.el, btn,
    h('p', { class: 'small muted' }, 'Forgot the password? In the Apps Script editor run createAdminSetupCode, then ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); renderSetup(box); } }, 'use the setup code here'), '.'));
    replace(box, form);
    pw.focus();
  }

  function renderSetup(box) {
    const code = inp('', { autocapitalize: 'characters' });
    const p1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const msg = h('div');
    const btn = h('button', { class: 'btn block', type: 'submit' }, 'Save password and sign in');
    replace(box, h('form', { class: 'card', onsubmit: (e) => busy(btn, async () => {
      if (p1.value !== p2.value) { replace(msg, errBox(new Error('The two passwords do not match.'))); return; }
      try {
        const r = await api('adminSetup', { setupCode: code.value, newPassword: p1.value, confirmPassword: p2.value });
        setToken(r.token, false);
        route(['home']);
      } catch (err) { replace(msg, errBox(err)); }
    })(e) },
    h('h2', null, 'Set your Admin password'),
    h('ol', null,
      h('li', null, 'Open the Apps Script project for this app (script.google.com).'),
      h('li', null, 'Choose the function ', h('b', null, 'createAdminSetupCode'), ' and press Run.'),
      h('li', null, 'Open the Execution log and copy the one-time code (valid 30 minutes).'),
      h('li', null, 'Enter it below with a new password only you know (at least 10 characters).')),
    h('p', { class: 'small muted' }, 'Your password is checked on the server and stored only as a salted hash in your Google account. Never paste it into a chat or email.'),
    msg, field('One-time setup code', code), field('New password', p1), field('New password again', p2), btn));
  }

  /* ------------------------------------------------------------ overview */
  async function renderHome() {
    const box = h('div', null, loading());
    shell('home', box);
    try {
      const d = await aapi('adminDashboard');
      const c = d.checklist;
      const tick = (ok, text, href) => h('li', null, ok ? '✅ ' : '⬜ ', href ? h('a', { href }, text) : text);
      replace(box,
        h('div', { class: 'grid2 stack' },
          h('div', { class: 'card' }, h('h2', null, 'Right now'),
            h('dl', { class: 'kv' },
              h('dt', null, 'Housekeeping count'), h('dd', null, d.counts.housekeeping ? 'In progress since ' + fmtDateTime(d.counts.housekeeping.startedAt) : 'None open'),
              h('dt', null, 'Cafe count'), h('dd', null, d.counts.cafe ? 'In progress since ' + fmtDateTime(d.counts.cafe.startedAt) : 'None open'),
              h('dt', null, 'Beverage count'), h('dd', null, d.counts.beverage ? 'In progress since ' + fmtDateTime(d.counts.beverage.startedAt) : 'None open'),
              h('dt', null, 'Shopping list'), h('dd', null, h('a', { href: '#/admin/requests' }, plural(d.requests.shopping, 'request', 'requests'))),
              h('dt', null, 'Drinks to route'), h('dd', null, d.requests.unassignedDrinks ? h('a', { href: '#/admin/requests' }, d.requests.unassignedDrinks + ' need a list') : 'None'),
              h('dt', null, 'Draft orders'), h('dd', null, h('a', { href: '#/admin/orders' }, String(d.drafts))),
              h('dt', null, 'Next delivery'), h('dd', null, d.nextDelivery ? 'Thu ' + d.nextDelivery.deliveryDate + ' · order by ' + fmtDateTime(d.nextDelivery.deadline) : '—'))),
          h('div', { class: 'card' }, h('h2', null, 'Setup checklist'),
            h('ul', { class: 'checklist', style: 'list-style:none;padding:0' },
              tick(c.password, 'Admin password set'),
              tick(c.ginsbergImported, 'Ginsberg’s source files imported', '#/admin/import'),
              tick(c.activeCatalog, 'Active catalog chosen (' + d.catalog.activeHousekeeping + ' housekeeping, ' + d.catalog.activeCafe + ' cafe)', '#/admin/catalog'),
              tick(c.activeCatalog && c.countingUnits, 'Counting units confirmed for active items', '#/admin/catalog'),
              tick(c.beverageProducts, 'Beverage products with confirmed case sizes', '#/admin/beverages'),
              tick(c.emailRecipient, 'Weekly email recipient', '#/admin/settings'),
              tick(c.supplierInfo, 'Supplier customer number and contacts', '#/admin/settings'),
              tick(c.driveBackup, 'Optional weekly Drive backup', '#/admin/import')))),
        h('div', { class: 'card' }, h('h2', null, 'Catalog'),
          h('p', null, d.catalog.active + ' active items, ' + d.catalog.candidates + ' inactive review candidates. Beverages: ' + d.beverages.active + ' active, ' + d.beverages.needsReview + ' need a confirmed case size.')),
        h('p', null, h('button', { class: 'btn secondary', onclick: async () => { try { await aapi('adminLogout'); } catch (e) { /* ignore */ } clearToken(); location.hash = '#/'; } }, 'Sign out')));
    } catch (err) { replace(box, errBox(err)); }
  }

  /* ------------------------------------------------------------ orders */
  const FLAG_TEXT = {
    'not-counted': 'Not counted', 'loose-units-not-converted': 'Loose units not converted (units per case not confirmed)',
    'reported-low': 'Reported low', 'reported-out': 'Reported out', 'counting-unit-unconfirmed': 'Counting unit not confirmed',
    'no-desired-stock': 'No desired stock set', 'supplier-status': 'Supplier status needs checking',
    'item-number-unverified': 'Item # missing/unverified', 'count-not-finished': 'Count not finished', imported: 'Imported',
  };
  async function renderOrders() {
    const box = h('div', null, loading());
    const newBtn = h('button', { class: 'btn' }, 'Start a draft from the latest counts');
    newBtn.onclick = busy(newBtn, async () => {
      try { const r = await aapi('adminCreateDraft'); location.hash = '#/admin/order/' + r.order.id; } catch (err) { box.prepend(errBox(err)); }
    });
    shell('orders', h('div', { class: 'card' }, h('h2', null, 'Ginsberg’s order'),
      h('p', null, 'Combines the Housekeeping and Cafe counts into one draft. Nothing is ever sent from the app: you send the order yourself (text, email or call), then mark it submitted here.'),
      newBtn), box);
    try {
      const d = await aapi('adminOrders');
      const rows = d.orders.map((o) => h('div', { class: 'list-item row' },
        h('div', { class: 'grow' }, h('a', { href: '#/admin/order/' + o.id }, h('b', null, (o.status === 'draft' ? 'Draft' : o.status === 'submitted' ? 'Submitted' : o.status === 'discarded' ? 'Discarded' : o.status) + ' · ' + plural(o.totalCases, 'case', 'cases'))),
          h('div', { class: 'small muted' }, 'Created ' + fmtDateTime(o.createdAt) + (o.deliveryDate ? ' · for Thu ' + o.deliveryDate : '') + (o.submittedAt ? ' · submitted ' + fmtDateTime(o.submittedAt) : '') + (o.origin && o.origin !== 'app' ? ' · ' + o.origin : ''))),
        h('span', { class: 'chip ' + (o.status === 'submitted' ? 'ordered' : o.status === 'draft' ? 'shopping' : 'gray') }, o.status)));
      replace(box, h('div', { class: 'card' }, h('h2', null, 'Order history'), d.nextDelivery ? h('p', { class: 'small muted' }, 'Next delivery Thursday ' + d.nextDelivery.deliveryDate + '. Latest order ' + fmtDateTime(d.nextDelivery.deadline) + '. Earlier in the week preferred.') : null,
        rows.length ? rows : h('p', { class: 'muted' }, 'No orders yet.')));
    } catch (err) { replace(box, errBox(err)); }
  }

  async function renderOrder(id) {
    const box = h('div', null, loading());
    shell('orders', h('p', null, h('a', { href: '#/admin/orders' }, '‹ All orders')), box);
    let d;
    try { d = await aapi('adminOrder', { orderId: id }); } catch (err) { replace(box, errBox(err)); return; }
    draw();
    function draw() {
      const o = d.order;
      const draft = o.status === 'draft';
      const inputs = {};
      const msg = h('div');
      const totalEl = h('b');
      const recalc = () => {
        let t = 0;
        d.lines.forEach((l) => { const v = inputs[l.id] ? Number(inputs[l.id].value) : l.finalCases; if (isFinite(v)) t += v; });
        totalEl.textContent = plural(t, 'case', 'cases');
        totalEl.style.color = t < d.supplier.minimumCases ? 'var(--err)' : '';
      };
      const sections = ['housekeeping', 'cafe'].map((dept) => {
        const lines = d.lines.filter((l) => l.department === dept);
        return h('div', null, h('h2', { class: 'dept-heading' }, KIND_HEADING[dept]),
          lines.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
            h('thead', null, h('tr', null, ['Item #', 'Description', 'Case pack', 'On hand', 'Desired', 'Suggested', 'Order (cases)', 'Flags'].map((x, i) => h('th', { class: i >= 3 && i <= 6 ? 'num' : null }, x)))),
            h('tbody', null, lines.map((l) => {
              if (draft) {
                inputs[l.id] = h('input', { type: 'text', inputmode: 'numeric', class: 'line-input', value: String(l.finalCases), 'aria-label': 'Cases of ' + l.description, oninput: recalc });
              }
              return h('tr', null,
                h('td', null, l.supplierItemNumber || h('span', { class: 'chip red' }, 'none')),
                h('td', null, l.description, l.snapshot && l.snapshot.name && l.snapshot.name !== l.description ? h('div', { class: 'small muted' }, l.snapshot.name) : null),
                h('td', null, l.casePackRaw),
                h('td', { class: 'num' }, l.onHandCases === null ? '—' : String(l.onHandCases)),
                h('td', { class: 'num' }, l.desiredStock === null ? '—' : String(l.desiredStock)),
                h('td', { class: 'num' }, l.suggestedCases === null ? '—' : String(l.suggestedCases)),
                h('td', { class: 'num' }, draft ? inputs[l.id] : String(l.finalCases)),
                h('td', null, (l.flags || []).map((f) => h('div', { class: 'small' }, '⚠ ' + (FLAG_TEXT[f] || f)))));
            })))) : h('p', { class: 'muted' }, 'No active ' + KIND_HEADING[dept] + ' items.'));
      });
      const outLines = d.lines.filter((l) => (l.flags || []).indexOf('reported-out') >= 0 && l.itemId);
      const suggest = draft && outLines.length ? h('div', { class: 'card' }, h('h3', null, 'Items reported out'),
        h('p', { class: 'small muted' }, 'Desired stock never changes on its own. If you want a higher target for next time, enter it and press Approve.'),
        outLines.map((l) => {
          const v = inp(l.desiredStock, { inputmode: 'decimal', class: 'line-input' });
          const b = h('button', { class: 'btn small secondary', type: 'button' }, 'Approve');
          b.onclick = busy(b, async () => { try { await aapi('adminSetDesiredStock', { itemId: l.itemId, desiredStock: v.value }); b.textContent = 'Saved ✓'; } catch (err) { tell(err.message); } });
          return h('div', { class: 'row', style: 'margin:6px 0' }, h('span', { class: 'grow' }, l.description), v, b);
        })) : null;
      const note = h('textarea', { maxlength: 2000 }, o.note || '');
      const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Save changes');
      saveBtn.onclick = busy(saveBtn, async () => {
        for (const l of d.lines) { if (!/^\d+$/.test(inputs[l.id].value.trim())) { replace(msg, errBox(new Error('Use whole numbers of cases (0 or more) for "' + l.description + '".'))); return; } }
        try { d = await aapi('adminSaveOrder', { orderId: o.id, note: note.value, lines: d.lines.map((l) => ({ id: l.id, finalCases: inputs[l.id].value.trim() })) }); draw(); box.prepend(okBox('Saved.')); } catch (err) { replace(msg, errBox(err)); }
      });
      const exportText = d.exportText;
      const copyBtn = h('button', { class: 'btn secondary', type: 'button' }, 'Copy');
      copyBtn.onclick = () => copyText(exportText, copyBtn);
      const csvRows = [['Department', 'Item #', 'Description', 'Case pack', 'Cases']].concat(
        d.lines.filter((l) => l.finalCases > 0).map((l) => [KIND_HEADING[l.department] || l.department, l.supplierItemNumber, l.description, l.casePackRaw, l.finalCases]));
      const sent = check(false, 'I have sent this order to Ginsberg’s myself');
      const method = selectEl('text', [['text', 'Text message'], ['email', 'Email'], ['phone', 'Phone call'], ['in person', 'In person / circled guide'], ['other', 'Other']]);
      const subBtn = h('button', { class: 'btn warn', type: 'button' }, 'Mark as submitted');
      subBtn.onclick = busy(subBtn, async () => {
        if (!sent.box.checked) { tell('Tick the box to confirm you sent the order yourself.'); return; }
        try { d = await aapi('adminSubmitOrder', { orderId: o.id, confirm: 'I-SENT-IT', method: method.value }); draw(); } catch (err) { replace(msg, errBox(err)); }
      });
      const discardBtn = h('button', { class: 'btn danger', type: 'button' }, 'Discard draft');
      discardBtn.onclick = busy(discardBtn, async () => {
        if (!await ask('Discard this draft? It stays in history as discarded.')) return;
        try { await aapi('adminCancelOrder', { orderId: o.id }); location.hash = '#/admin/orders'; } catch (err) { replace(msg, errBox(err)); }
      });
      replace(box,
        h('div', { class: 'card' },
          h('h2', null, (draft ? 'Draft order' : o.status === 'submitted' ? 'Submitted order' : 'Order (' + o.status + ')')),
          h('dl', { class: 'kv' },
            h('dt', null, 'Delivery'), h('dd', null, o.deliveryDate ? 'Thursday ' + o.deliveryDate : '—'),
            h('dt', null, 'Latest order'), h('dd', null, o.deadline ? fmtDateTime(o.deadline) + ' (Wednesday 4:00 PM New York time). Earlier in the week preferred.' : '—'),
            h('dt', null, 'Minimum'), h('dd', null, d.supplier.minimumCases + ' cases'),
            h('dt', null, 'Total'), h('dd', null, totalEl),
            o.submittedAt ? h('dt', null, 'Submitted') : null, o.submittedAt ? h('dd', null, fmtDateTime(o.submittedAt) + ' by ' + (o.submittedMethod || '?')) : null),
          d.warnings.map((w) => h('div', { class: 'notice warn', style: 'margin-top:10px' }, w)), msg),
        sections, suggest,
        draft ? h('div', { class: 'card' }, field('Order note (private)', note), h('div', { class: 'row', style: 'margin-top:10px' }, saveBtn)) : null,
        h('div', { class: 'card' }, h('h2', null, 'Copy / export'),
          h('p', { class: 'small muted' }, draft ? 'Save changes first so the export matches.' : ''),
          h('pre', { class: 'export' }, exportText),
          h('div', { class: 'row' }, copyBtn,
            h('button', { class: 'btn secondary', type: 'button', onclick: () => download('ginsbergs-order-' + (o.deliveryDate || o.id) + '.csv', csv(csvRows), 'text/csv') }, 'Download CSV'),
            h('a', { class: 'btn secondary', href: 'mailto:?subject=' + encodeURIComponent('Lapland Lake order') + '&body=' + encodeURIComponent(exportText) }, 'Open in my email'),
            h('a', { class: 'btn secondary', href: 'sms:?&body=' + encodeURIComponent(exportText) }, 'Open in my texts'),
            h('button', { class: 'btn secondary', type: 'button', onclick: () => window.print() }, 'Print')),
          h('p', { class: 'small muted' }, 'Email and text buttons only open your own app with the order filled in; you choose the recipient and press send.')),
        draft ? h('div', { class: 'card' }, h('h2', null, 'After you send it'), sent.el, field('How did you send it?', method), h('div', { class: 'row', style: 'margin-top:10px' }, subBtn, discardBtn)) : null);
      recalc();
    }
  }

  /* ------------------------------------------------------------ requests */
  const ROUTE_LABEL = { supply: 'Other Supply shopping list', beverage: 'Beer / Cider / Wine order list', unassigned: 'Not assigned yet' };
  async function renderRequests(filter) {
    filter = filter || 'supply';
    const box = h('div', null, loading());
    const filters = [['supply', 'Other Supply list'], ['beverage', 'Beer / Cider / Wine list'], ['unassigned', 'Drinks to assign'], ['ordered', 'Ordered'], ['lists', 'Supply & drink lists']];
    shell('requests', h('nav', { class: 'tabs', 'aria-label': 'Request lists' }, filters.map((f) => h('a', { href: '#/admin/requests/' + f[0], 'aria-current': f[0] === filter ? 'page' : null }, f[1]))), box);
    if (filter === 'lists') return renderLists(box);
    let d;
    try { d = await aapi('adminRequests'); } catch (err) { replace(box, errBox(err)); return; }
    const reqs = d.requests.filter((r) => filter === 'ordered' ? r.status === 'ordered' : r.status === 'shopping' && r.routing === filter);
    replace(box, h('p', { class: 'muted small' }, filter === 'ordered' ? 'Requests marked Ordered.' : 'Requests marked "On shopping list" on the ' + ROUTE_LABEL[filter] + '.'),
      reqs.length ? reqs.map(requestCard) : h('p', { class: 'muted' }, 'Nothing here.'));

    function requestCard(r) {
      const status = selectEl(r.status, [['shopping', 'On shopping list'], ['ordered', 'Ordered']]);
      const routing = r.kind === 'drink' ? selectEl(r.routingOverride, [['', 'Use the drink’s setting (' + (ROUTE_LABEL[r.drinkDefaultRouting] || 'not assigned') + ')'], ['supply', ROUTE_LABEL.supply], ['beverage', ROUTE_LABEL.beverage]]) : null;
      const note = h('textarea', { maxlength: 1000, style: 'min-height:60px' }, r.adminNote || '');
      const photosEl = h('div', { class: 'photos-admin' });
      const msg = h('div');
      const save = h('button', { class: 'btn small', type: 'button' }, 'Save');
      save.onclick = busy(save, async () => {
        try {
          await aapi('adminUpdateRequest', Object.assign({ requestId: r.id, status: status.value, adminNote: note.value }, routing ? { routingOverride: routing.value } : {}));
          replace(msg, okBox('Saved.'));
        } catch (err) { replace(msg, errBox(err)); }
      });
      const del = h('button', { class: 'btn small danger', type: 'button' }, 'Delete');
      del.onclick = busy(del, async () => {
        if (!await ask('Delete this request and its photos? This cannot be undone.')) return;
        try { await aapi('adminDeleteRequest', { requestId: r.id, confirm: 'DELETE' }); card.remove(); } catch (err) { replace(msg, errBox(err)); }
      });
      const n = (r.photoIds || []).length;
      const showBtn = h('button', { class: 'btn small secondary', type: 'button' }, 'Show ' + plural(n, 'photo', 'photos'));
      showBtn.onclick = busy(showBtn, async () => {
        photosEl.innerHTML = '';
        for (const pid of r.photoIds) {
          try {
            const p = await aapi('adminPhoto', { photoId: pid });
            const src = 'data:' + p.mimeType + ';base64,' + p.data;
            photosEl.appendChild(h('img', { src, alt: 'Photo for ' + r.itemName, onclick: () => viewPhoto(src) }));
          } catch (err) { photosEl.appendChild(h('div', { class: 'notice err small' }, 'Photo could not load: ' + err.message)); }
        }
      });
      const card = h('div', { class: 'card' },
        h('div', { class: 'row' }, h('h3', { class: 'grow', style: 'margin:0' }, r.itemName + ' × ' + (r.quantity === null ? '?' : r.quantity) + (r.quantityUnit ? ' ' + r.quantityUnit : '')),
          h('span', { class: 'chip ' + (r.status === 'ordered' ? 'ordered' : 'shopping') }, r.statusLabel)),
        h('div', { class: 'small muted' }, (r.kind === 'drink' ? 'Drink Cooler' : 'Other Supply') + ' · ' + fmtDateTime(r.createdAt) + ' · list: ' + ROUTE_LABEL[r.routing] + (r.origin && r.origin !== 'app' ? ' · ' + r.origin : '')),
        r.note ? h('p', null, r.note) : null,
        n ? h('div', null, showBtn, photosEl) : h('p', { class: 'small muted' }, 'No photos.'),
        h('div', { class: 'grid2 stack' }, field('Status (staff see this)', status), routing ? field('Order list (private)', routing) : h('div')),
        field('Private note', note), h('div', { class: 'row', style: 'margin-top:8px' }, save, del), msg);
      return card;
    }
  }
  function viewPhoto(src) {
    const v = h('div', { class: 'photo-view', role: 'dialog', 'aria-label': 'Photo', onclick: () => v.remove() }, h('img', { src, alt: '' }), h('button', { class: 'btn small' }, 'Close'));
    document.body.appendChild(v);
  }

  async function renderLists(box) {
    let d;
    try { d = await aapi('adminLists'); } catch (err) { replace(box, errBox(err)); return; }
    draw();
    function draw() {
      const supplyRows = d.supplies.map((s) => listRow('supply', s));
      const drinkRows = d.drinks.map((s) => listRow('drink', s));
      replace(box,
        h('div', { class: 'card' }, h('h2', null, 'Regular supplies (staff can pick these)'), supplyRows.length ? supplyRows : h('p', { class: 'muted' }, 'None yet.'), listRow('supply', null)),
        h('div', { class: 'card' }, h('h2', null, 'Drink Cooler drinks'),
          h('p', { class: 'small muted' }, 'Each drink goes to a list you choose. Staff never see this choice. Craft sodas usually go on the Beer / Cider / Wine list.'),
          drinkRows.length ? drinkRows : h('p', { class: 'muted' }, 'None yet.'), listRow('drink', null)));
    }
    function listRow(kind, rec) {
      const name = inp(rec ? rec.name : '', { maxlength: 120, placeholder: rec ? '' : (kind === 'drink' ? 'Add a drink (exact name/flavor)' : 'Add a regular supply') });
      const active = check(rec ? rec.active : true, 'Shown to staff');
      const extra = kind === 'supply' ? inp(rec ? rec.defaultUnit : '', { maxlength: 40, placeholder: 'default unit' })
        : selectEl(rec ? rec.routing : '', [['', 'Not assigned'], ['supply', 'Other Supply list'], ['beverage', 'Beer / Cider / Wine list']]);
      const bev = kind === 'drink' ? selectEl(rec ? rec.beverageProductId : '', [['', 'Linked beverage product: none']].concat(d.bevProducts.map((p) => [p.id, p.name]))) : null;
      const b = h('button', { class: 'btn small', type: 'button' }, rec ? 'Save' : 'Add');
      b.onclick = busy(b, async () => {
        try {
          d = await aapi(kind === 'drink' ? 'adminSaveDrink' : 'adminSaveSupply', Object.assign({ id: rec ? rec.id : '', name: name.value, active: active.box.checked },
            kind === 'drink' ? { routing: extra.value, beverageProductId: bev.value } : { defaultUnit: extra.value }));
          draw();
        } catch (err) { tell(err.message); }
      });
      return h('div', { class: 'list-item' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, name), h('div', { class: 'grow' }, extra)), bev, h('div', { class: 'row' }, active.el, b));
    }
  }

  /* ------------------------------------------------------------ catalog */
  async function renderCatalog(sub) {
    const box = h('div', null, loading());
    shell('catalog', box);
    let items;
    try { items = (await aapi('adminItems')).items; } catch (err) { replace(box, errBox(err)); return; }
    const saved = store.get('sm-cat-filter') || {};
    const show = selectEl(saved.show || 'active', [['active', 'Active items'], ['candidates', 'Inactive / review candidates'], ['all', 'Active + inactive'], ['removed', 'Removed items']]);
    const dept = selectEl(saved.dept || '', [['', 'All departments'], ['housekeeping', 'Housekeeping'], ['cafe', 'Cafe'], ['none', 'No department yet']]);
    const q = inp(saved.q || '', { placeholder: 'Search name, item #, description, status (e.g. Guide only)' });
    const list = h('div');
    const picked = new Set();
    const draw = () => {
      store.set('sm-cat-filter', { show: show.value, dept: dept.value, q: q.value });
      const term = q.value.trim().toLowerCase();
      const v = show.value;
      const rows = items.filter((it) => (v === 'removed' ? it.archived : !it.archived && (v === 'all' || (v === 'active' ? it.active : !it.active))) &&
        (!dept.value || (dept.value === 'none' ? !it.department : it.department === dept.value)) &&
        (!term || [it.name, it.supplierItemNumber, it.description, it.category, it.supplierStatus, it.brand].join(' ').toLowerCase().indexOf(term) >= 0));
      Array.from(picked).forEach((id) => { if (!rows.some((r) => r.id === id)) picked.delete(id); });
      const selectable = v === 'candidates' || v === 'removed';
      const bulkBtn = h('button', { class: 'btn small ' + (v === 'removed' ? '' : 'danger'), type: 'button' });
      const syncBtn = () => { bulkBtn.textContent = (v === 'removed' ? 'Restore selected' : 'Remove selected') + ' (' + picked.size + ')'; bulkBtn.disabled = !picked.size; };
      bulkBtn.onclick = busy(bulkBtn, async () => {
        const n = picked.size;
        const restore = v === 'removed';
        const ok = await ask(restore
          ? 'Restore ' + plural(n, 'item', 'items') + ' to the catalog? They come back inactive.'
          : 'Remove ' + plural(n, 'item', 'items') + ' from the catalog?\n\nNothing is deleted: past counts and orders stay, and you can restore them any time from "Removed items".', { ok: restore ? 'Restore' : 'Remove' });
        if (!ok) return;
        try { items = (await aapi('adminRemoveItems', { ids: Array.from(picked), restore })).items; picked.clear(); draw(); }
        catch (err) { list.prepend(errBox(err)); }
      });
      const allBox = h('input', { type: 'checkbox', style: 'width:24px;height:24px;margin-right:10px', onchange: () => {
        rows.slice(0, 400).forEach((r) => { if (allBox.checked) picked.add(r.id); else picked.delete(r.id); });
        draw();
      } });
      allBox.checked = rows.length > 0 && rows.slice(0, 400).every((r) => picked.has(r.id));
      replace(list, h('p', { class: 'small muted' }, plural(rows.length, 'item', 'items') + (v === 'removed' ? ' removed. Restored items come back inactive.' : '')),
        selectable && rows.length ? h('div', { class: 'row', style: 'margin-bottom:8px' },
          h('label', { style: 'font-weight:600;display:flex;align-items:center;min-height:44px;margin:0' }, allBox, 'Select all shown'), bulkBtn) : null,
        rows.slice(0, 400).map((it) => {
          const link = h('a', { href: '#/admin/item/' + it.id, class: 'grow', style: 'display:block;text-decoration:none;color:inherit;min-width:0' },
            h('div', { class: 'row' }, h('b', { class: 'grow' }, it.name),
              it.archived ? h('span', { class: 'chip gray' }, 'Removed') : it.active ? h('span', { class: 'chip ordered' }, 'Active · ' + (KIND_HEADING[it.department] || '?')) : h('span', { class: 'chip gray' }, 'Inactive')),
            h('div', { class: 'small muted' }, [it.supplierItemNumber ? '#' + it.supplierItemNumber : 'no item #', it.casePackRaw, it.supplierStatus, it.desiredStock !== null ? 'desired ' + it.desiredStock : ''].filter(Boolean).join(' · ')));
          if (!selectable) return h('div', { class: 'list-item' }, link);
          const cb = h('input', { type: 'checkbox', checked: picked.has(it.id), 'aria-label': 'Select ' + it.name, style: 'width:26px;height:26px;flex:0 0 26px', onchange: () => { if (cb.checked) picked.add(it.id); else picked.delete(it.id); syncBtn(); } });
          return h('div', { class: 'list-item row', style: 'align-items:flex-start;flex-wrap:nowrap' }, cb, link);
        }));
      syncBtn();
    };
    [show, dept].forEach((s) => s.addEventListener('change', draw));
    q.addEventListener('input', draw);
    replace(box, h('div', { class: 'card' }, h('h2', null, 'Housekeeping & Cafe catalog'),
      h('p', { class: 'small muted' }, 'Imported items start inactive. An item shows on a staff count only when you give it a department, confirm how it is counted, set a desired stock, and make it active. Items you will never use can be removed (and restored later) from the "Inactive" view.'),
      h('div', { class: 'grid2 stack' }, show, dept), h('div', { style: 'margin-top:10px' }, q),
      h('p', null, h('a', { class: 'btn small secondary', href: '#/admin/item/new' }, 'Add an item'))), h('div', { class: 'card' }, list));
    draw();
  }

  async function renderItem(id) {
    const box = h('div', null, loading());
    shell('catalog', h('p', null, h('a', { href: '#/admin/catalog' }, '‹ Catalog')), box);
    let it = { active: false, department: '' };
    if (id !== 'new') {
      try { it = (await aapi('adminItems')).items.filter((x) => x.id === id)[0]; } catch (err) { replace(box, errBox(err)); return; }
      if (!it) { replace(box, errBox(new Error('Item not found.'))); return; }
    }
    const f = {
      name: inp(it.name, { maxlength: 120 }),
      department: selectEl(it.department || '', [['', 'Not assigned'], ['housekeeping', 'Housekeeping'], ['cafe', 'Cafe']]),
      supplierItemNumber: inp(it.supplierItemNumber, { maxlength: 30, inputmode: 'text' }),
      description: inp(it.description, { maxlength: 200 }),
      brand: inp(it.brand, { maxlength: 200 }),
      casePackRaw: inp(it.casePackRaw, { maxlength: 200 }),
      countingUnit: inp(it.countingUnit || '', { maxlength: 60, placeholder: 'e.g. case' }),
      unitsPerCase: inp(it.unitsPerCase, { inputmode: 'numeric' }),
      looseUnitLabel: inp(it.looseUnitLabel, { maxlength: 60, placeholder: 'e.g. rolls, sleeves of 50 cups' }),
      desiredStock: inp(it.desiredStock, { inputmode: 'decimal' }),
      notes: h('textarea', { maxlength: 2000 }, it.notes || ''),
    };
    const cu = check(it.countingUnitConfirmed, 'Counting unit confirmed');
    const upc = check(it.unitsPerCaseConfirmed, 'Units per case confirmed (lets staff enter loose units)');
    const act = check(it.active, 'Active (shows on the staff count)');
    const repl = check(it.replacementApproved, 'I approve the replacement candidate (record only; it does not change this item)');
    const msg = h('div');
    const pack = it.packsPerCase ? it.packsPerCase + ' pack(s) per case, each "' + it.packSize + '"' : (it.casePackRaw ? 'Could not split "' + it.casePackRaw + '" automatically.' : '');
    const caseOnly = h('button', { class: 'btn small secondary', type: 'button', onclick: () => { f.countingUnit.value = 'case'; f.unitsPerCase.value = ''; f.looseUnitLabel.value = ''; cu.box.checked = true; upc.box.checked = false; } }, 'Count in full cases only');
    const usePacks = it.packsPerCase > 1 ? h('button', { class: 'btn small secondary', type: 'button', onclick: () => {
      f.countingUnit.value = 'case'; f.unitsPerCase.value = String(it.packsPerCase); f.looseUnitLabel.value = 'packs (' + it.packSize + ' each)'; cu.box.checked = true; upc.box.checked = true;
    } }, 'Cases + loose packs (' + it.packsPerCase + ' per case)') : null;
    const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Save item');
    const removeBtn = id === 'new' ? null : h('button', { class: 'btn ' + (it.archived ? 'secondary' : 'danger'), type: 'button' }, it.archived ? 'Restore to catalog' : 'Remove from catalog');
    if (removeBtn) removeBtn.onclick = busy(removeBtn, async () => {
      const restore = !!it.archived;
      if (!restore && !(await ask('Remove "' + it.name + '" from the catalog?\n\nIt comes off any staff list. Nothing is deleted: its past counts and orders stay, and you can restore it from Catalog > "Removed items".', { ok: 'Remove' }))) return;
      try { await aapi('adminRemoveItems', { ids: [id], restore }); renderItem(id); } catch (err) { replace(msg, errBox(err)); }
    });
    saveBtn.onclick = busy(saveBtn, async () => {
      try {
        const r = await aapi('adminSaveItem', { id: id === 'new' ? '' : id, item: {
          name: f.name.value, department: f.department.value, supplierItemNumber: f.supplierItemNumber.value, description: f.description.value,
          brand: f.brand.value, casePackRaw: f.casePackRaw.value, countingUnit: f.countingUnit.value, unitsPerCase: f.unitsPerCase.value,
          looseUnitLabel: f.looseUnitLabel.value, desiredStock: f.desiredStock.value, notes: f.notes.value,
          countingUnitConfirmed: cu.box.checked, unitsPerCaseConfirmed: upc.box.checked, active: act.box.checked, replacementApproved: repl.box.checked,
          supplierNumberStatus: id === 'new' && f.supplierItemNumber.value ? 'entered-by-todd' : undefined,
        } });
        if (id === 'new') { location.hash = '#/admin/item/' + r.item.id; return; }
        it = r.item;
        replace(msg, okBox('Saved.'));
      } catch (err) { replace(msg, errBox(err)); }
    });
    const ph = it.purchaseHistory || {};
    replace(box, h('div', { class: 'card' }, h('h2', null, id === 'new' ? 'New item' : it.name),
      it.archived ? h('div', { class: 'notice info' }, 'This item is removed from the catalog. Its history is kept. Restore it to use it again; it comes back inactive.') : null,
      it.supplierNumberStatus === 'unverified' ? h('div', { class: 'notice warn' }, 'The item number came from an old/legacy record and is unverified. Check it against the current Ginsberg’s guide before ordering.') : null,
      h('div', { class: 'grid2 stack' }, field('Name staff see', f.name), field('Department', f.department)),
      h('div', { class: 'grid2 stack' }, field('Supplier item #', f.supplierItemNumber, 'Kept as text, so leading zeros stay.'), field('Brand', f.brand)),
      field('Supplier description', f.description),
      field('Case pack (as the supplier writes it)', f.casePackRaw, pack),
      h('h3', { style: 'margin-top:16px' }, 'How staff count it'),
      h('p', { class: 'small muted' }, 'Weight or volume packs (like 4 × 4#) are counted in cases; nothing is converted to pieces unless you confirm it.'),
      h('div', { class: 'row' }, caseOnly, usePacks),
      h('div', { class: 'grid2 stack' }, field('Counting unit', f.countingUnit), field('Loose units per case', f.unitsPerCase)),
      field('Name for loose units', f.looseUnitLabel), cu.el, upc.el,
      field('Desired stock (cases)', f.desiredStock, 'Used for suggested order quantities. It only changes when you change it.'),
      act.el,
      h('h3', { style: 'margin-top:16px' }, 'Supplier information (private)'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Supplier status'), h('dd', null, it.supplierStatus || '—'),
        h('dt', null, 'Price'), h('dd', null, it.price !== null && it.price !== undefined ? '$' + Number(it.price).toFixed(2) + ' per case, ' + (it.priceDate || 'date unknown') + '. ' + (it.priceSource || '') : 'No price in the sources'),
        h('dt', null, 'Earlier prices'), h('dd', null, (it.priceHistory || []).map((p) => '$' + Number(p.price).toFixed(2) + ' (' + p.date + ', ' + p.source + ')').join('; ') || '—'),
        h('dt', null, 'Cases bought'), h('dd', null, ph.cases2023_24 !== undefined ? '2023/24: ' + fmtN(ph.cases2023_24) + ' · 2025/26: ' + fmtN(ph.cases2025_26) + ' · 2020-2026: ' + fmtN(ph.cases2020_2026) + (ph.dollars2020_2026 !== undefined && ph.dollars2020_2026 !== null ? ' ($' + ph.dollars2020_2026 + ')' : '') + '. Purchases from the supplier, not usage.' : '—'),
        h('dt', null, 'Replacement'), h('dd', null, it.replacementNote || '—'),
        h('dt', null, 'Sources'), h('dd', null, (it.sourceRefs || []).join('; ') || '—'),
        h('dt', null, 'Origin'), h('dd', null, it.origin || '—')),
      it.replacementNote ? repl.el : null,
      field('Notes', f.notes), msg, h('div', { class: 'row', style: 'margin-top:10px' }, saveBtn, removeBtn)));
  }
  function fmtN(v) { return v === null || v === undefined ? 'no record' : String(v); }

  /* ------------------------------------------------------------ counts */
  async function renderCounts(sessionId) {
    const box = h('div', null, loading());
    shell('counts', box);
    if (sessionId) return renderCountDetail(box, sessionId);
    try {
      const d = await aapi('adminCounts');
      replace(box, h('div', { class: 'card' }, h('h2', null, 'Count history'),
        h('p', { class: 'small muted' }, 'Each count keeps the package sizes and counting units as they were when counted.'),
        d.sessions.length ? d.sessions.map((s) => h('a', { href: '#/admin/count/' + s.id, class: 'list-item', style: 'display:block;color:inherit;text-decoration:none' },
          h('div', { class: 'row' }, h('b', { class: 'grow' }, KIND_HEADING[s.kind] + ' · week of ' + s.weekPeriod),
            h('span', { class: 'chip ' + (s.status === 'open' ? 'shopping' : 'ordered') }, s.status === 'open' ? 'In progress' : 'Finished')),
          h('div', { class: 'small muted' }, 'Started ' + fmtDateTime(s.startedAt) + (s.completedAt ? ' · finished ' + fmtDateTime(s.completedAt) : '') + ' · ' + s.countedItems + ' counted' +
            (s.incompleteAtCompletion ? ' · ' + s.incompleteAtCompletion + ' not counted' : '') + (s.origin && s.origin !== 'app' ? ' · ' + s.origin : '')))) : h('p', { class: 'muted' }, 'No counts yet.')));
    } catch (err) { replace(box, errBox(err)); }
  }
  async function renderCountDetail(box, id) {
    let d;
    try { d = await aapi('adminCountDetail', { sessionId: id }); } catch (err) { replace(box, errBox(err)); return; }
    const s = d.session;
    const msg = h('div');
    const act = h('button', { class: 'btn secondary', type: 'button' }, s.status === 'open' ? 'Mark finished' : 'Reopen for changes');
    act.onclick = busy(act, async () => {
      try {
        if (s.status === 'open') {
          if (d.notCounted.length && !await ask(d.notCounted.length + ' item(s) not counted. Finish anyway?')) return;
          const r = await aapi('adminCompleteCount', { kind: s.kind, sessionId: s.id });
          if (r.email) tell('Weekly email: ' + r.email.status + (r.email.error ? ' - ' + r.email.error : ''));
        } else {
          if (!await ask('Reopen this count? Staff will be able to change it from the count screen until it is finished again. Finishing again creates a new report version.')) return;
          await aapi('adminReopenCount', { sessionId: s.id });
        }
        renderCounts(id);
      } catch (err) { replace(msg, errBox(err)); }
    });
    const unit = (e) => {
      const sn = e.snapshot || {};
      return s.kind === 'beverage' ? (sn.unitsPerCase ? sn.unitsPerCase + '/case' + (sn.packageConfirmed ? '' : ' (unconfirmed)') : '—')
        : (sn.unitsPerCase ? sn.unitsPerCase + ' ' + (sn.looseUnitLabel || 'units') + '/case' + (sn.unitsPerCaseConfirmed ? '' : ' (unconfirmed)') : (sn.countingUnit || 'case'));
    };
    replace(box, h('p', null, h('a', { href: '#/admin/counts' }, '‹ All counts')),
      h('div', { class: 'card' }, h('h2', null, KIND_HEADING[s.kind] + ' count · week of ' + s.weekPeriod),
        h('p', null, 'Started ' + fmtDateTime(s.startedAt) + (s.completedAt ? ' · finished ' + fmtDateTime(s.completedAt) + ' (report version ' + (s.reportVersion || 1) + ')' : ' · in progress')),
        s.note ? h('p', { class: 'small muted' }, s.note) : null, msg, act,
        s.status === 'open' ? h('p', null, h('a', { href: '#/count/' + s.kind }, 'Open the staff count screen')) : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, ['Item (as counted)', 'Full cases', 'Loose', 'Package at count time', 'Flag', 'Counted at'].map((x) => h('th', null, x)))),
        h('tbody', null, d.entries.map((e) => h('tr', null,
          h('td', null, (e.snapshot && e.snapshot.name) || e.currentName),
          h('td', { class: 'num' }, e.fullCases === null ? '—' : String(e.fullCases)),
          h('td', { class: 'num' }, e.looseUnits === null ? '—' : String(e.looseUnits)),
          h('td', null, unit(e)), h('td', null, e.flag || ''), h('td', null, fmtDateTime(e.countedAt))))))),
      d.notCounted.length ? h('div', { class: 'card' }, h('h3', null, 'Not counted yet'), h('p', null, d.notCounted.map((x) => x.name).join(', '))) : null);
  }

  /* ------------------------------------------------------------ beverages */
  async function renderBev() {
    const box = h('div', null, loading());
    shell('beverages', box);
    let d;
    try { d = await aapi('adminBev'); } catch (err) { replace(box, errBox(err)); return; }
    draw();
    function draw() {
      const byId = {};
      d.products.forEach((p) => { byId[p.id] = p; });
      const productOpts = [['', 'Choose a product…']].concat(d.products.map((p) => [p.id, p.name + (p.packageConfirmed ? '' : ' (case size not confirmed)')]));
      const msg = h('div');
      const act = (action, body, form) => async () => {
        try { d = await aapi(action, body()); draw(); } catch (err) { replace(form.querySelector('.fmsg'), errBox(err)); }
      };
      // product editor
      function productForm(p) {
        const name = inp(p ? p.name : '', { maxlength: 120, placeholder: 'Exact product, e.g. "Brand IPA 12 oz can"' });
        const type = selectEl(p ? p.type : 'beer', [['beer', 'Beer'], ['cider', 'Cider'], ['wine', 'Wine'], ['craft soda', 'Craft soda'], ['other', 'Other']]);
        const cont = inp(p ? p.container : '', { maxlength: 40, placeholder: 'bottle, can…' });
        const upc = inp(p ? p.unitsPerCase : '', { inputmode: 'numeric' });
        const conf = check(p ? p.packageConfirmed : false, 'I confirm this case size');
        const active = check(p ? p.active : false, 'Active (on the staff count)');
        const b = h('button', { class: 'btn small', type: 'button' }, p ? 'Save' : 'Add product');
        const form = h('div', { class: 'list-item' },
          h('div', { class: 'grid2 stack' }, field('Product', name), field('Type', type)),
          h('div', { class: 'grid2 stack' }, field('Bottle/can', cont), field('Bottles/cans per case', upc)),
          p && p.notes ? h('p', { class: 'small muted' }, p.notes) : null,
          h('div', { class: 'row' }, conf.el, active.el, b), h('div', { class: 'fmsg' }));
        b.onclick = busy(b, act('adminSaveBevProduct', () => ({ id: p ? p.id : '', product: { name: name.value, type: type.value, container: cont.value, unitsPerCase: upc.value, packageConfirmed: conf.box.checked, active: active.box.checked } }), form));
        return form;
      }
      const delForm = (() => {
        const prod = selectEl('', productOpts);
        const when = h('input', { type: 'datetime-local', value: localInputValue(new Date()) });
        const fc = inp('', { inputmode: 'numeric' });
        const lu = inp('', { inputmode: 'numeric' });
        const note = inp('', { maxlength: 500 });
        const b = h('button', { class: 'btn small', type: 'button' }, 'Record delivery');
        const form = h('div', null, h('div', { class: 'grid2 stack' }, field('Product', prod), field('Delivered at', when)),
          h('div', { class: 'grid2' }, field('Full cases', fc), field('Loose bottles/cans', lu)), field('Note', note), b, h('div', { class: 'fmsg' }));
        b.onclick = busy(b, act('adminSaveDelivery', () => ({ productId: prod.value, deliveredAt: when.value ? new Date(when.value).toISOString() : '', fullCases: fc.value, looseUnits: lu.value, note: note.value }), form));
        return form;
      })();
      const saleForm = (() => {
        const prod = selectEl('', productOpts);
        const from = h('input', { type: 'datetime-local' });
        const to = h('input', { type: 'datetime-local', value: localInputValue(new Date()) });
        const units = inp('', { inputmode: 'numeric' });
        const src = inp('', { maxlength: 120, placeholder: 'e.g. register report' });
        const b = h('button', { class: 'btn small', type: 'button' }, 'Record sales');
        const form = h('div', null, field('Product', prod), h('div', { class: 'grid2 stack' }, field('From', from), field('To', to)),
          h('div', { class: 'grid2' }, field('Units sold', units), field('Source', src)), b, h('div', { class: 'fmsg' }));
        b.onclick = busy(b, act('adminSaveSale', () => ({ productId: prod.value, periodStart: from.value ? new Date(from.value).toISOString() : '', periodEnd: to.value ? new Date(to.value).toISOString() : '', units: units.value, source: src.value }), form));
        return form;
      })();
      const adjForm = (() => {
        const prod = selectEl('', productOpts);
        const type = selectEl('waste', [['waste', 'Waste / spoiled / broken'], ['transfer', 'Transfer out'], ['return', 'Returned to supplier'], ['other', 'Other removal']]);
        const when = h('input', { type: 'datetime-local', value: localInputValue(new Date()) });
        const units = inp('', { inputmode: 'numeric' });
        const note = inp('', { maxlength: 500 });
        const b = h('button', { class: 'btn small', type: 'button' }, 'Record adjustment');
        const form = h('div', null, h('div', { class: 'grid2 stack' }, field('Product', prod), field('Type', type)),
          h('div', { class: 'grid2' }, field('When', when), field('Bottles/cans', units)), field('Note', note), b, h('div', { class: 'fmsg' }));
        b.onclick = busy(b, act('adminSaveAdjustment', () => ({ productId: prod.value, type: type.value, at: when.value ? new Date(when.value).toISOString() : '', units: units.value, note: note.value }), form));
        return form;
      })();
      const delBtn = (table, id) => {
        const b = h('button', { class: 'btn small danger', type: 'button' }, 'Delete');
        b.onclick = busy(b, async () => { if (!await ask('Delete this record?')) return; try { d = await aapi('adminDeleteRecord', { table, id }); draw(); } catch (err) { tell(err.message); } });
        return b;
      };
      const pname = (id) => (byId[id] ? byId[id].name : '(removed product)');
      replace(box, msg,
        h('div', { class: 'card' }, h('h2', null, 'Beer, cider, wine & craft soda products'),
          h('p', { class: 'small muted' }, 'Each exact product and flavor is tracked on its own. A product can only be active (and its cases converted to bottles/cans) after you confirm its case size. Nothing is pre-filled.'),
          d.products.map(productForm), h('h3', { style: 'margin-top:14px' }, 'Add a product'), productForm(null)),
        h('div', { class: 'card' }, h('h2', null, 'Deliveries'), delForm,
          h('div', { style: 'margin-top:12px' }, d.deliveries.slice(0, 60).map((x) => h('div', { class: 'list-item row' },
            h('div', { class: 'grow' }, h('b', null, pname(x.productId)), ' · ' + fmtDateTime(x.deliveredAt),
              h('div', { class: 'small muted' }, (x.fullCases || 0) + ' case(s) + ' + (x.looseUnits || 0) + ' loose = ' + (x.totalUnits === null ? 'unknown (case size not confirmed)' : x.totalUnits + ' units') + ' · ' + (x.unitsPerCaseSnapshot || '?') + '/case at the time' + (x.note ? ' · ' + x.note : ''))),
            delBtn('deliveries', x.id))))),
        h('div', { class: 'card' }, h('h2', null, 'Recorded sales (optional)'),
          h('p', { class: 'small muted' }, 'Only if you have real sales numbers (e.g. from the register). Kept separate from counts and never estimated.'), saleForm,
          d.sales.slice(0, 40).map((x) => h('div', { class: 'list-item row' }, h('div', { class: 'grow' }, h('b', null, pname(x.productId)), ' · ' + x.units + ' sold',
            h('div', { class: 'small muted' }, fmtDateTime(x.periodStart) + ' – ' + fmtDateTime(x.periodEnd) + (x.source ? ' · ' + x.source : ''))), delBtn('sales', x.id)))),
        h('div', { class: 'card' }, h('h2', null, 'Waste, transfers & returns'), adjForm,
          d.adjustments.slice(0, 40).map((x) => h('div', { class: 'list-item row' }, h('div', { class: 'grow' }, h('b', null, pname(x.productId)), ' · ' + x.type + ' ' + x.units,
            h('div', { class: 'small muted' }, fmtDateTime(x.at) + (x.note ? ' · ' + x.note : ''))), delBtn('adjustments', x.id)))));
    }
  }

  /* ------------------------------------------------------------ reports */
  const STATUS_TEXT = { ok: 'Estimate', zero: 'No activity', insufficient: 'Insufficient data', review: 'Needs review' };
  async function renderReports(sub) {
    const box = h('div', null, loading());
    const tabs = [['weekly', 'This week'], ['history', 'Week by week'], ['supplier', 'Ginsberg’s purchases']];
    sub = sub || 'weekly';
    shell('reports', h('nav', { class: 'tabs', 'aria-label': 'Reports' }, tabs.map((t) => h('a', { href: '#/admin/reports/' + t[0], 'aria-current': t[0] === sub ? 'page' : null }, t[1]))), box);
    try {
      if (sub === 'history') return await drawHistory(box);
      if (sub === 'supplier') return await drawSupplier(box);
      await drawWeekly(box, null);
    } catch (err) { replace(box, errBox(err)); }
  }

  async function drawWeekly(box, sessionId) {
    const res = await aapi('adminBevReport', { sessionId });
    if (!res.report) { replace(box, h('div', { class: 'notice info' }, res.message)); return; }
    const r = res.report;
    const pick = selectEl(r.sessionId, res.sessions.map((s) => [s.id, 'Week of ' + s.weekPeriod + ' (finished ' + fmtDateTime(s.completedAt) + ')']));
    pick.onchange = () => { replace(box, loading()); drawWeekly(box, pick.value).catch((e) => replace(box, errBox(e))); };
    const chartRows = r.rows.map((x) => ({ label: x.name, usage: x.status === 'insufficient' ? null : x.usageEstimate, sales: x.recordedSales, statusText: 'Insufficient data' }));
    const groups = { ok: [], review: [], zero: [], insufficient: [] };
    r.rows.forEach((x) => groups[x.status].push(x));
    const csvText = csv([['Product', 'Type', 'Previous count', 'Delivered', 'Current count', 'Depletion', 'Waste/transfer/return', 'Estimated usage', 'Recorded sales', 'Result', 'Notes']]
      .concat(r.rows.map((x) => [x.name, x.type, x.previousUnits, x.deliveredUnits, x.currentUnits, x.depletion, x.adjustmentUnits, x.usageEstimate, x.recordedSales === null ? 'Not recorded' : x.recordedSales, STATUS_TEXT[x.status], x.notes.join('; ')])));
    const fname = 'beverage-report-' + r.weekPeriod + '.csv';
    const share = h('button', { class: 'btn secondary', type: 'button' }, 'Share');
    share.onclick = async () => {
      const file = new File([csvText], fname, { type: 'text/csv' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Beverage report ' + r.weekPeriod });
        else download(fname, csvText, 'text/csv');
      } catch (e) { /* cancelled */ }
    };
    const emailMsg = h('div');
    const retry = h('button', { class: 'btn secondary', type: 'button' }, 'Email this report to me');
    retry.onclick = busy(retry, async () => {
      try {
        let res2 = await aapi('adminSendReportEmail', { sessionId: r.sessionId });
        if (res2.result.status === 'duplicate' && await ask('This report version was already emailed. Send it again?')) res2 = await aapi('adminSendReportEmail', { sessionId: r.sessionId, resend: 'RESEND' });
        replace(emailMsg, res2.result.status === 'sent' ? okBox('Email sent to ' + res2.result.recipient + '.') : errBox(new Error('Email ' + res2.result.status + ': ' + (res2.result.error || ''))));
      } catch (err) { replace(emailMsg, errBox(err)); }
    });
    const tbl = (rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Product', 'Before', 'Delivered', 'Now', 'Depletion', 'Waste etc.', 'Est. usage', 'Sales (recorded)', 'Result'].map((x, i) => h('th', { class: i > 0 && i < 8 ? 'num' : null }, x)))),
      h('tbody', null, rows.map((x) => h('tr', null, h('td', null, h('b', null, x.name), h('div', { class: 'small muted' }, x.type)),
        ...[x.previousUnits, x.deliveredUnits, x.currentUnits, x.depletion, x.adjustmentUnits, x.usageEstimate].map((v) => h('td', { class: 'num' }, v === null || v === undefined ? '—' : String(v))),
        h('td', { class: 'num' }, x.recordedSales === null ? 'not recorded' : String(x.recordedSales)),
        h('td', null, h('span', { class: 'chip ' + (x.status === 'review' ? 'red' : x.status === 'insufficient' ? 'gray' : x.status === 'zero' ? 'teal' : 'ordered') }, STATUS_TEXT[x.status]),
          x.notes.length ? h('div', { class: 'small' }, x.notes.join('; ')) : null))))));
    replace(box,
      h('div', { class: 'card' }, h('h2', null, 'Beer / Cider / Wine: week of ' + r.weekPeriod), pick,
        h('p', null, 'Period: from the count finished ' + (r.previousCompletedAt ? fmtDateTime(r.previousCompletedAt) + ' (week of ' + r.previousWeekPeriod + ')' : '— (no earlier count)') + ' to the count finished ' + fmtDateTime(r.completedAt) + '. Each product uses its own count times.'),
        h('div', { class: 'notice info small' }, r.basis),
        h('p', null, r.summary.ok + ' with an estimate · ' + r.summary.zero + ' no activity · ' + r.summary.insufficient + ' insufficient data · ' + r.summary.review + ' need review')),
      h('div', { class: 'card' }, h('h3', null, 'Estimated usage by product (bottles/cans)'),
        C.legend([['Estimated usage (inventory depletion)', 'var(--chart-usage)'], ['Recorded sales', 'var(--chart-sales)']]),
        C.productBars(chartRows)),
      groups.review.length ? h('div', { class: 'card' }, h('h3', null, 'Needs review'), tbl(groups.review)) : null,
      h('div', { class: 'card' }, h('h3', null, 'Products with an estimate'), groups.ok.length ? tbl(groups.ok) : h('p', { class: 'muted' }, 'None.')),
      h('div', { class: 'card' }, h('h3', null, 'No recorded activity (counted, nothing changed)'), groups.zero.length ? tbl(groups.zero) : h('p', { class: 'muted' }, 'None.')),
      h('div', { class: 'card' }, h('h3', null, 'Missing data (not treated as zero)'), groups.insufficient.length ? tbl(groups.insufficient) : h('p', { class: 'muted' }, 'None.')),
      h('div', { class: 'card noprint' }, h('div', { class: 'row' },
        h('button', { class: 'btn secondary', type: 'button', onclick: () => download(fname, csvText, 'text/csv') }, 'Download CSV'),
        share, h('button', { class: 'btn secondary', type: 'button', onclick: () => window.print() }, 'Print / save as PDF'), retry), emailMsg));
  }

  async function drawHistory(box) {
    const d = await aapi('adminBevHistory');
    if (!d.weeks.length) { replace(box, h('div', { class: 'notice info' }, 'No finished beverage counts yet.')); return; }
    const names = {};
    d.weeks.forEach((w) => w.rows.forEach((r) => { names[r.productId] = r.name; }));
    const ids = Object.keys(names).sort((a, b) => names[a].localeCompare(names[b]));
    const pick = selectEl(store.get('sm-hist-prod') || ids[0], ids.map((id) => [id, names[id]]));
    const out = h('div');
    const draw = () => {
      store.set('sm-hist-prod', pick.value);
      const pts = d.weeks.map((w) => {
        const r = w.rows.filter((x) => x.productId === pick.value)[0];
        return { label: w.weekPeriod.slice(5), week: w.weekPeriod, usage: r && r.status !== 'insufficient' ? r.usageEstimate : null, sales: r ? r.recordedSales : null, r };
      });
      const rows = [['Week of', 'Before', 'Delivered', 'Now', 'Est. usage', 'Recorded sales', 'Result']].concat(pts.map((p) => [p.week,
        p.r ? p.r.previousUnits : null, p.r ? p.r.deliveredUnits : null, p.r ? p.r.currentUnits : null, p.usage, p.sales === null ? 'not recorded' : p.sales, p.r ? STATUS_TEXT[p.r.status] : 'Not on this count']));
      replace(out, C.legend([['Estimated usage', 'var(--chart-usage)'], ['Recorded sales', 'var(--chart-sales)']]),
        C.weeklyBars(pts, { label: 'Weekly estimated usage of ' + names[pick.value] }),
        h('div', { class: 'table-wrap', style: 'margin-top:10px' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, rows[0].map((x) => h('th', null, x)))),
          h('tbody', null, rows.slice(1).map((r) => h('tr', null, r.map((v) => h('td', null, v === null || v === undefined ? '—' : String(v)))))))),
        h('button', { class: 'btn secondary', type: 'button', style: 'margin-top:10px', onclick: () => download('weekly-' + names[pick.value].replace(/[^a-z0-9]+/gi, '-') + '.csv', csv(rows), 'text/csv') }, 'Download CSV'));
    };
    pick.onchange = draw;
    replace(box, h('div', { class: 'card' }, h('h2', null, 'Week by week'), field('Product', pick),
      h('p', { class: 'small muted' }, '"no data" means a count, delivery size or earlier count was missing that week; it is not zero.'), out));
    draw();
  }

  async function drawSupplier(box) {
    const d = await aapi('adminSupplierHistory');
    if (!d.rows.length) { replace(box, h('div', { class: 'notice info' }, 'Import the Ginsberg’s weekly ordering sheet (Import & backup) to see past purchases here.')); return; }
    const top = d.rows.slice(0, 25);
    replace(box, h('div', { class: 'card' }, h('h2', null, 'What Lapland Lake bought from Ginsberg’s'),
      h('div', { class: 'notice info small' }, d.basis),
      C.legend([['2023/24 cases', 'var(--chart-usage)'], ['2025/26 cases', 'var(--chart-sales)']]),
      C.seasonBars(top.map((r) => ({ label: r.name, a: r.c2324, b: r.c2526 }))),
      h('p', { class: 'small muted' }, 'Each product is in its own case size, so bars are not comparable across products. Top 25 by cases in the two seasons.')),
    h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Item', 'Item #', 'Case pack', '2023/24', '2025/26', '2020-2026', '2020-2026 $'].map((x) => h('th', null, x)))),
      h('tbody', null, d.rows.map((r) => h('tr', null, h('td', null, r.name), h('td', null, r.supplierItemNumber), h('td', null, r.casePackRaw),
        ...[r.c2324, r.c2526, r.all, r.dollars].map((v) => h('td', { class: 'num' }, v === null || v === undefined ? '—' : String(v))))))))));
  }

  /* ------------------------------------------------------------ import & backup */
  function parseCsvText(text) {
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
  }
  function tableFromJson(data) {
    const arr = Array.isArray(data) ? data : Array.isArray(data.records) ? data.records : Array.isArray(data.data) ? data.data : Array.isArray(data.items) ? data.items : null;
    if (!arr || !arr.length) throw new Error('The JSON file has no list of records.');
    const headers = [];
    arr.forEach((o) => Object.keys(o || {}).forEach((k) => { if (headers.indexOf(k) < 0) headers.push(k); }));
    return { headers, rows: arr.map((o) => headers.map((k) => (o[k] === null || o[k] === undefined ? '' : typeof o[k] === 'object' ? JSON.stringify(o[k]) : String(o[k])))) };
  }

  async function renderImport() {
    const box = h('div');
    shell('import', box);
    // Ginsberg's source files
    const links = {
      weeklySheet: inp('', { placeholder: 'Ginsbergs Weekly Ordering (Google Sheet link)' }),
      masterSheet: inp('', { placeholder: 'Ordering Master, saved as a Google Sheet (optional)' }),
      deletedCsv: inp('', { placeholder: 'deleted items Lapland lake.csv (optional)' }),
      graphCsv: inp('', { placeholder: 'Ginsbergs Graph Data.csv (optional)' }),
      referenceTxt: inp('', { placeholder: 'Ginsbergs Ordering and Email Reference .txt (optional)' }),
    };
    const refresh = check(false, 'Also refresh supplier info (status, price, history) on items already imported. Your settings are never changed.');
    const gOut = h('div');
    const gPrev = h('button', { class: 'btn secondary', type: 'button' }, 'Preview');
    const gBody = () => Object.assign({ refreshExisting: refresh.box.checked }, Object.fromEntries(Object.keys(links).map((k) => [k, links[k].value.trim()])));
    gPrev.onclick = busy(gPrev, async () => {
      try {
        const p = await aapi('adminImportGinsbergPreview', gBody());
        const commit = h('button', { class: 'btn', type: 'button' }, 'Import ' + (p.newCount + p.extraCount) + ' as inactive candidates');
        commit.onclick = busy(commit, async () => {
          try { const r = await aapi('adminImportGinsbergCommit', gBody()); replace(gOut, okBox('Imported ' + r.added + ' inactive candidates' + (r.refreshed ? ', refreshed ' + r.refreshed : '') + (r.skippedDuplicates ? ', skipped ' + r.skippedDuplicates + ' already in the catalog' : '') + '. Next: choose active items in Catalog.')); }
          catch (err) { gOut.prepend(errBox(err)); }
        });
        replace(gOut, h('div', { class: 'card' }, h('h3', null, 'Preview (nothing saved yet)'),
          h('p', null, 'Read: ' + p.sources.join('; ')),
          h('p', null, h('b', null, p.newCount + ' new items with supplier numbers'), ', ' + p.extraCount + ' order-form lines without a number (kept for review), ' + p.duplicateCount + ' already in the catalog (' + (p.refreshExisting ? 'supplier info will be refreshed' : 'skipped') + ').'),
          p.removedDuplicateCount ? h('p', { class: 'small' }, p.removedDuplicateCount + ' of those were removed earlier. To bring one back, use Catalog > "Removed items" > Restore.') : null,
          p.supplierInfo ? h('p', null, 'Supplier info found: customer #' + (p.supplierInfo.customerNumber || '?') + ', contacts: ' + (p.supplierInfo.contactsText ? 'yes' : 'no') + '. It is only filled in where Settings is still blank.') : null,
          p.problems.concat(p.notes).map((x) => h('div', { class: 'notice warn small' }, x)),
          h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Item #', 'Name', 'Description', 'Case pack', 'Status', 'Price', 'Replacement note'].map((x) => h('th', null, x)))),
            h('tbody', null, p.sample.map((s) => h('tr', null, h('td', null, s.supplierItemNumber), h('td', null, s.name), h('td', null, s.description), h('td', null, s.casePackRaw), h('td', null, s.supplierStatus),
              h('td', null, s.price === null ? '—' : '$' + s.price + ' (' + (s.priceDate || '?') + ')'), h('td', null, s.replacementNote || '')))))),
          p.extras.length ? h('details', null, h('summary', null, 'Order-form lines without an item number (' + p.extraCount + ')'), h('ul', null, p.extras.map((x) => h('li', null, x.category + ': ' + x.name + (x.candidateText ? ' — ' + x.candidateText : ''))))) : null,
          h('p', { class: 'small muted' }, 'Everything is imported inactive. Prices are labelled with their date and need confirming against the current guide or invoice. Replacement candidates are notes only until you approve them.'),
          commit));
      } catch (err) { replace(gOut, errBox(err)); }
    });

    // Generic file import (any CSV/JSON spreadsheet export)
    const type = selectEl('items', [['items', 'Catalog items (with desired stock)'], ['counts', 'Historical counts'], ['requests', 'Supply requests'], ['orders', 'Order history (one row per line)'], ['bevProducts', 'Beverage products']]);
    const file = h('input', { type: 'file', accept: '.csv,.json,text/csv,application/json' });
    const fOut = h('div');
    let parsed = null, sourceName = '';
    const fPrev = h('button', { class: 'btn secondary', type: 'button' }, 'Preview file');
    async function preview(mapping) {
      const p = await aapi('adminImportRowsPreview', { type: type.value, headers: parsed.headers, rows: parsed.rows, sourceName, mapping });
      const spec = Object.keys(p.mapping);
      const mapSel = {};
      const fieldsTable = h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'App field'), h('th', null, 'Column in your file'))),
        h('tbody', null, Object.keys(p.mapping).concat(p.missingRequired.filter((m) => spec.indexOf(m) < 0)).map((f) => {
          mapSel[f] = selectEl(p.mapping[f] === undefined ? '' : String(p.mapping[f]), [['', '(not in file)']].concat(parsed.headers.map((hh, i) => [String(i), hh])));
          return h('tr', null, h('td', null, f + (p.missingRequired.indexOf(f) >= 0 ? ' (required)' : '')), h('td', null, mapSel[f]));
        }))));
      const remap = h('button', { class: 'btn small secondary', type: 'button' }, 'Re-check with these columns');
      remap.onclick = busy(remap, async () => {
        const m = {};
        Object.keys(mapSel).forEach((f) => { if (mapSel[f].value !== '') m[f] = Number(mapSel[f].value); });
        try { await preview(m); } catch (err) { fOut.prepend(errBox(err)); }
      });
      const commit = h('button', { class: 'btn', type: 'button', disabled: !p.valid || p.missingRequired.length > 0 }, 'Import ' + p.valid + ' rows');
      commit.onclick = busy(commit, async () => {
        try { const r = await aapi('adminImportRowsCommit', { type: type.value, headers: parsed.headers, rows: parsed.rows, sourceName, mapping: p.mapping }); replace(fOut, okBox('Imported ' + r.imported + ' rows from ' + sourceName + '. Imported catalog items and beverage products start inactive for your review.')); }
        catch (err) { fOut.prepend(errBox(err)); }
      });
      replace(fOut, h('div', { class: 'card' }, h('h3', null, 'Preview of ' + sourceName + ' (nothing saved yet)'),
        p.missingRequired.length ? h('div', { class: 'notice err' }, 'Missing required column(s): ' + p.missingRequired.join(', ') + '. Choose them below.') : null,
        h('p', null, p.valid + ' rows ready · ' + p.invalid.length + ' with problems · ' + p.duplicates.length + ' duplicates (skipped)'),
        fieldsTable, remap,
        p.unmapped.length ? h('p', { class: 'small muted' }, 'Columns not used (kept in the original-record copy where possible): ' + p.unmapped.join(', ')) : null,
        p.invalid.length ? h('details', null, h('summary', null, 'Rows with problems'), h('ul', null, p.invalid.slice(0, 100).map((x) => h('li', null, 'Row ' + x.row + ': ' + x.why)))) : null,
        p.duplicates.length ? h('details', null, h('summary', null, 'Duplicates'), h('ul', null, p.duplicates.slice(0, 100).map((x) => h('li', null, 'Row ' + x.row + ': ' + x.why)))) : null,
        p.sample.length ? h('details', { open: true }, h('summary', null, 'First rows as they will be read'), h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, Object.keys(p.sample[0]).map((k) => h('th', null, k)))), h('tbody', null, p.sample.map((s) => h('tr', null, Object.keys(s).map((k) => h('td', null, s[k])))))))) : null,
        commit));
    }
    fPrev.onclick = busy(fPrev, async () => {
      const f = file.files[0];
      if (!f) { replace(fOut, errBox(new Error('Choose a file first.'))); return; }
      try {
        const text = await f.text();
        sourceName = f.name;
        if (/\.json$/i.test(f.name) || /^\s*[[{]/.test(text)) parsed = tableFromJson(JSON.parse(text));
        else { const rows = parseCsvText(text); parsed = { headers: rows[0] || [], rows: rows.slice(1) }; }
        await preview();
      } catch (err) { replace(fOut, errBox(err)); }
    });

    const bk = h('button', { class: 'btn secondary', type: 'button' }, 'Download full backup (JSON)');
    bk.onclick = busy(bk, async () => {
      try { const d = await aapi('adminBackup'); download('supply-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(d, null, 1), 'application/json'); } catch (err) { tell(err.message); }
    });
    const bkCsv = h('button', { class: 'btn secondary', type: 'button' }, 'Download catalog (CSV)');
    bkCsv.onclick = busy(bkCsv, async () => {
      try {
        const d = await aapi('adminBackup');
        const its = d.tables.items;
        const cols = ['id', 'name', 'department', 'active', 'supplierItemNumber', 'description', 'brand', 'casePackRaw', 'countingUnit', 'countingUnitConfirmed', 'unitsPerCase', 'unitsPerCaseConfirmed', 'looseUnitLabel', 'desiredStock', 'supplierStatus', 'price', 'priceDate', 'replacementNote', 'origin'];
        download('supply-catalog-' + new Date().toISOString().slice(0, 10) + '.csv', csv([cols].concat(its.map((it) => cols.map((c) => it[c])))), 'text/csv');
      } catch (err) { tell(err.message); }
    });

    let settings = null;
    try { settings = (await aapi('adminSettings')).settings; } catch (e) { /* shown elsewhere */ }
    const mig = settings ? settings.migration : null;
    replace(box,
      h('div', { class: 'card' }, h('h2', null, 'Import status'),
        h('dl', { class: 'kv' },
          h('dt', null, 'Ginsberg’s files'), h('dd', null, mig ? (mig.ginsberg === 'not-imported' ? 'Not imported yet.' : mig.ginsberg) : '?'))),
      h('div', { class: 'card' }, h('h2', null, 'Import Ginsberg’s source files from your Drive'),
        h('p', { class: 'small muted' }, 'Paste the Google Drive links (open the file, Share > Copy link, or copy the address bar). The files stay where they are; the app only reads them. To include brands, replacement candidates and Kathy’s order-form lines, first open "Ginsbergs Ordering Master" in Drive and choose File > Save as Google Sheets, then paste that link.'),
        Object.keys(links).map((k) => h('div', { style: 'margin:6px 0' }, links[k])), refresh.el, gPrev, gOut),
      h('div', { class: 'card' }, h('h2', null, 'Import a spreadsheet file (optional)'),
        h('p', { class: 'small muted' }, 'CSV or JSON. You get a preview with checks and duplicate detection before anything is saved. Original IDs are kept, and imported history keeps the package sizes from the file, not today’s catalog.'),
        field('What is in the file?', type), h('div', { style: 'margin:10px 0' }, file), fPrev, fOut),
      h('div', { class: 'card' }, h('h2', null, 'Backup'),
        h('p', { class: 'small muted' }, 'All data already lives in your Google Sheet "Lapland Lake Supply Manager Data" in your Drive. Download a copy any time:'),
        h('div', { class: 'row' }, bk, bkCsv),
        h('p', { class: 'small muted' }, settings && settings.backup.driveBackupEnabled ? 'Weekly Drive backup is on' + (settings.backup.lastBackupAt ? ' (last: ' + fmtDateTime(settings.backup.lastBackupAt) + ')' : '') + '.'
          : 'Weekly Drive backup is not set up. To turn it on: in the Apps Script editor run installWeeklyDriveBackup once (Mondays ~5 AM, into the app’s Drive folder > Backups).')));
  }

  /* ------------------------------------------------------------ settings */
  async function renderSettings() {
    const box = h('div', null, loading());
    shell('settings', box);
    let d;
    try { d = await aapi('adminSettings'); } catch (err) { replace(box, errBox(err)); return; }
    const s = d.settings;
    const recipient = h('input', { type: 'email', value: s.email.recipient || '', placeholder: 'Your email address', autocomplete: 'email' });
    const enabled = check(s.email.enabled, 'Email me the weekly beverage report when a count is finished');
    const emMsg = h('div');
    const emSave = h('button', { class: 'btn', type: 'button' }, 'Save email settings');
    emSave.onclick = busy(emSave, async () => {
      try { const r = await aapi('adminSaveSettings', { email: { recipient: recipient.value, enabled: enabled.box.checked } }); s.email = r.settings.email; enabled.box.checked = s.email.enabled; replace(emMsg, okBox('Saved.')); } catch (err) { replace(emMsg, errBox(err)); }
    });
    const test = h('button', { class: 'btn secondary', type: 'button' }, 'Send a test email');
    test.onclick = busy(test, async () => {
      if (!await ask('Send one test email to ' + (s.email.recipient || '(no recipient saved)') + ' now?')) return;
      try { const r = await aapi('adminSendTestEmail', { confirm: 'SEND-TEST' }); drawLog(r.emailLog); } catch (err) { replace(emMsg, errBox(err)); }
    });
    const logEl = h('div');
    function drawLog(log) {
      replace(logEl, log.length ? log.map((m) => {
        const btn = m.sessionId && m.status !== 'sent' ? h('button', { class: 'btn small secondary', type: 'button' }, 'Retry') : null;
        if (btn) btn.onclick = busy(btn, async () => { try { const r = await aapi('adminSendReportEmail', { sessionId: m.sessionId }); drawLog(r.emailLog); } catch (err) { tell(err.message); } });
        return h('div', { class: 'list-item row' }, h('div', { class: 'grow' }, h('b', null, m.status), ' · ' + fmtDateTime(m.at) + ' · ' + (m.trigger || ''),
          h('div', { class: 'small muted' }, (m.reportKey === 'test' ? 'Test email' : 'Report ' + m.reportKey) + (m.recipient ? ' → ' + m.recipient : '') + (m.error ? ' · ' + m.error : ''))), btn);
      }) : h('p', { class: 'muted' }, 'No emails yet.'));
    }
    drawLog(d.emailLog);
    const sup = s.supplier;
    const sf = {
      name: inp(sup.name), customerNumber: inp(sup.customerNumber, { inputmode: 'numeric' }), customerName: inp(sup.customerName),
      deliveryDay: inp(sup.deliveryDay), minimumCases: inp(sup.minimumCases, { inputmode: 'numeric' }), deadlineText: inp(sup.deadlineText),
      preferredText: inp(sup.preferredText), contactsText: h('textarea', { maxlength: 4000 }, sup.contactsText || ''), orderingNotes: h('textarea', { maxlength: 4000 }, sup.orderingNotes || ''),
    };
    const supMsg = h('div');
    const supSave = h('button', { class: 'btn', type: 'button' }, 'Save supplier info');
    supSave.onclick = busy(supSave, async () => {
      try { await aapi('adminSaveSettings', { supplier: Object.fromEntries(Object.keys(sf).map((k) => [k, sf[k].value])) }); replace(supMsg, okBox('Saved.')); } catch (err) { replace(supMsg, errBox(err)); }
    });
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const n1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const n2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const pwMsg = h('div');
    const pwBtn = h('button', { class: 'btn', type: 'button' }, 'Change password');
    pwBtn.onclick = busy(pwBtn, async () => {
      if (n1.value !== n2.value) { replace(pwMsg, errBox(new Error('The new passwords do not match.'))); return; }
      try { await aapi('adminChangePassword', { currentPassword: cur.value, newPassword: n1.value }); clearToken(); renderLogin('Password changed. Please sign in with the new password.'); } catch (err) { replace(pwMsg, errBox(err)); }
    });
    replace(box,
      h('div', { class: 'card' }, h('h2', null, 'Weekly beverage email'),
        h('p', { class: 'small muted' }, 'Sent from your Google account (free, about 100 emails a day) only to you, once per finished count. Staff are never emailed. Nothing is sent until you enter an address and tick the box.'),
        field('Send to', recipient), enabled.el, h('div', { class: 'row' }, emSave, test), emMsg,
        h('h3', { style: 'margin-top:14px' }, 'Email log'), logEl),
      h('div', { class: 'card' }, h('h2', null, 'Ginsberg’s (private, Admin only)'),
        h('div', { class: 'grid2 stack' }, field('Supplier', sf.name), field('Customer #', sf.customerNumber)),
        field('Customer name on account', sf.customerName),
        h('div', { class: 'grid2 stack' }, field('Delivery day', sf.deliveryDay), field('Minimum (cases)', sf.minimumCases)),
        field('Deadline', sf.deadlineText), field('Preferred', sf.preferredText),
        field('Contacts (sales consultant, customer solutions)', sf.contactsText), field('How to order / notes', sf.orderingNotes),
        h('div', { class: 'row', style: 'margin-top:10px' }, supSave), supMsg),
      h('div', { class: 'card' }, h('h2', null, 'Change password'), field('Current password', cur), field('New password (10+ characters)', n1), field('New password again', n2),
        h('div', { class: 'row', style: 'margin-top:10px' }, pwBtn), pwMsg));
  }

  /* ------------------------------------------------------------ router */
  function route(parts) {
    if (!token()) return renderLogin();
    const [a, b] = parts;
    switch (a) {
      case 'orders': return renderOrders();
      case 'order': return renderOrder(b);
      case 'requests': return renderRequests(b);
      case 'catalog': return renderCatalog(b);
      case 'item': return renderItem(b);
      case 'counts': return renderCounts();
      case 'count': return renderCounts(b);
      case 'beverages': return renderBev();
      case 'reports': return renderReports(b);
      case 'import': return renderImport();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  }
  window.SMAdmin = { route };
  // app.js routes on DOMContentLoaded; if that already happened, re-route now.
  if (document.readyState !== 'loading' && /^#\/admin/.test(location.hash)) route(location.hash.replace(/^#\/admin\/?/, '').split('/'));
})();
