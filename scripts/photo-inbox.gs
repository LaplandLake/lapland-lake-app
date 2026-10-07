/* Lapland Lake guest photo inbox (Google Apps Script).
   Runs in Todd's Google account (todd@laplandlake.com). It:
   - receives photos guests send from the app's Guest Photos screen,
   - saves them in Google Drive: "Lapland Lake App Photos" > "To Review",
   - emails Todd once a day with that day's new photos.
   - shows the photos in the "Approved" folder in the app's gallery, newest first.
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
  // About 4:30 pm (Google runs it within 15 minutes of that)
  ScriptApp.newTrigger('dailyEmail').timeBased().everyDays(1).atHour(16).nearMinute(30).inTimezone('America/New_York').create();
  Logger.log('All set. Folders are in your Drive under "' + MAIN_FOLDER + '".');
}

// The app asks for the approved photos (newest first) to show in its gallery.
// Approved photos are shared "anyone with the link" so phones can load them.
function doGet(e) {
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
