// The single source of this edition's identity, vocabulary, and display rules.
//
// Everything a component or util would otherwise hardcode inline lives here: the ESPN
// path, the storage prefix, the period vocabulary, the game-length window, the host
// city, the .ics identity, the deploy host. The pattern comes from the-nfl-schedule;
// this is the ninth repo in the family to get it.
//
// Two rules this file is written to:
//
//   1. Every field below has a real consumer in src/. A field only a config reader
//      touches is a shallow module pretending to be a seam, and the NFL original grew
//      seven of them. The exceptions are marked: `title` and `themeColor` are consumed
//      by test/chrome-identity.test.js, because index.html and the manifest are static
//      files no module can import.
//
//   2. Structure stays out. ADVANCING_PER_GROUP, DIRECT_TO_QF, ENTRY_ROUND, BYE_ROUND,
//      GROUP_GAME_COUNT, the 2/1 points model and the restart-the-procedure tie-break
//      all stay in utils/qualification.js and utils/slots.js. FIBA's group phase feeds
//      TWO knockout rounds (the winner byes straight to the quarter-finals) and its
//      tie-break restarts the whole procedure on any subset, which are rules rather
//      than facts.
//
// This is basketball on a chassis built for football, so it takes vocabulary from the
// basketball siblings (periodShort, regulationPeriods, overtimeLabel) and everything
// else from the tournament ones. It transfers about 18% from any single sibling, which
// is why its config is the least like anyone else's.

export const LEAGUE = {
  id: 'fwwc',
  // The competition, without the year. The .ics summary abbreviates it further.
  name: "FIBA Women's World Cup",
  icsSummaryPrefix: 'FIBA WWC',
  // The full product title: index.html's <title> and the manifest's name.
  title: "FIBA Women's World Cup 2026 — Schedule Viewer",
  // The edition, used as a calendar name.
  edition: "FIBA Women's World Cup 2026",
  season: 2026,
  espnPath: 'basketball/fiba',
  storageKey: 'fwwc', // 'fwwc:theme', 'fwwc:followed', 'fwwc:asItStands', …
  // UI chrome only. Matches --bg in index.css, <meta name="theme-color">, and the
  // manifest's theme_color and background_color.
  themeColor: '#15171b',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  periodNoun: 'quarter',
  periodShort: 'Q', // Q1…Q4
  regulationPeriods: 4,
  overtimeLabel: 'OT',
  // Basketball says "vs", not football's "v". One card rendered "v" and nine other
  // sites rendered "vs" until this field existed.
  homeAwaySep: 'vs',

  // ── The host ────────────────────────────────────────────────────────────────
  // Both arenas are in Berlin and both are on Europe/Berlin, which is what makes the
  // TBC-venue fallback safe: only the building is unknown for a final-phase game whose
  // round FIBA has not announced yet. These four values were restated by hand in
  // utils/venue.js and again in scripts/official.mjs, which src/ cannot import.
  host: {
    city: 'Berlin',
    country: 'Germany',
    countryFlag: '🇩🇪',
    tz: 'Europe/Berlin',
  },

  // ── Time ────────────────────────────────────────────────────────────────────
  locale: 'en-US',
  // The block a calendar should reserve and the window in which a tipped game with no
  // feed still reads as live.
  gameLengthMinutes: 135,

  // ── Calendar export ─────────────────────────────────────────────────────────
  // "game", not "match": this competition plays games, and the UID has said so from
  // the start. The year is deliberate, so a future edition's feed cannot overwrite this
  // one in a subscriber's calendar.
  ics: {
    prodId: "-//FIBA Women's World Cup 2026 Viewer//EN",
    domain: 'fibawomensworldcupviewer',
    uidPrefix: 'fibawwc2026-game-',
    filenameBase: 'fiba-womens-world-cup-2026',
  },

  // Netlify serves /calendar.ics; GitHub Pages cannot run the function. Both hosts are
  // live: index.html used to claim no Netlify site existed for this repo, which was
  // checked and corrected on September 6, 2026.
  feedHost: 'https://fiba-womens-world-cup-viewer.netlify.app',
}
