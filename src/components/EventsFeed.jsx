// News/events stream — curveballs that keep a long run textured.

export default function EventsFeed({ state }) {
  return (
    <div className="panel">
      <h2 className="panel__title">Events</h2>
      {state.eventsFeed.length > 0 ? (
        <ul className="feed">
          {state.eventsFeed.map((item, i) => (
            <li key={i} className="feed__item">{item.text}</li>
          ))}
        </ul>
      ) : (
        <p className="panel__empty">Nothing in the headlines yet.</p>
      )}
    </div>
  )
}
