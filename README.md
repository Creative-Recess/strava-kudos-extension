# Strava: Auto Kudos

A browser extension that gives kudos to the 100 most recent activities in your Strava feed, in one click.
Works in Chrome, Brave and other Chromium browsers.

## Installation

1. Open your browser's extensions page: `brave://extensions` in Brave, `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension from the puzzle-piece menu in the toolbar so it's one click away.

After pulling new changes, click the reload icon on the extension's card, then refresh any open Strava tab.

## Usage

1. Open any page on [strava.com](https://www.strava.com) while logged in.
2. Click the extension icon, then **Give Kudos**.

The extension loads your dashboard with 100 entries, waits for the feed to render, and gives kudos to every activity you haven't already kudosed.
You can close the popup while it runs - reopen it to check progress.
The popup also shows how many kudos you've given today, in the last 7 days and all time.

## How it works

- `background.js` (service worker) runs the whole flow, so it isn't interrupted when the popup closes.
  It navigates the tab to `/dashboard?num_entries=100`, waits for the page to load, then injects a function that finds every `button[data-testid="kudos_button"]`.
- Buttons that already show kudos (filled icon, or a "View all kudos" title) are skipped.
- The rest are clicked one at a time, 400ms apart, to stay well clear of Strava's rate limits.
- After the last click it re-checks each button and only counts kudos that actually went through.
- Run state lives in `chrome.storage.session` and daily totals in `chrome.storage.local`; `popup.js` just renders them.

## Troubleshooting

- **"Open strava.com in this tab first."** - the extension only acts on a tab that's already on Strava.
- **"No kudos buttons found."** - Strava has probably changed its page markup.
  Inspect a kudos button on the dashboard and update the selector in `giveKudosInPage` in `background.js`.
- **"N more didn't go through"** - Strava rejected some kudos, most likely due to rate limiting.
  Wait a while and run it again; it will only retry the ones that are missing.

## Icons

`icons/icon.svg` is the source design (`icons/icon-small.svg` is the simplified 16px version without the sparkles).
The PNGs in `icons/` are exported from them.
The thumbs-up shape is adapted from [Lucide](https://lucide.dev) (ISC licence).

## Licence

MIT, see [LICENSE](LICENSE).
