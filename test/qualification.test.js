// FIBA group ranking.
//
// The tests that matter here are the DISCRIMINATING ones: cases where FIBA's
// rules give a different answer from the football rules this repo was grown
// from. A test that only checks "the team with more wins finishes higher" would
// pass against either rule set and would not have caught the bug it exists to
// prevent.

import { describe, it, expect } from 'vitest'
import { GAMES } from './fixtures/pretournament-games.js'
import {
  ADVANCING_PER_GROUP,
  DIRECT_TO_QF,
  LOSS_POINTS,
  WIN_POINTS,
  byLots,
  computeQualification,
  groupComplete,
  headToHead,
  rankGroup,
  rowStatus,
} from '../src/utils/qualification.js'
import { withGroupScores } from './helpers/tournament.js'

// Group A is Japan, Spain, Germany, Mali.
const A = (results) => withGroupScores('A', results, GAMES)
const order = (rows) => rows.map((r) => r.name)

describe('FIBA points', () => {
  it('awards 2 for a win and 1 for a LOSS', () => {
    expect(WIN_POINTS).toBe(2)
    expect(LOSS_POINTS).toBe(1)
  })

  it('gives a 3-0 team 6 points and an 0-3 team 3, not 9 and 0', () => {
    const board = A([
      ['Japan', 'Mali', 90, 60],
      ['Japan', 'Spain', 90, 60],
      ['Germany', 'Japan', 60, 90],
      ['Spain', 'Germany', 80, 70],
      ['Mali', 'Spain', 60, 80],
      ['Germany', 'Mali', 80, 70],
    ])
    const rows = rankGroup('A', board)
    const japan = rows.find((r) => r.name === 'Japan')
    const mali = rows.find((r) => r.name === 'Mali')
    expect(japan.W).toBe(3)
    expect(japan.Pts).toBe(6)
    expect(mali.L).toBe(3)
    expect(mali.Pts).toBe(3) // a football table would say 0
  })

  it('counts points for and against, not goals', () => {
    const board = A([['Japan', 'Mali', 88, 61]])
    const rows = rankGroup('A', board)
    const japan = rows.find((r) => r.name === 'Japan')
    expect(japan.PF).toBe(88)
    expect(japan.PA).toBe(61)
    expect(japan.PD).toBe(27)
  })

  it('never records a draw column', () => {
    const rows = rankGroup('A', GAMES)
    for (const r of rows) expect(r).not.toHaveProperty('D')
  })

  // A level score is not a draw in this sport, it is a data error, counting it
  // would award both teams a win and corrupt the table.
  it('ignores a level score rather than treating it as a draw', () => {
    const board = A([['Japan', 'Mali', 70, 70]])
    const rows = rankGroup('A', board)
    for (const r of rows) expect(r.P).toBe(0)
  })
})

describe('tie-breakers', () => {
  // THE test for this module. Three teams level on points, engineered so the
  // head-to-head mini-league and the overall point difference disagree:
  //
  //   overall point difference : Japan  > Spain > Germany
  //   head-to-head             : Spain  > Japan > Germany
  //
  // FIBA ranks head-to-head FIRST, so Spain must win the group. The FIFA 2023
  // ordering this repo inherited would answer Japan, so a regression to it fails
  // here rather than silently reordering a real group.
  const conflicting = A([
    ['Spain', 'Germany', 100, 60], // h2h: Spain +40
    ['Germany', 'Japan', 80, 70], // h2h: Germany +10
    ['Japan', 'Spain', 85, 80], // h2h: Japan +5
    ['Japan', 'Mali', 120, 60],
    ['Germany', 'Mali', 95, 65],
    ['Mali', 'Spain', 70, 71],
  ])

  it('puts head-to-head AHEAD of overall point difference', () => {
    const rows = rankGroup('A', conflicting)
    expect(rows.filter((r) => r.Pts === 5).map((r) => r.name)).toEqual([
      'Spain',
      'Japan',
      'Germany',
    ])
  })

  it('is genuinely a conflict, overall PD alone would order it differently', () => {
    const rows = rankGroup('A', conflicting)
    const tied = rows.filter((r) => r.Pts === 5)
    const byPD = [...tied].sort((a, b) => b.PD - a.PD).map((r) => r.name)
    expect(byPD).toEqual(['Japan', 'Spain', 'Germany'])
    expect(byPD).not.toEqual(order(tied))
  })

  it('breaks a straight two-way tie on the game between them', () => {
    // Japan and Spain both 2-1; Spain beat Japan, so Spain finishes above.
    const board = A([
      ['Japan', 'Mali', 90, 60],
      ['Spain', 'Germany', 90, 60],
      ['Japan', 'Spain', 70, 75],
      ['Germany', 'Japan', 60, 80],
      ['Mali', 'Spain', 60, 80],
      ['Germany', 'Mali', 90, 60],
    ])
    const rows = rankGroup('A', board)
    const names = rows.map((r) => r.name)
    expect(names.indexOf('Spain')).toBeLessThan(names.indexOf('Japan'))
  })

  it('falls through to overall point difference when head-to-head is level', () => {
    const sub = headToHead(['Japan', 'Spain'], 'A', GAMES)
    // Nothing played: the sub-table is empty and separates nobody.
    expect(sub.Japan).toEqual({ Pts: 0, PD: 0, PF: 0 })
  })

  it('builds a head-to-head table from only the games between the named teams', () => {
    const board = A([
      ['Japan', 'Spain', 80, 70],
      ['Japan', 'Mali', 120, 50], // must NOT affect the Japan/Spain sub-table
    ])
    const sub = headToHead(['Japan', 'Spain'], 'A', board)
    expect(sub.Japan.PD).toBe(10)
    expect(sub.Japan.PF).toBe(80)
    expect(sub.Spain.PD).toBe(-10)
  })

  // The last resort. FIBA draws lots, which no viewer can compute, so the app
  // stands in the FIBA World Ranking. These assert it is the RANKING and not the
  // alphabet: every pair below is ordered oppositely by the two rules, so a
  // regression to localeCompare fails here instead of quietly reordering a table.
  it('settles an unbreakable tie by world ranking, not alphabetically', () => {
    expect(byLots('Spain', 'Japan')).toBeLessThan(0) // 6 before 10, A-Z says Japan
    expect(byLots('Mali', 'Spain')).toBeGreaterThan(0) // 18 after 6, A-Z says Mali
    expect(byLots('United States', 'China')).toBeLessThan(0) // 1 before 4
    expect(byLots('Czechia', 'Italy')).toBeGreaterThan(0) // 17 after 14
  })

  // Before a ball is thrown every team is 0-0, so the whole group is one tied
  // block and byLots alone orders the opening table. Alphabetical order opened
  // group A with Germany on top and the world number 6 in last place.
  it('opens the unplayed tournament in world-ranking order', () => {
    expect(order(rankGroup('A', GAMES))).toEqual(['Spain', 'Japan', 'Germany', 'Mali'])
    expect(order(rankGroup('B', GAMES))).toEqual(['France', 'Nigeria', 'South Korea', 'Hungary'])
    expect(order(rankGroup('C', GAMES))).toEqual(['Australia', 'Belgium', 'Puerto Rico', 'Türkiye'])
    expect(order(rankGroup('D', GAMES))).toEqual(['United States', 'China', 'Italy', 'Czechia'])
  })

  // Ranking is the LAST resort, never a shortcut past the court. Mali is ranked
  // 18th and Spain 6th, so if the ranking ever outranked results Mali could not
  // top this group.
  it('still lets results beat the ranking', () => {
    const board = A([
      ['Mali', 'Spain', 80, 70],
      ['Mali', 'Japan', 85, 70],
      ['Mali', 'Germany', 90, 70],
      ['Spain', 'Japan', 75, 70],
      ['Spain', 'Germany', 75, 70],
      ['Japan', 'Germany', 75, 70],
    ])
    expect(order(rankGroup('A', board))[0]).toBe('Mali')
  })
})

describe('advancement', () => {
  it('advances three of four, with only the winner going straight to the QFs', () => {
    expect(ADVANCING_PER_GROUP).toBe(3)
    expect(DIRECT_TO_QF).toBe(1)
  })

  const complete = A([
    ['Japan', 'Mali', 90, 60],
    ['Japan', 'Spain', 90, 60],
    ['Germany', 'Japan', 60, 90],
    ['Spain', 'Germany', 80, 70],
    ['Mali', 'Spain', 60, 80],
    ['Germany', 'Mali', 80, 70],
  ])

  it('labels the four placings qf / qr / qr / out', () => {
    const qual = computeQualification(complete)
    const rows = qual.groups.A
    expect(rows.map((r) => rowStatus(r, 'A', qual))).toEqual(['qf', 'qr', 'qr', 'out'])
  })

  it('says nothing about placing while the group is still in progress', () => {
    const qual = computeQualification(A([['Japan', 'Mali', 90, 60]]))
    for (const r of qual.groups.A) expect(rowStatus(r, 'A', qual)).toBeNull()
  })

  it('reports completion per group and overall', () => {
    expect(groupComplete('A', complete)).toBe(true)
    expect(groupComplete('B', complete)).toBe(false)
    expect(computeQualification(complete).allComplete).toBe(false)
    expect(computeQualification(GAMES).allComplete).toBe(false)
  })

  it('ranks all four teams even before a ball is thrown up', () => {
    const rows = rankGroup('A', GAMES)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    for (const r of rows) expect(r.P).toBe(0)
  })
})
