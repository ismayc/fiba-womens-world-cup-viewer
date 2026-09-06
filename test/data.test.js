// Data-integrity tests. The committed schedule is the app's source of record,
// so these assert the SHAPE of the tournament against facts that are true of the
// real edition and would break loudly if a regeneration went wrong.

import { describe, it, expect } from 'vitest'
import { GAMES, STAGE_LABELS, STAGE_ORDER } from '../src/data/games.js'
import { TEAMS, FLAG_BY_TEAM, ABBR_BY_TEAM, ALL_TEAMS, RANK_BY_TEAM } from '../src/data/teams.js'
import { VENUES } from '../src/data/venues.js'
import { OUTLET_NOTES, US_BROADCAST } from '../src/data/broadcast.js'
import { US_LINEAR_BY_PAIR, US_LINEAR_BY_STAGE, US_TV_NOTE_BY_STAGE } from '../scripts/official.mjs'

const GROUPS = ['A', 'B', 'C', 'D']
const group = GAMES.filter((g) => g.stage === 'Group')
const final = GAMES.filter((g) => g.stage !== 'Group')
const byNum = new Map(GAMES.map((g) => [g.num, g]))

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

  // The FIBA World Ranking published April 1 2026, checked against FIBA's own
  // ranking page and Wikipedia's SportsRankings module, which agree on all 16.
  // These are the exact values, because a silently shifted ranking would reorder
  // the opening table and the projected final phase without failing anything else.
  it('carries the April 1 2026 FIBA World Ranking for all 16 teams', () => {
    expect(RANK_BY_TEAM).toEqual({
      'United States': 1,
      France: 2,
      Australia: 3,
      China: 4,
      Belgium: 5,
      Spain: 6,
      Nigeria: 8,
      Japan: 10,
      Germany: 11,
      'Puerto Rico': 13,
      Italy: 14,
      'South Korea': 15,
      Türkiye: 16,
      Czechia: 17,
      Mali: 18,
      Hungary: 19,
    })
  })

  // Ranks are world ranks, not 1-16 seeds: 7, 9 and 12 belong to teams that did
  // not qualify. Asserting distinctness matters because the ranking is the final
  // tiebreak, and two teams sharing a rank would make the order non-deterministic.
  it('gives every team a distinct rank, sparse but ordered', () => {
    const ranks = ALL_TEAMS.map((n) => RANK_BY_TEAM[n])
    expect(new Set(ranks).size).toBe(16)
    expect(Math.min(...ranks)).toBe(1)
    expect(ranks).not.toContain(7)
  })

  // Teams are listed strongest-first, NOT alphabetically. This is the order the
  // standings table shows before a ball is thrown, so it is load-bearing.
  it('lists each group by world ranking, not alphabetically', () => {
    for (const g of GROUPS) {
      const ranks = TEAMS[g].map((t) => t.rank)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
      // The embedded rank must agree with the lookup, or the two orders diverge.
      for (const t of TEAMS[g]) expect(t.rank).toBe(RANK_BY_TEAM[t.name])
    }
    // Group A is the sharp case: alphabetical put Germany first and Spain last.
    expect(TEAMS.A.map((t) => t.name)).toEqual(['Spain', 'Japan', 'Germany', 'Mali'])
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
  // The labels are permanent; the teams are not. A final-phase record ships with
  // null teams and gains real ones the moment ESPN publishes that fixture, which
  // for the qualification round is September 8. So assert the invariant that
  // survives the transition: labels always, and teams either both still open or
  // both real. Asserting `t1` is null would have failed the refresh mid-week.
  it('carries slot labels, and teams only once the draw resolves them', () => {
    for (const g of final) {
      expect(g.label1).toBeTruthy()
      expect(g.label2).toBeTruthy()
      if (g.t1 === null) {
        expect(g.t2).toBeNull()
      } else {
        expect(ALL_TEAMS).toContain(g.t1)
        expect(ALL_TEAMS).toContain(g.t2)
        expect(g.t1).not.toBe(g.t2)
      }
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
  // Those six drop their TBC flag one round at a time as the times are
  // confirmed, so the standing rule is that no OTHER game may ever carry it, and
  // that a game which has dropped it came away with a real tip-off.
  const TBC_ROUNDS = [25, 26, 27, 28, 33, 34]

  it('marks only the qualification round and semi-finals as time-TBC', () => {
    const tbc = final.filter((g) => g.tbdTip).map((g) => g.num)
    for (const n of tbc) expect(TBC_ROUNDS).toContain(n)
  })

  it('gives a confirmed qualification or semi-final tip a real time', () => {
    for (const n of TBC_ROUNDS) {
      const g = byNum.get(n)
      if (!g.tbdTip) expect(g.ko).toMatch(/^2026-09-\d\dT\d\d:\d\d:\d\d\+02:00$/)
    }
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

// US coverage. The app tells a viewer where a game is on, which is only worth
// doing if it is right: an outlet named on a card that did not carry the game is
// worse than no card at all. These assert the committed data against Warner
// Bros. Discovery's published table, frozen in scripts/official.mjs.
describe('US coverage', () => {
  const LINEAR = ['TNT', 'TBS', 'truTV']
  const linearOf = (g) => g.tv.filter((n) => LINEAR.includes(n))

  it('puts both streamers on all 36 games', () => {
    for (const g of GAMES) {
      expect(g.tv, `game ${g.num}`).toContain('DAZN')
      expect(g.tv, `game ${g.num}`).toContain('HBO Max')
    }
  })

  it('leads with DAZN among the streamers, since it needs no upgrade', () => {
    for (const g of GAMES) {
      expect(g.tv.indexOf('DAZN'), `game ${g.num}`).toBeLessThan(g.tv.indexOf('HBO Max'))
      // Linear first, streaming after: that is how a listing reads.
      for (const n of linearOf(g)) expect(g.tv.indexOf(n)).toBeLessThan(g.tv.indexOf('DAZN'))
    }
  })

  // The exact nine. This is the assertion that would have caught the wrong
  // channel on Hungary v France, and it is written out game by game rather than
  // as a count so a future regeneration cannot quietly move a window.
  it('names the nine games with a confirmed linear window', () => {
    const linear = Object.fromEntries(
      GAMES.filter((g) => linearOf(g).length).map((g) => [g.num, linearOf(g)]),
    )
    expect(linear).toEqual({
      3: ['TNT', 'truTV'], // United States v China
      6: ['truTV'], // Spain v Germany
      15: ['truTV'], // Puerto Rico v Belgium
      16: ['TNT'], // Italy v United States
      20: ['truTV'], // Nigeria v France
      22: ['truTV'], // Japan v Spain
      24: ['TNT', 'truTV'], // United States v Czechia
      35: ['truTV'], // third-place game
      36: ['TNT', 'truTV'], // Final
    })
  })

  // WBD announced truTV for this one and ESPN still reports truTV. It did not
  // air there. A game that has been played is described by what happened.
  it('keeps truTV off Hungary v France', () => {
    const g = byNum.get(8)
    expect(g.t1).toBe('Hungary')
    expect(g.t2).toBe('France')
    expect(g.tv).toEqual(['DAZN', 'HBO Max'])
    // And the deviation stays documented next to the source it deviates from.
    const row = US_LINEAR_BY_PAIR.find((e) => e.pair.includes('Hungary') && e.pair.includes('France'))
    expect(row.tv).toEqual([])
    expect(row.announced).toEqual(['truTV'])
    expect(row.why).toBeTruthy()
  })

  // A round whose linear window WBD named without saying which game gets it.
  // Claiming truTV on all four quarter-finals would spend four of the seventeen
  // televised windows the release promises.
  it('states an unsplit round as a note, never as a channel', () => {
    for (const g of GAMES) {
      if (US_TV_NOTE_BY_STAGE[g.stage]) {
        expect(g.tvNote, `game ${g.num}`).toBe(US_TV_NOTE_BY_STAGE[g.stage])
        expect(linearOf(g), `game ${g.num}`).toEqual([])
      } else {
        expect(g.tvNote, `game ${g.num}`).toBeUndefined()
      }
    }
    expect(Object.keys(US_TV_NOTE_BY_STAGE).sort()).toEqual(['QF', 'QR', 'SF'])
  })

  it('gives the third-place game and the Final the channels WBD named', () => {
    expect(byNum.get(35).tv).toEqual([...US_LINEAR_BY_STAGE['3rd'], 'DAZN', 'HBO Max'])
    expect(byNum.get(36).tv).toEqual([...US_LINEAR_BY_STAGE.Final, 'DAZN', 'HBO Max'])
  })

  it('names every outlet the games use in the edition-wide summary', () => {
    const used = new Set(GAMES.flatMap((g) => g.tv))
    const stated = new Set([...US_BROADCAST.english.tv, ...US_BROADCAST.english.streaming])
    for (const outlet of used) expect(stated, outlet).toContain(outlet)
    // TBS is named for the semi-finals, which have no per-game split yet, so it
    // is stated for the edition without appearing on any single game.
    expect(US_BROADCAST.english.tv).toContain('TBS')
  })

  // Naming an outlet without its condition is the same mistake as not naming it.
  it('attaches the tier condition to HBO Max', () => {
    expect(OUTLET_NOTES['HBO Max']).toMatch(/Standard or Premium/)
    expect(OUTLET_NOTES['HBO Max']).toMatch(/Basic With Ads/)
    expect(OUTLET_NOTES.DAZN).toMatch(/Courtside 1891/)
    for (const outlet of Object.keys(OUTLET_NOTES)) {
      expect(US_BROADCAST.english.streaming).toContain(outlet)
    }
    // And the other direction, which the "How to watch" panel relies on: it
    // prints one note per streamer with no empty case.
    for (const outlet of US_BROADCAST.english.streaming) {
      expect(OUTLET_NOTES[outlet], outlet).toBeTruthy()
    }
  })
})
