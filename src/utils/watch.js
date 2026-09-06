// The streaming services and TV packages a viewer can tell us they have, so the
// schedule can flag which games they can actually watch, and filter to them.
//
// US rights to this edition sit with Warner Bros. Discovery, whose published
// table (frozen in scripts/official.mjs) names five outlets: TNT, TBS, truTV,
// HBO Max and DAZN. The shape of the split is what makes the question worth
// asking at all:
//
//   BOTH STREAMERS CARRY ALL 36 GAMES. DAZN sells FIBA's own Courtside 1891 as
//   a standalone subscription; HBO Max carries the same 36 but only on a
//   Standard or Premium plan, so a Basic With Ads subscriber sees none of them
//   without upgrading. That is a real difference between two entries that would
//   otherwise look identical, and it is why both are listed.
//
//   ONLY 9 OF THE 36 GAMES ARE ON LINEAR TV (7 of the 24 group games, plus the
//   third-place game and the Final; three more rounds have a truTV/TNT/TBS
//   window announced without a per-game split, which rides on `tvNote` rather
//   than being claimed here). So a viewer with a cable package and no streaming
//   subscription can watch a quarter of the tournament, and either streamer
//   covers all of it.
//
// A live-TV BUNDLE (YouTube TV, Hulu + Live TV, Fubo, Sling, DirecTV Stream,
// cable) never appears in the table by name: it carries a game whenever the
// game airs on a linear network the bundle carries. Each bundle is therefore
// defined by the networks it carries. Carriage differs by bundle and, in
// reality, by market and over time; these are the national defaults and are
// deliberately approximate.
//
// NEITHER STREAMER IS IN ANY BUNDLE. Both are separate subscriptions, so a
// bundle matches only the TNT/TBS/truTV games. Warner Bros. Discovery does
// simulcast its linear sports on HBO Max, which is precisely why HBO Max is
// listed on every game in the data rather than being inferred from a bundle.

const TNT = 'TNT'
const TBS = 'TBS'
const TRUTV = 'truTV'
const HBOMAX = 'HBO Max'
const DAZN = 'DAZN'

// carries(...names) -> a matcher that is true when a game's broadcast list names
// any of them.
const carries = (...names) => {
  const set = new Set(names)
  return (tv) => tv.some((n) => set.has(n))
}

// Ordered streaming first, then live-TV bundles. This is also the display order
// for badges and for the picker. `kind` only labels the picker.
export const SERVICE_CATALOG = [
  { key: 'dazn', label: 'DAZN', kind: 'stream', match: carries(DAZN) },
  { key: 'hbomax', label: 'HBO Max', kind: 'stream', match: carries(HBOMAX) },
  { key: 'youtubetv', label: 'YouTube TV', kind: 'bundle', match: carries(TNT, TBS, TRUTV) },
  { key: 'hulu', label: 'Hulu + Live TV', kind: 'bundle', match: carries(TNT, TBS, TRUTV) },
  { key: 'fubo', label: 'Fubo', kind: 'bundle', match: carries(TNT, TBS, TRUTV) },
  { key: 'sling', label: 'Sling TV', kind: 'bundle', match: carries(TNT, TBS, TRUTV) },
  { key: 'directv', label: 'DirecTV Stream', kind: 'bundle', match: carries(TNT, TBS, TRUTV) },
  { key: 'cable', label: 'Cable / Satellite', kind: 'bundle', match: carries(TNT, TBS, TRUTV) },
]

// THERE IS NO LOCAL-CHANNEL PICKER. The WNBA sibling derives one from the market
// feeds its schedule names (Prime Video-Seattle, KOMO-TV, …), because carriage of
// a local station is market-dependent and no single answer is right. A single
// national rights-holder covers every game of this tournament, so every entry in
// the catalog above is national and a local shelf would always be empty.

export const SERVICE_BY_KEY = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.key, s]))

export const SERVICE_KEYS = SERVICE_CATALOG.map((s) => s.key)

// Is there a published platform for this game?
//
// TRUE for all 36 now that coverage comes from WBD's own table rather than from
// ESPN's per-fixture field: the knockout platforms were announced in August, so
// a game with no ESPN id still knows where it will be shown. It stays a real
// question rather than a constant because a game whose `tv` is empty must not be
// read as "not on your services": hiding the Final from a viewer who filtered to
// their own services would be worse than showing it with coverage unconfirmed.
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
