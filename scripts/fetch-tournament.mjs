// Rebuild src/data/{games,teams,venues}.js for the FIBA Women's Basketball
// World Cup 2026.
//
//   npm run fetch:tournament          # write the data modules
//   npm run fetch:tournament -- --dry # print what would change, write nothing
//
// TWO SOURCES, ONE AUTHORITY:
//
//   * scripts/official.mjs — FIBA's published game schedule, frozen in-repo. It
//     owns STRUCTURE: which teams meet, in which group, with which game number,
//     at which tip-off time, and the whole 12-game final-phase bracket wiring.
//   * ESPN's `basketball/fiba` scoreboard — owns the things only a live feed can
//     know: the event id (which the live overlay and box score are keyed on), the
//     arena, and the score once a game is played.
//
// The build FAILS if ESPN and FIBA disagree about which teams meet, and REPORTS
// (without failing) if they disagree about a tip-off time in a way that is
// already recorded in KNOWN_ESPN_TIME_BUGS. An unrecorded time conflict fails.
//
// Scripts in this repo must use Node built-ins and in-repo source only, with no
// npm dependencies. test/guards.test.js enforces it.

import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getJson } from './lib/fetch.mjs'
import {
  EDITION,
  FLAGS,
  GROUPS,
  KNOWN_ESPN_TIME_BUGS,
  OFFICIAL,
  OFFSET,
  TZ,
  VENUE_META,
  canon,
} from './official.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

// ESPN files every FIBA competition under one league slug, so the scoreboard for
// this window could in principle carry another FIBA event. Every game is kept
// only if its note headline says which women's-World-Cup group it belongs to, or
// it is a final-phase game of this edition: see keepEvent().
const ESPN = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/fiba'

// site.api.espn.com 403s from any datacenter IP while site.web.api serves the
// same routes, so CI must use the host above. Do not "simplify" it back.

const EVENT_NOTE = /^FIBA Women's World Cup\b/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

const pairKey = (a, b) => [canon(a), canon(b)].sort().join('|')

// Berlin is CEST (+02:00) for the entire tournament window, so a fixed offset is
// correct here and no timezone database lookup is needed. Asserted below.
function toBerlin(utcIso) {
  const d = new Date(utcIso)
  const shifted = new Date(d.getTime() + 2 * 3600 * 1000)
  return `${shifted.toISOString().slice(0, 19)}${OFFSET}`
}

// ---------------------------------------------------------------------------
// ESPN -> normalized events
// ---------------------------------------------------------------------------

// "FIBA Women's World Cup - Group C" -> "C"; a final-phase headline -> null.
function groupOf(competition) {
  const headline = (competition.notes || [])[0]?.headline || ''
  const m = headline.match(/Group ([A-D])\s*$/)
  return m ? m[1] : null
}

function keepEvent(event) {
  const headline = (event.competitions[0].notes || [])[0]?.headline || ''
  return EVENT_NOTE.test(headline)
}

// ESPN's abbreviation field is not trustworthy for this competition: Mali
// (team 83469) is served with abbreviation "KOR", which collides with South
// Korea (team 17480). Both would render as "KOR" in a compact scoreline and one
// would look like the other's result. Teams are therefore keyed by ESPN's
// numeric id and named by `displayName`, and the short code the app shows is
// derived from ABBR below rather than read from the feed.
const ABBR = {
  Australia: 'AUS',
  Belgium: 'BEL',
  China: 'CHN',
  Czechia: 'CZE',
  France: 'FRA',
  Germany: 'GER',
  Hungary: 'HUN',
  Italy: 'ITA',
  Japan: 'JPN',
  Mali: 'MLI',
  Nigeria: 'NGR',
  'Puerto Rico': 'PUR',
  'South Korea': 'KOR',
  Spain: 'ESP',
  Türkiye: 'TUR',
  'United States': 'USA',
}

function normalizeEvent(event) {
  const c = event.competitions[0]
  const venueId = Number(c.venue?.id)
  assert(
    VENUE_META[venueId],
    `Unknown venue ${venueId} (${c.venue?.fullName}) on event ${event.id}`,
  )

  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')

  // FIBA prints the team ESPN models as the AWAY side first, in all 24 group
  // games, and every game is at a neutral site. `t1` therefore follows FIBA's
  // ordering so the app and the official sheet read the same way round.
  const t1 = canon(away.team.displayName)
  const t2 = canon(home.team.displayName)

  const completed = !!c.status?.type?.completed
  const score =
    completed && home.score !== '' && home.score != null
      ? [Number(away.score), Number(home.score)]
      : null

  // Basketball cannot be drawn: a tie at the end of regulation is settled by as
  // many five-minute overtime periods as it takes. FIBA plays four 10-minute
  // quarters, so any period beyond the 4th is overtime. This replaces the
  // aet/pens pair the football sibling carried; there is no shootout here and a
  // finished game ALWAYS has a winner, which the bracket code relies on.
  const period = Number(c.status?.period || 0)
  const ot = completed && period > 4 ? period - 4 : 0

  // US broadcast, per game. ESPN carries this for the whole edition (the
  // Warner Bros. Discovery package: TNT, truTV and HBO Max), so unlike the
  // football siblings, where the channel field flaps on and off for old
  // matches and is therefore stated tournament-wide. Here it is committed per
  // game, which is what lets a card say where THIS game is on.
  const tv = [
    ...new Set((c.broadcasts || []).flatMap((b) => b.names || [])),
  ].sort()

  return {
    espnId: event.id,
    group: groupOf(c),
    tv,
    espnKo: toBerlin(c.date),
    venue: VENUE_META[venueId].key,
    t1,
    t2,
    key: pairKey(t1, t2),
    score,
    ot,
    completed,
  }
}

async function fetchEspn() {
  const url = `${ESPN}/scoreboard?dates=${EDITION.window}&limit=200`
  const data = await getJson(url)
  const events = (data.events || []).filter(keepEvent)
  assert(events.length > 0, `ESPN returned no ${EDITION.year} Women's World Cup events`)
  assert(
    events.length <= EDITION.games,
    `ESPN returned ${events.length} events, more than the ${EDITION.games}-game edition`,
  )
  return events.map(normalizeEvent)
}

// ---------------------------------------------------------------------------
// Merge: FIBA structure + ESPN ids/venues/scores
// ---------------------------------------------------------------------------

const knownBug = (espnId) => KNOWN_ESPN_TIME_BUGS.find((b) => b.espnId === espnId)

function buildGames(espnEvents) {
  const byPair = new Map()
  for (const e of espnEvents) {
    // A pair can only meet twice across the whole tournament if they met in the
    // group and again in the final phase, so bucket rather than overwrite.
    if (!byPair.has(e.key)) byPair.set(e.key, [])
    byPair.get(e.key).push(e)
  }

  const report = { matchedGroup: 0, matchedFinal: 0, pendingFinal: 0, timeConflicts: [] }

  const games = OFFICIAL.map((g) => {
    if (g.stage === 'Group') {
      const bucket = byPair.get(pairKey(g.t1, g.t2)) || []
      const hit = bucket.find((e) => e.group === g.group)
      assert(
        hit,
        `ESPN has no Group ${g.group} game for ${g.t1} v ${g.t2} (official game ${g.num})`,
      )
      report.matchedGroup += 1

      // FIBA owns the tip time. Where ESPN disagrees, the conflict must already
      // be recorded, or the build stops: an unexplained schedule move is exactly
      // the thing this check exists to surface.
      if (hit.espnKo !== g.ko) {
        const bug = knownBug(hit.espnId)
        assert(
          bug && bug.fibaKo === g.ko && bug.espnKo === hit.espnKo,
          `Unrecorded tip conflict on game ${g.num} (${g.t1} v ${g.t2}): ` +
            `FIBA ${g.ko} vs ESPN ${hit.espnKo}. If FIBA moved the game, update ` +
            `scripts/official.mjs; if ESPN is wrong, add it to KNOWN_ESPN_TIME_BUGS.`,
        )
        report.timeConflicts.push({ num: g.num, fiba: g.ko, espn: hit.espnKo })
      }

      return {
        ...g,
        espnId: hit.espnId,
        venue: hit.venue,
        tv: hit.tv,
        score: hit.score,
        ot: hit.ot,
      }
    }

    // Final phase. ESPN publishes these only once the teams are known, so until
    // the group stage decides them the app ships the placeholder record and the
    // bracket renders the slot labels.
    const resolved = espnEvents.find(
      (e) => !e.group && e.espnId && finalPhaseMatches(e, g, espnEvents),
    )
    if (!resolved) {
      report.pendingFinal += 1
      return { ...g, espnId: null, venue: null, tv: [], score: null, ot: 0 }
    }
    report.matchedFinal += 1
    return {
      ...g,
      t1: resolved.t1,
      t2: resolved.t2,
      espnId: resolved.espnId,
      venue: resolved.venue,
      tv: resolved.tv,
      ko: resolved.espnKo,
      tbdTip: false,
      score: resolved.score,
      ot: resolved.ot,
    }
  })

  return { games, report }
}

// Final-phase games are matched to their official slot by DATE, because that is
// the only thing known about them before the teams are drawn. Games 25/26 both
// fall on 8 September and 27/28 both on 9 September, so a date can carry two
// slots; they are assigned in tip order, which is the order FIBA announces them.
function finalPhaseMatches(event, official, all) {
  const day = event.espnKo.slice(0, 10)
  if (day !== official.date) return false
  const sameDay = all
    .filter((e) => !e.group && e.espnKo.slice(0, 10) === day)
    .sort((a, b) => a.espnKo.localeCompare(b.espnKo))
  const slots = OFFICIAL.filter((g) => g.stage !== 'Group' && g.date === day).sort(
    (a, b) => a.num - b.num,
  )
  const idx = sameDay.indexOf(event)
  return idx >= 0 && slots[idx]?.num === official.num
}

function buildTeams() {
  const out = {}
  for (const [g, names] of Object.entries(GROUPS)) {
    out[g] = names
      .map((n) => ({ name: n, flag: FLAGS[n], abbr: ABBR[n] }))
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const t of out[g]) {
      assert(t.flag, `No flag for ${t.name}`)
      assert(t.abbr, `No abbreviation for ${t.name}`)
    }
  }
  return out
}

function buildVenues(games) {
  const used = new Set(games.map((g) => g.venue).filter(Boolean))
  const out = {}
  for (const meta of Object.values(VENUE_META)) {
    if (!used.has(meta.key)) continue
    out[meta.key] = {
      name: meta.name,
      sponsorName: meta.sponsorName,
      city: meta.city,
      country: meta.country,
      countryFlag: meta.countryFlag,
      tz: meta.tz,
      capacity: meta.capacity,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const BANNER = (what) =>
  `// GENERATED by scripts/fetch-tournament.mjs, do not edit by hand.\n` +
  `// ${what}\n` +
  `// Structure and tip-off times come from FIBA's official game schedule\n` +
  `// (frozen in scripts/official.mjs, which is the authority); event ids,\n` +
  `// arenas and scores come from ESPN's basketball/fiba scoreboard.\n` +
  `// Regenerate with: npm run fetch:tournament\n`

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function gameLiteral(g) {
  const bits = [`num: ${g.num}`, `stage: ${q(g.stage)}`]
  if (g.group) bits.push(`group: ${q(g.group)}`)
  bits.push(`t1: ${g.t1 ? q(g.t1) : 'null'}`, `t2: ${g.t2 ? q(g.t2) : 'null'}`)
  if (g.label1) bits.push(`label1: ${q(g.label1)}`, `label2: ${q(g.label2)}`)
  bits.push(`venue: ${g.venue ? q(g.venue) : 'null'}`)
  bits.push(`ko: ${g.ko ? q(g.ko) : 'null'}`)
  // A game with no confirmed tip still has a known calendar date, which is what
  // the schedule and week views bucket it on. Only emitted when it is needed, so
  // a normal game's date stays derivable from `ko` alone and cannot drift from it.
  if (g.tbdTip) bits.push('tbdTip: true', `date: ${q(g.date)}`)
  bits.push(`espnId: ${g.espnId ? q(g.espnId) : 'null'}`)
  if (g.tv && g.tv.length) bits.push(`tv: [${g.tv.map(q).join(', ')}]`)
  if (g.score) bits.push(`score: [${g.score.join(', ')}]`)
  if (g.ot) bits.push(`ot: ${g.ot}`)
  return `  { ${bits.join(', ')} },`
}

function renderGames(games) {
  return (
    BANNER(`All ${games.length} games of the FIBA Women's Basketball World Cup ${EDITION.year}.`) +
    `//\n` +
    `// \`ko\` is the tip-off instant as an ISO 8601 string. Every game of this\n` +
    `// edition is played in ${EDITION.city}, and ${EDITION.city} is on CEST (${OFFSET}) for the\n` +
    `// whole 4-13 September window, so unlike the multi-venue football siblings\n` +
    `// this tournament genuinely has ONE offset. The offset is still written out\n` +
    `// explicitly so \`new Date(ko)\` resolves to the right absolute instant and\n` +
    `// can be formatted into any viewer's timezone.\n` +
    `//\n` +
    `// \`ko\` is null and \`tbdTip\` is true on the games whose tip-off FIBA has not\n` +
    `// announced yet: the sheet prints "17:45 or 20:45" for the qualification\n` +
    `// round and "16:30 or 20:00" for the semi-finals, to be confirmed when the\n` +
    `// previous round ends. Those carry \`date\` (the Berlin calendar date, which\n` +
    `// IS known) so the schedule can still place them, and render the time as TBC.\n` +
    `//\n` +
    `// \`label1\`/\`label2\` are the bracket placeholders a final-phase game was\n` +
    `// drawn with ("Winner Group A"). They stay alongside the resolved teams so\n` +
    `// the bracket can show a slot's provenance and so an undecided edition\n` +
    `// renders from the same records.\n` +
    `//\n` +
    `// \`ot\` counts OVERTIME PERIODS (0 in regulation). Basketball has no draw:\n` +
    `// a finished game always has a winner, which is why there is no aet/pens\n` +
    `// pair here and why the bracket can always resolve a completed game.\n` +
    `//\n` +
    `// \`tv\` lists the US broadcasters carrying the game, from ESPN's own\n` +
    `// broadcast field. This edition is on the Warner Bros. Discovery package.\n` +
    `//\n` +
    `// \`espnId\` is the ESPN event id, used to fetch that game's box score on\n` +
    `// demand and to match the live overlay. It is null on a final-phase game\n` +
    `// ESPN has not published yet.\n` +
    `\n` +
    `export const STAGE_LABELS = {\n` +
    `  Group: 'Group Phase',\n` +
    `  QR: 'Qualification to Quarter-Finals',\n` +
    `  QF: 'Quarter-Final',\n` +
    `  SF: 'Semi-Final',\n` +
    `  '3rd': 'Third-Place Game',\n` +
    `  Final: 'Final',\n` +
    `}\n\n` +
    `export const STAGE_ORDER = ['Group', 'QR', 'QF', 'SF', '3rd', 'Final']\n\n` +
    `export const GAMES = [\n${games.map(gameLiteral).join('\n')}\n]\n`
  )
}

function renderTeams(groups) {
  const body = Object.entries(groups)
    .map(([g, teams]) => {
      const rows = teams
        .map((t) => `    { name: ${q(t.name)}, flag: ${q(t.flag)}, abbr: ${q(t.abbr)} },`)
        .join('\n')
      return `  ${g}: [\n${rows}\n  ],`
    })
    .join('\n')

  const flat = Object.values(groups).flat()
  const flags = flat.map((t) => `  ${q(t.name)}: ${q(t.flag)},`).join('\n')
  const abbrs = flat.map((t) => `  ${q(t.name)}: ${q(t.abbr)},`).join('\n')
  const all = flat
    .map((t) => t.name)
    .sort()
    .map((n) => `  ${q(n)},`)
    .join('\n')

  return (
    BANNER(`The ${EDITION.teams} teams of the FIBA Women's Basketball World Cup ${EDITION.year}.`) +
    `//\n` +
    `// \`abbr\` is NOT ESPN's abbreviation field. ESPN serves Mali with the\n` +
    `// abbreviation "KOR", which collides with South Korea; both would render as\n` +
    `// "KOR" and one team's result would read as the other's. The codes below are\n` +
    `// the FIBA ones, set in scripts/fetch-tournament.mjs. Never repopulate this\n` +
    `// from the feed's own abbreviation.\n` +
    `\n` +
    `export const TEAMS = {\n${body}\n}\n\n` +
    `export const FLAG_BY_TEAM = {\n${flags}\n}\n\n` +
    `export const ABBR_BY_TEAM = {\n${abbrs}\n}\n\n` +
    `export const ALL_TEAMS = [\n${all}\n]\n`
  )
}

function renderVenues(venues) {
  const body = Object.entries(venues)
    .map(
      ([key, v]) =>
        `  ${key}: {\n` +
        `    name: ${q(v.name)},\n` +
        `    sponsorName: ${q(v.sponsorName)},\n` +
        `    city: ${q(v.city)},\n` +
        `    country: ${q(v.country)},\n` +
        `    countryFlag: ${q(v.countryFlag)},\n` +
        `    tz: ${q(v.tz)},\n` +
        `    capacity: ${v.capacity},\n` +
        `  },`,
    )
    .join('\n')

  return (
    BANNER(`The ${EDITION.venues} host arenas of the FIBA Women's Basketball World Cup ${EDITION.year}.`) +
    `//\n` +
    `// Both arenas are in ${EDITION.city}, so \`tz\` is ${q(TZ)} for both and the\n` +
    `// tournament has a single local clock.\n` +
    `//\n` +
    `// \`sponsorName\` is what ESPN calls the arena; \`name\` is what FIBA prints.\n` +
    `// They differ for the Berlin Arena, which ESPN files as "Uber Arena". Showing\n` +
    `// the sponsor name would make the app disagree with the official schedule.\n` +
    `\n` +
    `export const VENUES = {\n${body}\n}\n`
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const espnEvents = await fetchEspn()
  const { games, report } = buildGames(espnEvents)

  assert(
    games.length === EDITION.games,
    `Built ${games.length} games, expected ${EDITION.games}`,
  )
  const groupGames = games.filter((g) => g.stage === 'Group')
  assert(
    groupGames.length === 24,
    `Built ${groupGames.length} group games, expected 24`,
  )
  for (const [g, names] of Object.entries(GROUPS)) {
    const played = groupGames.filter((x) => x.group === g)
    assert(played.length === 6, `Group ${g} has ${played.length} games, expected 6`)
    const seen = new Set(played.flatMap((x) => [x.t1, x.t2]))
    assert(
      seen.size === 4 && names.every((n) => seen.has(n)),
      `Group ${g} teams mismatch: ${[...seen].sort().join(', ')}`,
    )
  }

  const files = [
    ['src/data/games.js', renderGames(games)],
    ['src/data/teams.js', renderTeams(buildTeams())],
    ['src/data/venues.js', renderVenues(buildVenues(games))],
  ]

  console.log(
    `FIBA Women's World Cup ${EDITION.year}: ${games.length} games ` +
      `(${report.matchedGroup}/24 group matched to ESPN, ` +
      `${report.matchedFinal}/12 final-phase published, ` +
      `${report.pendingFinal} still awaiting the draw)`,
  )
  for (const c of report.timeConflicts) {
    console.log(`  known ESPN tip conflict on game ${c.num}: FIBA ${c.fiba} / ESPN ${c.espn}, using FIBA`)
  }
  const scored = games.filter((g) => g.score).length
  console.log(`  ${scored} of ${games.length} games have a final score`)

  for (const [rel, text] of files) {
    const path = join(ROOT, rel)
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      before = ''
    }
    if (before === text) {
      console.log(`  = ${rel} unchanged`)
      continue
    }
    if (DRY) {
      console.log(`  ~ ${rel} WOULD change (${before.length} -> ${text.length} bytes)`)
      continue
    }
    writeFileSync(path, text)
    console.log(`  + ${rel} written (${text.length} bytes)`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
