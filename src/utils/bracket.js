// Final-phase bracket layout. FIBA's game numbering is not in bracket order, so
// each round is ordered explicitly here: the boxes that feed a later box sit
// next to each other vertically, producing a readable two-sided bracket that
// meets at the Final.

import { FLAG_BY_TEAM } from '../data/teams.js'
import { GAMES } from '../data/games.js'
import {
  BYE_ROUND,
  ENTRY_ROUND,
  FEED_LABEL,
  GROUP_FED_ROUNDS,
  WINNER_GAME,
  groupFedGames,
  groupPlacing,
  slotLabels,
} from './slots.js'

// A still-unresolved feed slot ("Winner Game 27" / "Loser Game 33") expands to
// the two teams of the game it feeds from, ONCE that game has both real teams:
// the "potential matchup" (e.g. "🇦🇺 Australia / 🇹🇷 Türkiye"). Returns
// { a, b, kind, num } or null for a real team, a non-feed label, or a source
// game that is not yet resolved. `byNum` maps game number → (resolved) game.
export function feederTeams(label, byNum) {
  const hit = FEED_LABEL.exec(label)
  if (!hit || !byNum) return null
  const fg = byNum[Number(hit[2])]
  if (!fg || !FLAG_BY_TEAM[fg.t1] || !FLAG_BY_TEAM[fg.t2]) return null
  return { a: fg.t1, b: fg.t2, kind: hit[1], num: fg.num }
}

// THE WIRING, quoted from FIBA's published schedule sheet:
//
//   QR  25: 2nd A - 3rd B      26: 2nd B - 3rd A
//       27: 3rd C - 2nd D      28: 3rd D - 2nd C
//   QF  29: 1st A - W27        30: 1st B - W28
//       31: 1st C - W25        32: 1st D - W26
//   SF  33: W29 - W32          34: W30 - W31
//   3rd 35: L33 - L34          Final 36: W33 - W34
//
// TWO CROSSOVERS, IN OPPOSITE DIRECTIONS. The qualification round crosses A<->B
// and C<->D. The quarter-finals then cross the OTHER way: the A and B group
// winners meet the C/D qualification winners, and the C and D winners meet the
// A/B ones. That second crossover is why no team can face a group opponent
// again in the quarter-finals, and it is the thing most likely to be "tidied"
// into a wrong-but-tidier bracket. It is not a mistake. Do not straighten it.
//
// The two halves are therefore { 29, 32 } (meeting in game 33) and { 30, 31 }
// (game 34), NOT { 29, 30 } and { 31, 32 }, which the numbering suggests.
//
// A quarter-final box has only ONE feeding box beneath it, because its other
// slot is a group winner arriving on a bye. The QR row consequently has one box
// per quarter-final rather than two, and the bracket is intentionally lopsided.
//
// Like the World Cup and unlike the Euro, a third-place game is played (35). It
// hangs off the bracket rather than sitting in it, so it gets its own key, and
// it is the only place the "Loser Game N" feed form appears.
export const BRACKET = {
  left: {
    QR: [27, 26],
    QF: [29, 32],
    SF: [33],
  },
  final: [36],
  right: {
    SF: [34],
    QF: [30, 31],
    QR: [28, 25],
  },
  third: [35],
}

export function gamesByNum(games) {
  return games.reduce((acc, g) => {
    acc[g.num] = g
    return acc
  }, {})
}

// Map each group letter to the games its 1st, 2nd and 3rd place feed into,
// parsed from the placeholder labels. Unlike a top-two-advance format, a group
// has THREE outgoing routes here, and the winner's route lands a round later
// than the other two.
//
//   { A: { win: 29, second: 25, third: 26 }, ... }
export function groupSlotMap(games) {
  const map = {}
  const slot = (g) => (map[g] ||= { win: null, second: null, third: null })
  const key = { 1: 'win', 2: 'second', 3: 'third' }
  for (const g of groupFedGames(games)) {
    for (const side of slotLabels(g)) {
      const hit = groupPlacing(side)
      if (hit) slot(hit.group)[key[hit.place]] = g.num
    }
  }
  return map
}

// Static winner-advancement edges: game number → the game its WINNER feeds into.
// Parsed once from the original "Winner Game N" labels. The Final has no parent,
// and neither does the third-place game: its winner advances nowhere, and it is
// fed by "Loser Game N".
const KO_WINNER_PARENT = (() => {
  const parent = {}
  for (const g of GAMES) {
    for (const side of slotLabels(g)) {
      const hit = WINNER_GAME.exec(side)
      if (hit) parent[Number(hit[1])] = g.num
    }
  }
  return parent
})()

// Winner of a FINISHED game; null while it is live, voided or unplayed.
//
// Basketball has no draw: overtime is played until a team wins, so a completed
// game always yields a winner and there is no shootout branch to consider. A
// level score on a completed record is a data error, not a draw, and returns
// null rather than inventing a winner. A local mirror of decideGame's rule, kept
// here to avoid dragging the whole resolver into this widely imported module.
function koWinner(g) {
  if (!g || !Array.isArray(g.score) || g.live || g.voided) return null
  const [a, b] = g.score
  if (a > b) return g.t1
  if (b > a) return g.t2
  return null
}

// Real teams that have reached the final phase: a QR or QF slot filled with an
// actual team, sorted. The candidates for a "path to the Final" trace.
export function knockoutTeams(byNum) {
  const set = new Set()
  for (const g of groupFedGames(Object.values(byNum))) {
    for (const t of [g.t1, g.t2]) if (FLAG_BY_TEAM[t]) set.add(t)
  }
  return [...set].sort()
}

// Trace one team's route through the final phase, inward to the Final. The route
// is structural (fixed by the bracket topology), so it exists whether the team is
// still alive or already out. Returns:
//   nums    — the full route, entry → Final (game numbers, outer to inner)
//   here    — the route games the team is actually a participant in
//   exitNum: the game where the team was knocked out, or null (alive/champion)
//   active  — the stretch of the route to highlight: the whole route while the
//             team is alive, or only through its exit once eliminated
//   entry   — the round the team joined at, 'QR' or 'QF'
//
// A GROUP WINNER'S ROUTE IS ONE GAME SHORTER than a qualification-round team's,
// because it starts at the quarter-final. That is the concrete prize for winning
// a group here, and the reason this function looks for the team's earliest
// group-fed game rather than assuming the entry round.
//
// Returns null when the team has not reached the final phase. The third-place
// game is deliberately not part of a route: it is a consolation branch off the
// semi-final, not a step toward the trophy.
export function pathToFinal(team, byNum) {
  if (!team) return null
  const candidates = Object.values(byNum)
    .filter((g) => GROUP_FED_ROUNDS.includes(g.stage) && (g.t1 === team || g.t2 === team))
    .sort((a, b) => a.num - b.num)
  // Prefer the qualification round: a team that played it entered there, and its
  // quarter-final appearance is a later step on the same route, not a new entry.
  const entryGame =
    candidates.find((g) => g.stage === ENTRY_ROUND) ||
    candidates.find((g) => g.stage === BYE_ROUND)
  if (!entryGame) return null

  const nums = []
  for (let cur = entryGame.num; cur != null; cur = KO_WINNER_PARENT[cur]) nums.push(cur)
  const here = nums.filter((n) => {
    const g = byNum[n]
    return g && (g.t1 === team || g.t2 === team)
  })
  let exitNum = null
  for (const n of here) {
    const w = koWinner(byNum[n])
    if (w && w !== team) { exitNum = n; break }
  }
  const active = exitNum == null ? nums : nums.slice(0, nums.indexOf(exitNum) + 1)
  return { team, nums, here, exitNum, active, entry: entryGame.stage }
}
