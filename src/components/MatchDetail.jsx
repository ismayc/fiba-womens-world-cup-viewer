import { useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/games.js'
import { US_BROADCAST } from '../data/broadcast.js'
import { teamRecord } from '../utils/tournamentStats.js'
import { formatTime, formatDateLong, tzAbbrev, liveState, statusFlag, teamKickoffTooltip } from '../utils/time.js'
import { downloadICS } from '../utils/ics.js'
import { useFollow } from '../context/follow.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'
import LiveBadge from './LiveBadge.jsx'
import { venueFor } from '../utils/venue.js'

// Minute label including stoppage time, e.g. "45+3'".

function FollowStar({ name }) {
  const { isFollowed, toggle } = useFollow()
  if (!FLAG_BY_TEAM[name]) return null
  const on = isFollowed(name)
  return (
    <button
      className={`star${on ? ' on' : ''}`}
      onClick={() => toggle(name)}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
      title={on ? `Unfollow ${name}` : `Follow ${name}`}
      aria-pressed={on}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

// THERE IS NO SCORING TIMELINE IN THIS APP. The football siblings render a
// minute-by-minute list of goals, cards and substitutions from ESPN's
// `competition.details`. ESPN's basketball scoreboard does not carry that array,
// and a basketball game's sixty-plus scoring plays would be a wall of noise
// rather than a timeline even if it did. What this app shows instead is the
// aggregate the sport actually cares about — the score, the period, and whether
// the game needed overtime — which is handled inline in the header below.

// "Tale of the tape" for a final-phase game: the two teams' tournament records
// side by side, computed from the merged game list. Only rendered once both
// slots hold real teams (a "Winner Game 27" placeholder has no record to show).
// Records are AS OF this game's tip-off, so a past game shows what each team had
// done going into it — not their record today.
//
// There is no W–D–L column: basketball has no draw, so the record is W–L and the
// overtime games are called out separately instead of a penalty-shootout note.
function TaleOfTheTape({ match, allMatches, label }) {
  const a = teamRecord(allMatches, match.t1, { before: match.ko })
  const b = teamRecord(allMatches, match.t2, { before: match.ko })
  if (!a.played || !b.played) return null
  const pd = (v) => (v > 0 ? `+${v}` : `${v}`)
  const record = (r) => `${r.w}–${r.l}${r.otWins ? ` (${r.otWins} in OT)` : ''}`
  /* v8 ignore next -- the em-dash arms are unreachable here: the tape only renders when BOTH teams have played, so `played` is never 0 and a run is never empty */
  const avg = (v, n) => (n ? (v / n).toFixed(1) : '—')
  /* v8 ignore next 2 -- see above: a team with games played always has a run */
  const streak = (r) =>
    r.streak > 0 ? `W${r.streak}` : r.streak < 0 ? `L${-r.streak}` : '—'
  const anyOt = a.otWins + a.otLosses + b.otWins + b.otLosses > 0
  const rows = [
    ['W–L', record(a), record(b)],
    ['Points per game', avg(a.pf, a.played), avg(b.pf, b.played)],
    ['Allowed per game', avg(a.pa, a.played), avg(b.pa, b.played)],
    ['Point difference', pd(a.pd), pd(b.pd)],
    ['Current run', streak(a), streak(b)],
    ...(anyOt
      ? [['Overtime games', a.otWins + a.otLosses, b.otWins + b.otLosses]]
      : []),
  ]
  return (
    <div className="md-section">
      <h4>{label}</h4>
      <table className="md-tape">
        <tbody>
          {rows.map(([label, va, vb]) => (
            <tr key={label}>
              <td className="tape-a">{va}</td>
              <th className="tape-label">{label}</th>
              <td className="tape-b">{vb}</td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  )
}

export default function MatchDetail({ match, tz, hideScores, allMatches, onClose }) {
  const [reveal, setReveal] = useState(false)
  const [revealStats, setRevealStats] = useState(false)
  const cardRef = useModalA11y(onClose)

  if (!match) return null
  const venue = venueFor(match)
  const stage = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]
  const status = liveState(match)
  const flag = statusFlag(match)
  const voided = flag?.kind === 'voided'
  const awarded = flag?.kind === 'awarded'
  const hasScore = Array.isArray(match.score)
  const scoreHidden = hasScore && hideScores && !reveal

  return (
    <div className="md-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="md-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="md-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="md-head">
          <span className="md-stage">{stage} · Match {match.num}</span>
          {voided ? (
            <span className="status-badge" role="status" aria-label={flag.label}>
              {flag.label === 'Abandoned' || flag.label === 'Canceled' ? '⚠' : '⏸'} {flag.label}
            </span>
          ) : match.live ? (
            <LiveBadge match={match} className="md-live" />
          ) : (
            // In-window but ESPN isn't ticking yet → delayed, not live.
            status === 'live' && <span className="badge-delayed" role="status">⏸ Delayed</span>
          )}
        </div>

        <div className="md-teams">
          <div className="md-team" title={teamKickoffTooltip(match.ko, match.t1) || undefined}>
            <span className="md-flag">{FLAG_BY_TEAM[match.t1] || '•'}</span>
            <span className="md-name">{match.t1}</span>
            <FollowStar name={match.t1} />
          </div>
          <div className="md-score">
            {hasScore ? (
              scoreHidden ? (
                <button className="md-reveal" onClick={() => setReveal(true)}>🙈 reveal</button>
              ) : (
                <>
                  {/* Abandoned keeps a partial score for display only — label it
                      and skip the source-confirmation badge; it's not a result. */}
                  {voided && <span className="status-badge">{flag.label}</span>}
                  {match.score[0]}–{match.score[1]}
                  {match.ot > 0 && (
                    <div className="md-extra">
                      after {match.ot > 1 ? `${match.ot} overtimes` : 'overtime'}
                    </div>
                  )}
                  {awarded && <span className="awarded-note">awarded</span>}
                </>
              )
            ) : (
              <span className="md-vs">vs</span>
            )}
          </div>
          <div className="md-team" title={teamKickoffTooltip(match.ko, match.t2) || undefined}>
            <span className="md-flag">{FLAG_BY_TEAM[match.t2] || '•'}</span>
            <span className="md-name">{match.t2}</span>
            <FollowStar name={match.t2} />
          </div>
        </div>

        <div className="md-meta">
          <div><strong>When</strong> {formatDateLong(match.ko, tz)} · {formatTime(match.ko, tz)} {tzAbbrev(match.ko, tz)}</div>
          <div><strong>Berlin local</strong> {formatTime(match.ko, venue.tz)} {tzAbbrev(match.ko, venue.tz)}</div>
          <div><strong>Arena</strong> {venue.countryFlag} {venue.name}, {venue.city}, {venue.country}</div>
          {match.tv?.length > 0 && (
            <div><strong>US TV</strong> {match.tv.join(' · ')}</div>
          )}
        </div>

        {/* Final-phase tale of the tape. A team's aggregate record reveals
            results, so spoiler-free mode keeps it behind its own reveal. A played
            game shows the records the teams took INTO it; an upcoming one, so
            far. */}
        {match.stage !== 'Group' &&
          allMatches &&
          FLAG_BY_TEAM[match.t1] &&
          FLAG_BY_TEAM[match.t2] &&
          (hideScores && !revealStats ? (
            <div className="md-section">
              <h4>{hasScore ? 'Going into this game' : 'Tournament so far'}</h4>
              <button className="md-reveal" onClick={() => setRevealStats(true)}>
                🙈 reveal team records
              </button>
            </div>
          ) : (
            <TaleOfTheTape
              match={match}
              allMatches={allMatches}
              label={hasScore ? 'Going into this game' : 'Tournament so far'}
            />
          ))}

        <div className="md-section">
          <h4>How to watch (US)</h4>
          <div className="md-watch">
            {/* This game's own channel when ESPN filed one, then the
                tournament-wide picture. Unlike the football siblings there is no
                Spanish-language row: the US rights to this edition sit with a
                single family, so listing a second language would be inventing
                coverage that does not exist. */}
            {match.tv?.length > 0 && (
              <div><span className="md-lang">This game</span> {match.tv.join(' · ')}</div>
            )}
            <div>
              <span className="md-lang">Edition</span> {US_BROADCAST.english.tv.join(' / ')} ·{' '}
              {US_BROADCAST.english.streaming.join(', ')}
            </div>
          </div>
        </div>

        <button className="md-cal" onClick={() => downloadICS(match)}>＋ Add to calendar</button>
      </div>
    </div>
  )
}
