# Lapland Lake Supply Manager

A phone-friendly website for staff supply counts and requests, with a private, password-protected Admin area.
It's a separate section of this repository; the guest app is unchanged.

**Address once published:** https://laplandlake.github.io/lapland-lake-app/supply/

Staff need no account. The Admin area is protected by a password, and the
server checks it.

## How it works (all free)

```
Staff phones / the admin's computer
        │  (the website: GitHub Pages, same as the guest app)
        ▼
Google Apps Script web app  ← runs in the admin's Google account (supply/backend/Code.gs)
        ├── Google Sheet "Lapland Lake Supply Manager Data"  (all records)
        ├── Drive folder "Lapland Lake Supply Manager"       (request photos, backups)
        └── Gmail (MailApp)                                  (weekly beverage email to the admin only)
```

This is the same setup the guest app already uses for guest photos (`scripts/photo-inbox.gs`).
Nothing runs on a paid service.

### Free-service limits (check Google's current quota page before relying on exact numbers)

| Piece | What's free | What it means here |
|---|---|---|
| GitHub Pages | Static hosting for this repository, about 100 GB/month of traffic | Far more than staff use. The site files are public; **no private data is stored in the site or in this repository.** |
| Apps Script web app | Free in a Google account. Each request may run up to 6 minutes; Google limits how many requests run at the same time (about 30) | Each save takes about 1–3 seconds. Fine for a handful of staff counting at once. |
| Google Sheet | 10 million cells per spreadsheet | Years of weekly counts. |
| Drive (photos) | The Google account's storage (15 GB free on personal accounts; Workspace accounts get their plan's storage) | Photos are shrunk to at most 1600 px (~200–400 KB each) before upload. |
| Email (MailApp) | About 100 emails/day on a personal Gmail account, 1,500/day on Google Workspace | One email per finished weekly beverage count. |
| Scheduling | Time-based triggers are free; total trigger run time is limited per day | Only used for the optional weekly Drive backup (Wednesdays about 5 AM). The weekly email needs no schedule: it's sent when a count is marked finished. |

Google's quota page: https://developers.google.com/apps-script/guides/services/quotas

If automatic email ever fails (for example, the quota is used up), the report can always be downloaded
(CSV, print/PDF, Share) and emailed by hand from Admin > Reports.

## Deploy (one time, about 15 minutes)

1. Go to https://script.google.com while signed in to the business Google account and choose **New project**.
   Name it "Lapland Lake Supply Manager".
2. Delete the sample code and paste the whole of `supply/backend/Code.gs`. Save.
3. In the function menu choose **setup** and press **Run**. Approve the permissions (Sheets, Drive,
   email). This creates the data spreadsheet and Drive folder in your account.
4. **Deploy > New deployment > Web app.** Execute as: **Me**. Who has access: **Anyone**. (This is what
   lets staff use it without signing in, the same as the guest photo inbox.) Copy the web app
   address (it ends in `/exec`).
5. On GitHub, open `supply/config.js`, press the pencil, paste the address between the quotes after
   `apiUrl:`, and commit.
6. Publish: merge this branch into `main` (every push to `main` republishes the site, including the
   guest app, which is unchanged).
7. Set your password: in the Apps Script editor choose **createAdminSetupCode** and press **Run**.
   Copy the code from the Execution log, open the Supply Manager, tap **Admin**, and use the
   code to choose your password. **Don't paste your password into a chat or email.** Forgot it? Do
   step 7 again.

After pasting a newer `Code.gs` later: **Deploy > Manage deployments > pencil > Version: New version >
Deploy** (the address stays the same).

## Setup checklist (Admin > Overview shows these ticks)

1. **Password**: step 7 above.
2. **Import the Ginsberg's files**: Admin > Import & backup. Paste the Drive links to *Ginsbergs
   Weekly Ordering*, *deleted items Lapland lake.csv*, *Ginsbergs Graph Data.csv* and the *Ordering and
   Email Reference .txt*. For brands, replacement candidates and Kathy's order-form lines, first open
   *Ginsbergs Ordering Master - 2026-10-11.xlsx* in Drive, choose **File > Save as Google Sheets**, and
   paste that link too. Press **Preview**, check the preview, then **Import**. Everything arrives
   **inactive**.
3. **Active catalog**: Admin > Catalog. For each item staff should count, set the department
   (Housekeeping or Cafe), confirm the **counting unit** ("Count in full cases only", or "Cases + loose
   packs" when the case pack makes that sensible), set the **desired stock** in cases, and tick
   **Active**. The server refuses to activate an item without these. Items you'll never use can be
   **removed** (one at a time, or tick several in the "Inactive" view). Removing hides them and keeps their
   history; "Removed items" > **Restore** brings them back.
4. **Beverage products**: Admin > Beverages. Add each exact beer, cider, wine and craft-soda flavor,
   enter bottles/cans per case, tick **I confirm this case size**, then **Active**.
5. **Drink Cooler list and regular supplies**: Admin > Requests > Supply & drink lists. Assign each
   drink to the Other Supply list or the Beer / Cider / Wine list (staff never see this).
6. **Email recipient**: Admin > Settings. Enter your address and tick the weekly email box. Use
   **Send a test email** only when you want one.
7. **Supplier info**: Admin > Settings. The import fills in the customer number and contacts from the
   reference file if they're blank; check them.
8. **Optional weekly Drive backup**: Admin > Import & backup > **Turn on weekly backup**. (If Google refuses to
   set the timer from the app, the page shows the one-time editor steps: run **installWeeklyDriveBackup**.)

## What staff can and can't do

* Home screen: Housekeeping Orders, Cafe Orders, Other Supply Requests, Drink Cooler, Beer / Cider / Wine.
* Count screens are grouped by storage area in walk-through order (Cafe: Frozen, Refrigerated, Produce,
  Dry & shelf-stable, Kitchen supplies, then Cups, to-go & utensils; Housekeeping: Paper products, Trash &
  cleaning), each with its own color, icon and "6 of 14" progress. Cups, to-go & utensils are kept in two
  places, so each of those items has a **Kitchen** and a **Storage room** box and the app adds them up. An amber
  **Low** badge appears when the entered count is at or below the item's minimum.
* **Suggest…** on each item: **+ Extra for this week** (one-time cases, added to the next draft on top of what the
  count orders), **We need more every week** or **We have too many** (suggestions the admin approves or dismisses; the
  regular amounts never change on their own). The reason is optional.
* **Item not on this list?** at the bottom of a count: item name, optional note and up to 3 photos, sent to the admin.
* After **Finish count** the numbers stay on screen so staff can fix one (for example something sells out): the draft
  updates until the admin marks the order submitted; after that the change is shown to the admin as a notice until the
  Wednesday deadline and noted on next week's draft. While ordering is paused, counts can be fixed until the week ends.
* Lists open instantly from the phone's last copy and update a second later when Google answers.
* Counts save item by item as they're typed ("Saving…", "Saved 10:42", or "Not saved" with **Retry**).
  Blank means "not counted"; 0 is a real count. Leaving and coming back keeps saved counts; unsaved
  typing is also kept on that phone and re-sent.
* Finishing with items uncounted shows a warning but is allowed.
* Requests need an item and a quantity above 0. Unit, note and up to 6 photos are optional.
  **Take photo** opens the camera; **Choose photos** picks several. Photos can be removed before sending.
  If an upload fails, nothing is lost and **Send** retries.
* Staff only ever see "On shopping list" or "Ordered". They can't change statuses, can't see routing,
  prices, supplier details, private notes or photos after sending.

## Security

* Every Admin action is checked on the server with a session token (12 hours, or until sign-out).
  Hiding buttons is never the only protection.
* The password is stored only as a salted PBKDF2-SHA256 hash in the script's private properties.
  It is never in the website, the repository or the spreadsheet.
* 5 wrong attempts pause Admin sign-in for 15 minutes (running `createAdminSetupCode` clears the pause).
* Staff (anonymous) responses contain only the fields staff need. Photos are stored privately in Drive
  and are only sent to a signed-in Admin. There are no public photo links.
* Uploads must really be images (checked by content, max 4 MB after shrinking, 6 per request). Staff
  submissions are rate-limited per hour, and text fields have length limits.
* **Know this:** the web app address is in the public site, so anyone who finds it could submit a
  count or request (that's the cost of "no sign-in for staff"). They can't read or change anything
  private. If abuse ever happens, re-deploy to get a new address.

## Ordering

* **Automatic draft:** each time staff finish a Housekeeping or Cafe count, the app builds (or refreshes)
  one draft for the next Thursday delivery. Finishing a count only refreshes that department's lines, and
  any quantity the admin already changed by hand is kept. **Start a new draft** builds one by hand from the
  latest counts.
* **Reorder rule:** each item has a **minimum** and a **desired stock** (cases). At or below the minimum, the
  draft orders back up to desired stock, rounded up to whole cases; above it, nothing. Items with no minimum
  are ordered whenever they're below desired stock and flagged "No minimum set". Missing counts or settings
  get no suggestion; the admin decides.
* Catalog > **Set up loose counting** suggests loose units for every active item from its case pack
  (96 x CT -> 96 rolls, 4 x 4# -> 4 bags). Items with one pack per case stay full-case only; counts over 120 per case
  start unticked. The admin adjusts the numbers and names, then applies; staff then get a Loose box beside Full cases.
* Catalog > **Fill from notes & Ginsberg's records** fills each active item's minimum from notes like
  "Suggested minimum 2, target 3" and copies the price, purchase history and item # check from the imported
  Ginsberg's record with the same item number (preview first; never overwrites).
* The draft shows the total cases with a progress bar toward the 20-case minimum (below 20 is a warning, still
  allowed), the Wednesday 4:00 PM New York deadline for the Thursday delivery, each line's last known case
  price with its date, and a running dollar total (an estimate; confirm against the current guide or invoice).
  Lines are grouped by department and storage area; items above their minimum are folded away under
  "Not ordering".
* **Ordering paused** (Admin > Settings > Ordering): for the off-season. Counts continue, no drafts are made, the home
  screen says "Ordering paused", and staff extras wait on the admin's Overview instead (they are not carried into the first
  draft when ordering is turned back on).
* Staff extras, count changes after an order was sent, "need more / too many" and items to add appear on the Overview
  and under Requests > **Extras & count notes** / **Add to count list**.
* **The app never sends an order.** Copy, Download CSV, "Open in my email/texts" (your own app opens; you
  press send), Print. Then tick "I have sent this order myself" and **Mark as submitted**.
* Desired stock never changes on its own. Items counted at 0 and staff "need more / too many" suggestions get a box on
  the draft that only takes effect when the admin presses Approve.

## Beverage reports

* Estimated usage = previous count + deliveries recorded between the two count times − current count,
  then minus recorded waste/transfers/returns. This is **inventory depletion, not exact sales**.
* Each product uses its own count timestamps, so a delivery only counts in the interval it happened in.
* Recorded sales (only if the admin enters real numbers) are shown separately and never filled in.
* Missing counts, missing case sizes or a missing earlier count give **Insufficient data**, never zero.
  Negative results and sales higher than depletion are flagged **Needs review**.
* Products with no activity are listed separately from products with missing data.
* Graph + table + CSV download + Share + Print/PDF. Week-by-week graphs per product (craft sodas
  included). The supplier purchase history from Ginsberg's (what was bought, not what was sold) has its
  own report.

## Data sources

* Admin > Import & backup > Import a spreadsheet file brings in any CSV/JSON list (catalog items including
  minimum and desired stock, counts, requests, orders, beverage products), with a preview first.
* **Ginsberg's files:** read for this build (the weekly ordering sheet and its purchase and price tabs,
  the ordering master, deleted items, graph data, the reference text, and the order entry worksheet).
  They're imported by the backend from the admin's Drive when Import is pressed, so no prices, contacts or
  account numbers are stored in this public repository. The order guide PDF, the sales report workbook
  and the invoice PDFs are not parsed directly; their data comes in through the admin's reconciliation sheets
  (weekly ordering + master), which were built from them.
* Existing graph PNGs/PDF stay in Drive; the same numbers appear in Admin > Reports > Ginsberg's purchases.

## Local preview and tests (for developers)

```
cd supply
npm install          # Playwright, for the browser tests only
npm run dev          # http://localhost:8787/supply/?api=http://localhost:8787/api  (Admin password: test-password-123)
npm test             # backend tests (Node)
npm run test:e2e     # phone-width browser tests (360/390/430 px)
```

`node dev/build-demo.mjs out.html` builds a single-file clickable preview with TEST data (the backend
runs inside the page; nothing is sent anywhere).

The local preview runs the real `backend/Code.gs` against an in-memory stand-in for Google Sheets,
Drive and Gmail, with disposable TEST data. It never contacts Google or sends email.
