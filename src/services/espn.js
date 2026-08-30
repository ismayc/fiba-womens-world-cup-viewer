// Live(-in-game) layer from ESPN's public scoreboard, free, no API key, and
// CORS-open (Access-Control-Allow-Origin: *), so it works straight from the
// browser. ESPN gives the running score plus a real game status, period and
// clock ("Q3", "7:32").
//
// Roles (see App.jsx merge order):
//   • The COMMITTED SCHEDULE (src/data/games.js) = SOURCE OF RECORD for
//     structure and for any score already generated into the repo by
//     scripts/fetch-tournament.mjs.
//   • ESPN (here) = LIVE OVERLAY, and the only runtime source. During the
//     tournament it carries a game from tip-off until the refresh job commits
//     the final score, and it is what resolves the final-phase bracket slots as
//     ESPN publishes those fixtures.
//
// THIS APP HAS ONE RUNTIME SOURCE. There is no second feed to reconcile against:
// no free basketball equivalent of OpenFootball publishes this tournament, so
// there is no results.js source-of-record module and no "confirmed by N sources"
// layer. Do not add one, with a single feed both would be permanently inert.
//
// NOTHING HERE PARSES SCORING EVENTS. The football siblings build a per-goal
// timeline from `competition.details` (scorer, minute, penalty, own goal),
// which is affordable because a match has a handful of goals. A basketball game
// has 60-80 scoring plays; the scoreboard feed does not carry them, and a
// timeline of them would be noise rather than signal. The score here is an
// aggregate, exactly as the sport treats it.

import { normalizeTeam, isRealTeam, pairKey } from './teamNames.js'

export const LIVE_SOURCE = {
  name: 'ESPN',
  url: 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/fiba/scoreboard',
  homepage: 'https://www.espn.com/basketball/',
}

// site.web.api, not site.api. The two serve identical routes, but site.api
// returns 403 to datacenter IPs, which breaks any CI job that touches it. The
// whole viewer family standardized on this host; do not "simplify" it back.

// ESPN spellings that differ from ours, applied before normalizeTeam.
//
// Empty for this edition: ESPN's scoreboard names all sixteen sides exactly as
// we do, verified against every one of the 24 group fixtures and pinned by
// test/fixtures/espn-team-names.json.
//
// It is deliberately empty rather than inherited. A sibling's version of this
// table maps "United States" to "USA", which is actively WRONG here, "United
// States" IS our canonical name, so that entry would rewrite it to a non-team
// and silently drop every USA game from the live overlay. The test refuses any
// alias key that never appears in the captured feed.
export const ESPN_ALIASES = {}

export const normEspn = (name) => normalizeTeam(ESPN_ALIASES[name] || name)
const toNum = (v) => (v == null || v === '' ? null : Number(v))

// Human label for a one-off ESPN status.type.name (most severe first), or null.
function statusLabelOf(name) {
  if (/SUSPEND/i.test(name)) return 'Suspended'
  if (/DELAY/i.test(name)) return 'Delayed'
  if (/ABANDON/i.test(name)) return 'Abandoned'
  if (/POSTPON/i.test(name)) return 'Postponed'
  if (/CANCEL/i.test(name)) return 'Canceled'
  if (/FORFEIT|AWARD/i.test(name)) return 'Awarded'
  return null
}

function parseEspnScore(home, away, state) {
  if (state === 'pre') return null
  const h = toNum(home.score)
  const a = toNum(away.score)
  if (h == null || a == null) return null
  return [h, a]
}

// FIBA plays four 10-minute quarters, so any period beyond the 4th is overtime.
// Returns the NUMBER of overtime periods (0 in regulation).
//
// This is the one piece of sport-specific arithmetic in the file and it differs
// per league: college basketball is two halves (period > 2) and the NBA/WNBA are
// four quarters like FIBA (period > 4). Getting it wrong mislabels a regulation
// fourth quarter as overtime.
export const REGULATION_PERIODS = 4
export function overtimeFrom(period) {
  const p = Number(period || 0)
  return p > REGULATION_PERIODS ? p - REGULATION_PERIODS : 0
}

// A readable period label: "Q3", "OT", "2OT", "Half", "Final".
export function periodLabel(period, state, detail = '') {
  if (state === 'pre') return ''
  if (state === 'post') return 'Final'
  if (/half/i.test(detail)) return 'Half'
  const p = Number(period || 0)
  const ot = overtimeFrom(p)
  if (ot === 1) return 'OT'
  if (ot > 1) return `${ot}OT`
  return p ? `Q${p}` : ''
}

// YYYYMMDD for the day before/of/after `base` (UTC): a small window that
// absorbs ESPN filing a game under an adjacent date.
export function scoreboardDates(base = new Date()) {
  const ymd = (off) =>
    new Date(base.getTime() + off * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  return [ymd(-1), ymd(0), ymd(1)]
}

// ESPN buckets a `dates=YYYYMMDD` query by the US-EASTERN day, not UTC. A Berlin
// morning tip-off (11:30 CEST = 09:30Z) is still the previous evening in New
// York, so filing by the UTC day asks for a slate that does not contain the
// game. The live window survives this only because it spans ±1 day; the history
// backfill below has to be explicit about it.
const EASTERN_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const espnDay = (instant) => EASTERN_DAY.format(instant).replace(/-/g, '')

// Distinct ESPN dates of games that have already tipped off but fall OUTSIDE the
// live window. ESPN drops finished games from the rolling scoreboard after a
// couple of days; the data is static once a game ends, so App fetches these once
// and merges them as a backfill overlay.
export function historyDates(games, base = new Date()) {
  const inWindow = new Set(scoreboardDates(base))
  const now = base.getTime()
  const out = new Set()
  for (const g of games) {
    if (!g.ko) continue
    if (new Date(g.ko).getTime() > now) continue // not yet tipped off
    const d = espnDay(new Date(g.ko))
    if (!inWindow.has(d)) out.add(d)
  }
  return [...out]
}

// ESPN's default scoreboard returns only a single date's slate and can lag a
// day, so fetch the given dates explicitly and merge their events (deduped).
async function scoreboardEvents(signal, dates = scoreboardDates()) {
  if (!dates.length) return []
  const results = await Promise.allSettled(
    dates.map((d) =>
      fetch(`${LIVE_SOURCE.url}?dates=${d}`, { signal, cache: 'no-store' }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ),
  )
  let reached = false
  const seen = new Set()
  const events = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    reached = true
    for (const ev of r.value.events || []) {
      // Dedup the same game across adjacent date queries by its unique id, NOT
      // by date, which would wrongly merge two simultaneous games, and this
      // tournament plays a group's last two games at exactly the same time.
      const id = ev.id ?? ev.uid
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      events.push(ev)
    }
  }
  // An ABORT is not a failure. `Promise.allSettled` never rejects, so a
  // cancelled request would otherwise fall through to the generic error below
  // and the caller could not tell the two apart — which made App's
  // `err.name !== 'AbortError'` guard permanently dead, and let a poll that was
  // superseded on purpose flash "couldn't reach results feed" at the reader.
  if (signal?.aborted) {
    const err = new Error('Live request aborted')
    err.name = 'AbortError'
    throw err
  }
  if (!reached) throw new Error('Live request failed (all scoreboard dates unreachable)')
  return events
}

// Build a lookup of live records from ESPN's scoreboard. Every record is stored
// under three keys so the merge can find it however much the committed record
// knows: by ESPN EVENT ID (the safest handle), by team pair, and by tip-off
// instant (which is what resolves a final-phase game whose teams we still hold
// as placeholders).
export async function fetchLive(signal, dates) {
  const map = new Map()
  for (const ev of await scoreboardEvents(signal, dates)) {
    const comp = ev.competitions?.[0]
    if (!comp || !Array.isArray(comp.competitors)) continue
    const home = comp.competitors.find((c) => c.homeAway === 'home')
    const away = comp.competitors.find((c) => c.homeAway === 'away')
    if (!home?.team || !away?.team) continue

    const st = ev.status || comp.status || {}
    const state = st.type?.state || 'pre' // 'pre' | 'in' | 'post'
    const period = Number(st.period || 0)
    const detail = st.type?.description || st.type?.shortDetail || ''
    const rec = {
      id: ev.id ?? ev.uid ?? null,
      home: normEspn(home.team.displayName),
      away: normEspn(away.team.displayName),
      state,
      period,
      // The running game clock during play ("7:32"), paired with the period
      // label so the badge can read "Q3 · 7:32".
      clock: st.displayClock || '',
      periodLabel: periodLabel(period, state, detail),
      detail,
      ot: state === 'post' ? overtimeFrom(period) : 0,
      paused: /DELAY|SUSPEND/i.test(st.type?.name || ''),
      voided: /ABANDON|POSTPON|CANCEL/i.test(st.type?.name || ''),
      awarded: /FORFEIT|AWARD/i.test(st.type?.name || ''),
      statusLabel: statusLabelOf(st.type?.name || ''),
      score: parseEspnScore(home, away, state),
      instant: ev.date ? new Date(ev.date).getTime() : null,
    }

    if (rec.id != null) map.set('id:' + rec.id, rec)
    map.set(pairKey(rec.home, rec.away), rec)
    if (rec.instant != null) map.set('inst:' + rec.instant, rec)
  }
  return map
}

// Look up the ESPN record for one of our games.
//
// BY EVENT ID FIRST, ALWAYS. The id is the only handle that cannot be confused
// by two games with the same teams (a group meeting replayed in the final phase)
// or by the tournament's simultaneous final-round tip-offs. Falling back to the
// team pair is safe only when both of our teams are real, and the instant is the
// last resort: it is how a not-yet-drawn final-phase slot finds its fixture.
//
// One consequence worth stating: matching by id means a mismatch between our
// teams and ESPN's is a COMMITTED-DATA bug to be fixed in the schedule, not
// something the overlay should paper over by rewriting teams. It only adopts
// ESPN's teams for a slot we are still holding as a placeholder.
export function liveRecordFor(game, liveMap) {
  if (game.espnId) {
    const byId = liveMap.get('id:' + game.espnId)
    if (byId) return byId
  }
  if (isRealTeam(game.t1) && isRealTeam(game.t2)) {
    return liveMap.get(pairKey(normalizeTeam(game.t1), normalizeTeam(game.t2))) || null
  }
  if (!game.ko) return null
  return liveMap.get('inst:' + new Date(game.ko).getTime()) || null
}

// ESPN flips a game to STATUS_DELAYED at the scheduled hour, but tip-off is
// normally only a few minutes after it. Within this grace window an ESPN
// "Delayed" is treated as pre-game (countdown, no amber badge); a real delay
// outlives the window and shows normally.
const DELAY_GRACE_MS = 5 * 60 * 1000

// Overlay ESPN live / just-finished data onto the committed games array. The
// committed schedule stays the source of record: a game that already has a
// score keeps it. The static input is never mutated.
export function applyLive(games, liveMap, now = Date.now()) {
  if (!liveMap || liveMap.size === 0) return games
  return games.map((g) => {
    const rec = liveRecordFor(g, liveMap)
    if (!rec) return g

    // Already committed: the generated schedule wins. Only pick up the ESPN id,
    // which the game-detail modal needs to fetch a box score on demand.
    if (Array.isArray(g.score)) {
      return rec.id && !g.espnId ? { ...g, espnId: rec.id } : g
    }

    // One-off statuses that are not a normal result: mark the game voided so the
    // standings/clinch ignore it and the UI shows a label instead of a fake final
    // or a dead countdown. Abandoned keeps its partial score (for display only).
    if (rec.voided) {
      return { ...g, voided: true, statusLabel: rec.statusLabel, score: rec.score || undefined }
    }

    const bothReal = isRealTeam(g.t1) && isRealTeam(g.t2)

    // An ESPN "Delayed" inside the grace window is premature: the game just has
    // not tipped off yet. Fall through to the pre-game branch (suspensions are a
    // real stoppage and are never suppressed).
    const earlyDelay =
      rec.paused &&
      rec.statusLabel === 'Delayed' &&
      g.ko &&
      now - new Date(g.ko).getTime() < DELAY_GRACE_MS

    // Nothing to show yet: only resolve final-phase team names if ESPN knows
    // them and we still hold placeholders. This is how the bracket fills in as
    // ESPN publishes the qualification-round and quarter-final fixtures.
    //
    // AWAY BECOMES t1, not home. Every committed game orients t1 to the team
    // FIBA prints first, which is the side ESPN models as away, true of all 24
    // group fixtures. Adopting ESPN's home as t1 here (as the football sibling
    // does) would make a resolved bracket game read the opposite way round from
    // every group game in the same list.
    if (rec.state === 'pre' || earlyDelay || !rec.score) {
      const out = {}
      if (!bothReal && isRealTeam(rec.home) && isRealTeam(rec.away)) {
        out.t1 = rec.away
        out.t2 = rec.home
      }
      if (rec.id && !g.espnId) out.espnId = rec.id
      // A published fixture also pins down a tip-off time we were showing as
      // "to be confirmed".
      if (g.tbdTip && rec.instant != null) {
        out.ko = new Date(rec.instant).toISOString()
        out.tbdTip = false
      }
      return Object.keys(out).length ? { ...g, ...out } : g
    }

    const out = { ...g }
    if (rec.id) out.espnId = rec.id
    // `rec.score` is [home, away]. Our records are [t1, t2] with t1 = FIBA's
    // first-named team, which is ESPN's AWAY side, so the usual case needs the
    // pair reversed, and `aligned` says when it does not.
    const aligned = bothReal && normalizeTeam(g.t1) === rec.home
    if (bothReal) {
      out.score = aligned ? [...rec.score] : [rec.score[1], rec.score[0]]
    } else {
      // An unresolved slot adopts ESPN's teams in the same away-first
      // orientation the committed schedule uses. See the pre-game branch above.
      if (isRealTeam(rec.away)) out.t1 = rec.away
      if (isRealTeam(rec.home)) out.t2 = rec.home
      out.score = [rec.score[1], rec.score[0]]
    }
    if (rec.ot) out.ot = rec.ot
    if (rec.state === 'in') {
      out.live = {
        clock: rec.clock,
        period: rec.periodLabel,
        detail: rec.detail,
        delayed: rec.paused,
        label: rec.statusLabel,
      }
    }
    if (rec.awarded) out.awarded = true
    // Same fill as the pre-game branch above: a qualification-round or semi-final
    // record is committed with `tbdTip` and no kickoff, because FIBA announces
    // those times only when the previous round ends. If the first thing we ever
    // see of the game is a score, take the time from the same record, or the
    // schedule has a played game with no day to file it under.
    if (g.tbdTip && rec.instant != null) {
      out.ko = new Date(rec.instant).toISOString()
      out.tbdTip = false
    }
    out.liveSource = true
    return out
  })
}

// The live records that no COMMITTED game already owns by ESPN id.
//
// Why this exists. A final-phase game is committed with `espnId: null`, because
// FIBA publishes the bracket wiring long before ESPN publishes the fixture, so
// the only handle it can be matched by is its team pair — and it has no pair
// until `resolveBracket` fills one in from the group results. Resolution happens
// downstream of the overlay, so the app runs the overlay a SECOND time over the
// resolved schedule (see App.jsx). This filter is what makes that second pass
// safe.
//
// The hazard it removes: `pairKey` is order-independent and NOT scoped to a
// date, so if the same two teams meet twice in the tournament (impossible in the
// quarter-finals by FIBA's double crossover, but perfectly possible in a
// semi-final or the final) the second pass could match a knockout slot against
// the GROUP game's record and show that game's score. Every group game carries a
// committed `espnId` and therefore matches by id on the first pass, so dropping
// the records those ids claim leaves only fixtures nothing has spoken for.
//
// Returns the map unchanged when there is nothing to drop, so the common case
// allocates nothing and `applyLive`'s empty-map short-circuit still applies.
export function unclaimedLive(liveMap, games) {
  if (!liveMap || liveMap.size === 0) return liveMap
  const claimed = new Set(games.map((g) => g.espnId).filter(Boolean).map(String))
  if (claimed.size === 0) return liveMap
  const out = new Map()
  for (const [key, rec] of liveMap) {
    if (rec.id != null && claimed.has(String(rec.id))) continue
    out.set(key, rec)
  }
  return out
}
