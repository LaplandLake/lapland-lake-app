# Lapland Lake Guest App

A phone web app for guests at Lapland Lake Nordic Vacation Center. Guests can save it to their home screen. It is not an App Store app.

## Daily updates (no coding needed)

Everything that changes day to day lives in the **`content/`** folder. Each file is plain text. Change the words between the quote marks, keep the quote marks and commas where they are, and save.

| File | What it controls | How often |
|---|---|---|
| `content/soup.json` | Soup of the day | Every day |
| `content/menu.json` | Lodge menu | When the menu changes |
| `content/trails.json` | Trail map: trail names, difficulty, lengths, and where each symbol sits | When trails change |
| `content/settings.json` | FareHarbor booking link | Rarely |
| `content/trail-report.json` | Trail conditions | Automatic. Don't edit by hand. |

### Example: changing the soup

```json
{
  "date": "2026-10-05",
  "soup": "Butternut Squash",
  "description": "Vegetarian. Served with fresh bread."
}
```

Write the date as year-month-day. You can leave the description empty (`""`).

**Tip for AI assistants:** "Update `content/soup.json` with today's date and the soup [name]" is all the instruction an assistant needs.

## Trail map

The map picture is `images/trail-map.webp`, cut from the trail map PDF on the website. Everything you can tap is listed in `content/trails.json`:

- `difficulty` is `easiest`, `more-difficult` or `most-difficult` (green circle, blue square, black diamond).
- `spots` says where the symbol goes on the map picture, counted in pixels from the top-left corner (the picture is 2134 wide and 1822 tall). A trail can have several spots, or none (`[]`) to appear only in the list.

## How the trail report updates itself

Every 30 minutes during the day, GitHub reads the trail report page on laplandlake.com and copies the report into the app. Nobody has to retype it.

- "Last updated" in the app shows when the report last changed.
- If the website can't be read, the app keeps showing the last report with a note that it may be out of date. The same note appears if the report hasn't changed in 36 hours (change `trailReportStaleAfterHours` in `content/settings.json` to adjust).
- To update right away instead of waiting: on GitHub, open **Actions**, pick **Update and publish app**, and press **Run workflow**.

## What the other files do (you won't normally touch these)

- `index.html`: the page itself
- `css/styles.css`: colors and look. Brand colors are at the very top.
- `js/app.js`: the screens and buttons
- `sw.js`: lets the app open quickly and work on a weak signal
- `manifest.webmanifest` and `images/icons/`: the app name and icon used when it's saved to a home screen
- `images/logo-wide.svg`, `logo-stacked.svg`, `logo-mark.svg`: the logo, made from the original design file in `brand/`
- `scripts/update-trail-report.mjs` and `.github/workflows/site.yml`: copy the trail report and publish the app

## Adding features later

The screens are listed in one place (`SCREENS` in `js/app.js`). A future Nature Guide or skier game is added as one new entry there plus its own screen, so nothing that exists now has to change.
