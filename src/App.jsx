import { useGame } from './game/useGame.js'
import TopBar from './components/TopBar.jsx'
import MetagamePanel from './components/MetagamePanel.jsx'
import MarketTicker from './components/MarketTicker.jsx'
import FeedbackFeed from './components/FeedbackFeed.jsx'
import EventsFeed from './components/EventsFeed.jsx'

export default function App() {
  const game = useGame()

  return (
    <div className="app">
      <TopBar game={game} />
      <main className="dashboard">
        <section className="col col--main">
          <MetagamePanel state={game.state} />
          <MarketTicker state={game.state} />
        </section>
        <aside className="col col--side">
          <FeedbackFeed state={game.state} />
          <EventsFeed state={game.state} />
        </aside>
      </main>
    </div>
  )
}
