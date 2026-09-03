// Editor for a single signature card: rarity, printing finish, artist
// commission, standout appeal, the card's flavor + art-direction copy, and who
// is on it.
//
// The half of that which is NOT set-scoped now lives in components/cards/,
// shared with the card library (Studio > Cards): the card frame preview
// (CardFrame.jsx), the craft fields (CardCraftFields.jsx) and the supporting
// cast list (CastPicker.jsx). What stays here is exactly what needs a set: the
// rarity picked off this set's sheet, the unique-rarity spin-off that edits
// that sheet, and the new-character/lineage path, which is resolved at release
// against the roster the release is minting into.

import {
  getRarity, visualTier, defaultRaritySheet,
  makeUniqueRarity, syncFormatWithUniqueRarity, pruneRarityFromFormat,
} from '../../game/rarities.js'
import { TREATMENTS, getTreatment } from '../../game/characters.js'
import { getArchetype, archetypeMatchesTheme, archetypesByCategory } from '../../game/content/archetypes.js'
import { LINEAGE_KINDS, getLineageKind } from '../../game/content/lineages.js'
import { DemeanorPicker, ContinuityNote } from '../cast/FormTree.jsx'
import { formLabel, SATURATION_THRESHOLD } from '../../game/people.js'
import { validateLineage } from '../../game/characters.js'
import { FINISHES, getFinish, cardAppeal } from '../../game/sets.js'
import { castIdsOf } from '../../game/cast.js'
import { CardFramePreview, CHAR_TREND } from '../cards/CardFrame.jsx'
import CardCraftFields, { makeArtistOf } from '../cards/CardCraftFields.jsx'
import CastPicker, { groupForms } from '../cards/CastPicker.jsx'
import NumberField from './NumberField.jsx'

const PICKABLE_FINISHES = FINISHES.filter((f) => f.id !== 'standard')

export default function SignatureCardEditor({
  card, theme, artists, characters = [], people = [], rarities, packFormat,
  open = true, onToggleOpen,
  onChange, onRaritiesChange, onPackFormatChange, onRemove,
}) {
  const sheet = rarities ?? defaultRaritySheet()
  const set = (patch) => onChange({ ...card, ...patch })
  // By default a signature card just references a shared rarity off the
  // sheet and takes on its pull rate/value/finishes for free. Only once the
  // player customizes those does it get a `unique` rarity of its own — see
  // rarities.js's makeUniqueRarity — scoped to this one card.
  const rarityEntry = getRarity(sheet, card.rarity)
  const isUniqueRarity = !!rarityEntry.unique
  const sharedRarities = sheet.filter((r) => !r.unique)

  const makeThisCardUnique = () => {
    const uniq = makeUniqueRarity(rarityEntry, card.name)
    onRaritiesChange([...sheet, uniq])
    onPackFormatChange(syncFormatWithUniqueRarity(packFormat, rarityEntry.id, uniq.id))
    set({ rarity: uniq.id })
  }
  const updateUniqueRarity = (patch) =>
    onRaritiesChange(sheet.map((r) => (r.id === rarityEntry.id ? { ...r, ...patch } : r)))
  const revertToSharedRarity = () => {
    onRaritiesChange(sheet.filter((r) => r.id !== rarityEntry.id))
    onPackFormatChange(pruneRarityFromFormat(packFormat, rarityEntry.id))
    set({ rarity: rarityEntry.derivedFrom ?? sharedRarities[0]?.id ?? 'rare' })
  }
  const toggleUniqueFinish = (finishId) => {
    const has = (rarityEntry.finishes ?? []).includes(finishId)
    updateUniqueRarity({
      finishes: has
        ? rarityEntry.finishes.filter((f) => f !== finishId)
        : [...(rarityEntry.finishes ?? []), finishId],
    })
  }
  const artistOf = makeArtistOf(artists)
  const artist = card.artistId ? artistOf(card.artistId) : null

  // COLLAPSED, a card is one row: enough to recognise it and pick the one to
  // edit, and nothing else. Expanded it is ~600px of editor on a desktop and
  // ~900px on a phone, so a set with six marquee cards was 5.4 screens of
  // scrolling on a laptop and 10.1 on a phone — and the cap is thirty.
  if (!open) {
    return (
      <div className="sigcard sigcard--collapsed">
        <button
          type="button"
          className="sigcard__summary"
          aria-expanded="false"
          onClick={onToggleOpen}
        >
          <span className="sigcard__chevron" aria-hidden="true">▸</span>
          <span className={`cardframe__gem gem--${visualTier(sheet, card.rarity)}`} aria-hidden="true" />
          <span className="sigcard__sumname">{card.name || 'Unnamed card'}</span>
          <span className="sigcard__summeta">{summarise(card, sheet, artist, characters)}</span>
        </button>
        <button className="btn btn--ghost sigcard__remove" onClick={onRemove} title="Remove card">✕</button>
      </div>
    )
  }

  return (
    <div className="sigcard">
      <div className="sigcard__row">
        <button
          type="button"
          className="sigcard__chevronbtn"
          aria-expanded="true"
          onClick={onToggleOpen}
          title="Collapse this card"
        >
          <span className="sigcard__chevron" aria-hidden="true">▾</span>
        </button>
        <input
          className="sigcard__name"
          value={card.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Card name"
        />
        <button className="btn btn--ghost sigcard__remove" onClick={onRemove} title="Remove card">✕</button>
      </div>

      <div className="sigcard__layout">
        <CardFramePreview card={card} theme={theme} sheet={sheet} artist={artist} />
        <div className="sigcard__form">

      {!isUniqueRarity ? (
        <div className="sigcard__row sigcard__rarityrow">
          <label className="field">
            <span>Rarity</span>
            <select value={card.rarity} onChange={(e) => set({ rarity: e.target.value })}>
              {sharedRarities.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <span className="field__note">
              Takes on this rarity's pull rate, value and finishes automatically.
            </span>
          </label>
          <button type="button" className="btn btn--ghost sigcard__uniquebtn" onClick={makeThisCardUnique}>
            ✦ Give this card its own Unique rarity
          </button>
        </div>
      ) : (
        <div className="field field--full sigcard__unique">
          <span>
            Rarity — <strong>Unique</strong>
            <span className="muted"> (started from {getRarity(sharedRarities, rarityEntry.derivedFrom).name})</span>
          </span>
          <div className="sigcard__row sigcard__uniquerow">
            <label className="field">
              <span>Pull rate</span>
              <NumberField
                value={rarityEntry.pullWeight}
                aria-label="Pull weight"
                placeholder="Pull"
                onCommit={(n) => updateUniqueRarity({ pullWeight: n })}
              />
            </label>
            <label className="field">
              <span>Value tier</span>
              <NumberField
                max={100}
                value={rarityEntry.valueTier}
                aria-label="Value tier"
                placeholder="Value"
                onCommit={(n) => updateUniqueRarity({ valueTier: n })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!rarityEntry.secret}
                onChange={(e) => updateUniqueRarity({ secret: e.target.checked })}
              />
              Secret rare
            </label>
          </div>
          <div className="rared__finishgrid">
            {PICKABLE_FINISHES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={'btn btn--chip' + ((rarityEntry.finishes ?? []).includes(f.id) ? ' is-active' : '')}
                title={`${f.blurb} (×${f.costMul} print cost)`}
                onClick={() => toggleUniqueFinish(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost sigcard__uniquebtn" onClick={revertToSharedRarity}>
            ↩ Revert to shared rarity
          </button>
        </div>
      )}

      <CardCraftFields card={card} set={set} artists={artists} theme={theme} rarities={sheet} />

      <CharacterPicker card={card} characters={characters} people={people} set={set} theme={theme} />
      {/* The rest of the cast. The picker above names the LEAD (and is the only
          place that can mint a brand-new character); this adds everyone else
          who appears on the card. See cast.js. */}
      <CastPicker card={card} characters={characters} people={people} theme={theme} set={set} />
        </div>
      </div>
    </div>
  )
}

// The one line a collapsed card shows. Ordered by what actually distinguishes
// two marquee cards from each other in a list: what it is (rarity), who drew it,
// and who is on it. Appeal is included because it is the dial the player is
// usually comparing across cards, and a serial cap because it is the loudest
// thing a card can carry.
function summarise(card, sheet, artist, characters) {
  const entry = getRarity(sheet, card.rarity)
  const parts = [entry.unique ? 'Unique rarity' : entry.name]
  if (card.serialCap) parts.push(card.serialCap === 1 ? '1-of-1' : `/${card.serialCap}`)
  const finish = getFinish(card.finish)
  if (finish.id !== 'standard') parts.push(finish.name)
  if (artist) parts.push(artist.name)
  // The whole cast, not just the lead — two names on a card is the thing that
  // distinguishes it from its shelfmates, so the collapsed row has to say so.
  const cast = castIdsOf(card).map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean)
  const who = cast.length ? cast.join(' & ') : (card.newCharacterName?.trim() || null)
  if (who) parts.push(`🎭 ${who}`)
  parts.push(`appeal ${cardAppeal(card, sheet)}`)
  return parts.join(' · ')
}

// Feature a character on this card instead of a one-off: mint a brand-new one
// (a debut appearance, no fame to draw on yet) or pull in an existing roster
// entry (its fame bumps the card's appeal, scaled by the chosen treatment).
function CharacterPicker({ card, characters, people = [], set, theme }) {
  // Changing the LEAD has to rewrite the cast list, not just `characterId`:
  // castIdsOf prefers the list when it has entries, so writing the id alone
  // would leave the old lead in place and silently drop the player's pick.
  // Passing null makes the card a one-off and takes the old lead off it,
  // leaving whatever supporting cast was named.
  const setLead = (id, patch = {}) => {
    const rest = castIdsOf(card).filter((x) => x !== id && x !== card.characterId)
    set({ ...patch, characterId: id, castIds: id ? [id, ...rest] : rest })
  }
  // Four shapes, and the third is the one that had no home before: a NEW FORM
  // of a cast member who already exists. Without it, debuting Aryla in a shape
  // she had not been printed in meant either picking one of her existing forms
  // (wrong — this is a new one) or minting a "new character" who would then have
  // to be stitched to her with a fake lineage link. See people.js.
  const mode = card.characterId ? 'existing'
    : card.newCharacterPersonId ? 'newform'
      : card.newCharacterName ? 'new' : 'none'
  const selected = card.characterId ? characters.find((c) => c.id === card.characterId) : null
  // A character a lineage kind retired takes no new printings.
  // Supporting cast picked in CastPicker must not be offered as the lead here,
  // or the same character lands on the card twice.
  const printable = characters.filter((c) => !c.retiredWeek
    && !castIdsOf(card).slice(1).includes(c.id))
  const lineageKind = getLineageKind(card.newCharacterLineageKind)
  const lineageParentIds = [card.newCharacterPromotedFrom, card.newCharacterSecondParent].filter(Boolean)
  const lineageError = lineageKind
    ? validateLineage(characters, { kindId: lineageKind.id, parentIds: lineageParentIds, archetypeId: card.newCharacterArchetype })
    : null
  const newFormPerson = card.newCharacterPersonId
    ? people.find((p) => p.id === card.newCharacterPersonId)
    : null
  const newArchetype = getArchetype(card.newCharacterArchetype)
  const newMatch = theme && archetypeMatchesTheme(newArchetype.id, theme.tags)
  // Whether the character already on this card suits the set's theme. Same ★ cue
  // the artist picker uses for a specialty match, and the same underlying idea.
  const selectedMatch = selected && theme && archetypeMatchesTheme(selected.archetypeId, theme.tags)
  // An icon treatment is reserved for characters that have actually graduated —
  // it's a reward for a character blowing up, not a day-one purchase option.
  const treatmentOptions = TREATMENTS.filter((t) => !t.requiresIcon || selected?.trajectory === 'icon')

  // The character behind the selected form, and which of her forms the fandom
  // currently likes best — the decision the favour split exists to create.
  const selectedPerson = selected?.personId ? people.find((p) => p.id === selected.personId) : null
  const favouriteForm = selectedPerson
    ? characters
        .filter((c) => c.personId === selectedPerson.id)
        .reduce((top, c) => ((selectedPerson.favor?.[c.id] ?? 0) > (selectedPerson.favor?.[top?.id] ?? -1) ? c : top), null)
    : null

  // Printable forms, grouped under the character they belong to. A form with no
  // character (a save mid-hydrate, or an imported partial) falls into a single
  // ungrouped bucket rather than vanishing from the picker.
  const groupedForms = groupForms(printable, people)

  // The character a NEW form would join, for the live continuity read. Only a
  // same-being kind joins one: a fusion or a successor starts a new character.
  const lineagePerson = lineageKind?.sameBeing && card.newCharacterPromotedFrom
    ? people.find((p) => p.id === characters.find((c) => c.id === card.newCharacterPromotedFrom)?.personId)
    : null

  return (
    <div className="field field--full counter">
      <span>
        Character
        {mode !== 'none' && <span className="counter__badge">🎭 featured</span>}
      </span>
      <div className="toggle toggle--counter">
        <button className={'toggle__opt' + (mode === 'none' ? ' is-active' : '')}
          onClick={() => setLead(null, { newCharacterName: '', newCharacterPersonId: null, newCharacterArchetype: 'unaligned', newCharacterSpecies: '', newCharacterHook: '', newCharacterPromotedFrom: null, newCharacterLineageKind: null, newCharacterSecondParent: null, newFormName: '', newFormDemeanor: [], newFormCarriesName: true, treatment: 'debut' })}>
          One-off
        </button>
        <button className={'toggle__opt' + (mode === 'newform' ? ' is-active' : '')}
          disabled={people.length === 0}
          title={people.length === 0 ? 'No cast members yet — add one in Studio › Cast.' : undefined}
          onClick={() => setLead(null, {
            newCharacterPersonId: people[0]?.id ?? null,
            newCharacterName: card.name || '',
            newCharacterArchetype: people[0]?.archetypeId ?? 'unaligned',
            newFormName: '', newFormDemeanor: people[0]?.coreDemeanor ?? [], newFormCarriesName: true,
            newCharacterPromotedFrom: null, newCharacterLineageKind: null, newCharacterSecondParent: null,
            treatment: 'debut',
          })}>
          New form
        </button>
        <button className={'toggle__opt' + (mode === 'new' ? ' is-active' : '')}
          onClick={() => setLead(null, { newCharacterPersonId: null, newCharacterName: card.name || '', newCharacterArchetype: card.newCharacterArchetype ?? 'unaligned', treatment: 'debut' })}>
          New cast
        </button>
        <button className={'toggle__opt' + (mode === 'existing' ? ' is-active' : '')}
          disabled={printable.length === 0}
          title={printable.length === 0 ? 'No characters yet — create one first.' : undefined}
          onClick={() => setLead(printable[0]?.id ?? null, {
            // The archetype is KEPT, matching the "New character" branch above:
            // glancing at the existing roster and coming back must not silently
            // reset the player's pick to Unaligned, which would quietly drop both
            // the theme-cohesion bonus and the fame-drift bias.
            newCharacterName: '', newCharacterPersonId: null, newCharacterSpecies: '', newCharacterHook: '', newCharacterPromotedFrom: null,
            newCharacterLineageKind: null, newCharacterSecondParent: null,
            treatment: 'debut',
          })}>
          Existing
        </button>
      </div>

      {mode === 'newform' && (
        <>
          {/* A new form of somebody who already exists. No lineage kind is set,
              so this form carries no promotion/evolution badge — it is simply
              another way she is printed. */}
          <select
            className="counter__target"
            value={card.newCharacterPersonId ?? ''}
            onChange={(e) => {
              const who = people.find((p) => p.id === e.target.value)
              set({
                newCharacterPersonId: e.target.value || null,
                newCharacterArchetype: who?.archetypeId ?? card.newCharacterArchetype ?? 'unaligned',
                newFormDemeanor: who?.coreDemeanor ?? [],
                // Her standing art brief seeds the card's, but only while the
                // card has none of its own — a starting value, not an override.
                artNotes: card.artNotes?.trim() ? card.artNotes : (who?.artBrief ?? ''),
              })
            }}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · known at {Math.round(p.recognition ?? 0)}
              </option>
            ))}
          </select>
          <input
            className="counter__target"
            value={card.newFormName ?? ''}
            onChange={(e) => set({
              newFormName: e.target.value,
              // The card face follows the genre's convention, unless the player
              // has already written their own.
              newCharacterName: card.name || `${newFormPerson?.name ?? ''}, ${e.target.value}`,
            })}
            placeholder="Form name, e.g. Royal Soldier"
          />
          <span className="field__note">
            {newFormPerson
              ? <>A new form of <strong>{newFormPerson.name}</strong> — no lineage, just
                  another way she is printed. She debuts off her recognition
                  ({Math.round(newFormPerson.recognition ?? 0)}), not from nothing.
                  To grow this form OUT of one of her existing ones, use
                  Studio&nbsp;›&nbsp;Lineages instead.</>
              : 'Pick a cast member.'}
          </span>
        </>
      )}

      {mode === 'new' && (
        <>
          <input
            className="counter__target"
            value={card.newCharacterName}
            onChange={(e) => set({ newCharacterName: e.target.value })}
            placeholder="Character name"
          />
          {/* The archetype replaced the old free-text species field as the
              character's identity, because unlike that field it is READ: it
              earns the theme-cohesion bonus below and biases how this
              character's fame drifts for the rest of the run. */}
          <select
            className="counter__target"
            value={newArchetype.id}
            onChange={(e) => set({ newCharacterArchetype: e.target.value })}
          >
            {archetypesByCategory().map(({ category, archetypes }) => (
              <optgroup key={category.id} label={category.name}>
                {archetypes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{theme && archetypeMatchesTheme(a.id, theme.tags) ? ' ★' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="field__note">{newArchetype.blurb}</span>
          <input
            className="counter__target"
            value={card.newCharacterSpecies}
            onChange={(e) => set({ newCharacterSpecies: e.target.value })}
            placeholder="Epithet (optional, e.g. 'the Ashen')"
          />
          <input
            className="counter__target"
            value={card.newCharacterHook ?? ''}
            onChange={(e) => set({ newCharacterHook: e.target.value })}
            placeholder="Hook (optional, e.g. 'Never raises their voice.')"
          />
          {/* LINEAGE. This new character can grow out of one (or two) already
              on the roster — Kell, Broken Boy becoming Kell, Royal Soldier.
              They stay separate entries with their own archetypes and their
              own fame, linked by a lineage the illustration-set scorer reads,
              so a line built from the pair reads as one line. The KIND decides
              how much fame carries over, which archetypes the child may take,
              and whether the parent keeps printing (content/lineages.js).
              Locks on debut, like the archetype. */}
          {printable.length > 0 && (
            <>
              <select
                className="counter__target"
                value={card.newCharacterLineageKind ?? ''}
                onChange={(e) => set({
                  newCharacterLineageKind: e.target.value || null,
                  newCharacterPromotedFrom: e.target.value ? card.newCharacterPromotedFrom : null,
                  newCharacterSecondParent: null,
                })}
              >
                <option value="">— A brand-new character —</option>
                {LINEAGE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.name} — {k.short}</option>
                ))}
              </select>
              {lineageKind && (
                <>
                  <span className="field__note">{lineageKind.blurb}</span>
                  <select
                    className="counter__target"
                    value={card.newCharacterPromotedFrom ?? ''}
                    onChange={(e) => set({ newCharacterPromotedFrom: e.target.value || null })}
                  >
                    <option value="">{lineageKind.parents === 2 ? '— First parent —' : '— Grows out of —'}</option>
                    {/* EVERY form, retired ones included. Retirement closes a
                        path, not a character: a fall retires Royal Soldier, and
                        Royal Commander still has to grow out of him afterwards or
                        a story that went two ways cannot be told. A retired form
                        takes no new printings — it is absent from the picker
                        above — and it still takes new branches. */}
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({getArchetype(c.archetypeId).name}, fame {Math.round(c.fame)}{c.retiredWeek ? ', retired' : ''})
                      </option>
                    ))}
                  </select>
                  {lineageKind.parents === 2 && (
                    <select
                      className="counter__target"
                      value={card.newCharacterSecondParent ?? ''}
                      onChange={(e) => set({ newCharacterSecondParent: e.target.value || null })}
                    >
                      <option value="">— Second parent —</option>
                      {characters.filter((c) => c.id !== card.newCharacterPromotedFrom).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({getArchetype(c.archetypeId).name}, fame {Math.round(c.fame)}{c.retiredWeek ? ', retired' : ''})
                        </option>
                      ))}
                    </select>
                  )}
                  {lineageError && card.newCharacterPromotedFrom && (
                    <span className="field__note is-warn">{lineageError} Released as-is, this card debuts a plain new character.</span>
                  )}
                  {!lineageError && card.newCharacterPromotedFrom && (
                    <span className="field__note">
                      {lineagePerson
                        ? <>Another form of <strong>{lineagePerson.name}</strong>. She debuts already
                            known, off the {Math.round(lineagePerson.recognition ?? 0)} recognition
                            the character has earned across every form — not just off this one's fame.</>
                        : <>Debuts already known — carries over {Math.round(lineageKind.fameInherit * 100)}% of{' '}
                            {lineageParentIds.map((id) => characters.find((c) => c.id === id)?.name).join(' and ')}'s fame.</>}
                      {lineageKind.retiresParent
                        ? ' The predecessor takes no new printings — the story can still branch from it later.'
                        : ''}
                    </span>
                  )}
                </>
              )}
            </>
          )}
          {/* THE FORM's own half: what to call this appearance on the roster,
              how it carries itself, and whether the card face even says the
              character's name. See people.js. */}
          <DemeanorPicker
            demeanors={card.newFormDemeanor ?? []}
            onToggle={(id) => {
              const cur = card.newFormDemeanor ?? []
              const next = cur.includes(id) ? cur.filter((d) => d !== id) : cur.length >= 2 ? cur : [...cur, id]
              set({ newFormDemeanor: next })
            }}
          />
          {/* The live read on whether this still scans as her — in the same words
              the community will use after release, so the player is never
              surprised by the verdict. Silent until there is something to judge. */}
          {lineagePerson && (
            <ContinuityNote
              person={lineagePerson}
              form={{ demeanorIds: card.newFormDemeanor ?? [] }}
              kindId={lineageKind?.id}
            />
          )}
          {lineageKind?.sameBeing && (
            <>
              <input
                className="counter__target"
                value={card.newFormName ?? ''}
                onChange={(e) => set({ newFormName: e.target.value })}
                placeholder="Form name (optional, e.g. 'Royal Commander')"
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={card.newFormCarriesName !== false}
                  onChange={(e) => set({ newFormCarriesName: e.target.checked })}
                />
                <span>The card face carries the character's name</span>
              </label>
              {card.newFormCarriesName === false && lineagePerson && (
                <span className="field__note">
                  The card will not say {lineagePerson.name}. The room still works
                  out who she is, and the studio's own lists keep her attached.
                </span>
              )}
            </>
          )}
          <span className="field__note">
            {newMatch
              ? `A ${newArchetype.name.toLowerCase()} suits this set's theme — an on-theme face reads as a coherent printing and lifts the card's appeal. `
              : ''}
            Debuts on release with a small starting fame — future cards can bring
            {' '}{card.newCharacterName || 'this character'} back as an existing character.
          </span>
        </>
      )}

      {mode === 'existing' && (
        <>
          {/* GROUPED BY CHARACTER, and listing only PRINTABLE forms.
              A flat list put five Arylas side by side with no indication they
              were one woman, which is the confusion the person layer exists to
              remove — and it offered retired forms, which take no new printings
              and would silently debut as a plain new character at release. */}
          <select
            className="counter__target"
            value={card.characterId ?? ''}
            onChange={(e) => setLead(e.target.value || null)}
          >
            {groupedForms.map(({ person, forms }) => (
              <optgroup key={person?.id ?? 'loose'} label={person ? person.name : 'Cast'}>
                {forms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {person ? formLabel(person, c) : c.name} · fame {Math.round(c.fame)}
                    {person && Object.keys(person.favor ?? {}).length > 1
                      ? ` · ${Math.round((person.favor[c.id] ?? 0) * 100)}% of the fandom` : ''}
                    {theme && archetypeMatchesTheme(c.archetypeId, theme.tags) ? ' ★' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selected && (
            <span className={'trend ' + (CHAR_TREND[selected.trajectory]?.cls ?? '')}>
              {CHAR_TREND[selected.trajectory]?.icon} {selected.name} is {CHAR_TREND[selected.trajectory]?.label ?? selected.trajectory}
              {selected.trajectory === 'icon' && ' — icon treatment unlocked'}
              {selectedMatch && ` ★ on-theme for a ${theme.name} set`}
            </span>
          )}
          {/* Which form the room is actually attached to. Printing the newest
              form when they still love the first one is a worse card, and this
              is the only place the player can see that before committing. */}
          {selectedPerson && Object.keys(selectedPerson.favor ?? {}).length > 1 && (
            <span className="field__note">
              {Math.round((selectedPerson.favor[selected.id] ?? 0) * 100)}% of {selectedPerson.name}'s
              fandom favours this form
              {favouriteForm && favouriteForm.id !== selected.id && (
                <> — their favourite is <strong>{formLabel(selectedPerson, favouriteForm)}</strong></>
              )}.
              {selectedPerson.saturation > SATURATION_THRESHOLD
                && ' She is in too much right now; the room has started to say so.'}
            </span>
          )}
          <select
            className="counter__target"
            value={card.treatment ?? 'debut'}
            onChange={(e) => set({ treatment: e.target.value })}
          >
            {treatmentOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.name} (×{t.costMul} cost)</option>
            ))}
          </select>
          <span className="field__note">{getTreatment(card.treatment).blurb}</span>
        </>
      )}
    </div>
  )
}
