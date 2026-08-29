// Tournament-wide aggregates computed from the merged game list: a team's record
// so far (the GameDetail "tale of the tape") and headline totals. All pure:
// components pass in the merged `games` array and render what comes back.
//
// There is no scorer race here. The football siblings carry a Golden Boot table
// built from per-goal event records; basketball scoring is an aggregate, not a
// list of discrete events with a scorer and a minute attached, so a points
// leaderboard would have to come from ESPN's per-player box scores rather than
// from the schedule. That is out of scope for this edition, so the boot/scorer
// machinery is deliberately absent rather than ported and left inert.

import { FLAG_BY_TEAM } from '../data/teams.js'

// A result counts only once FINAL: a live score is provisional and a voided
// game has no result (same rule as the clinch engine / bracket resolution).
const isFinal = (g) => Boolean(g.score) && !g.live && !g.voided

// One team's tournament record across its finished games.
//
// There is no draw column: basketball plays overtime until a winner emerges, so
// every finished game is a win for one side and a loss for the other. `otWins` /
// `otLosses` track the games that needed overtime, which is the nearest thing
// this sport has to the football siblings' penalty-shootout tracking.
//
// `before` (a tip-off timestamp) limits the record to games that TIPPED OFF
// earlier: the record "going into" a given game, historically accurate when
// viewing a past game. Strictly earlier, so the game itself and the simultaneous
// final-round group games stay out.
export function teamRecord(games, team, { before } = {}) {
  const cutoff = before ? new Date(before).getTime() : null
  const rec = {
    played: 0,
    w: 0,
    l: 0,
    pf: 0,
    pa: 0,
    pd: 0,
    otWins: 0,
    otLosses: 0,
    biggestWin: null,
    streak: 0,
  }
  const results = []
  for (const g of games) {
    if (!isFinal(g)) continue
    if (cutoff != null && !(new Date(g.ko).getTime() < cutoff)) continue
    const side = g.t1 === team ? 't1' : g.t2 === team ? 't2' : null
    if (!side) continue
    const [pf, pa] = side === 't1' ? g.score : [g.score[1], g.score[0]]
    if (pf === pa) continue // data error, not a draw, basketball has none
    rec.played++
    rec.pf += pf
    rec.pa += pa
    const won = pf > pa
    if (won) {
      rec.w++
      if (g.ot) rec.otWins++
      if (!rec.biggestWin || pf - pa > rec.biggestWin.margin) {
        rec.biggestWin = { margin: pf - pa, opponent: side === 't1' ? g.t2 : g.t1, num: g.num }
      }
    } else {
      rec.l++
      if (g.ot) rec.otLosses++
    }
    results.push({ won, ko: g.ko })
  }
  rec.pd = rec.pf - rec.pa

  // Current run of consecutive wins (positive) or losses (negative), most recent
  // game first.
  results.sort((a, b) => new Date(b.ko) - new Date(a.ko))
  for (const r of results) {
    if (rec.streak === 0) rec.streak = r.won ? 1 : -1
    else if (r.won && rec.streak > 0) rec.streak++
    else if (!r.won && rec.streak < 0) rec.streak--
    else break
  }
  return rec
}

// Teams still involved: any REAL team with a game left to play (or in play).
// Pass the resolved game list so final-phase slots hold team names once known.
// Placeholder labels ("Winner Game 27") are not real teams and do not count.
// Beaten semi-finalists stay active until the third-place game is final; after
// the Final the set is empty.
export function activeTeams(games) {
  const out = new Set()
  for (const g of games) {
    if (isFinal(g) || g.voided) continue
    for (const t of [g.t1, g.t2]) if (FLAG_BY_TEAM[t]) out.add(t)
  }
  return out
}

// Games that needed overtime, in tip order.
export const overtimeGames = (games) =>
  games.filter((g) => isFinal(g) && g.ot).sort((a, b) => new Date(a.ko) - new Date(b.ko))

// Headline tournament numbers. Points/averages count FINISHED games only (a live
// score is provisional); `live` is how many are in play.
export function tournamentTotals(games) {
  let played = 0
  let points = 0
  let ot = 0
  let live = 0
  let biggest = null
  for (const g of games) {
    if (g.live) live++
    if (!isFinal(g)) continue
    played++
    points += g.score[0] + g.score[1]
    if (g.ot) ot++
    const margin = Math.abs(g.score[0] - g.score[1])
    if (!biggest || margin > biggest.margin) biggest = { margin, num: g.num }
  }
  return {
    played,
    points,
    perGame: played ? points / played : 0,
    ot,
    live,
    biggest,
  }
}
