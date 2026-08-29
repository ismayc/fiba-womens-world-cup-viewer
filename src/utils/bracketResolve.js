// Resolve final-phase bracket placeholders into real teams as the tournament
// progresses, completing what clinch.js starts for the group slots:
//
//   • "Winner Game N" / "Loser Game N" slots fill from each final-phase result,
//     propagating up the bracket round by round. The LOSER form matters because
//     this tournament plays a third-place game (35), whose two slots are the
//     beaten semi-finalists.
//
// All resolution is conservative: a slot stays a placeholder until its outcome
// is genuinely settled, so the bracket never shows a team that could still
// change. The Standings "as it stands" panel is where provisional projections
// live.
//
// A game record here keeps its labels in `label1`/`label2` permanently and
// carries `t1`/`t2` null until resolved, FIBA publishes the wiring long before
// the teams, so resolution FILLS the team fields rather than overwriting the
// labels. That is the opposite way round from the football siblings, where the
// labels start out in `t1`/`t2` and get replaced.

import { TEAMS } from '../data/teams.js'
import { resolveGroupSlots, resolveSettledSlots } from './clinch.js'
import { WINNER_GAME, LOSER_GAME } from './slots.js'

const ALL_TEAMS = new Set(Object.values(TEAMS).flat().map((t) => t.name))

// A result counts only once FINAL: a live score is provisional, a voided game
// has no result. (The same rule the clinch engine uses for group games.)
const isFinal = (g) => g.score && !g.live && !g.voided

// Winner / loser of a finished final-phase game.
//
// Basketball has no draw. A tie after four quarters is settled by as many
// five-minute overtime periods as it takes, and `score` already holds the final
// total including any overtime, so a completed game ALWAYS has a winner. There
// is no shootout branch and no "drawn, awaiting penalties" state: the football
// siblings' `pens` handling has no counterpart here and must not be re-added.
//
// A level score on a game marked complete is therefore a data error rather than
// a draw: this returns null so the slot stays a placeholder instead of the
// bracket inventing a winner.
export function decideGame(g) {
  if (!isFinal(g)) return null
  const [a, b] = g.score
  if (a > b) return { winner: g.t1, loser: g.t2 }
  if (b > a) return { winner: g.t2, loser: g.t1 }
  return null
}

// Fill "Winner Game N" / "Loser Game N" feed labels from finished games,
// propagating up the bracket (a round's winners feed the next). Bounded passes =
// bracket depth. A slot resolves only when BOTH of the game's teams are already
// real, otherwise the loser's name is not known, so we wait.
export function resolveKnockoutSlots(games) {
  const winner = {}
  const loser = {}
  const sub = (label) => {
    let h = WINNER_GAME.exec(label || '')
    if (h && winner[h[1]]) return winner[h[1]]
    h = LOSER_GAME.exec(label || '')
    if (h && loser[h[1]]) return loser[h[1]]
    return null
  }

  // The effective side of a game: the resolved team if there is one, else
  // whatever its original slot label resolves to now.
  const sideOf = (g, which) => g[`t${which}`] ?? sub(g[`label${which}`])

  for (let pass = 0; pass < 8; pass++) {
    let changed = false
    for (const g of games) {
      if (g.stage === 'Group' || winner[g.num] != null) continue
      const t1 = sideOf(g, 1)
      const t2 = sideOf(g, 2)
      if (!ALL_TEAMS.has(t1) || !ALL_TEAMS.has(t2)) continue
      const out = decideGame({ ...g, t1, t2 })
      if (out) {
        winner[g.num] = out.winner
        loser[g.num] = out.loser
        changed = true
      }
    }
    if (!changed) break
  }

  return games.map((g) => {
    if (g.stage === 'Group') return g
    const t1 = sideOf(g, 1)
    const t2 = sideOf(g, 2)
    return t1 === g.t1 && t2 === g.t2 ? g : { ...g, t1, t2 }
  })
}

// Full bracket resolution, in dependency order: group placings that have
// clinched → placings settled by a completed group → final-phase winners and
// losers propagated up the rounds.
export function resolveBracket(games, clinch) {
  return resolveKnockoutSlots(resolveSettledSlots(resolveGroupSlots(games, clinch)))
}
