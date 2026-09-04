// Component INTERACTION: the branches a render-only test never reaches — stars,
// pop-ups, spoiler reveals, live badges, the path picker, and the paths that only
// appear once a game is live, paused, voided or awarded.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { GAMES } from './fixtures/pretournament-games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { gamesByNum, groupSlotMap } from '../src/utils/bracket.js'
import Standings from '../src/components/Standings.jsx'
import Bracket from '../src/components/Bracket.jsx'
import MatchCard from '../src/components/MatchCard.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import WeekView from '../src/components/WeekView.jsx'
import NextMatch from '../src/components/NextMatch.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import LiveBadge from '../src/components/LiveBadge.jsx'
import CalendarModal from '../src/components/CalendarModal.jsx'
import DayMatchesModal from '../src/components/DayMatchesModal.jsx'
import ServicesModal from '../src/components/ServicesModal.jsx'
import Filters from '../src/components/Filters.jsx'
import FeederPair from '../src/components/FeederPair.jsx'
import ScoreToasts, { TOAST_MS } from '../src/components/ScoreToasts.jsx'
import { matchesSearch, parseQuery } from '../src/utils/search.js'
import { venueFor } from '../src/utils/venue.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { DetailContext } from '../src/context/detail.js'
import { BEFORE_TIPOFF, pinClock, withGroupScores, allGroupsPlayed } from './helpers/tournament.js'

const TZ = 'Europe/Berlin'
const num = (games, n) => games.find((g) => g.num === n)
const byNum = gamesByNum(GAMES)
const slotMap = groupSlotMap(GAMES)

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

const DECISIVE = [
  ['Japan', 'Mali', 90, 60],
  ['Japan', 'Spain', 90, 60],
  ['Germany', 'Japan', 60, 90],
  ['Spain', 'Germany', 80, 70],
  ['Mali', 'Spain', 60, 80],
  ['Germany', 'Mali', 80, 70],
]
const PLAYED = withGroupScores('A', DECISIVE, GAMES)

beforeEach(() => localStorage.clear())

describe('Standings interaction', () => {
  it('stars and unstars a team from the table', () => {
    wrap(<Standings matches={GAMES} tz={TZ} clinch={{}} />)
    const star = screen.getByRole('button', { name: 'Follow Japan' })
    fireEvent.click(star)
    expect(screen.getByRole('button', { name: 'Unfollow Japan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow Japan' }))
    expect(screen.getByRole('button', { name: 'Follow Japan' })).toBeInTheDocument()
  })

  it('opens a group pop-up from the group title and from a team name', () => {
    wrap(<Standings matches={PLAYED} tz={TZ} clinch={computeClinch(PLAYED)} />)
    fireEvent.click(screen.getByTitle(/Show all Group A games/))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getAllByTitle(/Show Group A games/)[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hides the tables behind a reveal in spoiler-free mode', () => {
    wrap(<Standings matches={PLAYED} tz={TZ} hideScores clinch={computeClinch(PLAYED)} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }))
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
  })

  it('toggles the "as it stands" panel and remembers the choice', () => {
    wrap(<Standings matches={PLAYED} tz={TZ} clinch={computeClinch(PLAYED)} />)
    const toggle = screen.getByRole('button', { name: /As it stands/ })
    expect(screen.getAllByText('As it stands → final phase').length).toBeGreaterThan(0)
    fireEvent.click(toggle)
    expect(screen.queryByText('As it stands → final phase')).not.toBeInTheDocument()
    expect(localStorage.getItem('fwwc:asItStands')).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /As it stands/ }))
    expect(localStorage.getItem('fwwc:asItStands')).toBe('1')
  })

  it('starts with the panel hidden when that was the saved choice', () => {
    localStorage.setItem('fwwc:asItStands', '0')
    wrap(<Standings matches={PLAYED} tz={TZ} clinch={computeClinch(PLAYED)} />)
    expect(screen.queryByText('As it stands → final phase')).not.toBeInTheDocument()
  })

  it('jumps to the bracket from a projected slot', () => {
    const onGoToMatch = vi.fn()
    wrap(
      <Standings
        matches={PLAYED}
        tz={TZ}
        clinch={computeClinch(PLAYED)}
        onGoToMatch={onGoToMatch}
      />,
    )
    fireEvent.click(screen.getAllByTitle(/Show Game \d+ on the Bracket/)[0])
    expect(onGoToMatch).toHaveBeenCalled()
  })

  it('shows the game number as plain text when there is nowhere to jump', () => {
    wrap(<Standings matches={PLAYED} tz={TZ} clinch={computeClinch(PLAYED)} />)
    expect(screen.queryByTitle(/on the Bracket/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/^G\d+$/).length).toBeGreaterThan(0)
  })

  it('marks a group as live, and as paused when a game is delayed', () => {
    const live = PLAYED.map((g) =>
      g.num === 1 ? { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } } : g,
    )
    const { unmount } = wrap(<Standings matches={live} tz={TZ} clinch={{}} />)
    expect(screen.getByText(/LIVE/)).toBeInTheDocument()
    unmount()

    const paused = PLAYED.map((g) =>
      g.num === 1
        ? { ...g, score: [40, 38], live: { delayed: true, label: 'Suspended' } }
        : g,
    )
    wrap(<Standings matches={paused} tz={TZ} clinch={{}} />)
    expect(screen.getByText(/SUSPENDED/)).toBeInTheDocument()
  })

  it('marks a placing that only a drawing of lots could settle', () => {
    // The three-way total tie from the rules tests.
    const lots = withGroupScores(
      'A',
      [
        ['Japan', 'Spain', 80, 70],
        ['Spain', 'Germany', 80, 70],
        ['Germany', 'Japan', 80, 70],
        ['Japan', 'Mali', 90, 60],
        ['Mali', 'Spain', 60, 90],
        ['Germany', 'Mali', 90, 60],
      ],
      GAMES,
    )
    wrap(<Standings matches={lots} tz={TZ} clinch={computeClinch(lots)} />)
    expect(document.querySelectorAll('.tiebreak-mark').length).toBeGreaterThan(0)
  })

  it('shows the qualification badge for a settled group with no clinch verdict', () => {
    wrap(<Standings matches={PLAYED} tz={TZ} clinch={{}} />)
    expect(screen.getAllByTitle(/bye straight to the quarter-finals/).length).toBeGreaterThan(0)
    expect(screen.getAllByTitle(/Advances to the qualification round/).length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('Eliminated').length).toBeGreaterThan(0)
  })
})

describe('Bracket interaction', () => {
  const board = resolveBracket(GAMES, {})

  it('opens a game with the keyboard as well as the mouse', () => {
    const onDetail = vi.fn()
    wrap(<Bracket matches={board} tz={TZ} />, { onDetail })
    const card = document.getElementById('bx-m29')
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'x' })
    expect(onDetail).toHaveBeenCalledTimes(2)
  })

  it('shows a score, overtime and the venue once a game is played', () => {
    const played = resolveBracket(
      GAMES.map((g) =>
        g.num === 25
          ? { ...g, t1: 'Spain', t2: 'Nigeria', score: [95, 92], ot: 2, venue: 'berlinarena' }
          : g,
      ),
      {},
    )
    wrap(<Bracket matches={played} tz={TZ} />)
    const g25 = document.getElementById('bx-m25')
    expect(g25.textContent).toMatch(/95–92/)
    expect(g25.textContent).toMatch(/2OT/)
  })

  it('hides the score in spoiler-free mode', () => {
    const played = resolveBracket(
      GAMES.map((g) => (g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria', score: [90, 80] } : g)),
      {},
    )
    wrap(<Bracket matches={played} tz={TZ} hideScores />)
    expect(document.getElementById('bx-m25').textContent).not.toMatch(/90–80/)
  })

  it('shows a live badge and a voided pill', () => {
    const live = resolveBracket(
      GAMES.map((g) =>
        g.num === 25
          ? { ...g, t1: 'Spain', t2: 'Nigeria', score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
          : g,
      ),
      {},
    )
    const { unmount } = wrap(<Bracket matches={live} tz={TZ} />)
    expect(document.getElementById('bx-m25').textContent).toMatch(/3:00|Q2/)
    unmount()

    const voided = resolveBracket(
      GAMES.map((g) =>
        g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria', voided: true, statusLabel: 'Canceled' } : g,
      ),
      {},
    )
    wrap(<Bracket matches={voided} tz={TZ} />)
    expect(document.getElementById('bx-m25').textContent).toMatch(/Canceled/)
  })

  it('scrolls a focused game into view and flashes it', () => {
    vi.useFakeTimers()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const onFocusHandled = vi.fn()
    wrap(<Bracket matches={board} tz={TZ} focusMatch={31} onFocusHandled={onFocusHandled} />)
    expect(scroll).toHaveBeenCalled()
    expect(document.getElementById('bx-m31').classList.contains('bx-focus')).toBe(true)
    act(() => vi.advanceTimersByTime(2500))
    expect(document.getElementById('bx-m31').classList.contains('bx-focus')).toBe(false)
    expect(onFocusHandled).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does nothing when no game is focused', () => {
    const onFocusHandled = vi.fn()
    wrap(<Bracket matches={board} tz={TZ} focusMatch={null} onFocusHandled={onFocusHandled} />)
    expect(onFocusHandled).not.toHaveBeenCalled()
  })

  it('switches to the round-at-a-time layout on a narrow screen', () => {
    window.matchMedia = (q) => ({
      matches: q.includes('720'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    wrap(<Bracket matches={board} tz={TZ} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Qual', 'QF', 'SF', '🏆 Final'])
    fireEvent.click(screen.getByRole('tab', { name: /Semi-Final/ }))
    expect(screen.getByRole('tab', { name: /Semi-Final/ })).toHaveAttribute('aria-selected', 'true')
    delete window.matchMedia
  })

  it('highlights a traced route, and marks where the team went out', () => {
    const board2 = resolveBracket(
      GAMES.map((g) => {
        if (g.num === 25) return { ...g, t1: 'Spain', t2: 'Nigeria', score: [90, 80] }
        if (g.num === 31) return { ...g, t1: 'Australia', t2: 'Spain', score: [95, 60] }
        return g
      }),
      {},
    )
    wrap(
      <>
        <PathPicker byNum={gamesByNum(board2)} />
        <Bracket matches={board2} tz={TZ} />
      </>,
    )
    fireEvent.change(document.querySelector('.path-select'), { target: { value: 'Spain' } })
    expect(document.querySelectorAll('.on-path').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.path-exit').length).toBe(1)
  })
})

describe('PathPicker interaction', () => {
  const board = resolveBracket(
    GAMES.map((g) => (g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria' } : g)),
    {},
  )

  it('clears a traced route', () => {
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    const select = document.querySelector('.path-select')
    fireEvent.change(select, { target: { value: 'Spain' } })
    expect(select.value).toBe('Spain')
    const clear = document.querySelector('.path-clear')
    fireEvent.click(clear)
    expect(document.querySelector('.path-select').value).toBe('')
  })
})

describe('MatchCard interaction', () => {
  it('expands and collapses the how-to-watch panel', () => {
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    const toggle = screen.getByRole('button', { name: /How to watch/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/This game:/)).toBeInTheDocument()
  })

  it('stars a team from a card', () => {
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    fireEvent.click(screen.getByRole('button', { name: 'Follow Japan' }))
    expect(screen.getByRole('button', { name: 'Unfollow Japan' })).toBeInTheDocument()
  })

  it('opens the detail modal', () => {
    const onDetail = vi.fn()
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} byNum={byNum} slotMap={slotMap} />, { onDetail })
    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    expect(onDetail).toHaveBeenCalled()
  })

  it('reveals a hidden score on tap in spoiler-free mode', () => {
    const played = { ...num(GAMES, 1), score: [88, 61] }
    wrap(<MatchCard match={played} tz={TZ} hidden byNum={byNum} slotMap={slotMap} />)
    expect(screen.queryByText('88')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }))
    expect(document.querySelector('.score').textContent.replace(/\s/g, '')).toBe('88–61')
  })

  it('shows a live badge, a delayed badge and a voided pill', () => {
    const live = { ...num(GAMES, 1), score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
    const { unmount } = wrap(<MatchCard match={live} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(document.body.textContent).toMatch(/Q2|3:00/)
    unmount()

    const voided = { ...num(GAMES, 1), voided: true, statusLabel: 'Postponed' }
    const second = wrap(<MatchCard match={voided} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText(/Postponed/)).toBeInTheDocument()
    second.unmount()

    const awarded = { ...num(GAMES, 1), score: [20, 0], awarded: true }
    wrap(<MatchCard match={awarded} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText(/awarded/i)).toBeInTheDocument()
  })

  // A final-phase game carries null teams; the card must fall back to the slot
  // LABEL, or the whole final phase renders with blank team names.
  it('names a final-phase game by its slot label', () => {
    wrap(<MatchCard match={num(GAMES, 29)} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText('Winner Group A')).toBeInTheDocument()
    expect(screen.getByText('Winner Game 27')).toBeInTheDocument()
  })

  it('shows a candidate pair once the feeding game has both teams', () => {
    const resolved = gamesByNum(
      GAMES.map((g) => (g.num === 27 ? { ...g, t1: 'Australia', t2: 'Italy' } : g)),
    )
    wrap(<MatchCard match={num(GAMES, 29)} tz={TZ} byNum={resolved} slotMap={slotMap} />)
    expect(screen.getByText('Australia')).toBeInTheDocument()
    expect(screen.getByText('Italy')).toBeInTheDocument()
  })

  it('badges a clinched team on the card', () => {
    wrap(
      <MatchCard
        match={num(GAMES, 1)}
        tz={TZ}
        byNum={byNum}
        slotMap={slotMap}
        clinch={{ Japan: 'won-group', Mali: 'eliminated' }}
      />,
    )
    expect(screen.getByText(/Won group/)).toBeInTheDocument()
    expect(screen.getByText(/Eliminated/)).toBeInTheDocument()
  })
})

describe('MatchDetail interaction', () => {
  it('closes on the button, the backdrop and Escape', () => {
    const onClose = vi.fn()
    wrap(<MatchDetail match={num(GAMES, 1)} tz={TZ} allMatches={GAMES} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('reveals the tale of the tape in spoiler-free mode', () => {
    const board = resolveBracket(
      PLAYED.map((g) => (g.num === 29 ? { ...g, t1: 'Japan', t2: 'Spain' } : g)),
      {},
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
    fireEvent.click(screen.getByRole('button', { name: /reveal team records/ }))
    expect(screen.getByText('W–L')).toBeInTheDocument()
  })

  it('downloads the game as a calendar file', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    wrap(<MatchDetail match={num(GAMES, 1)} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Add to calendar/ }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  it('shows the score and a live badge when there is one', () => {
    const live = { ...num(GAMES, 1), score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
    wrap(<MatchDetail match={live} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(document.body.textContent).toMatch(/40/)
    expect(document.body.textContent).toMatch(/Q2|3:00/)
  })
})

describe('WeekView interaction', () => {
  it('opens a day pop-up and moves between weeks', () => {
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    const dayBtn = screen.getAllByRole('button', { name: /Show all \d+ games? on/ })[0]
    fireEvent.click(dayBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: /Prev/ }))
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
  })

  it('opens a single game straight from a cell', () => {
    const onDetail = vi.fn()
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />, { onDetail })
    const cell = document.querySelector('.week-cell')
    fireEvent.click(cell)
    expect(onDetail).toHaveBeenCalled()
  })

  it('hides a day’s scores when the day is spoiler-hidden', () => {
    const played = allGroupsPlayed()
    wrap(<WeekView allMatches={played} shown={played} tz={TZ} dayHidden={() => true} />)
    expect(document.body.textContent).not.toMatch(/80–70/)
  })
})

describe('NextMatch interaction', () => {
  // What this panel shows is a function of the clock, so pin it: on a real
  // clock these tests describe a different panel every hour of the tournament,
  // and three of them went red on September 4, 2026 with no commit behind them.
  beforeEach(() => pinClock())
  afterEach(() => vi.useRealTimers())

  it('jumps to the day of the next game', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const day = document.createElement('div')
    day.id = 'day-2026-09-04'
    document.body.appendChild(day)
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    fireEvent.click(document.querySelector('.nm-live-row'))
    expect(scroll).toHaveBeenCalled()
    day.remove()
  })

  it('promotes a followed team’s game to a single card', () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Czechia']))
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    expect(document.querySelector('.nm-label').textContent).toMatch(/Your next game/)
    expect(screen.getByText('Czechia')).toBeInTheDocument()
  })

  it('shows a live game ahead of the countdown', () => {
    const live = GAMES.map((g) =>
      g.num === 1 ? { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } } : g,
    )
    wrap(<NextMatch matches={live} tz={TZ} />)
    expect(document.querySelector('.nm-label').textContent).toMatch(/Live now/)
  })

  it('stacks several live games', () => {
    const live = GAMES.map((g) =>
      [21, 22].includes(g.num)
        ? { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
        : g,
    )
    wrap(<NextMatch matches={live} tz={TZ} />)
    expect(document.querySelector('.nm-label').textContent).toMatch(/2 games/)
  })

  it('ticks the countdown', () => {
    // This one drives the interval as well as the clock, so it fakes everything
    // rather than using pinClock's Date-only mode.
    vi.useFakeTimers({ now: BEFORE_TIPOFF })
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    const before = document.querySelector('.nm-countdown').textContent
    act(() => vi.advanceTimersByTime(2000))
    expect(document.querySelector('.nm-countdown').textContent).not.toBe(before)
    vi.useRealTimers()
  })
})

describe('LiveBadge', () => {
  // A basketball clock counts DOWN and resets each quarter, so "7:32" alone is
  // ambiguous. The period is what makes the badge mean anything.
  it('leads with the period, then the clock', () => {
    const { unmount } = render(<LiveBadge match={{ live: { clock: '7:32', period: 'Q3' } }} />)
    expect(document.querySelector('.badge-live').textContent).toContain('Q3')
    expect(document.querySelector('.badge-live').textContent).toContain('7:32')
    expect(document.querySelector('.badge-live')).toHaveAttribute('aria-label', 'Live, Q3 · 7:32')
    unmount()

    const clockOnly = render(<LiveBadge match={{ live: { clock: '7:32' } }} />)
    expect(document.querySelector('.badge-live').textContent).toMatch(/7:32/)
    clockOnly.unmount()

    const periodOnly = render(<LiveBadge match={{ live: { period: 'OT' } }} />)
    expect(document.querySelector('.badge-live').textContent).toMatch(/OT/)
    periodOnly.unmount()

    const paused = render(<LiveBadge match={{ live: { delayed: true, label: 'Delayed' } }} />)
    expect(document.body.textContent).toMatch(/Delayed/)
    paused.unmount()

    render(<LiveBadge match={{ live: {} }} />)
    expect(document.querySelector('.badge-live').textContent).toMatch(/LIVE/)
  })

  it('renders nothing for a game that is not live', () => {
    const { container } = render(<LiveBadge match={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CalendarModal and DayMatchesModal', () => {
  it('exports each calendar variant', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    localStorage.setItem('fwwc:followed', JSON.stringify(['Japan']))
    wrap(<CalendarModal matches={GAMES} filtered={GAMES.slice(0, 5)} onClose={() => {}} />)
    for (const b of screen.getAllByRole('button')) {
      if (/download|\.ics|all|filtered|my teams/i.test(b.textContent)) fireEvent.click(b)
    }
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  it('opens a game from the day pop-up', () => {
    const onDetail = vi.fn()
    const day = GAMES.filter((g) => g.ko?.startsWith('2026-09-04'))
    wrap(<DayMatchesModal matches={day} tz={TZ} byNum={byNum} onClose={() => {}} />, { onDetail })
    fireEvent.click(document.querySelector('.gg-row') || screen.getAllByRole('button')[1])
    expect(onDetail).toHaveBeenCalled()
  })
})

describe('ServicesModal interaction', () => {
  it('ticks a service, shows the coverage it buys, and clears', () => {
    wrap(<ServicesModal onClose={() => {}} />)
    expect(screen.getByText(/Nothing selected/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /HBO Max/ }))
    expect(screen.getByText(/You can watch/)).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(screen.getByText(/Nothing selected/)).toBeInTheDocument()
  })

  it('closes on Done, the backdrop and Escape', () => {
    const onClose = vi.fn()
    wrap(<ServicesModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(document.querySelector('.md-overlay'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('does not close when the dialog itself is clicked', () => {
    const onClose = vi.fn()
    wrap(<ServicesModal onClose={onClose} />)
    fireEvent.click(document.querySelector('.svc-modal'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Filters interaction', () => {
  const setup = (overrides = {}) => {
    const setFilters = vi.fn()
    const setTz = vi.fn()
    const filters = {
      search: '',
      stages: [],
      group: 'all',
      team: 'all',
      venue: 'all',
      timeframe: 'all',
      myTeams: false,
      onMyServices: false,
      ...overrides,
    }
    const view = wrap(
      <Filters
        filters={filters}
        setFilters={setFilters}
        tz={TZ}
        setTz={setTz}
        detectedTz={TZ}
        resultCount={36}
      />,
    )
    return { setFilters, setTz, filters, ...view }
  }

  it('opens the search box, types, and closes it clearing the query', () => {
    const { setFilters } = setup()
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'japan' } })
    expect(setFilters).toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Hide search'))
    // Closing resets the query, so a hidden box never keeps filtering silently.
    const last = setFilters.mock.calls.at(-1)[0]
    expect(typeof last === 'function' ? last({}) : last).toMatchObject({ search: '' })
  })

  // The placeholder is guidance the user will copy. The inherited one named a
  // team and a city from the football sibling, neither of which exists here.
  it('suggests a team and an arena that this edition actually has', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const placeholder = screen.getByRole('searchbox').getAttribute('placeholder')
    expect(placeholder).toContain('Japan')
    expect(placeholder).not.toMatch(/Norway|Sydney/)
    // And whatever it suggests must actually return games.
    for (const q of placeholder.match(/"([^"]+)"/g).map((m) => m.slice(1, -1))) {
      expect(
        GAMES.filter((g) => matchesSearch(g, venueFor(g), parseQuery(q))).length,
        q,
      ).toBeGreaterThan(0)
    }
  })

  it('fills the box from an example chip', () => {
    const { setFilters } = setup()
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const chip = screen.getByRole('button', { name: 'team: Japan' })
    fireEvent.click(chip)
    const last = setFilters.mock.calls.at(-1)[0]
    expect(typeof last === 'function' ? last({}) : last).toMatchObject({ search: 'team: Japan' })
  })

  it('toggles a stage chip on and off', () => {
    const on = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Quarter-Final' }))
    expect(on.setFilters.mock.calls.at(-1)[0]({ stages: [] })).toMatchObject({ stages: ['QF'] })
    on.unmount()

    const off = setup({ stages: ['QF'] })
    fireEvent.click(screen.getByRole('button', { name: 'Quarter-Final' }))
    expect(off.setFilters.mock.calls.at(-1)[0]({ stages: ['QF'] })).toMatchObject({ stages: [] })
  })

  it('changes the timezone', () => {
    const { setTz } = setup()
    const tzSelect = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.value === 'Europe/Berlin'),
    )
    fireEvent.change(tzSelect, { target: { value: 'Asia/Tokyo' } })
    expect(setTz).toHaveBeenCalledWith('Asia/Tokyo')
  })

  it('resets every filter at once', () => {
    const { setFilters } = setup({ group: 'A', team: 'Japan', stages: ['QF'] })
    fireEvent.click(screen.getByRole('button', { name: /reset|clear/i }))
    const arg = setFilters.mock.calls.at(-1)[0]
    expect(arg).toMatchObject({ group: 'all', team: 'all', venue: 'all', stages: [] })
    // The reset shape must not resurrect a filter this edition removed.
    expect(arg).not.toHaveProperty('region')
    expect(arg).not.toHaveProperty('country')
    expect(arg).not.toHaveProperty('feed')
  })

  it('picks a team and an arena', () => {
    const { setFilters } = setup()
    const teamSelect = [...document.querySelectorAll('.field')]
      .find((f) => f.textContent.startsWith('Team'))
      .querySelector('select')
    fireEvent.change(teamSelect, { target: { value: 'Japan' } })
    expect(setFilters).toHaveBeenCalled()

    const arenaSelect = [...document.querySelectorAll('.field')]
      .find((f) => f.textContent.startsWith('Arena'))
      .querySelector('select')
    expect([...arenaSelect.options].map((o) => o.textContent)).toEqual([
      'Both arenas',
      'Berlin Arena',
      'Max-Schmeling-Halle',
    ])
    fireEvent.change(arenaSelect, { target: { value: 'berlinarena' } })
    expect(setFilters).toHaveBeenCalled()
  })

  it('offers every stage this edition plays as a chip', () => {
    setup()
    for (const label of [
      'Group Phase',
      'Qualification to Quarter-Finals',
      'Quarter-Final',
      'Semi-Final',
      'Third-Place Game',
      'Final',
    ]) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })
})

describe('FeederPair', () => {
  it('highlights a followed candidate', () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Australia']))
    wrap(<FeederPair feeder={{ a: 'Australia', b: 'Italy', kind: 'Winner', num: 27 }} />)
    const followed = document.querySelector('.feeder-cand.followed')
    expect(followed).toBeTruthy()
    expect(followed.textContent).toContain('Australia')
  })

  it('falls back to a dot for a name with no flag', () => {
    wrap(<FeederPair feeder={{ a: 'Narnia', b: 'Italy', kind: 'Winner', num: 27 }} />)
    expect(document.querySelector('.feeder-flag').textContent).toBe('•')
  })
})

describe('ScoreToasts auto-dismiss', () => {
  it('dismisses itself after the timeout', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const game = { num: 1, t1: 'Japan', t2: 'Mali', score: [88, 61] }
    render(
      <ScoreToasts items={[{ id: 'final|1', ev: { game } }]} onOpen={() => {}} onDismiss={onDismiss} />,
    )
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(TOAST_MS + 100))
    expect(onDismiss).toHaveBeenCalledWith('final|1')
    vi.useRealTimers()
  })

  it('shows only the most recent few when several land at once', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `final|${i}`,
      ev: { game: { num: i, t1: 'Japan', t2: 'Mali', score: [88, 61] } },
    }))
    render(<ScoreToasts items={items} onOpen={() => {}} onDismiss={() => {}} />)
    expect(document.querySelectorAll('.goal-toast')).toHaveLength(4)
  })
})
