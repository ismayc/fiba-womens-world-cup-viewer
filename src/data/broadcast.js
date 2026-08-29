// US broadcast & streaming for the FIBA Women's Basketball World Cup 2026.
//
// Warner Bros. Discovery holds the US rights to this edition, and ESPN's own
// broadcast field carries the split per game across TNT, truTV and HBO Max —
// so each game's channel is committed on the record itself (`tv` in
// src/data/games.js) and this module only states the tournament-wide picture
// for the "where to watch" panel.
//
// That is the opposite of the football siblings, which state coverage
// tournament-wide ONLY, because ESPN's per-match channel field flaps on and off
// for matches that old and would churn the committed data on every regeneration.
// Here the edition is current and the field is stable, so per-game is both
// available and more useful. If a future regeneration starts dropping `tv`
// wholesale, that is the same flap and the per-game field should be reconsidered
// rather than committed empty.
export const US_BROADCAST = {
  english: {
    language: 'English',
    tv: ['TNT', 'truTV'],
    freeOverTheAir: null, // this edition is cable/streaming only in the US
    streaming: ['HBO Max', 'Sling TV', 'DirecTV Stream'],
  },
}

// The rights-holding family, for the footer credit.
export const RIGHTS_HOLDER = 'Warner Bros. Discovery'
