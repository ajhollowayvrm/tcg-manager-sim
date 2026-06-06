import { useState } from 'react'
import { useGame } from './game/useGame.js'
import TopBar from './components/TopBar.jsx'
import MetagamePanel from './components/MetagamePanel.jsx'
import MarketTicker from './components/MarketTicker.jsx'
import FeedbackFeed from './components/FeedbackFeed.jsx'
import EventsFeed from './components/EventsFeed.jsx'
import PersonasPanel from './components/PersonasPanel.jsx'
import BansPanel from './components/BansPanel.jsx'
import SetsPanel from './components/SetsPanel.jsx'
import SetBuilder from './components/setbuilder/SetBuilder.jsx'

export default function App() {
  const game = useGame()
  const [building, setBuilding] = useState(false)

  return (
    <div className="app">
      <TopBar game={game} onDesignSet={() => setBuilding(true)} />
      <main className="dashboard">
        <section className="col col--main">
          <MetagamePanel state={game.state} />
          <SetsPanel state={game.state} />
          <MarketTicker state={game.state} />
          <BansPanel state={game.state} onBan={game.ban} onRotate={game.rotate} />
        </section>
        <aside className="col col--side">
          <FeedbackFeed state={game.state} />
          <PersonasPanel state={game.state} />
          <EventsFeed state={game.state} />
        </aside>
      </main>

      {building && (
        <SetBuilder
          setNumber={game.state.sets.length + 1}
          cash={game.state.cash}
          onRelease={game.release}
          onClose={() => setBuilding(false)}
        />
      )}
    </div>
  )
}
