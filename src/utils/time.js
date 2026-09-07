// Timezone-aware formatting helpers. Every match's kickoff is stored as an
// absolute instant (ISO string with offset), so the same instant can be
// rendered into whatever timezone the viewer selects.

import { TEAM_TIMEZONES } from '../data/teamTimezones.js'
import { LEAGUE } from '../config/league.js'

// The viewer's own IANA timezone, e.g. "America/Chicago" or "Europe/London".
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// A curated list of timezones for the picker, plus the viewer's own detected
// zone (deduped) so they can always switch back to it.
//
// The list is chosen for THIS tournament rather than inherited: the host zone
// first, then a home zone for each of the sixteen competing nations, then the
// North American zones a US audience needs. The football sibling's list carried
// Sao Paulo, Tehran, Riyadh and Johannesburg — none of which has a team here —
// while missing Brussels, Prague, Budapest, Rome, Bamako, Istanbul, Shanghai and
// Puerto Rico, all of which do.
export function timezoneOptions(detected) {
  const common = [
    // Host.
    'Europe/Berlin',
    'UTC',
    // Competing nations, west to east.
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Puerto_Rico',
    'Europe/London',
    'Europe/Madrid',
    'Europe/Paris',
    'Europe/Brussels',
    'Europe/Rome',
    'Europe/Prague',
    'Europe/Budapest',
    'Africa/Bamako',
    'Africa/Lagos',
    'Europe/Istanbul',
    'Asia/Shanghai',
    'Asia/Seoul',
    'Asia/Tokyo',
    'Australia/Perth',
    'Australia/Sydney',
  ]
  const set = new Set([detected, ...common])
  return [...set]
}

// A game whose tip-off FIBA has not announced yet ships with `ko: null`, and
// `new Date(null)` is the Unix EPOCH, not an Invalid Date: it formats happily as
// "December 31, 1969" / "4:00 PM" instead of failing loudly. Every formatter
// here therefore refuses a missing instant and returns an empty string, so a
// caller that forgets the TBC case renders nothing rather than a 1969 date.
function hasInstant(iso) {
  return iso != null && iso !== ''
}

export function formatTime(iso, tz) {
  if (!hasInstant(iso)) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Long date in a given timezone, e.g. "Thursday, June 20, 2024".
export function formatDateLong(iso, tz) {
  if (!hasInstant(iso)) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// Long form of a calendar-day KEY ("2026-09-08" -> "Tuesday, September 8, 2026"),
// with `year: false` for the shorter heading the day pop-up uses.
//
// A day heading names the DAY its section groups, so it formats the key itself
// rather than the first game's kickoff. Reading a kickoff is what put
// "Wednesday, December 31, 1969" at the head of the qualification-round and
// semi-final days: every game on those days is awaiting a tip-off time, so
// `matches[0].ko` was null and formatted as the epoch.
//
// The key is a plain calendar date with no instant behind it, so it is parsed at
// noon UTC and rendered in UTC - any timezone conversion here would shift the
// date the key already states.
export function formatDayKeyLong(key, { year = true } = {}) {
  if (!key) return ''
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : null),
  })
}

// Stable key for grouping matches by their calendar day *in the viewer's tz*.
// (A 10pm ET match can fall on a different calendar day in Tokyo — this keeps
// the date headers correct for the viewer.)
export function dayKey(iso, tz) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
}

// The day a GAME belongs to, tolerating one whose tip-off time is not set yet.
//
// A qualification-round or semi-final game has no `ko` until FIBA announces the
// time, but its calendar date is known and committed as `date`. Falling through
// to `new Date(null)` would bucket those games at the Unix epoch and float them
// to the very top of the schedule, which is how this bug announces itself.
//
// The fallback date is the BERLIN date. Without a time there is no instant to
// convert, so a viewer in Auckland or Los Angeles sees the game listed on the
// day it is played in Berlin. That is the only honest answer available, and it
// corrects itself the moment ESPN publishes the fixture.
export function gameDayKey(game, tz) {
  return game.ko ? dayKey(game.ko, tz) : game.date || null
}

// Short timezone abbreviation for a given instant, e.g. "CDT", "GMT+1".
export function tzAbbrev(iso, tz) {
  if (!hasInstant(iso)) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso))
  const part = parts.find((p) => p.type === 'timeZoneName')
  /* v8 ignore next -- unreachable: timeZoneName:'short' always yields that part for a valid IANA zone, and every zone the picker offers is asserted in the suite */
  return part ? part.value : ''
}

// Kickoff as "Jun 11, 1:00 PM" in a given timezone (date + wall-clock time).
function formatDateTimeShort(iso, tz) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}

// Distinct local tip-off strings for a team's home country, e.g.
// ["Sep 4, 6:30 PM JST"]. Countries spanning several
// timezones yield one entry per distinct wall-clock; zones that read the same
// clock at this instant collapse to a single line. Returns [] for teams with no
// known home zone (e.g. bracket placeholders like "Winner Group A").
export function teamLocalKickoffs(iso, teamName) {
  if (!iso) return []
  const zones = TEAM_TIMEZONES[teamName]
  if (!zones || zones.length === 0) return []
  const seen = new Set()
  const out = []
  for (const tz of zones) {
    const clock = formatDateTimeShort(iso, tz)
    if (seen.has(clock)) continue
    seen.add(clock)
    out.push(`${clock} ${tzAbbrev(iso, tz)}`)
  }
  return out
}

// Multi-line tooltip text for hovering a team: when the game tips off in that
// team's home timezone(s). Empty string when the team has no known home zone.
export function teamKickoffTooltip(iso, teamName) {
  const lines = teamLocalKickoffs(iso, teamName)
  if (lines.length === 0) return ''
  const head =
    lines.length > 1 ? `Tip-off in ${teamName} (local times):` : `Tip-off in ${teamName}:`
  return [head, ...lines].join('\n')
}

// Game status relative to "now". A FIBA game is 4 x 10 minutes of play, which
// with breaks, timeouts and any overtime runs to roughly two hours of wall
// clock; we treat a game as live for 2h15m after tip-off so a game that goes to
// overtime is not prematurely called finished. This is only a fallback — a real
// ESPN status always wins in liveState() below.
const GAME_MINUTES = LEAGUE.gameLengthMinutes
export function gameStatus(iso, now = Date.now()) {
  if (!iso) return 'upcoming'
  const start = new Date(iso).getTime()
  const end = start + GAME_MINUTES * 60 * 1000
  if (now < start) return 'upcoming'
  if (now <= end) return 'live'
  return 'finished'
}

// Authoritative status for a (possibly merged) game. Prefers real feed data over
// the clock: a game ESPN flags live (`g.live`) is live; one that has a final
// score is finished — even if it is still inside the time-based window. The
// clock is only a fallback when we have neither.
export function liveState(game, now = Date.now()) {
  if (game.voided) return 'voided' // abandoned/postponed/canceled
  if (game.live) return 'live'
  if (Array.isArray(game.score)) return 'finished'
  return gameStatus(game.ko, now)
}

// One-off status for display, or null for a normal game. Drives the amber
// "paused" badge (delayed/suspended), a "voided" label (abandoned/postponed/
// canceled), or an "awarded" note — shared so every view renders them the same.
export function statusFlag(game) {
  if (game.voided) return { kind: 'voided', label: game.statusLabel || 'Off' }
  if (game.live?.delayed) return { kind: 'paused', label: game.live.label || 'Delayed' }
  if (game.awarded) return { kind: 'awarded', label: 'Awarded' }
  return null
}
