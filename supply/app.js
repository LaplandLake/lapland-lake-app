/* Lapland Lake Supply Manager: staff screens (no sign-in) and shared helpers.
   Screens are chosen by the address after "#": #/ (home), #/count/housekeeping,
   #/count/cafe, #/count/beverage, #/request/supply, #/request/drink, #/admin/... */
(function () {
  'use strict';

  const CFG = window.SUPPLY_CONFIG || {};
  // A test address can be passed with ?api=... only when running on this computer.
  const API_URL = (function () {
    const q = new URLSearchParams(location.search).get('api');
    if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return q;
    return CFG.apiUrl || '';
  })();

  const DELIVERY_TEXT = ['Delivery Thursday · Preferable order by Tuesday afternoon.', 'Latest order by Wednesday at 4:00 PM · 20-case minimum.'];
  const KIND_TITLE = { housekeeping: 'Housekeeping Orders', cafe: 'Cafe Orders', beverage: 'Beer / Cider / Wine' };
  const KIND_HEADING = { housekeeping: 'Housekeeping', cafe: 'Cafe', beverage: 'Beer / Cider / Wine' };

  /* ------------------------------------------------------------ DOM helper */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    const kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'style') el.setAttribute('style', v);
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    kids.flat(Infinity).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  // In-page dialogs (browser alert/confirm are blocked in some app and embedded views).
  function ask(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      const okBtn = h('button', { class: 'btn' + (opts.danger ? ' danger' : ''), type: 'button', onclick: () => close(true) }, opts.ok || 'OK');
      const wrap = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-msg' },
        h('div', { class: 'modal-card' },
          h('p', { id: 'modal-msg', class: 'modal-msg' }, message),
          h('div', { class: 'row', style: 'justify-content:flex-end' },
            opts.cancel === null ? null : h('button', { class: 'btn secondary', type: 'button', onclick: () => close(false) }, opts.cancel || 'Cancel'),
            okBtn)));
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      okBtn.focus();
    });
  }
  function tell(message) { return ask(message, { cancel: null }); }

  function mount(...nodes) {
    const app = document.getElementById('app');
    app.innerHTML = '';
    nodes.forEach((n) => n && app.appendChild(n));
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ API */
  class ApiError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }
  async function api(action, body, opts) {
    if (!API_URL) throw new ApiError('The app is not connected to its data yet. Setup needs to be finished (see the README).', 'setup');
    const payload = Object.assign({ action }, body || {});
    // Preview build only (dev/build-demo.mjs): the backend runs inside the page.
    if (window.SUPPLY_LOCAL_API) {
      const data = await window.SUPPLY_LOCAL_API(payload);
      if (!data.ok) throw new ApiError(data.error.message, data.error.code);
      return data.data;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 45000);
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        redirect: 'follow',
      });
    } catch (err) {
      throw new ApiError(err.name === 'AbortError' ? 'The connection timed out. Not saved - try again.' : 'No connection. Not saved - check Wi-Fi/signal and try again.', 'network');
    } finally {
      clearTimeout(timer);
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new ApiError('The server sent an unexpected reply. Not saved - try again.', 'server'); }
    if (!data.ok) throw new ApiError(data.error && data.error.message ? data.error.message : 'Something went wrong.', data.error && data.error.code);
    return data.data;
  }
  // Photo upload. Progress is shown per photo ("2 of 3"): Apps Script cannot answer the
  // extra browser check (CORS preflight) that byte-level upload progress would need.
  function apiUpload(action, body) {
    return api(action, body, { timeout: 120000 });
  }

  /* ------------------------------------------------------------ storage (never required) */
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  // Lists open at once from this phone's last copy, then update when the fresh copy arrives
  // (Google takes a second or more to answer). Staff lists only: nothing private is kept here.
  async function cachedApi(action, body, paint) {
    const key = 'sm-c:' + action + ':' + JSON.stringify(body || {});
    const old = store.get(key);
    if (old) paint(old, true);
    const fresh = await api(action, body);
    store.set(key, fresh);
    if (!old || JSON.stringify(old) !== JSON.stringify(fresh)) paint(fresh, false);
    return fresh;
  }
  // Fill the cache in the background so the next screen opens instantly.
  function warm(action, body) {
    api(action, body).then((d) => store.set('sm-c:' + action + ':' + JSON.stringify(body || {}), d)).catch(() => {});
  }

  /* ------------------------------------------------------------ dialogs with forms */
  function openDialog(title, nodes) {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    const wrap = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-card form-card' },
        h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap' },
          h('h2', { class: 'grow', style: 'margin:0 0 10px' }, title),
          h('button', { class: 'btn small secondary', type: 'button', 'aria-label': 'Close', onclick: () => close() }, '×')),
        nodes));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    const first = wrap.querySelector('button.choice, input, textarea');
    if (first) first.focus();
    return { close, wrap };
  }

  /* ------------------------------------------------------------ formatting */
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) + ' ' + fmtTime(iso);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ------------------------------------------------------------ icons */
  const ICONS = {
    cottage: '<path d="M3 11.5L12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20M16 6.5V4h2.5v4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    cup: '<path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    cooler: '<rect x="5" y="2.5" width="14" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 9h14M8 5.5v1.5M8 12v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bottle: '<path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3V2z M8 13h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }

  function topbar(title, backHref) {
    return h('header', { class: 'topbar' },
      h('a', { class: 'back', href: backHref || '#/', 'aria-label': 'Back' }, '‹ Back'),
      h('h1', null, title),
      h('img', { src: 'assets/logo-horizontal.svg', alt: '' }));
  }

  /* ------------------------------------------------------------ home */
  function fmtDay(ymd) {
    if (!ymd) return '';
    return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) + ', ' + fmtTime(iso);
  }
  function countStatusText(c) {
    if (!c) return '';
    if (c.open) return 'In progress · ' + c.open.counted + ' of ' + c.total + ' counted';
    if (c.lastFinished) return 'Finished ' + fmtWhen(c.lastFinished.completedAt);
    return 'Not counted yet';
  }

  function renderHome() {
    const buttons = [
      ['#/count/housekeeping', 'cottage', 'Housekeeping Orders'],
      ['#/count/cafe', 'cup', 'Cafe Orders'],
      ['#/request/supply', 'list', 'Other Supply Requests'],
      ['#/request/drink', 'cooler', 'Drink Cooler'],
      ['#/count/beverage', 'bottle', 'Beer / Cider / Wine'],
    ];
    const live = h('div', { class: 'status-live' });
    mount(
      h('div', { class: 'home-head' },
        h('img', { class: 'logo', src: 'assets/logo-horizontal.svg', alt: 'Lapland Lake', width: 440, height: 95 }),
        h('hr', { class: 'lake-rule' }),
        h('p', { class: 'subtitle' }, 'Supply inventory & ordering')),
      h('div', { class: 'wrap' },
        !API_URL ? h('div', { class: 'notice warn' }, 'Not connected yet: the one-time setup needs to be finished before counts and requests can be saved.') : null,
        h('nav', { class: 'home-buttons', 'aria-label': 'Sections' },
          buttons.map((b) => h('a', { class: 'home-btn', href: b[0] }, h('span', { class: 'tile-ico' }, icon(b[1])), h('span', null, b[2])))),
        h('section', { class: 'status-card', 'aria-label': "Ginsberg's delivery and this week's counts" },
          h('h2', null, "Ginsberg's Foods"),
          live,
          h('p', { class: 'delivery' }, DELIVERY_TEXT[0], h('br'), DELIVERY_TEXT[1])),
        h('div', { style: 'text-align:center' }, h('a', { class: 'admin-link', href: '#/admin' }, 'Admin'))));
    if (!API_URL) return;
    cachedApi('homeStatus', null, (s) => {
      const nd = s.nextDelivery;
      live.innerHTML = '';
      const rules = document.querySelector('.status-card .delivery');
      if (rules) rules.classList.toggle('hidden', !!s.paused);
      live.append(
        s.paused ? h('p', { class: 'paused-note' }, h('b', null, 'Ordering paused. '), 'Keep counting as usual.') : null,
        nd && !s.paused ? h('dl', { class: 'status-dates' },
          h('dt', null, 'Next delivery'), h('dd', null, fmtDay(nd.deliveryDate)),
          h('dt', null, 'Order deadline'), h('dd', null, fmtWhen(nd.deadline))) : null,
        h('ul', { class: 'status-counts' },
          ['housekeeping', 'cafe'].map((d) => {
            const c = s.counts[d];
            const cls = c.open ? 'progress' : c.lastFinished ? 'done' : 'none';
            return h('li', { class: cls }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('b', null, KIND_HEADING[d] + ' count: '), countStatusText(c));
          })));
    }).then(() => { ['housekeeping', 'cafe'].forEach((k) => warm('countSheet', { kind: k })); })
      .catch(() => { /* the card still shows the delivery rules */ });
  }

  /* ------------------------------------------------------------ storage areas (count sections) */
  // Walk-through order. Each area has its own color and icon; unknown categories go last.
  const AREAS = [
    { re: /^frozen/i, color: '#1f5fae', tint: '#e8f0fb', icon: 'snow' },
    { re: /^(refrig|cooler|fridge)/i, color: '#0f766e', tint: '#e4f4f1', icon: 'thermo' },
    { re: /^produce/i, color: '#3d7a1f', tint: '#ecf6e4', icon: 'leaf' },
    { re: /^dry/i, color: '#86652a', tint: '#f6efe0', icon: 'box' },
    { re: /^kitchen/i, color: '#b14f17', tint: '#fbeee3', icon: 'whisk' },
    { re: /^(cups|to-go)/i, color: '#7a3d6e', tint: '#f6e9f3', icon: 'cup' },
    { re: /^paper/i, color: '#56616b', tint: '#eef1f3', icon: 'roll' },
    { re: /^(trash|clean)/i, color: '#37505e', tint: '#e7eef1', icon: 'spray' },
  ];
  const OTHER_AREA = { color: '#4a5a5e', tint: '#eef2f3', icon: 'box' };
  Object.assign(ICONS, {
    snow: '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    thermo: '<path d="M10 4a2 2 0 0 1 4 0v10.3a4 4 0 1 1-4 0V4z M12 9v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15zM5 19l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    whisk: '<path d="M12 21v-7M9 14h6M12 14c-4-3-5-8-3-10 1.5-1.5 3.5-1 3 2 0-3 2-3.5 3-2 2 2 1 7-3 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    roll: '<ellipse cx="8" cy="8" rx="4" ry="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 3h9c2.2 0 4 2.2 4 5v11H8M8 13v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
    spray: '<path d="M8 8h6v13H8zM9 8V5h4l3 2M16 4h2M16 7h3M16 10h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  });
  function areaFor(category) {
    const i = AREAS.findIndex((a) => a.re.test(String(category || '').trim()));
    return i >= 0 ? Object.assign({ order: i }, AREAS[i]) : Object.assign({ order: AREAS.length }, OTHER_AREA);
  }
  function groupByArea(items) {
    const groups = {};
    items.forEach((it) => {
      const name = (it.category || '').trim() || 'Other items';
      if (!groups[name]) groups[name] = Object.assign({ name, items: [] }, areaFor(it.category));
      groups[name].items.push(it);
    });
    return Object.values(groups).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((g) => Object.assign(g, { items: g.items.slice().sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  /* ------------------------------------------------------------ count screens */
  function validateLocal(kind, full, loose) {
    if (full !== '' && !/^\d+$/.test(full)) return 'Full cases must be a whole number (0 or more).';
    if (loose !== '') {
      if (kind === 'beverage' ? !/^\d+$/.test(loose) : !/^\d+(\.\d{1,2})?$/.test(loose)) {
        return kind === 'beverage' ? 'Loose bottles/cans must be a whole number (0 or more).' : 'Loose units must be 0 or more.';
      }
    }
    return '';
  }

  // "Suggest…" on a count item: a one-time extra, or a note about the regular amount.
  function suggestDialog(dept, it) {
    const CHOICES = [
      ['extra', '+ Extra for this week', 'One-time need, for example a group coming. Added to the next order.'],
      ['more', 'We need more every week', 'We keep running out.'],
      ['less', 'We have too many', 'Cases keep piling up or going stale.'],
    ];
    let type = '';
    const cases = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', value: '1', id: 'sg-cases', 'aria-label': 'Extra cases' });
    const step = (d) => { const v = /^\d+$/.test(cases.value) ? Number(cases.value) : 1; cases.value = String(Math.min(50, Math.max(1, v + d))); };
    const casesRow = h('div', { class: 'hidden' }, h('label', { for: 'sg-cases' }, 'How many extra cases?'),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': 'One fewer', onclick: () => step(-1) }, '−'), cases,
        h('button', { type: 'button', 'aria-label': 'One more', onclick: () => step(1) }, '+')));
    const note = h('textarea', { id: 'sg-note', maxlength: 500, placeholder: 'For example: group coming Friday', style: 'min-height:70px' });
    const msg = h('div');
    const send = h('button', { class: 'btn block', type: 'button', disabled: true }, 'Send');
    const choiceBtns = CHOICES.map((c) => {
      const b = h('button', { class: 'choice', type: 'button', 'aria-pressed': 'false', onclick: () => {
        type = c[0];
        choiceBtns.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        casesRow.classList.toggle('hidden', type !== 'extra');
        send.disabled = false;
      } }, h('b', null, c[1]), h('span', { class: 'small' }, c[2]));
      return b;
    });
    const dlg = openDialog(it.name, [
      h('div', { class: 'choices' }, choiceBtns), casesRow,
      h('label', { for: 'sg-note' }, 'Reason (optional)'), note, msg, h('div', { style: 'margin-top:12px' }, send)]);
    send.onclick = async () => {
      if (!type) return;
      if (type === 'extra' && !/^\d+$/.test(cases.value.trim())) { msg.innerHTML = ''; msg.append(h('div', { class: 'notice err' }, 'Enter a whole number of cases.')); return; }
      send.disabled = true; send.textContent = 'Sending…';
      try {
        const res = await api('staffSuggest', { type, department: dept, itemId: it.id, cases: cases.value.trim(), note: note.value.trim() });
        dlg.close();
        tell(res.message);
      } catch (err) {
        send.disabled = false; send.textContent = 'Send';
        msg.innerHTML = ''; msg.append(h('div', { class: 'notice err', role: 'alert' }, err.message + ' Nothing was sent; try again.'));
      }
    };
  }

  // "Item not on this list?": staff report something they count that isn't listed.
  function notListedDialog(dept) {
    const photos = [];
    const name = h('input', { type: 'text', id: 'nl-name', maxlength: 120, autocomplete: 'off', placeholder: 'For example: Oat milk, 32 oz' });
    const note = h('textarea', { id: 'nl-note', maxlength: 500, placeholder: 'Optional: where it is kept, how many we use', style: 'min-height:70px' });
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr', tabindex: -1 });
    const pick = h('input', { type: 'file', accept: 'image/*', class: 'sr', tabindex: -1 });
    const thumbs = h('div', { class: 'thumbs' });
    const msg = h('div');
    const send = h('button', { class: 'btn block', type: 'button' }, 'Send');
    const show = (type, text) => { msg.innerHTML = ''; if (text) msg.append(h('div', { class: 'notice ' + type, role: 'alert' }, text)); };
    const draw = () => {
      thumbs.innerHTML = '';
      photos.forEach((p) => thumbs.append(h('div', { class: 'thumb' }, p.previewUrl ? h('img', { src: p.previewUrl, alt: 'Photo to attach' }) : null,
        h('button', { class: 'rm', type: 'button', 'aria-label': 'Remove this photo', onclick: () => { photos.splice(photos.indexOf(p), 1); draw(); } }, '×'),
        p.status === 'preparing' ? h('div', { class: 'st' }, 'Preparing…') : null)));
    };
    const add = async (files) => {
      for (const f of Array.from(files)) {
        if (photos.length >= 3) { show('warn', 'Up to 3 photos.'); break; }
        const p = { status: 'preparing' };
        photos.push(p); draw();
        try { Object.assign(p, await preparePhoto(f), { status: 'ready' }); } catch (err) { photos.splice(photos.indexOf(p), 1); show('err', err.message); }
        draw();
      }
    };
    cam.addEventListener('change', () => { add(cam.files); cam.value = ''; });
    pick.addEventListener('change', () => { add(pick.files); pick.value = ''; });
    const dlg = openDialog('Item not on this list', [
      h('p', { class: 'small muted', style: 'margin-top:0' }, 'A photo of the case label helps find the right item.'),
      h('label', { for: 'nl-name' }, 'Item name'), name,
      h('label', { for: 'nl-note' }, 'Note (optional)'), note,
      h('div', { class: 'photo-buttons', style: 'margin-top:10px' },
        h('button', { class: 'btn secondary', type: 'button', onclick: () => cam.click() }, 'Take photo'),
        h('button', { class: 'btn secondary', type: 'button', onclick: () => pick.click() }, 'Choose photo')),
      cam, pick, thumbs, msg, h('div', { style: 'margin-top:12px' }, send)]);
    send.onclick = async () => {
      if (!name.value.trim()) { show('err', 'Please type the item name.'); name.focus(); return; }
      if (photos.some((p) => p.status === 'preparing')) { show('warn', 'Wait for the photo to finish preparing.'); return; }
      send.disabled = true;
      try {
        for (let i = 0; i < photos.length; i++) {
          if (photos[i].token) continue;
          send.textContent = 'Uploading photo ' + (i + 1) + ' of ' + photos.length + '…';
          photos[i].token = (await apiUpload('uploadPhoto', { data: photos[i].data, mime: 'image/jpeg' })).photoToken;
        }
        send.textContent = 'Sending…';
        const res = await api('staffSuggest', { type: 'add', department: dept, itemName: name.value.trim(), note: note.value.trim(), photoTokens: photos.map((p) => p.token) });
        photos.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        dlg.close();
        tell(res.message);
      } catch (err) {
        send.disabled = false; send.textContent = 'Send';
        show('err', err.message + ' Nothing is lost; tap Send to try again.');
      }
    };
  }

  function renderCount(kind) {
    const draftKey = 'sm-draft-' + kind;
    const state = { items: [], rows: {}, session: null, finishing: false, sections: [] };
    const body = h('div', { class: 'wrap' }, h('p', null, 'Loading the list…'));
    const progressText = h('span');
    const progressBar = h('div');
    const progress = h('div', { class: 'progress' }, progressText, h('div', { class: 'bar' }, progressBar));
    const finishBtn = h('button', { class: 'btn', type: 'button', onclick: () => finish() }, 'Finish count');
    const leaveBtn = h('a', { class: 'btn secondary', href: '#/' }, 'Save & leave');
    const finishBar = h('div', { class: 'finish-bar hidden' }, h('div', { class: 'inner' }, leaveBtn, finishBtn));
    mount(topbar(KIND_TITLE[kind]), body, finishBar);

    function pendingCount() { return Object.values(state.rows).filter((r) => r.status === 'saving' || r.status === 'pending' || r.status === 'error' || r.status === 'invalid').length; }
    const unloadWarn = (e) => { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } };
    // Section headers stick just below the overall progress bar.
    const placeHeaders = () => { document.documentElement.style.setProperty('--section-top', (64 + progress.offsetHeight) + 'px'); };
    window.addEventListener('beforeunload', unloadWarn);
    window.addEventListener('resize', placeHeaders);
    const off = () => { window.removeEventListener('beforeunload', unloadWarn); window.removeEventListener('resize', placeHeaders); window.removeEventListener('hashchange', off); };
    window.addEventListener('hashchange', off);

    function isCounted(r) { return r && r.saved && (r.saved.fullCases !== null || r.saved.looseUnits !== null); }
    function updateProgress() {
      const total = state.items.length;
      const counted = state.items.filter((it) => isCounted(state.rows[it.id])).length;
      const pend = pendingCount();
      progressText.textContent = counted + ' of ' + total + ' counted' + (pend ? ' · ' + plural(pend, 'item', 'items') + ' not saved yet' : ' · all entries saved');
      progressBar.style.width = total ? Math.round(100 * counted / total) + '%' : '0';
      state.sections.forEach((s) => {
        const n = s.items.filter((it) => isCounted(state.rows[it.id])).length;
        s.countEl.textContent = n + ' of ' + s.items.length;
        s.barEl.style.width = Math.round(100 * n / s.items.length) + '%';
        s.el.classList.toggle('done', n === s.items.length);
      });
    }

    // Each item has one or more count boxes (two for items kept in the Kitchen and the Storage room).
    function boxValues(r) { return r.boxes.map((b) => ({ full: b.full.value.trim(), loose: b.loose ? b.loose.value.trim() : '' })); }
    function isBlank(vals) { return vals.every((v) => v.full === '' && v.loose === ''); }

    function saveDraft() {
      const d = {};
      Object.keys(state.rows).forEach((id) => {
        const r = state.rows[id];
        if (r.status === 'pending' || r.status === 'saving' || r.status === 'error') d[id] = { boxes: boxValues(r), flag: r.flag, clear: r.wantClear };
      });
      if (Object.keys(d).length) store.set(draftKey, d); else store.del(draftKey);
    }

    // Amber "Low" badge while counting: the entered amount is at or below the item's minimum.
    function updateDerived(r) {
      const vals = boxValues(r);
      const it = r.item;
      let full = 0, loose = 0, valid = true;
      vals.forEach((v) => {
        if (validateLocal(kind, v.full, v.loose)) valid = false;
        full += v.full === '' ? 0 : Number(v.full);
        loose += v.loose === '' ? 0 : Number(v.loose);
      });
      const entered = !isBlank(vals) && valid;
      const onHand = full + (it.allowLoose && it.unitsPerCase ? loose / it.unitsPerCase : 0);
      const low = entered && it.minimumStock !== null && it.minimumStock !== undefined && onHand <= it.minimumStock + 1e-9;
      r.lowBadge.classList.toggle('hidden', !low);
      r.el.classList.toggle('is-low', low);
      if (r.totalEl) {
        r.totalEl.textContent = entered
          ? 'Total: ' + plural(Math.round(full * 100) / 100, 'case', 'cases') + (it.allowLoose && loose ? ' + ' + (Math.round(loose * 100) / 100) + ' ' + (it.looseUnitLabel || 'units') : '')
          : 'Total: not counted yet';
      }
    }

    function setStatus(r, status, msg) {
      r.status = status;
      r.el.classList.toggle('error', status === 'error');
      r.el.classList.toggle('counted', isCounted(r) && status === 'saved');
      const txt = {
        none: 'Not counted',
        pending: 'Not saved yet…',
        saving: 'Saving…',
        saved: r.saved && r.saved.countedAt ? 'Saved ' + fmtTime(r.saved.countedAt) : 'Saved',
        error: 'Not saved: ' + (msg || 'error'),
        invalid: msg,
      }[status];
      r.stateEl.className = 'save-state ' + (status === 'invalid' ? 'error' : status);
      r.stateEl.textContent = txt;
      r.retry.classList.toggle('hidden', status !== 'error');
      updateDerived(r);
      updateProgress();
      saveDraft();
    }

    // One save at a time per item; later edits wait and are sent after.
    let active = 0;
    const queue = [];
    function pump() {
      while (active < 3 && queue.length) {
        const r = queue.shift();
        r.queued = false;
        active++;
        doSave(r).finally(() => { active--; if (r.dirty) { r.dirty = false; schedule(r, 0); } pump(); });
      }
    }
    function schedule(r, delay) {
      clearTimeout(r.timer);
      const vals = boxValues(r);
      const err = vals.map((v) => validateLocal(kind, v.full, v.loose)).filter(Boolean)[0]
        || (state.finished && isBlank(vals) ? 'Enter a number (0 if there are none).' : '');
      if (err) { setStatus(r, 'invalid', err); return; }
      if (r.status !== 'saving') setStatus(r, 'pending');
      r.timer = setTimeout(() => {
        if (r.inflight) { r.dirty = true; return; }
        if (!r.queued) { r.queued = true; queue.push(r); }
        pump();
      }, delay === undefined ? 700 : delay);
    }
    async function doSave(r) {
      const vals = boxValues(r);
      const clear = isBlank(vals) && !r.flag;
      const body = { kind, itemId: r.item.id, flag: r.flag, clear };
      if (r.item.locations) body.parts = vals.map((v) => ({ fullCases: v.full, looseUnits: v.loose }));
      else { body.fullCases = vals[0].full; body.looseUnits = vals[0].loose; }
      r.inflight = true;
      setStatus(r, 'saving');
      try {
        const res = await api('saveCount', body);
        if (res.session) state.session = res.session;
        r.saved = clear ? null : res.entry;
        r.inflight = false;
        setStatus(r, r.dirty ? 'pending' : (clear ? 'none' : 'saved'));
      } catch (err) {
        r.inflight = false;
        setStatus(r, 'error', err.message);
      }
    }

    function stepper(input, delta) {
      const v = input.value.trim() === '' ? 0 : Number(input.value);
      if (!isFinite(v)) return;
      input.value = String(Math.max(0, Math.floor(v) + delta));
      input.dispatchEvent(new Event('input'));
    }

    function countBox(r, it, label, saved, n) {
      const sfx = it.id + '-' + n;
      const box = {};
      const lbl = (t) => (label ? label + ': ' : '') + t;
      box.full = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', id: 'f-' + sfx, autocomplete: 'off', value: saved && saved.fullCases !== null && saved.fullCases !== undefined ? String(saved.fullCases) : '', 'aria-label': lbl('Full cases of ' + it.name) });
      box.loose = it.allowLoose ? h('input', { type: 'text', inputmode: kind === 'beverage' ? 'numeric' : 'decimal', id: 'l-' + sfx, autocomplete: 'off', value: saved && saved.looseUnits !== null && saved.looseUnits !== undefined ? String(saved.looseUnits) : '', 'aria-label': lbl('Loose ' + (it.looseUnitLabel || 'units') + ' of ' + it.name) }) : null;
      [box.full, box.loose].forEach((inp) => {
        if (!inp) return;
        inp.addEventListener('input', () => { r.wantClear = false; schedule(r); });
        inp.addEventListener('blur', () => { if (r.status === 'pending') schedule(r, 0); });
      });
      box.el = h('div', { class: 'count-box' },
        label ? h('div', { class: 'place' }, label) : null,
        h('div', { class: 'qty' + (box.loose ? '' : ' one') },
          h('div', null, h('label', { for: 'f-' + sfx }, 'Full cases'),
            h('div', { class: 'stepper' },
              h('button', { type: 'button', 'aria-label': lbl('One fewer case'), onclick: () => stepper(box.full, -1) }, '−'),
              box.full,
              h('button', { type: 'button', 'aria-label': lbl('One more case'), onclick: () => stepper(box.full, 1) }, '+'))),
          box.loose ? h('div', null, h('label', { for: 'l-' + sfx }, 'Loose ' + (it.looseUnitLabel || 'units')), box.loose) : null));
      return box;
    }

    function itemCard(it, saved) {
      const r = { item: it, saved, flag: saved ? saved.flag || '' : '', status: 'none' };
      if (it.locations) {
        const parts = (saved && saved.parts) || [];
        r.boxes = it.locations.map((loc, i) => countBox(r, it, loc, parts[i] || null, i));
        r.totalEl = h('p', { class: 'split-total' });
      } else {
        r.boxes = [countBox(r, it, null, saved, 0)];
      }
      r.stateEl = h('span', { class: 'save-state none' }, 'Not counted');
      r.retry = h('button', { class: 'btn small secondary hidden', type: 'button', onclick: () => schedule(r, 0) }, 'Retry');
      const suggestBtn = kind === 'beverage' ? null : h('button', { class: 'flagbtn suggest', type: 'button', onclick: () => suggestDialog(kind, it) }, 'Suggest…');
      const clearBtn = state.finished ? null : h('button', { class: 'btn small secondary', type: 'button', onclick: () => { r.boxes.forEach((b) => { b.full.value = ''; if (b.loose) b.loose.value = ''; }); r.flag = ''; r.wantClear = true; schedule(r, 0); } }, 'Clear');
      r.lowBadge = h('span', { class: 'low-badge hidden', title: 'At or below the minimum' }, 'Low');
      const meta = [];
      if (kind === 'beverage') {
        meta.push(it.unitsPerCase + ' ' + (it.looseUnitLabel || 'bottles/cans') + ' per case');
        if (it.type) meta.unshift(it.type.charAt(0).toUpperCase() + it.type.slice(1));
      } else {
        meta.push('Count in: ' + (it.countingUnit || 'cases'));
        if (it.allowLoose) meta.push(it.unitsPerCase + ' ' + it.looseUnitLabel + ' per case');
        if (it.minimumStock !== null && it.minimumStock !== undefined) meta.push('Minimum: ' + it.minimumStock);
        if (it.desiredStock !== null && it.desiredStock !== undefined) meta.push('Desired: ' + it.desiredStock + ' ' + (it.desiredStock === 1 ? 'case' : 'cases'));
      }
      r.el = h('section', { class: 'item' + (it.locations ? ' split' : ''), 'aria-label': it.name },
        h('div', { class: 'name-row' }, h('p', { class: 'name' }, it.name), r.lowBadge),
        h('p', { class: 'meta' }, meta.join(' · ')),
        r.boxes.map((b) => b.el),
        r.totalEl || null,
        h('div', { class: 'item-foot' }, suggestBtn, clearBtn, r.stateEl, r.retry));
      state.rows[it.id] = r;
      setStatus(r, saved ? 'saved' : 'none');
      return r.el;
    }

    function sectionEl(g) {
      const countEl = h('span', { class: 'sec-count' });
      const barEl = h('div');
      const split = g.items.some((it) => it.locations);
      const el = h('section', { class: 'area', style: '--area:' + g.color + ';--area-tint:' + g.tint, 'aria-label': g.name },
        h('header', { class: 'area-head' },
          icon(g.icon),
          h('h3', null, g.name),
          countEl,
          h('div', { class: 'sec-bar', 'aria-hidden': 'true' }, barEl)),
        split ? h('p', { class: 'area-note' }, 'These are kept in two places. Count the Kitchen and the Storage room separately; the app adds them up.') : null,
        h('div', { class: 'area-items' }, g.items.map((it) => itemCard(it, state.entries[it.id] || null))));
      state.sections.push({ el, countEl, barEl, items: g.items });
      return el;
    }

    // Paints the list. It may run twice: first from this phone's last copy, then with the fresh one
    // (only if nobody has started typing; otherwise a note offers a reload).
    let painted = false;
    let touched = false;
    body.addEventListener('input', () => { touched = true; });
    body.addEventListener('click', (e) => { if (e.target.closest('.stepper button')) touched = true; });
    function paint(data) {
      painted = true;
      state.items = data.items;
      state.session = data.session;
      state.finished = data.finished || null;
      state.entries = data.entries;
      state.rows = {};
      state.sections = [];
      body.innerHTML = '';
      body.append(h('h2', { class: 'dept-heading' }, KIND_HEADING[kind] + ' count'));
      if (!data.items.length) {
        finishBar.classList.add('hidden');
        body.append(h('div', { class: 'notice info' }, kind === 'beverage'
          ? 'No beer, cider, wine or craft soda products are set up yet. They are added in Admin.'
          : 'No items are on the ' + KIND_HEADING[kind] + ' list yet. Items are chosen in Admin.'));
        return;
      }
      body.append(progress);
      const f = state.finished;
      if (f) {
        body.append(h('div', { class: 'notice ok finished-note' },
          h('b', null, 'This count was finished ' + fmtWhen(f.completedAt) + '. '),
          f.mode === 'sent' ? 'This week’s order was already sent. If a number changes (for example something sells out), you can still fix it here.'
            : f.mode === 'paused' ? 'If a number changes, you can still fix it here until the end of the week.'
              : 'If a number changes (for example something sells out), you can still fix it here.'));
      } else {
        body.append(h('p', { class: 'muted small' }, data.session
          ? 'Count started ' + fmtDateTime(data.session.startedAt) + '. Each entry saves on its own; you can leave and come back.'
          : 'Each entry saves as you type. You can leave and come back; saved counts stay. Blank means "not counted"; enter 0 if there are none.'));
      }
      if (kind === 'beverage') data.items.forEach((it) => body.append(itemCard(it, data.entries[it.id] || null)));
      else groupByArea(data.items).forEach((g) => body.append(sectionEl(g)));
      if (kind !== 'beverage') {
        body.append(h('div', { class: 'not-listed' },
          h('button', { class: 'btn secondary block', type: 'button', onclick: () => notListedDialog(kind) }, 'Item not on this list?'),
          h('p', { class: 'small muted' }, 'For something you count that isn’t on this list.')));
      }
      const draft = store.get(draftKey) || {};
      Object.keys(draft).forEach((id) => {
        const r = state.rows[id];
        if (!r) return;
        const boxes = draft[id].boxes || [{ full: draft[id].full || '', loose: draft[id].loose || '' }];
        r.boxes.forEach((b, i) => {
          b.full.value = (boxes[i] && boxes[i].full) || '';
          if (b.loose) b.loose.value = (boxes[i] && boxes[i].loose) || '';
        });
        r.flag = draft[id].flag || '';
        r.wantClear = !!draft[id].clear;
        schedule(r, 300);
      });
      finishBar.classList.remove('hidden');
      finishBtn.classList.toggle('hidden', !!f);
      leaveBtn.textContent = f ? 'Done' : 'Save & leave';
      updateProgress();
      placeHeaders();
    }

    async function load() {
      // Unsent typing from last time is restored onto the fresh list only.
      const hasDraft = Object.keys(store.get(draftKey) || {}).length > 0;
      const key = 'sm-c:countSheet:' + JSON.stringify({ kind });
      const old = hasDraft ? null : store.get(key);
      if (old) paint(old);
      let data;
      try {
        data = await api('countSheet', { kind });
      } catch (err) {
        if (painted) { body.prepend(h('div', { class: 'notice warn' }, 'Showing the list from earlier: ' + err.message)); return; }
        body.innerHTML = '';
        body.append(h('div', { class: 'notice err' }, err.message), h('button', { class: 'btn', onclick: () => renderCount(kind) }, 'Try again'));
        return;
      }
      store.set(key, data);
      if (old && JSON.stringify(old) === JSON.stringify(data)) return;
      if (!old || !touched) { paint(data); return; }
      body.prepend(h('div', { class: 'notice info' }, 'The list changed since this phone last opened it. ',
        h('button', { class: 'btn small', type: 'button', onclick: () => { if (!pendingCount()) paint(data); else tell('Wait until everything says "Saved", then tap again.'); } }, 'Show the latest')));
    }

    async function finish() {
      if (state.finishing) return;
      const pend = pendingCount();
      if (pend) {
        tell(plural(pend, 'entry is', 'entries are') + ' not saved yet. Wait for "Saved", or tap Retry on the items marked in red.');
        return;
      }
      const missing = state.items.filter((it) => !isCounted(state.rows[it.id]));
      if (!state.session) { tell('Nothing has been counted yet.'); return; }
      if (missing.length) {
        const names = missing.slice(0, 8).map((m) => '• ' + m.name).join('\n') + (missing.length > 8 ? '\n…and ' + (missing.length - 8) + ' more' : '');
        if (!await ask(plural(missing.length, 'item has', 'items have') + ' not been counted:\n' + names + '\n\nFinish the count anyway?')) return;
      } else if (!await ask('Finish the ' + KIND_HEADING[kind] + ' count?')) return;
      state.finishing = true;
      finishBtn.disabled = true;
      finishBtn.textContent = 'Finishing…';
      try {
        const res = await api('completeCount', { kind, sessionId: state.session.id });
        store.del(draftKey);
        store.del('sm-c:countSheet:' + JSON.stringify({ kind }));
        off();
        mount(topbar(KIND_TITLE[kind]), h('div', { class: 'wrap' },
          h('div', { class: 'notice ok' }, h('b', null, 'Count finished. Thank you!'), h('br'),
            res.alreadyCompleted ? 'This count had already been finished.' : (res.notCounted ? plural(res.notCounted, 'item was', 'items were') + ' left uncounted.' : 'Every item was counted.')),
          h('a', { class: 'btn block', href: '#/' }, 'Back to home')));
      } catch (err) {
        state.finishing = false;
        finishBtn.disabled = false;
        finishBtn.textContent = 'Finish count';
        tell('The count was not finished: ' + err.message);
      }
    }
    load();
  }

  /* ------------------------------------------------------------ photos */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  // Shrinks a photo to at most 1600 px on the long side, as JPEG.
  async function preparePhoto(file) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) throw new Error('That file is not a photo.');
    if (file.size > 40 * 1024 * 1024) throw new Error('That photo file is too large.');
    let source, w, h2, cleanup = () => {};
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      w = source.width; h2 = source.height;
      cleanup = () => source.close && source.close();
    } catch (e) {
      try {
        const r = await loadImage(file);
        source = r.img; w = r.img.naturalWidth; h2 = r.img.naturalHeight;
        cleanup = () => URL.revokeObjectURL(r.url);
      } catch (e2) {
        throw new Error(/hei[cf]/i.test(file.type + file.name) ? 'This phone photo format (HEIC) could not be opened here. Try "Take photo" instead, or set the camera to "Most Compatible".' : 'This photo could not be opened.');
      }
    }
    const scale = Math.min(1, 1600 / Math.max(w, h2));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h2 * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    cleanup();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('This photo could not be prepared.');
    const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    return { blob, data: String(dataUrl).split(',')[1], previewUrl: URL.createObjectURL(blob) };
  }

  /* ------------------------------------------------------------ requests */
  function renderRequest(kind) {
    const isDrink = kind === 'drink';
    const title = isDrink ? 'Drink Cooler' : 'Other Supply Requests';
    const draftKey = 'sm-req-' + kind;
    const photos = []; // { id, file, status, data, previewUrl, token, error, el }
    let options = [];
    let sending = false;

    const msg = h('div');
    const select = h('select', { id: 'opt', onchange: () => syncOther() });
    const nameInput = h('input', { type: 'text', id: 'itemName', maxlength: 120, autocomplete: 'off', placeholder: isDrink ? 'e.g. Saratoga sparkling water, 12 oz' : 'e.g. Dish soap' });
    const nameWrap = h('div', null, h('label', { for: 'itemName' }, isDrink ? 'Which drink? (exact flavor/size)' : 'Item name'), nameInput);
    const qty = h('input', { type: 'text', id: 'qty', inputmode: 'decimal', autocomplete: 'off' });
    const unit = h('input', { type: 'text', id: 'unit', maxlength: 40, list: 'units', placeholder: isDrink ? 'bottles, cans, cases…' : 'each, boxes, packs…' });
    const units = h('datalist', { id: 'units' }, ['each', 'cases', 'boxes', 'packs', 'bottles', 'cans', 'rolls', 'bags', 'gallons'].map((u) => h('option', { value: u })));
    const note = h('textarea', { id: 'note', maxlength: 1000, placeholder: 'Optional: where it goes, brand, size…' });
    const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr', id: 'cam', tabindex: -1 });
    const pickInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr', id: 'pick', tabindex: -1 });
    const thumbs = h('div', { class: 'thumbs' });
    const upBar = h('div');
    const upWrap = h('div', { class: 'hidden' }, h('div', { class: 'small', id: 'uptext' }), h('div', { class: 'uploadbar' }, upBar));
    const sendBtn = h('button', { class: 'btn block', type: 'submit' }, 'Send request');
    const recent = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Loading recent requests…'));

    function syncOther() {
      const other = select.value === '__other' || !options.length;
      nameWrap.classList.toggle('hidden', !other);
      const o = options.filter((x) => x.id === select.value)[0];
      if (o && o.defaultUnit && !unit.value) unit.value = o.defaultUnit;
      saveDraft();
    }
    function saveDraft() {
      store.set(draftKey, { opt: select.value, name: nameInput.value, qty: qty.value, unit: unit.value, note: note.value });
    }
    [nameInput, qty, unit, note].forEach((el) => el.addEventListener('input', () => { saveDraft(); if (!sending && msg.querySelector('.notice.err')) showMsg(); }));

    function renderThumbs() {
      thumbs.innerHTML = '';
      photos.forEach((p) => {
        const st = { preparing: 'Preparing…', ready: '', uploading: 'Uploading…', uploaded: 'Uploaded ✓', failed: 'Failed', bad: 'Can’t use' }[p.status];
        thumbs.appendChild(h('div', { class: 'thumb' + (p.status === 'failed' || p.status === 'bad' ? ' failed' : '') },
          p.previewUrl ? h('img', { src: p.previewUrl, alt: 'Photo to attach' }) : null,
          h('button', { class: 'rm', type: 'button', 'aria-label': 'Remove this photo', disabled: sending, onclick: () => removePhoto(p) }, '×'),
          st ? h('div', { class: 'st' }, st) : null));
      });
    }
    function removePhoto(p) {
      const i = photos.indexOf(p);
      if (i >= 0) photos.splice(i, 1);
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      renderThumbs();
    }
    async function addFiles(files) {
      for (const f of Array.from(files)) {
        if (photos.length >= 6) { showMsg('warn', 'You can attach up to 6 photos.'); break; }
        const p = { file: f, status: 'preparing' };
        photos.push(p);
        renderThumbs();
        try {
          Object.assign(p, await preparePhoto(f), { status: 'ready' });
        } catch (err) {
          p.status = 'bad';
          showMsg('err', err.message + ' Remove it and try another photo.');
        }
        renderThumbs();
      }
    }
    camInput.addEventListener('change', () => { addFiles(camInput.files); camInput.value = ''; });
    pickInput.addEventListener('change', () => { addFiles(pickInput.files); pickInput.value = ''; });

    function showMsg(type, text) {
      msg.innerHTML = '';
      if (text) msg.appendChild(h('div', { class: 'notice ' + type, role: type === 'err' ? 'alert' : 'status' }, text));
    }

    async function submit(e) {
      e.preventDefault();
      if (sending) return;
      showMsg();
      const chosen = options.filter((o) => o.id === select.value)[0];
      const itemName = chosen ? chosen.name : nameInput.value.trim();
      if (!itemName) {
        const typing = select.value === '__other' || !options.length;
        showMsg('err', typing ? (isDrink ? 'Please type the drink.' : 'Please enter the item name.') : (isDrink ? 'Please choose the drink, or pick "Another drink".' : 'Please choose an item, or pick "Something else".'));
        (typing ? nameInput : select).focus();
        return;
      }
      const q = qty.value.trim();
      if (!/^\d+(\.\d{1,2})?$/.test(q) || Number(q) <= 0) { showMsg('err', 'Quantity must be a number more than 0.'); qty.focus(); return; }
      if (photos.some((p) => p.status === 'preparing')) { showMsg('warn', 'Wait for the photos to finish preparing.'); return; }
      if (photos.some((p) => p.status === 'bad')) { showMsg('err', 'Remove the photo marked "Can’t use" first.'); return; }
      sending = true;
      sendBtn.disabled = true;
      renderThumbs();
      const todo = photos.filter((p) => !p.token);
      const uptext = upWrap.querySelector('#uptext');
      try {
        for (let i = 0; i < todo.length; i++) {
          const p = todo[i];
          upWrap.classList.remove('hidden');
          uptext.textContent = 'Uploading photo ' + (i + 1) + ' of ' + todo.length + '…';
          p.status = 'uploading'; renderThumbs();
          try {
            upBar.style.width = Math.round(100 * (i + 0.5) / todo.length) + '%';
            const res = await apiUpload('uploadPhoto', { data: p.data, mime: 'image/jpeg' });
            upBar.style.width = Math.round(100 * (i + 1) / todo.length) + '%';
            p.token = res.photoToken; p.status = 'uploaded'; renderThumbs();
          } catch (err) {
            p.status = 'failed'; renderThumbs();
            throw new Error('Photo ' + (photos.indexOf(p) + 1) + ' did not upload: ' + err.message);
          }
        }
        upBar.style.width = '100%';
        uptext.textContent = 'Sending request…';
        const res = await api('submitRequest', {
          kind: isDrink ? 'drink' : 'supply', optionId: chosen ? chosen.id : '', itemName, quantity: q,
          quantityUnit: unit.value.trim(), note: note.value.trim(), photoTokens: photos.map((p) => p.token),
        });
        store.del(draftKey);
        photos.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        photos.length = 0;
        form.reset(); select.value = ''; syncOther(); renderThumbs();
        upWrap.classList.add('hidden');
        showMsg('ok', 'Sent: ' + itemName + ' × ' + q + (res.photoCount ? ' with ' + plural(res.photoCount, 'photo', 'photos') : '') + '. Status: ' + res.status + '.');
        loadRecent();
      } catch (err) {
        showMsg('err', err.message + ' Nothing is lost: your entries and photos are still here. Tap "Send request" to try again.');
      } finally {
        sending = false;
        sendBtn.disabled = false;
        renderThumbs();
      }
    }

    async function loadRecent() {
      try {
        await cachedApi('recentRequests', { kind: isDrink ? 'drink' : 'supply' }, (data) => paintRecent(data));
      } catch (err) {
        recent.innerHTML = '';
        recent.appendChild(h('div', { class: 'notice err' }, 'Could not load recent requests: ' + err.message));
      }
    }
    function paintRecent(data) {
      {
        recent.innerHTML = '';
        recent.appendChild(h('h2', null, 'Recent requests'));
        if (!data.requests.length) recent.appendChild(h('p', { class: 'muted' }, 'No requests in the last 45 days.'));
        data.requests.forEach((r) => recent.appendChild(h('div', { class: 'req' },
          h('div', { class: 'what' }, h('b', null, r.itemName), ' × ' + r.quantity + (r.quantityUnit ? ' ' + r.quantityUnit : ''),
            h('div', { class: 'small muted' }, fmtDateTime(r.createdAt) + (r.photoCount ? ' · ' + plural(r.photoCount, 'photo', 'photos') : '')),
            r.note ? h('div', { class: 'small' }, r.note) : null),
          h('span', { class: 'chip ' + (r.status === 'Ordered' ? 'ordered' : 'shopping') }, r.status))));
      }
    }

    const form = h('form', { class: 'card', novalidate: true, onsubmit: submit },
      h('label', { for: 'opt' }, isDrink ? 'Drink' : 'Regular supply'), select, nameWrap,
      h('div', { class: 'grid2' },
        h('div', null, h('label', { for: 'qty' }, 'Quantity'), qty),
        h('div', null, h('label', { for: 'unit' }, 'Unit (optional)'), unit, units)),
      h('label', { for: 'note' }, 'Note (optional)'), note,
      h('label', null, 'Photos (optional)'),
      h('div', { class: 'photo-buttons' },
        h('button', { class: 'btn secondary', type: 'button', onclick: () => camInput.click() }, 'Take photo'),
        h('button', { class: 'btn secondary', type: 'button', onclick: () => pickInput.click() }, 'Choose photos')),
      camInput, pickInput, thumbs, upWrap,
      h('div', { style: 'margin-top:16px' }, sendBtn));

    mount(topbar(title), h('div', { class: 'wrap' },
      h('h2', { class: 'dept-heading' }, isDrink ? 'Drink Cooler restock' : 'Other supply request'),
      h('p', { class: 'muted' }, isDrink
        ? 'Which drink needs restocking, and how many.'
        : 'For anything that isn’t on the Housekeeping or Cafe count. These are kept separate from the Ginsberg’s order.'),
      msg, form, recent));

    let filled = false;
    function fillOptions() {
      const keep = filled ? select.value : null;
      select.innerHTML = '';
      select.appendChild(h('option', { value: '' }, options.length ? 'Choose…' : (isDrink ? 'Type the drink below' : 'Type the item below')));
      options.forEach((o) => select.appendChild(h('option', { value: o.id }, o.name)));
      select.appendChild(h('option', { value: '__other' }, isDrink ? 'Another drink (type it)' : 'Something else (type it)'));
      if (filled) {
        if (keep && Array.from(select.options).some((o) => o.value === keep)) select.value = keep;
        syncOther();
        return;
      }
      filled = true;
      const d = store.get(draftKey);
      if (d) {
        if (d.opt && Array.from(select.options).some((o) => o.value === d.opt)) select.value = d.opt;
        nameInput.value = d.name || ''; qty.value = d.qty || ''; unit.value = d.unit || ''; note.value = d.note || '';
      }
      syncOther();
    }
    cachedApi('requestOptions', { kind: isDrink ? 'drink' : 'supply' }, (data) => { options = data.options; fillOptions(); })
      .catch((err) => {
        if (!filled) fillOptions();
        showMsg('err', 'Could not load the list: ' + err.message + ' You can still type the item.');
      });
    loadRecent();
  }

  /* ------------------------------------------------------------ router */
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const [a, b] = parts;
    if (a === 'count' && ['housekeeping', 'cafe', 'beverage'].indexOf(b) >= 0) return renderCount(b);
    if (a === 'request' && (b === 'supply' || b === 'drink')) return renderRequest(b);
    if (a === 'admin' && window.SMAdmin) return window.SMAdmin.route(parts.slice(1));
    return renderHome();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);

  window.SM = { h, mount, ask, tell, cachedApi, fmtDay, fmtWhen, areaFor, AREAS, api, apiUpload, ApiError, store, fmtTime, fmtDateTime, plural, topbar, API_URL, KIND_HEADING };
})();
