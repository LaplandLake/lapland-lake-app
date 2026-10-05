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
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const SCREENS = [
  { path: 'tickets', title: 'Buy Tickets',       sub: 'Trail passes, lessons, season passes', icon: 'ticket', primary: true, render: renderTickets },
  { path: 'trails',  title: 'Trail Conditions',  sub: "Today's grooming report",              icon: 'snow',   render: renderConditions },
  { path: 'map',     title: 'Trail Map',         sub: 'Zoom in and tap a trail',              icon: 'map',    render: renderTrailMap },
  { path: 'menu',    title: 'Soup & Menu',       sub: "Today's soup and lodge menu",          icon: 'soup',   render: renderMenu },
  { path: 'lodge',   title: 'Lodge Map',         sub: 'Rentals, food, restrooms',             icon: 'lodge',  render: renderLodge },
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
    </nav>`;
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

function renderTrailMap(view) {
  view.innerHTML = `
    <h1>Trail Map</h1>
    <div class="placeholder">
      <strong>Coming next:</strong> the interactive trail map.<br>
      You'll be able to pinch to zoom and tap any trail to see its name, difficulty, and length.
    </div>`;
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
  document.title = screen ? `${screen.title} · Lapland Lake` : 'Lapland Lake';
  (screen ? screen.render : renderHome)(view);
  window.scrollTo(0, 0);
  if (screen) view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();

/* ---------- Offline support ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
