/* Lapland Lake guest app.
   Each screen is a function below. Screens are listed in SCREENS, which
   drives both the home screen buttons and navigation, so adding a future
   feature (nature guide, mini-game) is one new entry plus one new function. */

const ICONS = {
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  snow:   '<path stroke-width="1.6" d="M12 12L12 2M12 7.4L10.01 5.73M12 7.4L13.99 5.73M12 4.4L10.7 3.31M12 4.4L13.3 3.31M12 12L3.34 7M8.02 9.7L5.57 10.59M8.02 9.7L7.56 7.14M5.42 8.2L3.82 8.78M5.42 8.2L5.12 6.53M12 12L3.34 17M8.02 14.3L7.56 16.86M8.02 14.3L5.57 13.41M5.42 15.8L5.12 17.47M5.42 15.8L3.82 15.22M12 12L12 22M12 16.6L13.99 18.27M12 16.6L10.01 18.27M12 19.6L13.3 20.69M12 19.6L10.7 20.69M12 12L20.66 17M15.98 14.3L18.43 13.41M15.98 14.3L16.44 16.86M18.58 15.8L20.18 15.22M18.58 15.8L18.88 17.47M12 12L20.66 7M15.98 9.7L16.44 7.14M15.98 9.7L18.43 10.59M18.58 8.2L18.88 6.53M18.58 8.2L20.18 8.78"/>',
  map:    '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  soup:   '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>',
  lodge:  '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  chev:   '<path d="M9 5l7 7-7 7"/>',
  ext:    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  pine:   '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  alert:  '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  arrow:  '<path d="M12 20V5M6 11l6-6 6 6"/>',
  close:  '<path d="M6 6l12 12M18 6L6 18"/>',
  skier:  '<circle cx="14" cy="4" r="2"/><path d="M8 21l3-7 3 2 1 5M11 14l1-5 4 3 3-1M12 9l-4 1-2 3M3 21l18-3"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  bed:    '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="2"/>',
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const SCREENS = [
  { path: 'trails',  title: 'Trail Conditions',  sub: 'Grooming, snow depth & km open',                       icon: 'snow',   render: renderConditions },
  { path: 'tickets', title: 'Buy Tickets',       sub: 'Trail passes, equipment rentals, lessons, season passes', icon: 'ticket', render: renderTickets },
  { path: 'lessons', title: 'Lessons',           sub: 'Already have a ticket, season pass, or lodging with us?', icon: 'skier',  render: renderLessons },
  { path: 'map',     title: 'Trail Map',         sub: 'Zoom in and tap a trail',                              icon: 'map',    render: renderTrailMap },
  { path: 'menu',    title: 'Café Menu',         sub: "Today's soup, food & drinks",                          icon: 'soup',   render: renderMenu },
  { path: 'stay',    title: 'Lodge With Us',     sub: 'Our cottages, studios & farmhouse',                    icon: 'bed',    render: renderLodging },
  { path: 'photos',  title: 'Guest Photos',      sub: 'Share your Lapland Lake adventures',                 icon: 'camera', render: renderPhotos },
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
      <h1>Welcome to Lapland Lake</h1>
      <p>Cross-Country Ski Area &amp; Lodging</p>
    </section>
    <nav class="tiles" aria-label="Main menu">
      ${SCREENS.map((s) => `
        <a class="tile${s.primary ? ' primary' : ''}" href="#/${s.path}">
          <span class="icon">${svg(s.icon)}</span>
          <span>${esc(s.title)}<small>${esc(s.sub)}</small></span>
          ${svg('chev', 'chev')}
        </a>`).join('')}
    </nav>
    <footer class="home-footer">
      <a href="https://laplandlake.com/" target="_blank" rel="noopener">laplandlake.com</a>
      <span aria-hidden="true">·</span>
      <a href="tel:+15188634974">518-863-4974</a>
    </footer>
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
      <p>Buy trail passes, equipment rentals, lessons, and season passes online. You'll go to our secure booking page.</p>
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

async function renderLessons(view) {
  view.innerHTML = `<h1>Lessons</h1>${loading}`;
  try {
    const settings = await loadContent('settings.json');
    view.innerHTML = `
      <h1>Lessons</h1>
      <p>Already have a ticket, season pass, or lodging with us? Book a lesson here.</p>
      <a class="btn" href="${esc(settings.lessonsUrl || settings.fareharborUrl)}" target="_blank" rel="noopener">
        Book a Lesson ${svg('ext')}
      </a>
      <p class="meta" style="margin-top:12px">Booking and payment are handled by FareHarbor.</p>`;
  } catch {
    view.innerHTML = `<h1>Lessons</h1>${errorCard('the booking link')}`;
  }
}

async function renderLodging(view) {
  view.innerHTML = `<h1>Lodge With Us</h1>${loading}`;
  try {
    const settings = await loadContent('settings.json');
    view.innerHTML = `
      <h1>Lodge With Us</h1>
      <p>Stay at Lapland Lake, Winter, Summer, or Fall. See available lodging and book online.</p>
      <a class="btn" href="${esc(settings.lodgingUrl)}" target="_blank" rel="noopener">
        Book Lodging ${svg('ext')}
      </a>
      <p class="tip-line"><strong>Tip:</strong> The booking calendar is much easier to see on a computer screen.</p>
      <p class="meta">Reservations are handled by RezStream.</p>`;
  } catch {
    view.innerHTML = `<h1>Lodge With Us</h1>${errorCard('the booking link')}`;
  }
}

async function renderConditions(view) {
  view.innerHTML = `<h1>Trail Conditions</h1>${loading}`;
  try {
    const [report, settings] = await Promise.all([loadContent('trail-report.json'), loadContent('settings.json')]);
    // "Last updated" is when the report on the website last changed (noticed within 30 minutes),
    // not the "Current Date" typed into the report, which doesn't always get changed.
    // Out of date if the last copy from the website failed, or the report hasn't changed in a while.
    const ageHours = (Date.now() - new Date(report.updated)) / 36e5;
    const stale = report.stale || !(ageHours < (settings.trailReportStaleAfterHours || 36));
    view.innerHTML = `
      <h1>Trail Conditions</h1>
      <p class="updated">Last updated <strong>${formatDateTime(report.updated)}</strong></p>
      ${stale ? '<div class="notice">This report may be out of date. We\'ll show the newest one as soon as it\'s posted.</div>' : ''}
      <div class="card status">
        ${report.status ? `<div class="status-line">${esc(report.status)}</div>` : ''}

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
        <button type="button" data-zoom="reset" aria-label="Reset map">Reset</button>
      </div>
    </div>

    <div class="info-card" id="map-info" role="region" aria-label="Trail details" aria-live="polite" hidden></div>

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

// Today's date as year-month-day, the format used in soup.json
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function renderMenu(view) {
  view.innerHTML = `<h1>Café Menu</h1>${loading}`;
  try {
    const [soup, menu] = await Promise.all([loadContent('soup.json'), loadContent('menu.json')]);
    // titleNote in menu.json (e.g. "Closed until Ski Season") means the café is closed:
    // it's added to the title and the soup shows a dash. Remove it when the café opens.
    const closed = Boolean(menu.titleNote);
    // Only show the soup's name when it was posted for today; otherwise the card shows a dash
    const showSoup = !closed && soup.soup && soup.date === todayString();
    // "grabAndGo": true in soup.json (with today's date) = no one at the counter today:
    // show the notice, hide cooked-to-order items, and say the soup is heat-it-yourself.
    const grabAndGo = Boolean(soup.grabAndGo) && soup.date === todayString();
    view.innerHTML = `
      ${closed ? `<h1>Café Menu · <span class="title-note">${esc(menu.titleNote)}</span></h1>` : '<h1>Café Menu</h1>'}
      ${grabAndGo ? `
        <div class="card grab-and-go" role="note">
          <div class="label">Grab &amp; Go Today</div>
          <p>${esc(menu.grabAndGoNotice)}</p>
        </div>` : ''}
      <div class="card soup">
        <div class="label">Soup of the Day</div>
        ${showSoup ? `
          <div class="name">${esc(soup.soup)}</div>
          ${soup.description ? `<p>${esc(soup.description)}</p>` : ''}
          <div class="meta">${formatDate(soup.date)}</div>` : `
          <div class="name" aria-label="Not posted yet">—</div>`}
      </div>
      ${menu.sections.map((section) => `
        <section class="menu-section">
          <h2>${esc(section.name)}${section.note ? ` <span class="section-note">${esc(section.note)}</span>` : ''}</h2>
          <div class="card">
            ${section.items.filter((item) => !(grabAndGo && item.cooked)).map((item) => `
              <div class="menu-item">
                <div>
                  <div class="name">${esc(item.name)}</div>
                  ${item.description ? `<div class="desc">${esc(item.description)}</div>` : ''}
                  ${grabAndGo && item.grabAndGoNote ? `<div class="desc grab-note">${esc(item.grabAndGoNote)}</div>` : ''}
                </div>
                ${item.price ? `<div class="price">${esc(item.price)}</div>` : ''}
              </div>`).join('')}
          </div>
        </section>`).join('')}
      ${menu.note ? `<p class="meta">${esc(menu.note)}</p>` : ''}`;
  } catch {
    view.innerHTML = `<h1>Café Menu</h1>${errorCard('the menu')}`;
  }
}

// Guest photos, newest first. Photos only appear here after staff approve them.
function photoDate(value) {
  if (!value) return '';
  const today = todayString();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (value === today) return 'Today';
  if (value === yesterday) return 'Yesterday';
  return formatDate(value);
}

// One-step photo sharing: tap the button, pick photos, and they're sent.
// Photos go to the staff inbox (uploadUrl in content/photos.json) and only
// appear in the gallery after staff approve them.
const shareButton = () => `
  <label class="btn share-btn">
    ${svg('camera')} Share a Photo
    <input type="file" accept="image/*" multiple class="visually-hidden">
  </label>
  <p class="meta share-note"><b>Tip:</b> take your photo first, then share it from your gallery.<br>We check every photo before it appears here. By sharing, you allow Lapland Lake to post your photos.</p>`;

// Shrinks a photo before sending (faster on weak signal) and drops hidden
// details like the phone's GPS location.
async function shrinkPhoto(file, max = 1600) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

async function sendToInbox(uploadUrl, message) {
  if (!uploadUrl) return new Promise((r) => setTimeout(r, 800)); // preview: pretend to send
  const res = await fetch(uploadUrl, { method: 'POST', body: JSON.stringify(message) });
  const reply = res.ok ? await res.json().catch(() => ({})) : {};
  if (reply.status !== 'ok') throw new Error('Upload failed');
}

let sharingPhoto = false;

function setUpSharing(box, uploadUrl) {
  box.querySelector('input').addEventListener('click', () => { sharingPhoto = true; });
  box.querySelector('input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const batch = Date.now().toString(36);
    const plural = files.length > 1;
    // Sends up to 3 photos at a time, so several photos don't wait in line.
    let sentCount = 0;
    const status = () => {
      box.innerHTML = `<div class="share-status" role="status">Sending${plural ? ` ${Math.min(sentCount + 1, files.length)} of ${files.length}` : ''}…</div>`;
    };
    status();
    const queue = [...files];
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift();
        await sendToInbox(uploadUrl, { batch, photo: await shrinkPhoto(file), type: 'photo' });
        sentCount++;
        status();
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
    } catch {
      box.innerHTML = `<div class="notice">Sorry, ${plural ? 'your photos' : 'your photo'} didn't send. Please check your connection and try again.</div>${shareButton()}`;
      setUpSharing(box, uploadUrl);
      return;
    }
    let saved = '';
    try { saved = localStorage.getItem('photoCredit') || ''; } catch {}
    box.innerHTML = `
      <div class="share-done" role="status">
        <strong>Thanks! We got your ${plural ? 'photos' : 'photo'}.</strong>
        <p>Want credit when we post? <span class="meta">(optional)</span></p>
        <form class="tag-form">
          <label class="visually-hidden" for="credit">Your name or Instagram</label>
          <input id="credit" type="text" autocapitalize="words" autocomplete="name" placeholder="Name or @Instagram" value="${esc(saved)}">
          <button class="btn btn-secondary" type="submit">Credit Me</button>
        </form>
      </div>
      <button type="button" class="link-btn share-again">Share another photo</button>`;
    box.querySelector('.tag-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const credit = box.querySelector('#credit').value.trim();
      if (!credit) return;
      try { localStorage.setItem('photoCredit', credit); } catch {}
      const form = ev.target;
      form.innerHTML = '<p class="meta">Saving…</p>';
      try { await sendToInbox(uploadUrl, { batch, credit, type: 'credit' }); form.outerHTML = `<p>Got it! We'll credit you as <b>${esc(credit)}</b></p>`; }
      catch { form.outerHTML = '<p class="meta">Sorry, that didn\'t save. Your photos still got through.</p>'; }
    });
    box.querySelector('.share-again').addEventListener('click', () => {
      box.innerHTML = shareButton();
      setUpSharing(box, uploadUrl);
    });
  });
}

// Approved guest photos come live from Todd's Drive ("Approved" folder) through the
// photo inbox; the photos in content/photos.json are always shown after them.
async function loadApproved(uploadUrl) {
  if (!uploadUrl) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${uploadUrl}?list=1`, { signal: ctrl.signal });
    const reply = await res.json();
    return Array.isArray(reply.photos) ? reply.photos : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function renderPhotos(view) {
  view.innerHTML = `<h1>Guest Photos</h1>${loading}`;
  let data;
  try { data = await loadContent('photos.json'); }
  catch { view.innerHTML = `<h1>Guest Photos</h1>${errorCard('the photos')}`; return; }
  let photos = data.photos || [];
  const caption = (ph) => [photoDate(ph.date), ph.by].filter(Boolean).map(esc).join(' · ');
  const galleryHtml = () => photos.map((ph, i) => `
    <button type="button" class="gallery-item${i === 0 ? ' first' : ''}" data-i="${i}">
      <img src="${esc(ph.src)}" alt="Guest photo${ph.date ? ', ' + esc(photoDate(ph.date)) : ''}" loading="lazy">
      ${caption(ph) ? `<span class="gallery-cap">${caption(ph)}</span>` : ''}
    </button>`).join('');
  view.innerHTML = `
    <h1>Guest Photos</h1>
    <p>Show us your Lapland Lake adventures! Skiing, snowshoeing, hiking, or just relaxing, in any season.</p>
    <div id="share">${shareButton()}</div>
    <div class="gallery">${galleryHtml()}</div>`;

  setUpSharing(view.querySelector('#share'), data.uploadUrl);

  const gallery = view.querySelector('.gallery');
  loadApproved(data.uploadUrl).then((approved) => {
    if (!approved.length || !gallery.isConnected) return;
    photos = [...approved, ...photos];
    gallery.innerHTML = galleryHtml();
  });

  gallery.addEventListener('click', (e) => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    const ph = photos[item.dataset.i];
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Photo');
    box.innerHTML = `
      <button type="button" class="lightbox-close" aria-label="Close photo">${svg('close')}</button>
      <img src="${esc(ph.src)}" alt="">
      ${caption(ph) ? `<p>${caption(ph)}</p>` : ''}`;
    const close = () => { box.remove(); item.focus(); };
    box.addEventListener('click', close);
    document.body.append(box);
    box.querySelector('.lightbox-close').focus();
  });
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
    // (but never while a guest is picking or sending a photo; then wait until they move on)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sharingPhoto) window.addEventListener('hashchange', () => location.reload(), { once: true });
      else location.reload();
    }, { once: true });
  }
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
