// Shared fixture helpers.
//
// This edition has NOT been played, so src/data/games.js ships score-free and a
// test that wants results has to state them. That is the opposite of the
// finished FIFA sibling this repo was grown from, where the helper's job was to
// STRIP results to get a pre-tournament board.
//
// Two consequences worth knowing before writing a test here:
//
//   * `GAMES` is already the "nothing played yet" board. There is no `unscored()`
//     and no need for one.
//   * The twelve final-phase records carry `label1`/`label2` and null teams from
//     the start, so bracket code must be exercised through the resolver rather
//     than by handing it a board that already names teams.

import { GAMES } from '../../src/data/games.js'
import { TEAMS } from '../../src/data/teams.js'

export const groupTeams = (g) => TEAMS[g].map((t) => t.name)

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
