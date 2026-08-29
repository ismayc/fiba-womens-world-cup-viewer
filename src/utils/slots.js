// How to read a final-phase game's ORIGINAL bracket slot labels, and which
// rounds the group phase feeds into.
//
// A game record carries its slot labels in one of two ways, and every engine
// that reasons about the bracket needs the same answer from both:
//
//   • Before it is played, `t1`/`t2` may BE the labels ("Winner Group A"),
//     exactly as the fixture list was drawn.
//   • Once the teams are known, `t1`/`t2` hold the real teams and the labels
//     stay in `label1`/`label2`, so the bracket still knows the provenance of
//     each slot, which is what lets it print "Winner Group C" under Australia.
//
// This edition ships with `label1`/`label2` set on all twelve final-phase games
// from the start and `t1`/`t2` null until the draw resolves, because FIBA
// publishes the wiring long before the teams. Reading `t1` directly would work
// only for a decided tournament and would show nothing at all right now.

import { TEAMS } from '../data/teams.js'

// THE GROUP PHASE FEEDS TWO DIFFERENT ROUNDS, which is what makes this bracket
// asymmetric and unlike every sibling in this family.
//
//   * The GROUP WINNER byes straight into the quarter-finals.
//   * 2nd and 3rd enter one round earlier, in the qualification round.
//   * 4th is eliminated.
//
// So `ENTRY_ROUND` (the earliest round a team can enter) is 'QR', but a team
// that never plays a QR game has not been knocked out; it was seeded past it.
// Any code that assumes "everyone still alive played the entry round" is wrong
// here. Use `enteredAt()` rather than looking only at the entry round.
export const ENTRY_ROUND = 'QR'
export const BYE_ROUND = 'QF'
export const GROUP_FED_ROUNDS = [ENTRY_ROUND, BYE_ROUND]

// Group letters actually in use, as a regex character class, so a stray label
// naming a group this edition doesn't have fails to parse instead of quietly
// resolving to nothing halfway through.
export const GROUP_CLASS = `[${Object.keys(TEAMS).join('')}]`

export const WINNER_GROUP = new RegExp(`^Winner Group (${GROUP_CLASS})$`)
export const SECOND_GROUP = new RegExp(`^2nd Group (${GROUP_CLASS})$`)
export const THIRD_GROUP = new RegExp(`^3rd Group (${GROUP_CLASS})$`)

// FIBA calls them GAMES, not matches, and the labels on the official sheet read
// "Winner Game 27". The football siblings parse "Winner Match N"; the wording is
// part of the data, so the patterns differ deliberately.
export const WINNER_GAME = /^Winner Game (\d+)$/
export const LOSER_GAME = /^Loser Game (\d+)$/
export const FEED_LABEL = /^(Winner|Loser) Game (\d+)$/

// The placing a group-fed label refers to: 1, 2 or 3, with the group letter.
// Returns null for a feed label or a real team name.
export function groupPlacing(label) {
  let hit = WINNER_GROUP.exec(label)
  if (hit) return { group: hit[1], place: 1 }
  hit = SECOND_GROUP.exec(label)
  if (hit) return { group: hit[1], place: 2 }
  hit = THIRD_GROUP.exec(label)
  if (hit) return { group: hit[1], place: 3 }
  return null
}

// The two slot labels a game was drawn with, whether or not it has been played.
export function slotLabels(g) {
  return [g.label1 ?? g.t1, g.label2 ?? g.t2]
}

// The two sides of a game AS DISPLAYED: the resolved team when there is one,
// otherwise the slot label it was drawn with.
//
// Every view needs this, and getting it wrong is silent. A final-phase record
// carries `t1: null` until the draw resolves it, so a component that reads
// `game.t1` directly renders the whole final phase with BLANK team names — which
// is exactly what the schedule, week and day views did while the bracket, which
// had the fallback, looked fine. Read sides through here.
export function sideNames(g) {
  return [g.t1 ?? g.label1 ?? '', g.t2 ?? g.label2 ?? '']
}

// Every game whose slots are filled directly from a group table: the
// qualification round AND the quarter-finals, since a quarter-final has one
// group-winner slot and one qualification-round slot.
export function groupFedGames(games) {
  return games.filter((g) => GROUP_FED_ROUNDS.includes(g.stage))
}

// Every game of the qualification round.
export function entryGames(games) {
  return games.filter((g) => g.stage === ENTRY_ROUND)
}

// The round a given group placing enters the bracket at: the winner at the
// quarter-finals, 2nd and 3rd at the qualification round, 4th nowhere.
export function enteredAt(place) {
  if (place === 1) return BYE_ROUND
  if (place === 2 || place === 3) return ENTRY_ROUND
  return null
}
