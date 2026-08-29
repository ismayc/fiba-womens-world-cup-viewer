// Scoped search: parse a query like `team: Japan arena: Berlin` into field
// filters plus leftover free text. Unscoped text still does a broad substring
// match, so plain queries ("Japan", "schmeling") keep working.

import { STAGE_LABELS } from '../data/games.js'
import { sideNames } from './slots.js'

// Accepted field names (and synonyms) -> canonical field.
//
// THERE IS NO `region` FIELD. The football sibling separates its two host
// countries by region (Australian state / New Zealand region), and its venue
// records carry one. This edition is played in two arenas in a single city, so
// `venues.js` has no `region` at all, and the inherited case read
// `venue.region.toLowerCase()` — which throws on any `region:` query. The field
// is removed rather than left to crash.
const FIELD_ALIASES = {
  team: 'team', teams: 'team', t: 'team',
  city: 'city',
  arena: 'arena', stadium: 'arena', venue: 'arena', ground: 'arena',
  country: 'country', host: 'country',
  group: 'group', grp: 'group', g: 'group',
  stage: 'stage', round: 'stage',
}

// Stage synonyms -> our stage codes. Every code in STAGE_ORDER needs at least
// one, or that round is unreachable by a scoped `stage:` query — which is how
// the qualification round was missed at first, since no football sibling has one.
const STAGE_SYN = {
  group: 'Group', groups: 'Group', gs: 'Group',

  qr: 'QR', qual: 'QR', qualification: 'QR', 'qualification round': 'QR',
  'qualifying': 'QR', playin: 'QR', 'play-in': 'QR',

  qf: 'QF', quarter: 'QF', quarterfinal: 'QF', quarterfinals: 'QF', 'quarter-final': 'QF',
  sf: 'SF', semi: 'SF', semifinal: 'SF', semifinals: 'SF', 'semi-final': 'SF',
  '3rd': '3rd', third: '3rd', 'third place': '3rd', 'third-place': '3rd', bronze: '3rd',
  final: 'Final',
}

export function parseQuery(input) {
  const q = (input || '').trim()
  const re = /(\w+):\s*/g
  const marks = []
  let m
  while ((m = re.exec(q))) {
    marks.push({ key: m[1].toLowerCase(), start: m.index, valStart: m.index + m[0].length })
  }

  if (marks.length === 0) return { free: q, tokens: [] }

  const tokens = []
  let free = q.slice(0, marks[0].start).trim()
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : q.length
    const value = q.slice(marks[i].valStart, end).trim()
    const field = FIELD_ALIASES[marks[i].key]
    if (field && value) tokens.push({ field, value })
    else if (value) free = `${free} ${value}`.trim() // unknown field -> free text
  }
  return { free, tokens }
}

function matchStage(stage, v) {
  const code = STAGE_SYN[v]
  if (code) return stage === code
  return STAGE_LABELS[stage].toLowerCase().includes(v)
}

// A final-phase game carries NULL teams until the draw resolves it. The
// inherited version read `m.t1.toLowerCase()` unconditionally, which threw on
// every one of the twelve final-phase records: typing `team: Japan` into the
// search box took the whole schedule down.
const sidesOf = sideNames

function tokenMatch(m, venue, { field, value }) {
  const v = value.toLowerCase()
  switch (field) {
    case 'team':
      return sidesOf(m).some((side) => side.toLowerCase().includes(v))
    case 'city':
      return venue.city.toLowerCase().includes(v)
    // Matches EITHER the name FIBA prints or the one ESPN files it under, so a
    // viewer who searches the sponsor name they saw on television still finds
    // the game. Only the Berlin Arena has two names.
    case 'arena':
      return (
        venue.name.toLowerCase().includes(v) ||
        (venue.sponsorName || '').toLowerCase().includes(v)
      )
    case 'country':
      return venue.country.toLowerCase().includes(v)
    case 'group':
      return (m.group || '').toLowerCase() === v.replace(/^group\s*/, '')
    case 'stage':
      return matchStage(m.stage, v)
    /* v8 ignore next 2 -- unreachable: `field` is a value from FIELD_ALIASES, and every one of them has a case above */
    default:
      return true
  }
}

export function matchesSearch(m, venue, parsed) {
  for (const t of parsed.tokens) {
    if (!tokenMatch(m, venue, t)) return false
  }
  if (parsed.free) {
    const hay = `${sidesOf(m).join(' ')} ${venue.city} ${venue.name} ${
      venue.sponsorName || ''
    } ${venue.country} ${m.group ? 'group ' + m.group : ''} ${STAGE_LABELS[m.stage]}`.toLowerCase()
    if (!hay.includes(parsed.free.toLowerCase())) return false
  }
  return true
}
