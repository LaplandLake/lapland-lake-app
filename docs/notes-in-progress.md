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

Photo permissions: the lounge photo (`lodge-lounge-inside.jpg`) is cleared for use; the two outside photos were taken by the owner's team.

Front of the building, doors numbered left to right (photos: `docs/photos/lodge-front.jpg`, `docs/photos/lodge-door-1-lounge.jpg`):
1. **Far-left door** (Welcome sign, Olavi Hirvonen memorial plaque, large trail map sign, new wooden ramp with railing = step-free entrance)
   - Opens into the **lounge / common room**: wood stove, couch, chairs, loveseats around the fire, tables.
   - Inside photo: `docs/photos/lodge-lounge-inside.jpg` (professional shot: wood stove, leather couch, tapestry, two skiers). Use for the Lounge; permission confirmed.
   - Inside, immediately to the right: **stairs up to the café** (probably the Kuuma Feeding Station; confirm).
   - At the back, **down a few steps**: men's and women's **bathrooms** on the left, **sauna** on the right. (Bathrooms are not step-free; don't label them accessible unless told otherwise.)
2. **Middle door** (light above): unknown yet.
3. **Second door from right** ("Return rental skis and poles here" sign on rack): unknown yet.
4. **Far-right door**: trail report text says the **wax room** is the "rightmost door"; confirm.

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
- Café closed mode: `titleNote` in `content/menu.json` ("Closed until Ski Season") shows "Café Menu · Closed until Ski Season" and hides the soup card. Remove that line when the café opens.
- In season, the soup card only appears when `content/soup.json` has today's date; otherwise it's hidden.
- All prices are $0.00 placeholders until the owner provides real ones.

## Lodging
- "Lodge With Us" opens RezStream. Owner chose to keep it simple for now.
- Possible later: list of the 12 units (2 studios, 9 tupas, Lapin farmhouse) from laplandlake.com/lodging, each linking to its RezStream page.

## Other ideas mentioned
- Custom address app.laplandlake.com (needs a CNAME record from whoever manages the domain).
- Accessibility: automated WCAG check passed except trail-map symbols overlapping when zoomed out (trail list provides the same function). Suggested a phone screen-reader test.
- Samsung Internet shows a false Play Protect warning when installing; the app shows Samsung users a tip to install from Chrome.
