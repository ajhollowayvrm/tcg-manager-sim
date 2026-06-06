// News/events stream — curveballs that keep a long run textured. Entries may be
// system notices (releases/bans/rotations, no kind/tone) or rolled events that
// carry a category tag and a good/bad/neutral tone for color.

const KIND_LABEL = {
  scandal: 'SCANDAL',
  market: 'MARKET',
  supply: 'SUPPLY',
  meta: 'META',
  viral: 'VIRAL',
  artist: 'ARTIST',
  community: 'COMMUNITY',
}

export default function EventsFeed({ state }) {
  const feed = state.eventsFeed

  return (
    <div className="panel">
      <h2 className="panel__title">Events</h2>
      {feed.length > 0 ? (
        <ul className="feed">
          {feed.map((item, i) => {
            const toneCls = item.tone ? ` event--${item.tone}` : ''
            return (
              <li key={`${item.week}-${i}`} className={`feed__item${toneCls}`}>
                {item.kind && (
                  <span className={`event__tag event__tag--${item.tone ?? 'neutral'}`}>
                    {KIND_LABEL[item.kind] ?? item.kind}
                  </span>
                )}
                <span className="event__text">{item.text}</span>
                <span className="event__week">wk {item.week}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="panel__empty">Nothing in the headlines yet.</p>
      )}
    </div>
  )
}
