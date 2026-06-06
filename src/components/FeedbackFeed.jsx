// Qualitative community chatter — the channel that sometimes lies.
// Signal vs. noise: high-reach low-credibility voices vs. quiet sharp reads.

export default function FeedbackFeed({ state }) {
  return (
    <div className="panel">
      <h2 className="panel__title">Community Chatter</h2>
      {state.feedbackFeed.length > 0 ? (
        <ul className="feed">
          {state.feedbackFeed.map((item, i) => (
            <li key={i} className="feed__item">{item.text}</li>
          ))}
        </ul>
      ) : (
        <p className="panel__empty">The community is quiet… for now.</p>
      )}
    </div>
  )
}
