/* Lapland Lake guest app.
   Each screen is a function below. Screens are listed in SCREENS, which
   drives both the home screen buttons and navigation, so adding a future
   feature (nature guide, mini-game) is one new entry plus one new function. */

const ICONS = {
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  snow:   '<path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11"/><path d="M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>',
  map:    '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  soup:   '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>',
  lodge:  '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  chev:   '<path d="M9 5l7 7-7 7"/>',
  ext:    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  pine:   '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  alert:  '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  arrow:  '<path d="M12 20V5M6 11l6-6 6 6"/>',
  close:  '<path d="M6 6l12 12M18 6L6 18"/>',
  bed:    '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="2"/>',
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const SCREENS = [
  { path: 'tickets', title: 'Buy Tickets',       sub: 'Trail passes, lessons, season passes', icon: 'ticket', primary: true, render: renderTickets },
  { path: 'trails',  title: 'Trail Conditions',  sub: "Today's grooming report",              icon: 'snow',   render: renderConditions },
  { path: 'map',     title: 'Trail Map',         sub: 'Zoom in and tap a trail',              icon: 'map',    render: renderTrailMap },
  { path: 'menu',    title: 'Soup & Menu',       sub: "Today's soup and lodge menu",          icon: 'soup',   render: renderMenu },
  { path: 'lodge',   title: 'Lodge Map',         sub: 'Rentals, food, restrooms',             icon: 'lodge',  render: renderLodge },
  { path: 'stay',    title: 'Lodge With Us',     sub: 'Book your stay',                       icon: 'bed',    render: renderLodging },
];

/* ---------- Helpers ---------- */

// Loads one of the editable files in /content. Always asks for a fresh copy;
// if the phone is offline, the saved copy from the last visit is used instead.
async function loadContent(file) {
  const res = await fetch(`content/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${file}`);
  return res.json();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatDate(value) {
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const loading = '<p class="meta">Loading…</p>';
const errorCard = (what) => `<div class="notice">Sorry, we couldn't load ${what} right now. Please check your connection and try again.</div>`;

/* ---------- Screens ---------- */

function renderHome(view) {
  view.innerHTML = `
    <section class="welcome">
      <h1>Welcome!</h1>
      <p>Lapland Lake Nordic Vacation Center · Northville, NY</p>
    </section>
    <nav class="tiles" aria-label="Main menu">
      ${SCREENS.map((s) => `
        <a class="tile${s.primary ? ' primary' : ''}" href="#/${s.path}">
          <span class="icon">${svg(s.icon)}</span>
          <span>${esc(s.title)}<small>${esc(s.sub)}</small></span>
          ${svg('chev', 'chev')}
        </a>`).join('')}
    </nav>
    ${samsungTip()}`;
  view.querySelector('.tip-close')?.addEventListener('click', (e) => {
    try { localStorage.setItem('hideSamsungTip', '1'); } catch {}
    e.target.closest('.tip').remove();
  });
}

// Samsung Internet packages home-screen apps in a way Google Play Protect flags as unsafe,
// so Samsung Internet users get a tip to add the app from Chrome instead.
function samsungTip() {
  const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);
  const isInstalled = matchMedia('(display-mode: standalone)').matches;
  let hidden = false;
  try { hidden = localStorage.getItem('hideSamsungTip') === '1'; } catch {}
  if (!isSamsungBrowser || isInstalled || hidden) return '';
  const here = location.href.split('#')[0].replace(/^https?:\/\//, '');
  const openInChrome = `intent://${here}#Intent;scheme=https;package=com.android.chrome;end`;
  return `
    <aside class="tip card">
      <button type="button" class="tip-close" aria-label="Hide this tip">${svg('close')}</button>
      <strong>Adding this app to your home screen?</strong>
      <p>On Samsung phones, please add it from the Chrome browser. Samsung Internet can show a false security warning.</p>
      <a class="btn btn-secondary" href="${esc(openInChrome)}">Open in Chrome</a>
      <p class="meta">Then tap the ⋮ menu and choose <b>Add to home screen</b>.</p>
    </aside>`;
}

async function renderTickets(view) {
  view.innerHTML = `<h1>Buy Tickets</h1>${loading}`;
  try {
    const settings = await loadContent('settings.json');
    view.innerHTML = `
      <h1>Buy Tickets</h1>
      <p>Buy trail passes, lessons, and season passes online. You'll go to our secure booking page.</p>
      <a class="btn" href="${esc(settings.fareharborUrl)}" target="_blank" rel="noopener">
        Buy Tickets Now ${svg('ext')}
      </a>
      <p class="meta" style="margin-top:12px">Booking and payment are handled by FareHarbor.</p>`;
  } catch {
    view.innerHTML = `<h1>Buy Tickets</h1>${errorCard('the booking link')}`;
  }
}

// A note from the website, with its links (e.g. "Download form here") turned back into links.
function noteHtml(note) {
  let html = esc(note.text);
  for (const link of note.links || []) {
    const word = esc(link.text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`\\b${word}\\b`),
      `<a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.text)}</a>`);
  }
  return html;
}

async function renderLodging(view) {
  view.innerHTML = `<h1>Lodge With Us</h1>${loading}`;
  try {
    const settings = await loadContent('settings.json');
    view.innerHTML = `
      <h1>Lodge With Us</h1>
      <p>Stay at Lapland Lake. See available lodging and book online.</p>
      <a class="btn" href="${esc(settings.lodgingUrl)}" target="_blank" rel="noopener">
        Book Lodging ${svg('ext')}
      </a>
      <p class="meta" style="margin-top:12px">Reservations are handled by RezStream.</p>`;
  } catch {
    view.innerHTML = `<h1>Lodge With Us</h1>${errorCard('the booking link')}`;
  }
}

async function renderConditions(view) {
  view.innerHTML = `<h1>Trail Conditions</h1>${loading}`;
  try {
    const [report, settings] = await Promise.all([loadContent('trail-report.json'), loadContent('settings.json')]);
    // Out of date if the last copy from the website failed, or the posted report is too old.
    // Age counts from the date posted on the website ("Current Date"), or else from when it last changed.
    const postedDate = report.reportDate ? new Date(report.reportDate) : null;
    const since = postedDate && !isNaN(postedDate) ? postedDate : new Date(report.updated);
    const ageHours = (Date.now() - since) / 36e5;
    const stale = report.stale || !(ageHours < (settings.trailReportStaleAfterHours || 36));
    view.innerHTML = `
      <h1>Trail Conditions</h1>
      ${stale ? '<div class="notice">This report may be out of date. We\'ll show the newest one as soon as it\'s posted.</div>' : ''}
      <div class="card status">
        ${report.status ? `<div class="status-line">${esc(report.status)}</div>` : ''}
        <div class="meta">${report.reportDate ? `Report for <strong>${esc(report.reportDate)}</strong>` : `Last updated: <strong>${formatDateTime(report.updated)}</strong>`}</div>
      </div>
      ${report.stats?.length ? `
        <dl class="stats">
          ${report.stats.map((s) => `
            <div><dt>${esc(s.label)}</dt><dd>${esc(s.value) || '–'}</dd></div>`).join('')}
        </dl>` : ''}
      ${report.notes?.length ? `<div class="card notes">${report.notes.map((n) => `<p>${noteHtml(n)}</p>`).join('')}</div>` : ''}
      ${report.text ? `<div class="card"><div class="report-text">${esc(report.text)}</div></div>` : ''}
      ${report.hours ? `<p class="meta">${esc(report.hours)}</p>` : ''}
      ${/^https?:/.test(report.source || '') ? `<p class="meta">From the <a href="${esc(report.source)}" target="_blank" rel="noopener">trail report on our website</a>. Checked for changes every 30 minutes.</p>` : ''}`;
  } catch {
    view.innerHTML = `<h1>Trail Conditions</h1>${errorCard("today's trail report")}`;
  }
}

// Trail difficulty, using the standard North American trail symbols (same as on the website).
const DIFFICULTY = {
  'easiest':        { label: 'Easiest' },
  'more-difficult': { label: 'More Difficult' },
  'most-difficult': { label: 'Most Difficult' },
};
const diffBadge = (d) => `<span class="diff diff-${d}"><span class="sym sym-${d}" aria-hidden="true"></span>${DIFFICULTY[d]?.label || ''}</span>`;
const PLACE_ICONS = { lodge: svg('lodge'), cottage: svg('lodge'), parking: '<b>P</b>', rest: svg('pine'), caution: svg('alert'), entrance: svg('arrow') };

// Loads a script file once (used for the zoom library, which only the map needs).
const loadedScripts = {};
function loadScript(src) {
  return loadedScripts[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => { delete loadedScripts[src]; reject(); };
    document.head.appendChild(s);
  });
}

async function renderTrailMap(view) {
  view.innerHTML = `<h1>Trail Map</h1>${loading}`;
  let data;
  try {
    [data] = await Promise.all([loadContent('trails.json'), loadScript('js/vendor/panzoom.min.js')]);
  } catch {
    view.innerHTML = `<h1>Trail Map</h1>${errorCard('the trail map')}`;
    return;
  }

  const items = [
    ...data.trails.map((t, i) => ({ ...t, kind: 'trail', id: `t${i}` })),
    ...data.places.map((p, i) => ({ ...p, kind: 'place', id: `p${i}` })),
  ];
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const pos = ([x, y]) => `left:${(x / data.mapWidth) * 100}%;top:${(y / data.mapHeight) * 100}%`;
  const pin = (it, spot) => it.kind === 'trail'
    ? `<button class="pin" data-id="${it.id}" style="${pos(spot)}" aria-label="${esc(it.name)}, ${DIFFICULTY[it.difficulty]?.label}"><span class="sym sym-${it.difficulty}"></span></button>`
    : `<button class="pin pin-place" data-id="${it.id}" style="${pos(spot)}" aria-label="${esc(it.name)}"><span class="place-icon">${PLACE_ICONS[it.icon] || ''}</span></button>`;

  const listRow = (it) => `
    <li><button class="trail-row" data-id="${it.id}" ${it.spots?.length ? '' : 'data-nospot'}>
      <span class="sym sym-${it.difficulty}" aria-hidden="true"></span>
      <span class="trail-name">${esc(it.name)}${it.fromBridge ? ' *' : ''}${it.meaning ? `<small>${esc(it.meaning)}</small>` : ''}</span>
      <span class="trail-len">${esc(it.length)}</span>
    </button></li>`;

  view.innerHTML = `
    <h1>Trail Map</h1>
    <p class="meta">Pinch or use the + and − buttons to zoom. Tap a symbol for trail details.</p>
    <div class="legend">${Object.keys(DIFFICULTY).map(diffBadge).join('')}</div>
    <div class="map-frame">
      <div class="map-canvas" style="aspect-ratio:${data.mapWidth}/${data.mapHeight}">
        <img src="${esc(data.mapImage)}" alt="Lapland Lake cross-country ski trail map" draggable="false">
        ${items.flatMap((it) => (it.spots || []).map((spot) => pin(it, spot))).join('')}
      </div>
      <div class="map-controls">
        <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
        <button type="button" data-zoom="reset" aria-label="Show whole map">Reset</button>
      </div>
    </div>

    <div class="info-card" id="map-info" role="dialog" aria-live="polite" hidden></div>

    ${Object.keys(DIFFICULTY).map((d) => `
      <h2 class="list-head">${diffBadge(d)}</h2>
      <ul class="trail-list">${items.filter((it) => it.kind === 'trail' && it.difficulty === d).map(listRow).join('')}</ul>`).join('')}

    <h2>Places</h2>
    <ul class="trail-list">${items.filter((it) => it.kind === 'place').map((it) => `
      <li><button class="trail-row" data-id="${it.id}">
        <span class="place-icon small" aria-hidden="true">${PLACE_ICONS[it.icon] || ''}</span>
        <span class="trail-name">${esc(it.name)}${it.description ? `<small>${esc(it.description)}</small>` : ''}</span>
      </button></li>`).join('')}</ul>

    ${data.routes?.length ? `
      <h2>Longer routes</h2>
      <ul class="trail-list">${data.routes.map((r) => `
        <li><div class="trail-row">
          <span class="trail-name">${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
          <span class="trail-len">${esc(r.length)}</span>
        </div></li>`).join('')}</ul>` : ''}
    ${data.footnote ? `<p class="meta">${esc(data.footnote)}</p>` : ''}`;

  // ----- Zooming and panning -----
  const frame = view.querySelector('.map-frame');
  const canvas = view.querySelector('.map-canvas');
  const pz = window.Panzoom(canvas, { minScale: 1, maxScale: 6, contain: 'outside', step: 0.6 });
  frame.addEventListener('wheel', pz.zoomWithWheel);
  // Keep the tappable symbols the same size on screen at every zoom level
  canvas.addEventListener('panzoomchange', (e) => canvas.style.setProperty('--inv', 1 / e.detail.scale));
  frame.querySelector('.map-controls').addEventListener('click', (e) => {
    const z = e.target.closest('button')?.dataset.zoom;
    if (z === 'in') pz.zoomIn();
    if (z === 'out') pz.zoomOut();
    if (z === 'reset') { pz.reset(); select(null); }
  });

  // ----- Showing details -----
  const info = view.querySelector('#map-info');
  function select(id, { focusMap = false } = {}) {
    canvas.querySelectorAll('.pin.active').forEach((p) => p.classList.remove('active'));
    const it = id && byId[id];
    view.classList.toggle('has-info', !!it);
    if (!it) { info.hidden = true; return; }
    canvas.querySelectorAll(`.pin[data-id="${id}"]`).forEach((p) => p.classList.add('active'));
    info.innerHTML = `
      <button type="button" class="info-close" aria-label="Close">${svg('close')}</button>
      ${it.kind === 'trail' ? diffBadge(it.difficulty) : ''}
      <div class="info-name">${esc(it.name)}</div>
      ${it.meaning ? `<div class="info-meaning">${esc(it.meaning)}</div>` : ''}
      ${it.length ? `<div class="info-length">${esc(it.length)}${it.fromBridge ? ' <small>measured from the bridge</small>' : ''}</div>` : ''}
      ${it.description || it.note ? `<p>${esc(it.description || it.note)}</p>` : ''}
      ${it.kind === 'trail' && !it.spots?.length ? '<p class="meta">Not marked on this map.</p>' : ''}`;
    info.hidden = false;
    if (focusMap && it.spots?.length) {
      const [x, y] = it.spots[0];
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      pz.zoom(3, { animate: false });
      setTimeout(() => pz.pan(w / 2 - (x / data.mapWidth) * w, h / 2 - (y / data.mapHeight) * h, { animate: true }));
      frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  info.addEventListener('click', (e) => { if (e.target.closest('.info-close')) select(null); });

  // A tap on a symbol opens its details; a drag (panning the map) does not.
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
    // Pick the symbol closest to the finger, so neighbours don't steal the tap
    let best = null, bestDist = 30;
    canvas.querySelectorAll('.pin').forEach((p) => {
      const r = p.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (dist < bestDist) { best = p; bestDist = dist; }
    });
    if (best) select(best.dataset.id);
  });
  // Keyboard users (Enter/Space on a symbol)
  canvas.addEventListener('click', (e) => {
    const p = e.target.closest('.pin');
    if (p && e.detail === 0) select(p.dataset.id);
  });
  view.querySelectorAll('.trail-row[data-id]').forEach((row) =>
    row.addEventListener('click', () => select(row.dataset.id, { focusMap: true })));
}

async function renderMenu(view) {
  view.innerHTML = `<h1>Soup &amp; Menu</h1>${loading}`;
  try {
    const [soup, menu] = await Promise.all([loadContent('soup.json'), loadContent('menu.json')]);
    view.innerHTML = `
      <h1>Soup &amp; Menu</h1>
      <div class="card soup">
        <div class="label">Soup of the Day</div>
        <div class="name">${esc(soup.soup)}</div>
        ${soup.description ? `<p>${esc(soup.description)}</p>` : ''}
        <div class="meta">${formatDate(soup.date)}</div>
      </div>
      ${menu.sections.map((section) => `
        <section class="menu-section">
          <h2>${esc(section.name)}</h2>
          <div class="card">
            ${section.items.map((item) => `
              <div class="menu-item">
                <div>
                  <div class="name">${esc(item.name)}</div>
                  ${item.description ? `<div class="desc">${esc(item.description)}</div>` : ''}
                </div>
                ${item.price ? `<div class="price">${esc(item.price)}</div>` : ''}
              </div>`).join('')}
          </div>
        </section>`).join('')}
      ${menu.note ? `<p class="meta">${esc(menu.note)}</p>` : ''}`;
  } catch {
    view.innerHTML = `<h1>Soup &amp; Menu</h1>${errorCard('the menu')}`;
  }
}

function renderLodge(view) {
  view.innerHTML = `
    <h1>Lodge Map</h1>
    <div class="placeholder">
      <strong>Coming soon:</strong> a simple map of the main lodge showing rentals, food, and restrooms.
    </div>`;
}

/* ---------- Navigation ---------- */

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  const screen = SCREENS.find((s) => s.path === path);
  const view = document.getElementById('view');
  document.getElementById('back').hidden = !screen;
  view.className = '';
  document.title = screen ? `${screen.title} · Lapland Lake` : 'Lapland Lake';
  (screen ? screen.render : renderHome)(view);
  window.scrollTo(0, 0);
  if (screen) view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();

/* ---------- Offline support ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // When a new version of the app takes over, reload once so the phone shows it right away
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  }
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
