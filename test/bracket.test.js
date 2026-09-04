// The final-phase bracket: topology, slot grammar and route tracing.
//
// The topology assertions are quoted from FIBA's published schedule sheet. They
// exist because the "obvious" wiring is wrong for this edition and a tidier,
// incorrect bracket is an easy thing to introduce by accident.

import { describe, it, expect } from 'vitest'
import { GAMES } from './fixtures/pretournament-games.js'
import {
  BRACKET,
  feederTeams,
  gamesByNum,
  groupSlotMap,
  knockoutTeams,
  pathToFinal,
} from '../src/utils/bracket.js'
import {
  BYE_ROUND,
  ENTRY_ROUND,
  GROUP_FED_ROUNDS,
  enteredAt,
  entryGames,
  groupFedGames,
  groupPlacing,
  slotLabels,
} from '../src/utils/slots.js'

const byNum = gamesByNum(GAMES)
const labelsOf = (num) => slotLabels(byNum[num])

describe('the wiring FIBA published', () => {
  it('sends the group winner to a quarter-final and 2nd/3rd to the qualification round', () => {
    expect(ENTRY_ROUND).toBe('QR')
    expect(BYE_ROUND).toBe('QF')
    expect(GROUP_FED_ROUNDS).toEqual(['QR', 'QF'])
    expect(enteredAt(1)).toBe('QF')
    expect(enteredAt(2)).toBe('QR')
    expect(enteredAt(3)).toBe('QR')
    expect(enteredAt(4)).toBeNull()
  })

  it('crosses A<->B and C<->D in the qualification round', () => {
    expect(labelsOf(25)).toEqual(['2nd Group A', '3rd Group B'])
    expect(labelsOf(26)).toEqual(['2nd Group B', '3rd Group A'])
    expect(labelsOf(27)).toEqual(['3rd Group C', '2nd Group D'])
    expect(labelsOf(28)).toEqual(['3rd Group D', '2nd Group C'])
  })

  // THE trap. The quarter-finals cross the OTHER way: the A/B group winners meet
  // the C/D qualification winners. Straightening this into "A and B stay on one
  // side" produces a plausible-looking bracket that is simply not the one being
  // played, and it would also allow a group rematch in the quarter-finals.
  it('crosses BACK in the quarter-finals, so A/B winners meet C/D qualifiers', () => {
    expect(labelsOf(29)).toEqual(['Winner Group A', 'Winner Game 27']) // 27 is C/D
    expect(labelsOf(30)).toEqual(['Winner Group B', 'Winner Game 28']) // 28 is C/D
    expect(labelsOf(31)).toEqual(['Winner Group C', 'Winner Game 25']) // 25 is A/B
    expect(labelsOf(32)).toEqual(['Winner Group D', 'Winner Game 26']) // 26 is A/B
  })

  it('makes a group rematch in the quarter-finals impossible', () => {
    // For each QF, the group of the winner slot must not appear among the groups
    // feeding its qualification game.
    const qrGroups = (num) =>
      new Set(labelsOf(num).map((l) => groupPlacing(l)?.group).filter(Boolean))
    for (const qf of [29, 30, 31, 32]) {
      const [winnerLabel, feedLabel] = labelsOf(qf)
      const winnerGroup = groupPlacing(winnerLabel).group
      const feedNum = Number(/Winner Game (\d+)/.exec(feedLabel)[1])
      expect(qrGroups(feedNum).has(winnerGroup)).toBe(false)
    }
  })

  it('pairs the semi-finals across the halves, not by adjacent number', () => {
    expect(labelsOf(33)).toEqual(['Winner Game 29', 'Winner Game 32'])
    expect(labelsOf(34)).toEqual(['Winner Game 30', 'Winner Game 31'])
  })

  it('feeds the third-place game from the two beaten semi-finalists', () => {
    expect(labelsOf(35)).toEqual(['Loser Game 33', 'Loser Game 34'])
    expect(labelsOf(36)).toEqual(['Winner Game 33', 'Winner Game 34'])
  })
})

describe('the rendered layout', () => {
  it('places the two halves so they meet only in the Final', () => {
    expect(BRACKET.left).toEqual({ QR: [27, 26], QF: [29, 32], SF: [33] })
    expect(BRACKET.right).toEqual({ SF: [34], QF: [30, 31], QR: [28, 25] })
    expect(BRACKET.final).toEqual([36])
    expect(BRACKET.third).toEqual([35])
  })

  it('lays out every final-phase game exactly once', () => {
    const laid = [
      ...Object.values(BRACKET.left).flat(),
      ...Object.values(BRACKET.right).flat(),
      ...BRACKET.final,
      ...BRACKET.third,
    ].sort((a, b) => a - b)
    expect(laid).toEqual([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36])
  })

  // The bracket is intentionally lopsided: a quarter-final has ONE feeding box
  // because its other slot is a group winner on a bye.
  it('gives each half as many qualification boxes as quarter-final boxes', () => {
    expect(BRACKET.left.QR).toHaveLength(BRACKET.left.QF.length)
    expect(BRACKET.right.QR).toHaveLength(BRACKET.right.QF.length)
  })

  it('orders each half’s boxes so a feeder sits beside what it feeds', () => {
    // Left: QR 27 -> QF 29, QR 26 -> QF 32.
    expect(labelsOf(BRACKET.left.QF[0])[1]).toBe(`Winner Game ${BRACKET.left.QR[0]}`)
    expect(labelsOf(BRACKET.left.QF[1])[1]).toBe(`Winner Game ${BRACKET.left.QR[1]}`)
    expect(labelsOf(BRACKET.right.QF[0])[1]).toBe(`Winner Game ${BRACKET.right.QR[0]}`)
    expect(labelsOf(BRACKET.right.QF[1])[1]).toBe(`Winner Game ${BRACKET.right.QR[1]}`)
  })
})

describe('slot grammar', () => {
  it('parses each group-placing form', () => {
    expect(groupPlacing('Winner Group A')).toEqual({ group: 'A', place: 1 })
    expect(groupPlacing('2nd Group B')).toEqual({ group: 'B', place: 2 })
    expect(groupPlacing('3rd Group D')).toEqual({ group: 'D', place: 3 })
  })

  it('refuses a feed label, a real team, and a group this edition lacks', () => {
    expect(groupPlacing('Winner Game 27')).toBeNull()
    expect(groupPlacing('Japan')).toBeNull()
    expect(groupPlacing('Winner Group F')).toBeNull()
  })

  it('selects the group-fed and entry rounds', () => {
    expect(entryGames(GAMES).map((g) => g.num)).toEqual([25, 26, 27, 28])
    expect(groupFedGames(GAMES).map((g) => g.num)).toEqual([25, 26, 27, 28, 29, 30, 31, 32])
  })

  it('reads labels from a record whose teams are already resolved', () => {
    const resolved = { ...byNum[29], t1: 'Japan', t2: 'Australia' }
    expect(slotLabels(resolved)).toEqual(['Winner Group A', 'Winner Game 27'])
  })
})

describe('group routes', () => {
  it('maps each group’s three placings to the games they feed', () => {
    const map = groupSlotMap(GAMES)
    expect(map.A).toEqual({ win: 29, second: 25, third: 26 })
    expect(map.B).toEqual({ win: 30, second: 26, third: 25 })
    expect(map.C).toEqual({ win: 31, second: 28, third: 27 })
    expect(map.D).toEqual({ win: 32, second: 27, third: 28 })
  })

  it('routes every group’s winner to a quarter-final and the others to the QR', () => {
    const map = groupSlotMap(GAMES)
    for (const g of ['A', 'B', 'C', 'D']) {
      expect(byNum[map[g].win].stage).toBe('QF')
      expect(byNum[map[g].second].stage).toBe('QR')
      expect(byNum[map[g].third].stage).toBe('QR')
    }
  })
})

describe('feeder expansion', () => {
  it('expands a feed slot once its source game has two real teams', () => {
    const resolved = gamesByNum(
      GAMES.map((g) => (g.num === 27 ? { ...g, t1: 'Australia', t2: 'Italy' } : g)),
    )
    expect(feederTeams('Winner Game 27', resolved)).toEqual({
      a: 'Australia',
      b: 'Italy',
      kind: 'Winner',
      num: 27,
    })
    expect(feederTeams('Loser Game 27', resolved).kind).toBe('Loser')
  })

  it('expands nothing for a real team, a group label, or an unresolved source', () => {
    expect(feederTeams('Japan', byNum)).toBeNull()
    expect(feederTeams('Winner Group A', byNum)).toBeNull()
    expect(feederTeams('Winner Game 27', byNum)).toBeNull()
    expect(feederTeams('Winner Game 27', null)).toBeNull()
  })
})

describe('path to the Final', () => {
  // A group winner's route is one game SHORTER, because it starts at the
  // quarter-final. That is the concrete prize for winning a group here.
  it('starts a group winner at the quarter-final', () => {
    const resolved = gamesByNum(GAMES.map((g) => (g.num === 29 ? { ...g, t1: 'Japan' } : g)))
    const p = pathToFinal('Japan', resolved)
    expect(p.entry).toBe('QF')
    expect(p.nums).toEqual([29, 33, 36])
  })

  it('starts a qualification-round team a game earlier', () => {
    const resolved = gamesByNum(GAMES.map((g) => (g.num === 25 ? { ...g, t1: 'Spain' } : g)))
    const p = pathToFinal('Spain', resolved)
    expect(p.entry).toBe('QR')
    expect(p.nums).toEqual([25, 31, 34, 36])
    expect(p.nums.length).toBe(4)
  })

  it('marks where a team went out and stops the highlight there', () => {
    const board = GAMES.map((g) => {
      if (g.num === 25) return { ...g, t1: 'Spain', t2: 'Nigeria', score: [80, 70] }
      if (g.num === 31) return { ...g, t1: 'Australia', t2: 'Spain', score: [90, 60] }
      return g
    })
    const p = pathToFinal('Spain', gamesByNum(board))
    expect(p.here).toEqual([25, 31])
    expect(p.exitNum).toBe(31)
    expect(p.active).toEqual([25, 31])
  })

  it('keeps the whole route active while a team is alive', () => {
    const board = GAMES.map((g) =>
      g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria', score: [80, 70] } : g,
    )
    const p = pathToFinal('Spain', gamesByNum(board))
    expect(p.exitNum).toBeNull()
    expect(p.active).toEqual(p.nums)
  })

  it('returns nothing for a team not in the final phase, or for none', () => {
    expect(pathToFinal('Japan', byNum)).toBeNull()
    expect(pathToFinal(null, byNum)).toBeNull()
  })

  it('lists the real teams that have reached the final phase', () => {
    expect(knockoutTeams(byNum)).toEqual([])
    const resolved = gamesByNum(
      GAMES.map((g) => (g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria' } : g)),
    )
    expect(knockoutTeams(resolved)).toEqual(['Nigeria', 'Spain'])
  })
})
