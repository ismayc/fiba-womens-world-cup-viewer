// "My services": which of this tournament's games a viewer can actually watch.
//
// The US rights split is lopsided (16 of the 24 group games are HBO Max only),
// so the distinction between "not on your services" and "coverage not announced
// yet" is load-bearing: conflating them would drop the entire final phase out of
// a filtered schedule.

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
const CABLE = ['TNT', 'truTV']
const num = (n) => GAMES.find((g) => g.num === n)

describe('the catalog', () => {
  it('offers one streaming service and the live-TV bundles', () => {
    expect(SERVICE_CATALOG.map((s) => s.key)).toEqual([
      'hbomax', 'youtubetv', 'hulu', 'fubo', 'sling', 'directv', 'cable',
    ])
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

  // HBO Max is a separate subscription, not part of any live-TV package. A
  // bundle subscriber must NOT be told they can watch the HBO Max-only games.
  it('keeps HBO Max out of every live-TV bundle', () => {
    for (const s of SERVICE_CATALOG.filter((x) => x.kind === 'bundle')) {
      expect(s.match(HBO), s.key).toBe(false)
      expect(s.match(CABLE), s.key).toBe(true)
    }
    expect(SERVICE_BY_KEY.hbomax.match(HBO)).toBe(true)
    expect(SERVICE_BY_KEY.hbomax.match(CABLE)).toBe(false)
  })

  it('matches a game carried on either linear network', () => {
    expect(SERVICE_BY_KEY.cable.match(['TNT'])).toBe(true)
    expect(SERVICE_BY_KEY.cable.match(['truTV'])).toBe(true)
    expect(SERVICE_BY_KEY.cable.match(['Some Other Channel'])).toBe(false)
  })
})

describe('hasKnownBroadcast', () => {
  it('is true for a game ESPN has placed and false for one it has not', () => {
    expect(hasKnownBroadcast(num(1))).toBe(true)
    expect(hasKnownBroadcast(num(25))).toBe(false) // final phase, not yet published
    expect(hasKnownBroadcast({ tv: [] })).toBe(false)
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

  // The distinction this module exists for. Dropping the twelve final-phase
  // games from a filtered schedule would read as a bug, not as a filter.
  it('KEEPS a game whose coverage is not announced yet', () => {
    expect(hasKnownBroadcast(num(25))).toBe(false)
    expect(isWatchable(num(25), ['cable'])).toBe(true)
    expect(isWatchable(num(36), ['hbomax'])).toBe(true)
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
    expect(cable.unknown).toBe(12) // the unpublished final phase
    expect(cable.known).toBe(24)
    expect(cable.watchable).toBe(8) // TNT / truTV games only

    const hbo = coverageSummary(GAMES, ['hbomax'])
    expect(hbo.watchable).toBe(16)

    const both = coverageSummary(GAMES, ['hbomax', 'cable'])
    expect(both.watchable).toBe(24) // every published game
  })

  it('counts nothing watchable when nothing is selected', () => {
    expect(coverageSummary(GAMES, []).watchable).toBe(0)
  })

  it('the two halves of the split account for every published game', () => {
    const hbo = coverageSummary(GAMES, ['hbomax'])
    const cable = coverageSummary(GAMES, ['cable'])
    expect(hbo.watchable + cable.watchable).toBe(hbo.known)
  })
})
