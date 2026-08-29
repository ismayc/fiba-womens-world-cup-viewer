// Component rendering. The assertions concentrate on what this sport and this
// format changed: FIBA's table columns, the three-way group outcome, the
// asymmetric bracket, overtime instead of penalties, and the games whose
// tip-off time is still to be confirmed.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { GAMES } from '../src/data/games.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { gamesByNum, groupSlotMap } from '../src/utils/bracket.js'
import Standings from '../src/components/Standings.jsx'
import Bracket from '../src/components/Bracket.jsx'
import MatchCard from '../src/components/MatchCard.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import ScenariosView from '../src/components/ScenariosView.jsx'
import ScoreToasts from '../src/components/ScoreToasts.jsx'
import ChampionBanner from '../src/components/ChampionBanner.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { DetailContext } from '../src/context/detail.js'
import { withGroupScores, allGroupsPlayed } from './helpers/tournament.js'

const TZ = 'Europe/Berlin'
const num = (games, n) => games.find((g) => g.num === n)

// Every view sits inside the follow/path/detail providers in the real app.
function wrap(ui, { onDetail = () => {} } = {}) {
  return render(
    <FollowProvider>
      <PathProvider>
        <DetailContext.Provider value={onDetail}>{ui}</DetailContext.Provider>
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

describe('Standings', () => {
  it('renders FIBA’s columns, not football’s', () => {
    wrap(<Standings matches={GAMES} tz={TZ} clinch={{}} />)
    const table = screen.getAllByRole('table')[0]
    const heads = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['Team', 'P', 'W', 'L', 'PF', 'PA', 'PD', 'Pts', 'Fin'])
    // No draw column, and no goal columns.
    expect(heads).not.toContain('D')
    expect(heads).not.toContain('GF')
  })

  it('shows all four groups', () => {
    wrap(<Standings matches={GAMES} tz={TZ} clinch={{}} />)
    for (const g of ['A', 'B', 'C', 'D']) {
      expect(screen.getByRole('button', { name: new RegExp(`Group ${g}`) })).toBeInTheDocument()
    }
  })

  it('says the top three advance and the winner byes to the quarter-finals', () => {
    wrap(<Standings matches={GAMES} tz={TZ} clinch={{}} />)
    expect(screen.getByText(/Top three advance/)).toBeInTheDocument()
    expect(screen.getByText(/byes to the\s+quarter-finals/)).toBeInTheDocument()
  })

  it('shows FIBA points and a W–L record once games are played', () => {
    const board = withGroupScores('A', DECISIVE, GAMES)
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    const row = screen.getByRole('row', { name: /Japan/ })
    const cells = within(row).getAllByRole('cell').map((td) => td.textContent)
    // P, W, L, PF, PA, PD, Pts, 3 played, 3 wins, 0 losses, 6 FIBA points.
    expect(cells.slice(1, 4)).toEqual(['3', '3', '0'])
    expect(cells[7]).toBe('6')
  })

  it('projects three destinations per group, with the winner a round later', () => {
    const board = withGroupScores('A', DECISIVE, GAMES)
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    expect(screen.getAllByText('As it stands → final phase').length).toBeGreaterThan(0)
    const list = screen.getAllByText('1st')[0].closest('ul')
    expect(within(list).getByText('2nd')).toBeInTheDocument()
    expect(within(list).getByText('3rd')).toBeInTheDocument()
    // The winner's slot is a quarter-final; the others are the qualification round.
    expect(within(list).getByText('QF')).toBeInTheDocument()
    expect(within(list).getAllByText('QR')).toHaveLength(2)
  })

  it('shows a group winner’s pending opponent as the feeding game', () => {
    const board = withGroupScores('A', DECISIVE, GAMES)
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    expect(screen.getAllByText('Winner Game 27').length).toBeGreaterThan(0)
  })

  it('badges the clinched placings', () => {
    const board = withGroupScores('A', DECISIVE, GAMES)
    wrap(<Standings matches={board} tz={TZ} clinch={computeClinch(board)} />)
    expect(screen.getAllByText(/Won group/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Eliminated/).length).toBeGreaterThan(0)
  })
})

describe('Bracket', () => {
  const board = resolveBracket(GAMES, {})

  it('labels the columns with FIBA’s rounds, not a round of 16', () => {
    wrap(<Bracket matches={board} tz={TZ} />)
    expect(screen.getAllByText('Qualification to Quarter-Finals').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Quarter-Final').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Round of 16/)).not.toBeInTheDocument()
  })

  it('renders every slot by its FIBA label while the draw is open', () => {
    wrap(<Bracket matches={board} tz={TZ} />)
    expect(screen.getByText('2nd Group A')).toBeInTheDocument()
    expect(screen.getByText('3rd Group B')).toBeInTheDocument()
    expect(screen.getByText('Winner Group A')).toBeInTheDocument()
    expect(screen.getByText('Loser Game 33')).toBeInTheDocument()
  })

  it('shows the quarter-final crossover FIBA published', () => {
    wrap(<Bracket matches={board} tz={TZ} />)
    // Game 29 is Winner Group A against the winner of game 27 (a C/D tie).
    const g29 = document.getElementById('bx-m29')
    expect(within(g29).getByText('Winner Group A')).toBeInTheDocument()
    expect(within(g29).getByText('Winner Game 27')).toBeInTheDocument()
  })

  it('marks a game whose tip-off FIBA has not announced as TBC', () => {
    wrap(<Bracket matches={board} tz={TZ} />)
    const g25 = document.getElementById('bx-m25')
    expect(g25.textContent).toMatch(/TBC/)
  })

  it('opens the detail modal when a game is clicked', () => {
    const onDetail = vi.fn()
    wrap(<Bracket matches={board} tz={TZ} />, { onDetail })
    fireEvent.click(document.getElementById('bx-m29'))
    expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ num: 29 }))
  })

  it('expands a feed slot to its candidate pair once the source is set', () => {
    const withQr = resolveBracket(
      GAMES.map((g) => (g.num === 27 ? { ...g, t1: 'Australia', t2: 'Italy' } : g)),
      {},
    )
    wrap(<Bracket matches={withQr} tz={TZ} />)
    const g29 = document.getElementById('bx-m29')
    expect(within(g29).getByText('Australia')).toBeInTheDocument()
    expect(within(g29).getByText('Italy')).toBeInTheDocument()
  })
})

describe('MatchCard', () => {
  const byNum = gamesByNum(GAMES)
  const slotMap = groupSlotMap(GAMES)

  it('renders a group game with its arena and US channel', () => {
    wrap(<MatchCard match={num(GAMES, 1)} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText('Japan')).toBeInTheDocument()
    expect(screen.getByText('Mali')).toBeInTheDocument()
    expect(screen.getByText('Berlin Arena')).toBeInTheDocument()
    expect(screen.getByText('Game 1')).toBeInTheDocument()
  })

  it('shows overtime rather than penalties on a decided game', () => {
    const g = { ...num(GAMES, 1), score: [95, 92], ot: 2 }
    wrap(<MatchCard match={g} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText('2OT')).toBeInTheDocument()
    expect(screen.queryByText(/pens/)).not.toBeInTheDocument()
  })

  it('shows "Time TBC" for a game FIBA has not timed yet', () => {
    wrap(<MatchCard match={num(GAMES, 25)} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText('Time TBC')).toBeInTheDocument()
  })

  it('falls back to a Berlin arena placeholder when none is assigned', () => {
    wrap(<MatchCard match={num(GAMES, 25)} tz={TZ} byNum={byNum} slotMap={slotMap} />)
    expect(screen.getByText('Arena TBC')).toBeInTheDocument()
  })

  it('describes a group’s three-way route in the team tooltip', () => {
    wrap(
      <MatchCard match={num(GAMES, 1)} tz={TZ} byNum={byNum} slotMap={slotMap} clinch={{}} />,
    )
    const japan = screen.getByText('Japan').closest('[title]')
    expect(japan.getAttribute('title')).toMatch(/1st → Quarter-final · Game 29 \(bye\)/)
    expect(japan.getAttribute('title')).toMatch(/2nd → Qualification round · Game 25/)
    expect(japan.getAttribute('title')).toMatch(/4th → eliminated/)
  })
})

describe('MatchDetail', () => {
  it('shows a W–L tale of the tape with no draw or clean-sheet row', () => {
    const board = resolveBracket(
      withGroupScores('A', DECISIVE, GAMES).map((g) =>
        g.num === 29 ? { ...g, t1: 'Japan', t2: 'Spain' } : g,
      ),
      {},
    )
    wrap(
      <MatchDetail
        match={num(board, 29)}
        tz={TZ}
        allMatches={board}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('W–L')).toBeInTheDocument()
    expect(screen.getByText('Points per game')).toBeInTheDocument()
    expect(screen.queryByText('W–D–L')).not.toBeInTheDocument()
    expect(screen.queryByText('Clean sheets')).not.toBeInTheDocument()
  })

  it('shows the arena and the US broadcast, with no Spanish row', () => {
    wrap(<MatchDetail match={num(GAMES, 1)} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getByText(/Berlin Arena/)).toBeInTheDocument()
    expect(screen.getByText('How to watch (US)')).toBeInTheDocument()
    expect(screen.queryByText('Spanish')).not.toBeInTheDocument()
  })

  it('notes overtime on a finished game', () => {
    const g = { ...num(GAMES, 1), score: [95, 92], ot: 1 }
    wrap(<MatchDetail match={g} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getByText('after overtime')).toBeInTheDocument()
  })
})

describe('ScenariosView', () => {
  it('offers two outcomes per game and no draw button', () => {
    wrap(<ScenariosView matches={GAMES} />)
    const first = document.querySelector('.sc-fixture')
    const buttons = within(first).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.textContent)).toEqual(['W', 'W'])
    expect(within(first).queryByText('D')).not.toBeInTheDocument()
  })

  it('recomputes the table and the projection from a pick', () => {
    wrap(<ScenariosView matches={GAMES} />)
    const first = document.querySelector('.sc-fixture')
    fireEvent.click(within(first).getAllByRole('button')[0])
    expect(screen.getAllByText(/possible orders/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Projected final phase').length).toBe(4)
  })

  it('retires itself once every group game is final', () => {
    wrap(<ScenariosView matches={allGroupsPlayed()} />)
    expect(screen.getByText(/Every group is decided/)).toBeInTheDocument()
  })
})

describe('ScoreToasts', () => {
  it('renders a final-score toast and dismisses it', () => {
    const onDismiss = vi.fn()
    const onOpen = vi.fn()
    const game = { num: 1, t1: 'Japan', t2: 'Mali', score: [88, 61] }
    render(
      <ScoreToasts
        items={[{ id: 'final|1', ev: { game } }]}
        onOpen={onOpen}
        onDismiss={onDismiss}
      />,
    )
    expect(screen.getByText(/FINAL: Japan win/)).toBeInTheDocument()
    expect(screen.getByText('Japan 88–61 Mali')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Open game details'))
    expect(onOpen).toHaveBeenCalledWith(game)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<ScoreToasts items={[]} onOpen={() => {}} onDismiss={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ChampionBanner', () => {
  const decidedFinal = { ...num(GAMES, 36), t1: 'Australia', t2: 'Japan', score: [90, 80] }

  it('stays hidden until the Final is decided', () => {
    const { container } = wrap(<ChampionBanner match={num(GAMES, 36)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('crowns the winner of the Final', () => {
    wrap(<ChampionBanner match={decidedFinal} />)
    expect(screen.getByText('Australia')).toBeInTheDocument()
    expect(screen.getByText(/2026 FIBA Women’s World Cup champions/)).toBeInTheDocument()
  })

  // A live score is provisional: the team ahead in the fourth quarter is not
  // the champion.
  it('does not crown a team that is merely winning', () => {
    const { container } = wrap(
      <ChampionBanner match={{ ...decidedFinal, live: { clock: '2:00' } }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden in spoiler-free mode', () => {
    const { container } = wrap(<ChampionBanner match={decidedFinal} hideScores />)
    expect(container).toBeEmptyDOMElement()
  })
})
