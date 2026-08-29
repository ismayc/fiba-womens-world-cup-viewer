// The Netlify calendar function: the auto-updating webcal:// subscription.
//
// It cannot import from the app's source tree, so it restates a little of what
// services/espn.js and scripts/official.mjs know. These tests are what keeps the
// restatement in step with the originals.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, parseScoreboard } from '../netlify/functions/calendar.js'
import { VENUES } from '../src/data/venues.js'
import { ALL_TEAMS } from '../src/data/teams.js'
import feed from './fixtures/espn-scoreboard.json'

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
})

describe('parseScoreboard', () => {
  const games = parseScoreboard(feed)

  it('reads every game of this tournament', () => {
    expect(games).toHaveLength(24)
  })

  // ESPN files every FIBA competition under one league slug, so another event in
  // the same window would otherwise land in a subscriber's calendar.
  it('keeps only this tournament’s games', () => {
    const withInterloper = {
      events: [
        ...feed.events,
        {
          id: 'x',
          date: '2026-09-05T12:00Z',
          competitions: [
            {
              notes: [{ headline: 'FIBA U19 Something Else' }],
              status: { type: {} },
              venue: { fullName: 'Elsewhere', address: {} },
              competitors: [
                { homeAway: 'home', score: '1', team: { displayName: 'A' } },
                { homeAway: 'away', score: '2', team: { displayName: 'B' } },
              ],
            },
          ],
        },
      ],
    }
    expect(parseScoreboard(withInterloper)).toHaveLength(24)
  })

  it('names teams exactly as the app does', () => {
    for (const g of games) {
      expect(ALL_TEAMS).toContain(g.home)
      expect(ALL_TEAMS).toContain(g.away)
    }
  })

  // A drift between the function's VENUE_ALIASES and the app's venue data would
  // make a subscriber's calendar name a different arena from the app.
  it('uses the arena names the app’s own data uses', () => {
    const known = new Set(Object.values(VENUES).map((v) => v.name))
    for (const g of games) {
      const arena = g.venue.split(',')[0].trim()
      expect(known, `unknown arena "${arena}"`).toContain(arena)
    }
    // Specifically: ESPN's sponsor name must have been translated.
    expect(games.some((g) => g.venue.startsWith('Berlin Arena'))).toBe(true)
    expect(games.every((g) => !g.venue.includes('Uber'))).toBe(true)
  })

  it('labels the round from the note headline', () => {
    expect(new Set(games.map((g) => g.round))).toEqual(
      new Set(['Group A', 'Group B', 'Group C', 'Group D']),
    )
  })

  // ESPN reports score "0" before tip-off, so without the completed guard every
  // future fixture would read as a played 0-0.
  it('shows no score for a game that has not been played', () => {
    for (const g of games) expect(g.result).toBe('')
  })

  it('shows the score, and overtime, once a game is complete', () => {
    const played = {
      events: [
        {
          ...feed.events[0],
          competitions: [
            {
              ...feed.events[0].competitions[0],
              status: { period: 6, type: { completed: true, detail: 'Final/2OT' } },
              competitors: feed.events[0].competitions[0].competitors.map((c, i) => ({
                ...c,
                score: i === 0 ? '95' : '92',
              })),
            },
          ],
        },
      ],
    }
    const [g] = parseScoreboard(played)
    expect(g.result).toMatch(/2OT/)
    expect(g.result).toMatch(/92–95|95–92/)
  })

  it('skips an event with no competitors or an unreadable date', () => {
    expect(
      parseScoreboard({
        events: [
          { competitions: [{ notes: [{ headline: "FIBA Women's World Cup - Group A" }] }] },
          {
            date: 'nonsense',
            competitions: [
              {
                notes: [{ headline: "FIBA Women's World Cup - Group A" }],
                status: { type: {} },
                venue: {},
                competitors: [
                  { homeAway: 'home', team: { displayName: 'Japan' } },
                  { homeAway: 'away', team: { displayName: 'Mali' } },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([])
  })
})

describe('handler', () => {
  it('serves a calendar naming this tournament', async () => {
    const res = await handler({ queryStringParameters: {} })
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/)
    expect(res.body).toContain("X-WR-CALNAME:FIBA Women's World Cup 2026")
    expect(res.body).toContain("PRODID:-//FIBA Women's World Cup 2026 Viewer//EN")
    expect(res.body.match(/BEGIN:VEVENT/g)).toHaveLength(24)
    // No leftovers from the sibling it was grown from.
    expect(res.body).not.toMatch(/wwc2023|Women's World Cup 2023/)
  })

  it('filters to the requested teams', async () => {
    const res = await handler({ queryStringParameters: { teams: 'Japan' } })
    expect(res.body.match(/BEGIN:VEVENT/g)).toHaveLength(3) // three group games
    expect(res.body).toContain('My Teams')
  })

  it('reports an upstream failure rather than serving an empty calendar', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    expect((await handler({ queryStringParameters: {} })).statusCode).toBe(502)
  })

  it('reports a thrown error', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('boom')
    })
    const res = await handler({ queryStringParameters: {} })
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatch(/boom/)
  })
})

describe('the feed URL', () => {
  it('uses site.web.api, which a datacenter IP can actually reach', async () => {
    await handler({ queryStringParameters: {} })
    const url = global.fetch.mock.calls[0][0]
    expect(url).toContain('site.web.api.espn.com')
    expect(url).toContain('basketball/fiba')
    expect(url).toContain('dates=20260904-20260913')
  })
})
