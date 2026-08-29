// Clinch / elimination detection.
//
// The engine's contract is that it NEVER over-claims: a verdict is only issued
// when it holds under every remaining win/loss outcome. Most of these tests are
// therefore about what it refuses to say as much as what it says.

import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/games.js'
import {
  clinchBadge,
  clinchHeadline,
  computeClinch,
  groupPositionBounds,
  groupWinners,
  newlyClinched,
  reachableOrderings,
  resolveGroupSlots,
  resolveSettledSlots,
  settledGroupPlacings,
} from '../src/utils/clinch.js'
import { withGroupScores } from './helpers/tournament.js'

const A = (results) => withGroupScores('A', results, GAMES)

// Group A fixtures, for reference:
//   1 Japan v Mali · 6 Spain v Germany · 9 Mali v Spain
//   11 Germany v Japan · 21 Germany v Mali · 22 Japan v Spain
const DECISIVE = [
  ['Japan', 'Mali', 90, 60],
  ['Japan', 'Spain', 90, 60],
  ['Germany', 'Japan', 60, 90], // Japan 3-0
  ['Spain', 'Germany', 80, 70],
  ['Mali', 'Spain', 60, 80], // Spain 2-1
  ['Germany', 'Mali', 80, 70], // Germany 1-2, Mali 0-3
]

describe('a completed group', () => {
  const done = A(DECISIVE)
  const clinch = computeClinch(done)

  it('names the winner, second, third and the eliminated team', () => {
    expect(clinch.Japan).toBe('won-group')
    expect(clinch.Spain).toBe('second')
    expect(clinch.Germany).toBe('third')
    expect(clinch.Mali).toBe('eliminated')
  })

  it('locks every position', () => {
    const b = groupPositionBounds(done)
    expect(b.Japan).toEqual({ best: 1, worst: 1 })
    expect(b.Spain).toEqual({ best: 2, worst: 2 })
    expect(b.Germany).toEqual({ best: 3, worst: 3 })
    expect(b.Mali).toEqual({ best: 4, worst: 4 })
  })

  it('leaves the other three groups undecided', () => {
    expect(clinch.France).toBeNull()
    expect(groupWinners(clinch)).toEqual({ A: 'Japan' })
  })

  it('reports exactly one reachable ordering', () => {
    expect(reachableOrderings('A', done).size).toBe(1)
  })
})

describe('before anything is played', () => {
  const clinch = computeClinch(GAMES)

  it('claims nothing at all', () => {
    for (const v of Object.values(clinch)) expect(v).toBeNull()
  })

  it('leaves every team able to finish anywhere', () => {
    const b = groupPositionBounds(GAMES)
    expect(b.Japan).toEqual({ best: 1, worst: 4 })
    expect(b['United States']).toEqual({ best: 1, worst: 4 })
  })

  it('reports all 24 orderings of a four-team group as reachable', () => {
    expect(reachableOrderings('A', GAMES).size).toBe(24)
  })
})

describe('partial groups', () => {
  // Japan and Spain have each won twice; Germany and Mali have lost twice. The
  // last round is Germany v Mali and Japan v Spain. Whatever happens, Japan and
  // Spain finish 1st and 2nd in some order.
  const twoRounds = A([
    ['Japan', 'Mali', 90, 60],
    ['Spain', 'Germany', 90, 60],
    ['Mali', 'Spain', 60, 90],
    ['Germany', 'Japan', 60, 90],
  ])

  it('clinches a top-three place without pinning the placing', () => {
    const clinch = computeClinch(twoRounds)
    expect(clinch.Japan).toBe('through')
    expect(clinch.Spain).toBe('through')
    const b = groupPositionBounds(twoRounds)
    expect(b.Japan).toEqual({ best: 1, worst: 2 })
  })

  // Three of four advance, so a team on nothing is still alive as long as it can
  // reach third, which is a far lower bar than the football siblings' top two.
  it('does not eliminate a winless team that can still reach third', () => {
    const clinch = computeClinch(twoRounds)
    expect(clinch.Germany).toBeNull()
    expect(clinch.Mali).toBeNull()
    const b = groupPositionBounds(twoRounds)
    expect(b.Germany.best).toBeLessThanOrEqual(3)
  })

  // A live score is provisional: a team that is merely winning has clinched
  // nothing. This is the difference between `live` and a final result.
  it('treats a live game as unplayed', () => {
    const live = twoRounds.map((g) =>
      g.num === 22 ? { ...g, score: [99, 40], live: { clock: '2:00', period: 'Q4' } } : g,
    )
    const clinch = computeClinch(live)
    expect(clinch.Japan).toBe('through') // not yet 'won-group'
    expect(groupPositionBounds(live).Japan).toEqual({ best: 1, worst: 2 })
  })

  it('ignores a voided game', () => {
    const voided = A([['Japan', 'Mali', 90, 60]]).map((g) =>
      g.num === 1 ? { ...g, voided: true } : g,
    )
    expect(groupPositionBounds(voided).Japan).toEqual({ best: 1, worst: 4 })
  })
})

describe('conservatism', () => {
  // When the games among tied teams are still outstanding, the tie-break cannot
  // be known, so the engine must widen the range rather than guess an order.
  it('refuses to order teams whose meeting has not happened', () => {
    // Germany and Mali have both beaten nobody and still play each other; Japan
    // and Spain have both won twice and still play each other.
    const board = A([
      ['Japan', 'Mali', 90, 60],
      ['Spain', 'Germany', 90, 60],
      ['Mali', 'Spain', 60, 90],
      ['Germany', 'Japan', 60, 90],
    ])
    const b = groupPositionBounds(board)
    // Japan/Spain share 1-2 and Germany/Mali share 3-4: neither pair is ordered.
    expect(b.Japan).toEqual({ best: 1, worst: 2 })
    expect(b.Spain).toEqual({ best: 1, worst: 2 })
    expect(b.Germany).toEqual({ best: 3, worst: 4 })
    expect(b.Mali).toEqual({ best: 3, worst: 4 })
  })

  // The engine is exact where it can be. Once the deciding game is played the
  // range must collapse, not stay wide.
  it('collapses the range as soon as the deciding game is final', () => {
    const board = A([
      ['Japan', 'Mali', 90, 60],
      ['Spain', 'Germany', 90, 60],
      ['Mali', 'Spain', 60, 90],
      ['Germany', 'Japan', 60, 90],
      ['Japan', 'Spain', 80, 70],
    ])
    const b = groupPositionBounds(board)
    expect(b.Japan).toEqual({ best: 1, worst: 1 })
    expect(b.Spain).toEqual({ best: 2, worst: 2 })
  })
})

describe('slot resolution', () => {
  const done = A(DECISIVE)

  it('fills the three final-phase slots a settled group feeds', () => {
    const resolved = resolveGroupSlots(done, computeClinch(done))
    const byNum = new Map(resolved.map((g) => [g.num, g]))
    // FIBA's wiring: 1A -> game 29 (QF), 2A -> game 25 (QR), 3A -> game 26 (QR).
    expect(byNum.get(29).t1).toBe('Japan')
    expect(byNum.get(25).t1).toBe('Spain')
    expect(byNum.get(26).t2).toBe('Germany')
  })

  it('leaves the labels intact alongside the resolved teams', () => {
    const resolved = resolveGroupSlots(done, computeClinch(done))
    const g29 = resolved.find((g) => g.num === 29)
    expect(g29.label1).toBe('Winner Group A')
    expect(g29.t1).toBe('Japan')
  })

  it('never touches a group game', () => {
    const resolved = resolveGroupSlots(done, computeClinch(done))
    for (const g of resolved.filter((x) => x.stage === 'Group')) {
      expect(g).toBe(done.find((x) => x.num === g.num))
    }
  })

  it('resolves a completed group from the table even without a clinch verdict', () => {
    expect(settledGroupPlacings(done).A).toEqual({
      1: 'Japan',
      2: 'Spain',
      3: 'Germany',
    })
    const resolved = resolveSettledSlots(done)
    expect(resolved.find((g) => g.num === 29).t1).toBe('Japan')
  })

  it('resolves nothing while no group has finished', () => {
    expect(settledGroupPlacings(GAMES)).toEqual({})
    expect(resolveSettledSlots(GAMES)).toBe(GAMES)
  })
})

describe('change detection and presentation', () => {
  it('reports only what a new batch of results settled', () => {
    const before = A([
      ['Japan', 'Mali', 90, 60],
      ['Spain', 'Germany', 90, 60],
      ['Mali', 'Spain', 60, 90],
      ['Germany', 'Japan', 60, 90],
    ])
    const after = A(DECISIVE)
    const changes = newlyClinched(before, after)
    const byTeam = Object.fromEntries(changes.map((c) => [c.team, c.status]))
    expect(byTeam.Japan).toBe('won-group')
    expect(byTeam.Mali).toBe('eliminated')
    // Nothing outside Group A moved.
    expect(changes.every((c) => c.group === 'A')).toBe(true)
  })

  it('writes a headline for every status it can emit', () => {
    for (const status of ['won-group', 'second', 'third', 'through', 'eliminated']) {
      const line = clinchHeadline({ team: 'Japan', group: 'A', status })
      expect(line).toContain('Japan')
      expect(line.length).toBeGreaterThan(10)
    }
    expect(clinchHeadline({ team: 'Japan', group: 'A', status: 'won-group' })).toMatch(
      /quarter-finals/,
    )
  })

  it('badges every status and nothing else', () => {
    for (const status of ['won-group', 'second', 'third', 'through', 'eliminated']) {
      const b = clinchBadge(status)
      expect(b.label).toBeTruthy()
      expect(b.title).toBeTruthy()
    }
    expect(clinchBadge(null)).toBeNull()
    expect(clinchBadge('nonsense')).toBeNull()
  })
})
