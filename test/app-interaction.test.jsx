// App-level INTERACTION: the shell's own behaviour once someone starts clicking.
// Filtering, day collapse and spoilers, the modals, the alert pipeline, the
// mobile view strip, and the states that only exist once games are being played.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'
import { GAMES } from '../src/data/games.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { espnScoreboard, allGroupsPlayed } from './helpers/tournament.js'

const num = (n) => GAMES.find((g) => g.num === n)

const mount = () =>
  render(
    <FollowProvider>
      <PathProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </PathProvider>
    </FollowProvider>,
  )

function feed(payload = { events: [] }) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
}

const ready = () => screen.findByText(/No results yet|game[s]? with scores|Couldn’t reach/)

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  feed()
  // jsdom performs no layout and has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom has no IntersectionObserver; the sticky view strip needs one.
  global.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb
      global.__io = this
    }
    observe() {}
    disconnect() {}
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete global.IntersectionObserver
  delete global.__io
})

describe('filtering', () => {
  const openFilters = () => fireEvent.click(document.querySelector('.filters-toggle'))
  const field = (label) =>
    [...document.querySelectorAll('.field')]
      .find((f) => f.textContent.startsWith(label))
      .querySelector('select')

  it('filters by team, arena and timeframe, and counts the active filters', async () => {
    mount()
    await ready()
    openFilters()

    fireEvent.change(field('Team'), { target: { value: 'Japan' } })
    expect(document.querySelectorAll('.card')).toHaveLength(3)
    expect(document.querySelector('.filter-count').textContent).toBe('1')

    fireEvent.change(field('Team'), { target: { value: 'all' } })
    fireEvent.change(field('Arena'), { target: { value: 'berlinarena' } })
    const arenaOnly = document.querySelectorAll('.card').length
    expect(arenaOnly).toBeGreaterThan(0)
    expect(arenaOnly).toBeLessThan(24)

    fireEvent.change(field('Arena'), { target: { value: 'all' } })
    fireEvent.change(field('When'), { target: { value: 'finished' } })
    expect(document.querySelectorAll('.card')).toHaveLength(0)
    expect(screen.getByText(/No games match your filters/)).toBeInTheDocument()
  })

  it('filters by a stage chip', async () => {
    mount()
    await ready()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Quarter-Final' }))
    expect(document.querySelectorAll('.card')).toHaveLength(4)
  })

  it('searches, and clears every filter at once', async () => {
    mount()
    await ready()
    openFilters()
    fireEvent.click(document.querySelector('.search-toggle'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'team: Mali' } })
    expect(document.querySelectorAll('.card')).toHaveLength(3)

    fireEvent.click(document.querySelector('.clear-mini'))
    expect(document.querySelectorAll('.card').length).toBeGreaterThan(3)
  })

  it('filters to followed teams once a team is starred', async () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Mali']))
    mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /My Teams/ }))
    expect(document.querySelectorAll('.card')).toHaveLength(3)
    expect(window.location.search).toContain('mine=1')
  })
})

describe('services filtering', () => {
  it('opens the picker, chooses a service, and filters to it', async () => {
    mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /Choose my services/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Cable \/ Satellite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: /My services \(1\)/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /On my services/ }))
    // 8 watchable group games plus the 12 whose coverage is not announced.
    expect(document.querySelectorAll('.card')).toHaveLength(20)
    expect(window.location.search).toContain('svc=1')
  })

  it('offers no services filter until something is chosen', async () => {
    mount()
    await ready()
    expect(screen.queryByRole('button', { name: /On my services/ })).not.toBeInTheDocument()
  })
})

describe('the schedule list', () => {
  it('collapses and expands a day', async () => {
    mount()
    await ready()
    const day = document.querySelector('.day')
    const header = within(day).getAllByRole('button')[0]
    expect(day.classList.contains('collapsed')).toBe(false)
    fireEvent.click(header)
    expect(document.querySelector('.day').classList.contains('collapsed')).toBe(true)
  })

  it('hides and reveals one day’s scores independently', async () => {
    mount()
    await ready()
    const spoiler = document.querySelectorAll('.day-spoiler')[0]
    expect(spoiler).toBeTruthy()
    fireEvent.click(spoiler)
    fireEvent.click(document.querySelectorAll('.day-spoiler')[0])
  })

  it('hides a completed stage and offers it back', async () => {
    // Every group game final: the group phase drops out of the Schedule.
    const played = allGroupsPlayed()
    feed(espnScoreboard(played.filter((g) => g.stage === 'Group'), Object.fromEntries(
      played.filter((g) => g.stage === 'Group').map((g) => [g.num, { state: 'post', score: g.score }]),
    )))
    mount()
    await screen.findByText(/games with scores/)
    const note = await screen.findByText(/Group phase complete/)
    expect(note).toBeInTheDocument()
    fireEvent.click(within(note).getByRole('button', { name: /Show group games/ }))
    expect(document.querySelectorAll('.card').length).toBeGreaterThan(12)
  })
})

describe('the view strip', () => {
  it('appears when the main nav scrolls away, and switches view', async () => {
    mount()
    await ready()
    act(() => global.__io.cb([{ isIntersecting: false }]))
    const strip = document.querySelector('.view-strip')
    expect(strip).toBeTruthy()

    fireEvent.click(within(strip).getAllByRole('button')[0])
    const tabs = document.querySelector('.view-strip-tabs')
    expect(tabs).toBeTruthy()
    fireEvent.click(within(tabs).getByRole('button', { name: /Bracket/ }))
    expect(await screen.findAllByText('Qualification to Quarter-Finals')).not.toHaveLength(0)
  })

  it('closes itself when the main nav comes back', async () => {
    mount()
    await ready()
    act(() => global.__io.cb([{ isIntersecting: false }]))
    fireEvent.click(within(document.querySelector('.view-strip')).getAllByRole('button')[0])
    expect(document.querySelector('.view-strip-tabs')).toBeTruthy()
    act(() => global.__io.cb([{ isIntersecting: true }]))
    expect(document.querySelector('.view-strip-tabs')).toBeNull()
  })
})

describe('modals', () => {
  it('opens the calendar and closes it', async () => {
    mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a game’s detail from a card and closes it', async () => {
    mount()
    await ready()
    fireEvent.click(screen.getAllByRole('button', { name: /Details/ })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('jumps to the bracket from a group projection', async () => {
    const played = allGroupsPlayed()
    feed(espnScoreboard(played.filter((g) => g.stage === 'Group'), Object.fromEntries(
      played.filter((g) => g.stage === 'Group').map((g) => [g.num, { state: 'post', score: g.score }]),
    )))
    mount()
    await screen.findByText(/games with scores/)
    fireEvent.click(screen.getByRole('button', { name: /📊 Groups/ }))
    const jump = (await screen.findAllByTitle(/Show Game \d+ on the Bracket/))[0]
    fireEvent.click(jump)
    expect(await screen.findAllByText('Qualification to Quarter-Finals')).not.toHaveLength(0)
  })
})

describe('the results bar', () => {
  it('counts the games that have a score', async () => {
    feed(espnScoreboard([num(1)], { 1: { state: 'post', score: [88, 61] } }))
    mount()
    expect(await screen.findByText(/1 game with scores/)).toBeInTheDocument()
  })

  it('turns auto-refresh off and on', async () => {
    mount()
    await ready()
    const auto = within(document.querySelector('.results-auto')).getByRole('checkbox')
    expect(auto.checked).toBe(true)
    fireEvent.click(auto)
    expect(auto.checked).toBe(false)
  })

  it('polls again on the timer while a game is live', async () => {
    vi.useFakeTimers()
    feed(espnScoreboard([num(1)], { 1: { state: 'in', score: [40, 38], period: 2 } }))
    mount()
    await vi.waitFor(() => expect(document.querySelector('.badge-live')).toBeTruthy())
    const before = global.fetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31000)
    })
    expect(global.fetch.mock.calls.length).toBeGreaterThan(before)
    vi.useRealTimers()
  })
})

describe('result alerts', () => {
  it('raises a toast when a game goes final, and dismisses it', async () => {
    // First poll: live. Second: final. The toast fires on the transition.
    let payload = espnScoreboard([num(1)], { 1: { state: 'in', score: [40, 38], period: 2 } })
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
    mount()
    await waitFor(() => expect(document.querySelector('.badge-live')).toBeTruthy())

    fireEvent.click(within(screen.getByTitle(/goes final/)).getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText('Result-alert scope'), { target: { value: 'all' } })

    payload = espnScoreboard([num(1)], { 1: { state: 'post', score: [88, 61] } })
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))

    const toast = await screen.findByText(/FINAL: Japan win/)
    expect(toast).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    await waitFor(() => expect(screen.queryByText(/FINAL: Japan win/)).not.toBeInTheDocument())
  })

  it('opens the game from its toast', async () => {
    let payload = espnScoreboard([num(1)], { 1: { state: 'in', score: [40, 38], period: 2 } })
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
    mount()
    await waitFor(() => expect(document.querySelector('.badge-live')).toBeTruthy())
    fireEvent.click(within(screen.getByTitle(/goes final/)).getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText('Result-alert scope'), { target: { value: 'all' } })
    payload = espnScoreboard([num(1)], { 1: { state: 'post', score: [88, 61] } })
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))

    await screen.findByText(/FINAL: Japan win/)
    fireEvent.click(screen.getByTitle('Open game details'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('also raises a browser notification when permission allows', async () => {
    const notifications = []
    class FakeNotification {
      static permission = 'granted'
      static requestPermission = vi.fn(async () => 'granted')
      constructor(title, opts) {
        this.title = title
        this.opts = opts
        notifications.push(this)
      }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)

    let payload = espnScoreboard([num(1)], { 1: { state: 'in', score: [40, 38], period: 2 } })
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
    mount()
    await waitFor(() => expect(document.querySelector('.badge-live')).toBeTruthy())
    fireEvent.click(within(screen.getByTitle(/goes final/)).getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText('Result-alert scope'), { target: { value: 'all' } })
    payload = espnScoreboard([num(1)], { 1: { state: 'post', score: [88, 61] } })
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))

    await waitFor(() => expect(notifications.length).toBe(1))
    expect(notifications[0].title).toMatch(/FINAL/)
    // Clicking the notification opens that game.
    act(() => notifications[0].onclick())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('asks for permission when alerts are switched on', async () => {
    const requestPermission = vi.fn(async () => 'granted')
    vi.stubGlobal('Notification', class {
      static permission = 'default'
      static requestPermission = requestPermission
    })
    mount()
    await ready()
    fireEvent.click(within(screen.getByTitle(/goes final/)).getByRole('checkbox'))
    await waitFor(() => expect(requestPermission).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })

  it('switches alerts back off without asking again', async () => {
    localStorage.setItem('fwwc:scoreAlerts', JSON.stringify({ enabled: true, scope: 'all' }))
    mount()
    await ready()
    const box = within(screen.getByTitle(/goes final/)).getByRole('checkbox')
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('fwwc:scoreAlerts')).enabled).toBe(false),
    )
  })

  it('restores a saved scope, and falls back for an unreadable one', async () => {
    localStorage.setItem('fwwc:scoreAlerts', JSON.stringify({ enabled: true, scope: 'all' }))
    const { unmount } = mount()
    await ready()
    expect(screen.getByLabelText('Result-alert scope').value).toBe('all')
    unmount()

    localStorage.setItem('fwwc:scoreAlerts', 'not json')
    mount()
    await ready()
    expect(screen.queryByLabelText('Result-alert scope')).not.toBeInTheDocument()
  })
})

describe('the tournament being over', () => {
  const finished = () => {
    const board = GAMES.map((g) => ({ ...g, score: [90, 70], t1: g.t1 ?? 'Japan', t2: g.t2 ?? 'Mali' }))
    return espnScoreboard(
      board.filter((g) => g.espnId),
      Object.fromEntries(board.map((g) => [g.num, { state: 'post', score: [90, 70] }])),
    )
  }

  // "Concluded" means nothing is live AND no game is still in the future, so the
  // clock has to be moved past the Final for this state to exist at all.
  it('stops auto-refreshing once every game is played and the last one has passed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
    feed(finished())
    mount()
    await vi.waitFor(() => expect(document.querySelector('.results-auto')).toBeTruthy())
    const auto = within(document.querySelector('.results-auto')).getByRole('checkbox')
    expect(auto.disabled).toBe(true)
    expect(document.querySelector('.results-auto').title).toMatch(/auto-refresh is off/)

    // And the timer must not fire again.
    const before = global.fetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300000)
    })
    expect(global.fetch.mock.calls.length).toBe(before)
    vi.useRealTimers()
  })
})

describe('App remaining arms', () => {
  it('renders the Week view', async () => {
    mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /📆 Week/ }))
    expect(document.querySelector('.week-view')).toBeTruthy()
    expect(document.querySelectorAll('.week-cell').length).toBeGreaterThan(0)
  })

  it('says "1 group game hidden" in the singular', async () => {
    // Filter to a single group game, then complete the group phase so the note
    // counts exactly one hidden game.
    const played = allGroupsPlayed()
    const group = played.filter((g) => g.stage === 'Group')
    feed(espnScoreboard(group, Object.fromEntries(
      group.map((g) => [g.num, { state: 'post', score: g.score }]),
    )))
    mount()
    await screen.findByText(/games with scores/)
    fireEvent.click(document.querySelector('.filters-toggle'))
    fireEvent.click(document.querySelector('.search-toggle'))
    // A query that matches exactly one group game.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'team: Japan group: A stage: group' } })
    const note = await screen.findByText(/Group phase complete/)
    expect(note.textContent).toMatch(/3 group games hidden/)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Japan Mali' } })
    const one = await screen.findByText(/Group phase complete/)
    expect(one.textContent).toMatch(/1 group game hidden/)
  })

  // An in-flight request that is superseded must not flip the bar to "error":
  // it was cancelled on purpose, not broken. `Promise.allSettled` never
  // rejects, so the service has to detect the abort itself and rethrow it.
  it('ignores an aborted request rather than reporting a failure', async () => {
    const seen = []
    global.fetch = vi.fn(
      (url, opts) =>
        new Promise((_, rej) => {
          seen.push(opts.signal)
          opts.signal.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            rej(e)
          })
        }),
    )
    mount()
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    // Refreshing aborts the first request; the bar must not report an error.
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText(/Couldn’t reach results feed/)).not.toBeInTheDocument()
  })
})
