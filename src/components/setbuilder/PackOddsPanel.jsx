// Pack odds table — the REAL per-pack pull odds for every rarity on the sheet,
// derived live from the sheet + booster format (see rarities.js's
// computePackOdds). Never authored separately, so it can never drift from what
// actually pulls. Used both as the builder's own preview (always visible to the
// player) and, when a set publishes its odds, as the public-facing display on
// the rip screen.

import { computePackOdds } from '../../game/rarities.js'

function pct(p) {
  if (p >= 0.1) return (p * 100).toFixed(1) + '%'
  if (p >= 0.001) return (p * 100).toFixed(2) + '%'
  return (p * 100).toFixed(3) + '%'
}

function oddsLabel(oddsOneIn) {
  if (!Number.isFinite(oddsOneIn)) return 'not in this pack'
  if (oddsOneIn <= 1) return 'every pack'
  return `1 in ${oddsOneIn.toLocaleString('en-US')} packs`
}

export default function PackOddsPanel({ sheet, format, title }) {
  const odds = computePackOdds(sheet ?? [], format ?? {})
  // Rarest first — what a collector actually wants to know first.
  const rows = [...odds.perRarity].sort((a, b) => {
    const ra = sheet.find((r) => r.id === a.rarityId)
    const rb = sheet.find((r) => r.id === b.rarityId)
    return (rb?.valueTier ?? 0) - (ra?.valueTier ?? 0)
  })

  return (
    <div className="packodds">
      {title && <div className="packodds__title">{title}</div>}
      <table className="packodds__table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Chance / pack</th>
            <th>Odds</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rarityId}>
              <td>{r.name}</td>
              <td>{pct(r.probAtLeastOnePerPack)}</td>
              <td>{oddsLabel(r.oddsOneIn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="packodds__note">{odds.packSize}-card pack — real odds, derived live from this set's rarity sheet and booster format.</p>
    </div>
  )
}
