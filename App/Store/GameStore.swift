import Foundation
import Observation
import SimCore

/// The only bridge between the screens and the simulation.
/// Screens read `world` and call the methods below. No screen changes the
/// world directly. Every change saves at once.
@Observable
final class GameStore {
    private(set) var world: World?
    private(set) var ui = UIState()
    private(set) var lastSaved: Date?
    var errorMessage: String?

    @ObservationIgnored private let saves: SaveManager
    @ObservationIgnored private let isPreview: Bool

    init(saves: SaveManager = SaveManager()) {
        self.saves = saves
        isPreview = false
        do {
            if let file = try saves.load() {
                world = file.world
                ui = file.ui
                lastSaved = file.savedAt
            }
        } catch {
            // Keep a copy first, so a new game cannot write over the only copy.
            saves.keepUnreadableCopies()
            errorMessage = "The game could not read the save file. A copy is in the Saves folder. \(error.localizedDescription)"
        }
    }

    /// A store for SwiftUI previews. It never writes to disk.
    init(preview: World) {
        saves = SaveManager(directory: URL.temporaryDirectory)
        isPreview = true
        world = preview
        ui.starterPromptDone = true
    }

    var saveURL: URL? {
        guard !isPreview, FileManager.default.fileExists(atPath: saves.mainURL.path) else { return nil }
        return saves.mainURL
    }

    // MARK: - New game

    /// Creates the world and the required mascot together.
    func startNewGame(studioName: String, mascot: CharacterDraft) -> String? {
        var newWorld = World(seed: UInt64.random(in: .min ... .max), studioName: studioName)
        do {
            try newWorld.createCharacter(mascot)
        } catch {
            return error.message
        }
        world = newWorld
        ui = UIState()
        persist()
        return nil
    }

    func finishStarterPrompt() {
        ui.starterPromptDone = true
        persist()
    }

    /// Archives the current save and returns to the new-game screen.
    func startOver() {
        do {
            if !isPreview { try saves.archive() }
            world = nil
            ui = UIState()
            lastSaved = nil
        } catch {
            errorMessage = "The game could not archive the save. \(error.localizedDescription)"
        }
    }

    func importSave(from url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let file = try SaveManager.decode(Data(contentsOf: url))
            if !isPreview { try saves.archive() }
            world = file.world
            ui = file.ui
            persist()
        } catch {
            errorMessage = "The game could not import that file. \(error.localizedDescription)"
        }
    }

    // MARK: - Roster decisions

    /// Returns an error message, or nil on success.
    @discardableResult
    func createCharacter(_ draft: CharacterDraft) -> String? {
        apply { world throws(RosterError) in try world.createCharacter(draft) }
    }

    @discardableResult
    func createForm(of baseID: CharacterID, _ draft: CharacterDraft) -> String? {
        apply { world throws(RosterError) in try world.createForm(of: baseID, draft) }
    }

    @discardableResult
    func redesignForm(_ formID: FormID, of characterID: CharacterID, _ draft: CharacterDraft) -> String? {
        apply { world throws(RosterError) in try world.redesignForm(formID, of: characterID, draft) }
    }

    @discardableResult
    func redesign(_ id: CharacterID, _ draft: CharacterDraft) -> String? {
        apply { world throws(RosterError) in try world.redesign(id, draft) }
    }

    func retire(_ id: CharacterID) {
        report(apply { world throws(RosterError) in try world.retire(id) })
    }

    func restore(_ id: CharacterID) {
        report(apply { world throws(RosterError) in try world.restore(id) })
    }

    // MARK: - Card designer decisions (cards.md)

    /// Returns the new set's ID, or an error message.
    func createSet(_ type: SetType, _ details: SetDetails, presetID: LadderID, packID: PackID) -> Result<SetID, StoreError> {
        applyCard { world throws(CardError) in try world.createSet(type, details, presetID: presetID, packID: packID) }
    }

    /// Returns the ID of the first set of the pair, or an error message.
    func createParallelPair(_ first: SetDetails, _ second: SetDetails, presetID: LadderID, packID: PackID) -> Result<SetID, StoreError> {
        applyCard { world throws(CardError) in try world.createParallelPair(first, second, presetID: presetID, packID: packID).0 }
    }

    /// Changes the set's details and type together, or changes nothing.
    @discardableResult
    func updateSet(_ id: SetID, _ details: SetDetails, type: SetType) -> String? {
        applyCard { world throws(CardError) in
            try world.updateSetType(id, type)
            try world.updateSet(id, details)
        }.message
    }

    /// Makes all filler cards and generated characters of a set again (S5).
    @discardableResult
    func rerollFiller(_ id: SetID) -> String? {
        applyCard { world throws(CardError) in try world.rerollFiller(id) }.message
    }

    @discardableResult
    func updateSetLadder(_ id: SetID, _ ladder: RarityLadder) -> String? {
        applyCard { world throws(CardError) in try world.updateSetLadder(id, ladder) }.message
    }

    @discardableResult
    func createCard(in setID: SetID, _ draft: CardDraft) -> String? {
        applyCard { world throws(CardError) in try world.createCard(in: setID, draft) }.message
    }

    /// Adds one card for each draft. If one draft fails, the store adds no card.
    @discardableResult
    func createCards(in setID: SetID, _ drafts: [CardDraft]) -> String? {
        applyCard { world throws(CardError) in try world.createCards(in: setID, drafts) }.message
    }

    @discardableResult
    func updateCard(_ id: CardID, _ draft: CardDraft, adding extra: [CardDraft] = []) -> String? {
        applyCard { world throws(CardError) in try world.updateCard(id, draft, adding: extra) }.message
    }

    func deleteCard(_ id: CardID) {
        report(applyCard { world throws(CardError) in try world.deleteCard(id) }.message)
    }

    /// Deletes a draft set with its cards (S16).
    func deleteSet(_ id: SetID) {
        report(applyCard { world throws(CardError) in try world.deleteSet(id) }.message)
    }

    func createPreset(copying id: LadderID, name: String) -> Result<LadderID, StoreError> {
        applyCard { world throws(CardError) in try world.createPreset(copying: id, name: name) }
    }

    @discardableResult
    func updatePreset(_ ladder: RarityLadder) -> String? {
        applyCard { world throws(CardError) in try world.updatePreset(ladder) }.message
    }

    func deletePreset(_ id: LadderID) {
        report(applyCard { world throws(CardError) in try world.deletePreset(id) }.message)
    }

    // MARK: - Eras, subsets, and art sets (sets.md, section 6)

    @discardableResult
    func startEra(_ draft: EraDraft) -> String? {
        applyCard { world throws(CardError) in try world.startEra(draft) }.message
    }

    @discardableResult
    func updateEra(_ id: EraID, _ draft: EraDraft) -> String? {
        applyCard { world throws(CardError) in try world.updateEra(id, draft) }.message
    }

    @discardableResult
    func saveSubset(_ setID: SetID, _ subset: Subset, cards: [CardID]) -> String? {
        applyCard { world throws(CardError) in try world.saveSubset(setID, subset, cards: cards) }.message
    }

    func deleteSubset(_ setID: SetID, _ id: SubsetID) {
        report(applyCard { world throws(CardError) in try world.deleteSubset(setID, id) }.message)
    }

    @discardableResult
    func saveArtSet(_ setID: SetID, _ artSet: ArtSet) -> String? {
        applyCard { world throws(CardError) in try world.saveArtSet(setID, artSet) }.message
    }

    func deleteArtSet(_ setID: SetID, _ id: ArtSetID) {
        report(applyCard { world throws(CardError) in try world.deleteArtSet(setID, id) }.message)
    }

    // MARK: - Packs (sets.md, section 5)

    func createPackPreset(copying id: PackID, name: String) -> Result<PackID, StoreError> {
        applyCard { world throws(CardError) in try world.createPackPreset(copying: id, name: name) }
    }

    @discardableResult
    func updatePackPreset(_ pack: PackLayout) -> String? {
        applyCard { world throws(CardError) in try world.updatePackPreset(pack) }.message
    }

    func deletePackPreset(_ id: PackID) {
        report(applyCard { world throws(CardError) in try world.deletePackPreset(id) }.message)
    }

    @discardableResult
    func updateSetPack(_ id: SetID, _ pack: PackLayout) -> String? {
        applyCard { world throws(CardError) in try world.updateSetPack(id, pack) }.message
    }

    /// Creates a form from the card designer's "New design" (R26). Returns the form's ID, or an error message.
    func createFormForCard(of characterID: CharacterID, _ draft: CharacterDraft) -> Result<FormID, StoreError> {
        guard var current = world else { return .failure(StoreError(message: "No game is running.")) }
        do {
            let id = try current.createForm(of: characterID, draft)
            world = current
            persist()
            return .success(id)
        } catch {
            return .failure(StoreError(message: error.message))
        }
    }

    // MARK: - Developer tools (until the set and market systems exist)

    func generateCharacters(count: Int) {
        report(apply { world throws(RosterError) in try world.generateCharacters(count: count) })
    }

    /// Hires or dismisses the person for one part of the market view (K3).
    @discardableResult
    func setHire(_ insight: MarketInsight, hired: Bool) -> String? {
        applyCard { world throws(CardError) in try world.setHire(insight, hired: hired) }.message
    }

    @discardableResult
    func move(to space: Space) -> String? {
        applyCard { world throws(CardError) in try world.move(to: space) }.message
    }

    /// Unlocks or locks one part of the market view, with no hire. Tests only (A5).
    func setMarketInsight(_ insight: MarketInsight, on: Bool) {
        guard var current = world else { return }
        current.setMarketInsight(insight, on: on)
        world = current
        persist()
    }

    // MARK: - Releases and money (sales.md)

    @discardableResult
    func scheduleRelease(_ setID: SetID, boxes: Int, packPrice: Double, releaseWeek: Int, campaign: Campaign = .none,
                         holdBack: Double = 0) -> String? {
        applyCard { world throws(CardError) in
            try world.scheduleRelease(setID, boxes: boxes, packPrice: packPrice, releaseWeek: releaseWeek, campaign: campaign,
                                      holdBack: holdBack)
        }.message
    }

    func signDistributor() {
        guard var current = world else { return }
        current.signDistributor()
        world = current
        persist()
    }

    func endDistributor() {
        guard var current = world else { return }
        current.endDistributor()
        world = current
        persist()
    }

    func setBrandBudget(_ amount: Double, adShare: Double) {
        guard var current = world else { return }
        current.setBrandBudget(amount, adShare: adShare)
        world = current
        persist()
    }

    @discardableResult
    func reprint(_ setID: SetID, boxes: Int) -> String? {
        applyCard { world throws(CardError) in try world.reprint(setID, boxes: boxes) }.message
    }

    // MARK: - Lore (lore.md)

    @discardableResult
    func createRace(name: String, emblem: SetSymbolShape, color: PaletteColor) -> String? {
        applyCard { world throws(CardError) in try world.createRace(name: name, emblem: emblem, color: color) }.message
    }

    @discardableResult
    func createGroup(name: String, kind: GroupKind, parent: FactionID?, tone: FactionTone, emblem: SetSymbolShape, color: PaletteColor) -> String? {
        applyCard { world throws(CardError) in
            try world.createFaction(name: name, kind: kind, parent: parent, tone: tone, emblem: emblem, color: color)
        }.message
    }

    @discardableResult
    func setGroupParent(_ group: FactionID, to parent: FactionID?) -> String? {
        applyCard { world throws(CardError) in try world.setParent(group, to: parent) }.message
    }

    @discardableResult
    func deleteRace(_ id: RaceID) -> String? {
        applyCard { world throws(CardError) in try world.deleteRace(id) }.message
    }

    @discardableResult
    func deleteGroup(_ id: FactionID) -> String? {
        applyCard { world throws(CardError) in try world.deleteFaction(id) }.message
    }

    @discardableResult
    func setRelation(_ a: FactionID, _ b: FactionID, to value: Double) -> String? {
        applyCard { world throws(CardError) in try world.setRelation(a, b, to: value) }.message
    }

    @discardableResult
    func setLore(_ id: CharacterID, race: RaceID?, faction: FactionID?) -> String? {
        applyCard { world throws(CardError) in try world.setLore(id, race: race, faction: faction) }.message
    }

    @discardableResult
    func setFormFaction(_ id: CharacterID, form: FormID, faction: FactionID?) -> String? {
        applyCard { world throws(CardError) in try world.setFormFaction(id, form: form, faction: faction) }.message
    }

    @discardableResult
    func setLeadArtist(_ setID: SetID, _ artist: ArtistID?) -> String? {
        applyCard { world throws(CardError) in try world.setLeadArtist(setID, artist) }.message
    }

    @discardableResult
    func revealCard(_ id: CardID) -> String? {
        applyCard { world throws(CardError) in try world.revealCard(id) }.message
    }

    @discardableResult
    func runAction(_ action: StudioAction) -> String? {
        applyCard { world throws(CardError) in try world.runAction(action) }.message
    }

    @discardableResult
    func setStory(_ setID: SetID, _ story: SetStory?) -> String? {
        applyCard { world throws(CardError) in try world.setStory(setID, story) }.message
    }

    /// A developer tool until loans exist (B3).
    func addCash(_ amount: Double) {
        guard var current = world else { return }
        current.addCash(amount, note: "Developer cash")
        world = current
        persist()
    }

    /// Moves time by several weeks at once (B11).
    func advanceWeeks(_ count: Int) {
        advance { world in for _ in 0..<count { world.advanceWeek() } }
    }

    func advanceWeek() {
        advance { $0.advanceWeek() }
    }

    /// Passes weeks until something happens, 26 weeks at most (T3).
    func advanceToNextEvent() {
        advance { $0.advanceToNextEvent() }
    }

    /// The report of the last weeks that passed (T2). A quiet report shows as a toast.
    var report: WeekReport?
    var toast: WeekReport?
    /// Counts each time passing, for the haptic tick. `bigTicks` counts the big events.
    private(set) var ticks = 0
    private(set) var bigTicks = 0

    private func advance(_ change: (inout World) -> Void) {
        guard var current = world else { return }
        let weekBefore = current.week
        let cashBefore = current.business.cash
        let newsBefore = current.business.news.count
        change(&current)
        world = current
        persist()
        guard current.week > weekBefore else { return }
        let sold = current.business.sales.values.joined()
            .filter { $0.week > weekBefore && $0.week <= current.week }
            .reduce(0) { $0 + $1.totalSold }
        let news = current.business.news.dropFirst(newsBefore).map(\.text)
        let result = WeekReport(fromWeek: weekBefore + 1, toWeek: current.week, cashChange: current.business.cash - cashBefore,
                                cash: current.business.cash, packsSold: sold, news: Array(news))
        ticks += 1
        if result.isBig { bigTicks += 1 }
        if result.isQuiet { toast = result } else { report = result }
    }

    // MARK: - Internals

    private func apply<T>(_ change: (inout World) throws(RosterError) -> T) -> String? {
        guard var current = world else { return "No game is running." }
        do {
            _ = try change(&current)
        } catch {
            return error.message
        }
        world = current
        persist()
        return nil
    }

    private func applyCard<T>(_ change: (inout World) throws(CardError) -> T) -> Result<T, StoreError> {
        guard var current = world else { return .failure(StoreError(message: "No game is running.")) }
        do {
            let value = try change(&current)
            world = current
            persist()
            return .success(value)
        } catch {
            return .failure(StoreError(message: error.message))
        }
    }

        private func report(_ message: String?) {
        if let message { errorMessage = message }
    }

    private func persist() {
        guard !isPreview, let world else { return }
        let file = SaveFile(version: SaveFile.currentVersion, savedAt: Date(), world: world, ui: ui)
        do {
            try saves.save(file)
            lastSaved = file.savedAt
        } catch {
            errorMessage = "The game could not save. \(error.localizedDescription)"
        }
    }

    // MARK: - Funding (F1 to F4)

    @discardableResult
    func takeBankLoan(amount: Double, years: Int) -> String? {
        applyCard { world throws(CardError) in try world.takeBankLoan(amount: amount, years: years) }.message
    }

    @discardableResult
    func payOffLoan(_ id: Int) -> String? {
        applyCard { world throws(CardError) in try world.payOffLoan(id) }.message
    }

    @discardableResult
    func takeAdvance(amount: Double) -> String? {
        applyCard { world throws(CardError) in try world.takeAdvance(amount: amount) }.message
    }

    @discardableResult
    func acceptInvestor() -> String? {
        applyCard { world throws(CardError) in try world.acceptInvestor() }.message
    }

    @discardableResult
    func launchCrowdfund(_ setID: SetID, goal: Double, pledge: Double) -> String? {
        applyCard { world throws(CardError) in try world.launchCrowdfund(setID, goal: goal, pledge: pledge) }.message
    }
}

/// An error message for a screen to show.
struct StoreError: Error {
    let message: String
}

extension Result where Failure == StoreError {
    /// The error message, or nil on success.
    var message: String? {
        if case .failure(let error) = self { return error.message }
        return nil
    }
}

/// What happened in the weeks that just passed (T2).
struct WeekReport: Identifiable, Equatable {
    let id = UUID()
    let fromWeek: Int
    let toWeek: Int
    let cashChange: Double
    let cash: Double
    let packsSold: Double
    let news: [String]

    /// A week with no news and no sales. It shows as a short toast.
    var isQuiet: Bool { news.isEmpty && packsSold < 1 }
    /// A week with a release, a sell-out, a legend, or a viral artist. It gets a stronger haptic.
    var isBig: Bool {
        news.contains { text in
            ["is out", "sold out", "legend", "viral", "closed", "called the loan"].contains { text.contains($0) }
        }
    }
    var weeks: Int { toWeek - fromWeek + 1 }
}
