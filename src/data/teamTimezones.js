// Home timezone(s) per competing nation, used to show a game's tip-off time in
// each team's own country ("Tip-off in Japan: Sep 4, 6:30 PM JST").
//
// A country with several zones lists them all, widest-used first; the formatter
// collapses zones that read the same wall clock at that instant, so a country
// only shows multiple lines when its clocks genuinely differ.
//
// Only the zones a national team's own audience would use are listed: Spain's
// Canary Islands and the four mainland US zones are in, but remote territories
// that no domestic broadcast targets are not.
export const TEAM_TIMEZONES = {
  Australia: [
    'Australia/Sydney',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
  ],
  Belgium: ['Europe/Brussels'],
  China: ['Asia/Shanghai'],
  Czechia: ['Europe/Prague'],
  France: ['Europe/Paris'],
  Germany: ['Europe/Berlin'],
  Hungary: ['Europe/Budapest'],
  Italy: ['Europe/Rome'],
  Japan: ['Asia/Tokyo'],
  Mali: ['Africa/Bamako'],
  Nigeria: ['Africa/Lagos'],
  'Puerto Rico': ['America/Puerto_Rico'],
  'South Korea': ['Asia/Seoul'],
  Spain: ['Europe/Madrid', 'Atlantic/Canary'],
  Türkiye: ['Europe/Istanbul'],
  'United States': [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
  ],
}
