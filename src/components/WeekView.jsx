import { useMemo, useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/games.js'
import { GROUP_COLORS, KNOCKOUT_COLOR, colorForGame } from '../data/groupColors.js'
import { dayKey, formatTime, statusFlag, teamKickoffTooltip, gameDayKey } from '../utils/time.js'
import { weekStartOf, addDays, weekLabel, weekdayHeader } from '../utils/week.js'
import { gamesByNum, feederTeams } from '../utils/bracket.js'
import { sideNames } from '../utils/slots.js'
import { useFollow } from '../context/follow.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'
import FeederPair from './FeederPair.jsx'
import DayMatchesModal from './DayMatchesModal.jsx'
import { venueFor } from '../utils/venue.js'

function Legend() {
  return (
    <div className="week-legend">
      {Object.entries(GROUP_COLORS).map(([g, c]) => (
        <span key={g} className="lg-item">
          <span className="lg-sw" style={{ background: c }} /> {g}
        </span>
      ))}
      <span className="lg-item">
        <span className="lg-sw" style={{ background: KNOCKOUT_COLOR }} /> Knockout
      </span>
    </div>
  )
}

function WeekCell({ m, tz, hidden, byNum }) {
  const { isFollowed } = useFollow()
  const openDetail = useDetail()
  const [side1, side2] = sideNames(m)
  const f1 = feederTeams(side1, byNum)
  const f2 = feederTeams(side2, byNum)
  const venue = venueFor(m)
  const color = colorForGame(m)
  const label = m.stage === 'Group' ? `Group ${m.group}` : STAGE_LABELS[m.stage]
  const flag = statusFlag(m)
  const voided = flag?.kind === 'voided'
  const awarded = flag?.kind === 'awarded'
  const showScore = Array.isArray(m.score) && !hidden
  // `ot`, not the football sibling's pens/aet: those fields do not exist on a
  // record in this repo, so the inherited expression was dead in both arms.
  const scoreText = showScore
    ? `${m.score[0]}–${m.score[1]}${m.ot ? (m.ot > 1 ? ` ${m.ot}OT` : ' OT') : ''}`
    : 'v'
  const cls = (name) => `wc-name${isFollowed(name) ? ' followed' : ''}`
  return (
    <button
      type="button"
      className="week-cell"
      style={{ borderLeftColor: color, background: `${color}1f` }}
      onClick={() => openDetail(m)}
    >
      <div className="wc-time">
        {/* Voided shows a muted pill instead of the kickoff time/live clock. */}
        {voided ? (
          <span className="status-badge" role="status" aria-label={flag.label}>
            {flag.label === 'Abandoned' || flag.label === 'Canceled' ? '⚠' : '⏸'} {flag.label}
          </span>
        ) : (
          <>
            {formatTime(m.ko, tz)}
            {m.live && <LiveBadge match={m} className="wc-live" />}
          </>
        )}
      </div>
      <div className="wc-team" title={f1 ? undefined : teamKickoffTooltip(m.ko, side1) || undefined}>
        {f1 ? (
          <FeederPair feeder={f1} />
        ) : (
          <>
            <span className="wc-flag">{FLAG_BY_TEAM[side1] || '•'}</span>
            <span className={cls(side1)}>{side1}</span>
          </>
        )}
      </div>
      <div className="wc-mid">
        {voided && showScore && <span className="status-badge">{flag.label}</span>}
        {scoreText}
        {awarded && showScore && <span className="awarded-note">awarded</span>}
      </div>
      <div className="wc-team" title={f2 ? undefined : teamKickoffTooltip(m.ko, side2) || undefined}>
        {f2 ? (
          <FeederPair feeder={f2} />
        ) : (
          <>
            <span className="wc-flag">{FLAG_BY_TEAM[side2] || '•'}</span>
            <span className={cls(side2)}>{side2}</span>
          </>
        )}
      </div>
      <div className="wc-foot">
        <span className="wc-stage" style={{ color }}>{label}</span>
        <span className="wc-venue">{venue.countryFlag} {venue.city}</span>
      </div>
    </button>
  )
}

export default function WeekView({ allMatches, shown, tz, dayHidden }) {
  // Lookup for expanding "Winner Match N" slots into their potential matchup.
  const byNum = useMemo(() => gamesByNum(allMatches), [allMatches])
  // Stable list of weeks (Sundays) that contain any match — drives navigation.
  const weeks = useMemo(() => {
    const set = new Set(allMatches.map((m) => weekStartOf(gameDayKey(m, tz))).filter(Boolean))
    return [...set].sort()
  }, [allMatches, tz])

  // Start on the week containing "today" if it has matches, else the first week.
  const [idx, setIdx] = useState(() => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const i = weeks.indexOf(weekStartOf(todayKey))
    return i >= 0 ? i : 0
  })

  const safeIdx = Math.max(0, Math.min(idx, weeks.length - 1))
  const weekStart = weeks[safeIdx]

  const byDay = useMemo(() => {
    const map = {}
    for (const m of shown) {
      const k = gameDayKey(m, tz)
      ;(map[k] ||= []).push(m)
    }
    for (const k in map) map[k].sort((a, b) => new Date(a.ko) - new Date(b.ko))
    return map
  }, [shown, tz])

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const total = days.reduce((n, d) => n + (byDay[d]?.length || 0), 0)

  // The day whose "all games" pop-up is open: { matches, hidden } or null.
  const [dayModal, setDayModal] = useState(null)

  return (
    <div className="weekview">
      <div className="week-nav">
        <button className="week-arrow" disabled={safeIdx <= 0} onClick={() => setIdx(safeIdx - 1)}>
          ◀ Prev
        </button>
        <div className="week-title">
          {weekLabel(weekStart)}
          <span className="week-count">
            · {total} game{total === 1 ? '' : 's'}
          </span>
        </div>
        <button
          className="week-arrow"
          disabled={safeIdx >= weeks.length - 1}
          onClick={() => setIdx(safeIdx + 1)}
        >
          Next ▶
        </button>
      </div>

      <Legend />

      <div className="week-grid">
        {days.map((d) => {
          const matches = byDay[d] || []
          const hdr = weekdayHeader(d)
          const hidden = dayHidden ? dayHidden(d) : false
          return (
            <div key={d} className={`week-col${matches.length ? '' : ' empty'}`}>
              <div className="week-col-head">
                <span className="wd">{hdr.wd}</span>
                <span className="dn">{hdr.day}</span>
                {matches.length > 0 && (
                  <button
                    type="button"
                    className="week-day-btn"
                    onClick={() => setDayModal({ matches, hidden })}
                    title={`Show all ${matches.length} game${matches.length === 1 ? '' : 's'} this day`}
                    aria-label={`Show all ${matches.length} game${matches.length === 1 ? '' : 's'} on ${hdr.wd} ${hdr.day}`}
                  >
                    ⤢
                  </button>
                )}
              </div>
              <div className="week-col-body">
                {matches.map((m) => (
                  <WeekCell key={m.num} m={m} tz={tz} hidden={hidden} byNum={byNum} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {dayModal && (
        <DayMatchesModal
          matches={dayModal.matches}
          tz={tz}
          hideScores={dayModal.hidden}
          byNum={byNum}
          onClose={() => setDayModal(null)}
        />
      )}
    </div>
  )
}
