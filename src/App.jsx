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
import MetaReport from './components/MetaReport.jsx'
import PackRipper from './components/PackRipper.jsx'
import DistributorsPanel from './components/DistributorsPanel.jsx'
import OrganizedPlayPanel from './components/OrganizedPlayPanel.jsx'
import Onboarding from './components/Onboarding.jsx'
import SetBuilder from './components/setbuilder/SetBuilder.jsx'

// Mobile tabs group the seven panels into four sections. Desktop ignores this
// and shows the full two-column dashboard; the tab bar only appears on mobile.
const TABS = [
  { id: 'meta', label: 'Meta', icon: '📊' },
  { id: 'market', label: 'Market', icon: '📈' },
  { id: 'community', label: 'Community', icon: '💬' },
  { id: 'events', label: 'News', icon: '📰' },
]

export default function App() {
  const game = useGame()
  const [building, setBuilding] = useState(false)
  const [tab, setTab] = useState('meta')

  // First run: gate everything behind onboarding until the player launches.
  if (!game.state.config?.started) {
    return <Onboarding onStart={game.startGame} />
  }

  // The panels, declared once and reused by both layouts so there's a single
  // source of truth for props.
  const panels = {
    metagame: <MetagamePanel state={game.state} />,
    sets: <SetsPanel state={game.state} onReprint={game.reprint} />,
    market: <MarketTicker state={game.state} />,
    metaReport: <MetaReport state={game.state} />,
    packs: <PackRipper state={game.state} onRip={game.rip} />,
    bans: <BansPanel state={game.state} onBan={game.ban} onPull={game.pull} />,
    feedback: <FeedbackFeed state={game.state} />,
    personas: <PersonasPanel state={game.state} onComp={game.comp} onSponsor={game.sponsor} onDropSponsor={game.unsponsor} />,
    distributors: <DistributorsPanel state={game.state} onSign={game.signDist} onCultivate={game.cultivateDist} onDrop={game.dropDist} />,
    organizedPlay: <OrganizedPlayPanel state={game.state} onRun={game.runOP} />,
    events: <EventsFeed state={game.state} />,
  }

  return (
    <div className="app">
      <TopBar game={game} onDesignSet={() => setBuilding(true)} />

      {/* Desktop: the rich two-column dashboard. Hidden on mobile via CSS. */}
      <main className="dashboard dashboard--desktop">
        <section className="col col--main">
          {panels.metagame}
          {panels.sets}
          {panels.market}
          {panels.metaReport}
          {panels.packs}
          {panels.bans}
        </section>
        <aside className="col col--side">
          {panels.feedback}
          {panels.personas}
          {panels.distributors}
          {panels.organizedPlay}
          {panels.events}
        </aside>
      </main>

      {/* Mobile: one tab's panels at a time, with a bottom tab bar. Hidden on
          desktop via CSS. */}
      <main className="dashboard--mobile">
        {tab === 'meta' && <div className="col">{panels.metagame}{panels.sets}</div>}
        {tab === 'market' && <div className="col">{panels.market}{panels.metaReport}{panels.packs}{panels.bans}</div>}
        {tab === 'community' && <div className="col">{panels.feedback}{panels.personas}{panels.distributors}{panels.organizedPlay}</div>}
        {tab === 'events' && <div className="col">{panels.events}</div>}
      </main>

      <nav className="tabbar" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={'tabbar__btn' + (tab === t.id ? ' is-active' : '')}
            onClick={() => setTab(t.id)}
          >
            <span className="tabbar__icon" aria-hidden="true">{t.icon}</span>
            <span className="tabbar__label">{t.label}</span>
          </button>
        ))}
      </nav>

      {building && (
        <SetBuilder
          setNumber={game.state.sets.length + 1}
          cash={game.state.cash}
          artists={game.state.artists}
          liveCards={game.state.cards.filter((c) => !c.banned && !c.rotated)}
          sets={game.state.sets}
          onRelease={game.release}
          onClose={() => setBuilding(false)}
        />
      )}
    </div>
  )
}
