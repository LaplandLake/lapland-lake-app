// Local preview: serves the app and runs backend/Code.gs against fake Google services.
//   node supply/dev/server.mjs [--port 8787] [--data path/to/state.json] [--seed demo]
// Then open http://localhost:8787/supply/?api=http://localhost:8787/api
// Test hooks under /__test/ exist only here, never in the real backend.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBackend, createPlatform } from './platform.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const port = Number(opt('port', 8787));
const dataFile = opt('data', '');
const seed = opt('seed', '');

const backend = loadBackend();
let env;
function boot(saved) {
  env = createPlatform(backend, Object.assign({}, saved || {}, { onWrite: persist }));
  backend.setPlatform_(env.platform);
}
function persist() {
  if (dataFile) fs.writeFileSync(dataFile, JSON.stringify(env.snapshot()));
}
boot(dataFile && fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : null);
if (seed === 'demo' && !(dataFile && fs.existsSync(dataFile))) {
  const { seedDemo } = await import('./seed-demo.mjs');
  seedDemo(backend, env);
  persist();
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 60e6) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(body);
}

const delay = { ms: Number(opt('delay', 0)) };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    // Like Apps Script: no answer to CORS preflight, so the app must only send simple requests.
    if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }
    if (url.pathname === '/api' && req.method === 'POST') {
      const text = await readBody(req);
      if (delay.ms) await new Promise((r) => setTimeout(r, delay.ms));
      if (env.state.offline) { req.socket.destroy(); return; }
      let body;
      try { body = JSON.parse(text); } catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: { code: 'invalid', message: 'The request could not be read.' } })); }
      return send(res, 200, JSON.stringify(backend.handleApi_(body)));
    }
    if (url.pathname.startsWith('/__test/')) {
      const what = url.pathname.slice(8);
      const q = Object.fromEntries(url.searchParams);
      if (what === 'failPhotos') env.state.failNextPhotos = Number(q.n || 1);
      else if (what === 'failMail') env.state.failMail = q.on === '1';
      else if (what === 'failBackup') env.state.failBackupInstall = q.on === '1';
      else if (what === 'offline') env.state.offline = q.on === '1';
      else if (what === 'clock') env.state.clock = q.t ? new Date(q.t).getTime() : null;
      else if (what === 'delay') delay.ms = Number(q.ms || 0);
      else if (what === 'inboxFile') env.state.inboxFiles.push({ id: 'f' + Date.now(), name: q.name || 'count.csv', text: q.text || '' });
      else if (what === 'setupCode') { backend.setPlatform_(env.platform); return send(res, 200, JSON.stringify({ code: backend.createAdminSetupCode() })); }
      else if (what === 'mail') return send(res, 200, JSON.stringify(env.state.sentMail));
      else if (what === 'reset') { boot(null); if (q.seed === 'demo') { const { seedDemo } = await import('./seed-demo.mjs'); seedDemo(backend, env); } }
      else if (what === 'snapshot') return send(res, 200, JSON.stringify(env.snapshot()));
      else return send(res, 404, '{}');
      return send(res, 200, '{"ok":true}');
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') { res.writeHead(302, { Location: '/supply/' }); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root) || /[\\/](\.git|node_modules)[\\/]/.test(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (err) {
    console.error(err);
    return send(res, 500, JSON.stringify({ ok: false, error: { code: 'server', message: String(err) } }));
  }
});
server.listen(port, () => console.log('Supply Manager preview: http://localhost:' + port + '/supply/?api=http://localhost:' + port + '/api'));
