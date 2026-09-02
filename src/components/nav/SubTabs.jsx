// The sub-tab bar inside a main tab. A real ARIA tablist: one tab stop, arrow
// keys move within it, and each button names the panel it controls. The bar
// scrolls sideways rather than wrapping, so five labels never stack into two
// rows on a phone.

import { useRef } from 'react'

export default function SubTabs({ tabs, active, onChange, label, idPrefix }) {
  const refs = useRef([])

  const onKey = (e, i) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + tabs.length) % tabs.length
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div className="substabs substabs--scroll" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`${idPrefix}-tab-${t.id}`}
          ref={(el) => { refs.current[i] = el }}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          className={'substabs__btn' + (active === t.id ? ' is-active' : '')}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
