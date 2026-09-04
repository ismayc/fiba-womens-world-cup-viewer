// The pop-ups and the Scenarios view, driven through their interactive paths.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'

// ServicesModal reads the committed board directly to summarize coverage, and
// that board changes with every refresh. Serve the frozen pre-tournament board.
vi.mock('../src/data/games.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/pretournament-games.js')).GAMES,
}))

import { GAMES } from './fixtures/pretournament-games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { gamesByNum } from '../src/utils/bracket.js'
import CalendarModal from '../src/components/CalendarModal.jsx'
import ChampionBanner from '../src/components/ChampionBanner.jsx'
import DayMatchesModal from '../src/components/DayMatchesModal.jsx'
import GroupGamesModal from '../src/components/GroupGamesModal.jsx'
import ScenariosView from '../src/components/ScenariosView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { DetailContext } from '../src/context/detail.js'
import { allGroupsPlayed, withGroupScores } from './helpers/tournament.js'

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

const DECISIVE = [
  ['Japan', 'Mali', 90, 60],
  ['Japan', 'Spain', 90, 60],
  ['Germany', 'Japan', 60, 90],
  ['Spain', 'Germany', 80, 70],
  ['Mali', 'Spain', 60, 80],
  ['Germany', 'Mali', 80, 70],
]
const PLAYED = withGroupScores('A', DECISIVE, GAMES)
const DAY1 = GAMES.filter((g) => g.ko?.startsWith('2026-09-04'))

beforeEach(() => localStorage.clear())

describe('CalendarModal', () => {
  it('copies the feed URL, and says so', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    wrap(<CalendarModal matches={GAMES} filtered={GAMES} onClose={() => {}} />)
    const copyBtn = screen.getAllByRole('button', { name: /Copy URL/ })[0]
    await act(async () => {
      fireEvent.click(copyBtn)
    })
    expect(writeText).toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /Copied!/ }).length).toBeGreaterThan(0)
    // It reverts after a moment so the button is reusable.
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getAllByRole('button', { name: /Copy URL/ }).length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('survives a browser with no clipboard access', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied')
        },
      },
      configurable: true,
    })
    wrap(<CalendarModal matches={GAMES} filtered={GAMES} onClose={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Copy URL/ })[0])
    })
    expect(screen.getAllByRole('button', { name: /Copy URL/ }).length).toBeGreaterThan(0)
  })

  it('downloads the filtered set', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    wrap(<CalendarModal matches={GAMES} filtered={GAMES.slice(0, 4)} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Current filter/ }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })
})

describe('ChampionBanner', () => {
  const decided = { ...num(GAMES, 36), t1: 'Australia', t2: 'Japan', score: [90, 80] }

  it('opens the Final when clicked', () => {
    const onDetail = vi.fn()
    wrap(<ChampionBanner match={decided} />, { onDetail })
    fireEvent.click(screen.getByTitle('Open the Final'))
    expect(onDetail).toHaveBeenCalledWith(decided)
  })

  it('stays hidden with no Final at all', () => {
    const { container } = wrap(<ChampionBanner match={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when the winner is not one of the sixteen teams', () => {
    const { container } = wrap(
      <ChampionBanner match={{ ...decided, t1: 'Atlantis' }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('DayMatchesModal', () => {
  it('counts the day’s games and opens one', () => {
    const onDetail = vi.fn()
    wrap(<DayMatchesModal matches={DAY1} tz={TZ} byNum={gamesByNum(GAMES)} onClose={() => {}} />, {
      onDetail,
    })
    expect(screen.getByText(/8 games/)).toBeInTheDocument()
    fireEvent.click(document.querySelectorAll('.dm-row')[0])
    expect(onDetail).toHaveBeenCalled()
  })

  it('says "1 game" for a single fixture', () => {
    wrap(<DayMatchesModal matches={[DAY1[0]]} tz={TZ} byNum={gamesByNum(GAMES)} onClose={() => {}} />)
    expect(screen.getByText(/1 game$/)).toBeInTheDocument()
  })

  it('hides scores behind a reveal, then shows them', () => {
    const played = DAY1.map((g) => ({ ...g, score: [88, 61] }))
    wrap(
      <DayMatchesModal
        matches={played}
        tz={TZ}
        hideScores
        byNum={gamesByNum(GAMES)}
        onClose={() => {}}
      />,
    )
    expect(document.querySelectorAll('.gg-score-hidden').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Reveal scores/ }))
    expect(document.querySelectorAll('.gg-score-hidden')).toHaveLength(0)
  })

  it('shows a final score with overtime, a live badge, a void and a delay', () => {
    const board = [
      { ...DAY1[0], score: [95, 92], ot: 2 },
      { ...DAY1[1], score: [40, 38], live: { clock: '3:00', period: 'Q2' } },
      { ...DAY1[2], voided: true, statusLabel: 'Postponed' },
      { ...DAY1[3], ko: new Date(Date.now() - 30 * 60_000).toISOString() },
    ]
    wrap(<DayMatchesModal matches={board} tz={TZ} byNum={gamesByNum(GAMES)} onClose={() => {}} />)
    expect(document.body.textContent).toMatch(/2OT/)
    expect(document.querySelector('.gg-badge.gg-final')).toBeTruthy()
    expect(document.querySelector('.wc-live, .badge-live')).toBeTruthy()
    expect(document.querySelector('.gg-badge.gg-voided')).toBeTruthy()
    expect(document.querySelector('.gg-badge.gg-delayed')).toBeTruthy()
  })

  it('names a final-phase game and expands its candidate pairs', () => {
    const resolved = gamesByNum(
      GAMES.map((g) => (g.num === 27 ? { ...g, t1: 'Australia', t2: 'Italy' } : g)),
    )
    wrap(
      <DayMatchesModal matches={[num(GAMES, 29)]} tz={TZ} byNum={resolved} onClose={() => {}} />,
    )
    expect(screen.getByText('Winner Group A')).toBeInTheDocument()
    expect(document.querySelectorAll('.feeder-cand').length).toBe(2)
    expect(screen.getByText(/Quarter-Final/)).toBeInTheDocument()
  })

  it('shows the bullet flag for an unresolved slot', () => {
    wrap(<DayMatchesModal matches={[num(GAMES, 25)]} tz={TZ} byNum={gamesByNum(GAMES)} onClose={() => {}} />)
    expect(document.querySelectorAll('.gg-flag')[0].textContent).toBe('•')
  })
})

describe('GroupGamesModal', () => {
  it('opens a game and closes the pop-up behind it', () => {
    const onDetail = vi.fn()
    const onClose = vi.fn()
    wrap(<GroupGamesModal group="A" matches={PLAYED} tz={TZ} onClose={onClose} />, { onDetail })
    fireEvent.click(document.querySelectorAll('.gg-fixture')[0])
    expect(onClose).toHaveBeenCalled()
    expect(onDetail).toHaveBeenCalled()
  })

  it('hides scores behind a reveal', () => {
    wrap(<GroupGamesModal group="A" matches={PLAYED} tz={TZ} hideScores onClose={() => {}} />)
    expect(document.querySelectorAll('.gg-score-hidden').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Reveal scores/ }))
    expect(document.querySelectorAll('.gg-score-hidden')).toHaveLength(0)
  })

  it('shows overtime, a live badge, a void and a delay', () => {
    const board = PLAYED.map((g) => {
      if (g.num === 1) return { ...g, score: [95, 92], ot: 1 }
      if (g.num === 6) return { ...g, score: [40, 38], live: { clock: '3:00', period: 'Q2' } }
      if (g.num === 9) return { ...g, voided: true, statusLabel: 'Postponed', score: undefined }
      if (g.num === 11)
        return { ...g, score: undefined, ko: new Date(Date.now() - 30 * 60_000).toISOString() }
      return g
    })
    wrap(<GroupGamesModal group="A" matches={board} tz={TZ} onClose={() => {}} />)
    expect(document.body.textContent).toMatch(/\bOT\b/)
    expect(document.querySelector('.badge-live')).toBeTruthy()
    expect(document.querySelector('.gg-badge.gg-voided')).toBeTruthy()
    expect(document.querySelector('.gg-badge.gg-delayed')).toBeTruthy()
  })

  it('falls back to "Final phase" for an unrecognised round', () => {
    wrap(
      <GroupGamesModal
        group="A"
        team="Japan"
        matches={PLAYED}
        tz={TZ}
        knockout={{ status: 'through', opponent: null, round: 'XX', matchNum: 99, settled: false }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Final phase/)).toBeInTheDocument()
    expect(screen.getByText('To be determined')).toBeInTheDocument()
  })

  it('shows a bullet for a team with no flag', () => {
    wrap(
      <GroupGamesModal
        group="A"
        team="Atlantis"
        matches={PLAYED}
        tz={TZ}
        knockout={{ status: 'second', opponent: 'Narnia', round: 'QR', matchNum: 25, settled: true }}
        onClose={() => {}}
      />,
    )
    expect(document.querySelectorAll('.gg-flag')[0].textContent).toBe('•')
  })
})

describe('ScenariosView', () => {
  it('steps a picked score up and down', () => {
    wrap(<ScenariosView matches={GAMES} />)
    const fixture = document.querySelector('.sc-fixture')
    fireEvent.click(within(fixture).getAllByRole('button')[0])
    const steppers = within(fixture).getAllByRole('button', { name: /minus|plus/ })
    const before = within(fixture).getByText(/\d+–\d+/).textContent
    fireEvent.click(steppers[1]) // +
    expect(within(fixture).getByText(/\d+–\d+/).textContent).not.toBe(before)
    fireEvent.click(steppers[0]) // −
    expect(within(fixture).getByText(/\d+–\d+/).textContent).toBe(before)
  })

  it('toggles a pick off when the same side is clicked twice', () => {
    wrap(<ScenariosView matches={GAMES} />)
    const fixture = document.querySelector('.sc-fixture')
    const [home] = within(fixture).getAllByRole('button')
    fireEvent.click(home)
    expect(fixture.querySelector('.sc-score')).toBeTruthy()
    fireEvent.click(within(document.querySelector('.sc-fixture')).getAllByRole('button')[0])
    expect(document.querySelector('.sc-fixture .sc-score')).toBeNull()
  })

  it('clears every pick', () => {
    wrap(<ScenariosView matches={GAMES} />)
    fireEvent.click(within(document.querySelector('.sc-fixture')).getAllByRole('button')[0])
    expect(document.querySelector('.sc-score')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Clear picks/i }))
    expect(document.querySelector('.sc-score')).toBeNull()
  })

  // A group with nothing left to play drops out of this view entirely, so a
  // confirmed matchup has to involve a group that is STILL IN PLAY but whose
  // placings are already pinned. Group A below has one game left, yet 3rd and
  // 4th cannot change; Group B is finished, so game 26 (2B v 3A) is locked.
  it('marks a projected matchup as confirmed once both its placings are pinned', () => {
    let board = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 90, 60],
        ['Spain', 'Germany', 90, 60],
        ['Mali', 'Spain', 60, 90],
        ['Germany', 'Japan', 60, 90],
        ['Germany', 'Mali', 90, 60],
      ],
      GAMES,
    )
    board = withGroupScores(
      'B',
      [
        ['France', 'South Korea', 90, 60],
        ['Hungary', 'France', 60, 90],
        ['Nigeria', 'France', 60, 90],
        ['South Korea', 'Nigeria', 90, 60],
        ['Nigeria', 'Hungary', 60, 90],
        ['Hungary', 'South Korea', 90, 60],
      ],
      board,
    )
    wrap(<ScenariosView matches={board} />)
    expect(document.querySelectorAll('.sc-r32-confirmed').length).toBeGreaterThan(0)
  })

  it('marks every matchup confirmed once all four groups are done', () => {
    const board = allGroupsPlayed((g) => g.t1)
    // Only the final phase is left, so the view retires itself.
    wrap(<ScenariosView matches={board} />)
    expect(screen.getByText(/Every group is decided/)).toBeInTheDocument()
  })

  // Japan and Spain have not met yet (their game is the one still to play), so
  // the head-to-head table is empty; identical margins leave them level on every
  // other criterion too, which is the drawing-of-lots case.
  it('flags a placing that only a drawing of lots could settle', () => {
    const lots = withGroupScores(
      'A',
      [
        ['Japan', 'Mali', 80, 70],
        ['Germany', 'Japan', 70, 80],
        ['Spain', 'Germany', 80, 70],
        ['Mali', 'Spain', 70, 80],
      ],
      GAMES,
    )
    wrap(<ScenariosView matches={lots} />)
    expect(document.querySelectorAll('.sc-tiebreak').length).toBeGreaterThan(0)
  })
})

describe('the last modal and scenario arms', () => {
  it('expands the FIRST side of a day row when that side is the feed', () => {
    // Game 35 is "Loser Game 33" v "Loser Game 34": side one is a feed too.
    const resolved = gamesByNum(
      GAMES.map((g) => {
        if (g.num === 33) return { ...g, t1: 'Japan', t2: 'Spain' }
        if (g.num === 34) return { ...g, t1: 'Italy', t2: 'China' }
        return g
      }),
    )
    wrap(<DayMatchesModal matches={[num(GAMES, 35)]} tz={TZ} byNum={resolved} onClose={() => {}} />)
    expect(document.querySelectorAll('.feeder-cand')).toHaveLength(4)
  })

  it('shows a single overtime as "OT" in both pop-ups', () => {
    const one = { ...DAY1[0], score: [95, 92], ot: 1 }
    const a = wrap(
      <DayMatchesModal matches={[one]} tz={TZ} byNum={gamesByNum(GAMES)} onClose={() => {}} />,
    )
    expect(document.querySelector('.gg-pens').textContent.trim()).toBe('OT')
    a.unmount()

    const board = PLAYED.map((g) => (g.num === 1 ? { ...g, score: [95, 92], ot: 3 } : g))
    wrap(<GroupGamesModal group="A" matches={board} tz={TZ} onClose={() => {}} />)
    expect(document.querySelector('.gg-pens').textContent.trim()).toBe('3OT')
  })

  it('falls back to "Schedule" when the day pop-up has no games', () => {
    wrap(<DayMatchesModal matches={[]} tz={TZ} byNum={gamesByNum(GAMES)} onClose={() => {}} />)
    expect(screen.getByText('Schedule')).toBeInTheDocument()
  })

  it('shows a bullet for a group-game side with no flag', () => {
    const bogus = PLAYED.map((g) => (g.num === 1 ? { ...g, t1: 'Atlantis' } : g))
    wrap(<GroupGamesModal group="A" matches={bogus} tz={TZ} onClose={() => {}} />)
    expect([...document.querySelectorAll('.gg-flag')].some((e) => e.textContent === '•')).toBe(true)
  })
})

describe('ScenariosView remaining arms', () => {
  it('picks the away side, and highlights it', () => {
    wrap(<ScenariosView matches={GAMES} />)
    const fixture = document.querySelector('.sc-fixture')
    const [, away] = within(fixture).getAllByRole('button')
    fireEvent.click(away)
    expect(document.querySelector('.sc-pick.active')).toBeTruthy()
    expect(document.querySelector('.sc-fx-right.sc-win')).toBeTruthy()
  })

  it('steps the away team’s score', () => {
    wrap(<ScenariosView matches={GAMES} />)
    const fixture = document.querySelector('.sc-fixture')
    fireEvent.click(within(fixture).getAllByRole('button')[0])
    const plus = within(document.querySelector('.sc-fixture')).getAllByRole('button', {
      name: /plus/,
    })
    fireEvent.click(plus[plus.length - 1])
    expect(document.querySelector('.sc-score-dash').textContent).toMatch(/78–71/)
  })

  it('counts what is still open, and how many orders each group can still take', () => {
    wrap(<ScenariosView matches={GAMES} />)
    expect(screen.getByText(/24 games still open/)).toBeInTheDocument()
    // Four untouched groups of four: 24 orderings each.
    expect(screen.getAllByText('24 possible orders')).toHaveLength(4)
  })

  it('says "1 game still open" in the singular', () => {
    // Every group game played except one.
    const board = allGroupsPlayed().map((g) => (g.num === 24 ? { ...g, score: undefined } : g))
    wrap(<ScenariosView matches={board} />)
    expect(screen.getByText(/1 game still open/)).toBeInTheDocument()
  })

  it('labels a decided group’s table as final and marks it decided', () => {
    const board = allGroupsPlayed().map((g) => (g.num === 24 ? { ...g, score: undefined } : g))
    wrap(<ScenariosView matches={board} />)
    const fixture = document.querySelector('.sc-fixture')
    fireEvent.click(within(fixture).getAllByRole('button')[0])
    expect(screen.getAllByText('order decided').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Projected final/).length).toBeGreaterThan(0)
    expect(document.querySelector('.sc-decided')).toBeTruthy()
  })

  it('marks every matchup confirmed once every pick is in', () => {
    const board = allGroupsPlayed().map((g) => (g.num === 24 ? { ...g, score: undefined } : g))
    wrap(<ScenariosView matches={board} />)
    fireEvent.click(within(document.querySelector('.sc-fixture')).getAllByRole('button')[0])
    expect(document.querySelectorAll('.sc-r32-confirmed').length).toBeGreaterThan(0)
  })

  it('shows a bullet for a fixture side with no flag', () => {
    const bogus = GAMES.map((g) => (g.num === 1 ? { ...g, t1: 'Atlantis', t2: 'Narnia' } : g))
    wrap(<ScenariosView matches={bogus} />)
    expect([...document.querySelectorAll('.sc-fx-team')].some((e) => e.textContent.includes('•'))).toBe(
      true,
    )
  })
})
