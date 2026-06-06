// The community roster. Shows each persona's type, reach, blurb, and current
// sentiment toward the game. Credibility is intentionally hidden — the player
// learns who's trustworthy by watching whose calls pan out over a run.

const TYPE_LABEL = {
  streamer: 'Streamer',
  competitor: 'Pro',
  collector: 'Investor',
  reviewer: 'Reviewer',
  theorycrafter: 'Theorycrafter',
}

function sentimentClass(s) {
  if (s >= 30) return 'mood--good'
  if (s <= -30) return 'mood--bad'
  return 'mood--neutral'
}

function sentimentLabel(s) {
  if (s >= 50) return 'Loves it'
  if (s >= 20) return 'Warm'
  if (s > -20) return 'Neutral'
  if (s > -50) return 'Cooling'
  return 'Hostile'
}

export default function PersonasPanel({ state }) {
  // Most-influential first.
  const personas = [...state.personas].sort((a, b) => b.reach - a.reach)

  return (
    <div className="panel">
      <h2 className="panel__title">The Community ({personas.length})</h2>
      <ul className="roster">
        {personas.map((p) => (
          <li key={p.id} className="roster__row" title={p.blurb}>
            <div className="roster__main">
              <span className="roster__name">{p.name}</span>
              <span className="roster__type">{TYPE_LABEL[p.type] ?? p.type}</span>
            </div>
            <div className="roster__meta">
              <span className="roster__reach" title={`Reach ${p.reach}`}>
                <span className="bar"><span className="bar__fill" style={{ width: `${p.reach}%` }} /></span>
              </span>
              <span className={`roster__mood ${sentimentClass(p.sentiment)}`}>{sentimentLabel(p.sentiment)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
