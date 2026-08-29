// The last few conditional arms: the sides of each ternary a normal run only
// ever takes one way, plus the guards that keep a half-built board from
// crashing a view.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { GAMES } from '../src/data/games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { gamesByNum } from '../src/utils/bracket.js'
import Bracket from '../src/components/Bracket.jsx'
import MatchCard from '../src/components/MatchCard.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import NextMatch from '../src/components/NextMatch.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import Standings from '../src/components/Standings.jsx'
import WeekView from '../src/components/WeekView.jsx'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { DetailContext } from '../src/context/detail.js'
import { allGroupsPlayed, espnScoreboard, withGroupScores } from './helpers/tournament.js'

const TZ = 'Europe/Berlin'
const num = (games, n) => games.find((g) => g.num === n)

function wrap(ui, { onDetail = () => {} } = {}) {
  return render(
    <FollowProvider>
      <PathProvider>
        <ServicesProvider>
          <DetailContext.Provider value={onDetail}>{ui}</DetailContext.Provider>
        </ServicesProvider>
      </PathProvider>
    </FollowProvider>,
  )
}

function playedOut() {
  let board = allGroupsPlayed((g) => g.t1)
  board = resolveBracket(board, computeClinch(board))
  for (const round of [[25, 26, 27, 28], [29, 30, 31, 32], [33, 34], [35, 36]]) {
    board = board.map((g) => (round.includes(g.num) ? { ...g, score: [90, 70] } : g))
    board = resolveBracket(board, computeClinch(board))
  }
  return board
}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('followed teams and traced routes in the bracket', () => {
  const board = playedOut()

  it('highlights a followed team on a resolved slot and inside a candidate pair', () => {
    const champion = num(board, 36).t1
    localStorage.setItem('fwwc:followed', JSON.stringify([champion]))
    wrap(<Bracket matches={board} tz={TZ} />)
    expect(document.querySelectorAll('.bx-side.followed').length).toBeGreaterThan(0)
  })

  it('highlights a followed candidate inside an unresolved pair', () => {
    const partial = GAMES.map((g) =>
      g.num === 27 ? { ...g, t1: 'Australia', t2: 'Italy' } : g,
    )
    localStorage.setItem('fwwc:followed', JSON.stringify(['Italy']))
    wrap(<Bracket matches={partial} tz={TZ} />)
    expect(document.querySelectorAll('.bx-feeder-team.followed').length).toBeGreaterThan(0)
  })

  it('marks a candidate that is on the traced route', () => {
    const partial = resolveBracket(
      GAMES.map((g) => (g.num === 27 ? { ...g, t1: 'Australia', t2: 'Italy' } : g)),
      {},
    )
    wrap(
      <>
        <PathPicker byNum={gamesByNum(partial)} />
        <Bracket matches={partial} tz={TZ} />
      </>,
    )
    fireEvent.change(document.querySelector('.path-select'), { target: { value: 'Italy' } })
    expect(document.querySelectorAll('.on-path-team').length).toBeGreaterThan(0)
  })

  it('renders nothing for a bracket slot the board does not carry', () => {
    // A board missing a game entirely: the box must skip, not throw.
    const gapped = board.filter((g) => g.num !== 35)
    wrap(<Bracket matches={gapped} tz={TZ} />)
    expect(document.getElementById('bx-m35')).toBeNull()
    expect(document.getElementById('bx-m36')).toBeTruthy()
  })

  it('shows a single overtime as "OT" and an awarded final-phase game', () => {
    const one = board.map((g) => (g.num === 36 ? { ...g, ot: 1, awarded: true } : g))
    wrap(<Bracket matches={one} tz={TZ} />)
    const g36 = document.getElementById('bx-m36')
    expect(g36.querySelector('.bx-pens').textContent.trim()).toBe('OT')
    expect(g36.querySelector('.awarded-note')).toBeTruthy()
  })

  it('shows a postponed final-phase game with the pause glyph', () => {
    const off = board.map((g) =>
      g.num === 36 ? { ...g, voided: true, statusLabel: 'Postponed' } : g,
    )
    wrap(<Bracket matches={off} tz={TZ} />)
    expect(document.getElementById('bx-m36').textContent).toMatch(/⏸ Postponed/)
  })

  it('shows only "TBC" when a game has neither a tip-off nor a date', () => {
    const undated = GAMES.map((g) => (g.num === 25 ? { ...g, date: undefined } : g))
    wrap(<Bracket matches={resolveBracket(undated, {})} tz={TZ} />)
    expect(document.getElementById('bx-m25').textContent).toMatch(/TBC/)
  })
})

describe('PathPicker mid-run status', () => {
  // The route ends at a WON game only while the next round has not been filled
  // in yet, which is the real state between a result landing and ESPN publishing
  // the next fixture.
  it('says which round a team has reached when its last game is won', () => {
    let board = allGroupsPlayed((g) => g.t1)
    board = resolveBracket(board, computeClinch(board))
    board = board.map((g) => (g.num === 25 ? { ...g, score: [90, 70] } : g))
    const winner = num(board, 25).t1
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    fireEvent.change(document.querySelector('.path-select'), { target: { value: winner } })
    expect(screen.getByText(/Through to the Quarter-Final/)).toBeInTheDocument()
  })

  it('says which round is up next while a team waits', () => {
    let board = allGroupsPlayed((g) => g.t1)
    board = resolveBracket(board, computeClinch(board))
    const waiting = num(board, 25).t1
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    fireEvent.change(document.querySelector('.path-select'), { target: { value: waiting } })
    expect(screen.getByText(/Up next: Qualification to Quarter-Finals/)).toBeInTheDocument()
  })

  it('clears the trace when the empty option is chosen', () => {
    const board = playedOut()
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    const select = document.querySelector('.path-select')
    fireEvent.change(select, { target: { value: num(board, 36).t1 } })
    expect(select.value).not.toBe('')
    fireEvent.change(select, { target: { value: '' } })
    expect(select.value).toBe('')
  })
})

describe('MatchDetail conditional arms', () => {
  it('shows no tale of the tape before either team has played', () => {
    const board = resolveBracket(
      GAMES.map((g) => (g.num === 29 ? { ...g, t1: 'Japan', t2: 'Spain' } : g)),
      {},
    )
    wrap(<MatchDetail match={num(board, 29)} tz={TZ} allMatches={board} onClose={() => {}} />)
    expect(screen.queryByText('W–L')).not.toBeInTheDocument()
  })

  it('says "Tournament so far" for a game not yet played', () => {
    const board = allGroupsPlayed().map((g) =>
      g.num === 29 ? { ...g, t1: 'Japan', t2: 'Spain' } : g,
    )
    wrap(
      <MatchDetail
        match={num(board, 29)}
        tz={TZ}
        hideScores
        allMatches={board}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Tournament so far')).toBeInTheDocument()
  })

  it('shows a postponed game with the pause glyph', () => {
    const off = { ...num(GAMES, 1), voided: true, statusLabel: 'Postponed' }
    wrap(<MatchDetail match={off} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getAllByText(/⏸ Postponed/).length).toBeGreaterThan(0)
  })

  it('shows a delayed badge when the clock has passed with no feed clock', () => {
    const past = { ...num(GAMES, 1), ko: new Date(Date.now() - 30 * 60_000).toISOString() }
    wrap(<MatchDetail match={past} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getByText(/⏸ Delayed/)).toBeInTheDocument()
  })
})

describe('NextMatch remaining arms', () => {
  const afterTheFinal = (fn) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
    try {
      fn()
    } finally {
      vi.useRealTimers()
    }
  }

  it('falls back gracefully when the board has no Final at all', () => {
    afterTheFinal(() => {
      const noFinal = playedOut().filter((g) => g.stage !== 'Final')
      wrap(<NextMatch matches={noFinal} tz={TZ} />)
      expect(screen.getByText(/tournament has concluded/)).toBeInTheDocument()
    })
  })

  it('jumps to the day from a stacked live row', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const day = document.createElement('div')
    day.id = 'day-2026-09-07'
    document.body.appendChild(day)
    const live = GAMES.map((g) =>
      [21, 22].includes(g.num)
        ? { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
        : g,
    )
    wrap(<NextMatch matches={live} tz={TZ} />)
    fireEvent.click(document.querySelectorAll('.nm-live-row')[0])
    expect(scroll).toHaveBeenCalled()
    day.remove()
  })

  it('names the stage of a stacked final-phase pair', () => {
    const live = GAMES.map((g) =>
      [25, 26].includes(g.num)
        ? {
            ...g,
            t1: 'Spain',
            t2: 'Nigeria',
            ko: new Date(Date.now() + 3600_000).toISOString(),
          }
        : { ...g, ko: new Date(Date.now() + 9 * 86400_000).toISOString() },
    )
    wrap(<NextMatch matches={live} tz={TZ} />)
    expect(screen.getAllByText(/Qualification to Quarter-Finals/).length).toBeGreaterThan(0)
  })

  it('shows a plain delayed countdown when the feed gives no label', () => {
    const single = GAMES.map((g) =>
      g.num === 1 ? { ...g, score: [40, 38], live: { delayed: true } } : g,
    )
    localStorage.setItem('fwwc:followed', JSON.stringify(['Japan']))
    wrap(<NextMatch matches={single} tz={TZ} />)
    expect(document.querySelector('.nm-countdown.delayed').textContent).toMatch(/Delayed/)
  })
})

describe('Standings remaining arms', () => {
  it('shows a group with no projection destination for the eliminated team', () => {
    const board = allGroupsPlayed((g) => g.t1)
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    // Only three rows per group get a destination; the fourth has none.
    const lists = document.querySelectorAll('.ais-list')
    for (const list of lists) expect(list.querySelectorAll('.ais-row')).toHaveLength(3)
  })

  it('falls back to the label when a group winner’s opponent is a pending feed', () => {
    const board = allGroupsPlayed((g) => g.t1)
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    expect(screen.getAllByText(/Winner Game \d+/).length).toBeGreaterThan(0)
  })

  it('labels a paused group game with its own status word', () => {
    const paused = GAMES.map((g) =>
      g.num === 1 ? { ...g, score: [40, 38], live: { delayed: true } } : g,
    )
    wrap(<Standings matches={paused} tz={TZ} clinch={{}} />)
    expect(screen.getByText(/DELAYED/)).toBeInTheDocument()
  })
})

describe('WeekView remaining arms', () => {
  it('shows a canceled game with the warning glyph', () => {
    const played = allGroupsPlayed().map((g) =>
      g.num === 1 ? { ...g, voided: true, statusLabel: 'Canceled' } : g,
    )
    wrap(<WeekView allMatches={played} shown={played} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/⚠ Canceled/)
  })

  it('steps back a week', () => {
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    const next = screen.getByRole('button', { name: /Next/ })
    if (!next.disabled) fireEvent.click(next)
    const prev = screen.getByRole('button', { name: /Prev/ })
    if (!prev.disabled) fireEvent.click(prev)
    expect(document.querySelector('.week-title')).toBeTruthy()
  })
})

describe('MatchCard remaining arms', () => {
  it('shows a single overtime as "OT"', () => {
    wrap(<MatchCard match={{ ...num(GAMES, 1), score: [95, 92], ot: 1 }} tz={TZ} />)
    expect(screen.getByText('OT')).toBeInTheDocument()
  })
})

describe('App remaining arms', () => {
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

  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    global.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))
  })

  it('toggles the theme back to light', async () => {
    document.documentElement.dataset.theme = 'dark'
    mount()
    await screen.findByText(/No results yet/)
    fireEvent.click(screen.getByLabelText('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByLabelText('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  // Past days are shown by DEFAULT, so the button hides them first.
  it('hides past days when asked, and brings them back', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    mount()
    await vi.waitFor(() => expect(document.querySelector('.pastdays-btn')).toBeTruthy())
    const withPast = document.querySelectorAll('.day').length
    expect(document.querySelector('.pastdays-btn').textContent).toMatch(/Hide past days/)

    fireEvent.click(document.querySelector('.pastdays-btn'))
    const withoutPast = document.querySelectorAll('.day').length
    expect(withoutPast).toBeLessThan(withPast)
    expect(document.querySelector('.pastdays-btn').textContent).toMatch(/Show past days/)

    fireEvent.click(document.querySelector('.pastdays-btn'))
    expect(document.querySelectorAll('.day').length).toBe(withPast)
    vi.useRealTimers()
  })

  it('survives the history backfill failing', async () => {
    // The backfill is best-effort: the committed schedule must still render.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    let call = 0
    global.fetch = vi.fn(async () => {
      call += 1
      if (call > 1) throw new Error('network')
      return { ok: true, json: async () => ({ events: [] }) }
    })
    mount()
    await vi.waitFor(() => expect(document.querySelectorAll('.card').length).toBeGreaterThan(0))
    vi.useRealTimers()
  })

  it('suppresses a flood of results rather than stacking toasts', async () => {
    // A desynced snapshot can restore many games at once; more than a handful is
    // treated as a feed hiccup and stays silent.
    const board = allGroupsPlayed()
    const group = board.filter((g) => g.stage === 'Group')
    let payload = espnScoreboard(group, Object.fromEntries(
      group.map((g) => [g.num, { state: 'in', score: [40, 38], period: 2 }]),
    ))
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
    mount()
    await screen.findByText(/games with scores|No results yet/)
    fireEvent.click(within(screen.getByTitle(/goes final/)).getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText('Result-alert scope'), { target: { value: 'all' } })

    payload = espnScoreboard(group, Object.fromEntries(
      group.map((g) => [g.num, { state: 'post', score: g.score }]),
    ))
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelectorAll('.goal-toast')).toHaveLength(0)
  })
})

describe('final-phase games in the next-up bar', () => {
  // NextMatch read `m.t1` directly, so a final-phase game showed a blank name
  // and a bullet where the flag goes. Same class of bug as the schedule cards.
  const soon = (nums) =>
    GAMES.map((g) =>
      nums.includes(g.num)
        ? { ...g, ko: new Date(Date.now() + 3600_000).toISOString() }
        : { ...g, ko: new Date(Date.now() + 9 * 86400_000).toISOString() },
    )

  it('names an unresolved final-phase game by its slot labels', () => {
    wrap(<NextMatch matches={soon([25])} tz={TZ} />)
    expect(screen.getByText('2nd Group A')).toBeInTheDocument()
    expect(screen.getByText('3rd Group B')).toBeInTheDocument()
    // No flag exists for a label, so the placeholder bullet is used.
    expect(document.querySelectorAll('.nm-flag')[0].textContent).toBe('•')
  })

  it('names them in the stacked layout too', () => {
    wrap(<NextMatch matches={soon([25, 26])} tz={TZ} />)
    expect(screen.getByText('2nd Group A')).toBeInTheDocument()
    expect(screen.getByText('2nd Group B')).toBeInTheDocument()
    expect(document.querySelectorAll('.nm-live-row')).toHaveLength(2)
  })

  it('names them in a stacked LIVE layout', () => {
    const live = soon([25, 26]).map((g) =>
      [25, 26].includes(g.num)
        ? { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
        : g,
    )
    wrap(<NextMatch matches={live} tz={TZ} />)
    expect(screen.getByText('2nd Group A')).toBeInTheDocument()
    expect(document.querySelector('.nm-label').textContent).toMatch(/Live now/)
  })
})

describe('WeekView and Standings placeholder fallbacks', () => {
  it('uses the bullet for a cell with no flag', () => {
    const board = [num(GAMES, 25)]
    wrap(<WeekView allMatches={board} shown={board} tz={TZ} dayHidden={() => false} />)
    expect(document.querySelectorAll('.wc-flag')[0].textContent).toBe('•')
    expect(document.body.textContent).toMatch(/2nd Group A/)
  })

  it('names an opponent for every projected destination once a group has played', () => {
    const board = allGroupsPlayed()
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    const opponents = [...document.querySelectorAll('.ais-opp')].map((e) => e.textContent.trim())
    expect(opponents.length).toBe(12) // three placings across four groups
    // Every one is either a team or the pending feed it waits on; never a bare TBD.
    for (const o of opponents) expect(o).not.toBe('TBD')
  })
})

describe('the last conditional arms', () => {
  it('shows a canceled game with the warning glyph in the week view', () => {
    const played = allGroupsPlayed().map((g) =>
      g.num === 1 ? { ...g, voided: true, statusLabel: 'Canceled' } : g,
    )
    wrap(<WeekView allMatches={played} shown={played} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/⚠ Canceled/)
  })

  it('drops the per-team tooltip on a cell showing a candidate pair', () => {
    const resolved27 = { ...num(GAMES, 27), t1: 'Australia', t2: 'Italy' }
    const board = [resolved27, num(GAMES, 29)]
    wrap(<WeekView allMatches={board} shown={board} tz={TZ} dayHidden={() => false} />)
    // The side that expanded has no single team, so it carries no local-time hint.
    const teams = [...document.querySelectorAll('.wc-team')]
    expect(teams.some((t) => t.querySelector('.feeder-cand') && !t.title)).toBe(true)
  })

  it('names both a team’s bye route and its qualification routes in the tooltip', () => {
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} slotMap={{ A: { win: 29, second: 25, third: 26 } }} clinch={{}} />)
    const title = screen.getByText('Japan').closest('[title]').getAttribute('title')
    expect(title).toMatch(/1st → Quarter-final · Game 29 \(bye\)/)
    expect(title).toMatch(/2nd → Qualification round · Game 25/)
    expect(title).toMatch(/3rd → Qualification round · Game 26/)
  })

  it('says "Going into this game" once a game has been played', () => {
    const board = allGroupsPlayed().map((g) =>
      g.num === 29 ? { ...g, t1: 'Japan', t2: 'Spain', score: [90, 70] } : g,
    )
    wrap(
      <MatchDetail
        match={num(board, 29)}
        tz={TZ}
        hideScores
        allMatches={board}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Going into this game')).toBeInTheDocument()
  })

  it('crowns a champion even when the flag lookup finds nothing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
    const board = playedOut().map((g) =>
      g.num === 36 ? { ...g, t1: 'Atlantis', t2: 'Narnia', score: [90, 70] } : g,
    )
    wrap(<NextMatch matches={board} tz={TZ} />)
    expect(screen.getByText('Atlantis')).toBeInTheDocument()
    expect(screen.getByText(/Narnia/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not scroll when the target day is not on the page', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    fireEvent.click(document.querySelector('.nm-live-row'))
    expect(scroll).not.toHaveBeenCalled()
  })

  it('starts with the projection shown when storage cannot be read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const board = allGroupsPlayed()
    wrap(<Standings matches={board} tz={TZ} clinch={{}} />)
    expect(screen.getAllByText('As it stands → final phase').length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('survives a storage that refuses to remember the projection toggle', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const board = allGroupsPlayed()
    wrap(<Standings matches={board} tz={TZ} clinch={{}} />)
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /As it stands/ })),
    ).not.toThrow()
    spy.mockRestore()
  })
})

describe('the very last arms', () => {
  it('shows a postponed game with the pause glyph in the week view', () => {
    const played = allGroupsPlayed().map((g) =>
      g.num === 1 ? { ...g, voided: true, statusLabel: 'Postponed' } : g,
    )
    wrap(<WeekView allMatches={played} shown={played} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/⏸ Postponed/)
  })

  it('expands BOTH sides of a cell whose two feeds are set', () => {
    // Game 35 is "Loser Game 33" v "Loser Game 34": both sides are feeds.
    const board = [
      { ...num(GAMES, 33), t1: 'Japan', t2: 'Spain' },
      { ...num(GAMES, 34), t1: 'Italy', t2: 'China' },
      num(GAMES, 35),
    ]
    wrap(<WeekView allMatches={board} shown={board} tz={TZ} dayHidden={() => false} />)
    // The semi-finals (12 Sep, a Saturday) and the third-place game (13 Sep, a
    // Sunday) fall in different Sun-Sat weeks, so step forward to reach it.
    const next = screen.getByRole('button', { name: /Next/ })
    if (!next.disabled) fireEvent.click(next)
    const cells = [...document.querySelectorAll('.week-cell')]
    const g35 = cells.find((c) => c.textContent.includes('Japan') && c.textContent.includes('Italy'))
    expect(g35).toBeTruthy()
    expect(g35.querySelectorAll('.feeder-cand').length).toBe(4)
    // Neither side names one team, so neither carries a local-time hint.
    for (const t of g35.querySelectorAll('.wc-team')) expect(t.title).toBe('')
  })

  it('opens on the week containing today when the tournament is under way', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    // 8 September falls in the second week of the tournament, not the first.
    expect(document.querySelector('.week-title').textContent).toMatch(/Sep/)
    vi.useRealTimers()
  })

  it('jumps to the day from the single next-game card', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const day = document.createElement('div')
    day.id = 'day-2026-09-04'
    document.body.appendChild(day)
    localStorage.setItem('fwwc:followed', JSON.stringify(['Czechia']))
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    fireEvent.click(document.querySelector('.nm-teams') || document.querySelector('.nextmatch'))
    day.remove()
    expect(document.querySelector('.nextmatch')).toBeTruthy()
  })

  it('says Delayed when the clock has passed but the feed is not ticking', () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Japan']))
    const past = GAMES.map((g) =>
      g.num === 1 ? { ...g, ko: new Date(Date.now() - 30 * 60_000).toISOString() } : g,
    )
    wrap(<NextMatch matches={past} tz={TZ} />)
    expect(document.querySelector('.nm-countdown.delayed').textContent).toMatch(/Delayed/)
  })
})

describe('defensive arms in the last components', () => {
  it('offers a jump button on the single next-game card', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const day = document.createElement('div')
    day.id = 'day-2026-09-04'
    document.body.appendChild(day)
    localStorage.setItem('fwwc:followed', JSON.stringify(['Czechia']))
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    fireEvent.click(document.querySelector('.nm-jump'))
    expect(scroll).toHaveBeenCalled()
    day.remove()
  })

  it('builds a partial route tooltip when a group has no mapped slots', () => {
    // A slot map with nothing in it: the tooltip degrades to the elimination
    // line rather than naming games that do not exist.
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} slotMap={{ A: {} }} clinch={{}} />)
    const title = screen.getByText('Japan').closest('[title]').getAttribute('title')
    expect(title).toMatch(/4th → eliminated/)
    expect(title).not.toMatch(/1st →/)
  })

  it('does nothing when the focused bracket game is not on the page', () => {
    const onFocusHandled = vi.fn()
    const board = resolveBracket(GAMES, {}).filter((g) => g.num !== 31)
    wrap(<Bracket matches={board} tz={TZ} focusMatch={31} onFocusHandled={onFocusHandled} />)
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('projects a "through" team from its current rank when nothing is locked', () => {
    // Two rounds played: the top two are through but unordered, so the
    // projection reads the live table rather than a settled placing.
    const partial = GAMES.map((g) => {
      const scored = { 1: [90, 60], 6: [90, 60], 9: [60, 90], 11: [60, 90] }
      return scored[g.num] ? { ...g, score: scored[g.num] } : g
    })
    const clinch = computeClinch(partial)
    wrap(<Standings matches={partial} tz={TZ} clinch={clinch} />)
    const team = Object.entries(clinch).find(([, v]) => v === 'through')[0]
    const rows = screen.getAllByRole('row', { name: new RegExp(team) })
    fireEvent.click(within(rows[0]).getByTitle(/Show Group . games/))
    // A round is still named, even though nothing is mathematically locked.
    expect(screen.getByText(/Qualification round|Quarter-final/)).toBeInTheDocument()
  })

  it('shows a settled second-placed team its qualification game', () => {
    const board = allGroupsPlayed((g) => g.t1)
    const clinch = computeClinch(board)
    const second = Object.entries(clinch).find(([, v]) => v === 'second')[0]
    wrap(<Standings matches={board} tz={TZ} clinch={clinch} />)
    const rows = screen.getAllByRole('row', { name: new RegExp(second) })
    fireEvent.click(within(rows[0]).getByTitle(/Show Group . games/))
    expect(screen.getByText(/in second place/)).toBeInTheDocument()
  })
})

describe('a team that is not going through', () => {
  it('shows no final-phase section for an eliminated team', () => {
    const board = allGroupsPlayed((g) => g.t1)
    const clinch = computeClinch(board)
    const out = Object.entries(clinch).find(([, v]) => v === 'eliminated')[0]
    wrap(<Standings matches={board} tz={TZ} clinch={clinch} />)
    const rows = screen.getAllByRole('row', { name: new RegExp(out) })
    fireEvent.click(within(rows[0]).getByTitle(/Show Group . games/))
    // The pop-up opens, but with no "qualified for the final phase" block.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/qualified for the final phase/)).not.toBeInTheDocument()
  })

  it('shows no final-phase section while a group is undecided', () => {
    wrap(<Standings matches={GAMES} tz={TZ} clinch={{}} />)
    fireEvent.click(screen.getAllByTitle(/Show Group A games/)[0])
    expect(screen.queryByText(/qualified for the final phase/)).not.toBeInTheDocument()
  })
})
