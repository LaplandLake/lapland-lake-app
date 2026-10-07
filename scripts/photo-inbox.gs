/* Lapland Lake guest photo inbox (Google Apps Script).
   Runs in Todd's Google account (todd@laplandlake.com). It:
   - receives photos guests send from the app's Guest Photos screen,
   - saves them in Google Drive: "Lapland Lake App Photos" > "To Review",
   - emails Todd once a day with that day's new photos.
   Good photos: move them into the "Approved" folder. Nothing appears in the app until then.

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
  ScriptApp.newTrigger('dailyEmail').timeBased().everyDays(1).atHour(19).create();
  Logger.log('All set. Folders are in your Drive under "' + MAIN_FOLDER + '".');
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

// Once a day: one email with the new photos, so reviewing takes a minute.
function dailyEmail() {
  const main = folder_(DriveApp, MAIN_FOLDER);
  const review = folder_(main, 'To Review');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const files = review.getFiles();
  const fresh = [];
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated() > since) fresh.push(f);
  }
  if (!fresh.length) return;

  const shown = fresh.slice(0, 20);
  const images = {};
  const html = shown.map((f, i) => {
    images['p' + i] = f.getBlob();
    const credit = f.getDescription() ? '<br>' + f.getDescription() : '';
    return '<p><img src="cid:p' + i + '" width="300"><br><small>' + f.getName() + credit + '</small></p>';
  }).join('');
  const more = fresh.length > shown.length ? '<p>…and ' + (fresh.length - shown.length) + ' more in the folder.</p>' : '';

  MailApp.sendEmail({
    to: REVIEW_EMAIL,
    subject: 'Lapland Lake app: ' + fresh.length + ' new guest photo' + (fresh.length > 1 ? 's' : ''),
    htmlBody: '<p>New guest photos today. To approve one, move it from "To Review" into "Approved":<br>' +
      '<a href="' + review.getUrl() + '">Open the To Review folder</a></p>' + html + more,
    inlineImages: images,
  });
}

function folder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function reply_(status) {
  return ContentService.createTextOutput(JSON.stringify({ status })).setMimeType(ContentService.MimeType.JSON);
}
