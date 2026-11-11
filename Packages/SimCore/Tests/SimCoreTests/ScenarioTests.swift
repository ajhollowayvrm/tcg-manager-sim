import Foundation
import Testing
@testable import SimCore

// Gameplay scenarios. Each test plays a sequence of player decisions across the
// roster, cards, sets, filler, packs, eras, subsets, and art sets. After every
// step, `check` tests the rules that must always be true for the whole world.

/// The rules that must hold after every decision.
func check(_ world: World, _ step: String, sourceLocation: SourceLocation = #_sourceLocation) {
    let catalog = world.catalog
    func fail(_ text: String) { Issue.record("[\(step)] \(text)", sourceLocation: sourceLocation) }

    // IDs are unique.
    if Set(catalog.cards.map(\.id)).count != catalog.cards.count { fail("card IDs repeat") }
    if Set(catalog.sets.map(\.id)).count != catalog.sets.count { fail("set IDs repeat") }
    let allCharacters = world.characters + world.pendingCharacters
    if Set(allCharacters.map(\.id)).count != allCharacters.count { fail("character IDs repeat") }
    // Names are unique across the roster and the draft sets' generated characters.
    let names = allCharacters.map { $0.name.lowercased() } + allCharacters.flatMap { $0.forms.map { $0.name.lowercased() } }
    if Set(names).count != names.count { fail("character or form names repeat") }
    if Set(catalog.sets.map(\.code)).count != catalog.sets.count { fail("set codes repeat") }
    if Set(catalog.sets.map { $0.name.lowercased() }).count != catalog.sets.count { fail("set names repeat") }

    // Exactly one era runs.
    if catalog.eras.filter({ $0.endWeek == nil }).count != 1 { fail("not exactly one current era") }

    for card in catalog.cards {
        guard let setID = card.setID, let set = catalog.set(setID) else { fail("card \(card.id) has no set"); continue }
        if set.ladder.tier(card.rarity) == nil { fail("card \(card.name) has a tier that is not in its ladder") }
        if world.character(card.characterID) == nil { fail("card \(card.name) shows a missing character") }
        if card.filler {
            if card.subsetID != nil || card.gimmick || !card.featured.isEmpty { fail("filler card \(card.name) has designed parts") }
        }
        if let subsetID = card.subsetID, set.subset(subsetID) == nil { fail("card \(card.name) is in a missing subset") }
        if catalog.era(set.eraID) == nil { fail("set \(set.name) is in a missing era") }
    }

    for set in catalog.sets {
        let designed = catalog.cards(in: set.id)
        let filler = catalog.fillerCards(in: set.id)
        if designed.count > set.size { fail("\(set.name) has more designed cards than its size") }
        if filler.count != set.size - designed.count {
            fail("\(set.name) has \(filler.count) filler cards, expected \(set.size - designed.count)")
        }
        if !filler.isEmpty {
            let targets = World.fillerTargets(count: set.size - designed.count, ladder: set.ladder)
            let counts = filler.reduce(into: [TierID: Int]()) { $0[$1.rarity, default: 0] += 1 }
            if counts != targets.filter({ $0.value > 0 }) { fail("\(set.name) filler does not follow the shares") }
        }
        let used = Set(filler.map(\.characterID))
        for c in set.generated where !used.contains(c.id) { fail("\(set.name) keeps generated \(c.name) with no card") }
        if world.characters.contains(where: { r in set.generated.contains { $0.id == r.id } }) {
            fail("\(set.name) generated characters are already in the roster")
        }
        if let pairID = set.pairID, catalog.set(pairID)?.pairID != set.id { fail("\(set.name) pair link is not symmetric") }
        if set.ladder.tiers.reduce(0, { $0 + $1.fillerShare }) != 100 { fail("\(set.name) shares do not add up to 100") }
        for slot in set.pack.slots where abs(slot.oddsSum - 100) > 0.001 { fail("\(set.name) pack slot does not add up to 100") }
        let numbers = catalog.cardNumbers(in: set.id)
        if numbers.count != designed.count + filler.count { fail("\(set.name) has cards with no number") }
        if Set(numbers.values).count != numbers.count { fail("\(set.name) card numbers repeat") }
        let designedIDs = Set(designed.map(\.id))
        var inArtSets: Set<CardID> = []
        for artSet in set.artSets {
            if !ArtSet.cardRange.contains(artSet.cards.count) { fail("art set \(artSet.name) has a bad size") }
            for id in artSet.cards {
                if !designedIDs.contains(id) { fail("art set \(artSet.name) holds a card that is not designed in the set") }
                if !inArtSets.insert(id).inserted { fail("a card is in two art sets") }
            }
        }
        // The pull rates are a read: they never change the world.
        _ = world.packStats(set.id)
        _ = world.packWarnings(set.id)
    }
}

/// The world after a save and a load.
func roundTrip(_ world: World) throws -> World {
    var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(world)) as? [String: Any])
    try World.migrate(&json)
    return try JSONDecoder().decode(World.self, from: JSONSerialization.data(withJSONObject: json))
}

@Suite("Gameplay scenarios")
struct ScenarioTests {
    /// A garage studio: a person mascot, a starter trio, and an evolution.
    func garageStudio(seed: UInt64 = 2026) throws -> (World, mascot: CharacterID, starters: [CharacterID]) {
        var world = World(seed: seed, studioName: "Garage Games")
        let mascot = try world.createCharacter(CharacterDraft(
            name: "Aryla", role: .mascot, primaryType: .light, archetype: .cool,
            palette: [.indigo, .ember, .gold], kind: .person,
            person: PersonParts(skin: .tan, hair: .ponytail, eyes: .sharp, outfit: .jacket, accessory: .scarf)
        ))
        var starters: [CharacterID] = []
        for (name, type) in [("Cindrel", ElementType.fire), ("Ripplet", .water), ("Sproutle", .nature)] {
            starters.append(try world.createCharacter(CharacterDraft(name: name, role: .starter, primaryType: type)))
        }
        try world.createCharacter(CharacterDraft(name: "Blazorn", role: .starter, primaryType: .fire, evolvesFrom: starters[0]))
        check(world, "garage studio")
        return (world, mascot, starters)
    }

    func tier(_ world: World, _ set: SetID, _ code: String) throws -> TierID {
        try #require(world.catalog.set(set)?.ladder.tiers.first { $0.code == code }?.id)
    }

    // MARK: - Scenario 1

    @Test("Scenario 1: a new studio designs its first main set and gets it ready")
    func firstSet() throws {
        var (world, mascot, starters) = try garageStudio()

        // The player creates a 120-card Feudalism main set with the mascot as headliner.
        let set = try world.createSet(.main, SetDetails(
            name: "Crown of Embers", code: "COE", symbol: SetSymbol(shape: .crown, color: .ember),
            theme: "feudalism", size: 120, headliner: Headliner(characterID: mascot)
        ), presetID: Catalog.defaultLadderID)
        check(world, "set created")
        #expect(world.catalog.fillerCards(in: set).count == 120)
        #expect(!world.catalog.headlinerHasCard(set))

        // The mascot gets a card at Common, Rare, Ultra Rare, and SIR (D1, C18).
        let rarities = try ["C", "R", "UR", "SIR"].map { try tier(world, set, $0) }
        let mascotCards = try world.createCards(in: set, rarities.map {
            CardDraft(name: "Aryla, Destined Trainee", characterID: mascot, rarity: $0)
        })
        check(world, "mascot cards")
        #expect(world.catalog.headlinerHasCard(set))
        #expect(world.catalog.fillerCards(in: set).count == 116)

        // Each starter gets a Common and a Holo Rare, with the mascot in the art.
        for id in starters {
            let name = try #require(world.character(id)?.name)
            try world.createCards(in: set, try ["C", "HR"].map {
                CardDraft(name: name, characterID: id, rarity: try tier(world, set, $0), featured: [mascot])
            })
        }
        check(world, "starter cards")
        #expect(world.catalog.cards(in: set).count == 10)
        // D1: the set screen wants 10 to 20 designed cards.
        #expect(CardSet.featuredRange.contains(world.catalog.cards(in: set).count))

        // The chase tiers that still have no cards show as warnings, but nothing blocks the print.
        var warnings = world.packWarnings(set)
        #expect(warnings.contains(.emptyOutcome(slot: 4, label: "Gold")))
        #expect(!warnings.contains { $0.blocksPrint })

        // The player adds a Gold card and an Illustration Rare, and a Double Rare.
        try world.createCard(in: set, CardDraft(name: "Aryla, Crowned", characterID: mascot, rarity: try tier(world, set, "G")))
        try world.createCard(in: set, CardDraft(name: "Cindrel, Hearth", characterID: starters[0], rarity: try tier(world, set, "IR")))
        try world.createCard(in: set, CardDraft(name: "Ripplet, Tide", characterID: starters[1], rarity: try tier(world, set, "RR")))
        check(world, "chase cards")
        warnings = world.packWarnings(set)
        #expect(warnings.isEmpty, "Every outcome now has cards: \(warnings.map(\.message))")

        // One SIR card in the set: 1 in about 77 packs. The Gold card: 1 in about 143.
        let stats = try #require(world.packStats(set))
        #expect(Int(try #require(stats.line(.tier(rarities[3]))?.singleOneIn).rounded()) == 77)
        #expect(Int(try #require(stats.line(.tier(try tier(world, set, "G")))?.singleOneIn).rounded()) == 143)

        // Secret tiers number above the printed total.
        let numbers = world.catalog.cardNumbers(in: set)
        let printed = world.catalog.allCards(in: set).filter { world.catalog.set(set)?.ladder.tier($0.rarity)?.secret != true }.count
        #expect(numbers[mascotCards[3]] == "\(printed + 2)/\(printed)" || numbers[mascotCards[3]] == "\(printed + 1)/\(printed)")

        // The whole studio survives a save and a load.
        #expect(try roundTrip(world) == world)
    }

    // MARK: - Scenario 2

    @Test("Scenario 2: a parallel pair, each half with its own size, filler, and generated cast")
    func parallelPair() throws {
        var (world, mascot, _) = try garageStudio()
        let (black, white) = try world.createParallelPair(
            SetDetails(name: "Black Bolt", code: "BLK", symbol: SetSymbol(shape: .bolt, color: .charcoal), theme: "storm", size: 90),
            SetDetails(name: "White Flare", code: "WHT", symbol: SetSymbol(shape: .sun, color: .snow), theme: "light", size: 70),
            presetID: Catalog.defaultLadderID
        )
        check(world, "pair created")
        #expect(world.catalog.fillerCards(in: black).count == 90)
        #expect(world.catalog.fillerCards(in: white).count == 70)
        let blackCast = Set(try #require(world.catalog.set(black)?.generated).map(\.id))
        let whiteCast = Set(try #require(world.catalog.set(white)?.generated).map(\.id))
        #expect(blackCast.isDisjoint(with: whiteCast))
        #expect(SetType.parallel.generatedRange.contains(blackCast.count))

        // A change to one half leaves the other half alone.
        let whiteFiller = world.catalog.fillerCards(in: white).map(\.id)
        var details = try SetDetails(from: #require(world.catalog.set(black)))
        details.size = 140
        try world.updateSet(black, details)
        try world.createCard(in: black, CardDraft(name: "Aryla, Storm Rider", characterID: mascot, rarity: try tier(world, black, "SIR")))
        try world.rerollFiller(black)
        check(world, "black half changed")
        #expect(world.catalog.fillerCards(in: white).map(\.id) == whiteFiller)
        #expect(world.catalog.set(white)?.size == 70)

        // A parallel set cannot become a main set, and codes stay unique.
        #expect(throws: CardError.parallelTypeFixed) { try world.updateSetType(white, .main) }
        details = try SetDetails(from: #require(world.catalog.set(white)))
        details.code = "BLK"
        #expect(throws: CardError.duplicateSetCode("BLK")) { try world.updateSet(white, details) }
        check(world, "after refused changes")
        #expect(try roundTrip(world) == world)
    }

    // MARK: - Scenario 3

    @Test("Scenario 3: a custom ladder and a custom pack, then a ladder change that breaks the pack")
    func customLadderAndPack() throws {
        var (world, mascot, starters) = try garageStudio()

        // The player builds a five-tier ladder: Common, Rare, Epic, Mythic, Relic.
        let ladderID = try world.createPreset(copying: Catalog.defaultLadderID, name: "Five tiers")
        var ladder = try #require(world.catalog.preset(ladderID))
        let keep = ["Common", "Rare", "Ultra Rare", "Special Illustration Rare", "Gold"]
        ladder.tiers = ladder.tiers.filter { keep.contains($0.name) }
        ladder.tiers[2].name = "Epic"
        ladder.tiers[3].name = "Mythic"
        ladder.tiers[4].name = "Relic"
        ladder.tiers[0].fillerShare = 70
        ladder.tiers[1].fillerShare = 30
        try world.updatePreset(ladder)
        check(world, "custom ladder")

        // A 6-card pack against that ladder: 4 Commons, 1 Rare, 1 hit slot.
        let packID = try world.createPackPreset(copying: Catalog.defaultPackID, name: "Six pack")
        var pack = try #require(world.catalog.packPreset(packID))
        let t = ladder.tiers.map(\.id)
        pack.ladderID = ladderID
        pack.slots = [
            PackSlot(id: 1, count: 4, outcomes: [PackOutcome(id: 1, kind: .tier(t[0]), odds: 100)]),
            PackSlot(id: 2, count: 1, outcomes: [PackOutcome(id: 1, kind: .tier(t[1]), odds: 100)]),
            PackSlot(id: 3, count: 1, outcomes: [
                PackOutcome(id: 1, kind: .tier(t[1]), odds: 80),
                PackOutcome(id: 2, kind: .tier(t[2]), odds: 15),
                PackOutcome(id: 3, kind: .tier(t[3]), odds: 4),
                PackOutcome(id: 4, kind: .tier(t[4]), odds: 1),
            ]),
        ]
        pack.boxSize = 24
        try world.updatePackPreset(pack)
        check(world, "custom pack")

        let set = try world.createSet(.mini, SetDetails(name: "Relic Hunt", code: "RLH", theme: "ancientEmpires", size: 50),
                                      presetID: ladderID, packID: packID)
        check(world, "set from custom presets")
        #expect(world.catalog.set(set)?.pack.cardCount == 6)
        let fillerCounts = world.catalog.fillerCards(in: set).reduce(into: [TierID: Int]()) { $0[$1.rarity, default: 0] += 1 }
        #expect(fillerCounts == [t[0]: 35, t[1]: 15])

        for (index, id) in ([mascot] + starters).enumerated() {
            try world.createCard(in: set, CardDraft(name: "Hero \(index)", characterID: id, rarity: t[2 + index % 3]))
        }
        check(world, "designed cards")
        #expect(world.packWarnings(set).isEmpty)
        // Relic: 1% in one slot, so 1 in 100 packs. A box of 24 has about 0.24.
        let relic = try #require(world.packStats(set)?.line(.tier(t[4])))
        #expect(abs(try #require(relic.oneIn) - 100) < 1e-9)
        #expect(abs(relic.perPack * 24 - 0.24) < 1e-9)

        // The player removes the Relic tier from the set after moving its card. The pack now points nowhere.
        let relicCard = try #require(world.catalog.cards(in: set).first { $0.rarity == t[4] })
        var draft = CardDraft(from: relicCard)
        draft.rarity = t[3]
        try world.updateCard(relicCard.id, draft)
        var setLadder = try #require(world.catalog.set(set)?.ladder)
        setLadder.tiers.removeLast()
        try world.updateSetLadder(set, setLadder)
        check(world, "tier removed")
        #expect(world.packWarnings(set).contains(.missingTier(slot: 3)))

        // The player fixes the slot: the Relic odds go to Mythic.
        var setPack = try #require(world.catalog.set(set)?.pack)
        setPack.slots[2].outcomes.removeLast()
        setPack.slots[2].outcomes[2].odds = 5
        try world.updateSetPack(set, setPack)
        check(world, "pack fixed")
        #expect(!world.packWarnings(set).contains { $0.blocksPrint })
        // The preset did not change (C10).
        #expect(world.catalog.packPreset(packID)?.slots[2].outcomes.count == 4)
        #expect(try roundTrip(world) == world)
    }

    // MARK: - Scenario 4

    @Test("Scenario 4: a new era with a gimmick, while the old era's set keeps its plain names")
    func eraChange() throws {
        var (world, mascot, starters) = try garageStudio()
        let base = try world.createSet(name: "Origins", theme: "fire", presetID: Catalog.defaultLadderID)
        let oldCard = try world.createCard(in: base, CardDraft(
            name: "Aryla, First Light", characterID: mascot, rarity: try tier(world, base, "RR"), gimmick: true
        ))
        check(world, "base era set")

        for _ in 0..<12 { world.advanceWeek() }
        let ember = try world.startEra(name: "Ember Age", gimmick: Gimmick(name: "ex", color: .ember))
        check(world, "new era")
        #expect(world.catalog.era(Era.first.id)?.endWeek == 12)
        #expect(world.catalog.currentEra.startWeek == 12)

        let next = try world.createSet(name: "Ember Rising", theme: "volcano", presetID: Catalog.defaultLadderID)
        let exCard = try world.createCard(in: next, CardDraft(
            name: "Cindrel, Blazing Heart", characterID: starters[0], rarity: try tier(world, next, "RR"), gimmick: true
        ))
        check(world, "set in new era")
        #expect(world.catalog.set(next)?.eraID == ember)
        #expect(world.catalog.displayName(try #require(world.catalog.card(exCard))) == "Cindrel ex, Blazing Heart")
        // The old set's era has no gimmick, so its card keeps its name.
        #expect(world.catalog.displayName(try #require(world.catalog.card(oldCard))) == "Aryla, First Light")

        // The player renames the gimmick. Every card of the era follows.
        try world.updateEra(ember, name: "Ember Age", gimmick: Gimmick(name: "EX", color: .crimson))
        #expect(world.catalog.displayName(try #require(world.catalog.card(exCard))) == "Cindrel EX, Blazing Heart")
        // A third era ends the Ember Age. Only one era runs at a time.
        try world.startEra(name: "Tera Tide", gimmick: nil)
        check(world, "third era")
        #expect(world.catalog.eras.count == 3)
        #expect(try roundTrip(world) == world)
    }

    // MARK: - Scenario 5

    @Test("Scenario 5: a Trainer Gallery subset with its own pack slot, then an art set, then deletions")
    func galleryAndArtSet() throws {
        var (world, mascot, starters) = try garageStudio()
        let set = try world.createSet(.main, SetDetails(name: "Gallery", code: "GAL", size: 100), presetID: Catalog.defaultLadderID)
        let ur = try tier(world, set, "UR")
        let gallery = try world.createCards(in: set, ([mascot] + starters).map { id in
            CardDraft(name: "\(world.character(id)?.name ?? "X"), Portrait", characterID: id, rarity: ur)
        })
        let line = try world.createCards(in: set, try ["C", "U", "R"].enumerated().map { index, code in
            CardDraft(name: "Stage \(index + 1)", characterID: starters[0], rarity: try tier(world, set, code))
        })
        check(world, "designed cards")

        // The subset takes the 4 portraits and gets its own outcome in slot 4.
        let tg = try world.saveSubset(set, Subset(id: 0, name: "Trainer Gallery", prefix: "TG", ownOutcome: true), cards: gallery)
        var pack = try #require(world.catalog.set(set)?.pack)
        pack.slots[3].outcomes[0].odds = 80
        pack.slots[3].outcomes.append(PackOutcome(id: 9, kind: .subset(tg), odds: 10))
        try world.updateSetPack(set, pack)
        check(world, "gallery with outcome")
        let numbers = world.catalog.cardNumbers(in: set)
        #expect(gallery.compactMap { numbers[$0] }.sorted() == ["TG01/TG04", "TG02/TG04", "TG03/TG04", "TG04/TG04"])
        // The Ultra Rare pool is empty now, because the portraits come only through the gallery.
        #expect(world.packStats(set)?.line(.tier(ur))?.pool == 0)
        #expect(world.packStats(set)?.line(.subset(tg))?.pool == 4)
        let line10 = try #require(world.packStats(set)?.line(.subset(tg)))
        #expect(abs(try #require(line10.singleOneIn) - 40) < 1e-9)

        // An art set: the three stages, in order.
        try world.saveArtSet(set, ArtSet(id: 0, name: "Cindrel line", cards: line))
        check(world, "art set")

        // A reroll of the filler keeps every designed card, the subset, and the art set.
        try world.rerollFiller(set)
        check(world, "reroll")
        #expect(world.catalog.cards(in: set).count == 7)
        #expect(world.catalog.set(set)?.artSets.first?.cards == line)
        #expect(world.catalog.cards(in: set).filter { $0.subsetID == tg }.count == 4)

        // Deleting a stage card leaves 2 cards: the art set stays. Deleting another ends it.
        try world.deleteCard(line[1])
        check(world, "one stage deleted")
        #expect(world.catalog.set(set)?.artSets.first?.cards == [line[0], line[2]])
        try world.deleteCard(line[0])
        check(world, "two stages deleted")
        #expect(world.catalog.set(set)?.artSets.isEmpty == true)

        // Deleting the subset returns its cards. The slot that gave it now blocks the print.
        try world.deleteSubset(set, tg)
        check(world, "subset deleted")
        #expect(world.packWarnings(set).contains(.missingSubset(slot: 4)))
        #expect(world.packStats(set)?.line(.tier(ur))?.pool == 4)
        #expect(try roundTrip(world) == world)
    }

    // MARK: - Scenario 6

    @Test("Scenario 6: the set fills up, the player grows it, then shrinks it to the edge")
    func sizeEdges() throws {
        var (world, mascot, _) = try garageStudio()
        let set = try world.createSet(.mini, SetDetails(name: "Tiny", code: "TNY", size: 12), presetID: Catalog.defaultLadderID)
        let common = try tier(world, set, "C")
        try world.createCards(in: set, (1...12).map { CardDraft(name: "Card \($0)", characterID: mascot, rarity: common) })
        check(world, "full set")
        #expect(world.catalog.fillerCards(in: set).isEmpty)
        #expect(world.catalog.set(set)?.generated.isEmpty == true)
        #expect(throws: CardError.setFull(12)) {
            try world.createCard(in: set, CardDraft(name: "One more", characterID: mascot, rarity: common))
        }

        // Growing the set brings filler and a generated cast back.
        var details = try SetDetails(from: #require(world.catalog.set(set)))
        details.size = 40
        try world.updateSet(set, details)
        check(world, "grown")
        #expect(world.catalog.fillerCards(in: set).count == 28)
        #expect(world.catalog.set(set)?.generated.isEmpty == false)

        // A size below the designed cards is refused. The exact edge is allowed.
        details.size = 11
        #expect(throws: CardError.sizeBelowCards(12)) { try world.updateSet(set, details) }
        details.size = 12
        try world.updateSet(set, details)
        check(world, "shrunk to the edge")
        #expect(world.catalog.fillerCards(in: set).isEmpty)
        #expect(world.catalog.set(set)?.generated.isEmpty == true)

        // Deleting a designed card frees one filler slot.
        let first = try #require(world.catalog.cards(in: set).first)
        try world.deleteCard(first.id)
        check(world, "one card deleted")
        #expect(world.catalog.fillerCards(in: set).count == 1)
        #expect(try roundTrip(world) == world)
    }

    // MARK: - Scenario 7

    @Test("Scenario 7: the same decisions on the same seed give the same world, and a new seed gives a new cast")
    func determinism() throws {
        func play(seed: UInt64) throws -> World {
            var (world, mascot, starters) = try garageStudio(seed: seed)
            let set = try world.createSet(.main, SetDetails(name: "Same", code: "SAM", theme: "pirates", size: 160),
                                          presetID: Catalog.defaultLadderID)
            try world.createCards(in: set, try ["C", "R", "SIR"].map {
                CardDraft(name: "Aryla", characterID: mascot, rarity: try tier(world, set, $0))
            })
            world.advanceWeek()
            try world.rerollFiller(set)
            try world.startEra(name: "Next", gimmick: Gimmick(name: "V"))
            let second = try world.createSet(.mini, SetDetails(name: "Second", code: "SEC", theme: "robots", size: 40),
                                             presetID: Catalog.defaultLadderID)
            try world.createCard(in: second, CardDraft(name: "Cindrel", characterID: starters[0], rarity: try tier(world, second, "RR"), gimmick: true))
            check(world, "seed \(seed)")
            return world
        }
        let a = try play(seed: 7)
        let b = try play(seed: 7)
        let c = try play(seed: 8)
        #expect(a == b)
        #expect(a.catalog.sets[0].generated.map(\.name) != c.catalog.sets[0].generated.map(\.name))
    }

    // MARK: - Scenario 8

    @Test("Scenario 8: a long session of random decisions never breaks a rule")
    func randomSession() throws {
        var (world, mascot, starters) = try garageStudio(seed: 99)
        var rng = Xoshiro256(seed: 12345)
        let cast = [mascot] + starters
        var sets: [SetID] = []
        var refused = 0

        for step in 0..<300 {
            let action = rng.int(0, 11)
            do {
                switch action {
                case 0 where sets.count < 6:
                    let size = rng.int(10, 220)
                    let theme = rng.pick(world.catalog.themes).id
                    let type: SetType = rng.chance(0.5) ? .main : .mini
                    sets.append(try world.createSet(type, SetDetails(name: "Set \(step)", code: world.catalog.suggestedCode(for: "Set \(step) X"),
                                                                     theme: theme, size: size), presetID: Catalog.defaultLadderID))
                case 1, 2:
                    guard let set = sets.randomElement(using: &rng) else { continue }
                    let ladder = try #require(world.catalog.set(set)?.ladder)
                    try world.createCard(in: set, CardDraft(name: "Card \(step)", characterID: rng.pick(cast),
                                                            rarity: rng.pick(ladder.tiers).id, gimmick: rng.chance(0.3)))
                case 3:
                    guard let set = sets.randomElement(using: &rng), let card = world.catalog.cards(in: set).randomElement(using: &rng) else { continue }
                    try world.deleteCard(card.id)
                case 4:
                    guard let set = sets.randomElement(using: &rng), let current = world.catalog.set(set) else { continue }
                    var details = SetDetails(from: current)
                    details.size = rng.int(10, 260)
                    try world.updateSet(set, details)
                case 5:
                    guard let set = sets.randomElement(using: &rng) else { continue }
                    try world.rerollFiller(set)
                case 6:
                    guard let set = sets.randomElement(using: &rng) else { continue }
                    let designed = world.catalog.cards(in: set).map(\.id)
                    let pick = designed.filter { _ in rng.chance(0.4) }
                    try world.saveSubset(set, Subset(id: 0, name: "Sub \(step)", prefix: String("ABCDEFGH".randomElement(using: &rng)!),
                                                     ownOutcome: rng.chance(0.5)), cards: pick)
                case 7:
                    guard let set = sets.randomElement(using: &rng) else { continue }
                    let designed = world.catalog.cards(in: set).map(\.id).shuffled(using: &rng)
                    try world.saveArtSet(set, ArtSet(id: 0, name: "Art \(step)", cards: Array(designed.prefix(rng.int(2, 5)))))
                case 8:
                    world.advanceWeek()
                    if rng.chance(0.2) { try world.startEra(name: "Era \(step)", gimmick: rng.chance(0.5) ? Gimmick(name: "ex") : nil) }
                case 9:
                    guard let set = sets.randomElement(using: &rng), var ladder = world.catalog.set(set)?.ladder else { continue }
                    // Move the filler shares around, and sometimes flip a secret tier.
                    let a = rng.int(0, ladder.tiers.count - 1), b = rng.int(0, ladder.tiers.count - 1)
                    let moved = min(ladder.tiers[a].fillerShare, rng.int(0, 30))
                    ladder.tiers[a].fillerShare -= moved
                    ladder.tiers[b].fillerShare += moved
                    if rng.chance(0.3) { ladder.tiers[b].secret.toggle() }
                    try world.updateSetLadder(set, ladder)
                case 10:
                    guard let set = sets.randomElement(using: &rng), var pack = world.catalog.set(set)?.pack else { continue }
                    // Move odds from the first outcome to the last in the hit slot.
                    let slot = pack.slots.count - 1
                    let moved = min(pack.slots[slot].outcomes[0].odds, Double(rng.int(0, 10)))
                    pack.slots[slot].outcomes[0].odds -= moved
                    pack.slots[slot].outcomes[pack.slots[slot].outcomes.count - 1].odds += moved
                    try world.updateSetPack(set, pack)
                default:
                    guard let set = sets.randomElement(using: &rng), let subset = world.catalog.set(set)?.subsets.randomElement(using: &rng) else { continue }
                    try world.deleteSubset(set, subset.id)
                }
            } catch {
                // A refused decision is fine. It must leave the world valid.
                refused += 1
            }
            check(world, "random step \(step), action \(action)")
        }
        #expect(sets.count >= 3)
        #expect(refused < 150, "Too many refused decisions: \(refused)")
        #expect(try roundTrip(world) == world)
    }
}
