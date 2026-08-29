// Bracket resolution: filling slot labels with real teams as results land.
//
// The headline test is the full-tournament simulation at the bottom: play all 36
// games and assert the bracket resolves end to end with NO slot left as a
// placeholder. That is the check the playbook calls for: if the wiring can
// reconstruct a complete tournament with zero unresolved slots, the parsing and
// the topology are right.

import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { decideGame, resolveBracket, resolveKnockoutSlots } from '../src/utils/bracketResolve.js'
import { FLAG_BY_TEAM } from '../src/data/teams.js'
import { allGroupsPlayed } from './helpers/tournament.js'

const num = (games, n) => games.find((g) => g.num === n)

describe('decideGame', () => {
  it('names the winner and loser of a finished game', () => {
    expect(decideGame({ t1: 'Japan', t2: 'Mali', score: [80, 70] })).toEqual({
      winner: 'Japan',
      loser: 'Mali',
    })
    expect(decideGame({ t1: 'Japan', t2: 'Mali', score: [70, 80] })).toEqual({
      winner: 'Mali',
      loser: 'Japan',
    })
  })

  it('decides an overtime game from the final score, with no shootout branch', () => {
    const g = { t1: 'Japan', t2: 'Mali', score: [95, 92], ot: 1 }
    expect(decideGame(g).winner).toBe('Japan')
  })

  it('decides nothing for an unplayed, live or voided game', () => {
    expect(decideGame({ t1: 'Japan', t2: 'Mali' })).toBeNull()
    expect(decideGame({ t1: 'Japan', t2: 'Mali', score: [80, 70], live: {} })).toBeNull()
    expect(decideGame({ t1: 'Japan', t2: 'Mali', score: [80, 70], voided: true })).toBeNull()
  })

  // Basketball has no draw, so a level score on a completed record is bad data.
  // Inventing a winner from it would put a wrong team into the next round.
  it('refuses to invent a winner from a level score', () => {
    expect(decideGame({ t1: 'Japan', t2: 'Mali', score: [80, 80] })).toBeNull()
  })
})

describe('propagation', () => {
  const withQr = GAMES.map((g) => {
    if (g.num === 25) return { ...g, t1: 'Spain', t2: 'Nigeria', score: [80, 70] }
    return g
  })

  it('carries a qualification winner into the quarter-final it feeds', () => {
    const out = resolveKnockoutSlots(withQr)
    // Game 31 is "Winner Group C" v "Winner Game 25".
    expect(num(out, 31).t2).toBe('Spain')
  })

  it('leaves the rest of the bracket alone', () => {
    const out = resolveKnockoutSlots(withQr)
    expect(num(out, 32).t1).toBeNull()
    expect(num(out, 36).t1).toBeNull()
  })

  it('waits for both sides before deciding, so a loser slot is never guessed', () => {
    // Game 33's winner feeds the Final and its loser the third-place game, but
    // 33 has only one side, so neither can resolve.
    const partial = GAMES.map((g) => (g.num === 33 ? { ...g, t1: 'Spain' } : g))
    const out = resolveKnockoutSlots(partial)
    expect(num(out, 36).t1).toBeNull()
    expect(num(out, 35).t1).toBeNull()
  })

  it('fills the third-place game from the beaten semi-finalists', () => {
    const board = GAMES.map((g) => {
      if (g.num === 33) return { ...g, t1: 'Spain', t2: 'Australia', score: [90, 80] }
      if (g.num === 34) return { ...g, t1: 'Japan', t2: 'Italy', score: [70, 75] }
      return g
    })
    const out = resolveKnockoutSlots(board)
    expect(num(out, 35).t1).toBe('Australia') // loser of 33
    expect(num(out, 35).t2).toBe('Japan') // loser of 34
    expect(num(out, 36).t1).toBe('Spain')
    expect(num(out, 36).t2).toBe('Italy')
  })

  it('never rewrites a group game', () => {
    const out = resolveKnockoutSlots(GAMES)
    for (const g of out.filter((x) => x.stage === 'Group')) {
      expect(g).toBe(GAMES.find((x) => x.num === g.num))
    }
  })
})

describe('the full pipeline', () => {
  it('resolves group placings and propagates them in one call', () => {
    const played = allGroupsPlayed()
    const out = resolveBracket(played, computeClinch(played))
    // Every qualification-round slot should now hold a real team.
    for (const g of out.filter((x) => x.stage === 'QR')) {
      expect(FLAG_BY_TEAM[g.t1]).toBeTruthy()
      expect(FLAG_BY_TEAM[g.t2]).toBeTruthy()
    }
    // Each quarter-final has its group winner but not yet its qualifier.
    for (const g of out.filter((x) => x.stage === 'QF')) {
      expect(FLAG_BY_TEAM[g.t1]).toBeTruthy()
      expect(g.t2).toBeNull()
    }
  })

  // The end-to-end check. Play every group game, then every final-phase game,
  // and require a champion with nothing left unresolved.
  it('reconstructs a whole tournament with ZERO unresolved slots', () => {
    // Deterministic group phase: the first-named side always wins.
    let board = allGroupsPlayed((g) => g.t1)
    board = resolveBracket(board, computeClinch(board))

    // Then settle the final phase round by round, first side always winning.
    for (const round of [
      [25, 26, 27, 28],
      [29, 30, 31, 32],
      [33, 34],
      [35, 36],
    ]) {
      board = board.map((g) => (round.includes(g.num) ? { ...g, score: [90, 70] } : g))
      board = resolveBracket(board, computeClinch(board))
    }

    for (const g of board) {
      expect(FLAG_BY_TEAM[g.t1], `game ${g.num} side 1 unresolved`).toBeTruthy()
      expect(FLAG_BY_TEAM[g.t2], `game ${g.num} side 2 unresolved`).toBeTruthy()
    }

    const final = num(board, 36)
    const champion = final.score[0] > final.score[1] ? final.t1 : final.t2
    expect(FLAG_BY_TEAM[champion]).toBeTruthy()

    // The champion must have played a coherent route: a quarter-final, a
    // semi-final and the Final, and never the third-place game.
    const played = board.filter(
      (g) => g.stage !== 'Group' && (g.t1 === champion || g.t2 === champion),
    )
    const stages = played.map((g) => g.stage)
    expect(stages).toContain('QF')
    expect(stages).toContain('SF')
    expect(stages).toContain('Final')
    expect(stages).not.toContain('3rd')

    // The two beaten semi-finalists, and only they, contest third place.
    const third = num(board, 35)
    const semis = [num(board, 33), num(board, 34)]
    const semiLosers = semis.map((g) => (g.score[0] > g.score[1] ? g.t2 : g.t1))
    expect([third.t1, third.t2].sort()).toEqual([...semiLosers].sort())

    // Nobody appears twice in the same round.
    for (const round of [['QR'], ['QF'], ['SF']]) {
      const teams = board.filter((g) => round.includes(g.stage)).flatMap((g) => [g.t1, g.t2])
      expect(new Set(teams).size).toBe(teams.length)
    }
  })

  it('sends exactly twelve teams into the final phase, four of them on a bye', () => {
    let board = allGroupsPlayed((g) => g.t1)
    board = resolveBracket(board, computeClinch(board))

    const qrTeams = new Set(board.filter((g) => g.stage === 'QR').flatMap((g) => [g.t1, g.t2]))
    const byeTeams = new Set(
      board.filter((g) => g.stage === 'QF').map((g) => g.t1).filter(Boolean),
    )
    expect(qrTeams.size).toBe(8)
    expect(byeTeams.size).toBe(4)
    // A group winner does not also play the qualification round.
    for (const t of byeTeams) expect(qrTeams.has(t)).toBe(false)
    expect(qrTeams.size + byeTeams.size).toBe(12)
  })
})
