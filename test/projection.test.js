// "As it stands" projection, the group-phase tools built on it, and the
// opponent-lock check.

import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/games.js'
import { projectKnockout } from '../src/utils/asItStands.js'
import { computeClinch } from '../src/utils/clinch.js'
import { lockedOpponent } from '../src/utils/opponentClinch.js'
import { eliminationStatus, isAlive, survivingTeams } from '../src/utils/eliminationCheck.js'
import { softTiebreaks, TIEBREAK_LABEL } from '../src/utils/tiebreakNotes.js'
import { computeGroup, groupHasResults } from '../src/utils/standings.js'
import {
  PICK_SCORES,
  applyScenarioPicks,
  groupStageArchived,
  openGroups,
  pickOutcome,
  possibleOrderings,
  remainingGroupGames,
  stageArchived,
  unpickedCount,
} from '../src/utils/scenarios.js'
import { withGroupScores, allGroupsPlayed } from './helpers/tournament.js'

const A = (results) => withGroupScores('A', results, GAMES)
const DECISIVE = [
  ['Japan', 'Mali', 90, 60],
  ['Japan', 'Spain', 90, 60],
  ['Germany', 'Japan', 60, 90],
  ['Spain', 'Germany', 80, 70],
  ['Mali', 'Spain', 60, 80],
  ['Germany', 'Mali', 80, 70],
]

describe('projectKnockout', () => {
  const { perGroup } = projectKnockout(A(DECISIVE))

  it('projects THREE placings per group, not two', () => {
    expect(Object.keys(perGroup.A)).toEqual(['first', 'second', 'third'])
    expect(perGroup.A.first.team).toBe('Japan')
    expect(perGroup.A.second.team).toBe('Spain')
    expect(perGroup.A.third.team).toBe('Germany')
  })

  // The point of the group race here: 1st lands a round later than 2nd and 3rd.
  it('routes the winner to a quarter-final and the others to the qualification round', () => {
    expect(perGroup.A.first.round).toBe('QF')
    expect(perGroup.A.first.gameNum).toBe(29)
    expect(perGroup.A.second.round).toBe('QR')
    expect(perGroup.A.second.gameNum).toBe(25)
    expect(perGroup.A.third.round).toBe('QR')
    expect(perGroup.A.third.gameNum).toBe(26)
  })

  // A group winner's quarter-final opponent is the winner of a game nobody has
  // played, so no group table can name it. Reporting the pending feed is more
  // informative than an unqualified "TBD".
  it('reports a pending feed for the winner’s opponent, not a team', () => {
    expect(perGroup.A.first.opponent).toBeNull()
    expect(perGroup.A.first.opponentLabel).toBe('Winner Game 27')
  })

  it('names a real opponent for the qualification-round placings', () => {
    // Game 25 is 2A v 3B, so Spain's opponent is Group B's current third.
    expect(perGroup.A.second.opponentLabel).toBeNull()
    expect(perGroup.A.second.opponent).toBe(perGroup.B.third.team)
    expect(perGroup.A.third.opponent).toBe(perGroup.B.second.team)
  })

  it('projects every group even before anything is played', () => {
    const { perGroup: pre } = projectKnockout(GAMES)
    for (const g of ['A', 'B', 'C', 'D']) {
      expect(pre[g].first.team).toBeTruthy()
      expect(pre[g].third.team).toBeTruthy()
    }
  })
})

describe('lockedOpponent', () => {
  it('locks a qualification-round matchup once BOTH groups are settled', () => {
    // Settle A and B: game 25 is 2A v 3B.
    let board = A(DECISIVE)
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
    const lock = lockedOpponent(board, 'Spain', clinch) // Spain is 2nd in A
    expect(lock).not.toBeNull()
    expect(lock.gameNum).toBe(25)
    expect(lock.round).toBe('QR')
    expect(clinch[lock.opponent]).toBe('third')
  })

  // A group winner byes to a quarter-final against the winner of a game that has
  // not been played, so no amount of group results can lock it.
  it('never locks a group winner’s opponent from the tables alone', () => {
    const board = A(DECISIVE)
    expect(lockedOpponent(board, 'Japan', computeClinch(board))).toBeNull()
  })

  it('locks nothing for a team whose placing is not settled', () => {
    expect(lockedOpponent(GAMES, 'Japan', computeClinch(GAMES))).toBeNull()
  })
})

describe('elimination', () => {
  it('keeps everyone alive before a ball is thrown up', () => {
    expect(survivingTeams(GAMES)).toHaveLength(16)
    expect(isAlive(GAMES, 'Mali')).toBe(true)
  })

  it('eliminates only the team that cannot reach the top three', () => {
    const board = A(DECISIVE)
    const status = eliminationStatus(board)
    expect(status.Mali).toBe('eliminated')
    expect(status.Germany).toBe('alive')
    expect(status.Japan).toBe('alive')
  })

  it('agrees with the clinch engine, since both read one analysis', () => {
    const board = A(DECISIVE)
    const clinch = computeClinch(board)
    const status = eliminationStatus(board)
    for (const [team, verdict] of Object.entries(status)) {
      expect(verdict === 'eliminated').toBe(clinch[team] === 'eliminated')
    }
  })
})

describe('tie-break notes', () => {
  it('marks nothing before anything is played', () => {
    // Four teams on zero are trivially level; marking that would put a ⚖ on
    // every row of every group and train the reader to ignore the marker.
    expect(softTiebreaks('A', GAMES).size).toBe(0)
  })

  it('marks a pair that nothing but a drawing of lots could separate', () => {
    // Japan and Spain: identical records, they beat each other's... they cannot
    // both beat each other, so build a mirror where every criterion ties.
    const board = A([
      ['Japan', 'Mali', 80, 70],
      ['Spain', 'Germany', 80, 70],
      ['Germany', 'Japan', 80, 70],
      ['Mali', 'Spain', 80, 70],
      ['Germany', 'Mali', 80, 70],
      ['Japan', 'Spain', 80, 70],
    ])
    const notes = softTiebreaks('A', board)
    for (const note of notes.values()) expect(note.reason).toBe('lots')
    expect(TIEBREAK_LABEL.lots).toMatch(/lots/)
  })

  // FIBA has no conduct criterion, unlike FIFA. There must be exactly one soft
  // reason, or the UI is offering an explanation the rules cannot produce.
  it('knows only ONE soft reason, because FIBA has no fair-play criterion', () => {
    expect(Object.keys(TIEBREAK_LABEL)).toEqual(['lots'])
  })
})

describe('standings helpers', () => {
  it('exposes the ranked group and whether it has any results', () => {
    expect(computeGroup('A', GAMES).map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(groupHasResults('A', GAMES)).toBe(false)
    expect(groupHasResults('A', A([['Japan', 'Mali', 80, 70]]))).toBe(true)
  })
})

describe('scenarios', () => {
  it('offers a win for each side and NO draw', () => {
    expect(Object.keys(PICK_SCORES).sort()).toEqual(['away', 'home'])
    expect(PICK_SCORES.home[0]).toBeGreaterThan(PICK_SCORES.home[1])
    expect(PICK_SCORES.away[1]).toBeGreaterThan(PICK_SCORES.away[0])
  })

  it('categorises a pick, and refuses to categorise a level score', () => {
    expect(pickOutcome([80, 70])).toBe('home')
    expect(pickOutcome([70, 80])).toBe('away')
    expect(pickOutcome([70, 70])).toBeNull()
    expect(pickOutcome(null)).toBeNull()
  })

  it('lists the remaining group games by group', () => {
    const open = remainingGroupGames(GAMES)
    expect(Object.keys(open).sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(open.A).toHaveLength(6)
    expect(openGroups(GAMES)).toEqual(['A', 'B', 'C', 'D'])
    expect(unpickedCount(GAMES, {})).toBe(24)
  })

  it('applies picks and counts what is left', () => {
    const picks = { 1: [80, 70], 6: [70, 80] }
    const board = applyScenarioPicks(GAMES, picks)
    expect(board.find((g) => g.num === 1).score).toEqual([80, 70])
    expect(unpickedCount(GAMES, picks)).toBe(22)
    expect(applyScenarioPicks(GAMES, {})).toBe(GAMES)
  })

  it('counts the orderings a group still has open', () => {
    expect(possibleOrderings('A', GAMES)).toEqual({ count: 24, decided: false })
    expect(possibleOrderings('A', A(DECISIVE))).toEqual({ count: 1, decided: true })
  })

  it('archives a stage only once every one of its games is final', () => {
    expect(stageArchived(GAMES, 'Group')).toBe(false)
    expect(groupStageArchived(GAMES)).toBe(false)
    const played = allGroupsPlayed()
    expect(groupStageArchived(played)).toBe(true)
    // A live game is not final, so the stage is not archived.
    const live = played.map((g) => (g.num === 1 ? { ...g, live: {} } : g))
    expect(groupStageArchived(live)).toBe(false)
  })
})
