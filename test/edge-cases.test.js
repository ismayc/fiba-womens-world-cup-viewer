// Defensive and edge-case branches across the pure modules.
//
// These are the arms a normal tournament never reaches: malformed records, a
// group whose games have not been drawn, a total tie nothing can separate. They
// exist so a bad feed degrades rather than crashes, and they are tested so the
// degradation is the one intended.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { GAMES } from '../src/data/games.js'
import { projectKnockout } from '../src/utils/asItStands.js'
import { gamesByNum, pathToFinal } from '../src/utils/bracket.js'
import { resolveKnockoutSlots } from '../src/utils/bracketResolve.js'
import {
  computeClinch,
  groupPositionBounds,
  reachableOrderings,
  resolveGroupSlots,
  resolveSettledSlots,
} from '../src/utils/clinch.js'
import { buildICS, downloadICS } from '../src/utils/ics.js'
import { lockedOpponent } from '../src/utils/opponentClinch.js'
import { headToHead, rankGroup } from '../src/utils/qualification.js'
import { softTiebreaks } from '../src/utils/tiebreakNotes.js'
import { detectTimezone, gameDayKey, tzAbbrev } from '../src/utils/time.js'
import { colorForGame, GROUP_COLORS, KNOCKOUT_COLOR } from '../src/data/groupColors.js'
import { withGroupScores } from './helpers/tournament.js'

const num = (n) => GAMES.find((g) => g.num === n)
const A = (results) => withGroupScores('A', results, GAMES)

afterEach(() => vi.restoreAllMocks())

describe('malformed game records', () => {
  // A record naming a team that is not in the group must be skipped rather than
  // crash the table or credit a phantom side.
  it('skips a group game naming a team outside the group', () => {
    const bogus = GAMES.map((g) =>
      g.num === 1 ? { ...g, t1: 'Narnia', score: [80, 70] } : g,
    )
    const rows = rankGroup('A', bogus)
    expect(rows).toHaveLength(4)
    for (const r of rows) expect(r.P).toBe(0)
    expect(rows.some((r) => r.name === 'Narnia')).toBe(false)
  })

  it('skips a level score in the head-to-head sub-table too', () => {
    const drawn = A([['Japan', 'Spain', 70, 70]])
    expect(headToHead(['Japan', 'Spain'], 'A', drawn)).toEqual({
      Japan: { Pts: 0, PD: 0, PF: 0 },
      Spain: { Pts: 0, PD: 0, PF: 0 },
    })
  })

  it('records the head-to-head win whichever way round the record lists it', () => {
    // Game 22 is Japan v Spain; score it both ways and check the sub-table flips.
    const japanWon = A([['Japan', 'Spain', 90, 60]])
    const spainWon = A([['Japan', 'Spain', 60, 90]])
    expect(headToHead(['Japan', 'Spain'], 'A', japanWon).Japan.Pts).toBe(2)
    expect(headToHead(['Japan', 'Spain'], 'A', spainWon).Spain.Pts).toBe(2)
    expect(headToHead(['Japan', 'Spain'], 'A', spainWon).Japan.Pts).toBe(1)
  })

  it('ignores a level score when counting group points', () => {
    const drawn = A([['Japan', 'Mali', 70, 70]])
    expect(computeClinch(drawn).Japan).toBeNull()
    expect(groupPositionBounds(drawn).Japan).toEqual({ best: 1, worst: 4 })
  })
})

describe('ties nothing can separate', () => {
  // A genuine total tie. Japan, Spain and Germany form a 2-1 cycle with the SAME
  // margin in all three games, and each beats Mali by the same margin too. That
  // makes them level on points, on head-to-head points, on head-to-head point
  // difference AND points scored, and on overall point difference and points
  // scored — so only a drawing of lots is left.
  //
  // Note it has to be a THREE-way tie: see the arithmetic test below.
  const mirrored = A([
    ['Japan', 'Spain', 80, 70],
    ['Spain', 'Germany', 80, 70],
    ['Germany', 'Japan', 80, 70],
    ['Japan', 'Mali', 90, 60],
    ['Mali', 'Spain', 60, 90],
    ['Germany', 'Mali', 90, 60],
  ])

  it('really is level on every computable criterion', () => {
    const tied = rankGroup('A', mirrored).filter((r) => r.name !== 'Mali')
    expect(tied).toHaveLength(3)
    for (const r of tied) {
      expect(r.Pts).toBe(5)
      expect(r.PD).toBe(30)
      expect(r.PF).toBe(240)
    }
    const sub = headToHead(tied.map((r) => r.name), 'A', mirrored)
    for (const v of Object.values(sub)) expect(v).toEqual({ Pts: 3, PD: 0, PF: 150 })
  })

  // FIBA points are 2 for a win and 1 for a loss, so a team's total is always
  // 3 + wins. Four teams share six wins in a single round-robin, which is 1.5
  // each — not an integer. A four-way tie on points therefore CANNOT happen in a
  // group of four, which is why the deepest tie the engine ever has to break is
  // three-way.
  it('cannot produce a four-way tie on points, by arithmetic', () => {
    const boards = [mirrored, A([['Japan', 'Mali', 80, 70]]), GAMES]
    for (const board of boards) {
      const rows = rankGroup('A', board)
      const allSame = rows.every((r) => r.Pts === rows[0].Pts)
      const anyPlayed = rows.some((r) => r.P > 0)
      // Level on points is only possible before anything is played.
      expect(allSame && anyPlayed).toBe(false)
    }
  })

  it('still returns four ordered rows', () => {
    const rows = rankGroup('A', mirrored)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('is deterministic, so the table does not shuffle between renders', () => {
    const once = rankGroup('A', mirrored).map((r) => r.name)
    const twice = rankGroup('A', mirrored).map((r) => r.name)
    expect(once).toEqual(twice)
  })

  it('marks the placings as decided by lots', () => {
    const notes = softTiebreaks('A', mirrored)
    expect(notes.size).toBeGreaterThan(0)
    for (const n of notes.values()) expect(n.reason).toBe('lots')
  })

  // The restart rule: a three-way block that head-to-head splits into a one and
  // a two must re-rank the remaining two from the top.
  it('re-ranks a sub-block the first pass could not separate', () => {
    const rows = rankGroup('A', mirrored)
    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((r) => r.name)).size).toBe(4)
  })
})

describe('bracket edges', () => {
  it('names the winner when the second side wins', () => {
    // koWinner's `b > a` arm, via a route whose exit is decided that way round.
    const board = GAMES.map((g) => {
      if (g.num === 25) return { ...g, t1: 'Spain', t2: 'Nigeria', score: [70, 80] }
      return g
    })
    const p = pathToFinal('Spain', gamesByNum(board))
    expect(p.exitNum).toBe(25)
  })

  it('treats a level score in the final phase as undecided, not a win', () => {
    const board = GAMES.map((g) =>
      g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria', score: [80, 80] } : g,
    )
    const p = pathToFinal('Spain', gamesByNum(board))
    expect(p.exitNum).toBeNull()
    expect(resolveKnockoutSlots(board).find((g) => g.num === 31).t2).toBeNull()
  })

  it('leaves a slot alone when its label is missing entirely', () => {
    const board = GAMES.map((g) => (g.num === 31 ? { ...g, label2: null } : g))
    expect(resolveKnockoutSlots(board).find((g) => g.num === 31).t2).toBeNull()
  })
})

describe('projection edges', () => {
  it('projects from a board whose final-phase slots are already resolved', () => {
    const board = resolveGroupSlots(
      A([
        ['Japan', 'Mali', 90, 60],
        ['Japan', 'Spain', 90, 60],
        ['Germany', 'Japan', 60, 90],
        ['Spain', 'Germany', 80, 70],
        ['Mali', 'Spain', 60, 80],
        ['Germany', 'Mali', 80, 70],
      ]),
      computeClinch(
        A([
          ['Japan', 'Mali', 90, 60],
          ['Japan', 'Spain', 90, 60],
          ['Germany', 'Japan', 60, 90],
          ['Spain', 'Germany', 80, 70],
          ['Mali', 'Spain', 60, 80],
          ['Germany', 'Mali', 80, 70],
        ]),
      ),
    )
    // The live board now names teams where labels used to be; the projection
    // must still read the INVARIANT labels from the committed schedule.
    const { perGroup } = projectKnockout(board)
    expect(perGroup.A.first.team).toBe('Japan')
    expect(perGroup.A.first.round).toBe('QF')
  })

  it('reports no opponent label for a side that is not a pending feed', () => {
    const { perGroup } = projectKnockout(GAMES)
    // 2A plays 3B: a group placing, so a team is named and no feed label is set.
    expect(perGroup.A.second.opponentLabel).toBeNull()
    expect(perGroup.A.second.opponent).toBeTruthy()
  })
})

describe('clinch slot-resolution edges', () => {
  it('leaves a final-phase game alone when its label is null', () => {
    const board = GAMES.map((g) => (g.num === 25 ? { ...g, label1: null } : g))
    const out = resolveGroupSlots(board, {})
    expect(out.find((g) => g.num === 25).t1).toBeNull()
    expect(resolveSettledSlots(board).find((g) => g.num === 25).t1).toBeNull()
  })

  it('enumerates the orderings of a group with one game left', () => {
    const oneLeft = A([
      ['Japan', 'Mali', 90, 60],
      ['Spain', 'Germany', 90, 60],
      ['Mali', 'Spain', 60, 90],
      ['Germany', 'Japan', 60, 90],
      ['Germany', 'Mali', 80, 70],
    ])
    const orders = reachableOrderings('A', oneLeft)
    expect(orders.size).toBeGreaterThan(1)
    for (const o of orders) expect(o.split('>')).toHaveLength(4)
  })
})

describe('opponentClinch edges', () => {
  it('resolves the matchup whichever side of the game the team sits on', () => {
    const settle = (group, order) =>
      order.reduce((board, [a, b, ap, bp]) => withGroupScores(group, [[a, b, ap, bp]], board), GAMES)
    let board = settle('A', [
      ['Japan', 'Mali', 90, 60],
      ['Japan', 'Spain', 90, 60],
      ['Germany', 'Japan', 60, 90],
      ['Spain', 'Germany', 80, 70],
      ['Mali', 'Spain', 60, 80],
      ['Germany', 'Mali', 80, 70],
    ])
    board = withGroupScores(
      'B',
      [
        ['France', 'South Korea', 90, 60],
        ['Hungary', 'France', 60, 90],
        ['Nigeria', 'France', 60, 90],
        ['South Korea', 'Nigeria', 90, 60],
        ['Nigeria', 'Hungary', 60, 90],
        ['Hungary', 'South Korea', 90, 60],
      ],
      board,
    )
    const clinch = computeClinch(board)
    // Game 25 is "2nd Group A" v "3rd Group B": ask from BOTH ends.
    const fromA = lockedOpponent(board, 'Spain', clinch)
    const fromB = lockedOpponent(board, fromA.opponent, clinch)
    expect(fromA.gameNum).toBe(25)
    expect(fromB.gameNum).toBe(25)
    expect(fromB.opponent).toBe('Spain')
  })
})

describe('ics edges', () => {
  it('labels a final-phase game by its stage, not a group', () => {
    const ics = buildICS({ ...num(29), t1: 'Japan', t2: 'Australia' })
    expect(ics).toContain('Quarter-Final · Game 29')
    expect(ics).not.toContain('Group undefined')
  })

  it('omits the TV line when coverage is not announced', () => {
    const ics = buildICS({ ...num(29), t1: 'Japan', t2: 'Australia' })
    expect(ics).not.toContain('US TV:')
  })

  it('includes the score in a collection entry once a game is played', async () => {
    const { buildICSCollection } = await import('../src/utils/ics.js')
    const played = { ...num(1), score: [88, 61] }
    expect(buildICSCollection([played])).toContain('(88–61)')
    expect(buildICSCollection([num(1)])).not.toContain('(')
  })

  it('downloads a single game as a file', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    downloadICS(num(1))
    expect(click).toHaveBeenCalled()
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })
})

describe('time edges', () => {
  it('falls back to UTC when the platform cannot report a timezone', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectTimezone()).toBe('UTC')
    spy.mockRestore()
  })

  it('falls back to UTC when the platform reports an empty timezone', () => {
    const real = Intl.DateTimeFormat
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (...args) {
      const f = new real(...args)
      f.resolvedOptions = () => ({ timeZone: '' })
      return f
    })
    expect(detectTimezone()).toBe('UTC')
  })

  it('names the zone for every timezone the picker offers', async () => {
    const { timezoneOptions } = await import('../src/utils/time.js')
    for (const tz of timezoneOptions('UTC')) {
      expect(tzAbbrev('2026-09-04T11:30:00+02:00', tz), tz).toBeTruthy()
    }
  })

  it('returns null for a game with neither a tip-off nor a date', () => {
    expect(gameDayKey({}, 'UTC')).toBeNull()
  })
})

describe('group colors', () => {
  it('colors a group game by its group and a final-phase game by the accent', () => {
    expect(colorForGame(num(1))).toBe(GROUP_COLORS.A)
    expect(colorForGame(num(29))).toBe(KNOCKOUT_COLOR)
    expect(Object.keys(GROUP_COLORS)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('URL state round-trips every filter', () => {
  it('writes and reads the stage, arena, timeframe and services filters', async () => {
    const { DEFAULT_FILTERS, readState, writeState } = await import('../src/utils/urlState.js')
    const filters = {
      ...DEFAULT_FILTERS,
      stages: ['Group', 'QF'],
      venue: 'berlinarena',
      timeframe: 'upcoming',
      onMyServices: true,
    }
    writeState({ view: 'week', tz: 'Europe/Berlin', hideScores: true, filters }, 'UTC')
    const q = window.location.search
    expect(q).toContain('stages=Group%2CQF')
    expect(q).toContain('venue=berlinarena')
    expect(q).toContain('when=upcoming')
    expect(q).toContain('svc=1')
    expect(readState('UTC').filters).toEqual(filters)
  })

  // The SELECTION behind "on my services" is private; only the flag is shared.
  it('never puts the chosen services themselves in the URL', async () => {
    const { DEFAULT_FILTERS, writeState } = await import('../src/utils/urlState.js')
    writeState(
      { view: 'schedule', tz: 'UTC', hideScores: false, filters: { ...DEFAULT_FILTERS, onMyServices: true } },
      'UTC',
    )
    expect(window.location.search).toBe('?svc=1')
    for (const key of ['hbomax', 'cable', 'youtubetv']) {
      expect(window.location.search).not.toContain(key)
    }
  })

  it('reads an absent stages parameter as no stage filter', async () => {
    const { readState } = await import('../src/utils/urlState.js')
    window.history.replaceState({}, '', '/?view=bracket')
    expect(readState('UTC').filters.stages).toEqual([])
  })
})

describe('the restart rule', () => {
  // FIBA re-runs the whole procedure on a sub-block a pass could not separate.
  // This board is engineered so the three-way tie splits into ONE clear leader
  // and TWO teams still level, which is the only shape that reaches the
  // recursive branch — a flat sort would never revisit them.
  //
  // Japan, Spain and Germany all finish 2-1. In the head-to-head mini-league
  // Japan is clear on point difference, while Spain and Germany remain level on
  // h2h points, h2h point difference AND h2h points scored.
  // Solved rather than guessed. In a three-way cycle A>B>C>A with margins
  // x, y, z, the head-to-head point differences are x-z, y-x and z-y. Setting
  // 2y = x + z leaves B and C level on it; matching their head-to-head points
  // scored, and giving all three the same result against the fourth team, leaves
  // them level on the overall criteria too. Only the leader is separated.
  const board = withGroupScores(
    'A',
    [
      ['Japan', 'Spain', 100, 70], // Japan +30 in the cycle
      ['Spain', 'Germany', 85, 65], // Spain +20
      ['Germany', 'Japan', 90, 80], // Germany +10  (2*20 = 30 + 10)
      ['Japan', 'Mali', 95, 60],
      ['Mali', 'Spain', 60, 95],
      ['Germany', 'Mali', 95, 60],
    ],
    GAMES,
  )

  it('leaves exactly two of the three level on every criterion', () => {
    const rows = rankGroup('A', board)
    const tied = rows.filter((r) => r.Pts === 5)
    expect(tied).toHaveLength(3)
    const [spain, germany] = ['Spain', 'Germany'].map((n) => tied.find((r) => r.name === n))
    // Level on the overall criteria...
    expect(spain.PD).toBe(germany.PD)
    expect(spain.PF).toBe(germany.PF)
    // ...and on every head-to-head one, while Japan is clear.
    const sub = headToHead(tied.map((r) => r.name), 'A', board)
    expect(sub.Spain).toEqual(sub.Germany)
    expect(sub.Japan.PD).toBeGreaterThan(sub.Spain.PD)
  })

  it('separates the leader and then re-ranks the two still level', () => {
    const rows = rankGroup('A', board)
    const order = rows.filter((r) => r.Pts === 5).map((r) => r.name)
    // Japan first on head-to-head point difference; then the restart pass ranks
    // Spain above Germany on the game between just those two.
    expect(order).toEqual(['Japan', 'Spain', 'Germany'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })
})

describe('resolveSettledSlots with a malformed label', () => {
  it('leaves the slot alone rather than throwing, on a COMPLETE group', async () => {
    const { resolveSettledSlots: resolve } = await import('../src/utils/clinch.js')
    const complete = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 90, 60],
        ['Japan', 'Spain', 90, 60],
        ['Germany', 'Japan', 60, 90],
        ['Spain', 'Germany', 80, 70],
        ['Mali', 'Spain', 60, 80],
        ['Germany', 'Mali', 80, 70],
      ],
      GAMES,
    ).map((g) => (g.num === 25 ? { ...g, label1: null } : g))
    const out = resolve(complete)
    expect(out.find((g) => g.num === 25).t1).toBeNull()
    // The well-formed slot on the same game still resolves.
    expect(out.find((g) => g.num === 26).t2).toBe('Germany')
  })
})

describe('search on a record with neither teams nor labels', () => {
  it('treats both sides as empty rather than throwing', async () => {
    const { matchesSearch, parseQuery } = await import('../src/utils/search.js')
    const { venueFor } = await import('../src/utils/venue.js')
    const broken = { num: 99, stage: 'Final', t1: null, t2: null }
    expect(matchesSearch(broken, venueFor(broken), parseQuery('team: Japan'))).toBe(false)
    expect(matchesSearch(broken, venueFor(broken), parseQuery('berlin'))).toBe(true)
  })
})

describe('tournamentStats edges', () => {
  it('extends a losing run rather than resetting it', async () => {
    const { teamRecord } = await import('../src/utils/tournamentStats.js')
    const board = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 60, 90], // Japan loses
        ['Germany', 'Japan', 90, 60], // and loses again
        ['Japan', 'Spain', 60, 90], // and again
      ],
      GAMES,
    )
    expect(teamRecord(board, 'Japan').streak).toBe(-3)
  })

  it('stops a run at the first result of the other kind', async () => {
    const { teamRecord } = await import('../src/utils/tournamentStats.js')
    const board = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 90, 60], // won first (earliest game)
        ['Germany', 'Japan', 90, 60], // then lost
        ['Japan', 'Spain', 60, 90], // and lost again (latest)
      ],
      GAMES,
    )
    expect(teamRecord(board, 'Japan').streak).toBe(-2)
  })

  it('drops a voided game from the still-involved set', async () => {
    const { activeTeams } = await import('../src/utils/tournamentStats.js')
    const voided = GAMES.map((g) => (g.stage === 'Group' ? { ...g, voided: true } : g))
    expect(activeTeams(voided).size).toBe(0)
  })

  it('sorts the overtime games by tip-off and counts them in the totals', async () => {
    const { overtimeGames, tournamentTotals } = await import('../src/utils/tournamentStats.js')
    const board = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 95, 92],
        ['Germany', 'Japan', 99, 96],
      ],
      GAMES,
    ).map((g) => ([1, 11].includes(g.num) ? { ...g, ot: 1 } : g))
    const ot = overtimeGames(board)
    expect(ot.map((g) => g.num)).toEqual([1, 11])
    expect(new Date(ot[0].ko) <= new Date(ot[1].ko)).toBe(true)
    expect(tournamentTotals(board).ot).toBe(2)
  })
})

describe('opponentClinch when the other group is unsettled', () => {
  it('locks nothing while the opposing placing is still open', () => {
    // Group A is fully decided; Group B has not been played at all, so the
    // opponent of A's runner-up cannot be named.
    const board = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 90, 60],
        ['Japan', 'Spain', 90, 60],
        ['Germany', 'Japan', 60, 90],
        ['Spain', 'Germany', 80, 70],
        ['Mali', 'Spain', 60, 80],
        ['Germany', 'Mali', 80, 70],
      ],
      GAMES,
    )
    const clinch = computeClinch(board)
    expect(clinch.Spain).toBe('second')
    expect(lockedOpponent(board, 'Spain', clinch)).toBeNull()
  })
})
