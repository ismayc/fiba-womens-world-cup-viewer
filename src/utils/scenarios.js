// Deterministic "what-if" helpers for the Scenarios tab. No probabilities: the
// user picks the result of each remaining group game and we recompute the exact
// standings and projected final phase that those results would produce.

import { TEAMS } from '../data/teams.js'
import { reachableOrderings } from './clinch.js'

const GROUPS = Object.keys(TEAMS)

// Representative scorelines for the quick pick buttons.
//
// THERE IS NO DRAW BUTTON. Basketball plays overtime until a team wins, so a
// level result is not a possible outcome and offering one would let the user
// build a board the ranking engine treats as a data error. The football
// siblings' three-way home/draw/away control is a two-way control here.
//
// The scores are representative rather than meaningful: the per-team steppers
// let the user set any exact score, which matters because point difference is a
// FIBA tie-breaker and a one-point win ranks differently from a thirty-point one.
export const PICK_SCORES = {
  home: [78, 70],
  away: [70, 78],
}

// The win/loss category of a scoreline, for highlighting the quick buttons.
// A level score has no category: see PICK_SCORES.
export function pickOutcome(score) {
  if (!Array.isArray(score)) return null
  if (score[0] > score[1]) return 'home'
  if (score[0] < score[1]) return 'away'
  return null
}

// Group games still to be played (no final score, not voided), grouped by group
// letter in game order. Groups with nothing left are omitted.
export function remainingGroupGames(games) {
  const open = games
    .filter((g) => g.stage === 'Group' && !Array.isArray(g.score) && !g.voided)
    .sort((a, b) => a.num - b.num)
  const byGroup = {}
  for (const g of open) (byGroup[g.group] = byGroup[g.group] || []).push(g)
  return byGroup
}

// A new games array with each picked scoreline filled in. `picks` maps a game
// number to a [t1, t2] score. Unpicked games are left "to be played".
export function applyScenarioPicks(games, picks) {
  if (!picks || !Object.keys(picks).length) return games
  return games.map((g) => {
    const p = picks[g.num]
    return Array.isArray(p) ? { ...g, score: [p[0], p[1]] } : g
  })
}

// Groups that still have at least one unplayed game.
export function openGroups(games) {
  const open = remainingGroupGames(games)
  return GROUPS.filter((g) => open[g] && open[g].length)
}

// True once a stage is in the rear-view: every one of its games is final
// (played, not live/settling and not voided). Used to collapse completed stages
// out of the Schedule, and (for the group phase) to retire the group-only tools.
export function stageArchived(games, stage) {
  const inStage = games.filter((g) => g.stage === stage && !g.voided)
  return inStage.length > 0 && inStage.every((g) => Array.isArray(g.score) && !g.live)
}

// The group phase is done, retire the group-only tools (Scenarios) from the nav
// the moment the final phase takes over.
export function groupStageArchived(games) {
  return stageArchived(games, 'Group')
}

// How many of the remaining group games are still unpicked.
export function unpickedCount(games, picks) {
  const open = remainingGroupGames(games)
  let n = 0
  for (const g of Object.keys(open)) {
    for (const game of open[g]) if (!Array.isArray(picks?.[game.num])) n++
  }
  return n
}

// How many DISTINCT final standings (orderings of the four teams) are still
// reachable for a group, given the results already set. Returns
// { count, decided }.
//
// Unlike the football siblings this never returns a null "too big to enumerate"
// count. Those walk every scoreline (goal difference is criterion 2 there and
// the goal range is small); this walks only win/loss outcomes, at most 2^6 = 64
// for a whole group, because FIBA's head-to-head-first ordering makes margins
// irrelevant except as a final tie-break. See clinch.js for the full argument.
export function possibleOrderings(group, games) {
  const orderings = reachableOrderings(group, games)
  return { count: orderings.size, decided: orderings.size === 1 }
}
