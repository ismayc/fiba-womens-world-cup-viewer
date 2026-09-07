import { useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { normEspn } from '../services/espn.js'
import { orderSides } from '../services/summary.js'
import { LEAGUE } from '../config/league.js'

// The summary-derived section of the match detail: quarter line score, one box table
// per side, then the team-stat comparison. Takes the shared summary state (one fetch,
// owned by MatchDetail) and renders what is present. A box score reveals the result,
// so under spoiler-free mode the whole section sits behind its own reveal, the same
// way the tale of the tape does.
//
// Class prefix is `bs-`, not `bx-`: this app's Bracket already owns `bx-` for its
// column layout, and the WNBA sibling's `bx-name` would have collided with it.

const flagFor = (name) => FLAG_BY_TEAM[normEspn(name ?? '')] ?? ''

function Linescore({ rows }) {
  const periods = Math.max(...rows.map((r) => r.periods.length))
  const { regulationPeriods: REG, overtimeLabel: OT, periodShort: Q } = LEAGUE
  const label = (i) =>
    i < REG ? `${Q}${i + 1}` : i === REG ? OT : `${i - REG + 1}${OT}`
  const total = (r) => r.periods.reduce((sum, v) => sum + (Number(v) || 0), 0)
  return (
    <div className="bs-scroll">
      <table className="bs-line">
        <thead>
          <tr>
            <th className="bs-name" scope="col">
              <span className="sr-only">Team</span>
            </th>
            {Array.from({ length: periods }, (_, i) => (
              <th key={i} scope="col">
                {label(i)}
              </th>
            ))}
            <th scope="col">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th scope="row" className="bs-name">
                {flagFor(r.name)} {r.name}
              </th>
              {Array.from({ length: periods }, (_, i) => (
                <td key={i}>{r.periods[i] ?? ''}</td>
              ))}
              <td className="bs-total">{total(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// The four that answer "who played well". On a phone these fit with no sideways
// scroll at all; everything else is one tap away behind "More stats". Marked in the
// markup rather than filtered here, so the desktop table is unchanged and the
// narrow-screen rule is a media query rather than a viewport measurement in JS.
const CORE_COLS = new Set(['minutes', 'points', 'rebounds', 'assists'])
const extra = (key) => (CORE_COLS.has(key) ? undefined : 'bs-extra')

function BoxTable({ side, showAll }) {
  const rows = [...side.starters, ...side.bench]
  const benchStart = side.starters.length

  const cell = (p, key) => {
    if (p.dnp) return key === 'minutes' ? 'DNP' : ''
    const v = p.stats[key]
    return v == null || v === '' ? '–' : v
  }

  return (
    <div className="bs-team">
      <header className="bs-head">
        <span className="bs-flag">{flagFor(side.name)}</span>
        <strong>{side.name}</strong>
      </header>
      <div className="bs-scroll">
        <table className={showAll ? 'boxscore bs-all' : 'boxscore'}>
          <thead>
            <tr>
              <th className="bs-name" scope="col">
                Player
              </th>
              {side.columns.map((c) => (
                <th key={c.key} scope="col" className={extra(c.key)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id ?? p.name} className={i === benchStart ? 'bs-bench' : ''}>
                <th scope="row" className="bs-name">
                  <span className="bs-player">{p.name}</span>
                  {p.pos && <span className="bs-pos">{p.pos}</span>}
                </th>
                {side.columns.map((c) => (
                  <td key={c.key} className={extra(c.key)}>
                    {cell(p, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {side.totals && (
            <tfoot>
              <tr>
                <th scope="row" className="bs-name">
                  Totals
                </th>
                {side.columns.map((c) => (
                  <td key={c.key} className={extra(c.key)}>
                    {side.totals[c.key] || ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function TeamStats({ stats }) {
  return (
    <table className="bs-stats">
      <thead>
        <tr>
          <th scope="col">{flagFor(stats.names[0])} {stats.names[0]}</th>
          <th scope="col">
            <span className="sr-only">Stat</span>
          </th>
          <th scope="col">{stats.names[1]} {flagFor(stats.names[1])}</th>
        </tr>
      </thead>
      <tbody>
        {stats.rows.map((r) => (
          <tr key={r.label}>
            <td className={r.better === 0 ? 'bs-better' : ''}>{r.values[0] ?? '–'}</td>
            <th scope="row">{r.label}</th>
            <td className={r.better === 1 ? 'bs-better' : ''}>{r.values[1] ?? '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function BoxScoreSection({ summary, match, hidden, onReveal }) {
  // Declared before the early returns below: a hook cannot be called conditionally.
  const [showAll, setShowAll] = useState(false)

  if (hidden) {
    return (
      <div className="md-section">
        <h4>Box score</h4>
        <button className="md-reveal" onClick={onReveal}>
          🙈 reveal box score
        </button>
      </div>
    )
  }
  if (summary.status === 'loading') {
    return (
      <div className="md-section">
        <h4>Box score</h4>
        <p className="bs-note">Loading…</p>
      </div>
    )
  }
  const data = summary.data
  if (!data || (!data.box && !data.linescore && !data.teamStats)) {
    return (
      <div className="md-section">
        <h4>Box score</h4>
        <p className="bs-note">Not available for this game.</p>
      </div>
    )
  }
  const box = data.box ? orderSides(data.box.sides, match) : null
  return (
    <div className="md-section bs-section">
      <div className="bs-section-head">
        <h4>Box score</h4>
        {/* Both tables answer to one control: two toggles for the same decision is
            twice the tapping for no extra choice. Hidden above the phone
            breakpoint, where every column already fits. */}
        {box && (
          <button
            className="bs-more"
            onClick={() => setShowAll((s) => !s)}
            aria-expanded={showAll}
          >
            {showAll ? 'Fewer stats' : 'More stats'}
          </button>
        )}
      </div>
      {data.linescore && <Linescore rows={orderSides(data.linescore, match)} />}
      {box && (
        <div className="bs-sides">
          {box.map((side) => (
            <BoxTable key={side.name} side={side} showAll={showAll} />
          ))}
        </div>
      )}
      {data.teamStats && <TeamStats stats={data.teamStats} />}
    </div>
  )
}
