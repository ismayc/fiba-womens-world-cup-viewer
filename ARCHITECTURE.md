# Architecture

A contributor's map of the FIBA Women's World Cup 2026 Schedule Viewer. The
README covers *what the app does*; this covers *how the code is laid out* and how
data flows through it. Day-to-day "what changed when" lives in [`NEWS.md`](./NEWS.md);
the authoritative per-function detail lives in each module's header comment, and
this file is the index that points you at the right one.

The app is a client-only React + Vite SPA. There is no backend: all logic runs in
the browser (plus a couple of Node scripts for CI/data regeneration and one
Netlify function for the calendar feed).

## The format, and why it shapes the code

Sixteen teams, four groups of four, 36 games, one city. The final phase is the
thing to understand before touching anything:

- the **group winner byes straight into the quarter-finals**;
- **2nd and 3rd** enter one round earlier, in a single-elimination
  **qualification round**;
- **4th** is eliminated.

Three consequences run all the way through the code:

1. **`ADVANCING_PER_GROUP` is 3, not 2**, and finishing 1st is worth materially
   more than finishing 2nd. Anything that asks "did this team advance?" is a
   different question from "did this team win its group?".
2. **The bracket is asymmetric.** Four quarter-final slots are filled from the
   group tables directly and four from the qualification round, so a quarter-final
   box has ONE feeding box, not two. Code that assumes "everyone still alive
   played the entry round" is wrong here, because a group winner was seeded past
   it. Use `enteredAt()` in `slots.js`.
3. **A group winner's next opponent cannot be known from the tables.** It is the
   winner of a qualification game nobody has played, so `lockedOpponent` correctly
   returns null for it and the projection reports the pending feed
   ("Winner Game 27") rather than a team name.

Two format facts to hold onto, because both are silent if you get them wrong:

- **Two crossovers, in OPPOSITE directions.** The qualification round crosses
  A↔B and C↔D; the quarter-finals cross back the other way, so the A/B group
  winners meet the C/D qualification winners. The intuitive wiring, with A and B
  staying on one side of the bracket throughout, is wrong, and it is also what
  would allow a group rematch in the quarter-finals. Both crossovers are quoted
  verbatim from FIBA's sheet in `scripts/official.mjs` and re-asserted in
  `test/bracket.test.js`. Do not straighten them.
- **FIBA's points are 2 for a win and 1 for a LOSS**, and **head-to-head is
  criterion 2, ahead of overall point difference**, the reverse of the FIFA
  Women's World Cup sibling this repo was grown from. Porting that file's ordering
  back silently reorders any group where two level teams have met.

Like the World Cup and unlike the Euro, a **third-place game** is played (35). It
hangs off the bracket rather than sitting in it, and it is the only place the
"Loser Game N" feed form appears.

## Data flow at a glance

```
static schedule (src/data)              live feed (src/services)
  games · teams · venues                   ESPN (live overlay) ──────────┐
        │                                                                │
        └──────────────┬─────────────────────────────────────────────────┘
                       ▼
        merged games  (App.jsx state, refreshed on a timer)
                       │
   ┌───────────────────┼──────────────────────────────────────────┐
   ▼                   ▼                   ▼                       ▼
 qualification       clinch /           asItStands            bracketResolve
 (standings,         eliminationCheck   (provisional          (fill bracket
  tie-breakers)      (guaranteed         final-phase          placeholders as
                      outcomes)          projection)          teams resolve)
                       │
                       ▼
                   components/  (Standings, Bracket, WeekView, …) render it
```

**One runtime feed, not two.** No free basketball equivalent of OpenFootball
publishes this tournament, so there is no `results.js` "source of record" module
and no "confirmed by N sources" reconciliation layer. Do not add one: with a
single feed both would be permanently inert.

Everything downstream of the merge is **pure**: given a `games` array it
recomputes standings, clinches, projections and bracket fills with no side
effects, which is why most logic is unit-testable without the DOM.

## `src/data` — static inputs

All three modules are **generated**; edit `scripts/` and regenerate.

| File | Exports | Role |
| --- | --- | --- |
| `games.js` | `GAMES`, `STAGE_LABELS`, `STAGE_ORDER` | The 36-game schedule. `STAGE_ORDER` is `Group, QR, QF, SF, 3rd, Final`. |
| `teams.js` | `TEAMS`, `FLAG_BY_TEAM`, `ABBR_BY_TEAM`, `ALL_TEAMS` | 16 teams across 4 groups, flag/abbreviation lookups. `FLAG_BY_TEAM[name]` doubles as the "is this a real team?" test in the UI. |
| `venues.js` | `VENUES` | The two Berlin arenas, with FIBA's name and ESPN's `sponsorName`. |
| `broadcast.js`, `teamTimezones.js`, `groupColors.js` | — | Tournament-wide US TV, per-nation home clocks, group accent colors. |

**One tournament timezone.** Every game is in Berlin, which is on CEST (+02:00)
for the whole 4–13 September window, so a single offset is correct here. That is a
real simplification over the FIFA sibling, where ten stadiums spanned four
offsets and no single "local time" existed.

Three fields on a game record deserve their own note:

- **`ot`** counts overtime PERIODS (0 in regulation). Basketball has no draw, so a
  finished game always has a winner, which is why there is no `aet`/`pens` pair
  here and why the bracket can always resolve a completed game.
- **`ko: null` + `tbdTip: true` + `date`.** FIBA announces the qualification-round
  and semi-final tip-offs at the end of the previous round. Those six games carry
  no instant but do carry the known calendar date, which is what the schedule and
  week views bucket them on (`gameDayKey`). A plain `dayKey` would send them to
  the Unix epoch and float them to the top of the schedule.
- **`label1`/`label2` with null teams.** FIBA publishes the whole bracket wiring
  long before the teams, so a final-phase record ships with its labels and gains
  its teams later. That is the OPPOSITE way round from the football siblings,
  where the labels start in `t1`/`t2` and get replaced.

## `src/services` — live data ingestion & merge

- **`espn.js`** — ESPN's public scoreboard: the live overlay (period, clock,
  running score), the `history` window for games that have aged out of the rolling
  scoreboard, and the resolution of final-phase fixtures as ESPN publishes them.
  `LIVE_SOURCE`, `fetchLive`, `applyLive`, `liveRecordFor`, `overtimeFrom`,
  `periodLabel`, `scoreboardDates`, `historyDates`.

  It matches a game **by ESPN event id first**, then the team pair, then the
  tip-off instant. A mismatch between our teams and ESPN's is therefore a
  committed-data bug to fix in the schedule; the overlay only adopts ESPN's teams
  for a slot we are still holding as a placeholder, and it does so **away-first**,
  matching how every committed game is oriented.

  It parses **no scoring events**. ESPN's basketball scoreboard does not carry
  them, and sixty-plus scoring plays would be noise rather than a timeline.
- **`teamNames.js`** — canonical-name normalization (`normalizeTeam`,
  `isRealTeam`, `pairKey`).
- **`scoreNotify.js`** — opt-in result notifications (`detectFinals`, `isLiveish`,
  `inScope`, `finalNotification`). Detects a game going FINAL, not each basket.

`App.jsx` owns the fetch loop: it polls every ~2 min, dropping to ~30 s while any
game is live, and recomputes the derived state below on each refresh.

## `src/utils` — derived logic (pure)

**Standings & qualification**
- `qualification.js` — `computeQualification`, `rankGroup`, `headToHead`,
  `groupComplete`, `rowStatus`, `ADVANCING_PER_GROUP`, `DIRECT_TO_QF`,
  `WIN_POINTS`, `LOSS_POINTS`, `byLots`. Implements FIBA's order: points →
  head-to-head points/PD/PF among the tied → overall PD → overall PF → lots. Also
  implements FIBA's **restart rule**, which football has no counterpart for: when
  a criterion separates some but not all of a tied set, the still-level teams are
  re-ranked from criterion 1 with a fresh sub-table among only themselves.
- `tiebreakNotes.js` — `softTiebreaks`, `TIEBREAK_LABEL`: placings nothing but a
  drawing of lots could separate (the "⚖️" case). There is only ONE soft reason
  here; FIBA has no fair-play criterion, so that branch is absent rather than
  ported and left unreachable.
- `standings.js` — small presentation helpers for the tables.

**Guaranteed outcomes**
- `clinch.js` — `computeClinch` (statuses `won-group | second | third | through |
  eliminated`), `groupPositionBounds` (the Finish column), `resolveGroupSlots` /
  `resolveSettledSlots`, `reachableOrderings`, `newlyClinched`, `clinchHeadline`,
  `clinchBadge`.

  **It does not enumerate scorelines.** The football siblings walk every scoreline
  (0–8 goals a side) because goal difference is criterion 2 and the range is
  small. A basketball game is 40–120 points a side; that walk is hopeless at any
  cap worth having. FIBA's rules give a better lever: head-to-head is criterion 2
  and depends only on games *between the tied teams*, so whenever those are
  already played the block's order is fully determined regardless of the rest.
  The engine therefore walks only **win/loss** outcomes (2^remaining, at most 64
  for a four-team group) and leaves a block whose internal games are outstanding
  as genuinely uncertain. Soundness comes from that last case: it can only
  under-claim, never issue a false clinch.

  The 2nd/3rd distinction is not cosmetic: they enter *different* qualification
  games, so pinning one down resolves a real bracket slot.
- `eliminationCheck.js` — `eliminationStatus`, `survivingTeams`, `isAlive`. A thin
  layer over `clinch.js` rather than a second engine: the win/loss space is always
  small enough that the clinch analysis is exact, so there is nothing for a
  fallback to add and duplicating it would only risk the two disagreeing.
- `opponentClinch.js` — `lockedOpponent`. A two-group question for a 2nd/3rd
  placing; **never resolvable for a group winner**, whose opponent is the winner of
  an unplayed game. That asymmetry is the price of the bye.

**Projection & bracket**
- `asItStands.js` — `projectKnockout`: the provisional projection. Returns
  `perGroup[g] = { first, second, third }`, each with the `round` it lands in and
  either an `opponent` or an `opponentLabel` (the pending feed).
- `bracketResolve.js` — `resolveBracket` (full pipeline), `resolveKnockoutSlots`,
  `decideGame`. Conservative: a slot stays a placeholder until genuinely settled.
  Resolution FILLS `t1`/`t2` and leaves the labels intact.
- `bracket.js` — `BRACKET` (the two-sided layout), `gamesByNum`, `groupSlotMap`,
  `feederTeams`, `pathToFinal`, `knockoutTeams`. A group winner's `pathToFinal` is
  one game shorter than a qualification-round team's.
- `slots.js` — the slot-label grammar (`ENTRY_ROUND = 'QR'`, `BYE_ROUND = 'QF'`,
  `groupPlacing`, `slotLabels`, `entryGames`, `groupFedGames`, `enteredAt`). Note
  the labels say **Game**, not Match: the wording is part of FIBA's data.

**Misc**
- `scenarios.js` — deterministic what-if picks (two outcomes per game, no draw),
  `possibleOrderings`, `groupStageArchived` / `stageArchived`.
- `tournamentStats.js` — `teamRecord` (the game-detail "tale of the tape", W–L with
  overtime rather than W–D–L with shootouts), `activeTeams`, `tournamentTotals`.
  There is deliberately no scorer race; see the module header.
- `venue.js` — `venueFor`, which falls back to a Berlin placeholder for a game
  whose arena FIBA has not assigned. Both arenas are in Berlin, so the city and
  timezone are known even when the building is not.
- `time.js` — `formatTime`, `dayKey`, **`gameDayKey`**, `gameStatus`, `liveState`,
  `statusFlag`, `teamLocalKickoffs`, `timezoneOptions`.
- `week.js`, `search.js`, `urlState.js`, `ics.js` — week bucketing, filtering,
  shareable-URL (de)serialization, `.ics` generation.

## `src/components` & `src/context`

`App.jsx` is the shell: data loop, filters, timezone, spoiler mode, view routing,
result alerts and the group-phase-archived gating. `VIEWS` has **five** entries
(`schedule`, `week`, `groups`, `scenarios`, `bracket`), and any view not in it
degrades to the Bracket, which is what an old `?view=outlook` or `?view=stats`
deep link now does.

There is **no Outlook view and no Stats view** in this edition. The Outlook
enumerated goal-difference margins in a web worker, which is the same
combinatorics basketball scores break; a points leaderboard would need per-player
box scores, which is out of scope. Both were removed rather than ported and left
inert.

Views: `Standings`, `Bracket`, `WeekView`, `ScenariosView`. Cards/modals:
`MatchCard`, `MatchDetail`, `DayMatchesModal`, `GroupGamesModal`, `CalendarModal`,
`Filters`, `NextMatch`, `ChampionBanner`, `LiveBadge`, `FeederPair`, `PathPicker`,
`ScoreToasts`, `ScalesIcon`. Cross-cutting state lives in `context/`
(`follow.jsx` for starred teams, `path.jsx` for the traced route, `detail.js` for
the game-detail modal).

`ScalesIcon` exists because the ⚖️ emoji renders as a missing glyph on some
devices; the tie-break marker is inline SVG, not a character.

**Storage keys are all `fwwc:`.** The hub and every sibling viewer are served from
one origin (`ismayc.github.io`), so `localStorage` is shared and a borrowed prefix
silently reads another app's preferences. `test/guards.test.js` enforces it.

## `scripts` — data regeneration & CI

Run with `node scripts/<name>.mjs`. These must use **only Node built-ins and
in-repo source** (no npm deps), enforced by `test/guards.test.js`, because the
refresh workflow runs them before any `npm install`.

- **`official.mjs`** — FIBA's published schedule, frozen. The authority for
  structure and tip-off times, plus `VENUE_META`, `FLAGS`, `GROUPS`, `TIP_WINDOWS`
  and `KNOWN_ESPN_TIME_BUGS`. FIBA publishes no keyless JSON schedule API, so
  unlike the FIFA sibling this authority is a hand-transcribed copy of the
  official PDF sheet rather than a live API.
- **`fetch-tournament.mjs`** (`npm run fetch:tournament`) — merges that authority
  with ESPN and writes `src/data/{games,teams,venues}.js`. **Fails** if ESPN and
  FIBA disagree about which teams meet, or about a tip-off in a way that is not
  already recorded.
- **`coverage-badge.mjs`** — turns the coverage summary into the shields endpoint.

## Outside `src`

- `netlify/functions/calendar.js` — the auto-updating `webcal://` `.ics` feed. It
  is **ESM on purpose** (the package is `"type": "module"`, so a CommonJS function
  502s on the Netlify Git-build path), it is ESPN-backed, and it carries its own
  `VENUE_ALIASES` because a function cannot import from the app's source tree.
  It must use **site.web.api**: a Netlify function runs on a datacenter IP, which
  `site.api` refuses.
- `test/` — Vitest suite (units + jsdom component tests). `test/fixtures/`
  freezes ESPN's real payload so the suite never touches the network.
- `.github/workflows/refresh-data.yml` — the cron that keeps the snapshot current.
  It has two jobs, not one: pick up scores, and pick up the twelve final-phase
  fixtures ESPN has not published yet. Scoped to the tournament window by a date
  check in the job, since GitHub cron cannot express a date range.

## Conventions

- **Purity downstream of the merge.** Logic takes a `games` array and returns
  derived data; no module mutates its input.
- **Conservative resolution.** Clinch/bracket code commits an outcome only when
  mathematically guaranteed; provisional views are where "what could happen" lives.
- **Basketball has no draw.** A level score on a completed record is a data error,
  not a draw. Every module treats it that way: the ranking skips it, `teamRecord`
  skips it, and `decideGame` returns null rather than inventing a winner.
- **Module header comments are the spec.** Before changing a util, read its top
  comment. It states the invariant the rest of the code and the tests rely on.
- **Internal naming still says `match` in places** (`MatchCard`, `MatchDetail`, the
  `matches` prop). The DATA layer was renamed to `games`/`GAMES`, which is what the
  sport and FIBA call them, and all user-facing copy says "game"; the component
  names were left alone deliberately, as a wholesale rename would have churned
  every file for no behavioral gain. If you rename them, do it in one pass.
