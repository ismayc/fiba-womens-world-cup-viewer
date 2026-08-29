import { GAMES } from '../data/games.js'
import { SERVICE_CATALOG, coverageSummary } from '../utils/watch.js'
import { useServices } from '../context/services.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'

// Pick which streaming services and TV packages are "mine". Drives the
// schedule's "on my services" filter and the personalized 📺 badges on cards.
//
// The live coverage line is the point of this modal. The US rights split is
// lopsided (16 of the 24 group games are HBO Max only), so a viewer who ticks
// only a cable bundle should see immediately that most of the group phase is out
// of reach, rather than discovering it one card at a time.
//
// Markup follows this app's own modal convention (md-overlay / md-card /
// md-close), not the WNBA sibling's modal-wrap, so it inherits the styling that
// is already here rather than shipping a second, near-identical dialog skin.
export default function ServicesModal({ onClose }) {
  const { has, toggle, count, clear, services } = useServices()
  const cardRef = useModalA11y(onClose)
  const cover = coverageSummary(GAMES, services)

  return (
    <div className="md-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="My services">
      <div
        className="md-card svc-modal"
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="md-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="cal-title">📺 My services</h3>
        <p className="cal-note">
          Pick the services you have. The schedule can then filter to just the games you can
          watch, and each card shows how. Saved on this device only, and never put in a
          shared link. US coverage of this tournament is Warner Bros. Discovery&rsquo;s, and
          live-TV bundle carriage is approximate.
        </p>

        <div className="svc-list">
          {SERVICE_CATALOG.map((s) => (
            <label key={s.key} className={`svc-item${has(s.key) ? ' on' : ''}`}>
              <input type="checkbox" checked={has(s.key)} onChange={() => toggle(s.key)} />
              <span className="svc-name">{s.label}</span>
              <span className="svc-kind">{s.kind === 'bundle' ? 'Live TV' : 'Streaming'}</span>
            </label>
          ))}
        </div>

        <p className="cal-note svc-coverage">
          {count === 0 ? (
            'Nothing selected, so every game is shown.'
          ) : (
            <>
              You can watch <strong>{cover.watchable}</strong> of the {cover.known} games whose
              coverage is confirmed
              {cover.unknown > 0 &&
                ` · ${cover.unknown} more are still to be announced, and are always shown`}
              .
            </>
          )}
        </p>

        <div className="svc-foot">
          <span className="svc-count">{count} selected</span>
          <span className="svc-foot-actions">
            {count > 0 && (
              <button className="cal-btn-ghost" onClick={clear}>
                Clear all
              </button>
            )}
            <button className="cal-btn-primary svc-done" onClick={onClose}>
              Done
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
