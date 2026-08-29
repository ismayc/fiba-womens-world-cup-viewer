import { useState } from 'react'
import { TEAMS } from '../data/teams.js'
import { computeQualification, rowStatus } from '../utils/qualification.js'
import { clinchBadge, groupPositionBounds } from '../utils/clinch.js'
import { projectKnockout } from '../utils/asItStands.js'
import { lockedOpponent } from '../utils/opponentClinch.js'
import { softTiebreaks, TIEBREAK_LABEL } from '../utils/tiebreakNotes.js'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import GroupGamesModal from './GroupGamesModal.jsx'
import ScalesIcon from './ScalesIcon.jsx'

const GROUPS = Object.keys(TEAMS)

// Three of four advance, and the winner's prize is different from everyone
// else's, so there are three outcomes to mark rather than two.
const STATUS_BADGE = {
  qf: { cls: 'q-won', label: '①', title: 'Wins the group — a bye straight to the quarter-finals' },
  qr: { cls: 'q-in', label: '✓', title: 'Advances to the qualification round' },
  out: { cls: 'q-out', label: '✕', title: 'Eliminated' },
}

function Star({ name }) {
  const { isFollowed, toggle } = useFollow()
  const on = isFollowed(name)
  return (
    <button className={`star${on ? ' on' : ''}`} onClick={() => toggle(name)} aria-pressed={on}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
      title={on ? `Unfollow ${name}` : `Follow ${name}`}>
      {on ? '★' : '☆'}
    </button>
  )
}

// "As it stands" projection of where this group's current placings would land in
// the final phase. A provisional snapshot — opponents shift as other groups play.
//
// THREE ROWS, NOT TWO, and they do not all go to the same round: 1st byes to a
// quarter-final while 2nd and 3rd drop into the qualification round. 4th is out
// and has no destination. The round is shown per row because "1st → QF" against
// "2nd → QR" is the whole point of the group race here.
const ROUND_LABEL = { QR: 'Qualification round', QF: 'Quarter-final' }

function AsItStands({ proj, onGoToMatch }) {
  if (!proj) return null
  const dest = (label, d) => {
    const team = d?.team
    /* v8 ignore next -- unreachable: rankGroup always returns four ordered rows, so every group has a 1st, 2nd and 3rd to project */
    if (!team) return null
    const opp = d?.opponent
    // Computed here, not inline: a `v8 ignore` comment inside a JSX expression
    // container is a syntax error, so an unreachable fallback has to be hoisted
    // out of the markup to be annotated at all.
    //
    // The opponent is the side that can be missing: a group winner's
    // quarter-final opponent is the winner of a qualification game nobody has
    // played, so it shows as that pending feed rather than as a name.
    /* v8 ignore next -- the bare 'TBD' is unreachable: a side that is not a group placing is always a "Winner Game N" feed, which supplies opponentLabel */
    const oppText = opp ? `${FLAG_BY_TEAM[opp]} ${opp}` : d.opponentLabel || 'TBD'
    /* v8 ignore next -- the fallback is unreachable: a projected destination is always the QR or the QF, and ROUND_LABEL names both */
    const roundTitle = ROUND_LABEL[d.round] || d.round
    return (
      <li className="ais-row" key={label}>
        <span className="ais-pos">{label}</span>
        {/* The team name comes out of the group table, so it is a committed
            member of this edition and always has a flag. */}
        <span className="ais-team">{FLAG_BY_TEAM[team]} {team}</span>
        <span className="ais-vs">vs</span>
        <span className="ais-opp">{oppText}</span>
        {d.round && (
          <span className="ais-round" title={roundTitle}>
            {d.round}
          </span>
        )}
        {d.gameNum &&
          (onGoToMatch ? (
            <button
              type="button"
              className="ais-match ais-match-link"
              onClick={() => onGoToMatch(d.gameNum)}
              title={`Show Game ${d.gameNum} on the Bracket`}
            >
              G{d.gameNum}
            </button>
          ) : (
            <span className="ais-match">G{d.gameNum}</span>
          ))}
      </li>
    )
  }
  return (
    <div className="as-it-stands">
      <div className="ais-title">As it stands → final phase</div>
      <ul className="ais-list">
        {dest('1st', proj.first)}
        {dest('2nd', proj.second)}
        {dest('3rd', proj.third)}
      </ul>
    </div>
  )
}

// ⚖️ shown when a placing could only be decided by a drawing of lots.
function TieMark({ tie }) {
  if (!tie) return null
  return (
    <span
      className="tiebreak-mark"
      title={`Level with ${tie.vs} on points, head-to-head, point difference and points scored — separated by ${TIEBREAK_LABEL[tie.reason]}`}
      aria-label={`Separated from ${tie.vs} by ${TIEBREAK_LABEL[tie.reason]}`}
    >
      <ScalesIcon />
    </span>
  )
}

// "1–3" while group outcomes remain open; collapses to the bare position (gold)
// once locked. Bounds come from the clinch engine, which walks every win/loss
// completion of the group exactly and only widens a range where a tie-breaker
// genuinely cannot be known yet.
function FinishRange({ range }) {
  if (range.best === range.worst) {
    return <span className="finish finish-locked">{range.best}</span>
  }
  return (
    <span className="finish">
      {range.best}–{range.worst}
    </span>
  )
}

function GroupTable({ group, rows, qual, clinch, finish, asItStands, onGoToMatch, onSelectTeam, ties, liveTeams, pausedTeams }) {
  const { isFollowed } = useFollow()
  const played = qual.completion[group] || rows.some((r) => r.P > 0)
  const groupLive = rows.some((r) => liveTeams.has(r.name))
  const pauseRow = rows.find((r) => pausedTeams.has(r.name))
  const pauseLabel = pauseRow ? pausedTeams.get(pauseRow.name) : null
  return (
    <div className="group-card">
      <h3 className="group-title">
        <button
          type="button"
          className="group-title-btn"
          onClick={() => onSelectTeam(group, null)}
          title={`Show all Group ${group} games & results`}
        >
          Group {group}
        </button>
        {groupLive &&
          (pauseLabel ? (
            <span className="group-delayed" title={`A game in this group is ${pauseLabel.toLowerCase()} — standings are provisional`}>
              ⏸ {pauseLabel.toUpperCase()}
            </span>
          ) : (
            <span className="group-live" title="A game in this group is in progress — standings are provisional">
              ● LIVE
            </span>
          ))}
      </h3>
      <table className="standings-table">
        <thead>
          <tr>
            <th className="col-team">Team</th>
            <th>P</th><th>W</th><th>L</th>
            <th title="Points scored">PF</th>
            <th title="Points allowed">PA</th>
            <th title="Point difference">PD</th>
            <th className="col-pts" title="FIBA points: 2 for a win, 1 for a loss">Pts</th>
            <th className="col-finish" title="Final group positions still arithmetically possible — a single number means the finish is locked">Fin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // A guaranteed clinch/elimination verdict (if any) is more informative
            // than the post-completion qualification badge, so it wins when present.
            const clinched = clinchBadge(clinch?.[r.name])
            const status = rowStatus(r, group, qual)
            const badge = status && STATUS_BADGE[status]
            // Row tint mirrors the badge scale: green = advancing (top two), red =
            // mathematically eliminated. Plain = still undecided.
            const c = clinch?.[r.name]
            const advancing =
              status === 'qf' ||
              status === 'qr' ||
              c === 'won-group' ||
              c === 'second' ||
              c === 'third' ||
              c === 'through'
            const rowCls = c === 'eliminated' ? 'eliminated' : advancing ? 'qualifies' : ''
            return (
              <tr key={r.name} className={rowCls}>
                <td className="col-team">
                  <span className="rank">{r.rank}</span>
                  <Star name={r.name} />
                  <span className="team-flag">{r.flag}</span>
                  <button
                    type="button"
                    className={`row-team row-team-btn${isFollowed(r.name) ? ' followed' : ''}`}
                    onClick={() => onSelectTeam(group, r.name)}
                    title={`Show Group ${group} games & results`}
                  >
                    {r.name}
                  </button>
                  <TieMark tie={ties?.get(r.name)} />
                  {liveTeams.has(r.name) && (
                    <span
                      className={`row-live-dot${pausedTeams.has(r.name) ? ' delayed' : ''}`}
                      title={pausedTeams.has(r.name) ? `${pausedTeams.get(r.name)} — score is provisional` : 'Playing now — score is provisional'}
                    >
                      ●
                    </span>
                  )}
                  {clinched ? (
                    // Wide text verdicts drop to their own line below the name
                    // (q-wide) so they don't wrap raggedly beside it in the
                    // narrow 3-across layout. Single-glyph marks stay inline.
                    <span className={`q-badge q-wide ${clinched.cls}`} title={clinched.title}>
                      {clinched.label} {clinched.text}
                    </span>
                  ) : (
                    badge && (
                      <span className={`q-badge ${badge.cls}`} title={badge.title}>
                        {badge.label}
                      </span>
                    )
                  )}
                </td>
                <td>{r.P}</td><td>{r.W}</td><td>{r.L}</td>
                <td>{r.PF}</td><td>{r.PA}</td>
                <td>{r.PD > 0 ? `+${r.PD}` : r.PD}</td>
                <td className="col-pts">{r.Pts}</td>
                <td className="col-finish"><FinishRange range={finish[r.name]} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!played && <p className="group-note">No games played yet</p>}
      {played && <AsItStands proj={asItStands} onGoToMatch={onGoToMatch} />}
    </div>
  )
}

export default function Standings({ matches, tz, hideScores, clinch, onGoToMatch }) {
  const [revealed, setRevealed] = useState(false)
  // The group whose fixtures pop-up is open (set by clicking a team name).
  const [groupGames, setGroupGames] = useState(null)
  const onSelectTeam = (group, team) => setGroupGames({ group, team })
  // The "As it stands" final-phase projection is shown by default; this toggle
  // (persisted) hides it for those who just want the tables.
  const [showProjection, setShowProjection] = useState(() => {
    try {
      return localStorage.getItem('fwwc:asItStands') !== '0'
    } catch {
      return true
    }
  })
  const toggleProjection = () =>
    setShowProjection((v) => {
      const next = !v
      try {
        localStorage.setItem('fwwc:asItStands', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })

  if (hideScores && !revealed) {
    return (
      <div className="standings-hidden">
        <p>🙈 Standings are hidden in spoiler-free mode.</p>
        <button className="reveal-btn" onClick={() => setRevealed(true)}>Reveal standings</button>
      </div>
    )
  }

  const qual = computeQualification(matches)
  const { perGroup } = projectKnockout(matches)
  // Finish-column bounds, from the same engine that powers the clinch badges.
  const finish = groupPositionBounds(matches)

  // For a team that has CLINCHED a place in the final phase, its projected next
  // game (opponent + game number), pulled from the same projection that powers
  // "As it stands". null unless the team is mathematically through — we only
  // promise an opponent once a team has actually made it.
  const teamKnockout = (group, team) => {
    if (!team) return null
    const status = clinch?.[team]
    const through =
      status === 'won-group' || status === 'second' || status === 'third' || status === 'through'
    if (!through) return null
    /* v8 ignore next -- unreachable: computeQualification ranks every group of the committed table, so `qual.groups[group]` is always an array */
    const row = (qual.groups[group] || []).find((r) => r.name === team)
    /* v8 ignore next -- unreachable: the group/team pair comes from a rendered standings row, so the team is always among that group's computed rows */
    if (!row) return null
    /* v8 ignore next -- unreachable: projectKnockout seeds an entry for every group, so `perGroup[group]` is always there */
    const proj = perGroup[group] || {}
    // A 'won-group' / 'second' / 'third' verdict pins the exact finishing
    // position, so use it directly; otherwise ('through', with the placing not
    // yet split) fall back to the current standings position for the
    // provisional projection.
    const byRank = { 1: proj.first, 2: proj.second, 3: proj.third }
    /* v8 ignore next 8 -- the trailing null fallbacks are unreachable: a team that is `through` is by definition in the top three, so byRank always has its row, and projectKnockout fills a destination (with a round and a game number) for every one of those three placings */
    const dest =
      status === 'won-group'
        ? proj.first
        : status === 'second'
          ? proj.second
          : status === 'third'
            ? proj.third
            : byRank[row.rank] || null
    // A mathematically locked opponent (invariant across every remaining outcome)
    // is authoritative; otherwise fall back to the provisional "as it stands"
    // projection. `settled` drives whether the pop-up drops the provisional note.
    const locked = lockedOpponent(matches, team, clinch)
    /* v8 ignore next 8 -- the trailing `|| null` on round and gameNum is unreachable: `dest` is always one of the three projected placings, and projectKnockout gives every one of them a round and a game number */
    return {
      status,
      opponent: locked?.opponent || dest?.opponent || null,
      opponentLabel: dest?.opponentLabel || null,
      round: locked?.round || dest?.round || null,
      matchNum: locked?.gameNum || dest?.gameNum || null,
      settled: Boolean(locked),
    }
  }

  // Teams currently playing a group game — the standings + "As it stands" below
  // reflect their in-progress score, so we blink them to show it's provisional.
  const liveTeams = new Set()
  const pausedTeams = new Map() // team -> 'Delayed' | 'Suspended'
  for (const m of matches) {
    if (m.stage === 'Group' && m.live) {
      liveTeams.add(m.t1)
      liveTeams.add(m.t2)
      if (m.live.delayed) {
        const lbl = m.live.label || 'Delayed'
        pausedTeams.set(m.t1, lbl)
        pausedTeams.set(m.t2, lbl)
      }
    }
  }

  return (
    <>
      <p className="standings-tip">
        💡 Tip: click a <strong>team name</strong> to see that team’s three group
        games — played and upcoming — or a <strong>group title</strong> for the
        whole group’s schedule.
      </p>
      <p className="standings-legend">
        <span className="legend-swatch" /> Top three advance; the winner byes to the
        quarter-finals ·{' '}
        <span
          className="legend-tb"
          tabIndex={0}
          role="note"
          aria-label="FIBA tie-breakers: points (2 for a win, 1 for a loss), then head-to-head points, head-to-head point difference and head-to-head points scored among the tied teams, then overall point difference, then overall points scored, then a drawing of lots"
          data-tip="Tie-breakers: points (W 2 / L 1) → head-to-head points → h2h point difference → h2h points scored → overall point difference → overall points scored → drawing of lots"
        >
          tie-breakers
        </span>{' '}
        · <span className="q-badge c-won">🥇 Won group</span> /{' '}
        <span className="q-badge c-silver">🥈 2nd</span> /{' '}
        <span className="q-badge c-bronze">🥉 3rd</span> /{' '}
        <span className="q-badge c-in">✅ Through</span> /{' '}
        <span className="q-badge c-out">❌ Out</span> mark mathematically clinched outcomes ·{' '}
        <span className="finish">Fin 1–3</span> the group positions still arithmetically
        possible (a single gold number means the finish is locked).
      </p>
      <div className="standings-toolbar">
        <button
          className="ais-toggle"
          onClick={toggleProjection}
          aria-pressed={showProjection}
          title="Show or hide the projected final-phase matchups under each group"
        >
          {showProjection ? '▾ Hide “As it stands”' : '▸ Show “As it stands”'}
        </button>
      </div>
      <div className="standings-grid">
        {GROUPS.map((g) => (
          <GroupTable
            key={g}
            group={g}
            rows={qual.groups[g]}
            qual={qual}
            clinch={clinch}
            finish={finish}
            asItStands={showProjection ? perGroup[g] : null}
            onGoToMatch={onGoToMatch}
            onSelectTeam={onSelectTeam}
            ties={softTiebreaks(g, matches)}
            liveTeams={liveTeams}
            pausedTeams={pausedTeams}
          />
        ))}
      </div>
      {groupGames && (
        <GroupGamesModal
          group={groupGames.group}
          team={groupGames.team}
          matches={matches}
          tz={tz}
          hideScores={hideScores}
          knockout={teamKnockout(groupGames.group, groupGames.team)}
          onClose={() => setGroupGames(null)}
        />
      )}
    </>
  )
}
