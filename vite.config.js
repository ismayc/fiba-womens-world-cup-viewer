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
    // One test file at a time. v8's per-worker coverage is merged after the run,
    // and with files in parallel that merge intermittently loses a function that
    // only App.jsx's inline handlers exercise — the toast-merge updater shows as
    // uncovered while its own test demonstrably renders the toast. Serializing
    // the files makes the 100% gate deterministic.
    //
    // Only premier-league and the hub carry this as well (verified 2026-08-30).
    // The other nine repos still run their test files in parallel and are still
    // exposed to that merge race; this comment used to claim the whole family
    // had the fix, which would have stopped anyone checking.
    fileParallelism: false,
    // Pin the suite's timezone so any test asserting a day heading, or what
    // counts as "today", is runner-independent.
    //
    // UTC is the right pin for THIS edition. Every game is in Berlin and tips
    // between 11:30 and 21:00 CEST, i.e. 09:30-19:00 UTC, so no game changes
    // calendar day under UTC and the day headings match Berlin's. A developer's
    // local zone does not have that property — America/Los_Angeles moves the
    // morning games back a day — which is why the pin exists and why local runs
    // must not drop it. test/guards.test.js asserts the pin explicitly
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
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
