# FIBA Women's World Cup 2026 Schedule Viewer

[![CI](https://github.com/ismayc/fiba-womens-world-cup-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/fiba-womens-world-cup-viewer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://fiba-womens-world-cup-viewer.netlify.app/coverage.json)](https://github.com/ismayc/fiba-womens-world-cup-viewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A React + Vite web app showing all 36 games of the FIBA Women's Basketball World
Cup 2026 in Berlin, in **your** timezone, with where to watch, which arena, the
final-phase bracket, group standings, and the full FIBA tie-breaker and
qualification math.

🔗 **Live:** https://fiba-womens-world-cup-viewer.netlify.app · https://ismayc.github.io/fiba-womens-world-cup-viewer/

**This edition has not been played yet.** It tips off on 4 September 2026 and the
Final is on 13 September. The schedule ships complete and score-free; results
arrive through the refresh job as games finish.

## The format, and why it shapes the app

Sixteen teams (up from twelve in 2022) in four groups of four, all in one city.
Then a final phase that is unlike any other viewer in this family:

- the **group winner byes straight into the quarter-finals**;
- **2nd and 3rd play a qualification round**, a single-elimination game;
- **4th is eliminated**.

So only eight of the twelve survivors play the entry round, and the bracket is
**asymmetric**: four quarter-final slots come straight from the group tables and
four come from the qualification round. A quarter-final box therefore has just
one feeding box beneath it.

There are **two crossovers, in opposite directions**. The qualification round
crosses A↔B and C↔D. The quarter-finals then cross back the *other* way: the A
and B group winners meet the C/D qualification winners, and vice versa. That is
what makes a group rematch in the quarter-finals impossible, and it is the single
most likely thing to be "tidied" into a neater bracket that is simply not the one
being played.

**FIBA's points are not football's.** A win is 2 points and **a loss is 1**; only
a forfeit scores 0. And head-to-head is the *first* tie-breaker, ahead of overall
point difference. That is the reverse of the FIFA Women's World Cup viewer this
app was grown from.

## Features

- **Your timezone** — tip-off times auto-convert to your detected timezone
  (switchable to 20+, one per competing nation plus the host). Every game is in
  Berlin, which is on CEST (UTC+02:00) throughout, so unlike the football
  siblings this edition genuinely has one venue clock.
- **Hover for home-country time** — hover a team in any view to see when the game
  tips off back home; countries spanning several zones (Australia, the United
  States, Spain) list each distinct local time.
- **Follow teams** — star any team to highlight it everywhere and filter to a
  one-click "⭐ My Teams" view (saved in your browser).
- **Next-game bar** — a countdown to the next tip-off (prioritizing your followed
  teams, or "Live now"), with a jump-to-game button. It stacks both games when a
  group's final round tips two at once, which FIBA schedules by design.
- **Result alerts** — opt-in 🔔 on-page toasts and browser notifications the
  moment a game goes final, scoped to your followed teams or all games. (Final
  scores, not baskets: a basketball game has sixty-plus scoring plays, and the
  scoreboard feed does not carry them.)
- **Five views** — chronological schedule, a week calendar, group standings,
  Scenarios, and the bracket.
- **Group standings** with FIBA's columns (P W L PF PA PD Pts) and the full
  tie-breaker chain, a **Finish** column showing the placings still arithmetically
  open to each team, and clinch badges (🥇 won group · 🥈 2nd · 🥉 3rd · ✅ through
  · ❌ out) the moment an outcome is mathematically settled.
- **"As it stands"** — where each group's 1st, 2nd and 3rd would land right now,
  naming the round as well as the opponent, because the winner's route starts a
  round later than everyone else's.
- **Scenarios** — pick the winner of each remaining group game (no draw button;
  basketball plays overtime until someone wins) and watch the tables and the
  projected final phase recompute exactly.
- **Bracket** — the full 12-game final phase with FIBA's slot labels, showing
  candidate pairs for unresolved feeds and tracing any team's path to the Final.
- **Spoiler-free mode** — hide every score behind a tap-to-reveal.
- **Calendar** — add a single game to your calendar, export a filtered set, or
  subscribe to an auto-updating `webcal://` feed that fills in teams and scores.

## Data

Two sources, one authority:

| Source | Owns |
| --- | --- |
| **FIBA's published game schedule** (frozen in `scripts/official.mjs`) | Structure: which teams meet, in which group, with which game number, at which tip-off time, and the whole bracket wiring. |
| **ESPN's `basketball/fiba` scoreboard** | Event ids, arenas, US broadcast, and the score once a game is played. |

The build **fails** if the two disagree about which teams meet, and reports a
tip-off conflict only if it is already recorded. There is exactly one such
conflict today: ESPN files South Korea v Nigeria on 4 September two hours early
(12:30 Berlin against FIBA's 14:30), the signature of a double-applied timezone
offset. FIBA is the organizer, so the app ships FIBA's time. See
`KNOWN_ESPN_TIME_BUGS` in `scripts/official.mjs`.

ESPN has **not published the twelve final-phase fixtures** yet, because the teams
are not known. The app ships those records with FIBA's slot labels and no teams,
and the refresh job fills them in as ESPN publishes them.

Regenerate with:

```bash
npm run fetch:tournament        # write src/data/{games,teams,venues}.js
npm run fetch:tournament -- --dry   # print what would change, write nothing
```

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # the suite
npm run test:coverage  # with the coverage gate
npm run build
```

## Notes for contributors

[`ARCHITECTURE.md`](./ARCHITECTURE.md) is the map of how the code is laid out and
how data flows through it. [`NEWS.md`](./NEWS.md) is the dated changelog. Each
module's header comment is the authoritative spec for that module. Read it
before changing the code under it.

Three things in this repo exist to stop a specific bug coming back, and should
not be "simplified":

1. **`scripts/official.mjs`.** FIBA publishes no keyless JSON schedule API, so the
   authority is a hand-transcribed copy of its PDF schedule sheet. It is what
   catches ESPN drifting.
2. **The abbreviations in `src/data/teams.js`.** ESPN serves **Mali** with the
   abbreviation `KOR`, colliding with South Korea. The codes are set in the
   fetch script, never read from the feed.
3. **`site.web.api.espn.com`, not `site.api.espn.com`.** The two serve identical
   routes, but `site.api` returns 403 to datacenter IPs, which is every CI runner
   and every Netlify function.

## Credits

An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by
FIBA. "FIBA Women's Basketball World Cup", team, broadcaster and tournament names
are trademarks of their respective owners. Schedule and results data compiled
from [FIBA](https://www.fiba.basketball/) and [ESPN](https://www.espn.com/);
live in-game scores are from ESPN. The app icon uses
[Google Noto Emoji](https://github.com/googlefonts/noto-emoji) (Apache License 2.0).

Created by [Chester Ismay](https://github.com/ismayc) · MIT licensed.
