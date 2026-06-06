// The four interacting metagame dials. In v1 these are shown plainly;
// later they should be partly obscured by feedback noise (see BRIEF.md).

const DIALS = [
  { key: 'diversity', label: 'Diversity', hint: 'How many archetypes are viable' },
  { key: 'powerLevel', label: 'Power Level', hint: 'The format ceiling — creeps up' },
  { key: 'archetypeBalance', label: 'Archetype Balance', hint: 'Aggro / control / combo / midrange' },
  { key: 'solveLevel', label: 'Solve Level', hint: 'How figured-out the format is' },
]

export default function MetagamePanel({ state }) {
  return (
    <div className="panel">
      <h2 className="panel__title">Metagame Health</h2>
      <div className="dials">
        {DIALS.map((dial) => (
          <Dial key={dial.key} {...dial} value={state.metagame[dial.key]} />
        ))}
      </div>
    </div>
  )
}

function Dial({ label, hint, value }) {
  return (
    <div className="dial" title={hint}>
      <div className="dial__head">
        <span className="dial__label">{label}</span>
        <span className="dial__value">{Math.round(value)}</span>
      </div>
      <div className="dial__track">
        <div className="dial__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
