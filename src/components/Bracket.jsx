import { Fragment, useEffect, useMemo, useState } from 'react'
import { STAGE_LABELS } from '../data/games.js'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { BRACKET, gamesByNum, feederTeams, pathToFinal } from '../utils/bracket.js'
import { formatTime, tzAbbrev, statusFlag, teamKickoffTooltip } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { usePath } from '../context/path.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'
import PathPicker from './PathPicker.jsx'
import { venueFor } from '../utils/venue.js'
import { sideNames } from '../utils/slots.js'

// One of the two candidate teams inside a potential-matchup slot.
function FeederTeam({ name, pathTeam }) {
  const { isFollowed } = useFollow()
  const onPath = name === pathTeam
  return (
    <span className={`bx-feeder-team${isFollowed(name) ? ' followed' : ''}${onPath ? ' on-path-team' : ''}`}>
      {/* feederTeams() only resolves a feeder once BOTH candidates are real
          teams, so a candidate always has a flag (unlike a plain side below,
          which may still be an unresolved slot label). */}
      <span className="bx-flag">{FLAG_BY_TEAM[name]}</span>
      <span className="bx-team">{name}</span>
    </span>
  )
}

// Team names are pre-resolved upstream (clinched "Winner Group X" slots are
// already filled in the game data), so this renders whatever it is given —
// except a feed slot whose source game is set, which expands to the two
// potential teams. An unresolved slot falls back to its ORIGINAL LABEL, which
// this edition always has: FIBA published the whole bracket wiring before the
// draw, so a slot reads "2nd Group A" rather than an anonymous "TBD".
function Side({ name, ko, feeder, pathTeam }) {
  const { isFollowed } = useFollow()
  if (feeder) {
    return (
      <div
        className="bx-side bx-side-feeder"
        title={`${feeder.kind} of Game ${feeder.num}: ${feeder.a} or ${feeder.b}`}
      >
        <FeederTeam name={feeder.a} pathTeam={pathTeam} />
        <span className="bx-slash" aria-hidden="true">/</span>
        <FeederTeam name={feeder.b} pathTeam={pathTeam} />
      </div>
    )
  }
  const flag = FLAG_BY_TEAM[name]
  const on = Boolean(flag) && isFollowed(name)
  const onPath = Boolean(flag) && name === pathTeam
  return (
    <div
      className={`bx-side${on ? ' followed' : ''}${onPath ? ' on-path-team' : ''}`}
      title={teamKickoffTooltip(ko, name) || undefined}
    >
      <span className="bx-flag">{flag || '·'}</span>
      <span className={flag ? 'bx-team' : 'bx-tbd'}>{name}</span>
    </div>
  )
}

function BracketMatch({ num, byNum, tz, hideScores, pathTeam, path }) {
  const openDetail = useDetail()
  const m = byNum[num]
  if (!m) return null
  const venue = venueFor(m)
  // A final-phase game carries its slot LABEL until the teams are known, and its
  // tip-off time is announced only at the end of the previous round.
  const [side1, side2] = sideNames(m)
  const date = m.ko
    ? new Date(m.ko).toLocaleDateString('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric',
      })
    : null
  const flag = statusFlag(m)
  const voided = flag?.kind === 'voided'
  const awarded = flag?.kind === 'awarded'
  const showScore = m.score && !hideScores
  const f1 = feederTeams(side1, byNum)
  const f2 = feederTeams(side2, byNum)
  // Path-to-the-Final highlight: on the highlighted stretch of the route, and
  // whether this is the match where the team was knocked out.
  const onPath = path?.activeSet.has(num)
  const isExit = path?.exitNum === num
  const pathCls = onPath ? ` on-path${isExit ? ' path-exit' : ''}` : ''
  return (
    <div className={`bx-match${pathCls}`} id={`bx-m${m.num}`} role="button" tabIndex={0}
      aria-label={`${side1} versus ${side2}, ${STAGE_LABELS[m.stage]}, Game ${m.num}`}
      onClick={() => openDetail(m)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(m)}>
      <div className="bx-meta">
        <span>G{m.num}</span>
        {/* Voided (abandoned/postponed/canceled): a muted pill instead of a
            tip-off time. Otherwise the live clock, else the scheduled time —
            or the date alone while FIBA has still to confirm the tip. */}
        {voided ? (
          <span className="status-badge" role="status" aria-label={flag.label}>
            {flag.label === 'Abandoned' || flag.label === 'Canceled' ? '⚠' : '⏸'} {flag.label}
          </span>
        ) : m.live ? <LiveBadge match={m} /> : m.ko ? (
          <span>
            {date} · {formatTime(m.ko, tz)} {tzAbbrev(m.ko, tz)}
          </span>
        ) : (
          <span title="FIBA announces this tip-off time at the end of the previous round">
            {m.date ? new Date(`${m.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} · TBC
          </span>
        )}
      </div>
      <Side name={side1} ko={m.ko} feeder={f1} pathTeam={pathTeam} />
      {/* Both sides are potential-matchup pairs (all four teams shown) → a "vs"
          between the two pairs makes the (A/B) vs (C/D) reading clear. Wide
          layout only (hidden on the tall mobile rows). */}
      {f1 && f2 && <div className="bx-vs-divider" aria-hidden="true">vs</div>}
      <Side name={side2} ko={m.ko} feeder={f2} pathTeam={pathTeam} />
      {showScore && (
        <div className="bx-score">
          {voided && <span className="status-badge">{flag.label}</span>}
          {m.score[0]}–{m.score[1]}
          {m.ot > 0 && <span className="bx-pens"> {m.ot > 1 ? `${m.ot}OT` : 'OT'}</span>}
          {awarded && <span className="awarded-note">awarded</span>}
        </div>
      )}
      <div className="bx-venue">
        {venue.countryFlag} {venue.city}
      </div>
    </div>
  )
}

function Column({ title, nums, ...common }) {
  return (
    <div className="bx-col">
      <div className="bx-col-head">{title}</div>
      <div className="bx-col-body">
        {nums.map((n) => (
          <BracketMatch key={n} num={n} {...common} />
        ))}
      </div>
    </div>
  )
}

// Game numbers per final-phase round, both halves combined and in numeric order
// — the one-round-at-a-time mobile view. The Final round carries the third-place
// game alongside the Final, since the two are played on the same day and neither
// has a column of its own.
const bothHalves = (round) => [...BRACKET.left[round], ...BRACKET.right[round]].sort((a, b) => a - b)
const ROUNDS = [
  { key: 'QR', label: STAGE_LABELS.QR, short: 'Qual', nums: bothHalves('QR') },
  { key: 'QF', label: STAGE_LABELS.QF, short: 'QF', nums: bothHalves('QF') },
  { key: 'SF', label: STAGE_LABELS.SF, short: 'SF', nums: bothHalves('SF') },
  { key: 'Final', label: STAGE_LABELS.Final, short: '🏆 Final', nums: [...BRACKET.final, ...BRACKET.third] },
]
const roundOfMatch = (num) => ROUNDS.find((r) => r.nums.includes(num))?.key

// The round worth opening to: the earliest one still to be decided (the live /
// upcoming round), else the Final once everything is played.
function currentRound(byNum) {
  for (const r of ROUNDS) {
    if (r.nums.some((n) => { const m = byNum[n]; return m && !(m.score && !m.live) })) return r.key
  }
  return 'Final'
}

// Track a CSS media query (no SSR here, so reading matchMedia on mount is safe).
function useMediaQuery(query) {
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = () => setMatch(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return match
}

// Phones / small tablets: one round at a time, picked from a pill selector, as a
// full-width vertical list — no horizontal scrolling.
function MobileBracket({ common, activeRound, setActiveRound }) {
  /* v8 ignore next -- unreachable: activeRound only ever comes from currentRound() or a round button, both of which name a ROUNDS key */
  const round = ROUNDS.find((r) => r.key === activeRound) || ROUNDS[0]
  return (
    <>
      <div className="bx-rounds" role="tablist" aria-label="Final-phase rounds">
        {ROUNDS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={r.key === activeRound}
            aria-label={r.label}
            className={`bx-round-btn${r.key === activeRound ? ' active' : ''}`}
            onClick={() => setActiveRound(r.key)}
          >
            {r.short}
          </button>
        ))}
      </div>
      <div className="bx-mobile-list">
        {round.nums.map((n) => (
          <Fragment key={n}>
            {n === BRACKET.third[0] && <div className="bx-third-label">{STAGE_LABELS['3rd']}</div>}
            <BracketMatch num={n} {...common} />
          </Fragment>
        ))}
      </div>
    </>
  )
}

export default function Bracket({ matches, tz, hideScores, focusMatch, onFocusHandled }) {
  const byNum = gamesByNum(matches)
  const { pathTeam } = usePath()
  // The selected team's route (with a fast lookup set for per-match highlighting).
  const path = useMemo(() => {
    const p = pathTeam ? pathToFinal(pathTeam, byNum) : null
    return p ? { ...p, activeSet: new Set(p.active) } : null
  }, [pathTeam, byNum])
  const common = { byNum, tz, hideScores, pathTeam: path ? pathTeam : null, path }
  const hasPath = Boolean(path)
  const isMobile = useMediaQuery('(max-width: 720px)')
  const [activeRound, setActiveRound] = useState(() => currentRound(byNum))

  // Arriving from an "As it stands" link: on mobile switch to the target match's
  // round first (so the card is mounted), then scroll it into view and flash.
  // activeRound is in the deps so the second pass runs once the round is shown.
  useEffect(() => {
    if (focusMatch == null) return
    if (isMobile) {
      const r = roundOfMatch(focusMatch)
      if (r && r !== activeRound) {
        setActiveRound(r)
        return
      }
    }
    const el = document.getElementById(`bx-m${focusMatch}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' })
      el.classList.add('bx-focus')
      setTimeout(() => el.classList.remove('bx-focus'), 2200)
    }
    onFocusHandled?.()
  }, [focusMatch, isMobile, activeRound, onFocusHandled])

  return (
    <div className={`bracket-wrap${hasPath ? ' has-path' : ''}`}>
      <PathPicker byNum={byNum} />
      {isMobile ? (
        <MobileBracket common={common} activeRound={activeRound} setActiveRound={setActiveRound} />
      ) : (
        <>
          <p className="bracket-hint">
            Scroll horizontally to follow the path to the Final → Each quarter-final has just one
            feeding game: the other side is a group winner arriving on a bye.
          </p>
          <div className="bracket">
            <Column title={STAGE_LABELS.QR} nums={BRACKET.left.QR} {...common} />
            <Column title={STAGE_LABELS.QF} nums={BRACKET.left.QF} {...common} />
            <Column title={STAGE_LABELS.SF} nums={BRACKET.left.SF} {...common} />

            <div className="bx-col bx-col-final">
              <div className="bx-col-head bx-final-head">🏆 {STAGE_LABELS.Final}</div>
              <div className="bx-col-body">
                <BracketMatch num={BRACKET.final[0]} {...common} />
                <div className="bx-third-label">{STAGE_LABELS['3rd']}</div>
                <BracketMatch num={BRACKET.third[0]} {...common} />
              </div>
            </div>

            <Column title={STAGE_LABELS.SF} nums={BRACKET.right.SF} {...common} />
            <Column title={STAGE_LABELS.QF} nums={BRACKET.right.QF} {...common} />
            <Column title={STAGE_LABELS.QR} nums={BRACKET.right.QR} {...common} />
          </div>
        </>
      )}
    </div>
  )
}
