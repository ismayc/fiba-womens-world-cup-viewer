// Calendar-week helpers. Input/Output are 'YYYY-MM-DD' day keys (already in the
// viewer's timezone, produced by dayKey()). We parse at local noon so plain
// calendar arithmetic and weekday names are DST-safe. Weeks run Sunday→Saturday.

function parse(dayKey) {
  return new Date(dayKey + 'T12:00:00')
}

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(dayKey, n) {
  const d = parse(dayKey)
  d.setDate(d.getDate() + n)
  return fmt(d)
}

// The Sunday that starts the week containing dayKey.
export function weekStartOf(dayKey) {
  const d = parse(dayKey)
  d.setDate(d.getDate() - d.getDay())
  return fmt(d)
}

export function weekLabel(weekStart) {
  const a = parse(weekStart)
  const b = parse(addDays(weekStart, 6))
  const f = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(a)} – ${f(b)}, ${b.getFullYear()}`
}

export function weekdayHeader(dayKey) {
  const d = parse(dayKey)
  return {
    wd: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.getDate(),
  }
}
