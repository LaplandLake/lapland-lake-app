/* Lapland Lake: TEST DOOR (throwaway).

   A tiny stand-alone Apps Script project, separate from the Supply Manager. It holds no
   Lapland data and can be deleted when the test is over. It answers one question: can
   Claude (and Duet) connect straight to a Google Apps Script door?

   How to use it:
     1. script.google.com > New project > paste this whole file. Save.
     2. Run "makeTestKey" and copy the "?key=..." line from the Execution log.
     3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
     4. Connection address = the web app address + the "?key=..." line.
   If Claude can't connect, run "showTestLog" to see what reached the door. */

const DOOR_NAME = 'Lapland test door';
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

// The two things an AI can do at this door. Both are pretend; neither touches real data.
const TOOLS = [
  {
    name: 'test_hello',
    description: 'Test only. Checks that the Lapland test door can be reached and whether the key arrived. Touches no real data.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'test_save_count',
    description: 'Test only. Saves one pretend count (an item and a number of cases) in the test door\'s own scratch space, and says which pretend count was saved before it. Touches no real data.',
    inputSchema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item name, in any words.' },
        cases: { type: 'number', description: 'How many cases.' },
      },
      required: ['item', 'cases'],
      additionalProperties: false,
    },
  },
];

/* ---------------------------------------------------------------- the door */

// An AI's connection "knocks" here with a small message; the door sends one message back.
function doPost(e) {
  const key = keyState_(e);
  let msg = null;
  try {
    msg = JSON.parse(e.postData.contents);
  } catch (err) {
    note_('POST', 'unreadable message', key);
    return out_({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The message could not be read.' } });
  }
  if (Array.isArray(msg)) {
    const replies = msg.map((m) => answer_(m, key)).filter((r) => r !== null);
    return replies.length ? out_(replies) : out_('');
  }
  const reply = answer_(msg, key);
  return reply === null ? out_('') : out_(reply);
}

// Opening the address in a browser shows that the door exists. It gives nothing else away.
function doGet(e) {
  note_('GET', 'address opened', keyState_(e));
  return out_({ ok: true, door: DOOR_NAME });
}

function answer_(m, key) {
  const method = m && typeof m.method === 'string' ? m.method : '';
  const isNote = !m || m.id === undefined || m.id === null;
  note_('POST', method + (method === 'tools/call' && m.params ? ' ' + m.params.name : ''), key);
  if (isNote) return null; // a notice from the AI's side; no reply is expected
  const ok = (result) => ({ jsonrpc: '2.0', id: m.id, result });
  const no = (code, message) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } });
  const say = (text, isError) => ok({ content: [{ type: 'text', text }], isError: !!isError });

  if (method === 'initialize') {
    const asked = m.params && m.params.protocolVersion;
    return ok({
      protocolVersion: VERSIONS.indexOf(asked) >= 0 ? asked : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: DOOR_NAME, version: '0.1' },
      instructions: 'This is a test door with pretend tools only. It holds no real data.',
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    const name = m.params && m.params.name;
    const args = (m.params && m.params.arguments) || {};
    if (name === 'test_hello') {
      const about = {
        ok: 'The key arrived and is correct.',
        wrong: 'A key arrived, but it is not the right one.',
        none: 'No key arrived.',
        'not-made': 'No key has been made yet (run makeTestKey).',
      }[key];
      return say('The Lapland test door is open. ' + about);
    }
    if (name === 'test_save_count') {
      if (key !== 'ok') return say('Refused: the key is missing or wrong. Nothing was saved.', true);
      const item = String(args.item === undefined ? '' : args.item).trim().slice(0, 100);
      const cases = Number(args.cases);
      if (!item || !isFinite(cases) || cases < 0 || cases > 9999) {
        return say('Not saved: it needs an item name and a number of cases (0 or more).', true);
      }
      const props = PropertiesService.getScriptProperties();
      const before = props.getProperty('LAST_COUNT');
      props.setProperty('LAST_COUNT', JSON.stringify({ item, cases, at: stamp_() }));
      let was = 'There was no pretend count before this one.';
      if (before) {
        const b = JSON.parse(before);
        was = 'The pretend count before this one was ' + b.cases + ' cases of ' + b.item + ' (' + b.at + ').';
      }
      return say('Saved a pretend count: ' + cases + ' cases of ' + item + '. ' + was);
    }
    return no(-32602, 'This door has no tool with that name.');
  }
  return no(-32601, 'This door does not do that.');
}

/* ---------------------------------------------------------------- helpers */

function out_(obj) {
  return ContentService.createTextOutput(obj === '' ? '' : JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function stamp_() {
  return Utilities.formatDate(new Date(), 'America/New_York', 'MMM d, h:mm:ss a');
}

// Did the key in the connection address arrive, and is it the right one?
function keyState_(e) {
  const real = PropertiesService.getScriptProperties().getProperty('TEST_KEY');
  if (!real) return 'not-made';
  const sent = e && e.parameter && e.parameter.key ? String(e.parameter.key) : '';
  if (!sent) return 'none';
  return sent === real ? 'ok' : 'wrong';
}

// Keeps the last 30 knocks, so we can see what reached the door. The key itself is never kept.
function note_(how, what, key) {
  try {
    const props = PropertiesService.getScriptProperties();
    const log = JSON.parse(props.getProperty('LOG') || '[]');
    log.push(stamp_() + ' | ' + how + ' | ' + (what || '(nothing)') + ' | key: ' + key);
    props.setProperty('LOG', JSON.stringify(log.slice(-30)));
  } catch (err) { /* the log is only a help; never let it break an answer */ }
}

/* ---------------------------------------------------------------- run these from the editor */

// Makes the test key (once) and shows the piece to add to the end of the web app address.
function makeTestKey() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('TEST_KEY');
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TEST_KEY', key);
  }
  Logger.log('Add the next line to the end of your web app address, with no space in between:');
  Logger.log('?key=' + key);
}

// Shows the last 30 knocks at the door. Safe to copy into a chat: it never contains the key.
function showTestLog() {
  const log = JSON.parse(PropertiesService.getScriptProperties().getProperty('LOG') || '[]');
  Logger.log(log.length ? log.join('\n') : 'Nothing has reached the door yet.');
}
