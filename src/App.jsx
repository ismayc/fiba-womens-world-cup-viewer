import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/games.js'
import { VENUES } from './data/venues.js'
import Filters from './components/Filters.jsx'
import MatchCard from './components/MatchCard.jsx'
import Bracket from './components/Bracket.jsx'
import Standings from './components/Standings.jsx'
import ScenariosView from './components/ScenariosView.jsx'
import WeekView from './components/WeekView.jsx'
import ChampionBanner from './components/ChampionBanner.jsx'
import NextMatch from './components/NextMatch.jsx'
import MatchDetail from './components/MatchDetail.jsx'
import CalendarModal from './components/CalendarModal.jsx'
import ScoreToasts from './components/ScoreToasts.jsx'
import { groupStageArchived, stageArchived } from './utils/scenarios.js'
import { detectTimezone, formatDateLong, dayKey, liveState, gameDayKey } from './utils/time.js'
import { readState, writeState } from './utils/urlState.js'
import { parseQuery, matchesSearch } from './utils/search.js'
import { fetchLive, applyLive, LIVE_SOURCE, historyDates } from './services/espn.js'
import { computeClinch } from './utils/clinch.js'
import { resolveBracket } from './utils/bracketResolve.js'
import { BRACKET, groupSlotMap, gamesByNum } from './utils/bracket.js'
import { detectFinals, finalNotification } from './services/scoreNotify.js'
import { useFollow } from './context/follow.jsx'
import { DetailContext } from './context/detail.js'

const REFRESH_MS = 120000 // auto-refresh every 2 minutes when nothing is live
const LIVE_REFRESH_MS = 30000 // poll every 30s while a game is in progress

const VIEWS = [
  { id: 'schedule', label: '📋 Schedule' },
  { id: 'week', label: '📆 Week' },
  { id: 'groups', label: '📊 Groups' },
  // Scenarios is a group-phase tool; it is hidden once the group phase is in the
  // rear-view (see `groupStageArchived`). The nav wraps to a second row on
  // mobile after Groups.
  { id: 'scenarios', label: '🧮 Scenarios', groupStageOnly: true },
  { id: 'bracket', label: '🏆 Bracket' },
]

// Stages that collapse out of the Schedule once every one of their games is
// final, so the list stays focused on what is still to come. Each can be brought
// back via the stage filter (the schedule note's "Show …" button). Ordered
// earliest-first; the Final is deliberately never auto-hidden.
// The third-place game is not listed: it is played on the same day as the Final,
// so hiding it would only ever blank the Schedule's last day.
const HIDEABLE_STAGES = [
  { stage: 'Group', title: 'Group phase', noun: 'group game' },
  { stage: 'QR', title: 'Qualification to quarter-finals', noun: 'qualification game' },
  { stage: 'QF', title: 'Quarter-finals', noun: 'quarter-final' },
  { stage: 'SF', title: 'Semi-finals', noun: 'semi-final' },
]

const INITIAL_FILTERS = {
  search: '',
  stages: [],
  group: 'all',
  team: 'all',
  country: 'all',
  region: 'all',
  venue: 'all',
  timeframe: 'all',
  myTeams: false,
}

// Result-alert preferences, persisted to localStorage. Alerts do not require
// Notification permission to be "on": the on-page toasts always work, and the
// browser-notification channel simply joins in when permission is granted.
const SCORE_ALERTS_KEY = 'fwwc:scoreAlerts'
function readScoreAlerts() {
  try {
    const v = JSON.parse(localStorage.getItem(SCORE_ALERTS_KEY) || '{}')
    return { enabled: Boolean(v.enabled), scope: v.scope === 'all' ? 'all' : 'followed' }
  } catch {
    return { enabled: false, scope: 'followed' }
  }
}

// How many filters are actively narrowing the results (ignores tz & feed view).
function countActiveFilters(f) {
  let n = 0
  if (f.search.trim()) n++
  if (f.myTeams) n++
  n += f.stages.length
  for (const k of ['group', 'team', 'country', 'region', 'venue', 'timeframe']) {
    if (f[k] !== 'all') n++
  }
  return n
}

export default function App() {
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(detectedTz), [detectedTz])
  const { followed, count: followCount } = useFollow()

  const [theme, setTheme] = useState(
    () => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark',
  )
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('fwwc:theme', next)
      } catch {
        /* ignore */
      }
      return next
    })

  const [detailMatch, setDetailMatch] = useState(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [view, setView] = useState(initial.view)
  // A match number to focus in the bracket (set when an "As it stands" link is
  // clicked); the Bracket scrolls to and highlights it, then clears this.
  const [focusMatch, setFocusMatch] = useState(null)
  const goToBracketMatch = (num) => {
    setFocusMatch(num)
    setView('bracket')
  }
  const [tz, setTz] = useState(initial.tz)
  const [filters, setFilters] = useState(initial.filters)
  const [hideScores, setHideScores] = useState(initial.hideScores)
  // Filter panel is collapsed by default; opens automatically if a shared URL
  // arrives with filters already applied.
  const [filtersOpen, setFiltersOpen] = useState(() => countActiveFilters(initial.filters) > 0)
  // Per-day spoiler overrides: dayKey -> bool. Undefined means "follow global".
  const [dayOverrides, setDayOverrides] = useState({})
  // Per-day fold overrides: dayKey -> bool. Undefined means "follow default"
  // (past days collapsed, today + future expanded).
  const [collapsedDays, setCollapsedDays] = useState({})
  // Past days show by default (as collapsed headers); the button drops them
  // from the schedule entirely for a phone-clean view that opens on today.
  const [showPast, setShowPast] = useState(true)

  // Results merged into the static schedule from ONE runtime source:
  //   • ESPN (`live`) — live overlay (running score + clock), plus `history`
  //     for finals that have aged out of its rolling scoreboard.
  // The sibling viewers reconcile across OpenFootball and TheSportsDB too.
  // Neither carries this competition: OpenFootball publishes the men's World
  // Cups only, and TheSportsDB's free tier has no women's data. The committed
  // schedule already holds every committed result, so nothing user-facing is lost —
  // only the independent runtime cross-check. See services/teamNames.js.
  const [live, setLive] = useState(null)
  const [history, setHistory] = useState(null)
  const [resultsState, setResultsState] = useState('loading') // loading | ok | error
  const [updatedAt, setUpdatedAt] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [scoreAlerts, setScoreAlerts] = useState(readScoreAlerts)
  // On-page result toasts (the in-app twin of the browser notification); ids are
  // the notification tag so one result can never stack twice.
  const [toasts, setToasts] = useState([])
  const dismissToast = useCallback(
    (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  )
  const abortRef = useRef(null)
  // Last seen finality snapshot (game num -> boolean), for diffing new results.
  const finalSnapRef = useRef(null)

  const loadResults = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setResultsState((s) => (s === 'ok' ? 'ok' : 'loading'))
    // ESPN is the only runtime source here (see services/teamNames.js for why),
    // so it gates the status bar on its own.
    try {
      setLive(await fetchLive(ctrl.signal))
      setResultsState('ok')
      setUpdatedAt(Date.now())
    } catch (err) {
      if (err?.name !== 'AbortError') setResultsState('error')
    }
  }, [])

  useEffect(() => {
    loadResults()
    return () => abortRef.current?.abort()
  }, [loadResults])

  // Backfill cards/subs for matches that finished before the live window. ESPN
  // drops them from the rolling scoreboard after a couple of days, so without an
  // explicit by-date fetch their detail timelines lose their 🟨🟥. This data is
  // static once a match ends, so we fetch it once (no polling) and overlay it
  // beneath the live window, which still wins for anything recent.
  useEffect(() => {
    const ctrl = new AbortController()
    fetchLive(ctrl.signal, historyDates(GAMES))
      .then((map) => map.size && setHistory(map))
      .catch(() => {}) // best-effort; the committed schedule still renders
    return () => ctrl.abort()
  }, [])

  // Merge into the schedule (immutably): the committed schedule already holds
  // every result for this finished edition, so ESPN only overlays live and
  // just-finished scores on top.
  //
  // NO CROSS-SOURCE CONFIRMATION BADGE HERE. The sibling viewers annotate each
  // final with how many independent feeds confirm it; that needs two runtime
  // sources and this app has one (see services/espn.js). Counting the committed
  // schedule as the second would overclaim — scripts/fetch-tournament.mjs
  // builds it partly FROM ESPN, so the two are not independent.
  const matches = useMemo(
    () => applyLive(applyLive(GAMES, history), live),
    [live, history],
  )
  const finishedCount = useMemo(() => matches.filter((m) => m.score).length, [matches])
  const liveCount = useMemo(() => matches.filter((m) => m.live).length, [matches])
  // Tournament over: nothing live and no non-voided match still to come. Once
  // true there's nothing left for the feeds to add, so we stop the auto-refresh
  // interval (the one-shot mount fetch still runs, so a fresh load post-final
  // still gets the results).
  const concluded = useMemo(
    () => liveCount === 0 && !matches.some((m) => !m.voided && new Date(m.ko).getTime() > Date.now()),
    [matches, liveCount],
  )
  // The group-stage tools (Scenarios, QF Outlook) drop out of the nav a day
  // after the last group game, once the knockouts take over.
  const archived = useMemo(() => groupStageArchived(matches), [matches])
  const visibleViews = useMemo(
    () => VIEWS.filter((v) => !(v.groupStageOnly && archived)),
    [archived],
  )
  const viewSwitchRef = useRef(null)
  // The in-flow view switch has scrolled out of view (see the IntersectionObserver below).
  const [navAway, setNavAway] = useState(false)
  // The condensed strip's expanded tab set. Component-local — never persisted.
  const [stripOpen, setStripOpen] = useState(false)
  // Condensed view strip: once the header's view switch scrolls out of view, a slim
  // fixed strip takes over so switching views never means scrolling back to the top.
  // The strip collapses again (and its expanded tab set closes) when the nav returns.
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(([entry]) => {
      const away = !entry.isIntersecting
      setNavAway(away)
      if (!away) setStripOpen(false)
    })
    io.observe(viewSwitchRef.current)
    return () => io.disconnect()
  }, [])
  const pickView = (id) => {
    setView(id)
    setStripOpen(false)
  }
  const showAnalysisTabs = !archived
  // If the active view just got hidden (group stage archived while on it), fall
  // back to the Bracket.
  useEffect(() => {
    if (!visibleViews.some((v) => v.id === view)) setView('bracket')
  }, [visibleViews, view])
  // Guaranteed clinch/elimination status per team (see utils/clinch.js).
  const clinch = useMemo(() => computeClinch(matches), [matches])
  // Group → the final-phase game each finishing position feeds into.
  const slotMap = useMemo(() => groupSlotMap(GAMES), [])
  // Resolve every settled knockout placeholder into the real team — group
  // winners + runners-up, then knockout-match winners AND losers as each round
  // plays (the losers matter: they fill the third-place play-off) — so the
  // resolved team reaches every view consistently (schedule, week, bracket,
  // detail modal, calendar), not just the bracket's own rendering.
  const displayMatches = useMemo(() => resolveBracket(matches, clinch), [matches, clinch])
  // Lookup for expanding "Winner Match N" slots into their potential matchup on
  // the Schedule/Week cards (same as the Bracket).
  const byNum = useMemo(() => gamesByNum(displayMatches), [displayMatches])

  // Auto-refresh: poll fast (30s) while a match is live so the score and clock
  // track ESPN closely, and slow (2 min) otherwise to go easy on the feeds.
  // Once the tournament has concluded there's nothing left to fetch, so we stop.
  useEffect(() => {
    if (!autoRefresh || concluded) return
    const id = setInterval(loadResults, liveCount > 0 ? LIVE_REFRESH_MS : REFRESH_MS)
    return () => clearInterval(id)
  }, [autoRefresh, loadResults, liveCount, concluded])

  // Persist result-alert preferences.
  useEffect(() => {
    try {
      localStorage.setItem(SCORE_ALERTS_KEY, JSON.stringify(scoreAlerts))
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [scoreAlerts])

  // Result alerts: diff each merged snapshot against the last and, for any game
  // that has just gone final within scope, raise BOTH an on-page toast (always —
  // the OS often mutes notifications for the focused tab, which is exactly when
  // you are watching) and a browser notification (when permission allows;
  // clicking it focuses the app and opens that game). The snapshot is always
  // advanced (even when alerts are off) so enabling mid-tournament does not
  // replay results already on the board. Fires only while this tab is open — the
  // static site has no backend for true background push.
  useEffect(() => {
    const { next, events } = detectFinals(finalSnapRef.current, matches, {
      scope: scoreAlerts.scope,
      followed,
    })
    finalSnapRef.current = next
    if (!scoreAlerts.enabled || events.length === 0) return
    // Defense-in-depth: a healthy poll yields at most a couple of new results —
    // though this tournament legitimately ends two games at once, since a
    // group's last two games tip off simultaneously. A batch larger than that
    // means the snapshot desynced; suppress rather than spam. The snapshot is
    // already advanced above, so these stay silent and will not re-fire.
    if (events.length > 5) return
    setToasts((t) => {
      const have = new Set(t.map((x) => x.id))
      const fresh = events
        .map((ev) => ({ id: `${finalNotification(ev).tag}`, ev }))
        .filter((x) => !have.has(x.id))
      return fresh.length ? [...t, ...fresh] : t
    })
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const icon = `${import.meta.env.BASE_URL}icon-192.png`
    for (const ev of events) {
      const n = finalNotification(ev)
      try {
        const note = new Notification(n.title, { body: n.body, tag: n.tag, icon, renotify: true })
        note.onclick = () => {
          try {
            window.focus()
          } catch {
            /* ignore */
          }
          setDetailMatch(ev.game)
          note.close()
        }
      } catch {
        /* some browsers throw if constructed outside a SW; ignore */
      }
    }
  }, [matches, scoreAlerts, followed])

  // Turn result alerts on/off. Toasts work regardless of Notification permission,
  // so enabling never blocks on it — but we still ask (from this user gesture,
  // as required) so the OS notification channel comes along when allowed.
  const toggleScoreAlerts = useCallback(async () => {
    if (scoreAlerts.enabled) {
      setScoreAlerts((s) => ({ ...s, enabled: false }))
      return
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        /* denied or unsupported — toasts still work */
      }
    }
    setScoreAlerts((s) => ({ ...s, enabled: true }))
  }, [scoreAlerts.enabled])

  // Keep the URL in sync with shareable state.
  useEffect(() => {
    writeState({ view, tz, hideScores, filters }, detectedTz)
  }, [view, tz, hideScores, filters, detectedTz])

  const dayHidden = (key) =>
    dayOverrides[key] !== undefined ? dayOverrides[key] : hideScores

  const toggleDay = (key) =>
    setDayOverrides((o) => ({ ...o, [key]: !dayHidden(key) }))

  // Today's dayKey in the viewer's timezone — days before it are "past" and
  // fold closed by default so the schedule opens on what's still to come.
  const todayKey = useMemo(() => dayKey(Date.now(), tz), [tz])
  const dayCollapsed = (key) =>
    collapsedDays[key] !== undefined ? collapsedDays[key] : key < todayKey
  const toggleCollapsed = (key) =>
    setCollapsedDays((c) => ({ ...c, [key]: !dayCollapsed(key) }))

  const activeCount = useMemo(() => countActiveFilters(filters), [filters])

  const filtered = useMemo(() => {
    const parsed = parseQuery(filters.search)
    return displayMatches.filter((m) => {
      const venue = VENUES[m.venue]
      if (filters.myTeams && followed.size && !(followed.has(m.t1) || followed.has(m.t2)))
        return false
      if (filters.stages.length && !filters.stages.includes(m.stage)) return false
      if (filters.group !== 'all' && m.group !== filters.group) return false
      if (filters.team !== 'all' && m.t1 !== filters.team && m.t2 !== filters.team) return false
      if (filters.country !== 'all' && venue.country !== filters.country) return false
      if (filters.region !== 'all' && venue.region !== filters.region) return false
      if (filters.venue !== 'all' && m.venue !== filters.venue) return false
      // liveState prefers real feed data: a scored match reads "finished" even
      // inside the time window, and only m.live (or a scoreless time-window
      // match) reads "live" — so "Live now" never shows a finished game.
      if (filters.timeframe !== 'all' && liveState(m) !== filters.timeframe) return false
      if (!matchesSearch(m, venue, parsed)) return false
      return true
    })
  }, [filters, displayMatches, followed])

  // Once a stage is fully played it drops out of the Schedule by default, so the
  // list opens on what's still to come — unless the user picks that stage's filter
  // to bring it back. Scoped to the Schedule list only (Week still shows all of
  // `filtered`). Applies as each round finishes (group stage, then the round of 16, …).
  const hiddenStages = useMemo(
    () => HIDEABLE_STAGES.filter((s) => stageArchived(matches, s.stage) && !filters.stages.includes(s.stage)),
    [matches, filters.stages],
  )
  const scheduleMatches = useMemo(() => {
    if (!hiddenStages.length) return filtered
    const hide = new Set(hiddenStages.map((s) => s.stage))
    return filtered.filter((m) => !hide.has(m.stage))
  }, [filtered, hiddenStages])
  // How many games each hidden stage is holding back (from the otherwise-filtered
  // set), for the "N … hidden" note. A stage with 0 (filtered out anyway) shows no note.
  const hiddenStageNotes = useMemo(
    () =>
      hiddenStages
        .map((s) => ({ ...s, count: filtered.filter((m) => m.stage === s.stage).length }))
        .filter((s) => s.count > 0),
    [hiddenStages, filtered],
  )

  const days = useMemo(() => {
    const map = new Map()
    for (const m of scheduleMatches) {
      const key = gameDayKey(m, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(m)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [scheduleMatches, tz])

  // Past days render as collapsed sections by default (and expand per-day as
  // usual); "Hide past days" drops them from the schedule entirely.
  const pastDayKeys = useMemo(
    () => days.map(([k]) => k).filter((k) => k < todayKey),
    [days, todayKey],
  )
  const visibleDays = showPast ? days : days.filter(([k]) => k >= todayKey)

  return (
    <DetailContext.Provider value={setDetailMatch}>
    <div className={`app${navAway ? ' nav-away' : ''}`}>
      <header className="app-header">
        <div className="title-block">
          <h1>
            <span className="trophy">🏀</span> FIBA Women&rsquo;s World Cup 2026
          </h1>
          <p className="subtitle">
            All {GAMES.length} games · Berlin · shown in{' '}
            <strong>{tz.replace(/_/g, ' ')}</strong>
          </p>
        </div>
        <div className="view-bar">
          <div className="view-switch" ref={viewSwitchRef}>
            {visibleViews.map((v) => (
              <Fragment key={v.id}>
                <button
                  className={`view-btn${view === v.id ? ' active' : ''}`}
                  onClick={() => pickView(v.id)}
                >
                  {v.label}
                </button>
                {/* Force a second row after Groups on mobile (only when the
                    analysis tabs are present). */}
                {v.id === 'groups' && showAnalysisTabs && <span className="view-break" aria-hidden="true" />}
              </Fragment>
            ))}
          </div>
          <div className="bar-actions">
            <button
              className={`spoiler-btn${hideScores ? ' active' : ''}`}
              onClick={() => {
                setHideScores((h) => !h)
                setDayOverrides({}) // global change resets per-day overrides
              }}
              title="Toggle spoiler-free mode for all scores"
            >
              {hideScores ? '🙈 Scores hidden' : '👁 Scores shown'}
            </button>
            <button className="icon-btn" onClick={() => setCalendarOpen(true)} title="Calendar subscribe & export">
              📤 Calendar
            </button>
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title="Toggle light / dark theme"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? '🌙' : '🌞'}
            </button>
          </div>
        </div>
      </header>

      {navAway && (
        <div className="view-strip">
          <div className="view-strip-inner">
            <button
              className="view-strip-toggle"
              onClick={() => setStripOpen((o) => !o)}
              aria-expanded={stripOpen}
              aria-controls="view-strip-tabs"
            >
              {VIEWS.find((v) => v.id === view).label}
              <span className="chev" aria-hidden="true">
                {stripOpen ? '▲' : '▼'}
              </span>
            </button>
            {stripOpen && (
              <nav id="view-strip-tabs" className="view-strip-tabs" aria-label="Views quick switch">
                {visibleViews.map((v) => (
                  <button
                    key={v.id}
                    className={`view-btn${view === v.id ? ' active' : ''}`}
                    onClick={() => pickView(v.id)}
                    aria-current={view === v.id ? 'page' : undefined}
                  >
                    {v.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      )}

      {/* Once the Final is FINAL, the champion gets their banner (hidden in
          spoiler-free mode — it's the ultimate spoiler). */}
      <ChampionBanner
        match={displayMatches.find((m) => m.num === BRACKET.final[0])}
        hideScores={hideScores}
      />

      <div className={`results-bar results-${resultsState}`}>
        <span className="results-dot" />
        <span className="results-text">
          {resultsState === 'loading' && 'Loading live results…'}
          {resultsState === 'error' && 'Couldn’t reach results feed — showing schedule only.'}
          {resultsState === 'ok' && finishedCount > 0 && `${finishedCount} game${finishedCount === 1 ? '' : 's'} with scores`}
          {resultsState === 'ok' && finishedCount === 0 && 'No results yet, tip-off is September 4, 2026'}
        </span>
        {liveCount > 0 && (
          <span className="results-live">● {liveCount} live now</span>
        )}
        {updatedAt && resultsState === 'ok' && (
          <span className="results-updated">
            updated{' '}
            {new Date(updatedAt).toLocaleTimeString('en-US', {
              timeZone: tz,
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
        <span className="results-source">
          live via{' '}
          <a href={LIVE_SOURCE.homepage} target="_blank" rel="noopener noreferrer">
            {LIVE_SOURCE.name}
          </a>
        </span>
        {/* Once the tournament has concluded the poll loop is stopped for good,
            so show the box unticked and disabled rather than advertising an
            auto-refresh that can never fire. */}
        <label
          className={`results-auto${concluded ? ' results-auto-off' : ''}`}
          title={
            concluded
              ? 'Tournament complete — auto-refresh is off for good'
              : 'Re-fetch scores periodically (faster while a game is live)'
          }
        >
          <input
            type="checkbox"
            checked={autoRefresh && !concluded}
            disabled={concluded}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          auto
        </label>
        <label
          className="results-alerts"
          title="On-page toast + browser notification when a game goes final (while the app is open)"
        >
          <input type="checkbox" checked={scoreAlerts.enabled} onChange={toggleScoreAlerts} />
          🔔 results
        </label>
        {scoreAlerts.enabled && (
          <select
            className="results-alert-scope"
            value={scoreAlerts.scope}
            onChange={(e) => setScoreAlerts((s) => ({ ...s, scope: e.target.value }))}
            title="Which games trigger a result alert"
            aria-label="Result-alert scope"
          >
            <option value="followed">⭐ my teams</option>
            <option value="all">all games</option>
          </select>
        )}
        <button className="results-refresh" onClick={loadResults} disabled={resultsState === 'loading'}>
          ⟳ Refresh
        </button>
      </div>

      {(view === 'schedule' || view === 'week') && (
        <>
          <div className="controls-bar">
            <button
              className={`filters-toggle${filtersOpen ? ' open' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
            >
              ⚙ Filters &amp; Search
              {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
              <span className="chev">{filtersOpen ? '▲' : '▼'}</span>
            </button>
            {followCount > 0 && (
              <button
                className={`myteams-btn${filters.myTeams ? ' active' : ''}`}
                onClick={() => setFilters((f) => ({ ...f, myTeams: !f.myTeams }))}
                title="Show only games with teams you follow"
              >
                ⭐ My Teams <span className="myteams-count">{followCount}</span>
              </button>
            )}
            {view === 'schedule' && pastDayKeys.length > 0 && (
              <button
                className="pastdays-btn"
                onClick={() => setShowPast((s) => !s)}
                title={showPast ? 'Hide past days from the schedule' : 'Show past days'}
              >
                <span className="chev" aria-hidden="true">{showPast ? '▾' : '▸'}</span>
                {showPast ? 'Hide past days' : 'Show past days'}
                <span className="myteams-count">{pastDayKeys.length}</span>
              </button>
            )}
            {activeCount > 0 && (
              <button className="clear-mini" onClick={() => setFilters(INITIAL_FILTERS)}>
                Clear all
              </button>
            )}
          </div>
          {filtersOpen && (
            <Filters
              filters={filters}
              setFilters={setFilters}
              tz={tz}
              setTz={setTz}
              detectedTz={detectedTz}
              resultCount={filtered.length}
            />
          )}
        </>
      )}

      {view === 'week' && (
        <main className="week-view">
          <WeekView allMatches={displayMatches} shown={filtered} tz={tz} dayHidden={dayHidden} />
        </main>
      )}

      {view === 'schedule' && (
        <>
          <NextMatch matches={displayMatches} tz={tz} />
          {hiddenStageNotes.map((s) => (
            <p key={s.stage} className="schedule-note">
              {s.title} complete — {s.count} {s.noun}
              {s.count === 1 ? '' : 's'} hidden.{' '}
              <button
                className="linklike"
                onClick={() => setFilters((f) => ({ ...f, stages: [...new Set([...f.stages, s.stage])] }))}
              >
                Show {s.noun}s
              </button>
            </p>
          ))}
          <main className="schedule">
            {days.length === 0 && (
              <div className="empty">
                <p>No games match your filters.</p>
              </div>
            )}
            {visibleDays.map(([key, matches]) => {
              const hidden = dayHidden(key)
              const collapsed = dayCollapsed(key)
              return (
                <section key={key} id={`day-${key}`} className={`day${collapsed ? ' collapsed' : ''}`}>
                  <div className="day-header">
                    <button
                      className="day-toggle"
                      onClick={() => toggleCollapsed(key)}
                      aria-expanded={!collapsed}
                    >
                      <span className="day-chev" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                      <h2>{formatDateLong(matches[0].ko, tz)}</h2>
                      <span className="day-count">
                        {matches.length} game{matches.length === 1 ? '' : 's'}
                      </span>
                    </button>
                    {!collapsed && (
                      <button className="day-spoiler" onClick={() => toggleDay(key)}>
                        {hidden ? '🙈 Show scores' : '👁 Hide scores'}
                      </button>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="day-matches">
                      {matches.map((m) => (
                        <MatchCard key={m.num} match={m} tz={tz} hidden={hidden} clinch={clinch} slotMap={slotMap} byNum={byNum} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </main>
        </>
      )}

      {view === 'groups' && (
        <main className="groups-view">
          <Standings matches={matches} tz={tz} hideScores={hideScores} clinch={clinch} onGoToMatch={goToBracketMatch} />
        </main>
      )}

      {view === 'scenarios' && (
        <main className="scenarios-view">
          <ScenariosView matches={matches} />
        </main>
      )}

      {view === 'bracket' && (
        <main className="bracket-view">
          <Bracket
            matches={displayMatches}
            tz={tz}
            hideScores={hideScores}
            focusMatch={focusMatch}
            onFocusHandled={() => setFocusMatch(null)}
          />
        </main>
      )}

      <footer className="app-footer">
        <p>
          Tip-off times convert automatically to your selected timezone. Every game of this
          tournament is played in Berlin, which is on CEST (UTC+02:00) throughout, so the
          venue clock is a single offset. Broadcast info is for the United States. The
          qualification-round and semi-final tip-off times are announced at the end of the previous
          round and show as to be confirmed until FIBA sets them. Filters, timezone &amp; view are
          saved to the URL — bookmark or share it.
        </p>
        <p className="disclaimer">
          An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by FIBA.
          “FIBA Women&rsquo;s Basketball World Cup”, team, broadcaster, and tournament names are trademarks of
          their respective owners. Schedule &amp; results data compiled from{' '}
          <a href="https://www.fiba.basketball/" target="_blank" rel="noopener noreferrer">FIBA</a> and{' '}
          <a href={LIVE_SOURCE.homepage} target="_blank" rel="noopener noreferrer">ESPN</a>; live
          in-match scores via ESPN.
        </p>
        <p className="credit">
          Created by{' '}
          <a href="https://chester.rbind.io" target="_blank" rel="noopener noreferrer">
            Chester Ismay
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/ismayc/womens-world-cup-viewer"
            target="_blank"
            rel="noopener noreferrer"
          >
            View source on GitHub
          </a>
        </p>
      </footer>

      <ScoreToasts items={toasts} onOpen={setDetailMatch} onDismiss={dismissToast} />

      {detailMatch && (
        <MatchDetail
          match={detailMatch}
          tz={tz}
          hideScores={hideScores}
          allMatches={displayMatches}
          onClose={() => setDetailMatch(null)}
        />
      )}
      {calendarOpen && (
        <CalendarModal
          matches={displayMatches}
          filtered={filtered}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
    </DetailContext.Provider>
  )
}
