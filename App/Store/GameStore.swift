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
            errorMessage = "The game could not read the save file. \(error.localizedDescription)"
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
    func createSet(name: String, theme: ThemeID?, presetID: LadderID) -> Result<SetID, StoreError> {
        applyCard { world throws(CardError) in try world.createSet(name: name, theme: theme, presetID: presetID) }
    }

    @discardableResult
    func updateSet(_ id: SetID, name: String, theme: ThemeID?) -> String? {
        applyCard { world throws(CardError) in try world.updateSet(id, name: name, theme: theme) }.message
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
    func updateCard(_ id: CardID, _ draft: CardDraft) -> String? {
        applyCard { world throws(CardError) in try world.updateCard(id, draft) }.message
    }

    func deleteCard(_ id: CardID) {
        report(applyCard { world throws(CardError) in try world.deleteCard(id) }.message)
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

    func advanceWeek() {
        guard var current = world else { return }
        current.advanceWeek()
        world = current
        persist()
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
