// Full-app tests: the shell, view routing, the fetch loop, filters, spoiler
// mode and the alert plumbing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
// See test/fixtures/pretournament-games.js: App imports the committed board, and
// that board grows scores three times a day while the tournament is on. Mock it
// to the frozen board so these assertions describe the shell, not the results.
vi.mock('../src/data/games.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/pretournament-games.js')).GAMES,
}))

import App from '../src/App.jsx'
import { GAMES } from './fixtures/pretournament-games.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { espnScoreboard, pinClock } from './helpers/tournament.js'

const mount = () =>
  render(
    <FollowProvider>
      <PathProvider>
        <App />
      </PathProvider>
    </FollowProvider>,
  )

const num = (n) => GAMES.find((g) => g.num === n)

function feed(payload = { events: [] }) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  feed()
  // Hold the clock before the first tip-off, so what App renders here is a
  // function of the frozen board and nothing else. Only Date is faked, so
  // waitFor and the fetch loop keep running on real timers.
  pinClock()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the shell', () => {
  it('names the tournament and counts its games', async () => {
    mount()
    expect(await screen.findByText(/FIBA Women’s World Cup 2026/)).toBeInTheDocument()
    expect(screen.getByText(/All 36 games · Berlin/)).toBeInTheDocument()
  })

  it('offers exactly the views this edition has', async () => {
    mount()
    const bar = document.querySelector('.view-switch')
    const labels = within(bar).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual([
      '📋 Schedule',
      '📆 Week',
      '📊 Groups',
      '🧮 Scenarios',
      '🏆 Bracket',
    ])
    // The football sibling's goal-difference Outlook and Golden Boot Stats views
    // have no counterpart here and must not reappear.
    expect(labels.join()).not.toMatch(/Outlook|Stats/)
  })

  it('routes to each view and records it in the URL', async () => {
    mount()
    for (const [label, marker] of [
      ['📊 Groups', /Top three advance/],
      ['🏆 Bracket', /Qualification to Quarter-Finals/],
      ['🧮 Scenarios', /Pick the winner of each remaining group game/],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(await screen.findAllByText(marker)).not.toHaveLength(0)
    }
    expect(window.location.search).toContain('view=scenarios')
  })

  it('restores the view from the URL', async () => {
    window.history.replaceState({}, '', '/?view=bracket')
    mount()
    expect(await screen.findAllByText('Qualification to Quarter-Finals')).not.toHaveLength(0)
  })

  it('falls back to the Bracket for a view this edition dropped', async () => {
    window.history.replaceState({}, '', '/?view=outlook')
    mount()
    expect(await screen.findAllByText('Qualification to Quarter-Finals')).not.toHaveLength(0)
  })
})

describe('the results feed', () => {
  it('reports that nothing has been played yet', async () => {
    mount()
    expect(await screen.findByText(/No results yet, tip-off is September 4, 2026/)).toBeInTheDocument()
  })

  it('overlays a live game from ESPN', async () => {
    feed(espnScoreboard([num(1)], { 1: { state: 'in', score: [41, 38], period: 2, clock: '3:20' } }))
    mount()
    // The scoreline renders as "41–38" split across nodes, so match the card.
    await waitFor(() => {
      const card = document.querySelector('.card .score')
      expect(card?.textContent.replace(/\s/g, '')).toBe('41–38')
    })
  })

  it('says so when the feed cannot be reached', async () => {
    global.fetch = vi.fn(async () => ({ ok: false }))
    mount()
    expect(await screen.findByText(/Couldn’t reach results feed/)).toBeInTheDocument()
  })

  it('refreshes on demand', async () => {
    mount()
    await screen.findByText(/No results yet/)
    const before = global.fetch.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('filters and search', () => {
  it('narrows the schedule to one group', async () => {
    mount()
    await screen.findByText(/No results yet/)
    fireEvent.click(document.querySelector('.filters-toggle'))
    const groupSelect = [...document.querySelectorAll('.field')]
      .find((f) => f.textContent.startsWith('Group'))
      .querySelector('select')
    fireEvent.change(groupSelect, { target: { value: 'A' } })
    const cards = document.querySelectorAll('.card')
    expect(cards.length).toBe(6)
  })

  it('counts results in games, not matches', async () => {
    mount()
    await screen.findByText(/No results yet/)
    fireEvent.click(document.querySelector('.filters-toggle'))
    expect(document.querySelector('.result-count').textContent).toMatch(/^\d+ games$/)
  })

  it('has no broadcast-language filter', async () => {
    mount()
    await screen.findByText(/No results yet/)
    fireEvent.click(document.querySelector('.filters-toggle'))
    expect(screen.queryByText('Broadcast')).not.toBeInTheDocument()
  })
})

describe('spoiler-free mode', () => {
  it('toggles and records itself in the URL', async () => {
    mount()
    await screen.findByText(/No results yet/)
    fireEvent.click(screen.getByRole('button', { name: /Scores shown/ }))
    expect(window.location.search).toContain('hide=1')
    expect(screen.getByRole('button', { name: /Scores hidden/ })).toBeInTheDocument()
  })
})

describe('result alerts', () => {
  it('labels the alert toggle for results, not goals', async () => {
    mount()
    await screen.findByText(/No results yet/)
    const label = screen.getByTitle(/browser notification when a game goes final/)
    expect(label.textContent).toMatch(/results/)
    expect(label.textContent).not.toMatch(/goals/)
  })

  it('persists the preference', async () => {
    mount()
    await screen.findByText(/No results yet/)
    fireEvent.click(within(screen.getByTitle(/goes final/)).getByRole('checkbox'))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('fwwc:scoreAlerts')).enabled).toBe(true),
    )
    // The scope selector only appears once alerts are on.
    expect(screen.getByLabelText('Result-alert scope')).toBeInTheDocument()
  })
})

describe('theme', () => {
  it('toggles and remembers the palette under this app’s own key', async () => {
    mount()
    await screen.findByText(/No results yet/)
    const before = document.documentElement.dataset.theme
    fireEvent.click(screen.getByLabelText('Toggle theme'))
    expect(document.documentElement.dataset.theme).not.toBe(before)
    expect(localStorage.getItem('fwwc:theme')).toBeTruthy()
    // A sibling viewer's key must stay untouched: the family shares an origin.
    expect(localStorage.getItem('wwc:theme')).toBeNull()
  })
})
