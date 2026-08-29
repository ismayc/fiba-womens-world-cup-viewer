// Clinch / elimination detection. For each group we enumerate every possible
// outcome of its remaining games and ask what is already GUARANTEED for each
// team, using the FIBA tie-breakers in qualification.js.
//
// WHY THIS DOES NOT ENUMERATE SCORELINES, unlike every football sibling.
//
// The football viewers enumerate actual scorelines (0-8 goals a side, ~81
// combinations per fixture) because goal difference is criterion 2 and a goal
// tally is small enough to walk exhaustively. A basketball game is decided by
// 40-120 points a side. Walking those scorelines is not merely slow, it is
// combinatorially hopeless: a single fixture is already ~10,000 pairs, and a
// group with three left would be 10^12. Porting the sibling's `goalCap` /
// `scorelinesUpTo` approach here does not work at any cap worth having.
//
// FIBA's rules give a much better lever instead. Head-to-head is criterion 2,
// BEFORE overall point difference, and criteria 2-4 depend ONLY on the games
// played between the tied teams. So whenever the games among a tied block are
// already final, that block's order is fully determined no matter how the rest
// of the group turns out, exactly, with no enumeration of margins at all.
//
// The engine therefore enumerates only WIN/LOSS outcomes (2^remaining, at most
// 64 for a 4-team group, so always affordable) and, for each outcome:
//
//   * ranks by FIBA points, which W/L alone determines exactly;
//   * resolves any block of teams level on points by head-to-head WHEN every
//     game inside that block has been played;
//   * leaves a block whose internal games are still outstanding, or which
//     head-to-head cannot separate, as GENUINELY UNCERTAIN: every team in it
//     can reach every rank the block spans.
//
// That last case is where soundness comes from: an unresolved block is treated
// pessimistically, so the engine can only ever under-claim. It reports nothing
// rather than guessing, and never a false "clinched".

import { TEAMS } from '../data/teams.js'
import {
  ADVANCING_PER_GROUP,
  DIRECT_TO_QF,
  GROUP_GAME_COUNT,
  LOSS_POINTS,
  WIN_POINTS,
  headToHead,
  rankGroup,
} from './qualification.js'

const GROUPS = Object.keys(TEAMS)

// A game counts as decided only once it is FINAL. A live game carries a running
// score, but its outcome is not settled, so it is treated as remaining, exactly
// like an unplayed fixture. Counting a live score as final would clinch teams a
// result while they are still merely winning.
const isFinal = (g) => g.score && !g.live && !g.voided

const groupGames = (group, games) =>
  games.filter((g) => g.stage === 'Group' && g.group === group)

// Order a block of teams level on points, as far as the tie-breakers can be
// known. Returns the block as an ordered list of RUNS: each run is a set of
// teams this engine cannot separate, and the runs themselves are in finishing
// order. A run of one is a settled placing.
//
// The block can be ordered exactly only if every game between its members is
// already final: criteria 2-4 read nothing else. Otherwise, and for any
// sub-block head-to-head cannot separate, the members stay in one run, which is
// the conservative answer.
function blockRuns(block, group, played, assumedWins) {
  if (block.length === 1) return [block]

  const inBlock = new Set(block)
  const internalPending = assumedWins.some(([g]) => inBlock.has(g.t1) && inBlock.has(g.t2))
  if (internalPending) return [block]

  // Every game inside the block is played, so head-to-head is fully known.
  const sub = headToHead(block, group, played)
  const sorted = [...block].sort(
    (a, b) => sub[b].Pts - sub[a].Pts || sub[b].PD - sub[a].PD || sub[b].PF - sub[a].PF,
  )
  const same = (x, y) =>
    sub[x].Pts === sub[y].Pts && sub[x].PD === sub[y].PD && sub[x].PF === sub[y].PF

  // Teams head-to-head cannot separate fall through to overall point difference
  // and points scored (criteria 5-6), which depend on the margins of games not
  // yet played and so unknowable here, so they stay in one run.
  const runs = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && same(sorted[i], sorted[j])) j++
    runs.push(sorted.slice(i, j))
    i = j
  }
  return runs
}

// The whole group as ordered runs, for one win/loss assignment.
function runsForOutcome(group, names, played, assumedWins) {
  const pts = pointsFor(names, played, assumedWins)
  const order = [...names].sort((a, b) => pts[b] - pts[a])
  const runs = []
  let i = 0
  while (i < order.length) {
    let j = i + 1
    while (j < order.length && pts[order[j]] === pts[order[i]]) j++
    runs.push(...blockRuns(order.slice(i, j), group, played, assumedWins))
    i = j
  }
  return runs
}

// Spans (0-based rank offsets) implied by a run list.
function spansFromRuns(runs) {
  const out = {}
  let base = 0
  for (const run of runs) {
    for (const n of run) out[n] = { best: base, worst: base + run.length - 1 }
    base += run.length
  }
  return out
}

function pointsFor(names, played, assumedWins) {
  const pts = {}
  for (const n of names) pts[n] = 0
  const record = (winner, loser) => {
    pts[winner] += WIN_POINTS
    pts[loser] += LOSS_POINTS
  }
  for (const g of played) {
    const [a, b] = g.score
    if (a === b) continue
    if (a > b) record(g.t1, g.t2)
    else record(g.t2, g.t1)
  }
  for (const [g, winner] of assumedWins) {
    record(winner, winner === g.t1 ? g.t2 : g.t1)
  }
  return pts
}

// Enumerate every win/loss completion of a group's remaining games and collect,
// per team, the set of final ranks it can reach.
//
// A basketball game cannot be drawn, so each remaining game has exactly TWO
// outcomes and the whole space is 2^remaining, at most 64 in a 4-team group,
// against the 3^remaining the football siblings need for draws. There is no
// budget guard and no infeasible branch: the space is always small enough.
function analyzeGroup(group, games) {
  const all = groupGames(group, games)
  const played = all.filter(isFinal)
  const remaining = all.filter((g) => !isFinal(g))
  const names = TEAMS[group].map((t) => t.name)

  const reach = {}
  for (const n of names) reach[n] = { best: Infinity, worst: 0 }

  eachOutcome(remaining, (assumed) => {
    const spans = spansFromRuns(runsForOutcome(group, names, played, assumed))
    for (const n of names) {
      reach[n].best = Math.min(reach[n].best, spans[n].best + 1)
      reach[n].worst = Math.max(reach[n].worst, spans[n].worst + 1)
    }
  })

  return { group, names, reach }
}

// Walk every win/loss completion of `remaining`, calling back with the list of
// [game, assumedWinner] pairs. 2^remaining, at most 64 in a 4-team group.
function eachOutcome(remaining, fn) {
  const assumed = []
  const visit = (i) => {
    if (i === remaining.length) {
      fn(assumed)
      return
    }
    const g = remaining[i]
    for (const winner of [g.t1, g.t2]) {
      assumed.push([g, winner])
      visit(i + 1)
      assumed.pop()
    }
  }
  visit(0)
}

// Every distinct final ORDERING of a group still reachable, as "A>B>C>D" keys.
//
// A run the tie-breakers cannot separate contributes all permutations of its
// members, because any of those orders could still come about once the margins
// of the outstanding games are known. Powers the Scenarios view's "how open is
// this group?" count.
export function reachableOrderings(group, games) {
  const all = groupGames(group, games)
  const played = all.filter(isFinal)
  const remaining = all.filter((g) => !isFinal(g))
  const names = TEAMS[group].map((t) => t.name)

  const seen = new Set()
  eachOutcome(remaining, (assumed) => {
    for (const ord of expandRuns(runsForOutcome(group, names, played, assumed))) {
      seen.add(ord.join('>'))
    }
  })
  return seen
}

// Cartesian expansion of ordered runs into every concrete ordering.
function expandRuns(runs) {
  let out = [[]]
  for (const run of runs) {
    const perms = permutations(run)
    const next = []
    for (const prefix of out) for (const p of perms) next.push(prefix.concat(p))
    out = next
  }
  return out
}

function permutations(items) {
  if (items.length <= 1) return [items]
  const out = []
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1))
    for (const p of permutations(rest)) out.push([items[i], ...p])
  }
  return out
}

// Public: map of team name -> clinch status string (or null).
//   'won-group'  — guaranteed to finish 1st, so guaranteed the quarter-final bye
//   'second'     — guaranteed to finish EXACTLY 2nd
//   'third'      — guaranteed to finish EXACTLY 3rd
//   'through'    — guaranteed top three, but the exact placing is still open
//   'eliminated', cannot reach the top three under any remaining results
//   null         — still undecided
//
// The 2nd/3rd distinction is not cosmetic here the way a football runner-up
// badge is: 2nd and 3rd enter DIFFERENT qualification-round games (2nd of A
// plays game 25, 3rd of A plays game 26), so pinning one down resolves a real
// bracket slot.
export function computeClinch(games) {
  const status = {}
  for (const g of GROUPS) {
    const { names, reach } = analyzeGroup(g, games)
    for (const name of names) {
      const { best, worst } = reach[name]
      if (worst <= DIRECT_TO_QF) status[name] = 'won-group'
      else if (best === 2 && worst === 2) status[name] = 'second'
      else if (best === 3 && worst === 3) status[name] = 'third'
      else if (worst <= ADVANCING_PER_GROUP) status[name] = 'through'
      else if (best > ADVANCING_PER_GROUP) status[name] = 'eliminated'
      else status[name] = null
    }
  }
  return status
}

// The window of final group positions (1-4) still arithmetically open to each
// team. Exact wherever the tie-breakers are knowable, conservative elsewhere
// (see resolveBlock). best === worst means the position is locked. Powers the
// Finish column in the standings tables.
export function groupPositionBounds(games) {
  const out = {}
  for (const g of GROUPS) {
    const { names, reach } = analyzeGroup(g, games)
    for (const n of names) out[n] = { best: reach[n].best, worst: reach[n].worst }
  }
  return out
}

// group letter -> the team that has clinched a given placing (if any).
function clinchedAt(clinch, wanted) {
  const out = {}
  for (const g of GROUPS) {
    const hit = TEAMS[g].find((t) => clinch?.[t.name] === wanted)
    if (hit) out[g] = hit.name
  }
  return out
}

export const groupWinners = (clinch) => clinchedAt(clinch, 'won-group')

// Fill final-phase slot labels with the teams whose group placing is settled, so
// a resolved team flows through to EVERY consumer (bracket, game-detail modal,
// schedule cards, calendar) rather than just one view.
//
// All three placings are resolved here, unlike the football sibling where only
// the group winner can clinch early and the runner-up waits for the group to
// finish. That difference is a consequence of the tie-break order: with
// head-to-head ahead of overall point difference, 2nd and 3rd can be locked in
// as soon as the games among the contenders are played, which is often a round
// before the group ends.
//
// A final-phase game keeps its labels in `label1`/`label2` and carries null
// teams until resolved, so this fills `t1`/`t2` and leaves the labels intact.
export function resolveGroupSlots(games, clinch) {
  const fill = {
    1: groupWinners(clinch),
    2: clinchedAt(clinch, 'second'),
    3: clinchedAt(clinch, 'third'),
  }
  const patterns = [
    [1, /^Winner Group ([A-D])$/],
    [2, /^2nd Group ([A-D])$/],
    [3, /^3rd Group ([A-D])$/],
  ]
  const sub = (label) => {
    for (const [place, re] of patterns) {
      const hit = re.exec(label || '')
      if (hit && fill[place][hit[1]]) return fill[place][hit[1]]
    }
    return null
  }
  return games.map((g) => {
    if (g.stage === 'Group') return g
    const t1 = g.t1 ?? sub(g.label1)
    const t2 = g.t2 ?? sub(g.label2)
    return t1 === g.t1 && t2 === g.t2 ? g : { ...g, t1, t2 }
  })
}

// Once a group's games are ALL final its table is settled, so every placing is
// known even if no team clinched early. Belt and braces alongside the clinch
// path above, and the guarantee that a finished group always resolves.
export function settledGroupPlacings(games) {
  const out = {}
  for (const g of GROUPS) {
    const gg = groupGames(g, games)
    if (gg.length < GROUP_GAME_COUNT || !gg.every(isFinal)) continue
    const rows = rankGroup(g, gg)
    out[g] = { 1: rows[0]?.name, 2: rows[1]?.name, 3: rows[2]?.name }
  }
  return out
}

export function resolveSettledSlots(games) {
  const placings = settledGroupPlacings(games)
  if (!Object.keys(placings).length) return games
  const patterns = [
    [1, /^Winner Group ([A-D])$/],
    [2, /^2nd Group ([A-D])$/],
    [3, /^3rd Group ([A-D])$/],
  ]
  const sub = (label) => {
    for (const [place, re] of patterns) {
      const hit = re.exec(label || '')
      if (hit && placings[hit[1]]?.[place]) return placings[hit[1]][place]
    }
    return null
  }
  return games.map((g) => {
    if (g.stage === 'Group') return g
    const t1 = g.t1 ?? sub(g.label1)
    const t2 = g.t2 ?? sub(g.label2)
    return t1 === g.t1 && t2 === g.t2 ? g : { ...g, t1, t2 }
  })
}

// Teams whose clinch status newly changed between two sets of results: a new
// clinch, an upgrade (e.g. through → won-group), or a new elimination.
export function newlyClinched(beforeGames, afterGames) {
  const before = computeClinch(beforeGames)
  const after = computeClinch(afterGames)
  const changes = []
  for (const g of GROUPS) {
    for (const t of TEAMS[g]) {
      const now = after[t.name]
      if (now && now !== before[t.name]) changes.push({ team: t.name, group: g, status: now })
    }
  }
  return changes
}

// One-line announcement for a clinch change, for the notification email.
export function clinchHeadline({ team, group, status }) {
  switch (status) {
    case 'won-group':
      return `🥇 ${team} have WON Group ${group} and go straight to the quarter-finals`
    case 'second':
      return `🥈 ${team} have finished 2nd in Group ${group}, into the qualification round`
    case 'third':
      return `🥉 ${team} have finished 3rd in Group ${group}, into the qualification round`
    case 'through':
      return `✅ ${team} are THROUGH from Group ${group} (top three)`
    case 'eliminated':
      return `❌ ${team} are ELIMINATED from Group ${group}`
    /* v8 ignore next 2 -- unreachable: computeClinch only emits the five statuses above */
    default:
      return `${team} (Group ${group}): ${status}`
  }
}

// Short label + tooltip for a status, for the UI. Returns null for null status.
export function clinchBadge(status) {
  switch (status) {
    case 'won-group':
      return { cls: 'c-won', label: '🥇', text: 'Won group', title: 'Has clinched first place: a bye straight to the quarter-finals' }
    case 'second':
      return { cls: 'c-silver', label: '🥈', text: '2nd', title: 'Has clinched second place, into the qualification round' }
    case 'third':
      return { cls: 'c-bronze', label: '🥉', text: '3rd', title: 'Has clinched third place, into the qualification round' }
    case 'through':
      return { cls: 'c-in', label: '✅', text: 'Through', title: 'Has clinched a top-three finish, through to the final phase, placing still open' }
    case 'eliminated':
      return { cls: 'c-out', label: '❌', text: 'Eliminated', title: 'Cannot reach the top three under any remaining results' }
    default:
      return null
  }
}
