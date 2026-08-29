// Group standings. Ranking (including FIBA's tie-breakers) lives in
// qualification.js; this module keeps the small surface the Standings UI and its
// tests rely on.

import { rankGroup } from './qualification.js'

export { rankGroup }

// Ordered rows for a group, with full tie-breakers applied.
export function computeGroup(group, games) {
  return rankGroup(group, games)
}

// True once at least one game in the group has been scored.
export function groupHasResults(group, games) {
  return games.some((g) => g.stage === 'Group' && g.group === group && g.score)
}
