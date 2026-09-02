// A collapsible headed block. Every heading in the dashboard is one of these,
// so every section the player does not care about right now can be folded
// away and stays folded across a reload (see uiPrefs.js).
//
// `level` 2 renders the panel itself: the `.panel` card with its `.panel__title`
// heading. `level` 3 renders a sub-section inside a panel with a
// `.panel__subtitle` heading. `level` 3 with `flat` keeps the heading style of
// a modal section (`builder__h3`) for the sheets that use that idiom.
//
// The heading is a real button with aria-expanded / aria-controls, the same
// pattern as setbuilder/AccordionSection.jsx. The body stays MOUNTED while
// hidden, so a half-typed form or a chosen filter survives a fold.

import { useId, useState } from 'react'
import { useSectionPrefs } from './uiPrefs.js'

export default function Section({
  id, title, level = 3, defaultOpen = true, summary, flat = false, className = '', children,
}) {
  const prefs = useSectionPrefs()
  const [local, setLocal] = useState(defaultOpen)
  const stored = prefs?.sections?.[id]
  const open = prefs ? (stored === undefined ? defaultOpen : stored) : local
  const toggle = () => (prefs ? prefs.setSectionOpen(id, !open) : setLocal(!open))

  const uid = useId()
  const bodyId = `sec-${uid}-body`
  const headId = `sec-${uid}-head`
  const Heading = level === 2 ? 'h2' : 'h3'
  const headingCls = level === 2 ? 'panel__title' : flat ? 'builder__h3' : 'panel__subtitle'
  const rootCls = [
    'sec',
    level === 2 ? 'panel sec--panel' : flat ? 'builder__section sec--flat' : 'sec--sub',
    open ? 'sec--open' : 'sec--closed',
    className,
  ].filter(Boolean).join(' ')

  return (
    <section className={rootCls} aria-labelledby={headId}>
      <Heading className={`${headingCls} sec__title`}>
        <button
          type="button"
          id={headId}
          className="sec__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span className="sec__label">{title}</span>
          {!open && summary && <span className="sec__summary">{summary}</span>}
          <span className="sec__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </Heading>
      <div id={bodyId} className="sec__body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
