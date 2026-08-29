import { createContext, useContext } from 'react'

// Lets any component open the match-detail modal without prop-drilling.
// App provides the opener (it owns the selected-match state + the modal, where
// timezone and spoiler settings live).
export const DetailContext = createContext(() => {})
export function useDetail() {
  return useContext(DetailContext)
}
