import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { DetailContext } from '../src/context/detail.js'
import MatchDetail from '../src/components/MatchDetail.jsx'
import BoxScoreSection from '../src/components/BoxScore.jsx'
import { fetchGameSummary, orderSides, SUMMARY_URL } from '../src/services/summary.js'
import { GAMES } from './fixtures/pretournament-games.js'
import { SUMMARY_401907390 } from './fixtures/summary-401907390.js'

// Game 1 is Japan v Mali, ESPN event 401907390, the game the fixture was captured from.
// The frozen pre-tournament board has no score on it, so a played copy is made here.
const JAPAN_MALI = { ...GAMES.find((g) => g.num === 1), score: [102, 97] }
const TZ = 'Europe/Berlin'

const wrap = (ui) =>
  render(
    <FollowProvider>
      <PathProvider>
        <ServicesProvider>
          <DetailContext.Provider value={() => {}}>{ui}</DetailContext.Provider>
        </ServicesProvider>
      </PathProvider>
    </FollowProvider>,
  )

const ok = (body) => vi.fn(async () => ({ ok: true, json: async () => body }))

// A synthetic payload for the arms the real one never reaches: a DNP player, a
// player with no position, an empty stat cell, no totals, a side with no name.
const synthetic = () => ({
  boxscore: {
    players: [
      {
        team: { displayName: 'Mali' },
        statistics: [
          {
            keys: ['minutes', 'points', 'offensiveRebounds'],
            labels: ['MIN', 'PTS', 'OREB'],
            athletes: [
              { starter: true, athlete: { id: '1', displayName: 'Starter One', position: { abbreviation: 'G' } }, stats: ['20', '10', '1'] },
              { starter: false, didNotPlay: true, athlete: { id: '2', displayName: 'Bench DNP' }, stats: [] },
              { starter: false, athlete: { id: '3', displayName: 'Bench Blank' }, stats: ['5', ''] },
            ],
          },
        ],
      },
      {
        team: {},
        statistics: [{ keys: ['minutes', 'points'], athletes: [{ starter: true, athlete: {}, stats: ['1', '2'] }] }],
      },
    ],
    teams: [
      { team: { displayName: 'Mali' }, statistics: [{ name: 'assists', displayValue: '10' }, { name: 'totalTurnovers', displayValue: '12' }, { name: 'fieldGoalPct', displayValue: 'x' }] },
      { team: {}, statistics: [{ name: 'assists', displayValue: '10' }, { name: 'totalTurnovers', displayValue: '9' }, { name: 'fieldGoalPct', displayValue: '40' }] },
    ],
  },
  header: { competitions: [{ competitors: [{ team: { displayName: 'Mali' }, linescores: [{ displayValue: '20' }, {}] }, { team: { displayName: 'Japan' }, linescores: [{ displayValue: '18' }, { displayValue: '30' }, { displayValue: '1' }, { displayValue: '2' }, { displayValue: '5' }, { displayValue: '6' }] }] }] },
})

describe('fetchGameSummary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('parses the box, line score and team stats from the real payload', async () => {
    global.fetch = ok(SUMMARY_401907390)
    const s = await fetchGameSummary('401907390')
    expect(global.fetch).toHaveBeenCalledWith(`${SUMMARY_URL}?event=401907390`, { signal: undefined })
    expect(s.box.sides.map((x) => x.name)).toEqual(['Japan', 'Mali'])
    expect(s.box.hasStats).toBe(true)
    // OREB/DREB are dropped; REB already sums them.
    expect(s.box.sides[0].columns.map((c) => c.key)).not.toContain('offensiveRebounds')
    expect(s.box.sides[0].columns.find((c) => c.key === 'points').label).toBe('PTS')
    expect(s.box.sides[0].starters).toHaveLength(2)
    expect(s.box.sides[0].bench).toHaveLength(1)
    // ESPN files every FIBA player at "NA"; that is no position, not a position.
    expect(s.box.sides[0].starters.map((p) => p.pos)).toEqual([null, null])
    expect(s.box.sides[0].totals.points).toBe('102')
    // Feed order is home first (Mali), so the parser keeps it; orderSides fixes it for the modal.
    expect(s.linescore.map((r) => [r.name, r.periods])).toEqual([
      ['Mali', ['25', '27', '21', '24']],
      ['Japan', ['21', '27', '23', '31']],
    ])
    expect(s.teamStats.names).toEqual(['Japan', 'Mali'])
    expect(s.teamStats.rows.find((r) => r.label === 'FG').values).toEqual(['37-67', '38-74'])
  })

  it('returns null when the request fails or is not ok', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    expect(await fetchGameSummary('1')).toBeNull()
    global.fetch = vi.fn(async () => { throw new Error('offline') })
    expect(await fetchGameSummary('1')).toBeNull()
  })

  it('returns nulls for an empty payload and handles the synthetic arms', async () => {
    global.fetch = ok({})
    expect(await fetchGameSummary('1')).toEqual({ box: null, linescore: null, teamStats: null })

    global.fetch = ok(synthetic())
    const s = await fetchGameSummary('1')
    const [mali, blank] = s.box.sides
    expect(mali.bench[0]).toMatchObject({ name: 'Bench DNP', dnp: true, pos: null })
    expect(mali.bench[1].stats.points).toBe('')
    expect(mali.totals).toBeNull()
    expect(blank.name).toBeNull()
    expect(blank.starters[0].name).toBe('Unknown')
    // Team stats: equal assists bold nobody; fewer turnovers bold the second side;
    // a non-numeric FG% bolds nobody.
    const row = (l) => s.teamStats.rows.find((r) => r.label === l)
    expect(row('AST').better).toBeNull()
    expect(row('TO').better).toBe(1)
    expect(row('FG%').better).toBeNull()
    expect(s.teamStats.names).toEqual(['Mali', null])
    expect(s.linescore[0].periods).toEqual(['20', ''])
  })

  it('needs two sides for a line score and for team stats', async () => {
    global.fetch = ok({ header: { competitions: [{ competitors: [{ linescores: [{ displayValue: '1' }] }] }] }, boxscore: { teams: [{}] } })
    const s = await fetchGameSummary('1')
    expect(s.linescore).toBeNull()
    expect(s.teamStats).toBeNull()
    global.fetch = ok({ boxscore: { teams: [{ statistics: [] }, { statistics: [] }] } })
    expect((await fetchGameSummary('1')).teamStats).toBeNull()
  })
})

describe('orderSides', () => {
  const sides = [{ name: 'Mali' }, { name: 'Japan' }]
  it('puts t1 first when the feed has them the other way round', () => {
    expect(orderSides(sides, { t1: 'Japan', t2: 'Mali' })).toEqual([{ name: 'Japan' }, { name: 'Mali' }])
  })
  it('keeps feed order when the names already match or match neither side', () => {
    expect(orderSides(sides, { t1: 'Mali', t2: 'Japan' })).toBe(sides)
    expect(orderSides(sides, { t1: 'Spain', t2: 'Germany' })).toBe(sides)
    expect(orderSides(sides, {})).toBe(sides)
    expect(orderSides(null, {})).toBeNull()
  })
})

describe('MatchDetail box score', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'))
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fetches on open and renders the line score, both tables and the team stats', async () => {
    global.fetch = ok(SUMMARY_401907390)
    wrap(<MatchDetail match={JAPAN_MALI} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await act(async () => {})
    expect(global.fetch).toHaveBeenCalledTimes(1)
    // Line score: Japan first (t1), totals summed from the periods.
    const line = screen.getByText('Q1').closest('table')
    expect(line.querySelectorAll('tbody tr')[0].textContent).toContain('Japan')
    expect([...line.querySelectorAll('.bs-total')].map((td) => td.textContent)).toEqual(['102', '97'])
    expect(screen.getAllByText('Totals')).toHaveLength(2)
    expect(screen.getByText('FG%')).toBeInTheDocument()
  })

  it('says so when the feed has nothing, and when the request fails', async () => {
    global.fetch = ok({})
    wrap(<MatchDetail match={JAPAN_MALI} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    await act(async () => {})
    expect(screen.getByText('Not available for this game.')).toBeInTheDocument()
    cleanup()
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    wrap(<MatchDetail match={JAPAN_MALI} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    await act(async () => {})
    expect(screen.getByText('Not available for this game.')).toBeInTheDocument()
  })

  it('keeps the box score behind a reveal in spoiler-free mode', async () => {
    global.fetch = ok(SUMMARY_401907390)
    wrap(<MatchDetail match={JAPAN_MALI} tz={TZ} hideScores allMatches={GAMES} onClose={() => {}} />)
    await act(async () => {})
    expect(screen.queryByText('Q1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reveal box score/ }))
    expect(screen.getByText('Q1')).toBeInTheDocument()
  })

  it('fetches for a game that has tipped but has no final score yet', async () => {
    global.fetch = ok(synthetic())
    const live = { ...JAPAN_MALI, score: null, ko: '2026-09-05T11:30:00+02:00' }
    wrap(<MatchDetail match={live} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    await act(async () => {})
    expect(global.fetch).toHaveBeenCalledTimes(1)
    // The synthetic arms in the tables: DNP row, blank cell, no position, no totals,
    // overtime period labels, and a bolded better side.
    expect(screen.getByText('DNP')).toBeInTheDocument()
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
    expect(screen.getByText('2OT')).toBeInTheDocument()
    expect(document.querySelector('.bs-better').textContent).toBe('9')
    expect(screen.queryByText('Totals')).not.toBeInTheDocument()
  })

  it('does not fetch for a game that has not tipped, or one with no ESPN id', () => {
    global.fetch = ok(SUMMARY_401907390)
    const future = { ...JAPAN_MALI, score: null, ko: '2026-09-08T18:00:00+02:00' }
    wrap(<MatchDetail match={future} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.queryByText('Box score')).not.toBeInTheDocument()
    cleanup()
    wrap(<MatchDetail match={{ ...JAPAN_MALI, espnId: null }} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('ignores a response that lands after the modal closed', async () => {
    let resolve
    global.fetch = vi.fn(() => new Promise((r) => { resolve = r }))
    const { unmount } = wrap(<MatchDetail match={JAPAN_MALI} tz={TZ} allMatches={GAMES} onClose={() => {}} />)
    unmount()
    await act(async () => {
      resolve({ ok: true, json: async () => SUMMARY_401907390 })
    })
    expect(screen.queryByText('Q1')).not.toBeInTheDocument()
  })
})

describe('BoxScoreSection', () => {
  afterEach(cleanup)
  it('renders the idle state as not available', () => {
    render(<BoxScoreSection summary={{ status: 'idle', data: null }} match={JAPAN_MALI} hidden={false} onReveal={() => {}} />)
    expect(screen.getByText('Not available for this game.')).toBeInTheDocument()
  })

  it('renders team stats alone, with a dash where one side has no value', () => {
    const data = {
      box: null,
      linescore: null,
      teamStats: { names: ['Japan', 'Mali'], rows: [{ label: 'Paint', values: [null, '30'], better: null }, { label: 'AST', values: ['26', null], better: null }] },
    }
    render(<BoxScoreSection summary={{ status: 'ready', data }} match={JAPAN_MALI} hidden={false} onReveal={() => {}} />)
    expect(screen.queryByText('Q1')).not.toBeInTheDocument()
    expect(screen.queryByText('Totals')).not.toBeInTheDocument()
    expect(screen.getAllByText('–')).toHaveLength(2)
  })
})

describe('fetchGameSummary: the feed omitting things', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tolerates a side with no statistics, an athlete with no record, short totals, and teams with no stats or name', async () => {
    global.fetch = ok({
      boxscore: {
        players: [
          // No statistics at all: no keys, no athletes.
          { team: { displayName: 'Japan' }, statistics: [] },
          // Starter with no athlete record; totals shorter than the columns.
          {
            team: { displayName: 'Mali' },
            statistics: [{ keys: ['minutes', 'points'], labels: ['MIN', 'PTS'], totals: ['200'], athletes: [{ starter: true, stats: ['1', '2'] }] }],
          },
        ],
        // First team has no `team` and no `statistics`; the second has a stat the first lacks.
        teams: [{}, { team: { displayName: 'Mali' }, statistics: [{ name: 'assists', displayValue: '9' }] }],
      },
      // One competitor with no line scores at all.
      header: { competitions: [{ competitors: [{ team: { displayName: 'Japan' } }, { team: { displayName: 'Mali' }, linescores: [{ displayValue: '1' }] }] }] },
    })
    const s = await fetchGameSummary('1')
    expect(s.box.sides[0].columns).toEqual([])
    expect(s.box.sides[0].starters).toEqual([])
    expect(s.box.sides[1].starters[0].name).toBe('Unknown')
    expect(s.box.sides[1].totals).toEqual({ minutes: '200', points: '' })
    expect(s.linescore).toBeNull()
    expect(s.teamStats.names).toEqual([null, 'Mali'])
    expect(s.teamStats.rows).toEqual([{ label: 'AST', values: [null, '9'], better: null }])
  })
})
