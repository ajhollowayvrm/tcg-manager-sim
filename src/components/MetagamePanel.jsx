// The four interacting metagame dials. In v1 these are shown plainly;
// later they should be partly obscured by feedback noise (see BRIEF.md).

const DIALS = [
  { id: 'diversity', label: 'Diversity', hint: 'How many archetypes are viable' },
  { id: 'powerLevel', label: 'Power Level', hint: 'The format ceiling — creeps up' },
  { id: 'archetypeBalance', label: 'Archetype Balance', hint: 'How evenly the four play styles share the field' },
  { id: 'solveLevel', label: 'Solve Level', hint: 'How figured-out the format is' },
]

// The four play styles, with a colour each for the metashare split bar.
const STYLES = [
  { id: 'aggro', label: 'Aggro', color: 'var(--accent)' },
  { id: 'control', label: 'Control', color: 'var(--accent-2)' },
  { id: 'combo', label: 'Combo', color: 'var(--pop)' },
  { id: 'midrange', label: 'Midrange', color: 'var(--good)' },
]

export default function MetagamePanel({ state }) {
  const dist = state.metagame.archetypes
  return (
    <div className="panel">
      <h2 className="panel__title">Metagame Health</h2>
      <div className="dials">
        {DIALS.map((dial) => (
          <Dial key={dial.id} id={dial.id} label={dial.label} hint={dial.hint} value={state.metagame[dial.id]} />
        ))}
      </div>
      {dist && <MetashareBar dist={dist} />}
    </div>
  )
}

// A stacked bar showing how the field splits across the four play styles, so the
// player can see the meta warping toward one deck and decide how to respond.
function MetashareBar({ dist }) {
  return (
    <div className="metashare" title="Share of the field held by each play style">
      <div className="metashare__head">
        <span className="dial__label">Archetype Field</span>
      </div>
      <div className="metashare__bar">
        {STYLES.map((s) => (
          <div
            key={s.id}
            className="metashare__seg"
            style={{ width: `${dist[s.id] ?? 0}%`, background: s.color }}
            title={`${s.label}: ${Math.round(dist[s.id] ?? 0)}%`}
          />
        ))}
      </div>
      <div className="metashare__legend">
        {STYLES.map((s) => (
          <span key={s.id} className="metashare__key">
            <span className="metashare__dot" style={{ background: s.color }} />
            {s.label} {Math.round(dist[s.id] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Dial({ id, label, hint, value }) {
  return (
    <div className="dial" title={hint}>
      <div className="dial__head">
        <span className="dial__label">{label}</span>
        <span className="dial__value">{Math.round(value)}</span>
      </div>
      <div className="dial__track">
        <div className={`dial__fill dial__fill--${id}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
