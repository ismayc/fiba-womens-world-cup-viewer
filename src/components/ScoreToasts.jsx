import { useEffect } from 'react'
import { finalNotification } from '../services/scoreNotify.js'

// On-page result toasts: the in-app twin of the browser notification. The OS
// often suppresses notifications for the tab you are actively looking at (which
// is exactly when you are watching the game), and they never show at all if
// permission was denied; these do. Same events, same formatting (reuses
// finalNotification), stacked top-right: click opens the game detail, ✕ (or
// ~8s) dismisses. App owns the item list; ids are the notification tag, so a
// result cannot stack twice.

export const TOAST_MS = 8000

function Toast({ item, onOpen, onDismiss }) {
  const { id, ev } = item
  useEffect(() => {
    const t = setTimeout(() => onDismiss(id), TOAST_MS)
    return () => clearTimeout(t)
  }, [id, onDismiss])
  const n = finalNotification(ev)
  return (
    <div className="goal-toast" role="status">
      <button
        className="toast-body"
        onClick={() => {
          onOpen(ev.game)
          onDismiss(id)
        }}
        title="Open game details"
      >
        <strong className="toast-title">{n.title}</strong>
        <span className="toast-line toast-score">{n.body}</span>
      </button>
      <button className="toast-x" onClick={() => onDismiss(id)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}

export default function ScoreToasts({ items, onOpen, onDismiss }) {
  if (!items.length) return null
  return (
    <div className="toast-stack" role="region" aria-label="Result alerts">
      {/* Show the most recent few; a flood beyond that is already suppressed
          upstream, so this is only a second line of defense for quick
          successive finals, which this tournament genuinely has: a group's last
          two games tip off simultaneously and therefore end together. */}
      {items.slice(-4).map((item) => (
        <Toast key={item.id} item={item} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
