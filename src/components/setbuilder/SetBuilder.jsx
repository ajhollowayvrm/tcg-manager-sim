// The set-creation flow. A modal over the dashboard holding the slider layer,
// signature card editor, prerelease toggle, a live cost summary, and Release.

import { useState } from 'react'
import Slider from './Slider.jsx'
import SignatureCardEditor from './SignatureCardEditor.jsx'
import RarityEditor from './RarityEditor.jsx'
import PackFormatEditor from './PackFormatEditor.jsx'
import AccordionSection from './AccordionSection.jsx'
import ProductLineupEditor from './ProductLineupEditor.jsx'
import { packSize, PACK_PRESETS } from '../../game/rarities.js'
import { SKU_TYPES } from '../../game/products.js'
import {
  createDraft,
  createSignatureCard,
  fillRandomCards,
  setCost,
  validateDraft,
  MAX_SIGNATURE_CARDS,
  MIN_SET_LENGTH,
  MAX_SET_LENGTH,
  MAX_SECRET_CARDS,
  MAX_REPRINTED_CARDS,
} from '../../game/sets.js'
import { THEMES, getTheme } from '../../game/content/themes.js'
import { TIERS, TIER_IDS, getTier } from '../../game/blocks.js'
import { GIMMICKS, getGimmick } from '../../game/content/gimmicks.js'

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

export default function SetBuilder({ setNumber, cash, artists, liveCards = [], sets = [], blocks = [], onRelease, onClose }) {
  // The first set you ever ship MUST be a major (it opens your first block); once
  // a block is live you can ship riders. Seed the tier accordingly.
  const isFirstSet = blocks.length === 0
  const [draft, setDraft] = useState(() => createDraft(setNumber, 'major', blocks))

  // Accordion: sections toggle independently (multi-open). Identity is open by
  // default; everything else starts collapsed so the modal opens short and
  // scannable. Each collapsed header shows a one-line summary of its contents.
  const [open, setOpen] = useState({ identity: true })
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  const patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const tier = getTier(draft.tier)
  const theme = getTheme(draft.themeId)
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
        powerBudget: d.powerBudget,
        printRun: d.printRun,
        pricePoint: d.pricePoint,
        rarityChase: d.rarityChase,
        rarities: d.rarities,
        packFormat: d.packFormat,
        products: d.products,
        signatureCards: d.signatureCards,
        reprintedCards: d.reprintedCards,
        prerelease: d.prerelease,
        // A major keeps editing its theme; a rider inherits the block's theme.
        themeId: getTier(nextTier).ridesBlock ? seed.themeId : d.themeId,
      }
    })

  // Resolve artists to their live drifted record so the cost summary and editor
  // reflect current prices, not the static seed.
  const artistOf = (id) => artists?.find((a) => a.id === id) ?? null
  const cost = setCost(draft, (id) => artistOf(id) ?? undefined)
  const errors = validateDraft(draft, { blocks, isFirstSet })
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
      signatureCards: fillRandomCards(d.signatureCards, d.signatureCards.length + 1, getTheme(d.themeId), d.powerBudget, `${d.name}:add`, d.rarities),
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
    ? `Opens a block — ${getGimmick(draft.block?.gimmickId)?.name ?? 'gimmick'}`
    : attachedBlock
      ? `Rides “${attachedBlock.name}” (${attachedBlock.gimmickName})`
      : 'No block to ride'
  const summaries = {
    block: blockSummary,
    composition: `${draft.setLength} cards, ${draft.rarities.length} rarities${draft.secretCount ? `, ${draft.secretCount} secret` : ''}`,
    booster: `${packSize(draft.packFormat)}-card ${presetName}`,
    products: (draft.products?.length ?? 0)
      ? ['Boosters', ...draft.products.map((p) => SKU_TYPES[p.kind]?.name.split(' ')[0] ?? p.kind)].join(' + ')
      : 'Boosters only',
    prerelease: draft.prerelease.enabled ? (draft.prerelease.chasePullable ? 'on, chase-pullable' : 'on') : 'off',
    signatures: draft.signatureCards.length ? `${draft.signatureCards.length} card${draft.signatureCards.length > 1 ? 's' : ''}` : 'none',
    reprints: (draft.reprintedCards?.length ?? 0) ? `${draft.reprintedCards.length} reprinted` : 'none',
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
          <TierPicker tier={draft.tier} isFirstSet={isFirstSet} onChange={changeTier} />

          {/* Block — open (major) or attach to (rider) an era-defining gimmick. */}
          <AccordionSection title="Block & gimmick" summary={summaries.block} open={open.block} onToggle={() => toggle('block')}>
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
          </AccordionSection>

          {/* Identity + slider layer — open by default */}
          <AccordionSection title="Identity & set basics" open={open.identity} onToggle={() => toggle('identity')}>
            <label className="field field--full">
              <span>Set name</span>
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>

            <label className="field field--full">
              <span>Theme &amp; mechanics{tier.ridesBlock && <span className="muted"> (inherited from the block)</span>}</span>
              <select
                value={draft.themeId}
                disabled={tier.ridesBlock}
                onChange={(e) => patch({ themeId: e.target.value })}
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.mechanics.join(', ')}
                  </option>
                ))}
              </select>
              {theme && (
                <span className="field__note">
                  {tier.ridesBlock
                    ? <>Inherited from the block you ride.</>
                    : <>Pushes the metagame toward <strong>{theme.archetypes.join(' / ')}</strong> — harder at higher power.</>}
                </span>
              )}
            </label>

            <Slider
              label="Power budget"
              value={draft.powerBudget}
              onChange={(v) => patch({ powerBudget: v })}
              left="Tame" right="Broken"
            />
            <Slider
              label="Rarity distribution"
              value={draft.rarityChase}
              onChange={(v) => patch({ rarityChase: v })}
              left="Accessible" right="Chase-heavy"
            />
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
          </AccordionSection>

          {/* Set composition — length, secret rares, and the rarity sheet */}
          <AccordionSection title="Set composition" summary={summaries.composition} open={open.composition} onToggle={() => toggle('composition')}>
            <Slider
              label={`Set length (cards) — ${tier.name} runs ${tier.lengthRange[0]}–${tier.lengthRange[1]}`}
              value={draft.setLength}
              min={tier.lengthRange[0]} max={tier.lengthRange[1]} step={1}
              onChange={(v) => patch({ setLength: v })}
              left={`${tier.lengthRange[0]}`} right={`${tier.lengthRange[1]}`}
            />
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

          {/* Product lineup — which SKUs the set ships in beyond boosters */}
          <AccordionSection title="Product lineup" summary={summaries.products} open={open.products} onToggle={() => toggle('products')}>
            <span className="field__note">
              Beyond boosters, ship the set as bundles, a collector box, or tins —
              each a separate product with its own price, print run, and buyer
              appeal. More channels mean more revenue, but each costs its own
              print run up front.
            </span>
            <ProductLineupEditor
              products={draft.products ?? []}
              onChange={(products) => patch({ products })}
            />
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
              <span className="muted"> (more hype &amp; early revenue, but the meta solves sooner)</span>
            </label>
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
                  rarities={draft.rarities}
                  liveCards={liveCards}
                  sets={sets}
                  onChange={(next) => setCard(i, next)}
                  onRemove={() => removeCard(i)}
                />
              ))}
            </div>
          </AccordionSection>

          {/* Reprint popular cards from older sets — a fan-service / hype draw */}
          <AccordionSection
            title={`Reprint popular cards (${draft.reprintedCards?.length ?? 0}/${MAX_REPRINTED_CARDS})`}
            summary={summaries.reprints}
            open={open.reprints}
            onToggle={() => toggle('reprints')}
          >
            <ReprintPicker
              reprints={draft.reprintedCards ?? []}
              liveCards={liveCards}
              sets={sets}
              onChange={(reprintedCards) => patch({ reprintedCards })}
            />
          </AccordionSection>
        </div>

        {/* Cost summary + release */}
        <footer className="modal__foot">
          <div className="costs">
            <CostLine label="Development" value={cost.dev} />
            <CostLine label={(draft.products?.length ?? 0) ? 'Booster print' : 'Print run'} value={cost.printCost} />
            {cost.skus > 0 && <CostLine label="Other SKUs print" value={cost.skus} />}
            <CostLine label="Art commissions" value={cost.art} />
            {cost.prerelease > 0 && <CostLine label="Prerelease" value={cost.prerelease} />}
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
// (your first set must be a major). Each shows its scale + a one-line character.
function TierPicker({ tier, isFirstSet, onChange }) {
  return (
    <div className="tierpicker">
      {TIER_IDS.map((id) => {
        const t = TIERS[id]
        const locked = isFirstSet && t.ridesBlock // no block to ride yet
        const active = tier === id
        return (
          <button
            key={id}
            type="button"
            className={'tierpicker__opt' + (active ? ' is-active' : '') + (locked ? ' is-locked' : '')}
            disabled={locked}
            onClick={() => !locked && onChange(id)}
            title={locked ? 'Release a Major first to open a block these can ride.' : t.blurb}
          >
            <span className="tierpicker__sym">{t.symbol}</span>
            <span className="tierpicker__name">{t.name.replace(' set', '')}</span>
            <span className="tierpicker__blurb">{t.blurb}</span>
            {locked && <span className="tierpicker__lock">needs a block</span>}
          </button>
        )
      })}
    </div>
  )
}

// Block & gimmick editor. For a MAJOR: pick a gimmick from the roster, name the
// block, tune its competitive↔collector nature, and set the archetype lean its
// warp targets. For a MINOR/MICRO: pick which live block to ride (auto-inherits
// its theme + gimmick, shown read-only).
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
          A {tier.id} set rides a live block — it inherits the block's theme and prints
          its {attachedBlock?.treatmentLabel ?? 'special'} chase cards, but can't mint a new gimmick.
        </span>
        <label className="field field--full">
          <span>Ride which block?</span>
          <select value={draft.attachBlockId ?? ''} onChange={(e) => onAttach(e.target.value)}>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.gimmickName} (opened wk {b.openedWeek})
              </option>
            ))}
          </select>
        </label>
        {attachedBlock && (
          <div className="blockcard blockcard--read">
            <div className="blockcard__row"><span>Gimmick</span><strong>{attachedBlock.gimmickName}</strong></div>
            <div className="blockcard__row"><span>Nature</span><strong>{natureLabel(attachedBlock.nature)}</strong></div>
            <div className="blockcard__row"><span>Lean</span><strong>{attachedBlock.lean}</strong></div>
            <div className="blockcard__row"><span>Chase tier</span><strong>{attachedBlock.treatmentLabel}</strong></div>
            {g && <span className="field__note">{g.blurb}</span>}
          </div>
        )}
      </div>
    )
  }

  // ---- Major: open a new block ----
  const b = draft.block ?? {}
  const g = getGimmick(b.gimmickId)
  // Picking a gimmick seeds its default nature + lean (the player can retune).
  const pickGimmick = (id) => {
    const gm = getGimmick(id)
    onPatchBlock({ gimmickId: id, nature: gm?.defaultNature ?? 50, lean: gm?.defaultLean ?? 'midrange' })
  }
  return (
    <div className="builder__inner">
      <span className="field__note">
        A Major opens a new block and introduces its gimmick — the era-defining
        mechanic every set in the block rides. Blocks coexist: opening a new one
        doesn't retire the old, so their format warps stack (watch your power creep).
      </span>

      <label className="field field--full">
        <span>Gimmick</span>
        <select value={b.gimmickId ?? ''} onChange={(e) => pickGimmick(e.target.value)}>
          {GIMMICKS.map((gm) => (
            <option key={gm.id} value={gm.id}>{gm.name} — {gm.treatmentLabel} chase</option>
          ))}
        </select>
        {g && <span className="field__note">{g.blurb}</span>}
      </label>

      <label className="field field--full">
        <span>Block name <span className="muted">(blank uses the gimmick name)</span></span>
        <input
          value={b.gimmickName ?? ''}
          placeholder={g?.name ?? 'Block name'}
          onChange={(e) => onPatchBlock({ gimmickName: e.target.value })}
        />
      </label>

      <Slider
        label={`Gimmick nature — ${natureLabel(b.nature ?? 50)}`}
        value={b.nature ?? 50}
        onChange={(v) => onPatchBlock({ nature: v })}
        left="Competitive" right="Collector"
      />
      <span className="field__note">
        Competitive bends the format hard toward the lean (more power creep);
        Collector mints denser, richer {g?.treatmentLabel ?? 'special'} chase cards instead.
      </span>

      <label className="field field--full">
        <span>Archetype lean <span className="muted">(which style the warp favors)</span></span>
        <select value={b.lean ?? 'midrange'} onChange={(e) => onPatchBlock({ lean: e.target.value })}>
          {['aggro', 'control', 'combo', 'midrange'].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

// A short word for where the nature slider sits.
function natureLabel(nature) {
  if (nature <= 25) return 'Competitive — warps the format'
  if (nature <= 45) return 'Lean competitive'
  if (nature < 55) return 'Balanced'
  if (nature < 75) return 'Lean collector'
  return 'Collector — pure chase'
}

// Pick popular cards from older sets to reprint into this new set. Reprinting a
// fan favorite lifts the new set's hype (a fan-service draw) but softens the old
// original's price. Offers the most valuable live cards as candidates.
function ReprintPicker({ reprints, liveCards, sets, onChange }) {
  const setNameById = new Map(sets.map((s) => [s.id, s.name]))
  const picked = new Set(reprints.map((r) => r.cardId))
  // Candidates: live cards not already reprinted here, richest first (those are
  // the fan favorites worth re-issuing). Cap the dropdown to keep it scannable.
  const candidates = [...liveCards]
    .filter((c) => !picked.has(c.id) && !c.banned)
    .sort((a, b) => (b.singlePrice ?? 0) - (a.singlePrice ?? 0))
    .slice(0, 40)

  const add = (cardId) => {
    if (!cardId || reprints.length >= MAX_REPRINTED_CARDS) return
    onChange([...reprints, { cardId }])
  }
  const remove = (cardId) => onChange(reprints.filter((r) => r.cardId !== cardId))

  const cardById = new Map(liveCards.map((c) => [c.id, c]))

  return (
    <div className="builder__inner">
      <span className="field__note">
        Re-issue a beloved card into this set — lifts the set's hype and sales, but
        softens that card's original (it's no longer unique to its set).
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
                    <button className="btn btn--ghost reprints__remove" onClick={() => remove(r.cardId)}>✕</button>
                  </li>
                )
              })}
            </ul>
          )}
          {reprints.length < MAX_REPRINTED_CARDS && (
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
