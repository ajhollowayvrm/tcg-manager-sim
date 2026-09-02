// Business › Partners — co-branded promo cards with outside businesses. See
// partners.js and content/partners.js.

import { useState } from 'react'
import { BRAND_PARTNERS, getBrandPartner } from '../game/content/partners.js'
import { partnerBlock } from '../game/partners.js'
import { getArtist } from '../game/content/artists.js'
import { currentArtist } from '../game/artists.js'
import Section from './nav/Section.jsx'

function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function PartnersPanel({ state, onSignPartner }) {
  const characters = (state.characters ?? []).filter((c) => !c.retiredWeek)
  const [characterId, setCharacterId] = useState('')
  const [artistId, setArtistId] = useState('')
  const deals = [...(state.partnerDeals ?? [])].reverse()
  const artists = [...(state.artists ?? [])]
    .map((a) => ({ ...a, name: getArtist(a.id)?.name ?? a.id }))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 12)

  return (
    <>
      <Section id="biz.partners" title="Brand partners" level={2} summary={`${deals.length} deals`}>
        <p className="panel__lede">
          A promo card with someone else's logo on it. Mass-market partners
          bring in casual players by the thousand and draw the scalpers with
          them; prestige partners bring few copies and a lot of reputation.
        </p>

        <div className="sigcard__row sigcard__controls">
          <label className="field">
            <span>Front it with</span>
            <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
              <option value="">— no character —</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (fame {Math.round(c.fame)})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Drawn by</span>
            <select value={artistId} onChange={(e) => setArtistId(e.target.value)}>
              <option value="">— house art —</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
        {characterId && (
          <p className="field__note">
            The character logs a printing and lends their fame to the promo.
          </p>
        )}

        <ul className="distrib__list">
          {BRAND_PARTNERS.map((p) => {
            const block = partnerBlock(state, p.id)
            return (
              <li key={p.id} className="distrib">
                <div className="distrib__head">
                  <span className="distrib__name">{p.name}</span>
                  <span className="distrib__flood" title="Prestige of the promo">
                    {'★'.repeat(Math.max(1, Math.round(p.prestige * 4)))}
                  </span>
                </div>
                <p className="distrib__blurb">{p.blurb}</p>
                <div className="distrib__terms">
                  <span>{p.tag}</span>
                  <span>·</span>
                  <span>~{p.casualReach.toLocaleString('en-US')} players</span>
                  <span>·</span>
                  <span>heat +{p.heatDelta}</span>
                  <span>·</span>
                  <span>rep +{p.repBump}</span>
                </div>
                <button
                  className="btn btn--design distrib__sign"
                  disabled={!!block}
                  title={block ?? undefined}
                  onClick={() => onSignPartner(p.id, { characterId: characterId || null, artistId: artistId || null })}
                >
                  {block ? block : `Sign — ${fmtCash(p.cost)}`}
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      {deals.length > 0 && (
        <Section id="biz.partners.history" title="Past tie-ins" level={2} defaultOpen={false}>
          <ul className="feed">
            {deals.map((d) => {
              const partner = getBrandPartner(d.partnerId)
              const card = state.cards.find((c) => c.id === d.cardId)
              const artist = card?.artistId ? currentArtist(state, card.artistId) : null
              return (
                <li key={`${d.partnerId}-${d.week}`} className="feed__item">
                  <strong>{partner?.name ?? d.partnerId}</strong> · wk {d.week}
                  {card && <> — {card.name}{artist ? ` by ${artist.name}` : ''}, now ${card.singlePrice.toFixed(2)}</>}
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </>
  )
}
