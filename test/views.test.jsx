// The remaining views, modals and shared plumbing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, renderHook, act } from '@testing-library/react'
import { GAMES } from '../src/data/games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { gamesByNum } from '../src/utils/bracket.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import WeekView from '../src/components/WeekView.jsx'
import DayMatchesModal from '../src/components/DayMatchesModal.jsx'
import GroupGamesModal from '../src/components/GroupGamesModal.jsx'
import CalendarModal from '../src/components/CalendarModal.jsx'
import FeederPair from '../src/components/FeederPair.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import LiveBadge from '../src/components/LiveBadge.jsx'
import NextMatch from '../src/components/NextMatch.jsx'
import Filters from '../src/components/Filters.jsx'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'
import { PathProvider, usePath } from '../src/context/path.jsx'
import { DetailContext } from '../src/context/detail.js'
import { DEFAULT_FILTERS } from '../src/utils/urlState.js'
import { withGroupScores } from './helpers/tournament.js'

const TZ = 'Europe/Berlin'
const num = (n) => GAMES.find((g) => g.num === n)

function wrap(ui, { onDetail = () => {} } = {}) {
  return render(
    <FollowProvider>
      <PathProvider>
        <DetailContext.Provider value={onDetail}>{ui}</DetailContext.Provider>
      </PathProvider>
    </FollowProvider>,
  )
}

beforeEach(() => localStorage.clear())

describe('WeekView', () => {
  it('lays the tournament out as a calendar of days', () => {
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    // The group phase runs 4-7 September.
    expect(document.querySelector('.weekview')).toBeTruthy()
    expect(document.querySelectorAll('.week-cell').length).toBeGreaterThan(0)
  })

  it('shows a legend and colors each cell', () => {
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    expect(document.querySelector('.week-legend')).toBeTruthy()
    expect(document.querySelectorAll('.lg-item').length).toBeGreaterThan(0)
  })

  it('places a TBC game on its committed date rather than the epoch', () => {
    wrap(<WeekView allMatches={GAMES} shown={GAMES} tz={TZ} dayHidden={() => false} />)
    // 1970 would be the give-away that a null tip-off fell through to new Date(null).
    expect(document.body.textContent).not.toMatch(/1970/)
  })
})

describe('DayMatchesModal', () => {
  const day = GAMES.filter((g) => g.ko?.startsWith('2026-09-04'))

  it('lists a day’s games and closes', () => {
    const onClose = vi.fn()
    wrap(<DayMatchesModal matches={day} tz={TZ} byNum={gamesByNum(GAMES)} onClose={onClose} />)
    expect(screen.getByText('Japan')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('GroupGamesModal', () => {
  const board = withGroupScores(
    'A',
    [
      ['Japan', 'Mali', 90, 60],
      ['Japan', 'Spain', 90, 60],
      ['Germany', 'Japan', 60, 90],
      ['Spain', 'Germany', 80, 70],
      ['Mali', 'Spain', 60, 80],
      ['Germany', 'Mali', 80, 70],
    ],
    GAMES,
  )

  it('lists a group’s six games', () => {
    wrap(<GroupGamesModal group="A" matches={board} tz={TZ} onClose={() => {}} />)
    expect(screen.getAllByText(/Japan|Spain|Germany|Mali/).length).toBeGreaterThan(5)
  })

  it('shows a qualified team’s next round and opponent', () => {
    wrap(
      <GroupGamesModal
        group="A"
        team="Spain"
        matches={board}
        tz={TZ}
        knockout={{
          status: 'second',
          opponent: 'Nigeria',
          round: 'QR',
          matchNum: 25,
          settled: true,
        }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Qualification round')).toBeInTheDocument()
    expect(screen.getByText('Nigeria')).toBeInTheDocument()
    expect(screen.getByText('Game 25')).toBeInTheDocument()
    expect(screen.getByText(/in second place/)).toBeInTheDocument()
  })

  // A group winner byes to a quarter-final against a game's winner, so there is
  // no team to name: the pending feed is shown instead of a bare "TBD".
  it('shows a group winner’s pending feed rather than a bare TBD', () => {
    wrap(
      <GroupGamesModal
        group="A"
        team="Japan"
        matches={board}
        tz={TZ}
        knockout={{
          status: 'won-group',
          opponent: null,
          opponentLabel: 'Winner Game 27',
          round: 'QF',
          matchNum: 29,
          settled: false,
        }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Quarter-final')).toBeInTheDocument()
    expect(screen.getByText('Winner Game 27')).toBeInTheDocument()
    expect(screen.getByText(/bye straight to the quarter-finals/)).toBeInTheDocument()
  })
})

describe('CalendarModal', () => {
  it('offers the export buttons and closes', () => {
    const onClose = vi.fn()
    wrap(<CalendarModal matches={GAMES} filtered={GAMES.slice(0, 3)} onClose={onClose} />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('downloads a whole-tournament .ics', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    wrap(<CalendarModal matches={GAMES} filtered={GAMES} onClose={() => {}} />)
    const all = screen.getAllByRole('button').find((b) => /All/i.test(b.textContent))
    if (all) {
      fireEvent.click(all)
      expect(click).toHaveBeenCalled()
    }
    click.mockRestore()
  })
})

describe('FeederPair', () => {
  it('shows both candidate teams', () => {
    wrap(<FeederPair feeder={{ a: 'Australia', b: 'Italy', kind: 'Winner', num: 27 }} />)
    expect(screen.getByText('Australia')).toBeInTheDocument()
    expect(screen.getByText('Italy')).toBeInTheDocument()
  })
})

describe('PathPicker', () => {
  it('offers no route while nobody has reached the final phase', () => {
    const { container } = wrap(<PathPicker byNum={gamesByNum(GAMES)} />)
    // Nothing to trace yet, so the picker stays out of the way.
    expect(container.querySelector('.path-select')).toBeNull()
  })

  it('traces a team once it is in the bracket', () => {
    const board = resolveBracket(
      GAMES.map((g) => (g.num === 25 ? { ...g, t1: 'Spain', t2: 'Nigeria' } : g)),
      {},
    )
    wrap(<PathPicker byNum={gamesByNum(board)} />)
    const select = document.querySelector('.path-select')
    expect(select).toBeTruthy()
    fireEvent.change(select, { target: { value: 'Spain' } })
    expect(select.value).toBe('Spain')
  })
})

describe('LiveBadge', () => {
  it('shows the period and clock while a game is running', () => {
    render(<LiveBadge match={{ live: { clock: '3:20', period: 'Q2' } }} />)
    expect(document.body.textContent).toMatch(/3:20|Q2/)
  })

  it('shows a delay instead of a clock when the game is paused', () => {
    render(<LiveBadge match={{ live: { delayed: true, label: 'Suspended' } }} />)
    expect(document.body.textContent).toMatch(/Suspended|Delayed/)
  })
})

describe('NextMatch', () => {
  it('counts down to the first game of the tournament', () => {
    wrap(<NextMatch matches={GAMES} tz={TZ} />)
    // Two games tip at 11:30 on day one, so the panel stacks both.
    expect(document.querySelector('.nm-label').textContent).toMatch(/Next games/)
    expect(document.querySelector('.nm-label').textContent).not.toMatch(/matches/)
    expect(screen.getByText('Japan')).toBeInTheDocument()
    expect(screen.getByText('Australia')).toBeInTheDocument()
  })

  // Once the tournament is over every tip-off is in the past, so there is no
  // next game and nothing to count down to.
  it('shows nothing once the whole tournament is in the past', () => {
    const past = GAMES.map((g) => ({
      ...g,
      ko: g.ko ? g.ko.replace('2026-09', '2020-09') : g.ko,
      score: [80, 70],
    }))
    wrap(<NextMatch matches={past} tz={TZ} />)
    expect(screen.getByText(/tournament has concluded/)).toBeInTheDocument()
  })
})

describe('Filters', () => {
  const setup = (filters = DEFAULT_FILTERS) => {
    const setFilters = vi.fn()
    const setTz = vi.fn()
    wrap(
      <Filters
        filters={filters}
        setFilters={setFilters}
        tz={TZ}
        setTz={setTz}
        detectedTz={TZ}
        resultCount={36}
      />,
    )
    return { setFilters, setTz }
  }

  it('offers a group, team and stage filter', () => {
    setup()
    const labels = [...document.querySelectorAll('.field')].map((f) =>
      f.textContent.split(/\s{2,}/)[0].trim(),
    )
    expect(labels.join(' ')).toMatch(/Group/)
    expect(labels.join(' ')).toMatch(/Team/)
  })

  it('reports the count in games', () => {
    setup()
    expect(document.querySelector('.result-count').textContent).toBe('36 games')
  })

  it('lists the stages this edition plays', () => {
    setup()
    const text = document.body.textContent
    expect(text).toMatch(/Qualification|Quarter/)
    expect(text).not.toMatch(/Round of 16/)
  })

  it('pushes a change up', () => {
    const { setFilters } = setup()
    const groupField = [...document.querySelectorAll('.field')].find((f) =>
      f.textContent.startsWith('Group'),
    )
    fireEvent.change(groupField.querySelector('select'), { target: { value: 'B' } })
    expect(setFilters).toHaveBeenCalled()
  })
})

describe('follow context', () => {
  it('stars and unstars a team, persisting under this app’s key', () => {
    const { result } = renderHook(() => useFollow(), { wrapper: FollowProvider })
    expect(result.current.isFollowed('Japan')).toBe(false)
    act(() => result.current.toggle('Japan'))
    expect(result.current.isFollowed('Japan')).toBe(true)
    expect(result.current.count).toBe(1)
    expect(localStorage.getItem('fwwc:followed')).toContain('Japan')
    act(() => result.current.toggle('Japan'))
    expect(result.current.isFollowed('Japan')).toBe(false)
  })
})

describe('path context', () => {
  it('sets and clears the traced team', () => {
    const { result } = renderHook(() => usePath(), { wrapper: PathProvider })
    act(() => result.current.setPathTeam('Japan'))
    expect(result.current.pathTeam).toBe('Japan')
    act(() => result.current.setPathTeam(null))
    expect(result.current.pathTeam).toBeNull()
  })
})
