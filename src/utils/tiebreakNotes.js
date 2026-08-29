// Detects when a group placing came down to a drawing of lots, i.e. two teams
// were level on points, on the head-to-head sub-table among them, AND on overall
// point difference and points scored, so no computable criterion could separate
// them.
//
// Mirrors the clustering in qualification.js's resolveTie: the only place lots
// decide the order is its final branch, where a block still level through
// criteria 2-6 is settled by the stable alphabetical stand-in.
//
// There is only ONE soft reason here. The football siblings also detect a fair
// play / conduct tie-break, because FIFA ranks card totals ahead of drawing
// lots. FIBA has no conduct criterion at all, so that branch is absent rather
// than ported and left permanently unreachable.

import { rankGroup, headToHead, byLots } from './qualification.js'

// Within a points-level block, mark adjacent pairs that nothing could separate.
function markBlock(tied, group, games, notes) {
  const names = tied.map((t) => t.name)
  const sub = headToHead(names, group, games)
  const ord = [...tied].sort(
    (a, b) =>
      sub[b.name].Pts - sub[a.name].Pts ||
      sub[b.name].PD - sub[a.name].PD ||
      sub[b.name].PF - sub[a.name].PF ||
      b.PD - a.PD ||
      b.PF - a.PF ||
      // Must stay identical to resolveTie's comparator in qualification.js, or
      // the ⚖ markers point at a different adjacent pair than the table shows.
      byLots(a.name, b.name),
  )
  for (let k = 0; k + 1 < ord.length; k++) {
    const a = ord[k]
    const b = ord[k + 1]
    const sa = sub[a.name]
    const sb = sub[b.name]
    const levelThroughout =
      sa.Pts === sb.Pts &&
      sa.PD === sb.PD &&
      sa.PF === sb.PF &&
      a.PD === b.PD &&
      a.PF === b.PF
    // Two teams that have not played are trivially level on everything, which is
    // not a tie-break: it is just an empty table. Marking those would put a ⚖ on
    // all four rows of every group before a ball is thrown up, which says nothing
    // and trains the reader to ignore the marker when it does mean something.
    if (levelThroughout && a.P > 0 && b.P > 0) {
      notes.set(a.name, { reason: 'lots', vs: b.name })
      notes.set(b.name, { reason: 'lots', vs: a.name })
    }
  }
}

// Map of team name -> { reason: 'lots', vs: otherTeamName } for any team
// separated from an adjacent team only by the drawing of lots.
export function softTiebreaks(group, games) {
  const rows = rankGroup(group, games)
  const notes = new Map()
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && rows[j].Pts === rows[i].Pts) j++
    if (j - i > 1) markBlock(rows.slice(i, j), group, games, notes)
    i = j
  }
  return notes
}

export const TIEBREAK_LABEL = {
  // FIBA's last resort is not a computation at all: see byLots in
  // utils/qualification.js, which stands in for it with the FIBA World Ranking so
  // the table stays deterministic. This label is what keeps that honest — wherever
  // it shows, the order came from the ranking and the real tournament would draw
  // lots instead.
  lots: 'a drawing of lots',
}
