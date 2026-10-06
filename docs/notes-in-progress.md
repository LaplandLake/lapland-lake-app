# Work in progress (notes for the next session)

Last updated: 2026-10-05. These are notes from working with the owner's team, so a new session can pick up where we left off. Nothing here is shown in the app.

## How we work
- We're in "tweaking mode": the team gives notes, Claude says what it will change, shows a phone-size preview screenshot, and only publishes when told "publish".
- Drafts go on a separate branch; publishing = merging into `main` (every push to `main` republishes the site).
- Ask before making visible changes. Don't fill placeholders or add features without checking first.
- Live app: https://laplandlake.github.io/lapland-lake-app/ (GitHub user renamed from Tssngs75 to LaplandLake on 2026-10-05; old address no longer works).

## Lodge Map (not built yet)
Decided: a simple labeled **diagram** of the lodge (Lounge, Café upstairs, Bathrooms, Sauna, Rentals, Wax Room, etc.); tapping an area shows a **photo** of it. The app currently uses no photos besides the logo and trail map. Owner is taking inside photos.

The owner has professional promo photos (cleared for Lapland Lake use) covering many lodge areas; they'll send them labeled by area. Resize/compress for weak connections before adding to the app.

**Promo photos:** 8 lodge photos by Cody Updike (Roost shoot, winter 2026) are saved in `docs/photos/promo/` at 675x450 (the Drive "Roost Photos 2025 Low quality" versions): lounge, first-floor-tables, cafe-counter (2nd floor), cafe-tables (2nd floor), cafe-tables-2 (2nd floor), rental-desk, rentals, outside. Full-size originals are in Drive under Roost photos (Mid quality) and the owner's "APP PICS" folder; they're 25-47 MB, too large for the Drive connector. 675 px is fine for small photos in the app; if sharper versions are wanted later, ask for ~1,600 px wide copies. Don't ask for full-size originals. Attaching photos in chat works well: they arrive at ~2,000 px wide (e.g. `lounge-woodstove-2000.jpg`, skiers warming hands at the wood stove). Replace the 675 px versions as sharper copies arrive.

Photo permissions: the lounge photo (`lodge-lounge-inside.jpg`) is cleared for use; the two outside photos were taken by the owner's team.

Front of the building, doors numbered left to right (photos: `docs/photos/lodge-front.jpg`, `docs/photos/lodge-door-1-lounge.jpg`):
1. **Far-left door** (Welcome sign, Olavi Hirvonen memorial plaque, large trail map sign, new wooden ramp with railing = step-free entrance)
   - Opens into the **lounge / common room**: wood stove, couch, chairs, loveseats around the fire, tables.
   - Inside photo: `docs/photos/lodge-lounge-inside.jpg` (professional shot: wood stove, leather couch, tapestry, two skiers). Use for the Lounge; permission confirmed.
   - Inside, immediately to the right: **stairs up to the café** (probably the Kuuma Feeding Station; confirm).
   - Walking in (photo `docs/photos/lodge-door-1-inside-seating.jpg`): a **downstairs seating area** with long benches, a bookshelf with books and puzzles, and cabinets.
   - Straight ahead, **down 2 stairs**: the **downstairs bathrooms** are on the left. Keep going straight, then right: the **sauna**, which is **for lodging guests only**. (Bathrooms are not step-free; don't label them accessible unless told otherwise.)
   - **Winter: portajohns** outside, around the building's left corner (past door 1).
   - Close-up of door 1 with the Welcome sign and Olavi Hirvonen plaque: `docs/photos/lodge-door-1-closeup.jpg`.
2. **Middle door**: opens into the **retail shop** with the **cash register** (pay for things downstairs) and the **reservation desk** (lodging check-in / check-out).
3. **Second door from right**: sign over door reads **RENTAL RETURNS** (photo `outside-rental-returns-wax-room.jpg`).
4. **Far-right door**: sign reads **WAX ROOM / TELEPHONE / MESSAGE BOARD** (confirmed from photo).

Open questions: name for the lounge room; whether the café = Kuuma Feeding Station; what's behind doors 2-4; ticket/check-in, rentals location.

## Trail map
- Current map is the 2011 PDF; owner says it's outdated and wants a new one.
- Plan: get GPX tracks, draw a new map with each trail as its own tappable line.
- Paul (owner) and a staff member are requesting **Trailforks region admin** for "Lapland Lake Cross Country Ski Center" (draft request message was written in chat). Once approved, they'll download trail GPX files. Don't scrape Trailforks/Strava/AllTrails data; use files the owner or their instructors export.
- The large trail map sign on the lounge wall may be a newer version; asked whether a digital file exists.
- Still to add: Ski School Areas and the two shortcuts (owner said fix later).
- **Future: GPS "you are here" dot** (owner is excited about this). Order: Trailforks admin → GPX files → new map drawn from real coordinates → "Show my location" button (browser Geolocation, permission prompt, location stays on the phone) → on-site test walking a couple of trails. The 2011 map is not to scale, so GPS can't go on it. Possible extras: current trail name, facing direction, distance back to the lodge.

## App stores (discussed, not started)
- Google Play: realistic via a wrapped web app (Trusted Web Activity). Needs $25 one-time developer account, privacy policy, store listing, and a verification file on the domain (easier with app.laplandlake.com). Would also avoid the Samsung Play Protect warning.
- Apple App Store: $99/year, harder; risk of rejection for "just a website". App-only features like the GPS dot or grooming alerts would help. Suggested: Google Play first, Apple later.

## Menu
- Café closed mode: `titleNote` in `content/menu.json` ("Closed until Ski Season") shows "Café Menu · Closed until Ski Season". Remove that line when the café opens.
- The Soup of the Day card always shows. It shows the soup name only when `content/soup.json` has today's date (and the café isn't closed); otherwise it shows a dash "—".
- Lessons button: `lessonsUrl` in `content/settings.json` is FareHarbor item 328289 (lessons calendar), tracking codes removed.
- **Menu prices published (2026-10-06)** from last season's café chalkboards (photo `docs/photos/promo/cafe-counter.jpg`), including salads, breakfast, snacks, scones and cinnamon rolls. Blank (no price shown): chili, mac and cheese, soup (cup $5.__/bowl $7.__), decorated sugar cookies, NA beer, all snacks. Muffin $4.50 was smudged. The café chalkboards have been erased for the off-season, so **this year's prices wait until the season starts**; then get a photo of the boards and update `content/menu.json`.

## Lodging
- "Lodge With Us" opens RezStream. Owner chose to keep it simple for now.
- Possible later: list of the 12 units (2 studios, 9 tupas, Lapin farmhouse) from laplandlake.com/lodging, each linking to its RezStream page.

## Other ideas mentioned
- Custom address app.laplandlake.com (needs a CNAME record from whoever manages the domain).
- Accessibility: automated WCAG check passed except trail-map symbols overlapping when zoomed out (trail list provides the same function). Suggested a phone screen-reader test.
- Samsung Internet shows a false Play Protect warning when installing; the app shows Samsung users a tip to install from Chrome.

- All lodge promo photos in `docs/photos/promo/` are now sharp 2,000 px versions (lounge, lounge-woodstove-2000, first-floor-tables, cafe-counter, cafe-tables, cafe-tables-2, rental-desk, rentals, retail-shop-2000, retail-shop-2-2000, outside, outside-sunny, outside-rental-returns-wax-room). The cafe-counter photo shows chalkboard menus with real prices; offered to use them for the menu, waiting on the owner's OK.

## Guest photo uploads (planned, not started — do after the lodge map)
- Idea: guests upload photos in the app; Lapland Lake can use them afterward.
- Uses: **all** — social media, website, and a guest gallery in the app.
- Flow agreed in principle: guest picks photos, enters name + email (and optional photo credit), checks a permission box → photos go to a private folder → **AI screens** (reject inappropriate; also blurry/dark/duplicates) → owner approves.
- Approval: owner will check **once a day**: send a **daily email digest** (only on days with new photos that passed AI screening). Originally suggested a weekly email digest with thumbnails and Approve/Skip buttons; approved photos go to the in-app gallery and an "Approved" folder. Nothing goes public without approval.
- Accounts/storage: owner created a dedicated **"Todd's AI" Gmail account** for AI-related services. Use its Google Drive for uploads and send the digest via it. (Get the address from the owner when building.)
- Needs: a small upload/receiving service (the app is static on GitHub Pages and can't accept files), an AI provider account for screening (low cost; confirm current pricing), consent wording (have someone at the business review it), and a rule about photos of other people/kids.

## Lodge layout, walkthrough from the owner (2026-10-06)
**Outside door 1 (ramp door):** around the outside corner to the left are usually **two porta-johns** (for people in a hurry, COVID-cautious guests, and race days with lots of kids).

**Inside door 1, downstairs seating area** (the front door is behind you):
- **Immediately left:** recycling cans and a garbage can, then a shelf with magazines.
- **Left side:** **cubbies** for storing gear (in summer, two library bookshelves; removed in winter), then the **picnic tables** ("tables") by the sunny window. Many people eat lunch here.
- **Immediately right:** another table; beyond it, a **doorway to the stairs up to the café** (two short sections of stairs; owner has photos).
- **Right of the picnic tables:** the **wood stove lounge** with a leather couch, leather chair and leather loveseat. A walkway runs between the lounge and the picnic tables, straight to the back of the building.
- **At the back, down 2 steps:** on the left, the **men's room**, then a separate **ladies' room**. A step or two further straight, on the right: the **Lodging Guest Sauna** (with a shower), **for lodging guests only**.
- **To the retail shop:** a few steps in from door 1, turn right and walk along the wall (the outside of the stairway), with the leather couches on your left, then through a doorway into the **retail shop**. The retail shop is where door 2 comes in.

**Door 1 photos (owner, Oct 2026):** `docs/photos/door1-inside-straight.jpg` (straight in: bookshelves on left, picnic tables, hallway at back right to the restrooms down 2 steps), `door1-inside-left-recycling.jpg` (left: bins for deposit bottles/cans and other recyclables, trash, cabinets, bookshelves, window), `door1-inside-right-lounge.jpg` (right: wood stove lounge with leather loveseat, benches, posts; hallway to restrooms on the far left; a "Ski School / Lapland Lake / To Lodge" sign and fire extinguisher by a doorway on the right).

Confirmed: the doorway on the far right of the lounge (by the fire extinguisher and "Ski School / To Lodge" sign) leads into the **retail shop**.
**Stairs to the café** (photos `door1-inside-right-cafe-door.jpg`, `cafe-stairs-1.jpg`, `cafe-stairs-2.jpg`): just inside door 1 to the right, past a table, is a white door; behind it is a short carpeted flight with a handrail, a landing (Ski Patrol raffle poster), then a second flight up to the café counter. Not step-free.

**Upstairs (café level):**
- At the top of the stairs: a **soda machine** on the right; the **café counter** straight ahead.
- **To the right of the counter:** more **bathrooms**.
- Lots of seating for eating.
- There are **two shower rooms upstairs**, but **they are not advertised**. Don't show them in the app.

**Retail shop (door 2), walking in from outside:**
- The doorway from the lounge is on your **left**.
- **Straight ahead:** snowshoes for sale on the left; apparel, hats, pants, coats and socks on the right.
- **Just past the lounge doorway, on the left:** ski gear for sale (skis and boots).
- **Straight ahead, up one step, on the right:** the **reservation desk** (lodging check-in / check-out).
- **Beyond the reservation desk (staff only):** Todd's and Paul's offices, and a back stairway up to the back of the café, other offices and storage. Not for guests.
- **About 45° to the right as you come in:** a counter with items for sale and the **register**. Buy retail items, **day passes** and **rentals** here (sometimes passes are also sold from a **booth out at the road**). For rentals, staff hand you a **form to fill out with your sizes**.

**Rental flow:** pay at the register and get the size form → walk right, past the register, parallel to the front of the building → turn left to the **rental counter** → hand in the form, receive your equipment → leave through **door 3** (signed "Rentals" / "Rental Returns"). Door 3 is both the rental exit and where rentals are returned.

**Door 4, Wax Room:** unlocked all the time.
- **Winter:** wax tables with outlets. Guests bring their own iron; none are provided. (Waxing is declining; the room may be made smaller and part of it used for rental storage in a future year, but not this year.)
- **Summer:** holds the **outdoor toys** guests can borrow: bats and balls, cornhole, KanJam, etc.
- **Hardline telephone** at the end of the room. **There is no cell service at Lapland Lake.** There is Wi-Fi, and most people use Wi-Fi calling.

**Online purchases:** guests who buy passes and/or rentals online still go to the **register** (unless someone is selling at the road booth), give their name, and get their ticket. Rental customers still get the size form and go to the rental counter. The owner can elaborate later on adding help for rental customers in the app.

**Getting onto the trails:**
- **Beginners:** walk across the road to the start of the **Lake Trail** (easiest trail). This is the **east side** of the trail system.
- **Lake Trail night skiing:** the Lake Trail is lit at night, but **night skiing is for lodging guests only**.
- **Lessons:** students meet the instructor near **door 2, usually inside**; instructors take them down to the **practice field**.
- **West side:** some skiers put their gear on and get on the trail **between the garage and the lodge building**, then ski the west side.

**Parking:** main lot outside the lodge (obvious to visitors); **overflow lot across the road**; lodging guests park at their cottages.

**Guest Wi-Fi:** network name **Lapland Lake Public**, open, **no password**. Show this in the app (e.g., on the lodge map and/or home screen) since there's no cell service.

**Important for the app:** no cell service on site, so the app must work well offline / on Wi-Fi (it already saves itself on the phone).

(Earlier note:) Owner paused the walkthrough at the retail shop; continue from there (door 2 area: retail, register, reservation desk; then rental desk, rental room, rental returns, wax room).
