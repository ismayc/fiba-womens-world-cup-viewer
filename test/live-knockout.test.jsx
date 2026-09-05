// The knockout rounds' live overlay.
//
// A final-phase game is committed with `espnId: null`, `t1`/`t2` null and (for
// the qualification round and the semi-finals) no kickoff time, because FIBA
// publishes the bracket wiring long before ESPN publishes the fixture. So the
// ONLY handle such a game can be matched by is its team pair, and it has no pair
// until `resolveBracket` fills one in from the group results.
//
// Resolution happens downstream of the live overlay, so App runs the overlay a
// second time over the resolved schedule. Without that second pass the four
// qualification games on the first knockout day sit at "no score" for as long as
// it takes a scheduled refresh to commit their ids, which is hours (see
// docs: GitHub runs these crons well behind their schedule and sometimes drops
// one). These tests are what hold that second pass in place.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// App reads the committed board, which the refresh workflow rewrites while the
// tournament is on. Serve the frozen pre-tournament board so the second overlay
// pass is exercised from a known starting point.
vi.mock('../src/data/games.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/pretournament-games.js')).GAMES,
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { GAMES } from './fixtures/pretournament-games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { applyLive, fetchLive, unclaimedLive } from '../src/services/espn.js'
import { allGroupsPlayed, espnScoreboard, pinClock } from './helpers/tournament.js'

const num = (games, n) => games.find((g) => g.num === n)

function mockFeed(payload) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
}

// The qualification-round fixture as ESPN publishes it on the day: an event id
// we have never committed, the two teams the group phase just produced, and a
// score. `away` is FIBA's first-named side, the orientation every committed
// record uses.
function qrEvent(away, home, score, state = 'in') {
  const date = '2026-09-08T12:30Z'
  const status = {
    period: state === 'pre' ? 0 : 3,
    displayClock: '4:12',
    type: {
      state,
      name: `STATUS_${state === 'post' ? 'FINAL' : state === 'in' ? 'IN_PROGRESS' : 'SCHEDULED'}`,
      completed: state === 'post',
      description: state === 'post' ? 'Final' : 'In Progress',
      shortDetail: '',
    },
  }
  return {
    id: '401999001',
    date,
    status,
    competitions: [
      {
        id: '401999001',
        date,
        neutralSite: true,
        venue: { id: '11593', fullName: 'x' },
        status,
        competitors: [
          { homeAway: 'away', score: String(score[0]), team: { id: '1', displayName: away } },
          { homeAway: 'home', score: String(score[1]), team: { id: '2', displayName: home } },
        ],
      },
    ],
  }
}

// The qualification round is played on September 8, and the app collapses a past
// day's section, so the card these tests look for leaves the DOM the moment the
// real clock passes that date. Pin the clock to the middle of the qualification
// round instead: verified that without this the App test below went red from
// September 9, 2026 onwards with no commit behind it.
//
// Only Date is faked, so waitFor still runs on real timers.
const DURING_THE_QR = new Date('2026-09-08T13:00:00Z')

beforeEach(() => {
  pinClock(DURING_THE_QR)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('unclaimedLive', () => {
  it('drops every record a committed game already owns by id', async () => {
    mockFeed(espnScoreboard([num(GAMES, 1)], { 1: { state: 'post', score: [88, 61] } }))
    const live = await fetchLive()
    // The group game is indexed three ways, and all three must go: the pair key
    // is the one that could otherwise leak onto a later meeting of the same two
    // teams in the bracket.
    expect(live.get('pair:Japan|Mali')).toBeTruthy()
    const filtered = unclaimedLive(live, GAMES)
    expect(filtered.get('pair:Japan|Mali')).toBeUndefined()
    expect(filtered.get('id:' + num(GAMES, 1).espnId)).toBeUndefined()
  })

  it('keeps a fixture no committed game has an id for', async () => {
    mockFeed({ events: [qrEvent('Japan', 'France', [44, 38])] })
    const live = await fetchLive()
    expect(unclaimedLive(live, GAMES).get('pair:France|Japan')).toBeTruthy()
  })

  it('passes an empty map straight through', () => {
    expect(unclaimedLive(null, GAMES)).toBe(null)
    const empty = new Map()
    expect(unclaimedLive(empty, GAMES)).toBe(empty)
  })

  it('returns the map unchanged when nothing is committed to claim it', async () => {
    mockFeed({ events: [qrEvent('Japan', 'France', [44, 38])] })
    const live = await fetchLive()
    expect(unclaimedLive(live, [{ num: 1, espnId: null }])).toBe(live)
  })
})

describe('the second overlay pass', () => {
  it('scores a resolved qualification game that has no committed espnId', async () => {
    const board = allGroupsPlayed()
    mockFeed({ events: [qrEvent('Japan', 'France', [44, 38])] })
    const live = await fetchLive()

    const resolved = resolveBracket(board, computeClinch(board))
    const before = num(resolved, 25)
    // Resolution names the teams...
    expect(before.t1).toBe('Japan')
    expect(before.t2).toBe('France')
    // ...but the game is still unmatched by the first pass: no id, no kickoff.
    expect(before.espnId).toBe(null)
    expect(before.score).toBeUndefined()
    expect(applyLive(board, live).find((g) => g.num === 25).score).toBeUndefined()

    const after = num(applyLive(resolved, unclaimedLive(live, GAMES)), 25)
    // Our records are [t1, t2] and t1 is ESPN's away side, so the pair is
    // reversed back on the way in.
    expect(after.score).toEqual([44, 38])
    expect(after.live).toBeTruthy()
    expect(after.espnId).toBe('401999001')
  })

  it('takes the kickoff time from the same record, since the slot had none', async () => {
    const board = allGroupsPlayed()
    mockFeed({ events: [qrEvent('Japan', 'France', [44, 38])] })
    const live = await fetchLive()
    const resolved = resolveBracket(board, computeClinch(board))
    expect(num(resolved, 25).ko).toBe(null)
    expect(num(resolved, 25).tbdTip).toBe(true)

    const after = num(applyLive(resolved, unclaimedLive(live, GAMES)), 25)
    expect(new Date(after.ko).toISOString()).toBe('2026-09-08T12:30:00.000Z')
    expect(after.tbdTip).toBe(false)
  })

  it('does not let a group meeting supply a knockout slot with the same pair', async () => {
    // Japan v Mali is game 1 and carries a committed id. If a later round ever
    // pairs them again, the knockout slot must stay unscored rather than adopt
    // the group result, because `pairKey` is not scoped to a date.
    const board = allGroupsPlayed()
    mockFeed(espnScoreboard([num(GAMES, 1)], { 1: { state: 'post', score: [88, 61] } }))
    const live = await fetchLive()
    const resolved = resolveBracket(board, computeClinch(board)).map((g) =>
      g.num === 33 ? { ...g, t1: 'Japan', t2: 'Mali' } : g,
    )
    const after = num(applyLive(resolved, unclaimedLive(live, GAMES)), 33)
    expect(after.score).toBeUndefined()
    // The group game itself is untouched: it already has a result, and a
    // committed score always wins over the feed.
    expect(num(applyLive(resolved, live), 1).score).toEqual([80, 70])
  })
})

describe('the app', () => {
  it('shows a live qualification-round score without waiting for a refresh', async () => {
    const played = allGroupsPlayed()
    mockFeed({
      events: [...espnScoreboard(played).events, qrEvent('Japan', 'France', [44, 38])],
    })
    render(
      <FollowProvider>
        <PathProvider>
          <App />
        </PathProvider>
      </FollowProvider>,
    )

    await waitFor(() => {
      const cards = [...document.querySelectorAll('.card')]
      const qr = cards.find(
        (c) => c.textContent.includes('Japan') && c.textContent.includes('France'),
      )
      expect(qr, 'no card for the resolved Japan v France qualification game').toBeTruthy()
      expect(qr.querySelector('.score')?.textContent).toMatch(/44.*38/)
    })
    expect(screen.getAllByText(/Japan/).length).toBeGreaterThan(0)
  })
})
