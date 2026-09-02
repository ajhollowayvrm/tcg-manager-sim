// Studio › Cards — the card library.
//
// A card used to be something you could only design INSIDE a set, as one of
// that set's signature highlights. This is the same act, without the set: the
// studio designs a card, and then decides where it goes. See carddesigns.js for
// why a design is deliberately not owned by a release, and cast.js for what
// naming characters on it is worth.
//
// Three destinations, and the panel says so plainly on every row:
//   · pulled into a set you are designing (Studio › Design)
//   · shipped in a collector box as that SKU's exclusive
//   · printed on its own, here, as a promo
//
// A pull COPIES. Editing a design after it printed cannot reach the card, which
// is the same doctrine studio standards follow — so the printing log on each row
// is a record of where it went, not a live link to anything.

import { useMemo, useState } from 'react'
import Section from './nav/Section.jsx'
import CardDesignEditor from './cards/CardDesignEditor.jsx'
import { standaloneCost } from '../game/carddesigns.js'
import { castMembers, castStanding } from '../game/cast.js'
import { getTreatment } from '../game/characters.js'
import { currentArtist } from '../game/artists.js'

function formatCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

const HOW_LABEL = { set: 'in a set', product: 'in a collector box', standalone: 'as a studio promo' }

export default function CardsPanel({ state, onAddDesign, onUpdateDesign, onRemoveDesign, onPrintDesign }) {
  const designs = state.cardDesigns ?? []
  const characters = state.characters ?? []
  const people = state.people ?? []
  const [open, setOpen] = useState(() => new Set())
  const [query, setQuery] = useState('')

  const artistOf = useMemo(() => (id) => currentArtist(state, id), [state])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return designs
    return designs.filter((d) => {
      if (d.name.toLowerCase().includes(q)) return true
      return castMembers(d, characters, people).some(({ form, person }) => (
        form.name.toLowerCase().includes(q) || (person?.name ?? '').toLowerCase().includes(q)
      ))
    })
  }, [designs, query, characters, people])

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const add = () => {
    onAddDesign({ name: `Card ${designs.length + 1}` })
  }

  return (
    <Section id="studio.cards" title="Card library" level={2}>
      <p className="panel__lede">
        Cards the studio has designed, owned by no set. Pull one into a release
        from Studio&nbsp;›&nbsp;Design, ship one in a collector box, or print one on
        its own as a promo. Name characters on a card and it carries their
        standing wherever it ends up — and two cards sharing a character are two
        cards collectors chase together.
      </p>

      <div className="roster__controls">
        <button className="btn btn--primary" onClick={add}>+ Design a card</button>
        {designs.length > 3 && (
          <input
            className="roster__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by card or character"
            aria-label="Search the card library"
          />
        )}
      </div>

      {designs.length === 0 && (
        <p className="panel__empty">
          No cards designed yet. A card designed here belongs to no set — it waits
          on the shelf until you pull it into a release, put it in a collector
          box, or print it on its own. Start one and give it a cast.
        </p>
      )}

      {designs.length > 0 && shown.length === 0 && (
        <p className="panel__empty">Nothing in the library matches “{query}”.</p>
      )}

      {shown.map((design) => {
        const cost = standaloneCost(design, artistOf, getTreatment(design.treatment).costMul)
        const cast = castMembers(design, characters, people)
        const printings = design.printings ?? []
        const affordable = state.cash >= cost
        return (
          <div key={design.id} className="librow">
            <CardDesignEditor
              design={design}
              characters={characters}
              people={people}
              artists={state.artists ?? []}
              open={open.has(design.id)}
              onToggleOpen={() => toggle(design.id)}
              onChange={(patch) => onUpdateDesign(design.id, patch)}
              onRemove={() => onRemoveDesign(design.id)}
            />
            <div className="librow__foot">
              <span className="muted">
                {printings.length === 0
                  ? 'Never printed.'
                  : `Printed ${printings.length}× — ${printings.map((p) => HOW_LABEL[p.how] ?? 'somewhere').join(', ')}.`}
                {cast.length > 0 && (
                  <> Best-known name on it stands at{' '}
                    {Math.round(Math.max(...cast.map(({ form, person }) => castStanding(form, person))))}.
                  </>
                )}
              </span>
              <button
                className="btn"
                disabled={!affordable}
                title={affordable
                  ? 'Print a small run with no set behind it — a promo, never pullable from a booster.'
                  : `Needs ${formatCash(cost)} on hand.`}
                onClick={() => onPrintDesign(design.id)}
              >
                Print as a promo — {formatCash(cost)}
              </button>
            </div>
          </div>
        )
      })}
    </Section>
  )
}
