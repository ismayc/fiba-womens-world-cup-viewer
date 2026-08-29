import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the same build works both at the domain root (Netlify) and
  // under a sub-path (GitHub Pages: /fiba-womens-world-cup-viewer/).
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // Full-app tests under v8 instrumentation brush the default 5s ceiling on a
    // loaded CI runner (mount, several polls, a fake-timer refresh cycle). Give
    // them headroom so a busy runner doesn't flake a passing test.
    testTimeout: 15000,
    // Pin the suite's timezone so any test asserting a day heading, or what
    // counts as "today", is runner-independent.
    //
    // UTC is the right pin for THIS edition. Every game is in Berlin and tips
    // between 11:30 and 21:00 CEST, i.e. 09:30-19:00 UTC, so no game changes
    // calendar day under UTC and the day headings match Berlin's. A developer's
    // local zone does not have that property — America/Los_Angeles moves the
    // morning games back a day — which is why the pin exists and why local runs
    // must not drop it. test/timezone-pinned.test.js asserts the pin explicitly
    // so it cannot be deleted unnoticed on an already-UTC CI runner.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      all: true, // count untested files too, so the badge isn't flattered
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/**/*.test.{js,jsx}'],
      reporter: ['text-summary', 'json-summary', 'json'],
      // Enforced gate: the suite (and CI's coverage:badge step) fails if any
      // metric slips below these. Genuinely unreachable defensive arms carry an
      // inline `/* v8 ignore next -- why */` with a justification rather than
      // lowering a threshold.
      //
      // THESE ARE BELOW THE FAMILY'S 100% STANDARD, DELIBERATELY AND TEMPORARILY.
      // The six established viewers all enforce 100%; this one does not yet. The
      // logic layer — where every FIBA-specific rule lives, and where a bug would
      // silently produce a wrong table or a wrong bracket — is at 96% statements
      // (src/utils) and 96% (src/services), with utils/asItStands, bracketResolve,
      // eliminationCheck, opponentClinch, scenarios, slots, venue, week and
      // services/scoreNotify all at 100%. The shortfall is concentrated in the
      // presentational layer inherited from the sibling: App.jsx's filter and
      // spoiler branches, the mobile variants, and the modal focus-trap plumbing.
      //
      // The numbers below are the current floor, so the gate RATCHETS: coverage
      // can only go up. Raise them as the component tests fill in, and delete
      // this note once they reach 100.
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 75,
        lines: 87,
      },
    },
  },
})
