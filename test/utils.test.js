// The small pure utilities: time, venue fallback, records, notifications,
// week bucketing, search, URL state and the calendar file.

import { describe, it, expect, vi } from 'vitest'
import { GAMES } from '../src/data/games.js'
import {
  dayKey,
  detectTimezone,
  formatDateLong,
  formatTime,
  gameDayKey,
  gameStatus,
  liveState,
  statusFlag,
  teamKickoffTooltip,
  teamLocalKickoffs,
  timezoneOptions,
  tzAbbrev,
} from '../src/utils/time.js'
import { TBC_VENUE, venueFor } from '../src/utils/venue.js'
import {
  activeTeams,
  overtimeGames,
  teamRecord,
  tournamentTotals,
} from '../src/utils/tournamentStats.js'
import {
  detectFinals,
  finalNotification,
  mergeToasts,
  inScope,
  isFinal,
  isLiveish,
} from '../src/services/scoreNotify.js'
import { addDays, weekLabel, weekStartOf, weekdayHeader } from '../src/utils/week.js'
import { matchesSearch, parseQuery } from '../src/utils/search.js'
import { DEFAULT_FILTERS, readState, writeState } from '../src/utils/urlState.js'
import { buildICS, buildICSCollection, googleCalendarUrl, webcalUrl } from '../src/utils/ics.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'
import { withGroupScores } from './helpers/tournament.js'

const num = (n) => GAMES.find((g) => g.num === n)
const G1 = num(1) // Japan v Mali, 2026-09-04 11:30 +02:00

describe('time', () => {
  it('formats a tip-off into any timezone', () => {
    expect(formatTime(G1.ko, 'Europe/Berlin')).toBe('11:30 AM')
    expect(formatTime(G1.ko, 'UTC')).toBe('9:30 AM')
    expect(formatTime(G1.ko, 'America/New_York')).toBe('5:30 AM')
  })

  it('names the day and the zone', () => {
    expect(formatDateLong(G1.ko, 'Europe/Berlin')).toContain('September 4, 2026')
    expect(dayKey(G1.ko, 'Europe/Berlin')).toBe('2026-09-04')
    expect(tzAbbrev(G1.ko, 'UTC')).toBeTruthy()
  })

  // A game whose tip-off FIBA has not announced still has a known date. Falling
  // through to `new Date(null)` would bucket it at the Unix epoch and float it
  // to the top of the schedule.
  it('buckets a TBC game on its committed date, not the epoch', () => {
    const qr = num(25)
    expect(qr.ko).toBeNull()
    expect(gameDayKey(qr, 'UTC')).toBe('2026-09-08')
    expect(gameDayKey(qr, 'UTC')).not.toBe('1970-01-01')
    expect(gameDayKey(G1, 'Europe/Berlin')).toBe('2026-09-04')
  })

  it('reports status from the clock when there is no feed data', () => {
    const before = new Date(G1.ko).getTime() - 60_000
    const during = new Date(G1.ko).getTime() + 30 * 60_000
    const after = new Date(G1.ko).getTime() + 5 * 3600_000
    expect(gameStatus(G1.ko, before)).toBe('upcoming')
    expect(gameStatus(G1.ko, during)).toBe('live')
    expect(gameStatus(G1.ko, after)).toBe('finished')
    expect(gameStatus(null)).toBe('upcoming')
  })

  it('prefers real feed data over the clock', () => {
    const during = new Date(G1.ko).getTime() + 30 * 60_000
    expect(liveState({ ...G1, live: {} }, during)).toBe('live')
    expect(liveState({ ...G1, score: [80, 70] }, during)).toBe('finished')
    expect(liveState({ ...G1, voided: true }, during)).toBe('voided')
    expect(liveState(G1, during)).toBe('live')
  })

  it('flags one-off statuses for display', () => {
    expect(statusFlag(G1)).toBeNull()
    expect(statusFlag({ ...G1, voided: true, statusLabel: 'Postponed' })).toEqual({
      kind: 'voided',
      label: 'Postponed',
    })
    expect(statusFlag({ ...G1, voided: true }).label).toBe('Off')
    expect(statusFlag({ ...G1, live: { delayed: true } }).kind).toBe('paused')
    expect(statusFlag({ ...G1, live: { delayed: true, label: 'Suspended' } }).label).toBe('Suspended')
    expect(statusFlag({ ...G1, awarded: true }).kind).toBe('awarded')
  })

  it('shows a tip-off in each competing nation’s own clock', () => {
    expect(teamLocalKickoffs(G1.ko, 'Japan')).toHaveLength(1)
    expect(teamKickoffTooltip(G1.ko, 'Japan')).toMatch(/^Tip-off in Japan:/)
    // The United States spans four zones, so it yields several distinct lines.
    expect(teamLocalKickoffs(G1.ko, 'United States').length).toBeGreaterThan(1)
    expect(teamKickoffTooltip(G1.ko, 'United States')).toMatch(/local times/)
  })

  it('says nothing for a bracket placeholder or a game with no time', () => {
    expect(teamLocalKickoffs(G1.ko, 'Winner Group A')).toEqual([])
    expect(teamKickoffTooltip(G1.ko, 'Winner Group A')).toBe('')
    expect(teamLocalKickoffs(null, 'Japan')).toEqual([])
  })

  it('offers the host zone, the detected zone and a home zone per nation', () => {
    const detected = detectTimezone()
    expect(typeof detected).toBe('string')
    const opts = timezoneOptions('Pacific/Auckland')
    expect(opts).toContain('Europe/Berlin') // host
    expect(opts).toContain('Pacific/Auckland') // the viewer's own, even if exotic
    expect(new Set(opts).size).toBe(opts.length) // deduped
    // Every competing nation's primary zone is offered.
    for (const tz of Object.values(TEAM_TIMEZONES)) expect(opts).toContain(tz[0])
  })
})

describe('venue fallback', () => {
  it('resolves a real arena', () => {
    expect(venueFor(G1).name).toBe('Berlin Arena')
  })

  // FIBA assigns the arena when it announces the round, so a final-phase record
  // has none. The city and timezone ARE known, though, both arenas are in
  // Berlin, so only the building is to be confirmed.
  it('falls back to a Berlin placeholder rather than crashing', () => {
    const v = venueFor(num(25))
    expect(v).toBe(TBC_VENUE)
    expect(v.city).toBe('Berlin')
    expect(v.tz).toBe('Europe/Berlin')
    expect(v.tbc).toBe(true)
    expect(venueFor(undefined)).toBe(TBC_VENUE)
  })
})

describe('team records', () => {
  const played = withGroupScores(
    'A',
    [
      ['Japan', 'Mali', 90, 60],
      ['Germany', 'Japan', 70, 80],
      ['Japan', 'Spain', 70, 75],
    ],
    GAMES,
  )

  it('counts W–L with no draw column', () => {
    const r = teamRecord(played, 'Japan')
    expect(r).not.toHaveProperty('d')
    expect(r.w).toBe(2)
    expect(r.l).toBe(1)
    expect(r.played).toBe(3)
    expect(r.pf).toBe(240)
    expect(r.pd).toBe(240 - 205)
  })

  it('tracks overtime games instead of shootouts', () => {
    const ot = played.map((g) => (g.num === 1 ? { ...g, ot: 1 } : g))
    expect(teamRecord(ot, 'Japan').otWins).toBe(1)
    expect(teamRecord(ot, 'Mali').otLosses).toBe(1)
    expect(overtimeGames(ot)).toHaveLength(1)
  })

  it('reports the biggest win and the current run', () => {
    const r = teamRecord(played, 'Japan')
    expect(r.biggestWin).toMatchObject({ margin: 30, opponent: 'Mali' })
    // Most recent game first: Japan lost its last, so the run is L1.
    expect(r.streak).toBe(-1)
  })

  it('limits the record to games that tipped off earlier', () => {
    const before = num(22).ko // Japan v Spain
    const r = teamRecord(played, 'Japan', { before })
    expect(r.played).toBe(2)
    expect(r.w).toBe(2)
  })

  it('ignores a level score rather than counting it as a draw', () => {
    const bad = withGroupScores('A', [['Japan', 'Mali', 70, 70]], GAMES)
    expect(teamRecord(bad, 'Japan').played).toBe(0)
  })

  it('lists the teams still involved', () => {
    expect(activeTeams(GAMES).size).toBe(16)
    // Placeholder labels are not real teams.
    expect(activeTeams(GAMES).has('Winner Group A')).toBe(false)
  })

  it('totals the tournament so far', () => {
    const t = tournamentTotals(played)
    expect(t.played).toBe(3)
    expect(t.points).toBe(445)
    expect(t.perGame).toBeCloseTo(445 / 3)
    expect(t.biggest.margin).toBe(30)
    expect(tournamentTotals(GAMES)).toMatchObject({ played: 0, perGame: 0, biggest: null })
    expect(tournamentTotals([{ live: {} }]).live).toBe(1)
  })
})

describe('result notifications', () => {
  const finalGame = { num: 1, t1: 'Japan', t2: 'Mali', score: [88, 61], liveSource: true }

  it('recognizes a finished, live-ish, in-scope game', () => {
    expect(isFinal(finalGame)).toBe(true)
    expect(isFinal({ ...finalGame, live: {} })).toBe(false)
    expect(isFinal({ ...finalGame, voided: true })).toBe(false)
    expect(isLiveish(finalGame)).toBe(true)
    expect(isLiveish({ num: 1 })).toBe(false)
    expect(inScope(finalGame, 'all')).toBe(true)
    expect(inScope(finalGame, 'followed', new Set(['Japan']))).toBe(true)
    expect(inScope(finalGame, 'followed', new Set(['Spain']))).toBe(false)
    expect(inScope(finalGame, 'followed', null)).toBe(false)
  })

  // Never dump the whole tournament on load, or when alerts are first enabled.
  it('records a game seen for the first time without notifying', () => {
    const { next, events } = detectFinals(null, [finalGame], { scope: 'all' })
    expect(events).toHaveLength(0)
    expect(next.get(1)).toBe(true)
  })

  it('notifies when a game newly goes final', () => {
    const before = detectFinals(null, [{ ...finalGame, score: undefined, live: {} }], { scope: 'all' })
    const { events } = detectFinals(before.next, [finalGame], { scope: 'all' })
    expect(events).toHaveLength(1)
    expect(events[0].game.num).toBe(1)
  })

  // A transient feed gap must not make the same result fire twice.
  it('never re-fires a result it has already reported', () => {
    const first = detectFinals(null, [{ ...finalGame, score: undefined, live: {} }], { scope: 'all' })
    const second = detectFinals(first.next, [finalGame], { scope: 'all' })
    const dropped = detectFinals(second.next, [{ ...finalGame, score: undefined }], { scope: 'all' })
    const restored = detectFinals(dropped.next, [finalGame], { scope: 'all' })
    expect(restored.events).toHaveLength(0)
  })

  it('stays silent for a committed score that was never live', () => {
    const committed = { num: 1, t1: 'Japan', t2: 'Mali', score: [88, 61] }
    const first = detectFinals(null, [{ ...committed, score: undefined }], { scope: 'all' })
    expect(detectFinals(first.next, [committed], { scope: 'all' }).events).toHaveLength(0)
  })

  it('formats a result notification, noting overtime', () => {
    expect(finalNotification({ game: finalGame })).toMatchObject({
      title: '🏀 FINAL: Japan win',
      body: 'Japan 88–61 Mali',
      tag: 'final|1',
    })
    expect(finalNotification({ game: { ...finalGame, ot: 1 } }).title).toContain('(OT)')
    expect(finalNotification({ game: { ...finalGame, ot: 2 } }).title).toContain('(2OT)')
    expect(finalNotification({ game: { ...finalGame, score: [61, 88] } }).title).toContain('Mali')
  })

  // The toast list is keyed by notification tag, so the same result arriving
  // twice (a re-render, a poll that overlaps its predecessor) cannot stack.
  it('appends a new result to the toast list', () => {
    const merged = mergeToasts([], [{ game: finalGame }])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('final|1')
    expect(merged[0].ev.game.t1).toBe('Japan')
  })

  it('keeps toasts already on screen when a different game ends', () => {
    const other = { num: 2, t1: 'Spain', t2: 'Nigeria', score: [70, 65] }
    const merged = mergeToasts(mergeToasts([], [{ game: finalGame }]), [{ game: other }])
    expect(merged.map((x) => x.id)).toEqual(['final|1', 'final|2'])
  })

  // Returning the ORIGINAL array, not a copy, is what lets React skip the
  // re-render; an equal-but-new array would repaint the toast stack on every
  // poll for as long as a toast is up.
  it('returns the same array when every event is already showing', () => {
    const first = mergeToasts([], [{ game: finalGame }])
    expect(mergeToasts(first, [{ game: finalGame }])).toBe(first)
    expect(mergeToasts(first, [])).toBe(first)
  })
})

describe('week bucketing', () => {
  it('walks days and weeks', () => {
    expect(addDays('2026-09-04', 1)).toBe('2026-09-05')
    expect(addDays('2026-09-04', -1)).toBe('2026-09-03')
    expect(weekStartOf('2026-09-04')).toBe('2026-08-30') // the Sunday before
    expect(weekLabel('2026-08-30')).toBeTruthy()
    expect(weekdayHeader('2026-09-04')).toBeTruthy()
  })
})

describe('search', () => {
  const venue = venueFor(G1)

  it('matches plain text against teams and venues', () => {
    expect(matchesSearch(G1, venue, parseQuery('japan'))).toBe(true)
    expect(matchesSearch(G1, venue, parseQuery('berlin'))).toBe(true)
    expect(matchesSearch(G1, venue, parseQuery('australia'))).toBe(false)
  })

  it('supports field-scoped terms', () => {
    expect(matchesSearch(G1, venue, parseQuery('team: Japan'))).toBe(true)
    expect(matchesSearch(G1, venue, parseQuery('team: Spain'))).toBe(false)
    expect(matchesSearch(G1, venue, parseQuery('stage: group'))).toBe(true)
  })

  it('matches everything for an empty query', () => {
    expect(matchesSearch(G1, venue, parseQuery(''))).toBe(true)
  })
})

describe('URL state', () => {
  it('round-trips view, timezone, spoilers and filters', () => {
    const state = {
      view: 'bracket',
      tz: 'Europe/Berlin',
      hideScores: true,
      filters: { ...DEFAULT_FILTERS, group: 'A', team: 'Japan', myTeams: true, search: 'x' },
    }
    writeState(state, 'UTC')
    const read = readState('UTC')
    expect(read.view).toBe('bracket')
    expect(read.tz).toBe('Europe/Berlin')
    expect(read.hideScores).toBe(true)
    expect(read.filters).toEqual(state.filters)
  })

  it('writes nothing for defaults', () => {
    writeState({ view: 'schedule', tz: 'UTC', hideScores: false, filters: DEFAULT_FILTERS }, 'UTC')
    expect(window.location.search).toBe('')
    expect(readState('UTC').view).toBe('schedule')
  })

  // The football sibling carried an English/Spanish broadcast filter. This
  // edition has a single US rights holder, so the key must be gone rather than
  // left in the URL contract as an inert value.
  it('has no broadcast-language filter', () => {
    expect(DEFAULT_FILTERS).not.toHaveProperty('feed')
  })
})

describe('calendar files', () => {
  it('builds a single-game .ics naming the tournament, not a sibling', () => {
    const ics = buildICS(G1)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:FIBA WWC: Japan vs Mali')
    expect(ics).toContain('Berlin Arena')
    expect(ics).toContain('Game 1')
    // The inherited generator said "EURO:": a leftover from another sibling.
    expect(ics).not.toContain('EURO')
    expect(ics).toContain("PRODID:-//FIBA Women's World Cup 2026 Viewer//EN")
    expect(ics).toContain('UID:fibawwc2026-game-1@')
  })

  it('lists the US broadcaster when the game has one', () => {
    expect(buildICS(G1)).toContain('HBO Max')
  })

  it('builds a whole-tournament collection', () => {
    const ics = buildICSCollection(GAMES.filter((g) => g.stage === 'Group'))
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(24)
  })

  it('turns a feed URL into subscription links', () => {
    expect(webcalUrl('https://x.test/feed.ics')).toBe('webcal://x.test/feed.ics')
    expect(googleCalendarUrl('https://x.test/feed.ics')).toContain('cid=webcal://')
  })
})
