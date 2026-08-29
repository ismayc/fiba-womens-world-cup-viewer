// Data-integrity tests. The committed schedule is the app's source of record,
// so these assert the SHAPE of the tournament against facts that are true of the
// real edition and would break loudly if a regeneration went wrong.

import { describe, it, expect } from 'vitest'
import { GAMES, STAGE_LABELS, STAGE_ORDER } from '../src/data/games.js'
import { TEAMS, FLAG_BY_TEAM, ABBR_BY_TEAM, ALL_TEAMS } from '../src/data/teams.js'
import { VENUES } from '../src/data/venues.js'

const GROUPS = ['A', 'B', 'C', 'D']
const group = GAMES.filter((g) => g.stage === 'Group')
const final = GAMES.filter((g) => g.stage !== 'Group')

describe('tournament shape', () => {
  it('has 36 games: 24 group + 12 final phase', () => {
    expect(GAMES).toHaveLength(36)
    expect(group).toHaveLength(24)
    expect(final).toHaveLength(12)
  })

  it('numbers games 1-36 with no gaps or duplicates', () => {
    expect(GAMES.map((g) => g.num).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1),
    )
  })

  it('gives every group four teams and six games', () => {
    for (const g of GROUPS) {
      const games = group.filter((x) => x.group === g)
      expect(games).toHaveLength(6)
      expect(TEAMS[g]).toHaveLength(4)
      // Six games is exactly every pair of four teams meeting once.
      const pairs = new Set(games.map((x) => [x.t1, x.t2].sort().join('|')))
      expect(pairs.size).toBe(6)
      const names = new Set(games.flatMap((x) => [x.t1, x.t2]))
      expect([...names].sort()).toEqual(TEAMS[g].map((t) => t.name).sort())
    }
  })

  it('fields 16 teams, each in exactly one group', () => {
    expect(ALL_TEAMS).toHaveLength(16)
    const seen = new Set()
    for (const g of GROUPS) {
      for (const t of TEAMS[g]) {
        expect(seen.has(t.name)).toBe(false)
        seen.add(t.name)
      }
    }
    expect(seen.size).toBe(16)
  })

  it('orders the stages as FIBA plays them', () => {
    expect(STAGE_ORDER).toEqual(['Group', 'QR', 'QF', 'SF', '3rd', 'Final'])
    for (const s of STAGE_ORDER) expect(STAGE_LABELS[s]).toBeTruthy()
    // Every stage a game claims is one the labels know about.
    for (const g of GAMES) expect(STAGE_ORDER).toContain(g.stage)
  })

  it('plays the final phase in the counts FIBA published', () => {
    const count = (s) => final.filter((g) => g.stage === s).length
    expect(count('QR')).toBe(4) // 2nd + 3rd of four groups = 8 teams
    expect(count('QF')).toBe(4)
    expect(count('SF')).toBe(2)
    expect(count('3rd')).toBe(1)
    expect(count('Final')).toBe(1)
  })
})

describe('teams', () => {
  it('gives every team a flag and an abbreviation', () => {
    for (const name of ALL_TEAMS) {
      expect(FLAG_BY_TEAM[name]).toBeTruthy()
      expect(ABBR_BY_TEAM[name]).toMatch(/^[A-Z]{3}$/)
    }
  })

  // The regression this repo exists to avoid re-introducing: ESPN serves Mali
  // with the abbreviation "KOR", which collides with South Korea. If the
  // abbreviations are ever repopulated from the feed, both render as "KOR" and
  // one team's result reads as the other's.
  it('gives Mali and South Korea DIFFERENT abbreviations', () => {
    expect(ABBR_BY_TEAM.Mali).toBe('MLI')
    expect(ABBR_BY_TEAM['South Korea']).toBe('KOR')
    expect(ABBR_BY_TEAM.Mali).not.toBe(ABBR_BY_TEAM['South Korea'])
  })

  it('has no duplicate abbreviations at all', () => {
    const codes = ALL_TEAMS.map((n) => ABBR_BY_TEAM[n])
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('venues and times', () => {
  it('plays every game in Berlin, in one timezone', () => {
    for (const v of Object.values(VENUES)) {
      expect(v.city).toBe('Berlin')
      expect(v.country).toBe('Germany')
      expect(v.tz).toBe('Europe/Berlin')
    }
    expect(Object.keys(VENUES)).toHaveLength(2)
  })

  // FIBA does not use sponsor names; ESPN does. Showing ESPN's would make the
  // app disagree with the official schedule about where a game was played.
  it('keeps FIBA’s arena name, not ESPN’s sponsor name', () => {
    expect(VENUES.berlinarena.name).toBe('Berlin Arena')
    expect(VENUES.berlinarena.sponsorName).toBe('Uber Arena')
  })

  it('stores every group tip-off at the Berlin offset, inside the window', () => {
    for (const g of group) {
      expect(g.ko).toMatch(/\+02:00$/)
      const t = new Date(g.ko)
      expect(t >= new Date('2026-09-04T00:00:00+02:00')).toBe(true)
      expect(t <= new Date('2026-09-08T00:00:00+02:00')).toBe(true)
    }
  })

  it('assigns every group game a real arena', () => {
    for (const g of group) expect(VENUES[g.venue]).toBeTruthy()
  })

  // FIBA plays a group's last two games simultaneously so neither team can know
  // what it needs. That forces the two arenas to be used at once, and it is a
  // real property of the schedule worth pinning.
  it('tips a group’s final two games at the same moment, in different arenas', () => {
    for (const g of GROUPS) {
      const games = group
        .filter((x) => x.group === g)
        .sort((a, b) => new Date(a.ko) - new Date(b.ko))
      const last = games.slice(-2)
      expect(last[0].ko).toBe(last[1].ko)
      expect(last[0].venue).not.toBe(last[1].venue)
    }
  })
})

describe('final-phase records', () => {
  it('carries slot labels and no teams until the draw resolves them', () => {
    for (const g of final) {
      expect(g.label1).toBeTruthy()
      expect(g.label2).toBeTruthy()
      expect(g.t1).toBeNull()
      expect(g.t2).toBeNull()
    }
  })

  // Every label must be one the slot grammar can parse, or the bracket silently
  // fails to resolve that side for the whole tournament.
  it('uses only labels the slot grammar understands', () => {
    const ok = /^(Winner Group [A-D]|2nd Group [A-D]|3rd Group [A-D]|Winner Game \d+|Loser Game \d+)$/
    for (const g of final) {
      expect(g.label1).toMatch(ok)
      expect(g.label2).toMatch(ok)
    }
  })

  it('gives a game with no confirmed tip a date to be listed under', () => {
    for (const g of GAMES) {
      if (g.tbdTip) {
        expect(g.ko).toBeNull()
        expect(g.date).toMatch(/^2026-09-\d\d$/)
      } else {
        expect(g.ko).toBeTruthy()
      }
    }
  })

  // FIBA announces the qualification-round and semi-final tips at the end of the
  // previous round; the quarter-finals, third-place game and Final are fixed.
  it('marks exactly the qualification round and semi-finals as time-TBC', () => {
    expect(final.filter((g) => g.tbdTip).map((g) => g.num).sort((a, b) => a - b)).toEqual([
      25, 26, 27, 28, 33, 34,
    ])
  })
})

describe('scores', () => {
  it('never records a level score, because basketball has no draw', () => {
    for (const g of GAMES) {
      if (Array.isArray(g.score)) expect(g.score[0]).not.toBe(g.score[1])
    }
  })

  it('only marks overtime on a game that has a score', () => {
    for (const g of GAMES) {
      if (g.ot) expect(Array.isArray(g.score)).toBe(true)
    }
  })
})
