// Group ranking + qualification using FIBA's official classification rules
// (FIBA Internal Regulations, Book 2, applied to the Women's World Cup 2026).
//
// THE POINTS SYSTEM IS NOT FOOTBALL'S. A win is 2 points, a LOSS IS 1 POINT, and
// only a forfeit scores 0. Every team plays three group games, so a team's total
// is 3 + wins and the standings order by points is identical to the order by
// wins, but the table shows FIBA points, because that is what the organizer
// publishes and what the tie-break rules are written against.
//
// Criteria, applied to teams level on points:
//   1. Points earned in all group games
//   Then, among the tied teams, over the games BETWEEN THEM only:
//   2. Head-to-head points
//   3. Head-to-head point difference
//   4. Head-to-head points scored
//   Then, among teams still level, over ALL group games:
//   5. Point difference
//   6. Points scored
//   Then: a drawing of lots.
//
// NOTE the order: head-to-head comes BEFORE overall point difference. That is
// the OPPOSITE of the FIFA Women's World Cup 2023 sibling this repo was grown
// from, where overall goal difference is criterion 2 and head-to-head is only
// criterion 4. Porting that file's ordering back into this one silently
// reorders any group where two level teams have met. Do not "restore" it.
//
// FIBA ALSO RESTARTS THE PROCEDURE, which football does not. When a criterion
// separates some but not all of a tied set, the teams that are still level are
// re-ranked from criterion 1 using a fresh sub-table among only themselves. A
// flat lexicographic sort gives a different (and wrong) answer whenever a
// three-way tie breaks into a one and a two. See resolveTie().
//
// There is no fair-play criterion in basketball, so there is no conduct score
// and nothing reads a card feed.

import { TEAMS, RANK_BY_TEAM } from '../data/teams.js'

const GROUPS = Object.keys(TEAMS)
export const GROUP_GAME_COUNT = 6 // 4 teams => 6 games per group

// FIBA's points scale.
export const WIN_POINTS = 2
export const LOSS_POINTS = 1

// How many teams survive each group. Three of four: the winner byes to the
// quarter-finals, 2nd and 3rd drop into the qualification round, 4th is out.
// This is the single source of truth for the clinch, elimination and projection
// engines, which all import it from here.
export const ADVANCING_PER_GROUP = 3

// How many go STRAIGHT to the quarter-finals. Exactly the group winner: the
// distinction the whole bracket hangs on, and the reason finishing first is
// worth far more here than in a top-two-advance tournament.
export const DIRECT_TO_QF = 1

// FIBA settles a total tie by drawing lots, which no viewer can compute. This
// stands in for it with the FIBA World Ranking (April 1 2026, see RANK_BY_TEAM),
// strongest first, so the order is stable, repeatable and a defensible guess at
// what the draw would produce. It is a DISPLAY order, not FIBA's rule:
// utils/tiebreakNotes.js still surfaces "would have gone to lots" wherever it
// actually bites, so the table never claims the ranking decided anything.
//
// It matters most before a ball is thrown. With every team 0-0 the entire group
// is one tied block, so this comparator alone orders the opening table and the
// projected final phase; alphabetical order put Mali above Spain.
export const byLots = (a, b) => RANK_BY_TEAM[a] - RANK_BY_TEAM[b]

function blank(team, group) {
  return { ...team, group, P: 0, W: 0, L: 0, PF: 0, PA: 0, PD: 0, Pts: 0 }
}

// A basketball game cannot be drawn: overtime is played until someone wins, so
// every scored game increments exactly one W and one L. Any record that claims
// a level final score is a data error rather than a draw, and is skipped so it
// cannot silently award both teams a win.
function baseStats(group, games) {
  const rows = {}
  for (const t of TEAMS[group]) rows[t.name] = blank(t, group)
  for (const g of games) {
    if (g.stage !== 'Group' || g.group !== group || !g.score || g.voided) continue
    const [p1, p2] = g.score
    if (p1 === p2) continue
    const a = rows[g.t1]
    const b = rows[g.t2]
    if (!a || !b) continue
    a.P++; b.P++
    a.PF += p1; a.PA += p2
    b.PF += p2; b.PA += p1
    if (p1 > p2) { a.W++; b.L++ } else { b.W++; a.L++ }
  }
  for (const k in rows) {
    const r = rows[k]
    r.PD = r.PF - r.PA
    r.Pts = r.W * WIN_POINTS + r.L * LOSS_POINTS
  }
  return rows
}

// Head-to-head sub-table among exactly the given (tied) team names, counting
// only the games played between them.
export function headToHead(names, group, games) {
  const set = new Set(names)
  const sub = {}
  for (const n of names) sub[n] = { Pts: 0, PD: 0, PF: 0 }
  for (const g of games) {
    if (g.stage !== 'Group' || g.group !== group || !g.score) continue
    if (!set.has(g.t1) || !set.has(g.t2)) continue
    const [p1, p2] = g.score
    if (p1 === p2) continue
    sub[g.t1].PF += p1; sub[g.t2].PF += p2
    sub[g.t1].PD += p1 - p2; sub[g.t2].PD += p2 - p1
    if (p1 > p2) { sub[g.t1].Pts += WIN_POINTS; sub[g.t2].Pts += LOSS_POINTS }
    else { sub[g.t2].Pts += WIN_POINTS; sub[g.t1].Pts += LOSS_POINTS }
  }
  return sub
}

// Rank a set of teams that are level on points, per FIBA's criteria 2-6.
//
// `depth` guards the recursion: resolveTie recurses only when a pass has
// genuinely split the set into smaller pieces, so it terminates on its own, but
// a defensive cap keeps a malformed board from spinning.
function resolveTie(tied, group, games, depth = 0) {
  /* v8 ignore next -- unreachable: rankGroup only calls this for a block of 2+, and the recursion below is guarded by block.length > 1 */
  if (tied.length === 1) return tied

  const names = tied.map((t) => t.name)
  const sub = headToHead(names, group, games)

  // Criteria 2-4 among the tied teams only, then 5-6 across all group games.
  const sorted = [...tied].sort(
    (a, b) =>
      sub[b.name].Pts - sub[a.name].Pts ||
      sub[b.name].PD - sub[a.name].PD ||
      sub[b.name].PF - sub[a.name].PF ||
      b.PD - a.PD ||
      b.PF - a.PF ||
      byLots(a.name, b.name),
  )

  // FIBA's restart rule. Group the teams this pass could not separate and
  // re-run the whole procedure on each such block with a sub-table built from
  // only its own members, which is a different, smaller head-to-head table
  // than the one just used, and can order them differently.
  const same = (x, y) =>
    sub[x.name].Pts === sub[y.name].Pts &&
    sub[x.name].PD === sub[y.name].PD &&
    sub[x.name].PF === sub[y.name].PF &&
    x.PD === y.PD &&
    x.PF === y.PF

  const out = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && same(sorted[i], sorted[j])) j++
    const block = sorted.slice(i, j)
    // Only recurse when this pass actually shrank the set, or the restart would
    // rebuild the identical table and recurse forever.
    if (block.length > 1 && block.length < tied.length && depth < 4) {
      out.push(...resolveTie(block, group, games, depth + 1))
    } else {
      out.push(...block)
    }
    i = j
  }
  return out
}

export function rankGroup(group, games) {
  const rows = Object.values(baseStats(group, games))
  // Criterion 1: FIBA points. Ties are then broken by resolveTie.
  rows.sort((a, b) => b.Pts - a.Pts)

  const ordered = []
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && rows[j].Pts === rows[i].Pts) j++
    const tied = rows.slice(i, j)
    ordered.push(...(tied.length > 1 ? resolveTie(tied, group, games) : tied))
    i = j
  }
  return ordered.map((r, idx) => ({ ...r, rank: idx + 1 }))
}

export function groupComplete(group, games) {
  return (
    games.filter((g) => g.stage === 'Group' && g.group === group && g.score).length >=
    GROUP_GAME_COUNT
  )
}

// Full tournament qualification picture. Every group is independent: there is no
// cross-group comparison anywhere in this format, because all four groups send
// the same three teams onward and the 4th-placed sides are simply eliminated.
export function computeQualification(games) {
  const groups = {}
  const completion = {}
  for (const g of GROUPS) {
    groups[g] = rankGroup(g, games)
    completion[g] = groupComplete(g, games)
  }
  const allComplete = GROUPS.every((g) => completion[g])
  return { groups, completion, allComplete }
}

// Per-row qualification status for the standings UI.
// 'qf'  = group winner, straight to the quarter-finals
// 'qr'  = 2nd or 3rd, into the qualification round
// 'out' = eliminated
// null  = group still in progress, so nothing is settled by position alone.
export function rowStatus(row, group, qual) {
  if (!qual.completion[group]) return null
  if (row.rank <= DIRECT_TO_QF) return 'qf'
  return row.rank <= ADVANCING_PER_GROUP ? 'qr' : 'out'
}
