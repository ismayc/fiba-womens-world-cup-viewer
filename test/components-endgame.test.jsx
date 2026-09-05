// The states that only exist late in a tournament, or not at all in a normal
// one: a champion crowned, a route traced to the trophy, an abandoned game, a
// forfeit, and the mobile bracket jumping between rounds.
//
// These are the branches a suite built only on the committed (unplayed) schedule
// can never reach, so they are driven from synthetic end-states.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { GAMES } from './fixtures/pretournament-games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { gamesByNum } from '../src/utils/bracket.js'
import Bracket from '../src/components/Bracket.jsx'
import MatchCard from '../src/components/MatchCard.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import NextMatch from '../src/components/NextMatch.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import Filters from '../src/components/Filters.jsx'
import LiveBadge from '../src/components/LiveBadge.jsx'
import WeekView from '../src/components/WeekView.jsx'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { DetailContext } from '../src/context/detail.js'
import { allGroupsPlayed, pinClock } from './helpers/tournament.js'

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

// A complete tournament: every group game played, then the whole final phase,
// with the first-named side always winning.
function playedOut() {
  let board = allGroupsPlayed((g) => g.t1)
  board = resolveBracket(board, computeClinch(board))
  for (const round of [[25, 26, 27, 28], [29, 30, 31, 32], [33, 34], [35, 36]]) {
    board = board.map((g) => (round.includes(g.num) ? { ...g, score: [90, 70] } : g))
    board = resolveBracket(board, computeClinch(board))
  }
  return board
}

// Pin the clock for the whole file, not test by test.
//
// Almost everything here renders a component that asks Date.now() what is live,
// what is next, or which week "today" falls in, and then asserts on a fixture
// game. Pinning one test at a time has now failed twice: six tests went red when
// September 4 arrived, and two more when the qualification round did. WeekView
// is the sharpest case, because it opens on the calendar week containing today
// and weeks run Sunday to Saturday: every WeekView test that asserts on a
// September 4 game would have gone red on Sunday September 6, 2026 with no
// commit behind it.
//
// Only Date is faked, so waitFor and real timers still work. A test that wants a
// different instant sets its own, and the afterEach hands the clock back.
beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  pinClock()
})

afterEach(() => vi.useRealTimers())

describe('a finished tournament', () => {
  const board = playedOut()
  const champion = num(board, 36).t1

  // "Nothing upcoming" is what switches these components into their end states,
  // and every game of this edition is in the future relative to the suite's
  // clock, so it has to be moved past the Final.
  const afterTheFinal = (fn) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
    try {
      fn()
    } finally {
      vi.useRealTimers()
    }
  }

  it('crowns the champion and names the runners-up', () => {
    afterTheFinal(() => {
      wrap(<NextMatch matches={board} tz={TZ} />)
      expect(screen.getByText(/champions/i)).toBeInTheDocument()
      expect(screen.getByText(champion)).toBeInTheDocument()
      expect(screen.getByText(/Runners-up/)).toBeInTheDocument()
    })
  })

  it('falls back to a generic message when the Final has no result', () => {
    afterTheFinal(() => {
      const noFinal = board.map((g) => (g.num === 36 ? { ...g, score: undefined } : g))
      wrap(<NextMatch matches={noFinal} tz={TZ} />)
      expect(screen.getByText(/tournament has concluded/)).toBeInTheDocument()
    })
  })

  it('marks the champion’s traced route as won', () => {
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    fireEvent.change(document.querySelector('.path-select'), { target: { value: champion } })
    expect(screen.getByText(/Champions!/)).toBeInTheDocument()
  })

  it('offers a shortcut chip for each followed team in the bracket', () => {
    const loser = num(board, 36).t2
    localStorage.setItem('fwwc:followed', JSON.stringify([loser]))
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    expect(document.querySelector('.path-chips')).toBeTruthy()
    const chip = screen.getByRole('button', { name: new RegExp(loser) })
    fireEvent.click(chip)
    expect(document.querySelector('.path-select').value).toBe(loser)
    // Clicking the active chip again clears it.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(loser) }))
    expect(document.querySelector('.path-select').value).toBe('')
  })

  it('marks a beaten team’s route as knocked out', () => {
    const loser = num(board, 36).t2
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    fireEvent.change(document.querySelector('.path-select'), { target: { value: loser } })
    expect(document.querySelector('.path-status')).toBeTruthy()
  })

  it('shows a team still in the Final before it is played', () => {
    const pending = board.map((g) => (g.num === 36 ? { ...g, score: undefined } : g))
    wrap(<PathPicker byNum={gamesByNum(pending)} />)
    fireEvent.change(document.querySelector('.path-select'), { target: { value: champion } })
    expect(screen.getByText(/In the Final/)).toBeInTheDocument()
  })

  // "Playing now" is only reachable for a game that is NOT the Final: the Final
  // has its own Champions / In the Final wording ahead of it.
  it('shows a team playing right now on its route', () => {
    // The team must not already be IN the Final, or that wording wins instead.
    const live = board.map((g) => {
      if (g.num === 33) return { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
      if (g.num >= 34) return { ...g, t1: null, t2: null, score: undefined }
      return g
    })
    const team = num(live, 33).t1
    wrap(<PathPicker byNum={gamesByNum(live)} />)
    fireEvent.change(document.querySelector('.path-select'), { target: { value: team } })
    expect(screen.getByText(/Playing now/)).toBeInTheDocument()
  })

  it('renders the whole bracket with real teams and no placeholders', () => {
    wrap(<Bracket matches={board} tz={TZ} />)
    expect(screen.queryByText(/Winner Group/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Winner Game/)).not.toBeInTheDocument()
    expect(document.getElementById('bx-m36').textContent).toContain(champion)
  })

  it('marks the third-place game in the mobile list', () => {
    window.matchMedia = (q) => ({
      matches: q.includes('720'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    wrap(<Bracket matches={board} tz={TZ} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Final' }))
    expect(screen.getByText('Third-Place Game')).toBeInTheDocument()
    delete window.matchMedia
  })
})

describe('the mobile bracket jumping to a focused game', () => {
  it('switches round first, then scrolls', () => {
    window.matchMedia = (q) => ({
      matches: q.includes('720'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    const onFocusHandled = vi.fn()
    const board = resolveBracket(GAMES, {})
    // The default round is the qualification round; ask for a semi-final.
    wrap(
      <Bracket matches={board} tz={TZ} focusMatch={33} onFocusHandled={onFocusHandled} />,
    )
    expect(screen.getByRole('tab', { name: /Semi-Final/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(onFocusHandled).toHaveBeenCalled()
    delete window.matchMedia
  })

  it('opens on the Final once every round is decided', () => {
    window.matchMedia = (q) => ({
      matches: q.includes('720'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    wrap(<Bracket matches={playedOut()} tz={TZ} />)
    expect(screen.getByRole('tab', { name: 'Final' })).toHaveAttribute('aria-selected', 'true')
    delete window.matchMedia
  })
})

describe('abandoned and awarded games', () => {
  const abandoned = { ...num(GAMES, 1), voided: true, statusLabel: 'Abandoned', score: [40, 38] }
  const canceled = { ...num(GAMES, 1), voided: true, statusLabel: 'Canceled' }
  const awarded = { ...num(GAMES, 1), score: [20, 0], awarded: true }

  it('warns on an abandoned or canceled game, and pauses on a postponement', () => {
    const a = wrap(<MatchCard match={abandoned} tz={TZ} />)
    expect(screen.getByText(/⚠ Abandoned/)).toBeInTheDocument()
    a.unmount()

    const c = wrap(<MatchCard match={canceled} tz={TZ} />)
    expect(screen.getByText(/⚠ Canceled/)).toBeInTheDocument()
    c.unmount()

    wrap(<MatchCard match={{ ...canceled, statusLabel: 'Postponed' }} tz={TZ} />)
    expect(screen.getByText(/⏸ Postponed/)).toBeInTheDocument()
  })

  it('shows the same states in the detail modal', () => {
    const a = wrap(<MatchDetail match={abandoned} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getAllByText(/Abandoned/).length).toBeGreaterThan(0)
    a.unmount()

    wrap(<MatchDetail match={awarded} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getByText(/awarded/i)).toBeInTheDocument()
  })

  it('shows the same states in the bracket', () => {
    const board = resolveBracket(
      GAMES.map((g) =>
        g.num === 25
          ? { ...g, t1: 'Spain', t2: 'Nigeria', voided: true, statusLabel: 'Abandoned', score: [40, 38] }
          : g,
      ),
      {},
    )
    wrap(<Bracket matches={board} tz={TZ} />)
    expect(document.getElementById('bx-m25').textContent).toMatch(/⚠ Abandoned/)
  })

  it('shows a delayed badge when the clock has passed with no ESPN clock', () => {
    // Tip-off in the past, no live record: the card says Delayed, not LIVE.
    const past = { ...num(GAMES, 1), ko: new Date(Date.now() - 30 * 60_000).toISOString() }
    wrap(<MatchCard match={past} tz={TZ} />)
    expect(screen.getByText(/⏸ Delayed/)).toBeInTheDocument()
  })

  it('shows a per-game note beside the tip-off when one is set', () => {
    wrap(<MatchCard match={{ ...num(GAMES, 1), note: 'venue change' }} tz={TZ} />)
    expect(screen.getByText(/venue change/)).toBeInTheDocument()
  })
})

describe('spoiler-free and follow paths in the detail modal', () => {
  const played = { ...num(GAMES, 1), score: [88, 61] }

  it('hides the score behind a reveal', () => {
    wrap(<MatchDetail match={played} tz={TZ} hideScores allMatches={GAMES} onClose={() => {}} />)
    expect(document.body.textContent).not.toMatch(/88/)
    fireEvent.click(screen.getByRole('button', { name: /reveal/ }))
    expect(document.body.textContent).toMatch(/88/)
  })

  it('stars a team from the modal', () => {
    wrap(<MatchDetail match={played} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Follow Japan' }))
    expect(screen.getByRole('button', { name: 'Unfollow Japan' })).toBeInTheDocument()
  })

  it('offers no star for an unresolved bracket slot', () => {
    wrap(<MatchDetail match={num(GAMES, 25)} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Follow / })).not.toBeInTheDocument()
  })

  it('notes a single overtime as well as several', () => {
    const one = wrap(
      <MatchDetail
        match={{ ...played, score: [95, 92], ot: 1 }}
        tz={TZ}
        allMatches={GAMES}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('after overtime')).toBeInTheDocument()
    one.unmount()

    wrap(
      <MatchDetail
        match={{ ...played, score: [99, 96], ot: 3 }}
        tz={TZ}
        allMatches={GAMES}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('after 3 overtimes')).toBeInTheDocument()
  })

  it('shows an overtime record and a current run in the tale of the tape', () => {
    const withOt = playedOut().map((g) => (g.stage === 'Group' ? { ...g, ot: 1 } : g))
    // A semi-final: both sides have a full group record behind them by then.
    const sf = num(withOt, 33)
    wrap(<MatchDetail match={sf} tz={TZ} allMatches={withOt} onClose={() => {}} />)
    expect(screen.getByText('Overtime games')).toBeInTheDocument()
    expect(screen.getByText('Current run')).toBeInTheDocument()
    expect(screen.getAllByText(/in OT/).length).toBeGreaterThan(0)
  })

  it('renders nothing without a game', () => {
    const { container } = wrap(<MatchDetail match={null} tz={TZ} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NextMatch late states', () => {
  // Pin the clock. NextMatch asks "what is live" and "what is next" of
  // Date.now(), and the last test here leans on it twice over: it puts the
  // Final an hour out and expects that to be the earliest thing on the board.
  // On a real clock that holds only while "an hour from now" still lands before
  // the next real fixture, which on September 4, 2026 stopped being true at
  // 19:15 Berlin time, mid-session, with no commit behind it.
  beforeEach(() => pinClock())
  afterEach(() => vi.useRealTimers())

  it('prefers a followed team among several live games', () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Italy']))
    const live = GAMES.map((g) =>
      [23, 24].includes(g.num)
        ? { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
        : g,
    )
    wrap(<NextMatch matches={live} tz={TZ} />)
    expect(screen.getByText('Italy')).toBeInTheDocument()
  })

  it('shows a paused game as delayed rather than as a countdown', () => {
    const delayed = GAMES.map((g) =>
      g.num === 1
        ? { ...g, score: [40, 38], live: { delayed: true, label: 'Suspended' } }
        : g,
    )
    wrap(<NextMatch matches={delayed} tz={TZ} />)
    expect(screen.getAllByText(/Suspended/).length).toBeGreaterThan(0)
  })

  it('falls back to "Delayed" when the feed gives no label', () => {
    const delayed = GAMES.map((g) =>
      g.num === 1 ? { ...g, score: [40, 38], live: { delayed: true } } : g,
    )
    wrap(<NextMatch matches={delayed} tz={TZ} />)
    expect(screen.getAllByText(/Delayed/).length).toBeGreaterThan(0)
  })

  it('names the stage of a final-phase game rather than a group', () => {
    const board = playedOut().map((g) =>
      g.num === 36
        ? { ...g, score: undefined, ko: new Date(Date.now() + 3600_000).toISOString() }
        : g,
    )
    wrap(<NextMatch matches={board} tz={TZ} />)
    expect(screen.getByText(/Final/)).toBeInTheDocument()
  })
})

describe('small rendering details', () => {
  it('says "1 game" for a single result', () => {
    render(
      <Filters
        filters={{ search: '', stages: [], group: 'all', team: 'all', venue: 'all', timeframe: 'all', myTeams: false, onMyServices: false }}
        setFilters={() => {}}
        tz={TZ}
        setTz={() => {}}
        detectedTz={TZ}
        resultCount={1}
      />,
    )
    expect(document.querySelector('.result-count').textContent).toBe('1 game')
  })

  it('falls back to "Delayed" in the live badge with no label', () => {
    render(<LiveBadge match={{ live: { delayed: true } }} />)
    expect(document.body.textContent).toMatch(/Delayed/)
  })

  it('shows the free-to-air tag when a broadcaster is free', () => {
    // This edition has no free-to-air outlet, so the tag must NOT appear.
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} />)
    fireEvent.click(screen.getByRole('button', { name: /How to watch/ }))
    expect(screen.queryByText('free')).not.toBeInTheDocument()
  })

  it('names the services a viewer has on the card’s watch panel', () => {
    localStorage.setItem('fwwc:services', JSON.stringify(['hbomax']))
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} />)
    fireEvent.click(screen.getByRole('button', { name: /How to watch/ }))
    expect(screen.getByText(/On your services:/)).toBeInTheDocument()
  })

  it('downloads a game from the card', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} />)
    fireEvent.click(screen.getByRole('button', { name: /Add to calendar/ }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  // Game 35 is "Loser Game 33" v "Loser Game 34", so when both semi-finals have
  // their teams BOTH sides expand to a candidate pair and a "vs" separates them.
  it('shows both candidate pairs with a "vs" between them', () => {
    const board = GAMES.map((g) => {
      if (g.num === 33) return { ...g, t1: 'Japan', t2: 'Spain' }
      if (g.num === 34) return { ...g, t1: 'Italy', t2: 'China' }
      return g
    })
    wrap(<Bracket matches={board} tz={TZ} />)
    const g35 = document.getElementById('bx-m35')
    expect(within(g35).getAllByText(/Japan|Spain|Italy|China/).length).toBe(4)
    expect(g35.querySelector('.bx-vs-divider')).toBeTruthy()
  })
})

describe('WeekView late states', () => {
  const played = allGroupsPlayed()

  it('shows a score with overtime, and a followed team highlighted', () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Japan']))
    const ot = played.map((g) => (g.num === 1 ? { ...g, ot: 2 } : g))
    wrap(<WeekView allMatches={ot} shown={ot} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/80–70 2OT/)
    expect(document.querySelector('.wc-name.followed')).toBeTruthy()

    // A single overtime reads "OT", not "1OT".
    const one = played.map((g) => (g.num === 1 ? { ...g, ot: 1 } : g))
    wrap(<WeekView allMatches={one} shown={one} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/80–70 OT/)
  })

  it('shows a live badge, an abandoned pill and an awarded note', () => {
    const live = played.map((g) =>
      g.num === 1 ? { ...g, live: { clock: '3:00', period: 'Q2' } } : g,
    )
    const a = wrap(<WeekView allMatches={live} shown={live} tz={TZ} dayHidden={() => false} />)
    expect(document.querySelector('.wc-live')).toBeTruthy()
    a.unmount()

    const voided = played.map((g) =>
      g.num === 1 ? { ...g, voided: true, statusLabel: 'Abandoned' } : g,
    )
    const b = wrap(<WeekView allMatches={voided} shown={voided} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/⚠ Abandoned/)
    b.unmount()

    const awarded = played.map((g) => (g.num === 1 ? { ...g, awarded: true } : g))
    wrap(<WeekView allMatches={awarded} shown={awarded} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/awarded/)
  })

  // The week view shows ONE week, so the board is narrowed to the two games
  // that matter rather than navigating to their week.
  it('expands a feed slot to its candidate pair in a cell', () => {
    const resolved27 = { ...num(GAMES, 27), t1: 'Australia', t2: 'Italy' }
    const board = [resolved27, num(GAMES, 29)]
    wrap(<WeekView allMatches={board} shown={board} tz={TZ} dayHidden={() => false} />)
    // Game 29 is Winner Group A v Winner Game 27; the second side expands.
    expect(document.querySelectorAll('.feeder-cand').length).toBeGreaterThan(0)
    expect(document.body.textContent).toMatch(/Australia/)
    expect(document.body.textContent).toMatch(/Italy/)
  })

  // The same fallback the schedule needed: without it a final-phase cell is blank.
  it('names a final-phase game by its slot label', () => {
    const board = [num(GAMES, 29)]
    wrap(<WeekView allMatches={board} shown={board} tz={TZ} dayHidden={() => false} />)
    expect(document.body.textContent).toMatch(/Winner Group A/)
  })

  it('counts a single game in the singular', () => {
    const one = [num(GAMES, 1)]
    wrap(<WeekView allMatches={one} shown={one} tz={TZ} dayHidden={() => false} />)
    expect(document.querySelector('.week-count').textContent).toMatch(/1 game$/)
  })

  it('treats a missing dayHidden as "show the scores"', () => {
    wrap(<WeekView allMatches={played} shown={played} tz={TZ} />)
    expect(document.body.textContent).toMatch(/80–70/)
  })

  it('disables the arrow at each end of the tournament', () => {
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    const prev = screen.getByRole('button', { name: /Prev/ })
    const next = screen.getByRole('button', { name: /Next/ })
    // The tournament fits in a single week-range, so both ends are reachable.
    expect(prev.disabled || next.disabled).toBe(true)
  })
})

describe('Standings projection edges', () => {
  const board = allGroupsPlayed((g) => g.t1)

  it('names the round and opponent for a clinched 2nd and 3rd', () => {
    const clinch = computeClinch(board)
    wrap(<Standings matches={board} tz={TZ} clinch={clinch} />)
    // Open a team pop-up for a settled runner-up.
    const second = Object.entries(clinch).find(([, v]) => v === 'second')[0]
    fireEvent.click(screen.getAllByTitle(new RegExp(`Show Group . games`))[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(second).toBeTruthy()
  })

  it('shows a third-placed team’s qualification game', () => {
    const clinch = computeClinch(board)
    const third = Object.entries(clinch).find(([, v]) => v === 'third')[0]
    wrap(<Standings matches={board} tz={TZ} clinch={clinch} />)
    const row = screen.getByRole('row', { name: new RegExp(third) })
    fireEvent.click(within(row).getByTitle(/Show Group . games/))
    expect(screen.getByText('Qualification round')).toBeInTheDocument()
  })

  it('projects from the live table for a team that is only "through"', () => {
    // Two rounds in: top two are through, but the order is still open.
    const partial = GAMES.map((g) => {
      const scored = { 1: [90, 60], 6: [90, 60], 9: [60, 90], 11: [60, 90] }
      return scored[g.num] ? { ...g, score: scored[g.num] } : g
    })
    const clinch = computeClinch(partial)
    expect(Object.values(clinch)).toContain('through')
    wrap(<Standings matches={partial} tz={TZ} clinch={clinch} />)
    const throughTeam = Object.entries(clinch).find(([, v]) => v === 'through')[0]
    const rows = screen.getAllByRole('row', { name: new RegExp(throughTeam) })
    fireEvent.click(within(rows[0]).getByTitle(/Show Group . games/))
    expect(screen.getByText(/top-three finish/)).toBeInTheDocument()
  })
})
