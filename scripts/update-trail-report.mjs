/* Copies the daily trail report from the Lapland Lake website into
   content/trail-report.json, which the app displays.

   Runs automatically on GitHub (see .github/workflows/site.yml).
   - Only rewrites the file when the report text actually changes, so
     "Last updated" means "when the report last changed".
   - If the website can't be reached or the report can't be found, the
     previous report is kept and marked as possibly out of date.

   Settings live in content/settings.json:
     trailReportUrl       the page to read
     trailReportSelector  which part of the page holds the report
*/
import { readFile, writeFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';

const REPORT_FILE = 'content/trail-report.json';
const settings = JSON.parse(await readFile('content/settings.json', 'utf8'));
const url = process.env.TRAIL_REPORT_URL || settings.trailReportUrl;

// Tried in order; the first one that exists on the page is used.
const SELECTORS = [settings.trailReportSelector, 'main .entry-content', '.entry-content', 'article', 'main'].filter(Boolean);

// Turns the report's HTML into plain text, keeping paragraphs and list items on their own lines.
function extractReport(html) {
  const $ = cheerio.load(html);
  const selector = SELECTORS.find((s) => $(s).length);
  if (!selector) return '';
  const root = $(selector).first();
  root.find('script, style, noscript, iframe, form, nav, header, footer, svg, img').remove();
  root.find('br').replaceWith('\n');
  root.find('li').each((_, el) => { $(el).prepend('• '); });
  root.find('p, div, li, h1, h2, h3, h4, h5, h6, tr, section').each((_, el) => { $(el).append('\n'); });
  return root.text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let previous = null;
try { previous = JSON.parse(await readFile(REPORT_FILE, 'utf8')); } catch {}

let report;
try {
  const res = await fetch(url, {
    headers: { 'user-agent': 'LaplandLakeApp/1.0 (reads the daily trail report)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Website answered with status ${res.status}`);
  const text = extractReport(await res.text());
  if (text.length < 40) throw new Error('Could not find the trail report on the page');

  const changed = !previous || previous.text !== text || previous.source !== url;
  report = {
    updated: changed ? new Date().toISOString() : previous.updated,
    stale: false,
    source: url,
    text,
  };
  console.log(changed ? 'Trail report changed.' : 'Trail report unchanged.');
} catch (err) {
  console.error(`Could not update the trail report: ${err.message}`);
  if (!previous) process.exit(1);
  report = { ...previous, stale: true };
}

if (JSON.stringify(report) !== JSON.stringify(previous)) {
  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  console.log('Saved content/trail-report.json');
}
