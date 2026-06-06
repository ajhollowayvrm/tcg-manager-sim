// Qualitative community chatter — the channel that sometimes lies.
// Each item carries the persona, their type, a stance (color-coded), and a
// reach indicator (loudness). Credibility is deliberately NOT shown — the
// player infers who to trust over a run. That's the signal-vs-noise skill.

const TYPE_BADGE = {
  streamer: { label: 'STREAM', cls: 'badge--streamer' },
  competitor: { label: 'PRO', cls: 'badge--competitor' },
  collector: { label: 'INVEST', cls: 'badge--collector' },
  reviewer: { label: 'REVIEW', cls: 'badge--reviewer' },
  theorycrafter: { label: 'THEORY', cls: 'badge--theory' },
}

const STANCE_CLS = {
  ban: 'item--ban',
  warn: 'item--warn',
  pan: 'item--pan',
  hype: 'item--hype',
  love: 'item--love',
  neutral: 'item--neutral',
}

// Reach → loudness dots (1–3). Loud isn't the same as right.
function reachDots(reach) {
  const n = reach >= 75 ? 3 : reach >= 45 ? 2 : 1
  return '●'.repeat(n) + '○'.repeat(3 - n)
}

export default function FeedbackFeed({ state }) {
  const feed = state.feedbackFeed

  return (
    <div className="panel">
      <h2 className="panel__title">Community Chatter</h2>
      {feed.length > 0 ? (
        <ul className="feed">
          {feed.map((item, i) => {
            const badge = TYPE_BADGE[item.type] ?? { label: item.type, cls: '' }
            return (
              <li key={`${item.week}-${item.personaId}-${i}`} className={`feed__item ${STANCE_CLS[item.stance] ?? ''}`}>
                <div className="chatter__head">
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  <span className="chatter__name">{item.persona}</span>
                  <span className="chatter__reach" title={`Reach ${item.reach}`}>{reachDots(item.reach)}</span>
                  <span className="chatter__week">wk {item.week}</span>
                </div>
                <div className="chatter__text">{item.text}</div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="panel__empty">The community is quiet… for now.</p>
      )}
    </div>
  )
}
