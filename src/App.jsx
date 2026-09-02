import { useEffect, useRef, useState } from 'react'
import { useGame } from './game/useGame.js'
import TopStrip from './components/nav/TopStrip.jsx'
import SubTabs from './components/nav/SubTabs.jsx'
import { useUiPrefs, SectionPrefsProvider } from './components/nav/uiPrefs.js'
import { CashMeter, PlayersMeter, SatisfactionMeter } from './components/nav/Meter.jsx'
import StudioOverview from './components/StudioOverview.jsx'
import MarketTicker from './components/MarketTicker.jsx'
import FeedbackFeed from './components/FeedbackFeed.jsx'
import EventsFeed from './components/EventsFeed.jsx'
import PersonasPanel from './components/PersonasPanel.jsx'
import CastPanel from './components/CastPanel.jsx'
import CardsPanel from './components/CardsPanel.jsx'
import LineagesPanel from './components/LineagesPanel.jsx'
import StandardsPanel from './components/StandardsPanel.jsx'
import SetsPanel from './components/SetsPanel.jsx'
import PackRipper from './components/PackRipper.jsx'
import DistributionPanel from './components/DistributionPanel.jsx'
import GradingPanel from './components/GradingPanel.jsx'
import IllustratorsPanel from './components/IllustratorsPanel.jsx'
import PartnersPanel from './components/PartnersPanel.jsx'
import VenturesPanel from './components/VenturesPanel.jsx'
import ProgrammesPanel from './components/ProgrammesPanel.jsx'
import GrassrootsPanel from './components/GrassrootsPanel.jsx'
import LegacyPanel from './components/LegacyPanel.jsx'
import UpgradesPanel from './components/UpgradesPanel.jsx'
import CardBrowser from './components/CardBrowser.jsx'
import LedgerPanel from './components/LedgerPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import ScalpWatchPanel from './components/ScalpWatchPanel.jsx'
import Onboarding from './components/Onboarding.jsx'
import SetBuilder from './components/setbuilder/SetBuilder.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import RetrospectivePanel from './components/RetrospectivePanel.jsx'

// One tabbed layout at every width. The five tabs are organised around the
// studio's relationships: the brand itself (Studio), everyone it works with
// outside its walls (Business), its fans (Community), the numbers (Stats), and
// the rest (Misc). Each tab has sub-tabs; every headed section inside folds.
//
// There is no desktop dashboard any more. Two layouts drifted apart before
// (the Ambition panel sat on the Studio tab while the desktop grid put it in
// the sidebar), and the game is played on a phone.
const TABS = [
  {
    id: 'studio', label: 'Studio', icon: '🏛️',
    subtabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'design', label: 'Design' },
      { id: 'sets', label: 'Sets' },
      { id: 'cards', label: 'Cards' },
      { id: 'cast', label: 'Cast' },
      { id: 'lineages', label: 'Lineages' },
      { id: 'standards', label: 'Standards' },
    ],
  },
  {
    id: 'business', label: 'Business', icon: '🤝',
    subtabs: [
      { id: 'distribution', label: 'Distribution' },
      { id: 'grading', label: 'Grading' },
      { id: 'illustrators', label: 'Illustrators' },
      { id: 'partners', label: 'Partners' },
      { id: 'ventures', label: 'Ventures' },
    ],
  },
  {
    id: 'community', label: 'Community', icon: '💬',
    subtabs: [
      { id: 'pulse', label: 'Pulse' },
      { id: 'voices', label: 'Voices' },
      { id: 'programmes', label: 'Programmes' },
      { id: 'grassroots', label: 'Grassroots' },
      { id: 'news', label: 'News' },
    ],
  },
  {
    id: 'stats', label: 'Stats', icon: '📈',
    subtabs: [
      { id: 'money', label: 'Money' },
      { id: 'trends', label: 'Trends' },
      { id: 'market', label: 'Market' },
      { id: 'cards', label: 'Cards' },
      { id: 'scalp', label: 'Scalp Watch' },
    ],
  },
  {
    id: 'misc', label: 'Misc', icon: '⚙️',
    subtabs: [
      { id: 'settings', label: 'Settings' },
      { id: 'upgrades', label: 'Upgrades' },
      { id: 'legacy', label: 'Legacy' },
    ],
  },
]

const DEFAULT_TAB = 'studio'

function tabById(id) {
  return TABS.find((t) => t.id === id) ?? TABS[0]
}

export default function App() {
  const game = useGame()
  const { prefs, setTab, setSubtab, setSectionOpen } = useUiPrefs()
  // The set builder is a Studio sub-tab, not a modal. `designOpen` keeps it
  // MOUNTED once it has been opened, so a half-built set survives a trip to
  // Standards and back — see where it renders below. `designSeq` is bumped on
  // release to throw the finished draft away and seed a fresh one.
  const [designOpen, setDesignOpen] = useState(false)
  const [designSeq, setDesignSeq] = useState(0)
  const [retireConfirm, setRetireConfirm] = useState(false)
  const tabRefs = useRef([])

  const tab = tabById(prefs.tab ?? DEFAULT_TAB)
  const subtabs = tab.subtabs
  const subtab = subtabs.some((s) => s.id === prefs.subtab?.[tab.id]) ? prefs.subtab[tab.id] : subtabs[0].id

  const goTo = (tabId, subtabId) => {
    setTab(tabId)
    if (subtabId) setSubtab(tabId, subtabId)
  }

  // Studio > Design shows the set builder. Latch it open on the first visit so
  // it stays mounted afterwards (see where it renders).
  const isDesign = tab.id === 'studio' && subtab === 'design'
  useEffect(() => {
    if (isDesign && !designOpen) setDesignOpen(true)
  }, [isDesign, designOpen])

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

  const state = game.state

  // Every sub-tab's content, keyed `tab.subtab`, declared once so there is a
  // single source of truth for props.
  const views = {
    'studio.overview': <StudioOverview state={state} />,
    'studio.sets': (
      <>
        <SetsPanel state={state} onReprint={game.reprint} onPull={game.pull} onAdjustWave={game.adjustWave} onToggleOdds={game.toggleOddsPublished} />
        <PackRipper state={state} onRip={game.rip} />
      </>
    ),
    'studio.cards': <CardsPanel
      state={state}
      onAddDesign={game.addCardDesign}
      onUpdateDesign={game.updateCardDesign}
      onRemoveDesign={game.removeCardDesign}
      onPrintDesign={game.printCardDesign}
    />,
    'studio.cast': <CastPanel state={state} onAddCharacter={game.addCharacter} onUpdateCharacter={game.updateCharacter} onUpdatePerson={game.updatePerson} />,
    'studio.lineages': <LineagesPanel state={state} onAddCharacter={game.addCharacter} />,
    'studio.standards': <StandardsPanel state={state} onSave={game.saveStandard} onDelete={game.deleteStandard} />,

    'business.distribution': (
      <DistributionPanel
        state={state}
        onSign={game.signDist} onCultivate={game.cultivateDist} onDrop={game.dropDist}
        onTogglePurchaseLimits={game.togglePurchaseLimits} onTogglePhantomStock={game.togglePhantomStock}
      />
    ),
    'business.grading': (
      <GradingPanel state={state} onSignGrading={game.signGrading} onCultivateGrading={game.cultivateGrading} onDropGrading={game.dropGrading} />
    ),
    'business.illustrators': <IllustratorsPanel state={state} onSignArtist={game.signArtist} onEndArtist={game.endArtist} />,
    'business.partners': <PartnersPanel state={state} onSignPartner={game.signPartner} />,
    'business.ventures': (
      <VenturesPanel
        state={state}
        onLaunchMerch={game.launchMerch} onRefreshMerch={game.refreshMerch} onRetireMerch={game.retireMerch}
        onPitchMedia={game.pitchMedia}
      />
    ),

    'community.pulse': (
      <>
        <div className="meters">
          <PlayersMeter state={state} />
          <SatisfactionMeter state={state} />
        </div>
        <FeedbackFeed state={state} />
      </>
    ),
    'community.voices': (
      <PersonasPanel state={state} onComp={game.comp} onSponsor={game.sponsor} onDropSponsor={game.unsponsor} onInvitePrerelease={game.invitePrerelease} onSponsorTournament={game.sponsorTournament} />
    ),
    'community.programmes': <ProgrammesPanel state={state} onSetGoodwill={game.setGoodwill} onRunBreak={game.runBreak} />,
    'community.grassroots': <GrassrootsPanel state={state} onSetGrassroots={game.setGrassroots} onFundGrant={game.fundGrant} />,
    'community.news': <EventsFeed state={state} />,

    'stats.money': (
      <>
        <div className="meters"><CashMeter state={state} /></div>
        <LedgerPanel state={state} />
      </>
    ),
    'stats.trends': <HistoryPanel state={state} />,
    'stats.market': <MarketTicker state={state} />,
    'stats.cards': <CardBrowser state={state} />,
    'stats.scalp': <ScalpWatchPanel state={state} />,

    'misc.settings': (
      <SettingsPanel
        state={state}
        saveError={game.saveError}
        onExport={game.exportRun}
        onImport={game.importRun}
        onReset={game.reset}
      />
    ),
    'misc.upgrades': <UpgradesPanel state={state} onPurchase={game.purchaseUpgrade} onUpgradeSupplyChain={game.upgradeSupplyChain} />,
    'misc.legacy': (
      <LegacyPanel
        state={state}
        onRetire={game.retire}
        retireConfirm={retireConfirm} onRetireConfirm={setRetireConfirm}
      />
    ),
  }

  return (
    <SectionPrefsProvider sections={prefs.sections} setSectionOpen={setSectionOpen}>
      <div className="app">
        <TopStrip game={game} />

        {/* A failed autosave used to be entirely silent, which is how a long run
            could stop saving without the player ever finding out. */}
        {game.saveError && (
          <div className="savewarn" role="alert">
            ⚠ {game.saveError}
            <button className="btn btn--ghost" onClick={() => goTo('misc', 'settings')}>Open settings</button>
          </div>
        )}

        <main
          className="dashboard"
          id={`tabpanel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          tabIndex={0}
        >
          <SubTabs
            tabs={subtabs}
            active={subtab}
            onChange={(id) => setSubtab(tab.id, id)}
            label={`${tab.label} sections`}
            idPrefix={tab.id}
          />
          <div
            className="col"
            id={`${tab.id}-panel-${subtab}`}
            role="tabpanel"
            aria-labelledby={`${tab.id}-tab-${subtab}`}
          >
            {!isDesign && views[`${tab.id}.${subtab}`]}
            {/* The set builder is HIDDEN rather than unmounted when you leave
                it. Its draft lives in component state, so unmounting would
                throw away a half-built set the moment you stepped over to
                Standards — and standing next to the standards it imports is the
                whole reason it moved here. `hidden` sits on this wrapper rather
                than the builder itself because .builder--wide sets `display:
                grid`, which would beat the [hidden] default.

                It mounts on the first visit and stays mounted, so the draft is
                seeded after the save has hydrated rather than from the empty
                state App holds while booting. */}
            {(designOpen || isDesign) && (
              <div hidden={!isDesign}>
                <SetBuilder
                  key={designSeq}
                  setNumber={state.sets.length + 1}
                  cash={state.cash}
                  artists={state.artists}
                  characters={state.characters ?? []}
                  people={state.people ?? []}
                  liveCards={state.cards.filter((c) => !c.banned && !c.rotated)}
                  sets={state.sets}
                  blocks={state.blocks ?? []}
                  illustrationSets={state.illustrationSets ?? []}
                  cardDesigns={state.cardDesigns ?? []}
                  standards={{
                    raritySheets: state.raritySheets ?? [],
                    packFormats: state.packFormats ?? [],
                    blueprints: state.blueprints ?? [],
                  }}
                  onSaveStandard={game.saveStandard}
                  upgrades={state.upgrades ?? {}}
                  week={state.week}
                  franchise={state.franchise}
                  perks={state.prestige?.perks ?? []}
                  conceptId={state.config?.conceptId}
                  onRelease={(draft) => {
                    game.release(draft)
                    // Throw the shipped draft away and land on the set you just
                    // made, rather than on an empty builder that looks as though
                    // nothing happened.
                    setDesignSeq((n) => n + 1)
                    goTo('studio', 'sets')
                  }}
                />
              </div>
            )}
          </div>
        </main>

        <nav className="tabbar" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              ref={(el) => { tabRefs.current[i] = el }}
              role="tab"
              type="button"
              aria-selected={tab.id === t.id}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={tab.id === t.id ? 0 : -1}
              className={'tabbar__btn' + (tab.id === t.id ? ' is-active' : '')}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <span className="tabbar__icon" aria-hidden="true">{t.icon}</span>
              <span className="tabbar__label">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* The run is over — retirement or ruin. Both share one retrospective. */}
        {state.gameOver && state.retirement && (
          <RetrospectivePanel state={state} onReset={game.reset} />
        )}

      </div>
    </SectionPrefsProvider>
  )
}
