// The health meters. They used to live in a sticky banner across the top of
// every screen; now each sits in the tab that owns the number it reports, and
// the thresholds stay in one place here so no two tabs disagree about what
// "danger" means.
//
// Loss framing (mirror simulation.js). Cash, players, and satisfaction are
// RECOVERABLE pressures, not instant-death lines. Cash can go negative (a loan);
// only a runaway debt spiral (past DEBT_RUIN) or broke-AND-abandoned is fatal.
// Satisfaction runs -100..100 and only a total revolt at -100 ends a run.

import { communitySentiment } from '../../game/simulation.js'
import { SCALPER_THRESHOLD } from '../../game/distributors.js'
import { RIVAL_HOT_THRESHOLD } from '../../game/rival.js'
import { getRival } from '../../game/content/rivals.js'

const SENTIMENT_COLLAPSE = -100
const DEBT_RUIN = -3_000_000
export const CASH_WARN = 50_000      // cash dipping low (still survivable)
const PLAYERS_WARN = 2_000    // a thin base (recoverable)

export function formatCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function clampPct(p) {
  return Math.min(100, Math.max(0, p))
}

// One health meter: a label, the current value, a fill bar that reddens in the
// danger zone, and the loss threshold as a hint. `extra` renders a small
// element below the track (e.g. the Players meter's segment-mix bar).
export function Meter({ label, value, pct, danger, loss, footer, delta, extra, minor }) {
  const caption = footer ?? loss
  return (
    <div
      className={'meter' + (danger ? ' meter--danger' : '') + (minor ? ' meter--minor' : '')}
      title={footer ?? `Loss: ${loss}`}
    >
      <div className="meter__top">
        <span className="meter__label">{label}</span>
        <span className="meter__value">{value}</span>
      </div>
      <div className="meter__track">
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
      {extra}
      <div className="meter__foot">
        {delta && <span className="meter__delta">{delta}</span>}
        <span className="meter__loss">{caption}</span>
      </div>
    </div>
  )
}

// Casual/collectors composition. A thin stacked bar makes the mix the player is
// actually managing legible at a glance.
export function SegmentMix({ segments }) {
  const casual = segments?.casual ?? 0
  const collectors = segments?.collectors ?? 0
  const total = casual + collectors
  if (total <= 0) return null
  const pct = (n) => Math.round((n / total) * 100)
  return (
    <div
      className="segmix"
      title={`Casual ${pct(casual)}% · Collectors ${pct(collectors)}%`}
    >
      <span className="segmix__seg segmix__seg--cas" style={{ width: `${pct(casual)}%` }} />
      <span className="segmix__seg segmix__seg--col" style={{ width: `${pct(collectors)}%` }} />
    </div>
  )
}

export function CashMeter({ state }) {
  const cash = state.cash
  const rev = state.lastRevenue?.total ?? 0
  const interest = state.lastDebtInterest ?? 0
  return (
    <Meter
      label="Cash"
      value={formatCash(cash)}
      // In the black, fills toward a comfortable ~$300k. In the red, it's a
      // loan: the gauge DRAINS from ~empty toward 0 as the debt deepens to the
      // ruin line (just-negative ≈ a sliver, −$3M = empty). No jump at zero.
      pct={cash >= 0
        ? clampPct((cash / 300_000) * 100)
        : clampPct((1 - cash / DEBT_RUIN) * 8)}
      danger={cash < CASH_WARN}
      loss={cash < 0 ? 'debt — a loan, not fatal alone' : 'negative = a loan'}
      delta={cash < 0 && interest > 0 ? `−${formatCash(interest)}/wk interest`
        : rev > 0 ? `+${formatCash(rev)}/wk` : null}
    />
  )
}

export function PlayersMeter({ state }) {
  const playerBase = state.playerBase
  return (
    <Meter
      label="Players"
      value={playerBase.toLocaleString('en-US')}
      pct={clampPct((playerBase / 15_000) * 100)}
      danger={playerBase < PLAYERS_WARN}
      loss="recoverable — grow it back"
      extra={<SegmentMix segments={state.segments} />}
    />
  )
}

export function SatisfactionMeter({ state }) {
  const sentiment = communitySentiment(state.personas)
  return (
    <Meter
      label="Satisfaction"
      value={sentiment == null ? '—' : Math.round(sentiment)}
      // Sentiment runs -100..100; only the -100 floor ends a run. Map so the
      // floor sits at empty and a happy community fills the bar.
      pct={sentiment == null ? 50 : clampPct(((sentiment - SENTIMENT_COLLAPSE) / (100 - SENTIMENT_COLLAPSE)) * 100)}
      danger={sentiment != null && sentiment <= -70}
      loss={`${SENTIMENT_COLLAPSE} = revolt`}
    />
  )
}

export function ReputationMeter({ state }) {
  const reputation = state.franchise?.reputation ?? 0
  return (
    <Meter
      label="Franchise Rep"
      value={Math.round(reputation)}
      // Purely a growth stat — uncapped, so the bar is a soft visual
      // reference (150) rather than a real ceiling.
      pct={clampPct((reputation / 150) * 100)}
      footer="brand prestige — no ceiling, lifts old sets' value"
    />
  )
}

export function HeatMeter({ state }) {
  const heat = Math.round(state.scalperHeat ?? 0)
  return (
    <Meter
      label="Scalper Heat"
      value={heat}
      pct={clampPct(heat)}
      danger={heat >= SCALPER_THRESHOLD}
      footer={`${SCALPER_THRESHOLD}+ = scalper culture, bubble risk`}
    />
  )
}

export function RivalMeter({ state }) {
  const rivalStrength = Math.round(state.rival?.strength ?? 0)
  const rivalName = getRival(state.rival?.id)?.name ?? 'A rival'
  return (
    <Meter
      label="Rival Threat"
      value={rivalStrength}
      pct={clampPct(rivalStrength)}
      danger={rivalStrength >= RIVAL_HOT_THRESHOLD}
      footer={`${rivalName} — ${RIVAL_HOT_THRESHOLD}+ = bigger, more frequent bites`}
    />
  )
}
