import { useRef, useState } from 'react'
import { useGame } from './game/useGame.js'
import TopBar from './components/TopBar.jsx'
import MarketTicker from './components/MarketTicker.jsx'
import FeedbackFeed from './components/FeedbackFeed.jsx'
import EventsFeed from './components/EventsFeed.jsx'
import PersonasPanel from './components/PersonasPanel.jsx'
import CastPanel from './components/CastPanel.jsx'
import SetsPanel from './components/SetsPanel.jsx'
import PackRipper from './components/PackRipper.jsx'
import DistributorsPanel from './components/DistributorsPanel.jsx'
import AmbitionPanel from './components/AmbitionPanel.jsx'
import CardBrowser from './components/CardBrowser.jsx'
import LedgerPanel from './components/LedgerPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import Onboarding from './components/Onboarding.jsx'
import SetBuilder from './components/setbuilder/SetBuilder.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import RetrospectivePanel from './components/RetrospectivePanel.jsx'

// Mobile tabs group the panels into sections. Desktop ignores this and shows
// the full two-column dashboard; the tab bar only appears on mobile. There is
// no competitive-play system left, even headless — the dashboard is purely
// collector/reseller-first: sets & scarcity, market & packs, community &
// distribution, news. Organized play and manually banning a card are gone
// entirely; pull-from-print and promo SKUs are the collector-era replacements.
// Five tabs, not four: the money panels (profit-and-loss, trends,
// distribution, ambition) were previously crammed into `community` alongside
// the persona roster, and the card browser had nowhere to live at all.
const TABS = [
  { id: 'sets', label: 'Sets', icon: '📦' },
  { id: 'market', label: 'Market', icon: '📈' },
  { id: 'studio', label: 'Studio', icon: '📊' },
  { id: 'community', label: 'Community', icon: '💬' },
  { id: 'events', label: 'News', icon: '📰' },
]

export default function App() {
  const game = useGame()
  const [building, setBuilding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tab, setTab] = useState('sets')
  const [retireConfirm, setRetireConfirm] = useState(false)
  const tabRefs = useRef([])

  // Arrow-key navigation between tabs, per the ARIA tabs pattern: the tablist
  // is one tab stop and the arrows move within it.
  const onTabKey = (e, i) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  // The run save lives in IndexedDB, so boot is asynchronous. Hold the screen
  // rather than flashing onboarding at a returning player for a frame.
  if (game.booting) {
    return <div className="boot" role="status">Loading your studio…</div>
  }

  // First run: gate everything behind onboarding until the player launches.
  if (!game.state.config?.started) {
    return <Onboarding onStart={game.startGame} />
  }

  // The panels, declared once and reused by both layouts so there's a single
  // source of truth for props.
  const panels = {
    sets: <SetsPanel state={game.state} onReprint={game.reprint} onPull={game.pull} onAdjustWave={game.adjustWave} onToggleOdds={game.toggleOddsPublished} />,
    market: <MarketTicker state={game.state} />,
    browser: <CardBrowser state={game.state} />,
    ledger: <LedgerPanel state={game.state} />,
    history: <HistoryPanel state={game.state} />,
    packs: <PackRipper state={game.state} onRip={game.rip} onRunBreak={game.runBreak} />,
    feedback: <FeedbackFeed state={game.state} />,
    personas: <PersonasPanel state={game.state} onComp={game.comp} onSponsor={game.sponsor} onDropSponsor={game.unsponsor} onInvitePrerelease={game.invitePrerelease} onSponsorTournament={game.sponsorTournament} />,
    cast: <CastPanel state={game.state} onAddCharacter={game.addCharacter} />,
    distributors: <DistributorsPanel
      state={game.state}
      onSign={game.signDist} onCultivate={game.cultivateDist} onDrop={game.dropDist}
      onUpgradeSupplyChain={game.upgradeSupplyChain}
      onSignGrading={game.signGrading} onCultivateGrading={game.cultivateGrading} onDropGrading={game.dropGrading}
      onTogglePurchaseLimits={game.togglePurchaseLimits} onTogglePhantomStock={game.togglePhantomStock}
    />,
    ambition: <AmbitionPanel
      state={game.state}
      onLaunchMerch={game.launchMerch} onRefreshMerch={game.refreshMerch} onRetireMerch={game.retireMerch}
      onPitchMedia={game.pitchMedia}
      onSetGoodwill={game.setGoodwill}
      onRetire={game.retire}
      retireConfirm={retireConfirm} onRetireConfirm={setRetireConfirm}
    />,
    events: <EventsFeed state={game.state} />,
  }

  return (
    <div className="app">
      <TopBar game={game} onDesignSet={() => setBuilding(true)} onOpenSettings={() => setSettingsOpen(true)} />

      {/* A failed autosave used to be entirely silent, which is how a long run
          could stop saving without the player ever finding out. */}
      {game.saveError && (
        <div className="savewarn" role="alert">
          ⚠ {game.saveError}
          <button className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>Open settings</button>
        </div>
      )}

      {/* Desktop: the rich two-column dashboard. Hidden on mobile via CSS. */}
      <main className="dashboard dashboard--desktop">
        <section className="col col--main">
          {panels.sets}
          {panels.market}
          {panels.browser}
          {panels.packs}
        </section>
        <aside className="col col--side">
          {panels.ledger}
          {panels.history}
          {panels.feedback}
          {panels.personas}
          {panels.cast}
          {panels.distributors}
          {panels.ambition}
          {panels.events}
        </aside>
      </main>

      {/* Mobile: one tab's panels at a time, with a bottom tab bar. Hidden on
          desktop via CSS. */}
      <main
        className="dashboard--mobile"
        id={`tabpanel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'sets' && <div className="col">{panels.sets}</div>}
        {tab === 'market' && <div className="col">{panels.market}{panels.browser}{panels.packs}</div>}
        {tab === 'studio' && <div className="col">{panels.ledger}{panels.history}{panels.distributors}{panels.ambition}</div>}
        {tab === 'community' && <div className="col">{panels.feedback}{panels.personas}{panels.cast}</div>}
        {tab === 'events' && <div className="col">{panels.events}</div>}
      </main>

      {/* Real tab semantics. These were `role="tab"` buttons with no tabpanel,
          no aria-controls, no ids and no keyboard navigation — the roles
          promised a widget the markup never delivered. */}
      <nav className="tabbar" role="tablist" aria-label="Dashboard sections">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            ref={(el) => { tabRefs.current[i] = el }}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={'tabbar__btn' + (tab === t.id ? ' is-active' : '')}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <span className="tabbar__icon" aria-hidden="true">{t.icon}</span>
            <span className="tabbar__label">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* The run is over — retirement or ruin. Both share one retrospective. */}
      {game.state.gameOver && game.state.retirement && (
        <RetrospectivePanel state={game.state} onReset={game.reset} />
      )}

      {settingsOpen && (
        <SettingsPanel
          state={game.state}
          saveError={game.saveError}
          onExport={game.exportRun}
          onImport={game.importRun}
          onReset={() => { game.reset(); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {building && (
        <SetBuilder
          setNumber={game.state.sets.length + 1}
          cash={game.state.cash}
          artists={game.state.artists}
          characters={game.state.characters ?? []}
          liveCards={game.state.cards.filter((c) => !c.banned && !c.rotated)}
          sets={game.state.sets}
          blocks={game.state.blocks ?? []}
          franchise={game.state.franchise}
          perks={game.state.prestige?.perks ?? []}
          conceptId={game.state.config?.conceptId}
          onRelease={game.release}
          onClose={() => setBuilding(false)}
        />
      )}
    </div>
  )
}
