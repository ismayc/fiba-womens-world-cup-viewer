// The live-clock badge, shared by every view so in-progress games look the same
// everywhere. Renders nothing unless the game is live.
//
// IT SHOWS THE PERIOD, NOT JUST THE CLOCK. A football clock counts up through
// one continuous half, so "67'" locates the match on its own. A basketball clock
// counts DOWN and resets four times, so "7:32" is ambiguous between the first
// quarter and the fourth — and between regulation and overtime. The period is
// what makes the badge mean anything, so it leads.
//
// Spoiler-free mode shows only LIVE: an OT period says the game was tied after
// regulation, and a badge that kept Q1-Q4 would give that away when it switched.
// The tooltip drops ESPN's detail text for the same reason.
export default function LiveBadge({ match, className = 'badge-live', hideScores = false }) {
  if (!match.live) return null
  const { clock, period, detail, delayed, label } = match.live
  // A paused match (delayed/weather or suspended) isn't playing — show it in
  // amber, not the red running clock, so it doesn't read as "in progress".
  if (delayed) {
    const word = label || 'Delayed'
    return (
      <span className="badge-delayed" role="status" aria-label={word} title={detail || word}>
        ⏸ {word}
      </span>
    )
  }
  const shown = (!hideScores && [period, clock].filter(Boolean).join(' · ')) || 'LIVE'
  return (
    <span
      className={className}
      role="status"
      aria-label={`Live${shown === 'LIVE' ? '' : `, ${shown}`}`}
      title={(!hideScores && detail) || 'Live'}
    >
      ● {shown}
    </span>
  )
}
