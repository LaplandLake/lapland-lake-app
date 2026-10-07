/* Lapland Lake guest photo inbox (Google Apps Script).
   Runs in Todd's Google account (todd@laplandlake.com). It:
   - receives photos guests send from the app's Guest Photos screen,
   - saves them in Google Drive: "Lapland Lake App Photos" > "To Review",
   - emails Todd once a day with every photo waiting for review, each with
     an Approve and a Delete button (one tap, no Drive needed),
   - shows the photos in the "Approved" folder in the app's gallery, newest first.
   Nothing appears in the app until it's approved. (Dragging a photo into the
   "Approved" folder in Drive works too.)

   One-time setup: paste this whole file into a new project at script.google.com,
   run "setup" once, then Deploy > New deployment > Web app
   (Execute as: Me, Who has access: Anyone). */

const REVIEW_EMAIL = 'todd@laplandlake.com';
const MAIN_FOLDER = 'Lapland Lake App Photos';
const MAX_PHOTO_CHARS = 12 * 1024 * 1024; // the app sends photos well under this

function setup() {
  const main = folder_(DriveApp, MAIN_FOLDER);
  folder_(main, 'To Review');
  folder_(main, 'Approved');
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  // About 4:30 pm (Google runs it within 15 minutes of that)
  ScriptApp.newTrigger('dailyEmail').timeBased().everyDays(1).atHour(16).nearMinute(30).inTimezone('America/New_York').create();
  Logger.log('All set. Folders are in your Drive under "' + MAIN_FOLDER + '".');
}

// The app asks for the approved photos (newest first) to show in its gallery.
// Approved photos are shared "anyone with the link" so phones can load them.
function doGet(e) {
  if (e && e.parameter.action) return review_(e.parameter);
  if (!e || !e.parameter.list) return reply_('ok');
  const approved = folder_(folder_(DriveApp, MAIN_FOLDER), 'Approved').getFiles();
  const photos = [];
  while (approved.hasNext()) {
    const f = approved.next();
    if (!/^image\//.test(f.getMimeType())) continue;
    try {
      if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) {
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }
    } catch (err) {} // if sharing is blocked, the photo still lists; it just won't load for guests
    photos.push({
      src: 'https://lh3.googleusercontent.com/d/' + f.getId() + '=w1200',
      date: Utilities.formatDate(f.getDateCreated(), 'America/New_York', 'yyyy-MM-dd'),
      by: (f.getDescription() || '').replace(/^Credit:\s*/, ''),
      time: f.getDateCreated().getTime(),
    });
  }
  photos.sort((a, b) => b.time - a.time);
  const out = photos.slice(0, 40).map(({ src, date, by }) => ({ src, date, by }));
  return ContentService.createTextOutput(JSON.stringify({ photos: out })).setMimeType(ContentService.MimeType.JSON);
}

// The app sends one message per photo, then (optionally) one with the guest's name.
function doPost(e) {
  try {
    const msg = JSON.parse(e.postData.contents);
    const batch = String(msg.batch || '').replace(/[^a-z0-9]/gi, '').slice(0, 20);
    const review = folder_(folder_(DriveApp, MAIN_FOLDER), 'To Review');

    if (msg.type === 'photo') {
      if (typeof msg.photo !== 'string' || msg.photo.length > MAX_PHOTO_CHARS) return reply_('too big');
      const stamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HHmmss');
      const blob = Utilities.newBlob(Utilities.base64Decode(msg.photo), 'image/jpeg', stamp + ' ' + batch + '.jpg');
      review.createFile(blob);
      return reply_('ok');
    }

    if (msg.type === 'credit') {
      const credit = String(msg.credit || '').slice(0, 80);
      const files = review.searchFiles('title contains "' + batch + '"');
      while (files.hasNext()) files.next().setDescription('Credit: ' + credit);
      return reply_('ok');
    }
    return reply_('unknown');
  } catch (err) {
    return reply_('error');
  }
}

// Once a day: one email with every photo waiting for review, each with
// Approve and Delete buttons. Nothing is sent when nothing is waiting.
function dailyEmail() {
  const review = folder_(folder_(DriveApp, MAIN_FOLDER), 'To Review');
  const files = review.getFiles();
  const waiting = [];
  while (files.hasNext()) waiting.push(files.next());
  if (!waiting.length) return;
  waiting.sort((a, b) => a.getDateCreated() - b.getDateCreated());

  const url = ScriptApp.getService().getUrl();
  const link = (action, ids) => url + '?action=' + action + '&ids=' + ids.join(',') + '&key=' + key_();
  const button = (href, text, color) =>
    '<a href="' + href + '" style="display:inline-block;padding:10px 18px;margin:4px 8px 4px 0;border-radius:8px;' +
    'background:' + color + ';color:#fff;font-weight:bold;text-decoration:none;font-size:16px">' + text + '</a>';

  const shown = waiting.slice(0, 20);
  const images = {};
  const html = shown.map((f, i) => {
    images['p' + i] = f.getBlob();
    const sent = Utilities.formatDate(f.getDateCreated(), 'America/New_York', 'EEE MMM d, h:mm a');
    const credit = f.getDescription() ? ' · ' + f.getDescription() : '';
    return '<div style="margin:0 0 28px"><img src="cid:p' + i + '" width="320" style="border-radius:8px"><br>' +
      '<small>' + sent + credit + '</small><br>' +
      button(link('approve', [f.getId()]), '✓ Approve', '#0b6e76') +
      button(link('delete', [f.getId()]), '✗ Delete', '#9b2c2c') + '</div>';
  }).join('');
  const all = shown.length > 1
    ? '<p>' + button(link('approve', shown.map((f) => f.getId())), '✓ Approve all ' + shown.length, '#0b6e76') + '</p>' : '';
  const more = waiting.length > shown.length
    ? '<p>…and ' + (waiting.length - shown.length) + ' more. They\'ll be in tomorrow\'s email.</p>' : '';

  MailApp.sendEmail({
    to: REVIEW_EMAIL,
    subject: 'Lapland Lake app: ' + waiting.length + ' guest photo' + (waiting.length > 1 ? 's' : '') + ' to review',
    htmlBody: '<p>Tap <b>Approve</b> to put a photo in the app, or <b>Delete</b> to get rid of it.</p>' +
      all + html + more,
    inlineImages: images,
  });
}

// The Approve / Delete buttons in the email land here.
function review_(p) {
  if (p.key !== key_()) return page_('Sorry, that link didn\'t work.');
  const main = folder_(DriveApp, MAIN_FOLDER);
  const review = folder_(main, 'To Review');
  const approved = folder_(main, 'Approved');
  let done = 0;
  String(p.ids || '').split(',').filter(Boolean).forEach((id) => {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.getParents().hasNext()) return;
      if (p.action === 'approve') { f.moveTo(approved); done++; }
      if (p.action === 'delete') { f.setTrashed(true); done++; }
    } catch (err) {} // already handled or gone
  });
  const plural = done === 1 ? 'photo' : 'photos';
  if (p.action === 'approve') return page_(done ? '✓ Approved ' + done + ' ' + plural + '. ' + (done === 1 ? 'It\'s' : 'They\'re') + ' in the app now.' : 'Already approved.');
  return page_(done ? '✗ Deleted ' + done + ' ' + plural + '.' : 'Already deleted.');
}

function page_(message) {
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:sans-serif;font-size:22px;text-align:center;padding:60px 20px">' + message +
    '<p style="font-size:16px;color:#555">You can close this page.</p></div>');
}

// A private key so only the links in Todd's email can approve or delete photos.
function key_() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, ''); props.setProperty('KEY', key); }
  return key;
}

function folder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function reply_(status) {
  return ContentService.createTextOutput(JSON.stringify({ status })).setMimeType(ContentService.MimeType.JSON);
}
