// The cross-cutting React state: followed teams, the traced bracket route, the
// game-detail opener, the chosen services, and the modal accessibility hook.
//
// Every context ships an inert FALLBACK so a component renders standalone
// without its provider. Those fallbacks are what let the component tests mount a
// single view in isolation, so they are asserted rather than assumed.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, act, screen, fireEvent } from '@testing-library/react'
import { useContext } from 'react'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'
import { PathProvider, usePath } from '../src/context/path.jsx'
import { DetailContext } from '../src/context/detail.js'
import { ServicesProvider, useServices } from '../src/context/services.jsx'
import { useModalA11y } from '../src/hooks/useModalA11y.js'

beforeEach(() => localStorage.clear())

describe('follow context', () => {
  it('stars, unstars and clears, persisting under this app’s key', () => {
    const { result } = renderHook(() => useFollow(), { wrapper: FollowProvider })
    act(() => result.current.toggle('Japan'))
    act(() => result.current.toggle('Spain'))
    expect(result.current.count).toBe(2)
    expect(result.current.isFollowed('Japan')).toBe(true)
    expect(localStorage.getItem('fwwc:followed')).toContain('Japan')

    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(result.current.isFollowed('Japan')).toBe(false)
  })

  it('restores a saved selection', () => {
    localStorage.setItem('fwwc:followed', JSON.stringify(['Mali']))
    const { result } = renderHook(() => useFollow(), { wrapper: FollowProvider })
    expect(result.current.isFollowed('Mali')).toBe(true)
  })

  // A corrupt value must not take the app down on load.
  it('starts empty when the saved value is unreadable', () => {
    localStorage.setItem('fwwc:followed', 'not json')
    const { result } = renderHook(() => useFollow(), { wrapper: FollowProvider })
    expect(result.current.count).toBe(0)
  })

  it('falls back to an inert value with no provider', () => {
    const { result } = renderHook(() => useFollow())
    expect(result.current.count).toBe(0)
    expect(result.current.isFollowed('Japan')).toBe(false)
    // The inert setters must be callable, since components call them freely.
    expect(() => {
      result.current.toggle('Japan')
      result.current.clear()
    }).not.toThrow()
  })
})

describe('path context', () => {
  it('sets and clears the traced team', () => {
    const { result } = renderHook(() => usePath(), { wrapper: PathProvider })
    act(() => result.current.setPathTeam('Japan'))
    expect(result.current.pathTeam).toBe('Japan')
    act(() => result.current.setPathTeam(null))
    expect(result.current.pathTeam).toBeNull()
  })

  // The team is stored as a RAW string, not JSON, so there is nothing to fail to
  // parse: the catch arm is for a storage that refuses to be read at all.
  it('starts with no team when storage cannot be read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const { result } = renderHook(() => usePath(), { wrapper: PathProvider })
    expect(result.current.pathTeam).toBeNull()
    spy.mockRestore()
  })

  it('restores a saved team, and forgets it when cleared', () => {
    localStorage.setItem('fwwc:pathTeam', 'Japan')
    const { result } = renderHook(() => usePath(), { wrapper: PathProvider })
    expect(result.current.pathTeam).toBe('Japan')
    act(() => result.current.setPathTeam(null))
    expect(localStorage.getItem('fwwc:pathTeam')).toBeNull()
  })

  it('survives a storage that refuses to write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => usePath(), { wrapper: PathProvider })
    expect(() => act(() => result.current.setPathTeam('Japan'))).not.toThrow()
    spy.mockRestore()
  })

  it('falls back to an inert value with no provider', () => {
    const { result } = renderHook(() => usePath())
    expect(result.current.pathTeam).toBeNull()
    expect(() => result.current.setPathTeam('Japan')).not.toThrow()
  })
})

describe('detail context', () => {
  // The default is a no-op opener, so a card rendered outside the app can still
  // be clicked without throwing.
  it('defaults to a callable no-op', () => {
    const { result } = renderHook(() => useContext(DetailContext))
    expect(typeof result.current).toBe('function')
    expect(() => result.current({ num: 1 })).not.toThrow()
  })
})

describe('services context', () => {
  it('toggles a service on and off, persisting under this app’s key', () => {
    const { result } = renderHook(() => useServices(), { wrapper: ServicesProvider })
    expect(result.current.count).toBe(0)
    act(() => result.current.toggle('hbomax'))
    expect(result.current.has('hbomax')).toBe(true)
    expect(result.current.count).toBe(1)
    expect(JSON.parse(localStorage.getItem('fwwc:services'))).toEqual(['hbomax'])

    act(() => result.current.toggle('hbomax'))
    expect(result.current.has('hbomax')).toBe(false)
  })

  it('clears every selection', () => {
    const { result } = renderHook(() => useServices(), { wrapper: ServicesProvider })
    act(() => {
      result.current.toggle('hbomax')
      result.current.toggle('cable')
    })
    expect(result.current.count).toBe(2)
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('restores a saved selection', () => {
    localStorage.setItem('fwwc:services', JSON.stringify(['cable']))
    const { result } = renderHook(() => useServices(), { wrapper: ServicesProvider })
    expect(result.current.has('cable')).toBe(true)
  })

  // A key the catalog no longer defines must not linger and quietly filter the
  // schedule against a service that is gone.
  it('drops a saved key the catalog no longer defines', () => {
    localStorage.setItem('fwwc:services', JSON.stringify(['cable', 'peacock', 'nbatv']))
    const { result } = renderHook(() => useServices(), { wrapper: ServicesProvider })
    expect(result.current.services).toEqual(['cable'])
  })

  it('ignores an attempt to toggle a key the catalog does not define', () => {
    const { result } = renderHook(() => useServices(), { wrapper: ServicesProvider })
    act(() => result.current.toggle('peacock'))
    expect(result.current.count).toBe(0)
  })

  it('starts empty when the saved value is unreadable or the wrong shape', () => {
    localStorage.setItem('fwwc:services', 'not json')
    const bad = renderHook(() => useServices(), { wrapper: ServicesProvider })
    expect(bad.result.current.count).toBe(0)

    localStorage.setItem('fwwc:services', JSON.stringify({ cable: true }))
    const wrongShape = renderHook(() => useServices(), { wrapper: ServicesProvider })
    expect(wrongShape.result.current.count).toBe(0)
  })

  it('survives a storage that refuses to write, as in private mode', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useServices(), { wrapper: ServicesProvider })
    expect(() => act(() => result.current.toggle('hbomax'))).not.toThrow()
    expect(result.current.has('hbomax')).toBe(true)
    spy.mockRestore()
  })

  it('falls back to an inert value with no provider', () => {
    const { result } = renderHook(() => useServices())
    expect(result.current.count).toBe(0)
    expect(result.current.has('hbomax')).toBe(false)
    expect(() => {
      result.current.toggle('hbomax')
      result.current.clear()
    }).not.toThrow()
  })
})

describe('useModalA11y', () => {
  // jsdom performs no layout, so every element reports `offsetParent === null`
  // and the hook's visibility filter would drop them all. Making the buttons
  // report a parent is what lets the focus trap be exercised at all; without it
  // these tests pass vacuously against an empty focusable list.
  const makeVisible = () => {
    for (const el of screen.queryAllByRole('button')) {
      Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true })
    }
  }

  function Dialog({ onClose, empty = false }) {
    const ref = useModalA11y(onClose)
    return (
      <div ref={ref} tabIndex={-1} data-testid="dialog">
        {!empty && (
          <>
            <button>first</button>
            <button>middle</button>
            <button>last</button>
          </>
        )}
      </div>
    )
  }

  it('focuses the first control on open', () => {
    render(<Dialog onClose={() => {}} />)
    expect(document.activeElement).toHaveTextContent('first')
  })

  it('falls back to the dialog itself when it holds no controls', () => {
    render(<Dialog onClose={() => {}} empty />)
    expect(document.activeElement).toBe(screen.getByTestId('dialog'))
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  // The focus trap: Tab off the last control wraps to the first, and Shift+Tab
  // off the first wraps to the last, so focus cannot escape the dialog.
  it('wraps focus forward from the last control', () => {
    render(<Dialog onClose={() => {}} />)
    makeVisible()
    const [first, , last] = screen.getAllByRole('button')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('wraps focus backward from the first control', () => {
    render(<Dialog onClose={() => {}} />)
    makeVisible()
    const [first, , last] = screen.getAllByRole('button')
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('leaves Tab alone in the middle of the dialog', () => {
    render(<Dialog onClose={() => {}} />)
    makeVisible()
    const [, middle] = screen.getAllByRole('button')
    middle.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(middle)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(middle)
  })

  it('skips a disabled control when wrapping', () => {
    render(
      <div>
        <Dialog onClose={() => {}} />
      </div>,
    )
    makeVisible()
    const buttons = screen.getAllByRole('button')
    buttons[2].disabled = true
    buttons[1].focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    // "middle" is now the last enabled control, so Tab wraps to "first".
    expect(document.activeElement).toBe(buttons[0])
  })

  it('does nothing on Tab when there is nothing focusable', () => {
    render(<Dialog onClose={() => {}} empty />)
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow()
  })

  it('restores focus to whatever opened it', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = render(<Dialog onClose={() => {}} />)
    expect(document.activeElement).not.toBe(trigger)
    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
