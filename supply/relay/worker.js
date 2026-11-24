/* Lapland Lake Supply Manager: relay for AI connections (Cloudflare Worker).

   Why it exists: an AI connection (a "connector" in Claude) sends its messages by POST and
   expects the answer straight back. Google Apps Script answers every POST by forwarding to a
   second address, and Claude will not follow that. This relay stands in between: it takes the
   AI's message, carries it to the Apps Script door, follows Google's forwarding, and hands the
   answer back.

   What it holds: nothing. No data and no keys. It only passes messages. Every check (which key,
   what is allowed, saved once, who did it) happens in the Apps Script door (supply/backend/Code.gs,
   "AI door").

   Setup: in the Worker's Settings > Variables and Secrets, add DOOR_URL = the Apps Script web app
   address (it ends in /exec). The connection address for an AI is then
       https://<this worker's address>/mcp?key=<that AI's key>
   The key may also be sent the hidden way, in an "Authorization: Bearer <key>" or "x-api-key"
   header, when the AI's settings offer a place for it. */

const MAX_BODY = 200000; // characters; a count message is a few hundred

function reply(status, obj, extra) {
  return new Response(obj === null ? null : JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extra || {}),
  });
}
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/mcp') return reply(404, { error: 'Not found.' });
    // The door only answers messages that are sent to it; it never opens a stream of its own.
    if (request.method !== 'POST') return reply(405, { error: 'Send messages with POST.' }, { allow: 'POST' });
    if (!env || !env.DOOR_URL) return reply(500, rpcError(null, -32603, 'The relay is not set up yet: DOOR_URL is missing.'));

    const auth = request.headers.get('authorization') || '';
    const key = (/^Bearer\s+(.+)$/i.exec(auth) || [])[1] || request.headers.get('x-api-key') || url.searchParams.get('key') || '';

    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, rpcError(null, -32600, 'The message is too long.'));
    let msg;
    try { msg = JSON.parse(text); } catch (err) { return reply(400, rpcError(null, -32700, 'The message could not be read.')); }
    const id = msg && !Array.isArray(msg) && msg.id !== undefined ? msg.id : null;

    const door = new URL(env.DOOR_URL);
    door.searchParams.set('key', key.trim());
    let res;
    let body;
    try {
      // Apps Script answers with a redirect to a one-time address; "follow" goes and gets the answer.
      res = await fetch(door.toString(), { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: text, redirect: 'follow' });
      body = await res.text();
    } catch (err) {
      return reply(502, rpcError(id, -32603, 'The relay could not reach the Supply Manager. Try again in a moment.'));
    }
    if (!res.ok) return reply(502, rpcError(id, -32603, 'The Supply Manager did not answer (' + res.status + '). Try again in a moment.'));
    // Nothing to say back (the message was a notice): the standard answer is "accepted", with no body.
    if (body.trim() === '') return new Response(null, { status: 202 });
    try { JSON.parse(body); } catch (err) {
      return reply(502, rpcError(id, -32603, 'The Supply Manager sent back something the relay could not read. Check that DOOR_URL is the web app address ending in /exec, and that the web app is shared with "Anyone".'));
    }
    return reply(200, JSON.parse(body));
  },
};
