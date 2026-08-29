# News

Dated changelog, newest first.

## August 29, 2026 — the guard that guards the family

`test/guards.test.js` was the only one of its kind in the family, so nothing stopped the
other eleven repos regressing the bugs it describes. It now lives in all twelve, tailored
per repo, and two faults in this copy were fixed on the way out.

- **The sibling-prefix list was wrong.** It checked for `wmm:` and `euro:`, neither of
  which any repo uses (the real prefixes are `mmw:` and `euros:`), and it never checked
  `st:`, `wc2026:` or `copa:` at all. Because a viewer only ever borrows a prefix that
  really exists, the two dead entries could never fire and three real siblings went
  unguarded. The list is now the full verified family registry, and a failure names the
  repo the prefix belongs to.
- **`vite.config.js` pointed at a test that does not exist.** Its comment credited
  `test/timezone-pinned.test.js` for asserting the UTC pin. That file is real in three
  siblings but was never created here; the assertion lives in `test/guards.test.js`.
- **Fixed: a concurrent push to main threw away the whole nightly refresh.** The refresh
  job checks main out, spends a couple of minutes rebuilding its committed data from ESPN,
  tests the result, then pushes. The push was a bare `git push`, so if anything else landed
  on main in that window it died with `! [rejected] main -> main (fetch first)` and the
  freshly fetched data was discarded until the next scheduled run. It happened to the WNBA
  viewer today, where a hand push landed one second ahead of the bot. Every refresh workflow
  in the family had the same bare push. The step now rebases its single data commit onto
  whatever arrived and retries, up to three times. A genuine content conflict still fails
  the run rather than force-pushing over someone's work.

## August 29, 2026 — the source link pointed at the wrong repo

"View source on GitHub" in the footer linked to `ismayc/womens-world-cup-viewer`,
the FIFA Women's World Cup sibling this viewer was scaffolded from. It was a
rendered link on every page. Every other identity field here was already correct.

## August 29, 2026 — world ranking, not the alphabet

Before a ball is thrown every team is 0-0, so the whole group is one tied block and
the very last tie-break decides the entire table. That fallback was alphabetical
order, which opened Group A with Germany on top and the world number 6, Spain, in
last place. It is now the **FIBA World Ranking**.

- **The ranking is committed data.** `RANK_BY_TEAM` in `src/data/teams.js` holds
  the ranking published April 1 2026, the last update before the tournament,
  hand-transcribed from FIBA's own ranking page and cross-checked against
  Wikipedia's data module, which agrees on all sixteen. A test pins every value,
  because a silently shifted ranking would reorder the opening table without
  failing anything else.
- Groups are now listed strongest-first, so Group A opens Spain, Japan, Germany,
  Mali and Group D opens United States, China, Italy, Czechia.
- **It is a display order, not a FIBA rule.** FIBA's real last resort is a drawing
  of lots, which no viewer can compute. The standings legend now says so, and the
  ⚖️ marker still appears wherever lots would genuinely have decided a placing.
- Results always beat the ranking: it is only ever reached when nothing on the
  court separates two teams, and there is a test that Mali can still win Group A.

## August 29, 2026 — the mark is Berlin's bear now

The icon was Germany's flag with a basketball. Every one of the 36 games is in
Berlin, so the mark now carries the city: a bear standing on Berlin's red-white-red
with a paw on the ball. Tab icon, home-screen icon and the share card all change
together.

- **One source of truth.** The art lives in `scripts/lib/mark.mjs` and nothing else
  draws it. `npm run icons` regenerates `icon.svg`, `favicon.svg`, the three PNGs
  and the badge on the share card, so those can no longer drift apart. The PNGs
  used to be built by hand.
- **The generator verifies its own output**, because ImageMagick fails silently and
  leaves the previous PNG in place: it checks dimensions, that the image is not
  blank, that the white band is not empty (the bear rendering is the thing that has
  actually vanished before), and that both flag bands are Berlin red.
- **A new silent-failure mode, found here:** ImageMagick *discards* any element
  inside a `rotate()` transform. Not un-rotated, dropped. The bear is therefore
  built from untransformed primitives. It joins the dropped strokes, black gradient
  fills and ignored `clipPath` already on that list, and like them it is invisible
  in a browser preview.
- The bear is deliberately **not** Berlin's official Landeswappen, which is a
  protected state emblem restricted by the state's coat-of-arms law.

## August 29, 2026 — point the shared URLs at a host that exists

Three separate breakages, one root cause: the repo is wired for a Netlify mirror
(`netlify.toml`, a functions directory) but that Netlify site was never created,
so every `fiba-womens-world-cup-viewer.netlify.app` URL returns 404.

- **Link previews were blank.** `og:image` pointed at the dead Netlify host, so
  iMessage, Slack and everything else fetched a 404 and drew no card. `og:url`,
  `twitter:image` and the canonical link had the same problem. All four now point
  at GitHub Pages, which serves the 1200×630 card today, matching how the
  `wnba` and `nba` siblings do it.
- **Calendar Subscribe served the wrong tournament.** Scaffolding left
  `CalendarModal`'s production origin on the *soccer* Women's World Cup viewer's
  domain, which answers 200 with that competition's games. It now points at this
  repo's own host, and the missing Netlify site has since been created, so the
  feed now serves this tournament's 24 group games from Berlin.
- **The README coverage badge 404'd** against the same host; it now reads
  `coverage.json` from Pages.

The split is now deliberate: GitHub Pages is the canonical public URL and the one
the preview card points at, and Netlify is the mirror that keeps deploying when
Actions is down and the only host that can run the calendar function.

## August 29, 2026 — first release

New viewer for the **FIBA Women's Basketball World Cup 2026** (Berlin, 4–13
September), built from the `womens-world-cup-viewer` sibling and re-fitted for
basketball and for FIBA's format. It ships six days before tip-off, complete and
score-free.

### The data layer

- **`scripts/official.mjs`** — FIBA's published game-schedule sheet, frozen in the
  repo, is the authority for structure and tip-off times. FIBA publishes no
  keyless JSON schedule API, so unlike the FIFA sibling (where a live API is the
  authority) this is a hand-transcribed copy of the official PDF.
- **`scripts/fetch-tournament.mjs`** — merges that authority with ESPN's
  `basketball/fiba` scoreboard, which supplies event ids, arenas, US broadcast and
  scores. The build fails if the two disagree about which teams meet.
- **Found: ESPN files one game two hours early.** South Korea v Nigeria on
  4 September is `2026-09-04T10:30Z` in ESPN's feed (12:30 Berlin) against FIBA's
  published 14:30. ESPN's stored UTC equals FIBA's *GMT* figure with the Berlin
  offset subtracted a second time, which is a double conversion. All 23 other
  group games agree to the minute, so it is a single bad record. FIBA is the
  organizer, so the app ships FIBA's time; the conflict is recorded in
  `KNOWN_ESPN_TIME_BUGS` and
  asserted by `test/official-schedule.test.js`, which will fail if ESPN ever
  corrects it.
- **Found: ESPN serves Mali with the abbreviation `KOR`**, colliding with South
  Korea (team 17480). Both would render as "KOR" in a compact scoreline and one
  team's result would read as the other's. Teams are keyed by ESPN's numeric id
  and the short codes are set in the fetch script, never read from the feed.
- The twelve final-phase games ship with FIBA's slot labels and **no teams**:
  ESPN has not published those fixtures, because the draw has not happened. The
  refresh job fills them in.
- Games whose tip-off FIBA announces "at the end of the previous round" (the
  qualification round and the semi-finals) carry `ko: null`, `tbdTip: true` and
  the known calendar `date`, and render as **Time TBC**.

### The format

- **Group winners bye to the quarter-finals**; 2nd and 3rd play a qualification
  round; 4th is out. The bracket is asymmetric, and a quarter-final box has only
  one feeding box.
- **Two crossovers, in opposite directions** — the qualification round crosses
  A↔B and C↔D, the quarter-finals cross back the other way. Quoted from FIBA's
  sheet and asserted in `test/bracket.test.js`, including the property that
  follows from it: no group rematch is possible in the quarter-finals.
- **FIBA points: a win is 2, a loss is 1.** Standings show P W L PF PA PD Pts,
  with no draw column, because basketball has none.
- **Head-to-head outranks overall point difference**, the reverse of the FIFA
  sibling. `test/qualification.test.js` pins this with a group engineered so the
  two orderings conflict, and the test was verified to fail under the old rule.
- FIBA's **restart rule** is implemented: when a criterion separates some but not
  all of a tied set, the still-level teams are re-ranked from the top with a fresh
  sub-table among only themselves.

### Rewritten for basketball

- **The clinch engine no longer enumerates scorelines.** The football siblings walk
  every scoreline (0–8 goals a side); a basketball game is 40–120 points, which is
  combinatorially hopeless. FIBA's head-to-head-first ordering gives a better
  lever: the engine walks only win/loss outcomes (2^remaining, at most 64 for a
  group) and resolves a tied block exactly whenever the games inside it are
  already played. An unresolved block is treated pessimistically, so the engine
  can only under-claim.
- **Overtime replaces extra time and penalties.** A completed game always has a
  winner, so the bracket can always resolve one; a level score on a completed
  record is treated as bad data rather than a draw.
- **Result alerts replace goal alerts.** Sixty-plus scoring plays a game would be
  unusable as notifications, and the scoreboard feed does not carry them.
- **Dropped: the R16 Outlook and the Stats/Golden Boot views.** The Outlook
  enumerated goal-difference margins in a web worker, which is the same
  combinatorics that basketball scores break. A points leaderboard would need
  per-player box scores, which is out of scope for this edition; the boot
  machinery is absent rather than ported and left inert.
- **Live overlay keyed on the ESPN event id first**, then the team pair, then the
  tip-off instant. Matching by id means a mismatch is a committed-data bug to fix
  in the schedule, not something the overlay papers over by rewriting teams.

### Fixes to inherited code

- The ICS generator said `SUMMARY:EURO: …`, a leftover from a different sibling.
- The live overlay adopted ESPN's **home** side as `t1` for an unresolved bracket
  slot, while every committed game uses ESPN's **away** side first (FIBA's print
  order). A resolved bracket game would have read the opposite way round from every
  group game beside it.
- The Netlify calendar feed emitted `(0–0)` for every unplayed game: ESPN reports
  `score: "0"` before tip-off, so the feed needed a `completed` guard.
- `test/setup.js` guarded its fetch stub with `if (!global.fetch)`, dead since
  Node 18 shipped a built-in fetch, so the stub never installed and an unmocked
  test went to the real ESPN scoreboard. Now unconditional.
- The tie-break ⚖ marker fired on every row of every group before a ball was
  thrown up, since four teams on zero are trivially level on everything.
- `dayKey` on a game with no tip-off time bucketed it at the Unix epoch, floating
  the TBC games to the top of the schedule. `gameDayKey` uses the committed date.
- A null arena (every final-phase game) crashed every card that formatted a venue.
  `utils/venue.js` falls back to a Berlin placeholder: the city and timezone are
  known even when the building is not.
- The timezone picker offered São Paulo, Tehran, Riyadh and Johannesburg (no teams
  here) while missing Brussels, Prague, Budapest, Rome, Bamako, Istanbul, Shanghai
  and Puerto Rico (all competing). Rebuilt around this field.

### Presentation

- Group tables and the Scenarios cards lay out **2×2**. With only four groups, an
  auto-filling grid packed three across and stranded the fourth alone.
- The standings team cell is a single non-wrapping row, so a long name ("United
  States", "South Korea") truncates instead of doubling the row height. This
  sport's PF/PA columns are wider than a football table's goal columns.
- New identity: the **German flag's three bands** (`#000000`, `#DD0000`, `#FFCE00`)
  behind a white disc carrying the Noto basketball. The first attempt was a globe
  centered on Europe and Africa, but at a browser-tab's 16px it read as the soccer
  World Cup sibling's mark: both are a round blue-green world, and the ball riding
  it is too small to separate them. The host nation is the one thing this edition
  has that no sibling shares, and three flat horizontal bands survive the downscale
  where continent outlines do not. The family icon doc records that a shared ground
  alone is too weak a differentiator, so the ground *is* the identity here.
- **A built social card.** `scripts/make-og-image.mjs` renders the 1200×630
  link preview: the art layer from `public/og-image.svg`, then all 16 nations'
  flags laid out in four group columns with their group letters. The script
  verifies its own output (dimensions, the expected ground color, a stddev floor
  that catches a blank render, and that no two flags came back byte-identical),
  because ImageMagick fails silently in ways that leave the *previous* PNG in
  place. Mali's flag is fetched by its own code: ESPN's Mali record points its
  logo at `kor.png`, the same bad row that gives Mali the `KOR` abbreviation.

### Watching it in the US

- **"My services"**, ported from the WNBA sibling and re-fitted to this
  tournament's US rights. Pick your providers and the schedule filters to what
  you can actually watch. The catalog covers HBO Max, YouTube TV, Hulu + Live TV,
  Fubo, Sling, DirecTV Stream and cable/satellite.
- HBO Max is in **no** bundle, so it is selectable on its own rather than implied
  by a live-TV service. And a game whose US coverage FIBA and ESPN have not yet
  published is **kept**, never hidden: an unannounced broadcast is missing data,
  not an absent one, and silently dropping those games would understate the
  schedule right up to tip-off.

### Testing

- 612 tests, and **100% coverage** on statements, branches, functions and lines,
  matching the rest of the family. The gate in `vite.config.js` enforces all four.
- The headline test plays all 36 games and asserts the bracket resolves end to end
  with **zero** unresolved slots, a coherent champion route, and the two beaten
  semi-finalists (and only they) in the third-place game.
- Reaching 100% turned up a real reporting trap: v8 does not attribute coverage to
  a state-updater arrow that React invokes from inside its own reducer, so App's
  inline `setToasts` updater read as an uncovered function while the toast it
  builds was demonstrably in the DOM. Suppressing it with an ignore would have
  excluded four working functions from the gate, so the updater was extracted into
  `mergeToasts` in `services/scoreNotify.js` and tested directly instead. The
  totals went **up**, which is the proof nothing was hidden.
- The suite's timezone is pinned to **UTC**, which is day-stable for this data;
  `test/guards.test.js` asserts the pin so it cannot be dropped unnoticed on an
  already-UTC CI runner.
