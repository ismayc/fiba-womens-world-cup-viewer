// Generate the static, subscribable calendar feed: public/calendar.ics.
//
// The 2026 tournament is complete and frozen, so the feed is a fixed file, not a
// live endpoint. The old approach backed /calendar.ics with a Netlify function that
// fetched ESPN's scoreboard on each request. That no longer works: ESPN dropped
// date-RANGE scoreboard queries family-wide (the `dates=A-B` form now returns HTTP
// 400), so the function's `if (!res.ok) return 502` made the production feed a hard
// 502. ESPN's basketball/fiba slug is also time-multiplexed, so it will stop serving
// the 2026 event entirely once it advances to the next fiba competition. A static
// file built from the committed schedule sidesteps both.
//
// The events are produced by the app's OWN builder (utils/ics.js buildICSCollection,
// the exact code behind the "Download all games" button), so a subscribed calendar
// and a downloaded file are byte-for-byte identical apart from DTSTAMP. `matches` is
// resolveBracket(GAMES, computeClinch(GAMES)), the same array the app feeds the
// calendar once the live and history overlays are empty (a finished edition).
//
// DTSTAMP ("when this iCal object was authored") is frozen to a constant. The app's
// live download stamps it with the current time, which is correct for a fresh
// download but would make this committed file churn on every regenerate. A finished
// tournament's feed is authored once; the constant below is the day after the Final.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GAMES } from '../src/data/games.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { computeClinch } from '../src/utils/clinch.js'
import { buildICSCollection } from '../src/utils/ics.js'

// The day after the 2026 Final (played 2026-09-13). A static feed is authored once.
const FROZEN_DTSTAMP = '20260914T000000Z'

export function buildCalendar() {
  const matches = resolveBracket(GAMES, computeClinch(GAMES))
  const raw = buildICSCollection(matches)
  // Freeze the only non-deterministic field so the committed file is stable.
  return raw.replace(/DTSTAMP:\d{8}T\d{6}Z/g, `DTSTAMP:${FROZEN_DTSTAMP}`)
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'calendar.ics')

// Written whenever this module is the entry point (build:calendar and the prebuild
// hook); importing it from a test only pulls in buildCalendar().
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, buildCalendar())
  console.log(`Wrote ${OUT} (${GAMES.length} games)`)
}
