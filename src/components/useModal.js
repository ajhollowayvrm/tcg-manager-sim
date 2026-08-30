// Modal keyboard behaviour: Escape to close, a focus trap, and focus restored
// to whatever opened it.
//
// A grep of src/ found ZERO key handlers before this. Both modals carried
// role="dialog" aria-modal="true" and then behaved like plain divs: no Escape,
// no focus trap, and Tab walked straight out into the dashboard behind them —
// which for a screen-reader or keyboard-only player means the set builder is
// effectively a trap in the other direction, with no way out but the mouse.

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModal(onClose) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const opener = document.activeElement

    // Move focus into the dialog so the first Tab lands inside it.
    const first = node.querySelector(FOCUSABLE)
    ;(first ?? node).focus?.()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      // Wrap at both ends rather than letting focus escape to the page behind.
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // Give focus back to whatever opened the dialog.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [onClose])

  return ref
}
