// The set-creation flow. A modal over the dashboard holding the slider layer,
// signature card editor, prerelease toggle, a live cost summary, and Release.

import { useState } from 'react'
import Slider from './Slider.jsx'
import SignatureCardEditor from './SignatureCardEditor.jsx'
import RarityEditor from './RarityEditor.jsx'
import PackFormatEditor from './PackFormatEditor.jsx'
import PackOddsPanel from './PackOddsPanel.jsx'
import AccordionSection from './AccordionSection.jsx'
import ProductLineupEditor from './ProductLineupEditor.jsx'
import { packSize, PACK_PRESETS } from '../../game/rarities.js'
import { SKU_TYPES } from '../../game/products.js'
import {
  createDraft,
  createSignatureCard,
  fillRandomCards,
  setCost,
  sizeProfile,
  validateDraft,
  MAX_SIGNATURE_CARDS,
  MIN_SET_LENGTH,
  MAX_SET_LENGTH,
  MAX_SECRET_CARDS,
  MAX_SPOTLIGHT_PICKS,
  maxReprintedCards,
} from '../../game/sets.js'
import { THEMES, getTheme } from '../../game/content/themes.js'
import { getConcept } from '../../game/content/concepts.js'
import { ARTISTS } from '../../game/content/artists.js'
import { TIERS, TIER_IDS, getTier, canUnlockAnniversary, gimmickIntensity } from '../../game/blocks.js'
import { getGimmick, gimmicksByCategory, NO_GIMMICK } from '../../game/content/gimmicks.js'

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

// A fresh sig_N id that won't collide with existing cards.
function nextId(cards) {
  let max = 0
  for (const c of cards) {
    const m = /sig_(\d+)/.exec(c.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

export default function SetBuilder({ setNumber, cash, artists, characters = [], liveCards = [], sets = [], blocks = [], franchise, conceptId, onRelease, onClose }) {
  // The first set you ever ship MUST be a major (it opens your first block); once
  // a block is live you can ship riders. Seed the tier accordingly.
  const isFirstSet = blocks.length === 0
  const [draft, setDraft] = useState(() => createDraft(setNumber, 'major', blocks))
  const anniversaryGate = canUnlockAnniversary({ franchise, setsShipped: sets.length })
  // The founding concept's naming style (creature vs. character) — flavor
  // only, see content/concepts.js. Feeds the auto-fill preview below so it
  // matches what release will actually generate.
  const nameStyle = getConcept(conceptId).nameStyle

  // Accordion: sections toggle independently (multi-open). Identity is open by
  // default; everything else starts collapsed so the modal opens short and
  // scannable. Each collapsed header shows a one-line summary of its contents.
  const [open, setOpen] = useState({ identity: true })
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  const patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const tier = getTier(draft.tier)
  const theme = getTheme(draft.themeId)
  // How this set's size reads — drives the length slider's live readout and the
  // same numbers the sim will apply on release (see sets.js's sizeProfile).
  const size = sizeProfile(draft)
  // The block a rider is attached to (for inheritance display).
  const attachedBlock = blocks.find((b) => b.id === draft.attachBlockId) ?? null

  // Switching tier re-seeds the tier-dependent defaults (length, secrets, block
  // wiring, inherited theme) from createDraft, but carries over the player's
  // identity + slider work so they don't lose edits when toggling tiers.
  const changeTier = (nextTier) =>
    setDraft((d) => {
      const seed = createDraft(setNumber, nextTier, blocks)
      return {
        ...seed,
        name: d.name,
        designLoudness: d.designLoudness,
        printRun: d.printRun,
        pricePoint: d.pricePoint,
        rarityChase: d.rarityChase,
        rarities: d.rarities,
        packFormat: d.packFormat,
        oddsPublished: d.oddsPublished,
        products: d.products,
        boosterChannels: d.boosterChannels,
        // Regional stagger is a major-only lever — dropped when switching to a rider.
        regionalStagger: nextTier === 'major' ? d.regionalStagger : false,
        leadRegionName: nextTier === 'major' ? d.leadRegionName : '',
        signatureCards: d.signatureCards,
        reprintedCards: d.reprintedCards,
        coverCharacterId: d.coverCharacterId,
        artDirectorId: d.artDirectorId,
        spotlight: d.spotlight,
        prerelease: d.prerelease,
        releaseEvent: d.releaseEvent,
        // Theme is a per-set flavor pick, independent of tier — switching tier
        // shouldn't reset it out from under the player.
        themeId: d.themeId,
      }
    })

  // Anniversary is reprint-centric with no block/gimmick to configure — open
  // straight to the reprints section.
  const onTierChange = (nextTier) => {
    changeTier(nextTier)
    if (nextTier === 'anniversary') setOpen((o) => ({ ...o, reprints: true }))
  }

  // Resolve artists to their live drifted record so the cost summary and editor
  // reflect current prices, not the static seed.
  const artistOf = (id) => artists?.find((a) => a.id === id) ?? null
  const cost = setCost(draft, (id) => artistOf(id) ?? undefined)
  const errors = validateDraft(draft, { blocks, isFirstSet, franchise, setsShipped: sets.length })
  // Cash can go negative (a loan), so affordability NO LONGER blocks release —
  // it only flags that you'll dip into debt. The only release gate is validity.
  const goesIntoDebt = cash - cost.total < 0
  const canRelease = errors.length === 0

  const setCard = (idx, next) =>
    setDraft((d) => ({
      ...d,
      signatureCards: d.signatureCards.map((c, i) => (i === idx ? next : c)),
    }))

  // Add one blank hand-design card (capped at the max).
  const addCard = () =>
    setDraft((d) => {
      if (d.signatureCards.length >= MAX_SIGNATURE_CARDS) return d
      return { ...d, signatureCards: [...d.signatureCards, createSignatureCard(nextId(d.signatureCards))] }
    })

  // Add one themed-random highlight (capped at the max), using the set's sheet.
  const addRandom = () =>
    setDraft((d) => ({
      ...d,
      signatureCards: fillRandomCards(d.signatureCards, d.signatureCards.length + 1, getTheme(d.themeId), d.designLoudness, `${d.name}:add`, d.rarities, nameStyle),
    }))

  const removeCard = (idx) =>
    setDraft((d) => ({
      ...d,
      signatureCards: d.signatureCards.filter((_, i) => i !== idx),
    }))

  // One-line summaries shown in each collapsed accordion header — at-a-glance
  // confirmation of what's set inside without expanding.
  const presetName = PACK_PRESETS.find((p) => p.id === draft.packFormat?.preset)?.name ?? 'custom'
  const blockSummary = tier.opensBlock
    ? (getGimmick(draft.block?.gimmickId)
        ? `Opens a block — ${getGimmick(draft.block.gimmickId).name}`
        : 'Opens a plain themed block')
    : attachedBlock
      ? `Rides “${attachedBlock.name}”${attachedBlock.gimmickName ? ` (${attachedBlock.gimmickName})` : ' (plain era)'}`
      : 'No block to ride'
  const summaries = {
    block: blockSummary,
    composition: `${draft.setLength} cards, ${draft.rarities.length} rarities${draft.secretCount ? `, ${draft.secretCount} secret` : ''}`,
    booster: `${packSize(draft.packFormat)}-card ${presetName}`,
    odds: draft.oddsPublished ? 'Published' : 'Obscured',
    godPack: !(draft.godPack?.enabled ?? true)
      ? 'off'
      : (draft.godPack?.rarityIds?.length ? `${draft.godPack.rarityIds.length} rarity combo` : 'auto: top tier'),
    products: `$${draft.pricePoint.toFixed(2)} · ` + ((draft.products?.length ?? 0)
      ? ['Boosters', ...draft.products.map((p) => SKU_TYPES[p.kind]?.name.split(' ')[0] ?? p.kind)].join(' + ')
      : 'Boosters only'),
    prerelease: draft.prerelease.enabled ? (draft.prerelease.chasePullable ? 'on, chase-pullable' : 'on') : 'off',
    releaseEvent: draft.releaseEvent?.type === 'midnight' ? 'Midnight launch'
      : draft.releaseEvent?.type === 'themed' ? 'Themed drop' : 'Standard',
    signatures: draft.signatureCards.length ? `${draft.signatureCards.length} card${draft.signatureCards.length > 1 ? 's' : ''}` : 'none',
    reprints: (draft.reprintedCards?.length ?? 0) ? `${draft.reprintedCards.length} reprinted` : 'none',
    look: `${loudnessLabel(draft.designLoudness)}, ${draft.rarityChase >= 60 ? 'chase-heavy' : draft.rarityChase <= 40 ? 'accessible' : 'balanced'}`,
    spotlight: (draft.spotlight?.picks?.length ?? 0)
      ? `${draft.spotlight.picks.length} previewed`
      : 'no previews',
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__sheet">
        <header className="modal__head">
          <h2>Design a {tier.name}</h2>
          <button className="btn btn--ghost" onClick={onClose}>✕</button>
        </header>

        <div className="modal__body">
          {/* Release tier — the first decision. A major opens a block; a minor/
              micro rides a live one. Drives the whole set's scale & effects. */}
          <TierPicker tier={draft.tier} isFirstSet={isFirstSet} anniversaryGate={anniversaryGate} onChange={onTierChange} />


          {/* Identity & era — what this set IS. The era is part of a set's
              identity, so the block/gimmick editor lives here rather than in a
              section of its own; splitting them is what made the old flow read
              mechanics-first. Open by default. */}
          <AccordionSection title="Identity & era" summary={summaries.block} open={open.identity} onToggle={() => toggle('identity')}>
            <label className="field field--full">
              <span>Set name</span>
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>

            <label className="field field--full">
              <span>Theme</span>
              <select
                value={draft.themeId}
                onChange={(e) => patch({ themeId: e.target.value })}
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {theme && (
                <span className="field__note">
                  Flavors this set's card names and art direction — can differ
                  from the block's other sets, the way Jungle and Fossil
                  differed from Base Set.
                </span>
              )}
            </label>


            {/* Cover character — the face on the box. Marketing, not a card:
                it lends the set the character's accumulated fame. Only offered
                once there's a roster to pick from. */}
            {characters.length > 0 && (
              <label className="field field--full">
                <span>Cover character <span className="muted">(the face on the box art)</span></span>
                <select
                  value={draft.coverCharacterId ?? ''}
                  onChange={(e) => patch({ coverCharacterId: e.target.value || null })}
                >
                  <option value="">No cover character</option>
                  {[...characters]
                    .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name} — fame {Math.round(c.fame ?? 0)}</option>
                    ))}
                </select>
                <span className="field__note">
                  Putting a known face on the box lends the set that character's
                  accumulated fame. A newcomer lends almost nothing.
                </span>
              </label>
            )}

            {/* Art director — one artist's look across the whole set. */}
            <label className="field field--full">
              <span>Art director <span className="muted">(optional — sets the look of the whole set)</span></span>
              <select
                value={draft.artDirectorId ?? ''}
                onChange={(e) => patch({ artDirectorId: e.target.value || null })}
              >
                <option value="">No art director</option>
                {/* Identity (name/specialty) lives in the static roster; the
                    live record carries only the drifted cost/reach. */}
                {ARTISTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {formatCash((artistOf(a.id)?.cost ?? a.cost) * 2)}, {a.specialty.join('/')}
                  </option>
                ))}
              </select>
              <span className="field__note">
                Commissioning one artist across the set costs double their card
                rate, but their eye lifts every card in it — not just the ones
                they personally drew. Worth most when their specialty matches
                the set's theme.
              </span>
            </label>

            {/* The era this set belongs to: a major OPENS a block (optionally
                introducing a gimmick), a rider ATTACHES to a live one.
                Anniversary sets are freestanding — no block at all. */}
            {(tier.opensBlock || tier.ridesBlock) && (
              <BlockEditor
                draft={draft}
                tier={tier}
                blocks={blocks}
                attachedBlock={attachedBlock}
                onPatchBlock={(b) => patch({ block: { ...draft.block, ...b } })}
                onAttach={(id) => {
                  const blk = blocks.find((x) => x.id === id)
                  patch({ attachBlockId: id, themeId: blk?.themeId ?? draft.themeId })
                }}
              />
            )}
          </AccordionSection>

          {/* Set composition — length, secret rares, and the rarity sheet */}
          <AccordionSection title="Set composition" summary={summaries.composition} open={open.composition} onToggle={() => toggle('composition')}>
            <Slider
              label={`Set length (cards) — ${sizeLabel(size.s)}`}
              value={draft.setLength}
              min={tier.lengthRange[0]} max={tier.lengthRange[1]} step={1}
              onChange={(v) => patch({ setLength: v })}
              left={`${tier.lengthRange[0]}`} right={`${tier.lengthRange[1]}`}
            />
            <span className={'field__note' + (size.bloat > 0.5 ? ' is-warn' : '')}>
              {size.bloat > 0.5
                ? `At ${draft.setLength} cards this is a landmark ${tier.name.toLowerCase()} — a bigger launch wave and a richer dev budget, but the chase thins out across more cards and "bloated set" talk follows.`
                : size.s <= -0.5
                  ? `A tight ${draft.setLength} cards — dense and completable, which set-collectors love, but a smaller growth event.`
                  : `A balanced ${tier.name.toLowerCase()} at ${draft.setLength} cards. Bigger reads as more of an event; smaller reads as more collectible.`}
            </span>
            <Slider
              label="Secret rares (numbered above the count)"
              value={draft.secretCount}
              min={0} max={MAX_SECRET_CARDS} step={1}
              onChange={(v) => patch({ secretCount: v })}
              left="0" right={`${MAX_SECRET_CARDS}`}
            />
            <span className="field__note">
              The full {draft.setLength}-card set auto-generates across your rarities
              {draft.secretCount > 0 && <> plus {draft.secretCount} secret rare{draft.secretCount > 1 ? 's' : ''} (e.g. {draft.setLength + 1}/{draft.setLength})</>}.
              Any card — even a humble common — can become a market darling.
            </span>
            <RarityEditor sheet={draft.rarities} onChange={(rarities) => patch({ rarities })} />
          </AccordionSection>

          {/* Look & feel — the two DESIGN dials. Paired deliberately: loudness
              and chase distribution are both about how the set presents itself,
              which is what keeps loudness reading as a design lever rather than
              a balance one. */}
          <AccordionSection title="Look & feel" summary={summaries.look} open={open.look} onToggle={() => toggle('look')}>
            <Slider
              label="Design loudness"
              value={draft.designLoudness}
              onChange={(v) => patch({ designLoudness: v })}
              left="Restrained" right="Loud"
            />
            <span className="field__note">
              How hard this set's cards are pushed to outshine what came before —
              bigger frames, splashier foils, more presentation. Loud sells now,
              but collectors feel their older grails losing shine.
            </span>
            <Slider
              label="Rarity distribution"
              value={draft.rarityChase}
              onChange={(v) => patch({ rarityChase: v })}
              left="Accessible" right="Chase-heavy"
            />
            <span className="field__note">
              Chase-heavy trades richer on the secondary market — a set built
              around scarce hits pays off directly in what its cards sell for.
            </span>
          </AccordionSection>

          {/* Signature cards */}
          <AccordionSection
            title={`Signature highlights (${draft.signatureCards.length}/${MAX_SIGNATURE_CARDS})`}
            summary={summaries.signatures}
            open={open.signatures}
            onToggle={() => toggle('signatures')}
          >
            <div className="builder__sectionhead">
              <span className="muted">Optional marquee cards.</span>
              <div className="builder__cardbtns">
                <button
                  className="btn"
                  onClick={addRandom}
                  disabled={draft.signatureCards.length >= MAX_SIGNATURE_CARDS}
                >
                  ✨ Add random
                </button>
                <button
                  className="btn"
                  onClick={addCard}
                  disabled={draft.signatureCards.length >= MAX_SIGNATURE_CARDS}
                >
                  + Add card
                </button>
              </div>
            </div>
            <div className="sigcards">
              {draft.signatureCards.map((card, i) => (
                <SignatureCardEditor
                  key={card.id}
                  card={card}
                  theme={theme}
                  artists={artists}
                  characters={characters}
                  rarities={draft.rarities}
                  onChange={(next) => setCard(i, next)}
                  onRemove={() => removeCard(i)}
                />
              ))}
            </div>
          </AccordionSection>

          {/* Spotlight reveals — which cards get shown off before launch */}
          <AccordionSection
            title={`Spotlight & preview (${draft.spotlight?.picks?.length ?? 0}/${MAX_SPOTLIGHT_PICKS})`}
            summary={summaries.spotlight}
            open={open.spotlight}
            onToggle={() => toggle('spotlight')}
          >
            <span className="field__note">
              Cards you show off publicly before the set drops. A couple of
              reveals build real anticipation — but preview most of what's worth
              pulling and there's nothing left to find in the pack. Two or three
              is the sweet spot.
            </span>
            <SpotlightPicker
              picks={draft.spotlight?.picks ?? []}
              signatureCards={draft.signatureCards}
              reprints={draft.reprintedCards ?? []}
              liveCards={liveCards}
              block={tier.opensBlock ? draft.block : attachedBlock}
              tier={tier}
              onChange={(picks) => patch({ spotlight: { ...draft.spotlight, picks } })}
            />
          </AccordionSection>

          {/* Reprint popular cards from older sets — a fan-service / hype draw */}
          <AccordionSection
            title={`Reprint popular cards (${draft.reprintedCards?.length ?? 0}/${maxReprintedCards(draft.tier)})`}
            summary={summaries.reprints}
            open={open.reprints}
            onToggle={() => toggle('reprints')}
          >
            <ReprintPicker
              reprints={draft.reprintedCards ?? []}
              liveCards={liveCards}
              sets={sets}
              rarities={draft.rarities}
              max={maxReprintedCards(draft.tier)}
              allowUpgrade={tier.id === 'anniversary'}
              onChange={(reprintedCards) => patch({ reprintedCards })}
            />
          </AccordionSection>
          {/* Booster format — how a pack is built from the rarity sheet */}
          <AccordionSection title="Booster format" summary={summaries.booster} open={open.booster} onToggle={() => toggle('booster')}>
            <span className="field__note">
              How a pack is built from your rarities — slot counts and which
              rarities each slot pulls. Hit-heavy boosters cost a little more to
              print and generate a little more buzz.
            </span>
            <PackFormatEditor
              format={draft.packFormat}
              sheet={draft.rarities}
              onChange={(packFormat) => patch({ packFormat })}
            />
          </AccordionSection>

          {/* Pack odds & transparency — always previewed; publishing trades a
              little hype/mystique for community trust and dampens a
              gambling-mechanics backlash risk on a chase-heavy set. */}
          <AccordionSection title="Pack odds & transparency" summary={summaries.odds} open={open.odds} onToggle={() => toggle('odds')}>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.oddsPublished}
                onChange={(e) => patch({ oddsPublished: e.target.checked })}
              />
              Publish these odds to the community
            </label>
            <span className="field__note">
              Published odds build trust — a small sentiment bump and no risk
              of a gambling-mechanics backlash — but trade away a little of the
              mystique that hype thrives on. Obscured keeps the mystery (and a
              touch more hype), at the cost of that risk on a chase-heavy set.
            </span>
            <PackOddsPanel sheet={draft.rarities} format={draft.packFormat} />
          </AccordionSection>

          {/* God pack — the real-hobby legend where every card in a pack
              hits. Still a vanishingly rare roll (see packs.js's
              GOD_PACK_CHANCE); this only decides whether this set can roll
              one at all, and what it's built from when it does. */}
          <AccordionSection title="God pack" summary={summaries.godPack} open={open.godPack} onToggle={() => toggle('godPack')}>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.godPack?.enabled ?? true}
                onChange={(e) => patch({ godPack: { ...draft.godPack, enabled: e.target.checked } })}
              />
              This set can roll a god pack
            </label>
            <span className="field__note">
              A vanishingly rare pack where every card is a hit — the story
              players tell for years. Off means this set never rolls one.
            </span>
            {(draft.godPack?.enabled ?? true) && (
              <>
                <span className="field__note">
                  What's in it: pick which rarities a god pack draws from.
                  None picked = auto (this set's single highest rarity, the
                  classic behavior). Pick several for a real combination.
                </span>
                <div className="rared__finishgrid">
                  {draft.rarities.map((r) => {
                    const picked = draft.godPack?.rarityIds ?? []
                    const on = picked.includes(r.id)
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={'btn btn--chip' + (on ? ' is-active' : '')}
                        onClick={() => patch({
                          godPack: {
                            ...draft.godPack,
                            rarityIds: on ? picked.filter((id) => id !== r.id) : [...picked, r.id],
                          },
                        })}
                      >
                        {r.name}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </AccordionSection>

          {/* Product lineup — which SKUs the set ships in beyond boosters */}
          <AccordionSection title="Print & pricing" summary={summaries.products} open={open.products} onToggle={() => toggle('products')}>
            <Slider
              label="Print run"
              value={draft.printRun}
              onChange={(v) => patch({ printRun: v })}
              left="Under-print" right="Over-print"
            />
            <Slider
              label="Pack price (MSRP)"
              value={draft.pricePoint}
              min={2} max={12} step={0.25}
              onChange={(v) => patch({ pricePoint: v })}
              format={(v) => '$' + v.toFixed(2)}
            />
            <span className="field__note">
              Beyond boosters, ship the set as bundles, a collector box, or tins —
              each a separate product with its own price, print run, and buyer
              appeal. More channels mean more revenue, but each costs its own
              print run up front.
            </span>
            <ProductLineupEditor
              products={draft.products ?? []}
              onChange={(products) => patch({ products })}
              boosterChannels={draft.boosterChannels}
              onChangeBoosterChannels={(boosterChannels) => patch({ boosterChannels })}
            />
            {tier.opensBlock && (
              <label className="check" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={draft.regionalStagger}
                  onChange={(e) => patch({ regionalStagger: e.target.checked })}
                />
                Stagger regional release
                <span className="muted"> — a lead region drops first (30% of the discovery wave now), the rest of the world follows 3 weeks later</span>
              </label>
            )}
            {tier.opensBlock && draft.regionalStagger && (
              <label className="field field--full" style={{ marginTop: 8 }}>
                <span>Lead-region name <span className="muted">(flavor only — how the set's known before the wide release)</span></span>
                <input
                  value={draft.leadRegionName}
                  placeholder={`${draft.name} (Regional)`}
                  onChange={(e) => patch({ leadRegionName: e.target.value })}
                />
              </label>
            )}
          </AccordionSection>

          {/* Prerelease */}
          <AccordionSection title="Prerelease" summary={summaries.prerelease} open={open.prerelease} onToggle={() => toggle('prerelease')}>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.prerelease.enabled}
                onChange={(e) =>
                  patch({
                    prerelease: {
                      enabled: e.target.checked,
                      chasePullable: e.target.checked && draft.prerelease.chasePullable,
                    },
                  })
                }
              />
              Run a prerelease event <span className="muted">(+$15,000)</span>
            </label>
            <label className={'check' + (draft.prerelease.enabled ? '' : ' is-disabled')}>
              <input
                type="checkbox"
                disabled={!draft.prerelease.enabled}
                checked={draft.prerelease.chasePullable}
                onChange={(e) =>
                  patch({ prerelease: { ...draft.prerelease, chasePullable: e.target.checked } })
                }
              />
              Chase cards pullable from prerelease product
              <span className="muted"> (more hype &amp; early revenue, but the surprise is spent before launch day)</span>
            </label>
          </AccordionSection>

          {/* Special release event — flavor on top of a normal release */}
          <AccordionSection title="Release event" summary={summaries.releaseEvent} open={open.releaseEvent} onToggle={() => toggle('releaseEvent')}>
            <label className="check">
              <input
                type="radio"
                name="releaseEvent"
                checked={(draft.releaseEvent?.type ?? 'none') === 'none'}
                onChange={() => patch({ releaseEvent: { type: 'none' } })}
              />
              Standard release
            </label>
            <label className="check">
              <input
                type="radio"
                name="releaseEvent"
                checked={draft.releaseEvent?.type === 'midnight'}
                onChange={() => patch({ releaseEvent: { type: 'midnight' } })}
              />
              Midnight launch <span className="muted">(+$6,000 — bigger buzz spike, but stokes scalper chatter)</span>
            </label>
            <label className="check">
              <input
                type="radio"
                name="releaseEvent"
                checked={draft.releaseEvent?.type === 'themed'}
                onChange={() => patch({ releaseEvent: { type: 'themed' } })}
              />
              Themed drop <span className="muted">(free — a smaller, safe buzz lift)</span>
            </label>
          </AccordionSection>

        </div>

        {/* Cost summary + release */}
        <footer className="modal__foot">
          <div className="costs">
            <CostLine label="Development" value={cost.dev} />
            <CostLine label={(draft.products?.length ?? 0) ? 'Booster print' : 'Print run'} value={cost.printCost} />
            {cost.skus > 0 && <CostLine label="Other SKUs print" value={cost.skus} />}
            <CostLine label="Art commissions" value={cost.art} />
            {cost.artDirection > 0 && <CostLine label="Art direction" value={cost.artDirection} />}
            {cost.serialization > 0 && <CostLine label="Serialization" value={cost.serialization} />}
            {cost.exclusivePromo > 0 && <CostLine label="Exclusive promo" value={cost.exclusivePromo} />}
            {cost.prerelease > 0 && <CostLine label="Prerelease" value={cost.prerelease} />}
            {cost.releaseEvent > 0 && <CostLine label="Release event" value={cost.releaseEvent} />}
            {cost.spotlight > 0 && <CostLine label="Preview campaign" value={cost.spotlight} />}
            <CostLine label="Total" value={cost.total} total />
            <div className={'costs__cash' + (goesIntoDebt ? ' is-bad' : '')}>
              On hand: {formatCash(cash)}
              {goesIntoDebt && <span className="costs__after"> → {formatCash(cash - cost.total)} after</span>}
            </div>
          </div>

          <div className="builder__actions">
            {errors.length > 0 && (
              <ul className="builder__errors">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {goesIntoDebt && errors.length === 0 && (
              <p className="builder__debt">This set puts you {formatCash(cost.total - cash)} into debt — a loan (interest accrues weekly).</p>
            )}
            <button
              className="btn btn--release"
              disabled={!canRelease}
              onClick={() => { onRelease(draft); onClose() }}
            >
              Release {draft.name} — {formatCash(cost.total)}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function CostLine({ label, value, total }) {
  return (
    <div className={'costs__line' + (total ? ' costs__line--total' : '')}>
      <span>{label}</span>
      <span>{formatCash(value)}</span>
    </div>
  )
}

// The release-tier selector — the first decision in the builder. A major opens a
// block; a minor/micro rides a live one. Riders are disabled until a block exists
// (your first set must be a major). Anniversary is disabled until the franchise
// has earned it (see canUnlockAnniversary). Each shows its scale + a one-line character.
function TierPicker({ tier, isFirstSet, anniversaryGate, onChange }) {
  return (
    <div className="tierpicker">
      {TIER_IDS.map((id) => {
        const t = TIERS[id]
        const needsBlock = isFirstSet && t.ridesBlock // no block to ride yet
        const needsHistory = id === 'anniversary' && !anniversaryGate?.ok
        const locked = needsBlock || needsHistory
        const active = tier === id
        const title = needsBlock
          ? 'Release a Major first to open a block these can ride.'
          : needsHistory
            ? anniversaryGate?.reason
            : t.blurb
        return (
          <button
            key={id}
            type="button"
            className={'tierpicker__opt' + (active ? ' is-active' : '') + (locked ? ' is-locked' : '')}
            disabled={locked}
            onClick={() => !locked && onChange(id)}
            title={title}
          >
            <span className="tierpicker__sym">{t.symbol}</span>
            <span className="tierpicker__name">{t.name.replace(' set', '')}</span>
            <span className="tierpicker__blurb">{t.blurb}</span>
            {locked && <span className="tierpicker__lock">{needsBlock ? 'needs a block' : 'locked'}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Block & gimmick editor. For a MAJOR: pick a gimmick from the roster, name the
// block, and tune its chase intensity. For a MINOR/MICRO: pick which live block
// to ride (auto-inherits its gimmick, shown read-only — theme stays its own).
function BlockEditor({ draft, tier, blocks, attachedBlock, onPatchBlock, onAttach }) {
  // ---- Rider: attach to a live block ----
  if (tier.ridesBlock) {
    if (!blocks.length) {
      return <p className="panel__empty">No blocks yet — release a Major to open your first block.</p>
    }
    const g = attachedBlock ? getGimmick(attachedBlock.gimmickId) : null
    return (
      <div className="builder__inner">
        <span className="field__note">
          A {tier.id} set rides a live block — it shares the block's gimmick
          {attachedBlock?.gimmickId
            ? <> and prints its {attachedBlock.treatmentLabel} chase cards</>
            : <>, which is a plain era with no chase subtype to print</>}
          , but can't mint a new one of its own. Its theme is a separate,
          independent pick — the way Jungle and Fossil both rode the Base Set
          era with different flavors.
        </span>
        <label className="field field--full">
          <span>Ride which block?</span>
          <select value={draft.attachBlockId ?? ''} onChange={(e) => onAttach(e.target.value)}>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.gimmickName ?? 'plain era'} (opened wk {b.openedWeek})
              </option>
            ))}
          </select>
        </label>
        {attachedBlock && (
          <div className="blockcard blockcard--read">
            <div className="blockcard__row"><span>Gimmick</span><strong>{attachedBlock.gimmickName ?? 'None — a plain themed era'}</strong></div>
            {attachedBlock.gimmickId && (
              <>
                <div className="blockcard__row"><span>Intensity</span><strong>{intensityLabel(attachedBlock.intensity)}</strong></div>
                <div className="blockcard__row"><span>Chase tier</span><strong>{attachedBlock.treatmentLabel}</strong></div>
              </>
            )}
            <span className="field__note">{(g ?? NO_GIMMICK).blurb}</span>
          </div>
        )}
      </div>
    )
  }

  // ---- Major: open a new block ----
  const b = draft.block ?? {}
  const g = getGimmick(b.gimmickId)
  // Picking a gimmick seeds its default intensity (the player can retune).
  // The empty option means "plain themed era" — stored as a null id.
  const pickGimmick = (id) => {
    const gm = getGimmick(id)
    onPatchBlock({ gimmickId: gm ? gm.id : null, intensity: gm?.defaultIntensity ?? 50 })
  }
  return (
    <div className="builder__inner">
      <span className="field__note">
        A Major opens a new block. It can introduce a gimmick — the era-defining
        chase treatment every set in the block rides — or run as a plain themed
        era with no chase subtype at all. Blocks coexist: opening a new one
        doesn't retire the old.
      </span>

      <label className="field field--full">
        <span>Era gimmick <span className="muted">(optional)</span></span>
        <select value={b.gimmickId ?? ''} onChange={(e) => pickGimmick(e.target.value)}>
          <option value="">{NO_GIMMICK.name}</option>
          {gimmicksByCategory().map(({ category, gimmicks }) => (
            <optgroup key={category.id} label={category.name}>
              {gimmicks.map((gm) => (
                <option key={gm.id} value={gm.id}>{gm.name} — {gm.treatmentLabel} chase</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="field__note">{(g ?? NO_GIMMICK).blurb}</span>
      </label>

      <label className="field field--full">
        <span>Block name <span className="muted">{g ? '(blank uses the gimmick name)' : '(name this era)'}</span></span>
        <input
          value={b.gimmickName ?? ''}
          placeholder={g?.name ?? 'Block name'}
          onChange={(e) => onPatchBlock({ gimmickName: e.target.value })}
        />
      </label>

      {/* Intensity only means anything when there's a chase subtype to tune. */}
      {g && (
        <>
          <Slider
            label={`Chase intensity — ${intensityLabel(b.intensity ?? g.defaultIntensity)}`}
            value={b.intensity ?? g.defaultIntensity}
            onChange={(v) => onPatchBlock({ intensity: v })}
            left="Subtle" right="Maximal chase"
          />
          <span className="field__note">
            A subtle era keeps its {g.treatmentLabel} chase cards rare and
            understated; maximal chase mints them denser and richer.
          </span>
        </>
      )}
    </div>
  )
}

// A short word for where the design-loudness slider sits.
function loudnessLabel(v) {
  if (v <= 25) return 'Restrained'
  if (v < 45) return 'Understated'
  if (v < 60) return 'Balanced'
  if (v < 80) return 'Bold'
  return 'Loud'
}

// A short word for where the set-length slider sits in its tier's band.
// Mirrors intensityLabel below.
function sizeLabel(s) {
  if (s <= -0.6) return 'Tight — completable'
  if (s <= -0.2) return 'Lean'
  if (s < 0.2) return 'Standard for the tier'
  if (s < 0.6) return 'Large'
  return 'Landmark expansion — bloat risk'
}

// A short word for where the chase-intensity slider sits.
function intensityLabel(intensity) {
  if (intensity <= 25) return 'Subtle — understated era'
  if (intensity <= 45) return 'Lean subtle'
  if (intensity < 55) return 'Balanced'
  if (intensity < 75) return 'Rich'
  return 'Maximal chase — pure collector bait'
}

// Pick which of this set's cards get shown off publicly before launch.
// Candidates come from the three groups that exist at design time and can be
// resolved to real cards at release (see sets.js's resolveSpotlightIds):
// signature highlights, the block's minted chase cards, and chosen reprints.
// Picks are stored as { kind, ref } where `ref` is the index within its group,
// so a pick survives renaming a card but is dropped if that card goes away.
function SpotlightPicker({ picks, signatureCards, reprints, liveCards, block, tier, onChange }) {
  const full = picks.length >= MAX_SPOTLIGHT_PICKS
  const has = (kind, ref) => picks.some((p) => p.kind === kind && p.ref === ref)
  const toggle = (kind, ref) => {
    if (has(kind, ref)) onChange(picks.filter((p) => !(p.kind === kind && p.ref === ref)))
    else if (!full) onChange([...picks, { kind, ref }])
  }

  // How many chase cards this block will mint, previewed with the same formula
  // release uses (blocks.js's mintTreatmentCards). A plain era mints none.
  const treatmentCount = block?.gimmickId
    ? Math.max(0, Math.round(tier.treatmentBase * (0.6 + gimmickIntensity(getGimmick(block.gimmickId), block.intensity ?? getGimmick(block.gimmickId)?.defaultIntensity).treatment)))
    : 0
  const treatmentLabel = getGimmick(block?.gimmickId)?.treatmentLabel ?? 'Era'

  const groups = [
    {
      kind: 'signature',
      title: 'Signature highlights',
      empty: 'No signature highlights designed yet.',
      items: signatureCards.map((c, i) => ({ ref: i, label: c.name || `Signature card ${i + 1}` })),
    },
    {
      kind: 'treatment',
      // With no gimmick there's no treatment label to name the group by.
      title: block?.gimmickId ? `${treatmentLabel} chase cards` : 'Era chase cards',
      empty: block?.gimmickId
        ? 'This block mints no chase cards at that intensity.'
        : 'A plain themed era has no chase subtype to preview.',
      items: Array.from({ length: treatmentCount }, (_, i) => ({ ref: i, label: `${treatmentLabel} chase #${i + 1}` })),
    },
    {
      kind: 'reprint',
      title: 'Reprinted favorites',
      empty: 'No reprints chosen yet.',
      items: (reprints ?? []).map((r, i) => ({
        ref: i,
        label: liveCards.find((c) => c.id === r.cardId)?.name ?? `Reprint ${i + 1}`,
      })),
    },
  ]

  return (
    <div className="spotlight">
      {groups.map((group) => (
        <div key={group.kind} className="spotlight__group">
          <h4 className="spotlight__title">{group.title}</h4>
          {group.items.length === 0 ? (
            <p className="panel__empty">{group.empty}</p>
          ) : (
            group.items.map((item) => (
              <label
                key={item.ref}
                className={'check' + (!has(group.kind, item.ref) && full ? ' is-disabled' : '')}
              >
                <input
                  type="checkbox"
                  checked={has(group.kind, item.ref)}
                  disabled={!has(group.kind, item.ref) && full}
                  onChange={() => toggle(group.kind, item.ref)}
                />
                {item.label}
              </label>
            ))
          )}
        </div>
      ))}
      {full && (
        <span className="field__note is-warn">
          That's every reveal you can run — and at this many, fans start saying
          the previews gave the whole set away.
        </span>
      )}
    </div>
  )
}

// Pick popular cards from older sets to reprint into this new set. Reprinting a
// fan favorite lifts the new set's hype (a fan-service draw) but softens the old
// original's price. Offers the most valuable live cards as candidates. On the
// anniversary tier (`allowUpgrade`), each pick can also upgrade to a new,
// richer rarity — the reprint reads as a premium re-release, not a discount.
function ReprintPicker({ reprints, liveCards, sets, rarities = [], max, allowUpgrade = false, onChange }) {
  const setNameById = new Map(sets.map((s) => [s.id, s.name]))
  const picked = new Set(reprints.map((r) => r.cardId))
  // Candidates: live cards not already reprinted here, richest first (those are
  // the fan favorites worth re-issuing). Cap the dropdown to keep it scannable.
  const candidates = [...liveCards]
    .filter((c) => !picked.has(c.id) && !c.banned)
    .sort((a, b) => (b.singlePrice ?? 0) - (a.singlePrice ?? 0))
    .slice(0, 40)

  const add = (cardId) => {
    if (!cardId || reprints.length >= max) return
    onChange([...reprints, { cardId }])
  }
  const remove = (cardId) => onChange(reprints.filter((r) => r.cardId !== cardId))
  const setUpgrade = (cardId, upgradeRarityId) =>
    onChange(reprints.map((r) => (r.cardId === cardId ? { ...r, upgradeRarityId: upgradeRarityId || undefined } : r)))

  const cardById = new Map(liveCards.map((c) => [c.id, c]))

  return (
    <div className="builder__inner">
      <span className="field__note">
        Re-issue a beloved card into this set — lifts the set's hype and sales, but
        softens that card's original (it's no longer unique to its set).
        {allowUpgrade && ' Anniversary reprints can also upgrade to a richer rarity — a premium re-release, not a discount.'}
      </span>

      {liveCards.length === 0 ? (
        <p className="panel__empty">No older cards to reprint yet — release a set first.</p>
      ) : (
        <>
          {reprints.length > 0 && (
            <ul className="reprints">
              {reprints.map((r) => {
                const c = cardById.get(r.cardId)
                if (!c) return null
                return (
                  <li key={r.cardId} className="reprints__row">
                    <span className="reprints__name">{c.name}</span>
                    <span className="reprints__meta">
                      {setNameById.get(c.setId) ?? 'set'} · ${(c.singlePrice ?? 0).toFixed(2)}
                    </span>
                    {allowUpgrade && (
                      <select
                        className="reprints__upgrade"
                        value={r.upgradeRarityId ?? ''}
                        onChange={(e) => setUpgrade(r.cardId, e.target.value)}
                        title="Upgrade this reprint to a new rarity"
                      >
                        <option value="">Keep original rarity</option>
                        {rarities.map((rar) => (
                          <option key={rar.id} value={rar.id}>Upgrade → {rar.name}</option>
                        ))}
                      </select>
                    )}
                    <button className="btn btn--ghost reprints__remove" onClick={() => remove(r.cardId)}>✕</button>
                  </li>
                )
              })}
            </ul>
          )}
          {reprints.length < max && (
            <select
              className="reprints__add"
              value=""
              onChange={(e) => add(e.target.value)}
            >
              <option value="">+ Reprint a card…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({setNameById.get(c.setId) ?? 'set'}) · ${(c.singlePrice ?? 0).toFixed(2)}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  )
}
