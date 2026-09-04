// Shared fixture helpers.
//
// Every builder here starts from the FROZEN pre-tournament board in
// test/fixtures/pretournament-games.js, never from src/data/games.js. The
// committed board is regenerated three times a day for the whole 4-13 September
// window, so a builder based on it would quietly inherit real results: overlay
// one group's scores and the other three groups would still carry whatever the
// last refresh landed. That is what turned the suite red on September 4, 2026.
//
// Two consequences worth knowing before writing a test here:
//
//   * `GAMES` here is the "nothing played yet" board. There is no `unscored()`
//     and no need for one.
//   * The twelve final-phase records carry `label1`/`label2` and null teams from
//     the start, so bracket code must be exercised through the resolver rather
//     than by handing it a board that already names teams.

import { vi } from 'vitest'
import { GAMES } from '../fixtures/pretournament-games.js'
import { TEAMS } from '../../src/data/teams.js'

export const groupTeams = (g) => TEAMS[g].map((t) => t.name)

// A fixed instant two and a half hours before the tournament's first tip-off
// (game 1, 11:30 CEST on September 4, 2026).
export const BEFORE_TIPOFF = new Date('2026-09-04T09:00:00+02:00')

// Pin the clock, for anything that asks "what is next", "has this tipped off"
// or "is this game live". Those answers come from Date.now(), so on a real clock
// they change by the hour for the whole tournament window and then change again
// forever once it ends. Six tests here went red on September 4, 2026 with no
// commit behind them, purely because the day arrived.
//
// Only Date is faked, so real timers and @testing-library's waitFor keep
// working. A test that also wants to drive setInterval should call
// vi.useFakeTimers({ now: BEFORE_TIPOFF }) itself and fake everything.
export function pinClock(when = BEFORE_TIPOFF) {
  vi.useFakeTimers({ now: when, toFake: ['Date'] })
}

// Overlay scores on one group's real fixtures, matching by team pair so the
// caller states results the natural way round regardless of which side the
// committed record lists first.
//
// `results` entries are [teamA, teamB, aPoints, bPoints].
export function withGroupScores(group, results, games = GAMES) {
  return games.map((g) => {
    if (g.stage !== 'Group' || g.group !== group) return g
    const r = results.find(
      ([a, b]) => (a === g.t1 && b === g.t2) || (a === g.t2 && b === g.t1),
    )
    if (!r) return g
    const [a, , ap, bp] = r
    return { ...g, score: a === g.t1 ? [ap, bp] : [bp, ap] }
  })
}

// A complete group where every game is decided by `margin`, cycling the winner
// through the given order. Handy when a test cares about the STANDING, not the
// scoreline.
export function groupWithWinners(group, winners, games = GAMES) {
  return games.map((g) => {
    if (g.stage !== 'Group' || g.group !== group) return g
    const w = winners[g.num]
    if (!w) return g
    return { ...g, score: w === g.t1 ? [80, 70] : [70, 80] }
  })
}

// Decide every group game in every group, so the whole group phase is complete.
// `pick(game)` returns the winning team name; it defaults to the first side, which
// makes the resulting tables deterministic but deliberately tie-heavy.
export function allGroupsPlayed(pick = (g) => g.t1, games = GAMES) {
  return games.map((g) => {
    if (g.stage !== 'Group') return g
    const w = pick(g)
    return { ...g, score: w === g.t1 ? [80, 70] : [70, 80] }
  })
}

// Set the result of one final-phase game, naming both sides explicitly: the
// bracket resolver fills `t1`/`t2`, so a test that wants to force a result has
// to supply them too.
export function decideFinalPhase(games, num, t1, t2, score) {
  return games.map((g) => (g.num === num ? { ...g, t1, t2, score } : g))
}

// An ESPN scoreboard payload in the shape services/espn.js actually parses.
// `overrides` maps a game number to { state, score, period, statusName }.
//
// This app has ONE runtime source, so a test that needs results to arrive over
// the wire has to speak ESPN.
export function espnScoreboard(games, overrides = {}) {
  return {
    events: games
      .filter((g) => g.espnId && g.ko)
      .map((g) => {
        const o = overrides[g.num] || {}
        const state = o.state || (g.score ? 'post' : 'pre')
        const score = o.score || g.score
        return {
          id: g.espnId,
          date: new Date(g.ko).toISOString().replace('.000', ''),
          status: {
            period: o.period ?? (state === 'pre' ? 0 : 4),
            displayClock: o.clock ?? '0:00',
            type: {
              state,
              name: o.statusName || `STATUS_${state === 'post' ? 'FINAL' : state === 'in' ? 'IN_PROGRESS' : 'SCHEDULED'}`,
              completed: state === 'post',
              description: o.detail || (state === 'post' ? 'Final' : ''),
              shortDetail: o.detail || '',
            },
          },
          competitions: [
            {
              id: g.espnId,
              date: new Date(g.ko).toISOString().replace('.000', ''),
              neutralSite: true,
              venue: { id: g.venue === 'berlinarena' ? '11593' : '12017', fullName: 'x' },
              competitors: [
                // The committed record lists FIBA's first-named team, which ESPN
                // models as the AWAY side, keep that orientation so a test does
                // not accidentally assert a swapped scoreline.
                { homeAway: 'away', score: score ? String(score[0]) : '', team: { id: '1', displayName: g.t1 } },
                { homeAway: 'home', score: score ? String(score[1]) : '', team: { id: '2', displayName: g.t2 } },
              ],
            },
          ],
        }
      }),
  }
}
