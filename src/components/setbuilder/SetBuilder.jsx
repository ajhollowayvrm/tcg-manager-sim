// The set-creation flow. A modal over the dashboard holding the slider layer,
// signature card editor, prerelease toggle, a live cost summary, and Release.

import { useState } from 'react'
import Slider from './Slider.jsx'
import SignatureCardEditor from './SignatureCardEditor.jsx'
import RarityEditor from './RarityEditor.jsx'
import PackFormatEditor from './PackFormatEditor.jsx'
import AccordionSection from './AccordionSection.jsx'
import { packSize, PACK_PRESETS } from '../../game/rarities.js'
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

export default function SetBuilder({ setNumber, cash, artists, liveCards = [], sets = [], onRelease, onClose }) {
  // The set auto-generates its full card list on release, so signature
  // highlights are optional — start with none.
  const [draft, setDraft] = useState(() => createDraft(setNumber))

  // Accordion: sections toggle independently (multi-open). Identity is open by
  // default; everything else starts collapsed so the modal opens short and
  // scannable. Each collapsed header shows a one-line summary of its contents.
  const [open, setOpen] = useState({ identity: true })
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  const patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const theme = getTheme(draft.themeId)
  // Resolve artists to their live drifted record so the cost summary and editor
  // reflect current prices, not the static seed.
  const artistOf = (id) => artists?.find((a) => a.id === id) ?? null
  const cost = setCost(draft, (id) => artistOf(id) ?? undefined)
  const errors = validateDraft(draft)
  const affordable = cost.total <= cash
  const canRelease = errors.length === 0 && affordable

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
  const summaries = {
    composition: `${draft.setLength} cards, ${draft.rarities.length} rarities${draft.secretCount ? `, ${draft.secretCount} secret` : ''}`,
    booster: `${packSize(draft.packFormat)}-card ${presetName}`,
    prerelease: draft.prerelease.enabled ? (draft.prerelease.chasePullable ? 'on, chase-pullable' : 'on') : 'off',
    signatures: draft.signatureCards.length ? `${draft.signatureCards.length} card${draft.signatureCards.length > 1 ? 's' : ''}` : 'none',
    reprints: (draft.reprintedCards?.length ?? 0) ? `${draft.reprintedCards.length} reprinted` : 'none',
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__sheet">
        <header className="modal__head">
          <h2>Design a Set</h2>
          <button className="btn btn--ghost" onClick={onClose}>✕</button>
        </header>

        <div className="modal__body">
          {/* Identity + slider layer — open by default */}
          <AccordionSection title="Identity & set basics" open={open.identity} onToggle={() => toggle('identity')}>
            <label className="field field--full">
              <span>Set name</span>
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>

            <label className="field field--full">
              <span>Theme &amp; mechanics</span>
              <select value={draft.themeId} onChange={(e) => patch({ themeId: e.target.value })}>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.mechanics.join(', ')}
                  </option>
                ))}
              </select>
              {theme && (
                <span className="field__note">
                  Pushes the metagame toward{' '}
                  <strong>{theme.archetypes.join(' / ')}</strong> — harder at higher power.
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
              label="Set length (cards)"
              value={draft.setLength}
              min={MIN_SET_LENGTH} max={MAX_SET_LENGTH} step={1}
              onChange={(v) => patch({ setLength: v })}
              left={`${MIN_SET_LENGTH}`} right={`${MAX_SET_LENGTH}`}
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
            <CostLine label="Print run" value={cost.printCost} />
            <CostLine label="Art commissions" value={cost.art} />
            {cost.prerelease > 0 && <CostLine label="Prerelease" value={cost.prerelease} />}
            <CostLine label="Total" value={cost.total} total />
            <div className={'costs__cash' + (affordable ? '' : ' is-bad')}>
              On hand: {formatCash(cash)}
            </div>
          </div>

          <div className="builder__actions">
            {errors.length > 0 && (
              <ul className="builder__errors">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {!affordable && errors.length === 0 && (
              <p className="builder__errors">Not enough cash for this set.</p>
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
