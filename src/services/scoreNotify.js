// Result-notification logic: detect games that have just gone FINAL across
// successive merged snapshots, so the app can raise a browser notification the
// moment a result lands. Pure + unit-tested; App.jsx owns the side effects
// (Notification permission + firing). The static site has no backend, so this
// only runs while the app is open in a tab: the existing ESPN poll (~30s while
// a game is live) is what surfaces the result.
//
// WHY FINAL SCORES AND NOT BASKETS. The football siblings notify on every goal,
// which works because a match has two or three of them and each one is an event
// worth interrupting someone for. A basketball game has sixty to eighty scoring
// plays; alerting on each would be unusable, and ESPN's scoreboard feed does not
// carry them anyway. The event worth knowing about in this sport is the RESULT,
// so that is what this module detects. There is deliberately no per-basket
// equivalent of goalKey/goalKeys here.

// Only games ESPN is actively driving can newly FINISH while the app is open:
// either in progress (g.live) or just-finished and overlaid from ESPN
// (g.liveSource). A score already sitting in the committed schedule must NOT
// notify, or every page load would fire the whole tournament.
export function isLiveish(g) {
  return Boolean(g.live || g.liveSource)
}

// Is this game final? Same rule the clinch engine and bracket resolution use.
export function isFinal(g) {
  return Array.isArray(g.score) && !g.live && !g.voided
}

// Does this game fall within the user's chosen scope?
export function inScope(g, scope, followed) {
  if (scope === 'all') return true
  return Boolean(followed && (followed.has(g.t1) || followed.has(g.t2)))
}

// Diff the previous snapshot against the current games. Returns the next
// snapshot (to store for the following poll) and the list of newly-final games
// to notify on.
//
// A game seen for the FIRST TIME is only recorded, never notified: that
// prevents dumping every completed result when the app loads or when alerts are
// first enabled. Notifications are further limited to live-ish games within
// scope; the snapshot tracks every game so identities stay warm.
//
// Once a game is recorded as final it STAYS final in the snapshot, so a
// transient ESPN gap that briefly drops the score cannot make the same result
// fire twice when the next poll restores it.
export function detectFinals(prev, games, { scope = 'followed', followed } = {}) {
  const next = new Map()
  const events = []
  for (const g of games) {
    const before = prev?.get(g.num)
    const wasFinal = before === true
    const nowFinal = isFinal(g)
    const eligible = prev?.has(g.num) && !wasFinal && nowFinal && isLiveish(g) && inScope(g, scope, followed)
    if (eligible) events.push({ game: g })
    next.set(g.num, wasFinal || nowFinal)
  }
  return { next, events }
}

// Format one final-result event into a browser-Notification payload. `tag`
// collapses duplicates so a re-fire (e.g. a re-render) cannot stack the same
// result twice.
export function finalNotification({ game }) {
  const [a, b] = game.score
  const winner = a > b ? game.t1 : game.t2
  const ot = game.ot ? (game.ot > 1 ? ` (${game.ot}OT)` : ' (OT)') : ''
  return {
    title: `🏀 FINAL: ${winner} win${ot}`,
    body: `${game.t1} ${a}–${b} ${game.t2}`,
    tag: `final|${game.num}`,
  }
}

// Merge new final-result events into the on-page toast list. Ids are the
// notification tag, so a result that somehow arrives twice replaces nothing and
// adds nothing. Returning the original array unchanged when there is nothing
// fresh lets React skip the re-render.
//
// This lives here rather than inline in App's `setToasts` call so it can be
// tested directly: v8 does not attribute coverage to an updater arrow that React
// invokes from inside its own reducer, so an inline version reads as dead code
// even while the toast it builds is demonstrably on screen.
export function mergeToasts(existing, events) {
  const have = new Set(existing.map((x) => x.id))
  const fresh = events
    .map((ev) => ({ id: finalNotification(ev).tag, ev }))
    .filter((x) => !have.has(x.id))
  return fresh.length ? [...existing, ...fresh] : existing
}
