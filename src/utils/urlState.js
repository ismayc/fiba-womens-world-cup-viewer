// Persist view, timezone, spoiler mode, and all filters to the URL query
// string so a filtered view can be bookmarked or shared. Only non-default
// values are written, keeping the URL clean.

export const DEFAULT_FILTERS = {
  search: '',
  stages: [],
  group: 'all',
  team: 'all',
  venue: 'all',
  timeframe: 'all',
  myTeams: false,
  onMyServices: false,
}

export function readState(detectedTz) {
  const p = new URLSearchParams(window.location.search)
  const get = (k, d) => (p.has(k) ? p.get(k) : d)

  const filters = {
    ...DEFAULT_FILTERS,
    search: get('q', ''),
    stages: p.has('stages') ? p.get('stages').split(',').filter(Boolean) : [],
    group: get('group', 'all'),
    team: get('team', 'all'),
    venue: get('venue', 'all'),
    timeframe: get('when', 'all'),
    myTeams: get('mine', '0') === '1',
    onMyServices: get('svc', '0') === '1',
  }

  return {
    view: get('view', 'schedule'),
    tz: get('tz', detectedTz),
    hideScores: get('hide', '0') === '1',
    filters,
  }
}

export function writeState({ view, tz, hideScores, filters }, detectedTz) {
  const p = new URLSearchParams()
  if (view && view !== 'schedule') p.set('view', view)
  if (tz && tz !== detectedTz) p.set('tz', tz)
  if (hideScores) p.set('hide', '1')

  if (filters.search) p.set('q', filters.search)
  if (filters.stages.length) p.set('stages', filters.stages.join(','))
  if (filters.group !== 'all') p.set('group', filters.group)
  if (filters.team !== 'all') p.set('team', filters.team)
  if (filters.venue !== 'all') p.set('venue', filters.venue)
  if (filters.timeframe !== 'all') p.set('when', filters.timeframe)
  if (filters.myTeams) p.set('mine', '1')
  // The FILTER is shareable; the service SELECTION behind it is not, and lives
  // only in localStorage. A shared link should not carry what someone pays for.
  if (filters.onMyServices) p.set('svc', '1')

  const qs = p.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}
