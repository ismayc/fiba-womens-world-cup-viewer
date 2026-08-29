import { useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/games.js'
import { US_BROADCAST } from '../data/broadcast.js'
import { formatTime, tzAbbrev, liveState, statusFlag, teamKickoffTooltip } from '../utils/time.js'
import { downloadICS } from '../utils/ics.js'
import { useFollow } from '../context/follow.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'
import FeederPair from './FeederPair.jsx'
import { clinchBadge } from '../utils/clinch.js'
import { feederTeams } from '../utils/bracket.js'
import { venueFor } from '../utils/venue.js'

// Tooltip describing which final-phase slot this team feeds into, given its
// group's slot map and any clinched status. Returns null when there is no slot
// context (e.g. a bracket placeholder).
//
// THREE routes exist per group, and they do not land in the same round: the
// winner byes to a quarter-final while 2nd and 3rd enter the qualification
// round. Only 4th is out. Naming the round per route is the point — "1st → QF"
// against "2nd → QR" is exactly what the group race is being played for.
function slotTooltip(group, slot, clinch) {
  if (!group || !slot) return null
  const qf = (num) => `Quarter-final · Game ${num}`
  const qr = (num) => `Qualification round · Game ${num}`
  if (clinch === 'won-group') return `Clinched Group ${group} winner → ${qf(slot.win)}`
  if (clinch === 'second') return `Clinched 2nd in Group ${group} → ${qr(slot.second)}`
  if (clinch === 'third') return `Clinched 3rd in Group ${group} → ${qr(slot.third)}`
  if (clinch === 'eliminated') return `Eliminated from Group ${group} — no final-phase slot`
  const parts = []
  if (slot.win) parts.push(`1st → ${qf(slot.win)} (bye)`)
  if (slot.second) parts.push(`2nd → ${qr(slot.second)}`)
  if (slot.third) parts.push(`3rd → ${qr(slot.third)}`)
  parts.push('4th → eliminated')
  return `Group ${group} final-phase route:\n${parts.join('\n')}`
}

function Team({ name, ko, clinch, group, slot, feeder }) {
  const flag = FLAG_BY_TEAM[name]
  const { isFollowed, toggle } = useFollow()
  // An unresolved bracket slot whose source game is set → show the potential
  // matchup (candidate pair) instead of a cryptic "Winner Game 27".
  if (feeder) {
    return (
      <div className="team team-feeder">
        <FeederPair feeder={feeder} />
      </div>
    )
  }
  const on = Boolean(flag) && isFollowed(name)
  const localTipoff = teamKickoffTooltip(ko, name)
  const badge = clinchBadge(clinch)
  // Bracket slot on the name; tip-off stays on the row (outside the name).
  const nameTitle = slotTooltip(group, slot, clinch) || undefined
  return (
    <div className={`team${on ? ' followed' : ''}`} title={localTipoff || undefined}>
      {flag && (
        <button
          className={`star${on ? ' on' : ''}`}
          onClick={() => toggle(name)}
          aria-pressed={on}
          aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
          title={on ? `Unfollow ${name}` : `Follow ${name}`}
        >
          {on ? '★' : '☆'}
        </button>
      )}
      <span className="team-flag">{flag || '🏳️'}</span>
      <span className={`team-name${flag ? '' : ' team-tbd'}`} title={nameTitle}>{name}</span>
      {badge && (
        <span className={`clinch-tag ${badge.cls}`} title={badge.title}>
          {badge.label} {badge.text}
        </span>
      )}
    </div>
  )
}

function Channels({ feed }) {
  return (
    <div className="feed">
      <div className="feed-lang">{feed.language}</div>
      <div className="feed-detail">
        <span className="feed-label">TV</span>
        {feed.tv.map((c) => (
          <span key={c} className={`chip${c === feed.freeOverTheAir ? ' chip-free' : ''}`}>
            {c}
            {c === feed.freeOverTheAir && <span className="free-tag">free</span>}
          </span>
        ))}
      </div>
      <div className="feed-detail">
        <span className="feed-label">Stream</span>
        {feed.streaming.map((s) => (
          <span key={s} className="chip chip-stream">
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function MatchCard({ match, tz, hidden = false, clinch, slotMap, byNum }) {
  const [showWatch, setShowWatch] = useState(false)
  const [revealScore, setRevealScore] = useState(false)
  const openDetail = useDetail()
  const venue = venueFor(match)
  const status = liveState(match)
  const flag = statusFlag(match)
  const voided = flag?.kind === 'voided'
  const awarded = flag?.kind === 'awarded'
  // FIBA announces the qualification-round and semi-final tip-off times only at
  // the end of the previous round, so those games ship with `ko: null` and
  // `tbdTip: true`. Everything time-shaped has to tolerate that rather than
  // formatting an Invalid Date.
  const tbd = !match.ko
  const viewerTime = formatTime(match.ko, tz)
  const viewerAbbr = tzAbbrev(match.ko, tz)
  const localTime = formatTime(match.ko, venue.tz)
  const localAbbr = tzAbbrev(match.ko, venue.tz)
  const sameClock = viewerTime === localTime && viewerAbbr === localAbbr

  const stageLabel =
    match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]

  // A score only exists once a match is recorded. In spoiler-free mode it stays
  // hidden behind a tap-to-reveal pill (per-card override of the day/global setting).
  const hasScore = Array.isArray(match.score)
  const scoreHidden = hasScore && hidden && !revealScore

  return (
    <article className={`card status-${status}`}>
      <div className="card-time">
        {/* Abandoned/postponed/canceled: a muted status pill instead of a
            kickoff time/countdown — it isn't a real result. */}
        {voided ? (
          <span className="status-badge" role="status" aria-label={flag.label}>
            {flag.label === 'Abandoned' || flag.label === 'Canceled' ? '⚠' : '⏸'} {flag.label}
          </span>
        ) : tbd ? (
          <span className="kickoff-tbd" title="FIBA announces this tip-off time at the end of the previous round">
            Time TBC
          </span>
        ) : (
          <>
            <div className="kickoff">{viewerTime}</div>
            <div className="kickoff-tz">{viewerAbbr}</div>
            {/* Optional per-match note (e.g. a weather-delayed start), shown by
                the listed kickoff time. */}
            {match.note && <div className="kickoff-note">({match.note})</div>}
            {/* Real in-match status from ESPN (clock/HT) beats the time-based guess;
                a match with a final score reads FT even if still inside the window.
                A paused (delayed/suspended) match shows the LiveBadge, not a countdown. */}
            {match.live ? (
              <LiveBadge match={match} />
            ) : status === 'live' ? (
              // Past kickoff but ESPN isn't ticking minutes yet → show "Delayed",
              // not a bare "LIVE". Once ESPN sends a clock the match.live branch
              // above takes over and shows the running time.
              <div className="badge-delayed" role="status" aria-label="Delayed">⏸ Delayed</div>
            ) : status === 'finished' ? (
              <div className="badge-done" aria-label="Full time">FT</div>
            ) : null}
          </>
        )}
      </div>

      <div className="card-body">
        <div className="card-head">
          <span className={`stage-badge stage-${match.stage}`}>{stageLabel}</span>
          <span className="match-num">Game {match.num}</span>
        </div>

        <div className="matchup">
          <Team name={match.t1} ko={match.ko} clinch={match.stage === 'Group' ? clinch?.[match.t1] : undefined} group={match.group} slot={slotMap?.[match.group]} feeder={feederTeams(match.t1, byNum)} />
          {hasScore ? (
            scoreHidden ? (
              <button
                className="score score-hidden"
                onClick={() => setRevealScore(true)}
                title="Reveal score"
              >
                🙈 <span className="score-hidden-label">tap to reveal</span>
              </button>
            ) : (
              <span className="score">
                {/* An abandoned match keeps a partial score for display only —
                    label it so it doesn't read as a normal final. */}
                {voided && <span className="status-badge">{flag.label}</span>}
                {match.score[0]}<span className="score-dash">–</span>{match.score[1]}
                {match.ot > 0 && (
                  <span className="score-extra">{match.ot > 1 ? `${match.ot}OT` : 'OT'}</span>
                )}
                {awarded && <span className="awarded-note">awarded</span>}
              </span>
            )
          ) : (
            <span className="vs">v</span>
          )}
          <Team name={match.t2} ko={match.ko} clinch={match.stage === 'Group' ? clinch?.[match.t2] : undefined} group={match.group} slot={slotMap?.[match.group]} feeder={feederTeams(match.t2, byNum)} />
        </div>

        <div className="venue">
          <span className="venue-flag">{venue.countryFlag}</span>
          <span className="venue-stadium">{venue.name}</span>
          <span className="venue-city">
            {venue.city}, {venue.country}
          </span>
          {!sameClock && (
            <span className="venue-local">
              · {localTime} {localAbbr} local
            </span>
          )}
        </div>

        <div className="card-actions">
          <button
            className="watch-toggle"
            onClick={() => setShowWatch((s) => !s)}
            aria-expanded={showWatch}
          >
            📺 How to watch (US) {showWatch ? '▲' : '▼'}
          </button>
          <button
            className="cal-btn"
            onClick={() => downloadICS(match)}
            title="Download .ics calendar file"
          >
            ＋ Add to calendar
          </button>
          <button className="cal-btn" onClick={() => openDetail(match)}>
            ℹ Details
          </button>
        </div>
        {showWatch && (
          <div className="watch">
            {/* This game's own channel first when ESPN filed one. There is only
                one language row: the US rights to this edition sit with a single
                family, so the football siblings' English/Spanish split has no
                counterpart here. */}
            {match.tv?.length > 0 && (
              <p className="watch-line watch-this">
                <strong>This game:</strong> {match.tv.join(' · ')}
              </p>
            )}
            <Channels feed={US_BROADCAST.english} />
          </div>
        )}
      </div>
    </article>
  )
}
