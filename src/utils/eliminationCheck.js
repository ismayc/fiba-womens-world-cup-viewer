// EXACT "is this team still mathematically alive?" check.
//
// This is a thin layer over clinch.js's group analysis rather than a second
// enumeration engine. The football siblings need their own copy here because
// their clinch engine's scoreline walk can exceed its budget and go silent,
// leaving elimination to be answered by a separate, more generous pass. This
// edition has no such gap: the win/loss space of a four-team group is at most
// 2^6 = 64 outcomes, so the clinch engine is ALWAYS exact and there is nothing
// for a fallback to add. Duplicating it would only risk the two disagreeing.
//
// "Alive" means the team can still finish in the top THREE of its group, since
// three of four advance, 4th place is the only elimination. That is a lower bar
// than the football siblings' top-two, and it is why so few teams are out before
// the final round of group games.

import { TEAMS } from '../data/teams.js'
import { groupPositionBounds } from './clinch.js'
import { ADVANCING_PER_GROUP } from './qualification.js'

const GROUPS = Object.keys(TEAMS)

// Per-team verdict: 'eliminated' | 'alive'. 'alive' means there exists SOME
// completion of the remaining games in which the team finishes in the top three.
export function eliminationStatus(games) {
  const bounds = groupPositionBounds(games)
  const status = {}
  for (const g of GROUPS) {
    for (const t of TEAMS[g]) {
      status[t.name] = bounds[t.name].best <= ADVANCING_PER_GROUP ? 'alive' : 'eliminated'
    }
  }
  return status
}

// Every team still able to reach the final phase.
export function survivingTeams(games) {
  const status = eliminationStatus(games)
  return Object.keys(status).filter((n) => status[n] === 'alive').sort()
}

export function isAlive(games, team) {
  return eliminationStatus(games)[team] === 'alive'
}
