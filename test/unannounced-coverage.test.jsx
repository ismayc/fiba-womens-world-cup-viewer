// What the services picker says when a game has NO published platform.
//
// Every game of this edition has one: US coverage comes from Warner Bros.
// Discovery's own table (frozen in scripts/official.mjs), which named the
// platforms for all 36 games in August, including the rounds ESPN had not yet
// placed a fixture for. So `coverageSummary().unknown` is 0 across the committed
// board and this line never renders in production.
//
// It is still the line that keeps the picker honest. A viewer who ticks Cable
// and is told "you can watch 9 of 36" has been told something false if 12 of
// those 36 have no announced platform at all: they are shown anyway, and the
// count has to say so. A regeneration that emptied `tv` is exactly when that
// matters, and exactly when nobody is watching. Hence its own file, with the
// board mocked to contain one such game.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GAMES as FROZEN } from './fixtures/pretournament-games.js'

const BOARD = FROZEN.map((g) => (g.num === 36 ? { ...g, tv: [], tvNote: null } : g))

vi.mock('../src/data/games.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/pretournament-games.js')).GAMES.map((g) =>
    g.num === 36 ? { ...g, tv: [], tvNote: null } : g,
  ),
}))

import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { coverageSummary } from '../src/utils/watch.js'

beforeEach(() => localStorage.clear())

describe('a game with no announced platform', () => {
  it('is counted apart and promised to be shown anyway', () => {
    render(
      <ServicesProvider>
        <ServicesModal onClose={() => {}} />
      </ServicesProvider>,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Cable \/ Satellite/ }))
    expect(screen.getByText(/still to be announced, and are always shown/)).toBeInTheDocument()
    // 35 games have a platform, and cable carries 8 of them: the Final is the
    // one held back, and it is one of the nine cable would otherwise have.
    expect(coverageSummary(BOARD, ['cable'])).toEqual({
      total: 36,
      known: 35,
      unknown: 1,
      watchable: 8,
    })
  })
})
