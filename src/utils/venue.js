// Venue lookup that tolerates a game whose arena is not known yet.
//
// FIBA assigns the arena for a final-phase game when it announces that round, so
// the twelve final-phase records ship with `venue: null` until ESPN publishes the
// fixture. Every view formats a venue AND a local clock from this, so a raw
// `VENUES[game.venue]` would be undefined and take the card down with it.
//
// The fallback is not a guess: BOTH arenas are in Berlin and both are on
// Europe/Berlin, so the city, country and timezone are already known for a game
// whose arena is not. Only the building is genuinely unknown, and that is the
// only field that says "to be confirmed".

import { VENUES } from '../data/venues.js'

export const TBC_VENUE = {
  name: 'Arena TBC',
  sponsorName: null,
  city: 'Berlin',
  country: 'Germany',
  countryFlag: '🇩🇪',
  tz: 'Europe/Berlin',
  capacity: null,
  tbc: true,
}

export function venueFor(game) {
  return VENUES[game?.venue] || TBC_VENUE
}
