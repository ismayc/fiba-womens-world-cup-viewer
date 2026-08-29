// Team-name normalisation and the match-pair key, shared by the live source and
// the score reconciler.
//
// WHY THIS IS ITS OWN MODULE. The sibling viewers keep these helpers inside
// their OpenFootball results module, because that module is the source of
// record and everything else hangs off it. This edition has no OpenFootball
// feed at all — OpenFootball publishes the MEN'S World Cups only; there is no
// women's repo in any format — so this app runs a single runtime source (ESPN)
// and the helpers had nowhere neutral to live. They are source-agnostic by
// nature, so they live here rather than inside a feed module.
//
// Matching strategy (feed match -> our static schedule): the (order-independent)
// team pair, scoped by the caller to a kickoff date where it needs to be. A pair
// is only ambiguous if the same two teams meet twice in a day, which no
// tournament format allows.
//
// A knockout tie can therefore only be matched once BOTH sides are real teams:
// while our schedule still says "Winner Group A" there is no pair to match, so
// the feed contributes nothing until the tie is filled in — by which point the
// result it carries is the one we want anyway. Group matches match from the
// start, since both teams are known at the draw.

import { FLAG_BY_TEAM } from '../data/teams.js'

// Feed spellings that differ from ours. Empty here: the three FIFA divergences
// ("China PR", "Korea Republic", "USA") are resolved at BUILD time by
// scripts/fetch-tournament.mjs, and ESPN's own divergences are handled by
// ESPN_ALIASES in espn.js. The seam stays because an unmapped spelling fails
// silently — the lookup returns a non-team and the match is quietly dropped.
const ALIASES = {}

export function normalizeTeam(name) {
  if (!name) return name
  return ALIASES[name] || name
}

// A "real" team is one of the 32 qualified sides (not a placeholder like "2A").
export function isRealTeam(name) {
  return Boolean(FLAG_BY_TEAM[normalizeTeam(name)])
}

export function pairKey(a, b) {
  return 'pair:' + [a, b].sort().join('|')
}
