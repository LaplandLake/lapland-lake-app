/* Copies the daily trail report from the Lapland Lake website into
   content/trail-report.json, which the app displays.

   Runs automatically on GitHub (see .github/workflows/site.yml).
   - Only rewrites the file when the report actually changes, so
     "updated" means "when the report last changed".
   - If the website can't be reached or the report can't be found, the
     previous report is kept and marked as possibly out of date.

   Settings live in content/settings.json:
     trailReportUrl      the page to read
     trailReportHeading  the heading the report sits under on that page

   The report on the website is a block with:
     a "Current Date: ..." line, a status line ("Trails closed"),
     "Daytime High: ...", a table of label/value pairs, and notes paragraphs.
*/
import { readFile, writeFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';

const REPORT_FILE = 'content/trail-report.json';
const settings = JSON.parse(await readFile('content/settings.json', 'utf8'));
const url = process.env.TRAIL_REPORT_URL || settings.trailReportUrl;
const heading = (settings.trailReportHeading || 'Current Conditions').toLowerCase();

const clean = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const stripColon = (s) => clean(s).replace(/:$/, '').trim();

export function parseReport(html) {
  const $ = cheerio.load(html);

  // The block of the page that holds the report: the section containing the report's heading.
  const h = $('h1, h2').filter((_, el) => clean($(el).text()).toLowerCase().includes(heading)).first();
  if (!h.length) throw new Error(`Could not find the "${settings.trailReportHeading}" heading on the page`);
  const block = h.closest('.wpb_wrapper').length ? h.closest('.wpb_wrapper') : h.parent();
  block.find('script, style, noscript, iframe, form, img, svg').remove();

  const report = { reportDate: '', status: '', hours: '', stats: [], notes: [] };

  block.find('h3, h4').each((_, el) => {
    const t = clean($(el).text());
    if (!t) return;
    const m = t.match(/^current date:?\s*(.*)$/i);
    if (m) { report.reportDate = m[1]; return; }
    const pair = t.match(/^([^:]{2,40}):\s*(.*)$/);
    if (pair) { report.stats.push({ label: pair[1].trim(), value: pair[2].trim() }); return; }
    if (!report.status) report.status = t;
    else report.notes.push({ text: t });
  });

  // The table alternates label, value, label, value across each row.
  block.find('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th').toArray().map((td) => clean($(td).text()));
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const label = stripColon(cells[i]);
      if (label) report.stats.push({ label, value: cells[i + 1] });
    }
  });

  // Notes keep their links (e.g. "Download form here"), stored separately from the text.
  block.children('p').each((i, el) => {
    const t = clean($(el).text());
    if (!t) return;
    if (!report.hours && /trail hours/i.test(t)) { report.hours = t; return; }
    const links = $(el).find('a[href]').toArray()
      .map((a) => ({ text: clean($(a).text()), href: $(a).attr('href') }))
      .filter((l) => l.text && /^https?:/.test(l.href));
    report.notes.push(links.length ? { text: t, links } : { text: t });
  });

  if (!report.reportDate && !report.status && !report.stats.length) {
    throw new Error('Found the heading, but no trail report under it');
  }
  return report;
}

async function main() {
  let previous = null;
  try { previous = JSON.parse(await readFile(REPORT_FILE, 'utf8')); } catch {}

  let report;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'LaplandLakeApp/1.0 (reads the daily trail report)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Website answered with status ${res.status}`);
    const parsed = parseReport(await res.text());

    const sameAsBefore = previous && previous.source === url &&
      JSON.stringify({ ...previous, updated: 0, stale: 0, source: 0 }) ===
      JSON.stringify({ ...parsed, updated: 0, stale: 0, source: 0 });
    report = {
      updated: sameAsBefore ? previous.updated : new Date().toISOString(),
      stale: false,
      source: url,
      ...parsed,
    };
    console.log(sameAsBefore ? 'Trail report unchanged.' : 'Trail report changed.');
  } catch (err) {
    console.error(`Could not update the trail report: ${err.message}`);
    if (!previous) process.exit(1);
    report = { ...previous, stale: true };
  }

  if (JSON.stringify(report) !== JSON.stringify(previous)) {
    await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
    console.log('Saved content/trail-report.json');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
