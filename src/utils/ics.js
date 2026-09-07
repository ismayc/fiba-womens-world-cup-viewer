// Generate and download an .ics (iCalendar) file for a match so viewers can
// drop kickoff into Apple Calendar / Google Calendar / Outlook. Times are
// written in UTC (the trailing "Z"), which every calendar app localizes
// automatically — so the event lands at the right moment in any timezone.

import { STAGE_LABELS } from '../data/games.js'
import { US_BROADCAST } from '../data/broadcast.js'
import { venueFor } from './venue.js'
import { sideNames } from './slots.js'
import { LEAGUE } from '../config/league.js'

const MATCH_MINUTES = LEAGUE.gameLengthMinutes

// A game FIBA has not given a tip-off time yet has `ko: null` but a known Berlin
// calendar date. `new Date(null)` is the Unix epoch, so writing it out as an
// instant files the game on January 1, 1970. It goes into the calendar as an
// ALL-DAY event on its real date instead, which is exactly what is known about
// it, and it gains a time the moment ESPN publishes the fixture.
function toICSDay(dateKey) {
  return dateKey.replace(/-/g, '')
}

function nextDay(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return toICSDate(d).slice(0, 8)
}

// The DTSTART/DTEND pair for a game: timed when the tip-off is known, all-day
// when it is not. Every game carries one or the other - a TBC game ships with
// the Berlin date it is played on, which test/data.test.js holds as an
// invariant - so there is no third case to handle here.
function timing(match) {
  if (match.ko) {
    const start = new Date(match.ko)
    const end = new Date(start.getTime() + MATCH_MINUTES * 60 * 1000)
    return [`DTSTART:${toICSDate(start)}`, `DTEND:${toICSDate(end)}`]
  }
  return [`DTSTART;VALUE=DATE:${toICSDay(match.date)}`, `DTEND;VALUE=DATE:${nextDay(match.date)}`]
}

function toICSDate(date) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    date.getUTCFullYear() +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    'T' +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds()) +
    'Z'
  )
}

// Fold/escape text per RFC 5545.
function esc(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function buildICS(match) {
  const venue = venueFor(match)
  const when = timing(match)
  const stageLabel = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]

  // A final-phase game names its slots ("2nd Group A") until the draw resolves
  // them; `match.t1` alone exported "FIBA WWC: null vs null".
  const [side1, side2] = sideNames(match)
  const summary = `${LEAGUE.icsSummaryPrefix}: ${side1} ${LEAGUE.homeAwaySep} ${side2}`
  const location = `${venue.name}, ${venue.city}, ${venue.country}`
  const description = [
    `${stageLabel} · Game ${match.num}`,
    match.tv?.length ? `US TV: ${match.tv.join(' / ')}` : null,
    match.tvNote || null,
    `US: ${US_BROADCAST.english.tv.join(' / ')} (stream: ${US_BROADCAST.english.streaming.join(', ')})`,
  ]
    .filter(Boolean)
    .join('\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${LEAGUE.ics.prodId}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${LEAGUE.ics.uidPrefix}${match.num}@${LEAGUE.ics.domain}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    ...when,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

// One VEVENT block (without the calendar wrapper) for a match.
function buildVEvent(match) {
  const venue = venueFor(match)
  const when = timing(match)
  const stageLabel = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]
  const score = Array.isArray(match.score) ? ` (${match.score[0]}–${match.score[1]})` : ''
  const [side1, side2] = sideNames(match)
  const summary = `${LEAGUE.icsSummaryPrefix}: ${side1} ${LEAGUE.homeAwaySep} ${side2}${score}`
  const location = `${venue.name}, ${venue.city}, ${venue.country}`
  const description = [
    `${stageLabel} · Game ${match.num}`,
    match.tv?.length ? `US TV: ${match.tv.join(' / ')}` : null,
    match.tvNote || null,
  ]
    .filter(Boolean)
    .join('\\n')
  return [
    'BEGIN:VEVENT',
    `UID:${LEAGUE.ics.uidPrefix}${match.num}@${LEAGUE.ics.domain}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    ...when,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
  ].join('\r\n')
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadICS(match) {
  downloadText(buildICS(match), `${LEAGUE.ics.filenameBase}-game-${match.num}.ics`)
}

// A whole calendar of games (used by the "download all / my teams / filtered" buttons).
export function buildICSCollection(matches, calName = LEAGUE.edition) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${LEAGUE.ics.prodId}`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calName)}`,
    ...matches.map(buildVEvent),
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICSCollection(
  matches,
  filename = `${LEAGUE.ics.filenameBase}.ics`,
  calName = LEAGUE.edition,
) {
  downloadText(buildICSCollection(matches, calName), filename)
}

// Turn an http(s) feed URL into a webcal:// subscription URL (what a calendar
// app expects to register a live subscription).
export function webcalUrl(httpsUrl) {
  return httpsUrl.replace(/^https?:/, 'webcal:')
}

// A "subscribe in Google Calendar" deep link for an ICS feed. Google's `cid`
// must be a RAW webcal:// URL — passing an https:// URL or a percent-encoded one
// makes Google reject it with "check the URL". Our feed URLs use "," (not "&")
// to separate teams, so the query string survives un-encoded inside `cid`.
export function googleCalendarUrl(httpsUrl) {
  return `https://www.google.com/calendar/render?cid=${webcalUrl(httpsUrl)}`
}
