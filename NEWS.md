# News

Dated changelog, newest first.

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
- New identity: a **globe centered on Europe and Africa with a basketball**, on a
  deep navy `#12233d`. The 🏀 ball alone is already worn by two siblings, and the family
  icon doc records that ground alone proved too weak a differentiator.

### Testing

- 258 tests. The logic layer is at 96% statements; `asItStands`, `bracketResolve`,
  `eliminationCheck`, `opponentClinch`, `scenarios`, `slots`, `venue`, `week` and
  `scoreNotify` are at 100%.
- The headline test plays all 36 games and asserts the bracket resolves end to end
  with **zero** unresolved slots, a coherent champion route, and the two beaten
  semi-finalists (and only they) in the third-place game.
- The coverage gate is set **below the family's 100% standard** at the current
  floor, so it ratchets. The shortfall is in the presentational layer inherited
  from the sibling. See the note in `vite.config.js`.
- The suite's timezone is pinned to **UTC**, which is day-stable for this data;
  `test/guards.test.js` asserts the pin so it cannot be dropped unnoticed on an
  already-UTC CI runner.
