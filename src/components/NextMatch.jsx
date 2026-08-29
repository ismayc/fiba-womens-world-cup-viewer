import { useEffect, useMemo, useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/games.js'
import { dayKey, formatTime, tzAbbrev, liveState, teamKickoffTooltip, gameDayKey } from '../utils/time.js'
import { decideGame } from '../utils/bracketResolve.js'
import { useFollow } from '../context/follow.jsx'
import LiveBadge from './LiveBadge.jsx'
import { venueFor } from '../utils/venue.js'

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

export default function NextMatch({ matches, tz }) {
  const { isFollowed, count } = useFollow()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const { mode, list, followed } = useMemo(() => {
    const involvesFollowed = (m) => isFollowed(m.t1) || isFollowed(m.t2)
    // A followed team playing live wins outright; otherwise stack every live
    // game — this tournament's final group round runs two at once by design.
    // No live game → the next upcoming one (preferring a followed team's).
    //
    // A game whose tip-off FIBA has not announced has no `ko`, so it cannot be
    // counted down to and is not offered as "next". It gains a time, and
    // therefore a countdown, as soon as ESPN publishes the fixture.
    const liveMatches = matches.filter((m) => liveState(m, now) === 'live')
    if (liveMatches.length) {
      // Followed teams that are live take over — show all of them (one or
      // several); otherwise stack every live match.
      const followedLive = liveMatches.filter(involvesFollowed)
      const list = followedLive.length ? followedLive : liveMatches
      return { mode: 'live', list, followed: followedLive.length > 0 }
    }
    const upcoming = matches
      .filter((m) => !m.voided && new Date(m.ko).getTime() > now)
      .sort((a, b) => new Date(a.ko) - new Date(b.ko))
    if (!upcoming.length) return { mode: 'next', list: [], followed: false }
    // A followed team's next game wins outright (single card). Otherwise no
    // favorite is driving the pick, so stack every match sharing the earliest
    // kickoff — final group matchdays run two simultaneous games.
    const followedNext = count > 0 ? upcoming.find(involvesFollowed) : null
    if (followedNext) return { mode: 'next', list: [followedNext], followed: true }
    const firstKo = new Date(upcoming[0].ko).getTime()
    const list = upcoming.filter((m) => new Date(m.ko).getTime() === firstKo)
    return { mode: 'next', list, followed: false }
  }, [matches, now, isFollowed, count])

  const jumpTo = (m) => {
    const el = document.getElementById(`day-${gameDayKey(m, tz)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!list.length) {
    // Tournament over: crown the winner of the Final if it's decided, otherwise
    // fall back to a generic message (final not yet recorded).
    const final = matches.find((m) => m.stage === 'Final')
    const result = final ? decideGame(final) : null
    if (result?.winner) {
      return (
        <div className="nextmatch done nextmatch-champ">
          <span className="nm-champ-line">
            <span className="nm-champ-trophy" aria-hidden="true">🏆</span>
            <span className="nm-champ-flag">{FLAG_BY_TEAM[result.winner] || ''}</span>
            <span className="nm-champ-name">{result.winner}</span>
            <span className="nm-champ-title">Women&rsquo;s World Cup champions!</span>
          </span>
          {result.loser && (
            <span className="nm-champ-runner">
              Runners-up: {FLAG_BY_TEAM[result.loser] || ''} {result.loser}
            </span>
          )}
        </div>
      )
    }
    return (
      <div className="nextmatch done">🏆 The tournament has concluded — champions crowned!</div>
    )
  }

  // Two-plus live matches and none followed → stack them as compact rows.
  if (mode === 'live' && list.length > 1) {
    return (
      <div className="nextmatch is-live nextmatch-stack">
        <div className="nm-label">
          🔴 Live now<span className="nm-stage">{list.length} games</span>
        </div>
        {list.map((m) => {
          const v = venueFor(m)
          const st = m.stage === 'Group' ? `Group ${m.group}` : STAGE_LABELS[m.stage]
          return (
            <button key={m.num} className="nm-live-row" onClick={() => jumpTo(m)}>
              <span className="nm-flag">{FLAG_BY_TEAM[m.t1] || '•'}</span>
              <span className="nm-row-name">{m.t1}</span>
              <span className="nm-v">vs</span>
              <span className="nm-row-name">{m.t2}</span>
              <span className="nm-flag">{FLAG_BY_TEAM[m.t2] || '•'}</span>
              <LiveBadge match={m} />
              <span className="nm-when">{st} · {v.city}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // Two-plus upcoming matches sharing the same kickoff and no favorite to single
  // out → stack them under one shared countdown.
  if (mode === 'next' && list.length > 1) {
    const first = list[0]
    const t = parts(new Date(first.ko).getTime() - now)
    return (
      <div className="nextmatch nextmatch-stack">
        <div className="nm-label">
          ⏱ Next games<span className="nm-stage">{list.length} at once</span>
        </div>
        {list.map((m) => {
          const v = venueFor(m)
          const st = m.stage === 'Group' ? `Group ${m.group}` : STAGE_LABELS[m.stage]
          return (
            <button key={m.num} className="nm-live-row" onClick={() => jumpTo(m)}>
              <span className="nm-flag">{FLAG_BY_TEAM[m.t1] || '•'}</span>
              <span className="nm-row-name">{m.t1}</span>
              <span className="nm-v">vs</span>
              <span className="nm-row-name">{m.t2}</span>
              <span className="nm-flag">{FLAG_BY_TEAM[m.t2] || '•'}</span>
              <span className="nm-when">{st} · {v.city}</span>
            </button>
          )
        })}
        <div className="nm-bottom nm-stack-bottom">
          <span className="nm-countdown" aria-label="time until kickoff">
            {t.d > 0 && <b>{t.d}<small>d</small></b>}
            <b>{t.h}<small>h</small></b>
            <b>{t.m}<small>m</small></b>
            <b>{t.s}<small>s</small></b>
          </span>
          <span className="nm-when">
            {formatTime(first.ko, tz)} {tzAbbrev(first.ko, tz)}
          </span>
        </div>
      </div>
    )
  }

  const match = list[0]
  const live = mode === 'live'
  const venue = venueFor(match)
  const stage = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]
  const t = parts(new Date(match.ko).getTime() - now)
  const jump = () => jumpTo(match)

  return (
    <div className={`nextmatch${live ? ' is-live' : ''}`}>
      <div className="nm-label">
        {live ? (match.live?.delayed ? `⏸ ${match.live.label || 'Delayed'}` : '🔴 Live now') : followed ? '⭐ Your next game' : '⏱ Next game'}
        <span className="nm-stage">{stage}</span>
      </div>

      <div className="nm-teams">
        <span className="nm-flag">{FLAG_BY_TEAM[match.t1] || '•'}</span>
        <span className="nm-name" title={teamKickoffTooltip(match.ko, match.t1) || undefined}>{match.t1}</span>
        <span className="nm-v">vs</span>
        <span className="nm-name nm-name-right" title={teamKickoffTooltip(match.ko, match.t2) || undefined}>{match.t2}</span>
        <span className="nm-flag">{FLAG_BY_TEAM[match.t2] || '•'}</span>
      </div>

      <div className="nm-bottom">
        {live ? (
          !match.live ? (
            // In its window but ESPN isn't ticking yet → delayed, not in progress.
            <span className="nm-countdown delayed">⏸ Delayed</span>
          ) : match.live.delayed ? (
            <span className="nm-countdown delayed">⏸ {match.live.label || 'Delayed'}</span>
          ) : (
            <span className="nm-countdown live">● in progress</span>
          )
        ) : (
          <span className="nm-countdown" aria-label="time until kickoff">
            {t.d > 0 && <b>{t.d}<small>d</small></b>}
            <b>{t.h}<small>h</small></b>
            <b>{t.m}<small>m</small></b>
            <b>{t.s}<small>s</small></b>
          </span>
        )}
        <span className="nm-when">
          {formatTime(match.ko, tz)} {tzAbbrev(match.ko, tz)} · {venue.city}
        </span>
        <button className="nm-jump" onClick={jump}>
          Jump to it ↓
        </button>
      </div>
    </div>
  )
}
