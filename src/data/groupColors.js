// Distinct colors for the four groups, used to color-code the weekly calendar
// (and the legend). Final-phase games share one accent color.
export const GROUP_COLORS = {
  A: '#e6194b',
  B: '#3cb44b',
  C: '#4363d8',
  D: '#f58231',
}

export const KNOCKOUT_COLOR = '#f4c542'

export function colorForGame(g) {
  return g.stage === 'Group' ? GROUP_COLORS[g.group] : KNOCKOUT_COLOR
}
