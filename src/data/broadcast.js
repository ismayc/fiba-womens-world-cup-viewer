// US broadcast & streaming for the FIBA Women's Basketball World Cup 2026.
//
// Warner Bros. Discovery holds exclusive US English-language rights to this
// edition, and published a game-by-game table in its August 6, 2026 media
// release. That table is frozen in scripts/official.mjs and is what fills each
// game's `tv` in src/data/games.js, so a card can say where THIS game is on.
//
// That is the opposite of the football siblings, which state coverage
// tournament-wide ONLY, because ESPN's per-match channel field flaps on and off
// for matches that old and would churn the committed data on every regeneration.
// Here a published per-game table exists, so per-game is both available and more
// useful. NOTE that the per-game data no longer comes from ESPN's broadcast
// field at all: it agreed with WBD's table for the group phase but had nothing
// for the twelve final-phase games, which left the whole knockout stage reading
// "TV TBC" while WBD had announced its platforms in August.
//
// TWO STREAMERS CARRY ALL 36 GAMES, and the difference between them is the point
// of listing both:
//
//   * DAZN sells Courtside 1891, FIBA's own service, as a standalone US
//     subscription. Every game, on the base subscription.
//   * HBO Max streams all 36 too, but live sports need a Standard or Premium
//     plan; a Basic With Ads subscriber has to upgrade first. `tierNote` says so
//     wherever HBO Max is named, because "it's on HBO Max" is not the whole
//     answer for a viewer who has HBO Max.
export const US_BROADCAST = {
  english: {
    language: 'English',
    tv: ['TNT', 'TBS', 'truTV'],
    freeOverTheAir: null, // this edition is cable/streaming only in the US
    streaming: ['DAZN', 'HBO Max'],
    // Live-TV bundles are how most viewers get the linear channels above; they
    // are not themselves rights holders, so they are named here rather than
    // being listed as if they carried the tournament directly.
    bundles: ['YouTube TV', 'Sling TV', 'DirecTV Stream'],
  },
}

// Extra wording a named outlet needs before "it's on there" is actually true.
export const OUTLET_NOTES = {
  'HBO Max': 'Live sports need HBO Max Standard or Premium, not Basic With Ads',
  DAZN: 'Carries all 36 games through Courtside 1891',
}

// The rights-holding family, for the footer credit.
export const RIGHTS_HOLDER = 'Warner Bros. Discovery'
