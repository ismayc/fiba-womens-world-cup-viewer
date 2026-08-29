// Scoped search: parse a query like `team: Mexico city: Dallas` into field
// filters plus leftover free text. Unscoped text still does a broad substring
// match, so plain queries ("Brazil", "azteca") keep working.

import { STAGE_LABELS } from '../data/games.js'

// Accepted field names (and synonyms) -> canonical field.
const FIELD_ALIASES = {
  team: 'team', teams: 'team', t: 'team',
  city: 'city',
  stadium: 'stadium', venue: 'stadium', ground: 'stadium',
  country: 'country', host: 'country',
  group: 'group', grp: 'group', g: 'group',
  stage: 'stage', round: 'stage',
  region: 'region',
}

// Stage synonyms -> our stage codes.
const STAGE_SYN = {
  group: 'Group', groups: 'Group', gs: 'Group',

  qf: 'QF', quarter: 'QF', quarterfinal: 'QF', quarterfinals: 'QF', 'quarter-final': 'QF',
  sf: 'SF', semi: 'SF', semifinal: 'SF', semifinals: 'SF', 'semi-final': 'SF',
  '3rd': '3rd', third: '3rd', 'third place': '3rd', 'third-place': '3rd',
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

// This edition was CO-HOSTED, so every venue's country is the single combined
// string "Australia & New Zealand". A substring test therefore makes either host
// name match all 64 matches, which is correct — the field cannot narrow anything
// here, and `region` is the filter that separates the two countries. The sibling
// viewers carry a US synonym table ("usa" / "us" / "america") for their
// single-host "United States"; no venue here spells a country any of those ways,
// so that table would be dead code and is deliberately absent.
function matchCountry(country, v) {
  return country.toLowerCase().includes(v)
}

function matchStage(stage, v) {
  const code = STAGE_SYN[v]
  if (code) return stage === code
  return STAGE_LABELS[stage].toLowerCase().includes(v)
}

function tokenMatch(m, venue, { field, value }) {
  const v = value.toLowerCase()
  switch (field) {
    case 'team':
      return m.t1.toLowerCase().includes(v) || m.t2.toLowerCase().includes(v)
    case 'city':
      return venue.city.toLowerCase().includes(v)
    case 'stadium':
      return venue.name.toLowerCase().includes(v)
    case 'country':
      return matchCountry(venue.country, v)
    case 'region':
      return venue.region.toLowerCase().includes(v)
    case 'group':
      return (m.group || '').toLowerCase() === v.replace(/^group\s*/, '')
    case 'stage':
      return matchStage(m.stage, v)
    default:
      return true
  }
}

export function matchesSearch(m, venue, parsed) {
  for (const t of parsed.tokens) {
    if (!tokenMatch(m, venue, t)) return false
  }
  if (parsed.free) {
    const hay = `${m.t1} ${m.t2} ${venue.city} ${venue.name} ${venue.country} ${venue.region} ${
      m.group ? 'group ' + m.group : ''
    } ${STAGE_LABELS[m.stage]}`.toLowerCase()
    if (!hay.includes(parsed.free.toLowerCase())) return false
  }
  return true
}
