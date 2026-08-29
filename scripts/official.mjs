// The FIBA Women's Basketball World Cup 2026 schedule, exactly as the organizer
// published it. This module is the AUTHORITY for structure and tip-off times;
// ESPN supplies only event ids, venues, live clocks and scores on top of it.
//
// Source: FIBA's official game-schedule PDF for the edition,
// https://assets.fiba.basketball/image/upload/fiba-womens-basketball-world-cup-208875-game-schedule.pdf
// ("GAME SCHEDULE — BERLIN | 4-13 SEPTEMBER 2026", quoted verbatim). FIBA
// publishes no keyless JSON schedule API. So unlike the FIFA sibling, where a
// live API is the authority, the authority here is a hand-transcribed copy of
// that PDF, frozen
// in this file and asserted against ESPN on every fetch.
//
// WHY THIS FILE EXISTS AT ALL, rather than just trusting the feed: ESPN and FIBA
// disagree about one game. See KNOWN_ESPN_TIME_BUGS below.
//
// All times are the venue's own local wall clock. Berlin observes CEST (UTC+02:00)
// for the whole 4-13 September window, and every game of the tournament is played
// in Berlin, so this edition has exactly ONE tournament offset. That is a real
// simplification over the FIFA Women's World Cup sibling this repo was grown from,
// where ten stadiums spanned four offsets and no single "local time" existed.

export const TZ = 'Europe/Berlin'
export const OFFSET = '+02:00'

export const EDITION = {
  year: 2026,
  host: 'Germany',
  hostFlag: '🇩🇪',
  city: 'Berlin',
  window: '20260904-20260913',
  games: 36,
  teams: 16,
  groups: ['A', 'B', 'C', 'D'],
  venues: 2,
  advancePerGroup: 3, // 1st byes to the QF; 2nd and 3rd play the qualification round
}

// The two host arenas, keyed the way src/data/venues.js keys them.
//
// `name` is the name FIBA prints; `sponsorName` is what ESPN files it under.
// ESPN calls the Berlin Arena by its current naming-rights name, "Uber Arena",
// so without this map the app and the feed would disagree about where a game was
// played. This mirrors the VENUE_ALIASES problem in the FIFA sibling, where ESPN
// used sponsor names for 9 of 10 stadiums.
export const VENUE_META = {
  12017: {
    key: 'maxschmeling',
    name: 'Max-Schmeling-Halle',
    sponsorName: 'Max-Schmeling-Halle',
    city: 'Berlin',
    country: 'Germany',
    countryFlag: '🇩🇪',
    tz: TZ,
    capacity: 11900,
  },
  11593: {
    key: 'berlinarena',
    name: 'Berlin Arena',
    sponsorName: 'Uber Arena',
    city: 'Berlin',
    country: 'Germany',
    countryFlag: '🇩🇪',
    tz: TZ,
    capacity: 14500,
  },
}

// Flag emoji per competing nation, keyed by the canonical (ESPN display) name.
export const FLAGS = {
  Australia: '🇦🇺',
  Belgium: '🇧🇪',
  China: '🇨🇳',
  Czechia: '🇨🇿',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Hungary: '🇭🇺',
  Italy: '🇮🇹',
  Japan: '🇯🇵',
  Mali: '🇲🇱',
  Nigeria: '🇳🇬',
  'Puerto Rico': '🇵🇷',
  'South Korea': '🇰🇷',
  Spain: '🇪🇸',
  Türkiye: '🇹🇷',
  'United States': '🇺🇸',
}

// The 16 teams by group, in the order FIBA's schedule sheet lists them.
export const GROUPS = {
  A: ['Japan', 'Spain', 'Germany', 'Mali'],
  B: ['Hungary', 'South Korea', 'Nigeria', 'France'],
  C: ['Belgium', 'Australia', 'Puerto Rico', 'Türkiye'],
  D: ['United States', 'Czechia', 'Italy', 'China'],
}

// FIBA prints some names differently from ESPN. ESPN's display form is canonical
// (it is what the app shows), so these map FIBA's spelling -> canonical.
// Keep this MINIMAL: an alias whose key never appears in a feed is dead weight
// that can silently rewrite a correct name.
export const ALIASES = {
  Korea: 'South Korea',
  USA: 'United States',
  'Czech Republic': 'Czechia',
  Turkey: 'Türkiye',
}

export const canon = (name) => ALIASES[name] || name

// --------------------------------------------------------------------------
// The group phase: 24 games, transcribed from the FIBA schedule sheet.
// --------------------------------------------------------------------------
//
// `t1` is the team FIBA prints first. ESPN models the same game with a nominal
// home/away even though `neutralSite` is true for all 36; its away side is the
// one FIBA prints first, in all 24 group games.
//
// Game NUMBERS 1-24 are assigned by this app in chronological order (tip, then
// group letter, then first team). FIBA's sheet numbers only the final phase
// (games 25-36), which is why those numbers below are quoted from the sheet and
// these are derived. Do not present 1-24 as official FIBA game numbers.
//
// Note the fourth round (7 September): FIBA plays a group's last two games
// SIMULTANEOUSLY, in the two different arenas, so that no team can know what it
// needs while playing. Every 7 September pair below shares a tip time.
const GROUP_GAMES = [
  // Friday 4 September
  { date: '2026-09-04', tip: '11:30', group: 'A', t1: 'Japan', t2: 'Mali' },
  { date: '2026-09-04', tip: '11:30', group: 'C', t1: 'Australia', t2: 'Puerto Rico' },
  { date: '2026-09-04', tip: '14:15', group: 'D', t1: 'United States', t2: 'China' },
  { date: '2026-09-04', tip: '14:30', group: 'B', t1: 'South Korea', t2: 'Nigeria' },
  { date: '2026-09-04', tip: '17:30', group: 'C', t1: 'Belgium', t2: 'Türkiye' },
  { date: '2026-09-04', tip: '17:45', group: 'A', t1: 'Spain', t2: 'Germany' },
  { date: '2026-09-04', tip: '20:15', group: 'D', t1: 'Czechia', t2: 'Italy' },
  { date: '2026-09-04', tip: '21:00', group: 'B', t1: 'Hungary', t2: 'France' },
  // Saturday 5 September
  { date: '2026-09-05', tip: '11:30', group: 'A', t1: 'Mali', t2: 'Spain' },
  { date: '2026-09-05', tip: '14:15', group: 'B', t1: 'Nigeria', t2: 'Hungary' },
  { date: '2026-09-05', tip: '18:00', group: 'A', t1: 'Germany', t2: 'Japan' },
  { date: '2026-09-05', tip: '20:45', group: 'B', t1: 'France', t2: 'South Korea' },
  // Sunday 6 September
  { date: '2026-09-06', tip: '11:30', group: 'C', t1: 'Türkiye', t2: 'Australia' },
  { date: '2026-09-06', tip: '14:30', group: 'D', t1: 'China', t2: 'Czechia' },
  { date: '2026-09-06', tip: '17:45', group: 'C', t1: 'Puerto Rico', t2: 'Belgium' },
  { date: '2026-09-06', tip: '20:45', group: 'D', t1: 'Italy', t2: 'United States' },
  // Monday 7 September, final round, groups play in lockstep
  { date: '2026-09-07', tip: '11:30', group: 'C', t1: 'Belgium', t2: 'Australia' },
  { date: '2026-09-07', tip: '11:30', group: 'C', t1: 'Puerto Rico', t2: 'Türkiye' },
  { date: '2026-09-07', tip: '14:30', group: 'B', t1: 'Hungary', t2: 'South Korea' },
  { date: '2026-09-07', tip: '14:30', group: 'B', t1: 'Nigeria', t2: 'France' },
  { date: '2026-09-07', tip: '17:50', group: 'A', t1: 'Germany', t2: 'Mali' },
  { date: '2026-09-07', tip: '17:50', group: 'A', t1: 'Japan', t2: 'Spain' },
  { date: '2026-09-07', tip: '20:45', group: 'D', t1: 'Italy', t2: 'China' },
  { date: '2026-09-07', tip: '20:45', group: 'D', t1: 'United States', t2: 'Czechia' },
]

// --------------------------------------------------------------------------
// The final phase: 12 games, numbers 25-36 quoted from the FIBA sheet.
// --------------------------------------------------------------------------
//
// THE SHAPE IS NOT A ROUND OF 16, and it is not the shape of any sibling in this
// family. Sixteen teams, four groups of four:
//
//   * the GROUP WINNER byes straight to the quarter-finals;
//   * 2nd and 3rd play a single-elimination "Qualification to Quarter-Finals";
//   * 4th is eliminated.
//
// So only EIGHT teams play the entry round and only TWELVE of the sixteen
// survive the group phase at all. `ENTRY_ROUND` is 'QR' and the bracket is
// ASYMMETRIC: four quarter-final slots are filled from the group tables directly
// and four are filled by the winners of the entry round.
//
// The qualification round crosses groups A<->B and C<->D. The QUARTER-FINALS
// then cross the OTHER way: the A/B group winners meet the C/D qualification
// winners and vice versa (Game 29 is 1st A against the winner of 3C-2D). That
// second crossover is the trap. The intuitive wiring, which keeps A/B on one
// side of the bracket throughout, is WRONG for this edition, and it is also what
// guarantees no team can meet a group opponent again in the quarter-finals.
// Both crossovers are quoted verbatim from the FIBA sheet; do not "tidy" them.
const FINAL_PHASE = [
  { num: 25, stage: 'QR', date: '2026-09-08', tip: null, label1: '2nd Group A', label2: '3rd Group B' },
  { num: 26, stage: 'QR', date: '2026-09-08', tip: null, label1: '2nd Group B', label2: '3rd Group A' },
  { num: 27, stage: 'QR', date: '2026-09-09', tip: null, label1: '3rd Group C', label2: '2nd Group D' },
  { num: 28, stage: 'QR', date: '2026-09-09', tip: null, label1: '3rd Group D', label2: '2nd Group C' },

  { num: 29, stage: 'QF', date: '2026-09-10', tip: '11:30', label1: 'Winner Group A', label2: 'Winner Game 27' },
  { num: 30, stage: 'QF', date: '2026-09-10', tip: '14:30', label1: 'Winner Group B', label2: 'Winner Game 28' },
  { num: 31, stage: 'QF', date: '2026-09-10', tip: '17:45', label1: 'Winner Group C', label2: 'Winner Game 25' },
  { num: 32, stage: 'QF', date: '2026-09-10', tip: '20:45', label1: 'Winner Group D', label2: 'Winner Game 26' },

  { num: 33, stage: 'SF', date: '2026-09-12', tip: null, label1: 'Winner Game 29', label2: 'Winner Game 32' },
  { num: 34, stage: 'SF', date: '2026-09-12', tip: null, label1: 'Winner Game 30', label2: 'Winner Game 31' },

  { num: 35, stage: '3rd', date: '2026-09-13', tip: '16:30', label1: 'Loser Game 33', label2: 'Loser Game 34' },
  { num: 36, stage: 'Final', date: '2026-09-13', tip: '20:00', label1: 'Winner Game 33', label2: 'Winner Game 34' },
]

// FIBA prints "17:45 or 20:45" for the qualification round and "16:30 or 20:00"
// for the semi-finals: the sheet says the exact timing of each of those games
// "will be announced at the end of the previous round". Those games therefore
// carry `tip: null` above and are rendered as a date with the time still to be
// confirmed, rather than being pinned to a guess. The refresh job replaces the
// null with the real tip as soon as ESPN publishes the fixture.
export const TIP_WINDOWS = {
  QR: ['17:45', '20:45'],
  SF: ['16:30', '20:00'],
}

// ESPN disagrees with FIBA about the tip-off time of exactly one game.
//
//   FIBA sheet : South Korea - Nigeria, Fri 4 Sep, 14:30 Berlin (12:30 GMT)
//   ESPN feed  : the same game (event 401907391) at 2026-09-04T10:30Z,
//                i.e. 12:30 Berlin, two hours early.
//
// ESPN's stored UTC instant equals FIBA's *GMT* figure with the Berlin offset
// subtracted a second time, which is the signature of a double conversion. All
// 23 other group games agree to the minute, so this is a single bad record and
// not a systematic offset error on either side.
//
// FIBA is the organizer and therefore the authority: the app ships FIBA's time.
// The entry is listed here so that `verifyAgainstEspn` can report the conflict
// as KNOWN rather than failing the build, and so nobody later "fixes" the app
// toward ESPN. If ESPN corrects the record, this check reports the entry as
// stale and it should be deleted.
export const KNOWN_ESPN_TIME_BUGS = [
  {
    espnId: '401907391',
    pair: ['South Korea', 'Nigeria'],
    fibaKo: '2026-09-04T14:30:00+02:00',
    espnKo: '2026-09-04T12:30:00+02:00',
    note: 'ESPN double-applies the Berlin offset; FIBA 14:30 local is correct.',
  },
]

// --------------------------------------------------------------------------
// Assembly
// --------------------------------------------------------------------------

const iso = (date, tip) => (tip ? `${date}T${tip}:00${OFFSET}` : null)

// Chronological order, then group letter, then first team: a total order, so
// the derived numbers 1-24 are stable across runs.
function numberGroupGames() {
  const sorted = [...GROUP_GAMES].sort(
    (a, b) =>
      `${a.date}T${a.tip}`.localeCompare(`${b.date}T${b.tip}`) ||
      a.group.localeCompare(b.group) ||
      a.t1.localeCompare(b.t1),
  )
  return sorted.map((g, i) => ({
    num: i + 1,
    stage: 'Group',
    group: g.group,
    t1: g.t1,
    t2: g.t2,
    ko: iso(g.date, g.tip),
    date: g.date,
  }))
}

// The full 36-game skeleton: real teams for the group phase, bracket placeholder
// labels for the final phase. Every downstream consumer reads this shape.
export function officialGames() {
  const groups = numberGroupGames()
  const finals = FINAL_PHASE.map((g) => ({
    num: g.num,
    stage: g.stage,
    t1: null,
    t2: null,
    label1: g.label1,
    label2: g.label2,
    ko: iso(g.date, g.tip),
    date: g.date,
    tbdTip: g.tip === null,
  }))
  return [...groups, ...finals]
}

export const OFFICIAL = officialGames()
