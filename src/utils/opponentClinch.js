// Final-phase opponent clinch detection.
//
// "Has team X clinched a specific next opponent?" is more than "has X
// advanced": it asks whether the opponent is the SAME team in every remaining
// completion of the group phase. Being conservative (only certain once every
// group finishes) under-claims: a matchup can be mathematically locked while
// other groups are still playing.
//
// THE ANSWER DEPENDS ON WHERE THE TEAM ENTERS, which is the thing that makes
// this different from the football siblings' two-group question:
//
//   * A team that finishes 2nd or 3rd enters the qualification round, and its
//     opponent is another group's 2nd or 3rd. That locks as soon as BOTH
//     placings are clinched: a two-group question, exactly like the siblings.
//
//   * A GROUP WINNER byes to a quarter-final, where its opponent is the winner
//     of a qualification-round GAME. No group table can ever settle that: it
//     needs the qualification-round game to actually be played. So a group
//     winner's opponent cannot be locked by clinching alone, and this returns
//     null for it until that game is decided, at which point the ordinary
//     bracket resolution has already filled the slot anyway.
//
// That asymmetry is real, not an oversight: winning your group buys a bye, and
// the price is finding out who you play later than everyone else.

import { TEAMS } from '../data/teams.js'
import { GAMES } from '../data/games.js'
import { computeClinch } from './clinch.js'
import { groupFedGames, groupPlacing, slotLabels } from './slots.js'

const GROUPS = Object.keys(TEAMS)

// Static group-fed slot labels by game number. The live feed resolves some of
// these to real team names, so always read the invariant labels from the
// committed schedule.
const SLOTS = groupFedGames(GAMES).map((g) => ({
  num: g.num,
  stage: g.stage,
  slots: slotLabels(g),
}))

// Which clinch status pins a team to a given placing.
const STATUS_FOR_PLACE = { 1: 'won-group', 2: 'second', 3: 'third' }
const PLACE_FOR_STATUS = { 'won-group': 1, second: 2, third: 3 }

// The locked next opponent for `team`, or null if it is not mathematically
// fixed yet. `clinch` may be passed in to avoid recomputing it, useful when
// resolving many teams at once.
export function lockedOpponent(games, team, clinch = computeClinch(games)) {
  const place = PLACE_FOR_STATUS[clinch[team]]
  // Only a fixed finishing placing gives a determinate matchup to resolve.
  if (!place) return null
  const group = GROUPS.find((g) => TEAMS[g].some((t) => t.name === team))
  /* v8 ignore next -- unreachable: `team` comes from a clinch verdict, which is only ever keyed by a team that is in a group */
  if (!group) return null

  const game = SLOTS.find((s) =>
    s.slots.some((label) => {
      const p = groupPlacing(label)
      return p && p.group === group && p.place === place
    }),
  )
  /* v8 ignore next -- unreachable: every placing that can clinch has a slot in the committed schedule */
  if (!game) return null

  const mine = game.slots.findIndex((label) => {
    const p = groupPlacing(label)
    return p && p.group === group && p.place === place
  })
  const oppLabel = game.slots[mine === 0 ? 1 : 0]
  const oppPlacing = groupPlacing(oppLabel)

  // A "Winner Game N" opponent is not a group placing and cannot be clinched
  // from the tables: see the header. This is the group-winner case.
  if (!oppPlacing) return null

  const wanted = STATUS_FOR_PLACE[oppPlacing.place]
  const opp = TEAMS[oppPlacing.group].map((t) => t.name).find((n) => clinch[n] === wanted)
  return opp ? { opponent: opp, gameNum: game.num, round: game.stage } : null
}
