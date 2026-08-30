// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
// Fetches ESPN's scoreboard on each request and emits an .ics, so a subscribed
// calendar shows resolved knockout teams and final scores. Optional
// ?teams=Spain,England filters to specific teams (case-insensitive).
//
// This is an ES MODULE on purpose. The package sets "type": "module", so a
// CommonJS function (`exports.handler`) is rejected by Netlify's runtime with
// "module is not defined in ES module scope" whenever the site is built from Git
// rather than deployed through netlify-cli, which bundles it away. The sibling
// world-cup-viewer still carries the CommonJS form and only gets away with it
// because it deploys via the CLI.
//
// The source is ESPN, the app's single runtime source everywhere else too (see
// services/espn.js). A Netlify function cannot import from the Vite app's source
// tree, so the small amount of shape knowledge below is a deliberate restatement
// of that module.
//
// site.WEB.api, not site.api: the two serve identical routes, but site.api
// returns 403 to datacenter IPs — which is exactly what a Netlify function runs
// on. Using the wrong host makes this feed 502 in production while working
// perfectly from a laptop.
const FEED =
  'https://site.web.api.espn.com/apis/site/v2/sports/basketball/fiba/scoreboard' +
  '?dates=20260904-20260913&limit=200'
const GAME_MS = 135 * 60 * 1000

// One range query returns the whole tournament, so there is no per-date paging.

// ESPN names arenas COMMERCIALLY; FIBA does not, and the app's committed data
// (data/venues.js) uses FIBA's name. Only one of the two arenas differs — ESPN
// files the Berlin Arena under its naming-rights name — but without this table a
// subscriber's calendar would disagree with the app about where a game is played.
//
// This is the `sponsorName` -> `name` half of VENUE_META in
// scripts/official.mjs, restated because a Netlify function cannot import from
// the repo. That table is the one to edit first; keep this in step with it.
const VENUE_ALIASES = {
  'Uber Arena': 'Berlin Arena',
}

// ESPN files ONE game of this tournament two hours early: it stores FIBA's GMT
// figure with the Berlin offset subtracted a second time. The other 23 group
// games agree to the minute, so it is a single bad record, and FIBA is the
// organizer and therefore the authority.
//
// The build-time pipeline already corrects this (KNOWN_ESPN_TIME_BUGS in
// scripts/official.mjs), so the app shows FIBA's time. This feed reads ESPN
// directly on every request, so without the same correction a subscriber's
// calendar disagrees with the app by two hours on the day of the game.
//
// Keyed by ESPN EVENT ID, never by team names, so a rename upstream cannot
// silently move the correction onto a different game. Values are the corrected
// start as a UTC instant. That table in official.mjs is the one to edit first;
// keep this in step with it, and delete both entries together if ESPN ever
// fixes the record.
const KNOWN_ESPN_TIME_BUGS = {
  // South Korea v Nigeria, 4 September: FIBA's published 14:30 Berlin (CEST) is
  // correct; ESPN says 12:30 Berlin.
  401907391: '2026-09-04T12:30:00Z',
}

// Only this tournament's games. ESPN files every FIBA competition under one
// league slug, so a note headline check keeps another event out of the feed.
const EVENT_NOTE = /^FIBA Women's World Cup\b/

function pad(n) {
  return String(n).padStart(2, '0')
}

function toICSDate(d) {
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'
  )
}

function esc(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// ESPN labels the round in the first note's headline, as
// "FIBA Women's World Cup - Group A". The competition prefix is the same on
// every game, so only the tail is interesting.
function roundOf(comp) {
  // Both fallbacks below are unreachable in practice and kept only so the helper
  // is total: roundOf is called ONLY for a competition that isThisTournament()
  // has already matched, which means notes[0].headline exists and begins with
  // "FIBA Women's World Cup", so it is never absent and never empty.
  /* v8 ignore next -- unreachable: isThisTournament guarantees notes[0].headline */
  const note = String((comp.notes || [])[0]?.headline || '')
  const tail = note.includes('-') ? note.slice(note.indexOf('-') + 1).trim() : note.trim()
  /* v8 ignore next -- unreachable: a matching headline is non-empty, so tail is truthy */
  return tail || 'Group phase'
}

function isThisTournament(comp) {
  return EVENT_NOTE.test(String((comp.notes || [])[0]?.headline || ''))
}

// The final score, noting overtime. Basketball has no draw and no shootout, so
// there is no penalties branch here — the football sibling's `p3-2` form has no
// counterpart. FIBA plays four quarters, so any period past the 4th is overtime.
//
// The `completed` guard is load-bearing: ESPN reports `score: "0"` for a game
// that has not tipped off, so without it every future fixture in a subscriber's
// calendar reads "(0–0)" as though it had been played and finished goalless.
function resultText(status, a, b) {
  if (!status?.type?.completed) return ''
  if (a.score == null || b.score == null) return ''
  const ot = Number(status.period || 0) > 4 ? Number(status.period) - 4 : 0
  const suffix = ot === 1 ? ' OT' : ot > 1 ? ` ${ot}OT` : ''
  return ` (${a.score}–${b.score}${suffix})`
}

function sideOf(competitor) {
  return {
    name: (competitor.team?.displayName || '').trim(),
    score: competitor.score == null || competitor.score === '' ? null : Number(competitor.score),
  }
}

export function parseScoreboard(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  const out = []
  for (const event of data?.events || []) {
    const comp = event.competitions?.[0]
    if (!comp || !isThisTournament(comp)) continue
    const competitors = comp.competitors || []
    // ESPN flags home/away explicitly. The app orders every game AWAY-first,
    // because that is the side FIBA prints first on its schedule sheet, so the
    // ICS summary follows the same order rather than ESPN's home-first `name`.
    const home = competitors.find((c) => c.homeAway === 'home') || competitors[0]
    const away = competitors.find((c) => c.homeAway === 'away') || competitors[1]
    if (!home || !away) continue

    const start = new Date(KNOWN_ESPN_TIME_BUGS[event.id] || event.date)
    if (Number.isNaN(start.getTime())) continue

    const h = sideOf(home)
    const a = sideOf(away)
    const venue = comp.venue || {}
    const city = venue.address?.city
    const venueName = VENUE_ALIASES[venue.fullName] || venue.fullName

    out.push({
      start,
      home: h.name,
      away: a.name,
      result: resultText(comp.status, a, h),
      venue: [venueName, city].filter(Boolean).join(', '),
      round: roundOf(comp),
      date: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`,
    })
  }
  return out
}

function vevent(m) {
  const end = new Date(m.start.getTime() + GAME_MS)
  const uid = `fibawwc2026-${m.date}-${m.away}-${m.home}@fibawomensworldcupviewer`.replace(
    /\s+/g,
    '_',
  )
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(m.start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(`FIBA WWC: ${m.away} vs ${m.home}${m.result}`)}`,
    `LOCATION:${esc(m.venue)}`,
    `DESCRIPTION:${esc(m.round)}`,
    'END:VEVENT',
  ].join('\r\n')
}

export const handler = async (event) => {
  try {
    const res = await fetch(FEED)
    if (!res.ok) return { statusCode: 502, body: `Upstream ${res.status}` }
    let games = parseScoreboard(await res.json())

    const teamsParam = (event.queryStringParameters && event.queryStringParameters.teams) || ''
    let calName = "FIBA Women's World Cup 2026"
    if (teamsParam) {
      const want = new Set(teamsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
      games = games.filter((m) => want.has(m.home.toLowerCase()) || want.has(m.away.toLowerCase()))
      calName = "FIBA Women's World Cup 2026 — My Teams"
    }

    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      "PRODID:-//FIBA Women's World Cup 2026 Viewer//EN",
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calName)}`,
      'X-PUBLISHED-TTL:PT2H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
      ...games.map(vevent),
      'END:VCALENDAR',
    ].join('\r\n')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="fiba-womens-world-cup-2026.ics"',
        'Cache-Control': 'public, max-age=900',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` }
  }
}
