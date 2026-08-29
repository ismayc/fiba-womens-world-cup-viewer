// "As it stands", project the final phase from the CURRENT group standings, so
// each group can show where its 1st, 2nd and 3rd would land right now.
//
// Every group has THREE outgoing routes here rather than two, and they do not
// all lead to the same round: the winner byes into a quarter-final while 2nd and
// 3rd drop into the qualification round. A group's projection therefore reports
// a different `round` per placing, and the winner's projected opponent is not a
// team at all but the winner of a qualification-round game that has not been
// played yet, so it is reported as a pending feed rather than as a name.
//
// This is a direct lookup into the live standings: every final-phase slot names
// a specific group's specific placing, and no cross-group race exists anywhere
// in this format.

import { GAMES } from '../data/games.js'
import { TEAMS } from '../data/teams.js'
import { computeQualification } from './qualification.js'
import { FEED_LABEL, groupFedGames, groupPlacing, slotLabels } from './slots.js'

const GROUPS = Object.keys(TEAMS)

// The slot labels are invariant, but the LIVE games we are handed may have had
// clinched placings already resolved to real teams, which would no longer parse
// as a slot. So read each group-fed game's labels from the STATIC schedule, by
// game number.
const SLOTS = new Map(groupFedGames(GAMES).map((g) => [g.num, slotLabels(g)]))
const STAGE_BY_NUM = new Map(GAMES.map((g) => [g.num, g.stage]))

const KEY = { 1: 'first', 2: 'second', 3: 'third' }

// Returns { perGroup } where perGroup[g] = {
//   first / second / third: {
//     team,            // the team currently in that placing
//     gameNum,         // the final-phase game it would play
//     round,           // 'QR' or 'QF': the winner enters a round later
//     opponent,        // the opposing team, when that side is also a group placing
//     opponentLabel,   // the opposing slot's label, when it is still a pending feed
//   } | null
// }
//
// There is deliberately no "is the projection settled?" flag. rankGroup always
// returns four ordered rows, so "every side has a team" is true before a ball is
// thrown up and would tell a caller nothing. A caller that needs to know whether
// a projection is final should ask computeQualification().completion for the
// groups involved, which is the question it actually means.
export function projectKnockout(games) {
  const qual = computeQualification(games)

  // placing -> group -> row
  const rows = { 1: {}, 2: {}, 3: {} }
  for (const g of GROUPS) {
    /* v8 ignore next -- unreachable: rankGroup seeds its rows from the committed group, so every group always has a 1st, 2nd and 3rd */
    for (const place of [1, 2, 3]) rows[place][g] = qual.groups[g]?.[place - 1] || null
  }

  // Every group-fed side, with its parsed slot, indexed by game.
  const sides = []
  for (const g of groupFedGames(games)) {
    /* v8 ignore next -- unreachable: SLOTS is built from the same group-fed games this loop walks, so the lookup always hits */
    const [l1, l2] = SLOTS.get(g.num) || slotLabels(g)
    sides.push({ gameNum: g.num, label: l1, placing: groupPlacing(l1) })
    sides.push({ gameNum: g.num, label: l2, placing: groupPlacing(l2) })
  }
  const byGame = new Map()
  for (const s of sides) {
    if (!byGame.has(s.gameNum)) byGame.set(s.gameNum, [])
    byGame.get(s.gameNum).push(s)
  }

  const perGroup = {}
  for (const g of GROUPS) perGroup[g] = { first: null, second: null, third: null }

  for (const s of sides) {
    if (!s.placing) continue
    /* v8 ignore next -- unreachable: every side was pushed into byGame in the loop above, so the lookup always hits */
    const other = (byGame.get(s.gameNum) || []).find((o) => o !== s)
    const row = rows[s.placing.place][s.placing.group]

    // The other side is either another group placing (so a team can be named) or
    // a "Winner Game N" feed that no group table can resolve yet. Those are the
    // only two forms a group-fed slot takes, and every such game has exactly two
    // sides, so `other` is always present.
    let opponent = null
    let opponentLabel = null
    if (other.placing) {
      /* v8 ignore next -- unreachable: `rows` is filled for every group and placing above */
      opponent = rows[other.placing.place][other.placing.group]?.name || null
    } else {
      /* v8 ignore next -- unreachable: a group-fed side that is not a placing is always a "Winner Game N" feed, so the null arm never fires */
      opponentLabel = FEED_LABEL.test(other.label) ? other.label : null
    }

    perGroup[s.placing.group][KEY[s.placing.place]] = {
      /* v8 ignore next -- unreachable: `row` comes from the filled `rows` table above */
      team: row?.name || null,
      gameNum: s.gameNum,
      /* v8 ignore next -- unreachable: STAGE_BY_NUM is built from every committed game */
      round: STAGE_BY_NUM.get(s.gameNum) || null,
      opponent,
      opponentLabel,
    }
  }
  return { perGroup }
}
