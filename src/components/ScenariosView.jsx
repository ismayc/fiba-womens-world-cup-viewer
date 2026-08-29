import { useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { computeQualification, ADVANCING_PER_GROUP } from '../utils/qualification.js'
import { computeClinch } from '../utils/clinch.js'
import { projectKnockout } from '../utils/asItStands.js'
import { lockedOpponent } from '../utils/opponentClinch.js'
import { softTiebreaks, TIEBREAK_LABEL } from '../utils/tiebreakNotes.js'
import ScalesIcon from './ScalesIcon.jsx'
import {
  remainingGroupGames,
  applyScenarioPicks,
  unpickedCount,
  possibleOrderings,
  pickOutcome,
  PICK_SCORES,
} from '../utils/scenarios.js'

function Stepper({ value, onChange, label }) {
  /* v8 ignore next -- unreachable: a stepper only renders for a pick that is already a [home, away] pair of numbers */
  const v = value ?? 0
  return (
    <span className="sc-stepper">
      <button type="button" className="sc-step" onClick={() => onChange(Math.max(0, v - 1))} disabled={v <= 0} aria-label={`${label} minus`}>−</button>
      <span className="sc-step-val">{v}</span>
      <button type="button" className="sc-step" onClick={() => onChange(v + 1)} aria-label={`${label} plus`}>+</button>
    </span>
  )
}

function FixturePicker({ match, pick, onQuick, onScore }) {
  const outcome = pickOutcome(pick)
  const set = Array.isArray(pick)
  return (
    <div className="sc-fixture">
      <div className="sc-fx-line">
        <span className={`sc-fx-team${outcome === 'home' ? ' sc-win' : ''}`}>
          {FLAG_BY_TEAM[match.t1] || '•'} {match.t1}
        </span>
        <div className="sc-fx-buttons" role="group" aria-label={`${match.t1} vs ${match.t2} result`}>
          {/* Two buttons, not three. Basketball plays overtime until someone
              wins, so there is no draw to pick — a level score is not a possible
              result and offering one would build a board the ranking engine
              treats as a data error. */}
          <button type="button" className={`sc-pick${outcome === 'home' ? ' active' : ''}`} onClick={() => onQuick(match.num, 'home')} title={`${match.t1} win`}>W</button>
          <button type="button" className={`sc-pick${outcome === 'away' ? ' active' : ''}`} onClick={() => onQuick(match.num, 'away')} title={`${match.t2} win`}>W</button>
        </div>
        <span className={`sc-fx-team sc-fx-right${outcome === 'away' ? ' sc-win' : ''}`}>
          {match.t2} {FLAG_BY_TEAM[match.t2] || '•'}
        </span>
      </div>
      {set && (
        <div className="sc-score">
          <Stepper value={pick[0]} onChange={(n) => onScore(match.num, [n, pick[1]])} label={`${match.t1} points`} />
          <span className="sc-score-dash">{pick[0]}–{pick[1]}</span>
          <Stepper value={pick[1]} onChange={(n) => onScore(match.num, [pick[0], n])} label={`${match.t2} points`} />
        </div>
      )}
    </div>
  )
}

function ProjectedTable({ rows, decided, ties }) {
  return (
    <table className="sc-table">
      <thead>
        <tr>
          <th className="col-team">Projected {decided ? 'final' : 'order'}</th>
          <th>P</th><th title="Point difference">PD</th><th className="col-pts" title="FIBA points: 2 for a win, 1 for a loss">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tie = ties.get(r.name)
          return (
            <tr key={r.name} className={r.rank <= ADVANCING_PER_GROUP ? 'qualifies' : ''}>
              <td className="col-team">
                <span className="rank">{r.rank}</span>
                <span className="team-flag">{r.flag}</span>
                <span className="row-team">{r.name}</span>
                {tie && (
                  <span
                    className="sc-tiebreak"
                    title={`Level with ${tie.vs} on points, head-to-head, point difference and points scored — separated by ${TIEBREAK_LABEL[tie.reason]}`}
                    aria-label={`Separated from ${tie.vs} by ${TIEBREAK_LABEL[tie.reason]}`}
                  >
                    <ScalesIcon />
                  </span>
                )}
                {r.rank === 1 && <span className="sc-tag sc-adv">wins group → QF</span>}
                {r.rank > 1 && r.rank <= ADVANCING_PER_GROUP && (
                  <span className="sc-tag sc-adv">advances → QR</span>
                )}
              </td>
              <td>{r.P}</td>
              <td>{r.PD > 0 ? `+${r.PD}` : r.PD}</td>
              <td className="col-pts">{r.Pts}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// "As it stands → final phase" line for a projected qualifier. `confirmed` is
// true once the matchup is mathematically locked given the results set so far.
function EntryLine({ label, dest, confirmed }) {
  if (!dest?.team) return null
  return (
    <li className={`sc-r32-row${confirmed ? ' sc-r32-confirmed' : ''}`}>
      <span className="sc-r32-pos">{label}</span>
      {/* The team name comes out of a group table, so it is a committed member
          of this edition and always has a flag. The opponent is the one that can
          be missing: a group winner's quarter-final opponent is the winner of a
          qualification game, so it shows as that pending feed. */}
      <span className="sc-r32-team">{FLAG_BY_TEAM[dest.team]} {dest.team}</span>
      <span className="sc-r32-vs">vs</span>
      <span className="sc-r32-opp">
        {dest.opponent
          ? `${FLAG_BY_TEAM[dest.opponent]} ${dest.opponent}`
          : dest.opponentLabel || 'TBD'}
      </span>
      {dest.round && <span className="sc-r32-round">{dest.round}</span>}
      {dest.gameNum && <span className="sc-r32-num">G{dest.gameNum}</span>}
      {confirmed && <span className="sc-r32-lock" title="This matchup is confirmed — it can no longer change" aria-label="Matchup confirmed">✔️</span>}
    </li>
  )
}

// Representative scorelines for the two quick buttons; the steppers then let
// the user set any exact score, which matters because point difference is a
// FIBA tie-breaker and a one-point win ranks differently from a thirty-point one.
const QUICK = PICK_SCORES

export default function ScenariosView({ matches }) {
  const [picks, setPicks] = useState({})

  // Quick W/D/W: set a representative score, or clear it if that outcome is
  // already selected (toggle off).
  const onQuick = (num, outcome) =>
    setPicks((p) => {
      if (pickOutcome(p[num]) === outcome) {
        const { [num]: _drop, ...rest } = p
        return rest
      }
      return { ...p, [num]: QUICK[outcome] }
    })
  const onScore = (num, score) => setPicks((p) => ({ ...p, [num]: score }))
  const clear = () => setPicks({})

  const remaining = remainingGroupGames(matches)
  const groupsInPlay = Object.keys(remaining).sort()
  const synthetic = applyScenarioPicks(matches, picks)
  const qual = computeQualification(synthetic)
  const { perGroup } = projectKnockout(synthetic)
  const leftToPick = unpickedCount(matches, picks)
  const pickedAny = Object.keys(picks).length > 0

  // A projected matchup is "confirmed" once it can no longer change given the
  // results set so far.
  const clinch = computeClinch(synthetic)
  // Once every group is decided the whole bracket is fixed, so every matchup is
  // confirmed. Before then, fall back to the exact per-matchup lock check.
  const allComplete = qual.allComplete
  // `lockedOpponent` only resolves from a settled group placing, and a
  // qualification-round game locks only when BOTH of its groups are settled — so
  // check both sides rather than assuming the one being rendered is the settled
  // one. A group winner's quarter-final never locks this way: its opponent is
  // the winner of a game nobody has played, so isConfirmed correctly stays false
  // for it until the bracket itself resolves.
  const lockedBetween = (a, b, gameNum) => {
    const l = lockedOpponent(synthetic, a, clinch)
    return Boolean(l) && l.opponent === b && l.gameNum === gameNum
  }
  const isConfirmed = (dest) => {
    if (!dest?.team || !dest.opponent) return false
    if (allComplete) return true
    return lockedBetween(dest.team, dest.opponent, dest.gameNum) ||
      lockedBetween(dest.opponent, dest.team, dest.gameNum)
  }

  if (!groupsInPlay.length) {
    return (
      <div className="sc-empty">
        <p>🏁 Every group is decided — no scenarios left to explore.</p>
        <p className="sc-empty-sub">Head to the Bracket to see the final-phase matchups.</p>
      </div>
    )
  }

  return (
    <div className="scenarios">
      <div className="sc-intro">
        <p>
          Pick the winner of each remaining group game to see exactly how the standings and the
          final phase would shake out. Deterministic — no predictions, just the consequences of
          the results you choose.
        </p>
        <div className="sc-intro-bar">
          <span className="sc-left">{leftToPick} game{leftToPick === 1 ? '' : 's'} still open</span>
          {pickedAny && (
            <button className="sc-clear" onClick={clear}>Clear picks</button>
          )}
        </div>
      </div>

      <div className="sc-grid">
        {groupsInPlay.map((g) => {
          const open = remaining[g]
          const allPicked = open.every((m) => Array.isArray(picks[m.num]))
          /* v8 ignore next -- unreachable: projectKnockout seeds an entry for every group, so `perGroup[g]` is always there */
          const proj = perGroup[g] || {}
          // Distinct final standings still reachable given the results set so far.
          const { count, decided } = possibleOrderings(g, synthetic)
          // Placings that could only be decided by a drawing of lots.
          const ties = softTiebreaks(g, synthetic)
          return (
            <div className="sc-card" key={g}>
              <h3 className="group-title">
                Group {g}
                <span className={`sc-card-state${decided ? ' sc-decided' : ''}`}>
                  {count == null
                    ? `${open.filter((m) => !Array.isArray(picks[m.num])).length} to pick`
                    : decided
                      ? 'order decided'
                      : `${count} possible orders`}
                </span>
              </h3>

              <div className="sc-fixtures">
                {open.map((m) => (
                  <FixturePicker key={m.num} match={m} pick={picks[m.num]} onQuick={onQuick} onScore={onScore} />
                ))}
              </div>

              <ProjectedTable rows={qual.groups[g]} decided={allPicked} ties={ties} />

              <div className="sc-r32">
                <div className="sc-r32-title">Projected final phase</div>
                <ul className="sc-r32-list">
                  <EntryLine label="1st" dest={proj.first} confirmed={isConfirmed(proj.first)} />
                  <EntryLine label="2nd" dest={proj.second} confirmed={isConfirmed(proj.second)} />
                  <EntryLine label="3rd" dest={proj.third} confirmed={isConfirmed(proj.third)} />
                </ul>
              </div>
            </div>
          )
        })}
      </div>

      <p className="sc-foot">
        The two W buttons set a representative eight-point win; use the − / + steppers to set an
        exact score so point-difference tie-breakers resolve precisely. There is no draw button —
        basketball plays overtime until someone wins. “Possible orders” counts the distinct final
        standings still reachable for a group given the results you’ve set. A qualification-round
        game pairs two different groups, so an exact opponent only firms up as you set results in
        both; a group winner’s quarter-final opponent stays open longer still, because it is the
        winner of a qualification game. A <ScalesIcon /> marks a placing that could only be
        decided by a drawing of lots — once points, head-to-head, point difference and points
        scored are all level (hover it for the decider).
      </p>
    </div>
  )
}
