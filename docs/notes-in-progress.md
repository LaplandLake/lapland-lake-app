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
   - At the back, **down a few steps**: men's and women's **bathrooms** on the left, **sauna** on the right. (Bathrooms are not step-free; don't label them accessible unless told otherwise.)
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
- **Unpublished draft on branch `prices`:** prices read from last season's café chalkboards (photo `docs/photos/promo/cafe-counter.jpg`), plus new items from the boards: Sandwiches & Salads (garden $8.00, chef $9.50), Breakfast (cold cereal $2.00), Baked Goods (+ scones $4.00, cinnamon rolls $4.00), Snacks (chips, yogurt, banana, clementine, apple, unpriced). Unreadable/blank: chili, mac and cheese, soup (cup $5.__/bowl $7.__), decorated sugar cookies, NA beer, all snacks. Muffin $4.50 was smudged. **Owner said wait:** they'll upload this year's prices (ideally a photo of the current chalkboards) from work; then update the branch, preview, and publish on their OK. Live menu still shows $0.00 placeholders.

## Lodging
- "Lodge With Us" opens RezStream. Owner chose to keep it simple for now.
- Possible later: list of the 12 units (2 studios, 9 tupas, Lapin farmhouse) from laplandlake.com/lodging, each linking to its RezStream page.

## Other ideas mentioned
- Custom address app.laplandlake.com (needs a CNAME record from whoever manages the domain).
- Accessibility: automated WCAG check passed except trail-map symbols overlapping when zoomed out (trail list provides the same function). Suggested a phone screen-reader test.
- Samsung Internet shows a false Play Protect warning when installing; the app shows Samsung users a tip to install from Chrome.

- All lodge promo photos in `docs/photos/promo/` are now sharp 2,000 px versions (lounge, lounge-woodstove-2000, first-floor-tables, cafe-counter, cafe-tables, cafe-tables-2, rental-desk, rentals, retail-shop-2000, retail-shop-2-2000, outside, outside-sunny, outside-rental-returns-wax-room). The cafe-counter photo shows chalkboard menus with real prices; offered to use them for the menu, waiting on the owner's OK.
