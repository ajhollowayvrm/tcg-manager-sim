// A collapsible section for the set-builder modal. Sections toggle independently
// (multi-open) so the player can expand as many as they like. A one-line summary
// in the header doubles as at-a-glance confirmation of what's set inside, so the
// modal stays short and scannable instead of a 5-screen scroll on mobile.

export default function AccordionSection({ title, summary, open, onToggle, children }) {
  return (
    <section className={'acc' + (open ? ' acc--open' : '')}>
      <button
        type="button"
        className="acc__head"
        aria-expanded={!!open}
        onClick={onToggle}
      >
        <span className="acc__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="acc__title">{title}</span>
        {!open && summary && <span className="acc__summary">{summary}</span>}
      </button>
      {open && <div className="acc__body">{children}</div>}
    </section>
  )
}
