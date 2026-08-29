import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests.
afterEach(() => cleanup())

// Default fetch stub so components that load results on mount cannot reach the
// network during tests.
//
// This is an UNCONDITIONAL assignment on purpose. The inherited version guarded
// it with `if (!global.fetch)`, which has been dead since Node 18 shipped a
// built-in fetch, so the stub never installed and any test that forgot to mock
// went out to the real ESPN scoreboard. That makes the suite non-deterministic,
// slow, and quietly dependent on a live tournament feed. Individual tests still
// override global.fetch themselves.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))

// jsdom has no matchMedia. Default to "not matching" (desktop / wide) so layout
// hooks render their wide variant; tests that need the mobile branch override
// window.matchMedia themselves.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
