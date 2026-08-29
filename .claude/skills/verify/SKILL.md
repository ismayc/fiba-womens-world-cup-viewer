---
name: verify
description: Build, launch, and drive the FIBA Women's World Cup viewer app to verify a change end-to-end in a real browser.
---

# Verifying changes in the running app

Every selector and recipe below was probed against this app on 2026-08-29. This
file was previously a copy of the soccer `world-cup-viewer` skill and told you to
wait on an OpenFootball feed, click a "🎯 Radial" tab and look for "Match 101",
none of which exist here. If something below does not resolve, re-probe and fix
this file rather than working around it.

## Launch

```bash
npm run dev -- --port 5199 &   # Vite dev server; app at http://localhost:5199/
```

`base: './'` in vite.config.js, so the app serves at the root path: no
`/fiba-womens-world-cup-viewer/` prefix is needed in dev.

## Drive (headless browser)

No Playwright in devDependencies, so import it from the npx cache. Find the newest
copy and check whether its browsers are actually installed (the `ms-playwright`
cache gets cleared periodically, so an empty or missing dir is normal rather than a
broken setup):

```bash
for d in ~/.npm/_npx/*/node_modules/playwright; do echo -n "$d: "; node -p "require('$d/package.json').version"; done
ls ~/Library/Caches/ms-playwright 2>/dev/null   # no chromium_headless_shell-* => install below
```

If it's missing, install once (~94 MB, ~30s) against the newest version's dir:

```bash
cd ~/.npm/_npx/<hash> && node node_modules/playwright/cli.js install chromium
```

Then write a plain `.mjs` script in the scratchpad and run it with `node`,
importing `chromium` from that dir's `playwright/index.mjs`.

## Always stub the live feed first

The one live source is ESPN, and it can mark games live or delayed around real
tip-offs. Block it in every run you want to be deterministic. Note the host:
**`site.web.api`**, not `site.api`. Routing only the latter stubs nothing.

```js
await page.route('**/site.web.api.espn.com/**', (r) => r.fulfill({ json: { events: [] } }))
```

## Selectors that work

**Shell, any view**
- `.app-header`, `.subtitle` (carries "shown in <strong>America/Phoenix</strong>"),
  `.app-footer`
- `.view-bar`, `.view-btn`, `.view-btn.active` — the five tabs are
  `📋 Schedule`, `📆 Week`, `📊 Groups`, `🧮 Scenarios`, `🏆 Bracket`.
  Match on the word (`page.locator('.view-btn', { hasText: 'Groups' })`), not the emoji.
- `.results-bar` — the feed banner; carries a state class, `.results-bar.results-ok`
  when the fetch succeeded. Pre-tournament it reads "No results yet, tip-off is
  September 4, 2026".
- `.view-strip` — the condensed sticky strip. It does **not** exist on load; it
  appears only after scrolling (~1800px down the Schedule).

**Schedule** — `.schedule`, `.card` (36 of them), `.card-head`, `.card-body`,
`.card-actions`, `.card-time`, `.card-tv`, `.tv-badge`, `.venue`, `.day-header`,
`.day-toggle`.
A card's buttons are `☆` (follow, one per team), `📺 How to watch (US) ▼`,
`＋ Add to calendar`, and `ℹ Details`. Clicking the card body does nothing; open
the modal with `button:has-text("Details")`.

**Game detail modal** — `.md-overlay`, `.md-card`, `.md-close`, `.md-head`,
`.md-stage`, `.md-teams`, `.md-team`, `.md-flag`. Escape closes it.
There is no `.md-title`, `.md-body` or `.modal`.

**Groups (standings)** — `.standings-grid`, `.standings-table` (four, in group
order A-D), `.standings-legend`, `.standings-tip`, `.standings-toolbar`,
`.col-team`, `.col-pts`, `.col-finish`, `.finish`, `.q-badge`, `.ais-toggle`.
Read a group's order with `.standings-table` → `tbody tr` → `.col-team`.

**Scenarios** — `.scenarios-view`, `.scenarios`.

**Bracket** — `.bracket-view`, `.bracket`, `.bracket-hint`, `.bx-col`,
`.bx-col-head`, `.bx-col-body`, `.bx-match`, `.bx-side` (24 of them), `.bx-meta`,
`.bx-flag`, `.bx-tbd`, `.bx-venue`, `.bx-col-final`, `.bx-third-label`.

**Week** — `.week-view`, `.week-grid`, `.week-nav`, `.week-day-btn`, `.week-cell`,
`.wc-team`.

**Filters & search** — behind the `⚙ Filters & Search` button, which reveals
`.filters` / `.controls-bar`. Inside: `.stage-chips` (buttons read `Group Phase`,
`Qualification to Quarter-Finals`, `Quarter-Final`, `Semi-Final`,
`Third-Place Game`, `Final`), `.search-toggle`, and a timezone `<select>`.
The search box appears only after clicking `.search-toggle`; it is
`input.search[type=search]`, so its ARIA role is **searchbox, not textbox**.

**Calendar modal** — `📤 Calendar` button → `.cal-modal`, `.cal-title`, `.cal-row`,
`.cal-btn-primary`.

**My services modal** — `📺 Choose my services` → `.svc-modal`, `.svc-list`,
`.svc-name`, `.svc-foot`.

## Simulating results

The app merges an ESPN overlay onto the committed board, so serve a doctored
scoreboard and the real pipeline does the rest: standings, Finish ranges, clinch
badges and the projected bracket all follow. Do **not** poke components directly.

Match by `espnId` from `src/data/games.js`, never by rewriting team names, because a
wrong matchup is a data bug, and ESPN's own abbreviations collide here (it serves
Mali as "KOR"). `t1` in the committed board is filed as ESPN's `home` side.

```js
const finals = [
  { id: '401907390', home: 'Japan', away: 'Mali',    hs: 90, as: 60 }, // game 1
  { id: '401907394', home: 'Spain', away: 'Germany', hs: 88, as: 70 }, // game 6
  { id: '401907438', home: 'Mali',  away: 'Spain',   hs: 61, as: 95 }, // game 9
]
const event = (f) => ({
  id: f.id,
  date: '2026-09-04T09:30Z',
  status: { period: 4, displayClock: '0:00',
            type: { state: 'post', name: 'STATUS_FINAL', description: 'Final' } },
  competitions: [{
    status: { period: 4, type: { state: 'post', name: 'STATUS_FINAL' } },
    competitors: [
      { homeAway: 'home', score: String(f.hs), team: { displayName: f.home } },
      { homeAway: 'away', score: String(f.as), team: { displayName: f.away } },
    ],
  }],
})
await page.route('**/site.web.api.espn.com/**',
  (r) => r.fulfill({ json: { events: finals.map(event) } }))
```

Verified to produce, in Group A: Spain 1st on 4 pts with a `✅ Through` badge,
Finish narrowed from `1–4` to `1–3`, and `.as-it-stands` rendering. The app hits
the route ~6 times per load (a ±1-day window), so serve the same payload every time.

For an in-progress game use `state: 'in'` with a real `period`/`displayClock`; for
overtime set `period` above 4 (FIBA plays four quarters, so period 5 is OT).

## Gotchas

- **Nothing is played yet.** The committed board has no scores, so on a clean load
  every group is 0-0, every Finish reads `1–4`, and `.tiebreak-mark` and
  `.as-it-stands` are **absent by design**: the ⚖ marker deliberately skips teams
  with `P === 0`. Assert their absence only if that is what you mean.
- **The bracket has no teams pre-draw.** ESPN publishes none of the 12 final-phase
  fixtures, so `.bx-side` holds slot labels like `· 3rd Group C`. There is no
  `.bx-team` until real results resolve a slot.
- **Group order is the world ranking, not the alphabet.** A clean load opens Group A
  as Spain, Japan, Germany, Mali. See `byLots` in `src/utils/qualification.js`.
- Rendering is time-of-day sensitive (countdowns, day folding, "Earlier games").
  Don't assert exact times.
- **Don't assert with loose attribute globs.** `[class*="active"]` also matches the
  nav's `view-btn active`. Target the specific class, and dump
  `evaluateAll(els => els.map(e => e.className))` when a count is non-zero but you
  cannot say which element it is.
- `innerText` returns null on SVG `<text>`; use `.textContent()` and confirm with
  `.isVisible()` / `.boundingBox()` rather than trusting a text match.
