// Everything the match-detail modal shows that is not in the committed snapshot: the
// per-player box score, the quarter line score and the team-stat comparison. All of it
// comes from ONE ESPN summary request per game open, keyless and CORS-open like the live
// overlay, so the modal fans a single fetch out into three sections.
//
// None of this can be committed at build time: a box score does not exist until tip-off
// and keeps changing through the game. Fetching on open costs one request and works
// retroactively for any played game. Ported from the-wnba-schedule's summary service;
// the FIBA feed carries the same boxscore shape (checked against event 401907390,
// Japan v Mali, September 4, 2026), with two differences handled here: the player
// blocks carry no `homeAway`, so sides are matched to the game by team NAME, and the
// header line scores carry only `displayValue`.

import { normEspn } from './espn.js'

// site.web.api, not site.api: the two serve identical routes, but site.api 403s on a
// browser User-Agent with no CORS headers. See espn.js.
export const SUMMARY_URL =
  'https://site.web.api.espn.com/apis/site/v2/sports/basketball/fiba/summary'

// ── Player box score ──────────────────────────────────────────────────
// REB already sums OREB+DREB, so drop those two to keep the wide table narrower.
const HIDDEN_PLAYER_COLS = new Set(['offensiveRebounds', 'defensiveRebounds'])

function parsePlayer(entry, columns) {
  const a = entry.athlete ?? {}
  const stats = {}
  for (const c of columns) stats[c.key] = entry.stats?.[c.index] ?? null
  // ESPN files every FIBA player at position "NA": the feed has no positions for this
  // competition, and "NA" beside all 24 names is noise, not information.
  const pos = a.position?.abbreviation ?? null
  return {
    id: a.id ?? null,
    name: a.displayName ?? 'Unknown',
    pos: pos === 'NA' ? null : pos,
    dnp: entry.didNotPlay === true,
    stats,
  }
}

function parseSide(block) {
  const box = block.statistics?.[0]
  const keys = box?.keys ?? []
  // `keys` are stable identifiers; resolve each column's header by index rather than
  // hardcoding a position, so a reordered feed drops a stat instead of mislabeling one.
  const labels = box?.labels ?? []
  const columns = keys
    .map((key, index) => ({ key, index, label: labels[index] ?? key }))
    .filter((c) => !HIDDEN_PLAYER_COLS.has(c.key))

  const athletes = (box?.athletes ?? []).map((e) => ({
    starter: e.starter === true,
    player: parsePlayer(e, columns),
  }))

  const totalsRaw = box?.totals ?? null
  const totals = totalsRaw
    ? Object.fromEntries(columns.map((c) => [c.key, totalsRaw[c.index] ?? '']))
    : null

  // Whether a real stat line exists yet: pre-tip, athletes may be listed with empties.
  const hasStats = athletes.some((x) => x.player.stats.points != null && x.player.stats.points !== '')

  return {
    name: block.team?.displayName ?? null,
    columns: columns.map(({ key, label }) => ({ key, label })),
    starters: athletes.filter((x) => x.starter).map((x) => x.player),
    bench: athletes.filter((x) => !x.starter).map((x) => x.player),
    totals,
    hasStats,
  }
}

function parseBox(data) {
  const sides = (data.boxscore?.players ?? []).map(parseSide)
  // No starters posted: the normal pre-tip state, so nothing to show yet.
  if (!sides.some((s) => s.starters.length)) return null
  return { sides, hasStats: sides.some((s) => s.hasStats) }
}

// ── Line score ────────────────────────────────────────────────────────
// One row per side, in feed order, each with its per-period points. Null unless both
// sides carry a line, which is the case for every played game and no unplayed one.
function parseLinescore(data) {
  const sides = (data.header?.competitions?.[0]?.competitors ?? []).map((c) => ({
    name: c.team?.displayName ?? null,
    periods: (c.linescores ?? []).map((l) => l.displayValue ?? ''),
  }))
  if (sides.length !== 2 || sides.some((s) => !s.periods.length)) return null
  return sides
}

// ── Team-stat comparison ──────────────────────────────────────────────
// A curated subset of ESPN's team stats, in reading order. `num` marks a plain number
// whose better side gets bolded; `lowerBetter` flips that (turnovers).
const TEAM_STATS = [
  { name: 'fieldGoalsMade-fieldGoalsAttempted', label: 'FG' },
  { name: 'fieldGoalPct', label: 'FG%', num: true },
  { name: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', label: '3PT' },
  { name: 'threePointFieldGoalPct', label: '3P%', num: true },
  { name: 'freeThrowsMade-freeThrowsAttempted', label: 'FT' },
  { name: 'totalRebounds', label: 'REB', num: true },
  { name: 'assists', label: 'AST', num: true },
  { name: 'steals', label: 'STL', num: true },
  { name: 'blocks', label: 'BLK', num: true },
  { name: 'totalTurnovers', label: 'TO', num: true, lowerBetter: true },
  { name: 'pointsInPaint', label: 'Paint', num: true },
  { name: 'fastBreakPoints', label: 'Fast break', num: true },
]

function parseTeamStats(data) {
  const teams = data.boxscore?.teams ?? []
  if (teams.length !== 2) return null
  const [a, b] = teams
  const get = (t, name) => (t.statistics ?? []).find((s) => s.name === name)?.displayValue ?? null

  const rows = TEAM_STATS.map((st) => {
    const av = get(a, st.name)
    const bv = get(b, st.name)
    let better = null // 0 | 1 | null: which side to bold
    if (st.num && av != null && bv != null) {
      const an = parseFloat(av)
      const bn = parseFloat(bv)
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
        const higher = an > bn ? 0 : 1
        better = st.lowerBetter ? 1 - higher : higher
      }
    }
    return { label: st.label, values: [av, bv], better }
  }).filter((r) => r.values[0] != null || r.values[1] != null)

  return rows.length ? { names: [a.team?.displayName ?? null, b.team?.displayName ?? null], rows } : null
}

// ── Side ordering ─────────────────────────────────────────────────────
// The modal shows the game as t1 v t2. The feed's sides are matched to that order by
// team name (through the same alias table the live overlay uses, so "KOR" for Mali or
// any future re-spelling resolves the same way everywhere). A name that matches neither
// side keeps feed order rather than guessing.
export function orderSides(sides, match) {
  if (!sides || sides.length !== 2) return sides
  const want = [normEspn(match.t1 ?? ''), normEspn(match.t2 ?? '')]
  const got = sides.map((s) => normEspn(s.name ?? ''))
  if (got[0] === want[1] && got[1] === want[0]) return [sides[1], sides[0]]
  return sides
}

// Returns { box, linescore, teamStats }, each null when absent, or null only when the
// request itself fails (offline, feed hiccup), so the modal can say so quietly.
export async function fetchGameSummary(eventId, { signal } = {}) {
  let data
  try {
    const res = await fetch(`${SUMMARY_URL}?event=${eventId}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch {
    return null
  }
  return {
    box: parseBox(data),
    linescore: parseLinescore(data),
    teamStats: parseTeamStats(data),
  }
}
