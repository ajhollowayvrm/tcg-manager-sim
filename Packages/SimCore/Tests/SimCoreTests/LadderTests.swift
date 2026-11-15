import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

fileprivate func defaultLadder() -> RarityLadder { RarityLadder.defaultLadder(id: Catalog.defaultLadderID) }

fileprivate func plainTiers(_ count: Int) -> [RarityTier] {
    (1...count).map {
        RarityTier(id: $0, name: "T\($0)", code: "T", symbol: .circle, color: .slate, fillerShare: $0 == 1 ? 100 : 0)
    }
}

@Suite("Ladders and presets")
struct LadderTests {
    @Test("A ladder needs 2 to 12 tiers, unique IDs and names, short codes, and shares that add up to 100 (C4, S4)")
    func ladderRules() throws {
        let (world, _, _) = try Fixture.studio()
        try world.validate(defaultLadder())
        var ladder = defaultLadder()

        ladder.tiers = plainTiers(1)
        expectFailure(.ladderSize) { try world.validate(ladder) }
        ladder.tiers = plainTiers(13)
        expectFailure(.ladderSize) { try world.validate(ladder) }
        ladder.tiers = plainTiers(2)
        try world.validate(ladder)
        ladder.tiers = plainTiers(12)
        try world.validate(ladder)

        ladder = defaultLadder()
        ladder.tiers[1] = RarityTier(id: 1, name: "Uncommon", code: "U", symbol: .diamond, color: .forest, fillerShare: 33)
        expectFailure(.duplicateTierID) { try world.validate(ladder) }

        ladder = defaultLadder()
        ladder.tiers[0].name = "  "
        expectFailure(.emptyTierName) { try world.validate(ladder) }
        ladder.tiers[0].name = "UNCOMMON"
        expectFailure(.duplicateTierName("Uncommon")) { try world.validate(ladder) }

        ladder = defaultLadder()
        ladder.tiers[0].code = ""
        expectFailure(.badTierCode("Common")) { try world.validate(ladder) }
        ladder.tiers[0].code = String(repeating: "C", count: RarityLadder.codeLimit + 1)
        expectFailure(.badTierCode("Common")) { try world.validate(ladder) }

        ladder = defaultLadder()
        ladder.tiers[0].versions = [CardVersion(id: 1, name: "", look: .plain)]
        expectFailure(.emptyVersionName) { try world.validate(ladder) }

        ladder = defaultLadder()
        ladder.tiers[8].fillerShare = 101
        expectFailure(.badFillerShare("Gold")) { try world.validate(ladder) }
        ladder.tiers[8].fillerShare = -1
        expectFailure(.badFillerShare("Gold")) { try world.validate(ladder) }

        ladder = defaultLadder()
        ladder.tiers[0].fillerShare = 60
        expectFailure(.fillerShares(110)) { try world.validate(ladder) }
    }

    @Test("A set's ladder keeps every tier that a designed card uses (C10)")
    func tierInUse() throws {
        var (world, id, mascot) = try Fixture.studio()
        try world.createCard(in: id, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        var ladder = try #require(world.catalog.set(id)).ladder
        ladder.tiers[1].fillerShare = 50
        ladder.tiers.remove(at: 2)
        expectFailure(.tierInUse("Rare")) { try world.updateSetLadder(id, ladder) }
        let tiers = try #require(world.catalog.set(id)).ladder.tiers
        #expect(tiers.count == 9)

        var bad = try #require(world.catalog.set(id)).ladder
        bad.tiers[0].fillerShare = 60
        expectFailure(.fillerShares(110)) { try world.updateSetLadder(id, bad) }
        expectFailure(.unknownSet(999)) { try world.updateSetLadder(999, ladder) }

        let unused = try world.createSet(.main, SetDetails(name: "Other", code: "OTH", size: 10), presetID: 1)
        ladder = try #require(world.catalog.set(unused)).ladder
        ladder.tiers[1].fillerShare = 50
        ladder.tiers.remove(at: 2)
        try world.updateSetLadder(unused, ladder)
        #expect(world.catalog.set(unused)?.ladder.tiers.count == 8)
    }

    @Test("A change to the tiers or the shares resets the filler, and a change to a look keeps it (S17)")
    func ladderChangeAndFiller() throws {
        var (world, id, _) = try Fixture.studio()
        let ladder = try #require(world.catalog.set(id)).ladder
        let before = Set(world.catalog.fillerCards(in: id).map(\.id))
        let generated = Set(try #require(world.catalog.set(id)).generated.map(\.id))
        #expect(!before.isEmpty)

        var look = ladder
        look.tiers[3].name = "Holo"
        look.tiers[3].color = .teal
        look.tiers[3].look = CardLook(foil: .rainbow)
        #expect(World.ladderResetsFiller(from: ladder, to: look) == false)
        try world.updateSetLadder(id, look)
        let kept = Set(world.catalog.fillerCards(in: id).map(\.id))
        #expect(kept == before)
        #expect(world.catalog.set(id)?.ladder.tiers[3].name == "Holo")

        var shares = look
        shares.tiers[0].fillerShare = 40
        shares.tiers[1].fillerShare = 43
        #expect(World.ladderResetsFiller(from: look, to: shares))
        try world.updateSetLadder(id, shares)
        let after = world.catalog.fillerCards(in: id)
        #expect(Set(after.map(\.id)).isDisjoint(with: before))
        let newGenerated = Set(try #require(world.catalog.set(id)).generated.map(\.id))
        #expect(newGenerated.isDisjoint(with: generated))
        #expect(after.count == 10)
        let commons = after.filter { $0.rarity == 1 }.count
        #expect(commons == 4)

        var moved = shares
        moved.tiers.swapAt(0, 1)
        #expect(World.ladderResetsFiller(from: shares, to: moved))
        var added = shares
        added.tiers.append(RarityTier(id: 10, name: "Extra", code: "X", symbol: .bolt, color: .rose))
        #expect(World.ladderResetsFiller(from: shares, to: added))
        #expect(World.ladderResetsFiller(from: shares, to: shares) == false)
    }

    @Test("A preset is a copy that the player edits, and the default preset never changes (C4)")
    func presetLifecycle() throws {
        var (world, _, _) = try Fixture.studio()
        let id = try world.createPreset(copying: Catalog.defaultLadderID, name: "  Mine  ")
        let preset = try #require(world.catalog.preset(id))
        #expect(preset.name == "Mine")
        #expect(preset.tiers == defaultLadder().tiers)
        #expect(id != Catalog.defaultLadderID)

        expectFailure(.duplicatePresetName("mine")) { _ = try world.createPreset(copying: 1, name: "mine") }
        expectFailure(.emptyName) { _ = try world.createPreset(copying: 1, name: " ") }
        expectFailure(.nameTooLong(RarityLadder.nameLimit)) {
            _ = try world.createPreset(copying: 1, name: String(repeating: "m", count: RarityLadder.nameLimit + 1))
        }
        expectFailure(.unknownPreset(99)) { _ = try world.createPreset(copying: 99, name: "X") }

        var changed = preset
        changed.name = "Mine, better"
        changed.tiers[0].name = "Basic"
        try world.updatePreset(changed)
        #expect(world.catalog.preset(id)?.tiers[0].name == "Basic")
        #expect(world.catalog.preset(id)?.name == "Mine, better")

        var broken = changed
        broken.tiers[0].fillerShare = 90
        expectFailure(.fillerShares(140)) { try world.updatePreset(broken) }
        #expect(world.catalog.preset(id)?.tiers[0].fillerShare == 50)
        var ghost = changed
        ghost = RarityLadder(id: 99, name: "Ghost", tiers: ghost.tiers)
        expectFailure(.unknownPreset(99)) { try world.updatePreset(ghost) }

        let locked = try #require(world.catalog.preset(Catalog.defaultLadderID))
        expectFailure(.defaultPresetLocked) { try world.updatePreset(locked) }
        expectFailure(.defaultPresetLocked) { try world.deletePreset(Catalog.defaultLadderID) }
        expectFailure(.unknownPreset(99)) { try world.deletePreset(99) }
        try world.deletePreset(id)
        #expect(world.catalog.preset(id) == nil)
    }

    @Test("A set keeps its own ladder copy when its preset changes or goes (C10)")
    func setKeepsItsCopy() throws {
        var (world, _, _) = try Fixture.studio()
        let preset = try world.createPreset(copying: Catalog.defaultLadderID, name: "Mine")
        let id = try world.createSet(.main, SetDetails(name: "Own", code: "OWN", size: 10), presetID: preset)
        var changed = try #require(world.catalog.preset(preset))
        changed.tiers[0].name = "Basic"
        try world.updatePreset(changed)
        #expect(world.catalog.set(id)?.ladder.tiers[0].name == "Common")
        try world.deletePreset(preset)
        #expect(world.catalog.set(id)?.ladder.tiers.count == 9)
    }
}
