// The cast on a card — one or more characters, not one.
//
// A card used to hold a single `characterId`, which meant the studio's whole
// roster was a list of soloists. Naming two characters on one card is the thing
// collectors pair cards for, so the association is a list now (cast.js), and
// this is where the player builds it.
//
// LEAD AND SUPPORT. The first entry is the LEAD: the card is about them, and
// the print-time terms that read one character (continuity, the on-theme
// archetype) read the lead in full and everyone else at half. Every member's
// pull is summed into the card's appeal, capped, and every member records a
// real printing — a supporting credit bumps their fame and charges their
// saturation exactly as a solo card does.
//
// STANDING, not fame. The number shown against each name is what cast.js calls
// standing: the character's recognition as a floor, moved by the form's own
// fame and the fandom's favour. That is the number the card is actually priced
// off, so it is the number the picker shows.

import { castIdsOf, castStanding, MAX_CAST_PER_CARD } from '../../game/cast.js'
import { formLabel } from '../../game/people.js'
import { archetypeMatchesTheme } from '../../game/content/archetypes.js'

// Printable forms grouped under the character they belong to, best-known first.
// A form with no character (a save mid-hydrate, or an imported partial) falls
// into a single ungrouped bucket rather than vanishing from the picker.
export function groupForms(printable, people) {
  const groups = new Map()
  const loose = []
  for (const c of printable) {
    const p = c.personId ? people.find((x) => x.id === c.personId) : null
    if (!p) { loose.push(c); continue }
    if (!groups.has(p.id)) groups.set(p.id, { person: p, forms: [] })
    groups.get(p.id).forms.push(c)
  }
  const out = [...groups.values()].sort((a, b) => (b.person.recognition ?? 0) - (a.person.recognition ?? 0))
  if (loose.length) out.push({ person: null, forms: loose })
  return out
}

function standingOf(form, people) {
  const person = form.personId ? people.find((p) => p.id === form.personId) : null
  return Math.round(castStanding(form, person))
}

// The supporting half of the cast: everyone on the card after the lead.
//
// The LEAD is picked elsewhere — in the set builder that is the One-off / New /
// Existing toggle a signature card already had, and in the library it is the
// first row of this same list. Keeping the two separate is deliberate: only the
// lead can be a brand-new character, because minting two unknowns from one card
// is a mess nobody asked for.
export default function CastPicker({ card, characters, people = [], theme, set, includeLead = false }) {
  const printable = characters.filter((c) => !c.retiredWeek)
  const ids = castIdsOf(card)
  const support = includeLead ? ids : ids.slice(1)
  const chosen = new Set(ids)
  const available = printable.filter((c) => !chosen.has(c.id))
  const grouped = groupForms(available, people)

  const atCap = ids.length >= MAX_CAST_PER_CARD

  // Writing the list back.
  //
  // WHEN THIS PICKER OWNS THE LEAD (the library editor) the first entry is the
  // lead and `characterId` follows it.
  //
  // WHEN IT DOES NOT (the set builder, where CharacterPicker owns the lead) it
  // must never write `characterId`. It used to, and that was a real bug: adding
  // a supporting name to a card in "New character" mode wrote that name into
  // `characterId`, and releaseSet short-circuits on a set `characterId` — so
  // the character the player had just typed was silently never minted. Two
  // controls writing one field is what caused it.
  const commit = (nextIds) => {
    if (includeLead) return set({ castIds: nextIds, characterId: nextIds[0] ?? null })
    const support = nextIds.filter((x) => x !== card.characterId)
    set({ castIds: card.characterId ? [card.characterId, ...support] : support })
  }

  const add = (id) => { if (id && !atCap) commit([...ids, id]) }
  const remove = (id) => commit(ids.filter((x) => x !== id))
  const promote = (id) => commit([id, ...ids.filter((x) => x !== id)])

  return (
    <div className="field field--full counter">
      <span>
        {includeLead ? 'Cast' : 'Also on this card'}
        {support.length > 0 && (
          <span className="counter__badge">🎭 {support.length}{includeLead ? '' : ' more'}</span>
        )}
      </span>

      {support.length === 0 && (
        <span className="field__note">
          {includeLead
            ? 'Nobody on this card yet — a one-off, sold on its art alone.'
            : 'Just the one character. A card can credit several, and every name on it earns and spends their standing.'}
        </span>
      )}

      {support.length > 0 && (
        <ul className="roster">
          {support.map((id, i) => {
            const form = characters.find((c) => c.id === id)
            if (!form) return null
            const person = form.personId ? people.find((p) => p.id === form.personId) : null
            const isLead = ids[0] === id
            const match = theme && archetypeMatchesTheme(form.archetypeId, theme.tags)
            return (
              <li key={id} className="roster__row">
                <div className="roster__head" style={{ cursor: 'default' }}>
                  <div className="roster__main">
                    <span className="roster__name">
                      {person ? formLabel(person, form) : form.name}
                      {isLead && <span className="counter__badge">lead</span>}
                      {match ? ' ★' : ''}
                    </span>
                    <span className="muted">
                      standing {standingOf(form, people)}
                      {person ? ` · ${person.name} known at ${Math.round(person.recognition ?? 0)}` : ''}
                    </span>
                  </div>
                  <div className="roster__actions">
                    {/* Only where this picker owns the lead. In the set
                        builder CharacterPicker does, and a second control
                        writing `characterId` is what broke the new-character
                        path — see commit above. */}
                    {includeLead && !isLead && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        title="Make this the card's lead"
                        onClick={() => promote(id)}
                      >
                        ↑ Lead
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost"
                      title="Take them off this card"
                      onClick={() => remove(id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <select
        className="counter__target"
        value=""
        disabled={available.length === 0 || atCap}
        onChange={(e) => add(e.target.value)}
      >
        <option value="">
          {atCap
            ? `— ${MAX_CAST_PER_CARD} is a full card —`
            : available.length === 0 ? '— No other characters available —' : '+ Add a cast member…'}
        </option>
        {grouped.map(({ person, forms }) => (
          <optgroup key={person?.id ?? 'loose'} label={person ? person.name : 'Cast'}>
            {forms.map((c) => (
              <option key={c.id} value={c.id}>
                {person ? formLabel(person, c) : c.name} · standing {standingOf(c, people)}
                {theme && archetypeMatchesTheme(c.archetypeId, theme.tags) ? ' ★' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {atCap && (
        <span className="field__note">
          {MAX_CAST_PER_CARD} names is as crowded as a card gets. Past that
          nobody on it reads as the subject, and the appeal it earns is capped
          anyway.
        </span>
      )}

      {support.length > 1 && (
        <span className="field__note">
          Every name here is a real printing: their fame moves off how this card
          performs, and their saturation is charged for it. Their pull is summed
          into the card's appeal and then capped, so a crowd of unknowns is worth
          less than one character the room actually knows.
        </span>
      )}
    </div>
  )
}
