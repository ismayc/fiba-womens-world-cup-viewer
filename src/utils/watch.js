// The streaming services and TV packages a viewer can tell us they have, so the
// schedule can flag which games they can actually watch, and filter to them.
//
// US rights to this edition sit with Warner Bros. Discovery, and ESPN's per-game
// broadcast field names exactly three outlets: HBO Max, TNT and truTV. That is a
// far smaller catalog than the football and WNBA siblings need, but the question
// it answers is sharper, because the split is lopsided:
//
//   16 of the 24 group games are HBO MAX ONLY
//    8 are on TNT and/or truTV
//
// So a viewer with a cable package and no HBO Max can watch a third of the group
// phase, and one with HBO Max and no cable can watch two thirds. "Can I watch
// this?" is a real question here rather than a formality.
//
// A live-TV BUNDLE (YouTube TV, Hulu + Live TV, Fubo, Sling, DirecTV Stream,
// cable) never appears in ESPN's list by name: it carries a game whenever the
// game airs on a linear network the bundle carries. Each bundle is therefore
// defined by the networks it carries. Carriage differs by bundle and, in
// reality, by market and over time; these are the national defaults and are
// deliberately approximate.
//
// HBO MAX IS NOT IN ANY BUNDLE. It is a separate subscription, so a bundle
// matches only the TNT/truTV games. Warner Bros. Discovery does often simulcast
// its linear sports on HBO Max, but ESPN's per-game field is what we have and
// what we can verify, so the matching follows the data rather than an assumption
// about simulcast rights. The modal says so.

const TNT = 'TNT'
const TRUTV = 'truTV'
const HBOMAX = 'HBO Max'

// carries(...names) -> a matcher that is true when a game's broadcast list names
// any of them.
const carries = (...names) => {
  const set = new Set(names)
  return (tv) => tv.some((n) => set.has(n))
}

// Ordered streaming first, then live-TV bundles. This is also the display order
// for badges and for the picker. `kind` only labels the picker.
export const SERVICE_CATALOG = [
  { key: 'hbomax', label: 'HBO Max', kind: 'stream', match: carries(HBOMAX) },
  { key: 'youtubetv', label: 'YouTube TV', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'hulu', label: 'Hulu + Live TV', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'fubo', label: 'Fubo', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'sling', label: 'Sling TV', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'directv', label: 'DirecTV Stream', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'cable', label: 'Cable / Satellite', kind: 'bundle', match: carries(TNT, TRUTV) },
]

// THERE IS NO LOCAL-CHANNEL PICKER. The WNBA sibling derives one from the market
// feeds its schedule names (Prime Video-Seattle, KOMO-TV, …), because carriage of
// a local station is market-dependent and no single answer is right. A single
// national rights-holder covers every game of this tournament, so every entry in
// the catalog above is national and a local shelf would always be empty.

export const SERVICE_BY_KEY = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.key, s]))

export const SERVICE_KEYS = SERVICE_CATALOG.map((s) => s.key)

// Does ESPN know where this game is on yet?
//
// FALSE for all twelve final-phase games until ESPN publishes those fixtures.
// That is genuinely UNKNOWN, not "not on your services", and the two must not be
// conflated: hiding the Final from a viewer who filtered to their own services
// would be worse than showing it with the coverage still to be confirmed.
export function hasKnownBroadcast(game) {
  return Boolean(game?.tv?.length)
}

// The viewer's selected services (by key) that carry this game, in catalog order.
// Returns [] when nothing is selected or the broadcast is unknown, so a viewer
// who has not chosen services sees no personalized badge.
export function watchableServices(tv, selectedKeys) {
  if (!tv?.length || !selectedKeys?.length) return []
  const selected = new Set(selectedKeys)
  return SERVICE_CATALOG.filter((s) => selected.has(s.key) && s.match(tv))
}

// Should this game survive the "on my services" filter?
//
// A game whose coverage is not yet published is KEPT: we cannot say it is
// unwatchable, and dropping the entire final phase out of a filtered schedule
// would read as a bug. Everything else must be carried by a selected service.
export function isWatchable(game, selectedKeys) {
  if (!selectedKeys?.length) return true
  if (!hasKnownBroadcast(game)) return true
  return watchableServices(game.tv, selectedKeys).length > 0
}

// Broadcast entries not already shown as a personalized 📺 badge, so a game on
// HBO Max (with HBO Max selected) renders one "📺 HBO Max" badge rather than the
// redundant "HBO Max · 📺 HBO Max". A bundle badge (YouTube TV) does not match a
// network name, so the underlying network is left in place beside it.
export function broadcastNotBadged(tv, watched) {
  if (!tv?.length) return []
  const shown = new Set((watched || []).map((s) => s.label))
  return tv.filter((n) => !shown.has(n))
}

// How much of the tournament a selection can actually watch, for the picker's
// footer. `unknown` is counted separately rather than folded into either side.
export function coverageSummary(games, selectedKeys) {
  let watchable = 0
  let unknown = 0
  let total = 0
  for (const g of games) {
    total++
    if (!hasKnownBroadcast(g)) {
      unknown++
      continue
    }
    if (watchableServices(g.tv, selectedKeys).length > 0) watchable++
  }
  return { watchable, unknown, total, known: total - unknown }
}
