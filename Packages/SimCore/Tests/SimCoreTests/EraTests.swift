import Testing
@testable import SimCore

fileprivate func expectFailure(
    _ expected: CardError, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void
) {
    var got: CardError?
    do { try body() } catch { got = error as? CardError }
    #expect(got == expected, sourceLocation: sourceLocation)
}

fileprivate func shifted(_ tiers: [RarityTier], by amount: Int) -> [RarityTier] {
    tiers.map { t in
        RarityTier(id: t.id + amount, name: t.name, code: t.code, symbol: t.symbol, symbolCount: t.symbolCount,
                   color: t.color, frameStyle: t.frameStyle, look: t.look, versions: t.versions,
                   fillerShare: t.fillerShare, secret: t.secret)
    }
}

fileprivate func details(_ name: String, _ code: String, size: Int = 10) -> SetDetails {
    SetDetails(name: name, code: code, size: size)
}

@Suite("Eras")
struct EraTests {
    @Test("A new era ends the old one, copies its look, and new sets join it (S7, S13)")
    func startEra() throws {
        var (world, old, _) = try Fixture.studio()
        #expect(world.catalog.eras == [Era.first])
        #expect(world.catalog.currentEra.id == 1)
        world.week = 5
        let gimmick = Gimmick(name: "ex")
        let id = try world.startEra(name: "Scarlet Violet", gimmick: gimmick)
        let first = try #require(world.catalog.era(1))
        let era = try #require(world.catalog.era(id))
        #expect(id == 2)
        #expect(first.endWeek == 5)
        #expect(era.startWeek == 5)
        #expect(era.endWeek == nil)
        #expect(era.code == "SV")
        #expect(era.gimmick == gimmick)
        #expect(era.nameBar == first.nameBar)
        #expect(era.ladderPresetID == first.ladderPresetID)
        #expect(era.packPresetID == first.packPresetID)
        #expect(world.catalog.currentEra.id == id)
        #expect(world.catalog.eras.filter { $0.endWeek == nil }.count == 1)

        let fresh = try world.createSet(.main, details("Fresh", "FRS"), presetID: 1)
        #expect(world.catalog.set(fresh)?.eraID == id)
        #expect(world.catalog.set(old)?.eraID == 1)
        #expect(world.catalog.era(of: old)?.id == 1)
        #expect(world.catalog.gimmick(of: fresh) == gimmick)
        #expect(world.catalog.gimmick(of: old) == nil)
        #expect(world.catalog.gimmick(of: 999) == nil)
        let third = try world.startEra(name: "Sun Moon", gimmick: nil)
        #expect(third == 3)
        #expect(world.catalog.era(id)?.endWeek == 5)
    }

    @Test("An era needs a name, a code of 2 or 3 letters that no other era uses, known presets, and a valid gimmick (E1, E6, E5)")
    func eraRules() throws {
        var (world, _, _) = try Fixture.studio()
        func start(_ edit: (inout EraDraft) -> Void) throws(CardError) {
            var draft = EraDraft(name: "Era", code: "ER")
            edit(&draft)
            _ = try world.startEra(draft)
        }
        let long = String(repeating: "e", count: Era.nameLimit + 1)
        expectFailure(.emptyEraName) { try start { $0.name = "  " } }
        expectFailure(.nameTooLong(Era.nameLimit)) { try start { $0.name = long } }
        expectFailure(.badEraCode) { try start { $0.code = "" } }
        expectFailure(.badEraCode) { try start { $0.code = "A" } }
        expectFailure(.badEraCode) { try start { $0.code = "ABCD" } }
        expectFailure(.badEraCode) { try start { $0.code = "A1" } }
        expectFailure(.duplicateEraCode("BS")) { try start { $0.code = "bs" } }
        expectFailure(.unknownPreset(99)) { try start { $0.ladderPresetID = 99 } }
        expectFailure(.unknownPack(99)) { try start { $0.packPresetID = 99 } }
        expectFailure(.badGimmickName) { try start { $0.gimmick = Gimmick(name: "  ") } }
        let wide = String(repeating: "g", count: Gimmick.nameLimit + 1)
        expectFailure(.badGimmickName) { try start { $0.gimmick = Gimmick(name: wide) } }
        expectFailure(.badHomeTier) { try start { $0.gimmick = Gimmick(name: "ex", homeTierID: 99) } }
        #expect(world.catalog.eras == [Era.first])

        let id = try world.startEra(EraDraft(name: " New ", code: " nw ", gimmick: Gimmick(name: " ex ", homeTierID: 3)))
        let era = try #require(world.catalog.era(id))
        #expect(era.name == "New")
        #expect(era.code == "NW")
        #expect(era.gimmick?.name == "ex")
        #expect(era.gimmick?.homeTierID == 3)
    }

    @Test("An era changes by its designer or by name, keeps its own code, and cannot take another era's code (E2, E6)")
    func updateEra() throws {
        var (world, _, _) = try Fixture.studio()
        let id = try world.startEra(EraDraft(name: "New", code: "NW"))
        let preset = try world.createPreset(copying: 1, name: "Mine")
        let era = try #require(world.catalog.era(id))
        var draft = EraDraft(from: era)
        draft.name = "Newer"
        draft.nameBar = NameBarStyle(shape: .banner, color: .gold)
        draft.gimmick = Gimmick(name: "Mega", color: .rose, mark: .badge)
        draft.ladderPresetID = preset
        try world.updateEra(id, draft)
        let saved = try #require(world.catalog.era(id))
        #expect(saved.name == "Newer")
        #expect(saved.code == "NW")
        #expect(saved.nameBar.shape == .banner)
        #expect(saved.gimmick?.mark == .badge)
        #expect(saved.ladderPresetID == preset)
        #expect(saved.startWeek == era.startWeek)
        #expect(saved.endWeek == nil)

        draft.code = "BS"
        expectFailure(.duplicateEraCode("BS")) { try world.updateEra(id, draft) }
        expectFailure(.unknownEra(99)) { try world.updateEra(99, draft) }
        expectFailure(.unknownEra(99)) { try world.updateEra(99, name: "X", gimmick: nil) }
        try world.updateEra(id, name: "Renamed", gimmick: nil)
        let renamed = try #require(world.catalog.era(id))
        #expect(renamed.name == "Renamed")
        #expect(renamed.gimmick == nil)
        #expect(renamed.code == "NW")
        #expect(renamed.ladderPresetID == preset)
        #expect(renamed.nameBar.shape == .banner)
        expectFailure(.emptyEraName) { try world.updateEra(id, name: " ", gimmick: nil) }
    }

    @Test("An era code comes from the name, and a taken code tries other letters (E6)")
    func suggestedEraCode() throws {
        #expect(Era.suggestCode(for: "Scarlet Violet", taken: []) == "SV")
        #expect(Era.suggestCode(for: "Sword Shield Era", taken: []) == "SSE")
        #expect(Era.suggestCode(for: "Base", taken: []) == "BA")
        #expect(Era.suggestCode(for: "Base", taken: ["BA"]) == "BS")
        #expect(Era.suggestCode(for: "X", taken: []) == "XA")
        for name in ["Base", "Sun Moon", "123", "Ünï", "A"] {
            let first = Era.suggestCode(for: name, taken: [])
            let second = Era.suggestCode(for: name, taken: [first])
            #expect(Era.codeRange.contains(first.count))
            #expect(Era.codeRange.contains(second.count))
            #expect(second != first)
        }
        let (world, _, _) = try Fixture.studio()
        #expect(world.catalog.suggestedEraCode(for: "Bs") != "BS")
        #expect(world.catalog.suggestedEraCode(for: "Bs", editing: 1) == "BS")
    }

    @Test("Series numbers: main sets count up, a special set takes .5, a pair takes a letter, a promo takes none (E6, E8, E9)")
    func seriesNumbers() throws {
        var (world, _) = try Fixture.world()
        func add(_ type: SetType, _ name: String, _ code: String) throws -> SetID {
            try world.createSet(type, details(name, code), presetID: 1)
        }
        let a = try add(.main, "Alpha", "AAA")
        let b = try add(.main, "Bravo", "BBB")
        let m1 = try add(.mini, "Mini one", "MON")
        let m2 = try add(.mini, "Mini two", "MTW")
        let (p, q) = try world.createParallelPair(details("Left", "LFT"), details("Right", "RGT"), presetID: 1)
        let promo = try add(.promo, "Promo", "PRM")
        let c = try add(.main, "Charlie", "CCC")
        let m3 = try add(.mini, "Mini three", "MTH")
        let expected: [SetID: String] = [
            a: "BS1", b: "BS2", m1: "BS2.5", m2: "BS2.6", p: "BS3a", q: "BS3b", c: "BS4", m3: "BS4.5",
        ]
        #expect(world.catalog.seriesNumbers(in: 1) == expected)
        #expect(world.catalog.seriesNumber(of: promo) == nil)
        #expect(world.catalog.seriesNumber(of: b) == "BS2")
        #expect(world.catalog.seriesNumber(of: 999) == nil)
        #expect(world.catalog.seriesNumbers(in: 99).isEmpty)

        try world.startEra(name: "Scarlet Violet", gimmick: nil)
        let d = try add(.main, "Delta", "DDD")
        #expect(world.catalog.seriesNumber(of: d) == "SV1")
        #expect(world.catalog.seriesNumber(of: a) == "BS1")
        #expect(world.catalog.seriesNumbers(in: 1) == expected)
    }

    @Test("A gimmick card shows the gimmick after the character, and the home tier follows the set's own ladder (D3, E4, E5, S6)")
    func gimmickCards() throws {
        var (world, mascot) = try Fixture.world()
        let early = try world.createSet(.main, details("Early", "ERL"), presetID: 1)
        let era = try world.startEra(EraDraft(name: "Gimmick Era", code: "GE", gimmick: Gimmick(name: "ex", homeTierID: 3)))
        let set = try world.createSet(.main, details("Late", "LTE"), presetID: 1)
        let plain = try world.createSet(.main, details("Plain", "PLN"), presetID: 1)
        #expect(world.catalog.set(set)?.eraID == era)

        func card(_ target: SetID, _ name: String, gimmick: Bool) throws -> Card {
            let id = try world.createCard(in: target, CardDraft(name: name, characterID: mascot, rarity: 3, gimmick: gimmick))
            return try #require(world.catalog.card(id))
        }
        let named = try card(set, "Aryla, Star", gimmick: true)
        let bare = try card(set, "Aryla", gimmick: true)
        let off = try card(set, "Aryla, Moon", gimmick: false)
        let before = try card(early, "Aryla, Sun", gimmick: true)
        #expect(world.catalog.displayName(named) == "Aryla ex, Star")
        #expect(world.catalog.displayName(bare) == "Aryla ex")
        #expect(world.catalog.displayName(off) == "Aryla, Moon")
        #expect(world.catalog.displayName(before) == "Aryla, Sun")

        #expect(world.catalog.homeTier(of: set) == 3)
        #expect(world.catalog.homeTier(of: early) == nil)
        #expect(world.catalog.homeTier(of: 999) == nil)
        let source = try #require(world.catalog.set(plain)).ladder
        let moved = RarityLadder(id: source.id, name: source.name, tiers: shifted(source.tiers, by: 10))
        try world.updateSetLadder(plain, moved)
        #expect(world.catalog.homeTier(of: plain) == 13)
    }

    @Test("A deleted preset sends its eras to the default preset, and the home tier follows by name (eras.md, section 4)")
    func deletedPresetFallback() throws {
        var (world, _, _) = try Fixture.studio()
        let id = try world.createPreset(copying: 1, name: "Shifted")
        var ladder = try #require(world.catalog.preset(id))
        ladder.tiers = shifted(ladder.tiers, by: 10)
        ladder.tiers[1].name = "Zzz"
        try world.updatePreset(ladder)
        let named = try world.startEra(EraDraft(name: "Named", code: "NA", gimmick: Gimmick(name: "ex", homeTierID: 13), ladderPresetID: id))
        let lost = try world.startEra(EraDraft(name: "Lost", code: "LO", gimmick: Gimmick(name: "ex", homeTierID: 12), ladderPresetID: id))
        try world.deletePreset(id)
        #expect(world.catalog.preset(id) == nil)
        #expect(world.catalog.era(named)?.ladderPresetID == Catalog.defaultLadderID)
        #expect(world.catalog.era(named)?.gimmick?.homeTierID == 3)
        #expect(world.catalog.era(lost)?.ladderPresetID == Catalog.defaultLadderID)
        #expect(world.catalog.era(lost)?.gimmick?.homeTierID == nil)
    }

    @Test("A promo set has its own code, no series number, no new characters, and the look of its creation era (E9)")
    func promoSet() throws {
        var (world, mascot) = try Fixture.world()
        let old = try world.createSet(.promo, details("Old promo", "OLD", size: 15), presetID: 1)
        try world.startEra(name: "Scarlet Violet", gimmick: nil)
        let new = try world.createSet(.promo, details("New promo", "NEW", size: 15), presetID: 1)
        #expect(world.catalog.set(old)?.eraID == 1)
        #expect(world.catalog.set(new)?.eraID == 2)
        #expect(world.catalog.seriesNumber(of: new) == nil)
        let set = try #require(world.catalog.set(new))
        #expect(set.type == .promo)
        #expect(set.generated.isEmpty)
        let filler = world.catalog.fillerCards(in: new)
        #expect(filler.count == 15)
        #expect(filler.allSatisfy { $0.characterID == mascot })

        #expect(SetType.promo.name == "Promo set")
        #expect(SetType.mini.name == "Special set")
        #expect(SetType.promo.suggestedSize == 15)
        #expect(SetType.main.suggestedSize == 150)
        #expect(SetType.mini.suggestedSize == 60)
        #expect(SetType.parallel.suggestedSize == 100)
        #expect(SetType.promo.generatedRange == 0...0)
        #expect(SetType.main.generatedRange == 10...20)
        #expect(SetType.mini.generatedRange == 3...8)
        #expect(SetType.parallel.generatedRange == 5...10)
    }
}
