import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LEAGUE } from '../src/config/league.js'

// One card rendered "v" (football's separator) while nine other sites rendered "vs".
// Nothing caught it: each site is a different component, and no test compares them.
// This walks the rendered separators instead of trusting any one of them.
const DIR = join(import.meta.dirname, '../src/components')

describe('the home/away separator', () => {
  it('is the same everywhere it is rendered', () => {
    const found = new Map()
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.jsx'))) {
      const src = readFileSync(join(DIR, f), 'utf8')
      for (const m of src.matchAll(/<span className="(?:vs|nm-v|sc-entry-vs|gg-vs)">([^<{]+)<\/span>/g)) {
        found.set(`${f}:${m[1]}`, m[1].trim())
      }
    }
    const spellings = new Set(found.values())
    expect(
      [...spellings],
      `hardcoded separators found: ${[...found.keys()].join(', ')}`,
    ).toEqual([])
  })

  it('comes from the config, which says what basketball uses', () => {
    expect(LEAGUE.homeAwaySep).toBe('vs')
  })
})
