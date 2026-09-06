// "My services": which of this tournament's games a viewer can actually watch.
//
// The US split is lopsided the other way round from a normal league: both
// streamers carry all 36 games and only 9 reach linear TV, so the question a
// cable-only viewer asks is real. The distinction between "not on your services"
// and "coverage not announced yet" stays load-bearing even though WBD has now
// published every round: an empty `tv` must never be read as unwatchable.

import { describe, it, expect } from 'vitest'
import { GAMES } from './fixtures/pretournament-games.js'
import {
  SERVICE_BY_KEY,
  SERVICE_CATALOG,
  SERVICE_KEYS,
  broadcastNotBadged,
  coverageSummary,
  hasKnownBroadcast,
  isWatchable,
  watchableServices,
} from '../src/utils/watch.js'

const HBO = ['HBO Max']
const DAZN = ['DAZN']
const CABLE = ['TNT', 'truTV']
// A game with no published platform at all. No committed game is in this state
// now that coverage comes from WBD's table rather than from ESPN's per-fixture
// field, but the code path that keeps such a game visible must not rot.
const UNANNOUNCED = { num: 99, stage: 'QF', tv: [] }
const num = (n) => GAMES.find((g) => g.num === n)

describe('the catalog', () => {
  it('offers both streaming services and the live-TV bundles', () => {
    expect(SERVICE_CATALOG.map((s) => s.key)).toEqual([
      'dazn', 'hbomax', 'youtubetv', 'hulu', 'fubo', 'sling', 'directv', 'cable',
    ])
    expect(SERVICE_BY_KEY.dazn.kind).toBe('stream')
    expect(SERVICE_BY_KEY.hbomax.kind).toBe('stream')
    expect(SERVICE_BY_KEY.cable.kind).toBe('bundle')
    expect(SERVICE_KEYS).toHaveLength(SERVICE_CATALOG.length)
  })

  it('gives every entry a label and a matcher', () => {
    for (const s of SERVICE_CATALOG) {
      expect(s.label).toBeTruthy()
      expect(typeof s.match).toBe('function')
      expect(['stream', 'bundle']).toContain(s.kind)
    }
  })

  // Each streamer is a separate subscription, not part of any live-TV package.
  // A bundle subscriber must NOT be told they can watch a streaming-only game.
  it('keeps both streamers out of every live-TV bundle', () => {
    for (const s of SERVICE_CATALOG.filter((x) => x.kind === 'bundle')) {
      expect(s.match(HBO), s.key).toBe(false)
      expect(s.match(DAZN), s.key).toBe(false)
      expect(s.match(CABLE), s.key).toBe(true)
    }
    expect(SERVICE_BY_KEY.hbomax.match(HBO)).toBe(true)
    expect(SERVICE_BY_KEY.hbomax.match(CABLE)).toBe(false)
    expect(SERVICE_BY_KEY.dazn.match(DAZN)).toBe(true)
    expect(SERVICE_BY_KEY.dazn.match(HBO)).toBe(false)
  })

  // TBS joined the list with the semi-finals; a bundle that carries TNT carries
  // it, and forgetting it would hide both semis from every cable viewer.
  it('matches a game carried on any of the three linear networks', () => {
    expect(SERVICE_BY_KEY.cable.match(['TNT'])).toBe(true)
    expect(SERVICE_BY_KEY.cable.match(['TBS'])).toBe(true)
    expect(SERVICE_BY_KEY.cable.match(['truTV'])).toBe(true)
    expect(SERVICE_BY_KEY.cable.match(['Some Other Channel'])).toBe(false)
  })
})

describe('hasKnownBroadcast', () => {
  // Every game of the tournament now has one, group phase and knockout alike:
  // WBD published the platforms for all 36 in August, so the final phase no
  // longer waits on ESPN to place a fixture before it can say where it is on.
  it('is true for every committed game, false only with no platform at all', () => {
    for (const g of GAMES) expect(hasKnownBroadcast(g), `game ${g.num}`).toBe(true)
    expect(hasKnownBroadcast(UNANNOUNCED)).toBe(false)
    expect(hasKnownBroadcast({})).toBe(false)
    expect(hasKnownBroadcast(undefined)).toBe(false)
  })
})

describe('watchableServices', () => {
  it('lists the selected services that carry the game, in catalog order', () => {
    expect(watchableServices(CABLE, ['cable', 'youtubetv']).map((s) => s.key)).toEqual([
      'youtubetv',
      'cable',
    ])
  })

  it('lists nothing when the viewer has picked none', () => {
    expect(watchableServices(HBO, [])).toEqual([])
    expect(watchableServices(HBO, undefined)).toEqual([])
  })

  it('lists nothing when the broadcast is unknown', () => {
    expect(watchableServices([], ['cable'])).toEqual([])
    expect(watchableServices(undefined, ['cable'])).toEqual([])
  })

  it('lists nothing when no selected service carries it', () => {
    expect(watchableServices(HBO, ['cable', 'sling'])).toEqual([])
  })
})

describe('isWatchable', () => {
  it('keeps every game when nothing is selected', () => {
    expect(isWatchable(num(1), [])).toBe(true)
    expect(isWatchable(num(1), undefined)).toBe(true)
  })

  it('keeps a game a selected service carries, drops one it does not', () => {
    expect(isWatchable({ tv: CABLE }, ['cable'])).toBe(true)
    expect(isWatchable({ tv: HBO }, ['cable'])).toBe(false)
    expect(isWatchable({ tv: HBO }, ['hbomax'])).toBe(true)
  })

  // The distinction this module exists for. Dropping a game from a filtered
  // schedule because nobody has said where it is would read as a bug, not as a
  // filter.
  it('KEEPS a game whose coverage is not announced', () => {
    expect(isWatchable(UNANNOUNCED, ['cable'])).toBe(true)
    // And a real knockout game is now kept on its merits, not on that fallback:
    // the Final is on TNT and truTV, so a cable viewer genuinely has it.
    expect(hasKnownBroadcast(num(36))).toBe(true)
    expect(isWatchable(num(36), ['cable'])).toBe(true)
    // A quarter-final is streaming-only until WBD splits the round, so cable
    // alone does NOT carry it and the filter says so.
    expect(isWatchable(num(29), ['cable'])).toBe(false)
    expect(isWatchable(num(29), ['dazn'])).toBe(true)
  })
})

describe('broadcastNotBadged', () => {
  it('drops a network already named by a personalized badge', () => {
    const watched = watchableServices(HBO, ['hbomax'])
    expect(broadcastNotBadged(HBO, watched)).toEqual([])
  })

  it('keeps the network behind a bundle badge, since the names differ', () => {
    const watched = watchableServices(CABLE, ['cable'])
    expect(broadcastNotBadged(CABLE, watched)).toEqual(CABLE)
  })

  it('keeps everything when nothing is badged', () => {
    expect(broadcastNotBadged(CABLE, [])).toEqual(CABLE)
    expect(broadcastNotBadged(CABLE, undefined)).toEqual(CABLE)
  })

  it('returns nothing for an unknown broadcast', () => {
    expect(broadcastNotBadged([], [])).toEqual([])
    expect(broadcastNotBadged(undefined, [])).toEqual([])
  })
})

describe('coverageSummary', () => {
  // The numbers the picker shows. They are what tells a cable-only viewer that
  // two thirds of the group phase is out of reach.
  it('counts the real split across the committed schedule', () => {
    const cable = coverageSummary(GAMES, ['cable'])
    expect(cable.total).toBe(36)
    expect(cable.unknown).toBe(0) // every round's platforms are published
    expect(cable.known).toBe(36)
    // 7 of the 24 group games, plus the third-place game and the Final. The
    // qualification round, quarter-finals and semi-finals have a linear window
    // announced for the ROUND but not split per game, so they are not claimed.
    expect(cable.watchable).toBe(9)

    // Either streamer carries the whole tournament; that is the point of
    // listing both, and of listing DAZN first.
    expect(coverageSummary(GAMES, ['hbomax']).watchable).toBe(36)
    expect(coverageSummary(GAMES, ['dazn']).watchable).toBe(36)
    expect(coverageSummary(GAMES, ['dazn', 'cable']).watchable).toBe(36)
  })

  it('counts nothing watchable when nothing is selected', () => {
    expect(coverageSummary(GAMES, []).watchable).toBe(0)
  })

  // `unknown` is 0 across the committed board, so the arm that counts a game
  // with no published platform is exercised here rather than left to rot: it is
  // the difference between "you can watch 9 of 36" and "9 of 35, 1 to come".
  it('counts a game with no platform apart from the rest', () => {
    const board = [...GAMES, UNANNOUNCED]
    const cover = coverageSummary(board, ['cable'])
    expect(cover.total).toBe(37)
    expect(cover.unknown).toBe(1)
    expect(cover.known).toBe(36)
    expect(cover.watchable).toBe(9)
  })

  // Cable is a strict SUBSET now rather than the other half of a split: every
  // game a cable package carries also streams. So the check is containment, not
  // addition, and a game that fell out of both would break it.
  it('leaves no game outside both a streamer and the linear list', () => {
    const stream = coverageSummary(GAMES, ['dazn', 'hbomax'])
    expect(stream.watchable).toBe(stream.known)
    for (const g of GAMES) {
      const cableOnly = isWatchable(g, ['cable']) && !isWatchable(g, ['dazn'])
      expect(cableOnly, `game ${g.num}`).toBe(false)
    }
  })
})
