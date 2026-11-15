import Testing
@testable import SimCore

/// A set with one designed card in each of the tiers 4 to 9, so every outcome of the default pack has cards.
fileprivate func richStudio() throws -> (world: World, set: SetID) {
    var (world, set, mascot) = try Fixture.studio()
    let drafts = (4...9).map { (tier: Int) in CardDraft(name: "Card \(tier)", characterID: mascot, rarity: tier) }
    try world.createCards(in: set, drafts)
    return (world, set)
}

fileprivate func rip(_ world: World, _ set: SetID) throws -> TestRip {
    try #require(world.testRip(set))
}

fileprivate func key(_ pull: Pull) -> String { "\(pull.cardID)/\(pull.version)" }

@Suite("Test rip")
struct TestRipTests {
    @Test("A set has a test rip unless it is missing or a blocking warning stops it (test-rip.md, section 4)")
    func ripAvailability() throws {
        var (world, set, _) = try Fixture.studio()
        #expect(world.testRip(999) == nil)
        #expect(world.testRip(set) != nil)
        let index = try #require(world.catalog.sets.firstIndex { $0.id == set })
        world.catalog.sets[index].pack.slots[0].outcomes[0].kind = .tier(99)
        #expect(world.testRip(set) == nil)
    }

    @Test("A pack opens in slot order, with the pack's card count, and each pull comes from its slot (P1, P2)")
    func packOrder() throws {
        let (world, set) = try richStudio()
        let test = try rip(world, set)
        let ids = Set(world.catalog.allCards(in: set).map(\.id))
        var rng = Xoshiro256(seed: 11)
        for _ in 0..<20 {
            let opened = test.openPack(using: &rng)
            #expect(opened.positions.map(\.slot) == [1, 1, 1, 1, 2, 2, 2, 3, 4, 5])
            #expect(opened.pulls.count == 10)
            for position in opened.positions {
                let pull = try #require(position.pull)
                let kinds = test.pack.slots[position.slot - 1].outcomes.map(\.kind)
                #expect(kinds.contains(pull.kind))
                #expect(ids.contains(pull.cardID))
                if case .version = pull.kind {
                    #expect(pull.version == .tier(1))
                } else {
                    #expect(pull.version == .base)
                }
            }
            #expect(opened.hits == opened.pulls.filter(\.hit))
        }
    }

    @Test("A pack gives no card twice in one version while the pool has an unused card (P1, test-rip.md, section 3)")
    func noDuplicates() throws {
        let (world, set, _) = try Fixture.studio()
        let test = try rip(world, set)
        var rng = Xoshiro256(seed: 3)
        for _ in 0..<30 {
            let keys = test.openPack(using: &rng).pulls.map(key)
            #expect(Set(keys).count == keys.count)
        }

        let state = try #require(world.catalog.set(set))
        let rares = [PackOutcome(id: 1, kind: .tier(3), odds: 100)]
        let layout = PackLayout(id: 9, name: "Tiny", ladderID: 1, slots: [PackSlot(id: 1, count: 3, outcomes: rares)])
        let small = TestRip(pack: layout, ladder: state.ladder, cards: world.catalog.allCards(in: set))
        let pulls = small.openPack(using: &rng).pulls
        #expect(pulls.count == 3)
        #expect(Set(pulls.map(key)).count == 2)
    }

    @Test("An empty outcome gives its odds to the others, and a slot with no cards shows an empty frame (test-rip.md, section 3)")
    func emptyOutcomes() throws {
        let (world, set, _) = try Fixture.studio()
        let test = try rip(world, set)
        let counts = test.pack.slots.map(\.outcomes.count)
        #expect(counts == [1, 1, 1, 1, 1])
        for slot in test.pack.slots { #expect(abs(slot.oddsSum - 100) < 1e-9) }
        #expect(test.stats.line(.tier(7)) == nil)
        let source = try #require(world.catalog.set(set)).pack
        #expect(source.slots[3].outcomes.count == 4)

        let state = try #require(world.catalog.set(set))
        let gold = [PackOutcome(id: 1, kind: .tier(9), odds: 100)]
        let common = [PackOutcome(id: 1, kind: .tier(1), odds: 100)]
        let layout = PackLayout(id: 9, name: "Gap", ladderID: 1, slots: [PackSlot(id: 1, outcomes: gold), PackSlot(id: 2, outcomes: common)])
        let gap = TestRip(pack: layout, ladder: state.ladder, cards: world.catalog.allCards(in: set))
        #expect(gap.pack.slots[0].outcomes.isEmpty)
        var rng = Xoshiro256(seed: 5)
        let opened = gap.openPack(using: &rng)
        #expect(opened.positions.count == 2)
        #expect(opened.positions[0].slot == 1)
        #expect(opened.positions[0].pull == nil)
        #expect(opened.positions[1].pull != nil)
        #expect(opened.pulls.count == 1)
    }

    @Test("A hit comes in fewer than 1 pack in 10, so Ultra Rare is a hit and Double Rare is not (P5)")
    func hitRule() throws {
        let (world, set) = try richStudio()
        let test = try rip(world, set)
        for tier in [6, 7, 8, 9] { #expect(test.isHit(.tier(tier))) }
        for tier in [1, 2, 3, 4, 5] { #expect(!test.isHit(.tier(tier))) }
        #expect(!test.isHit(.version("Reverse holo")))
        #expect(!test.isHit(.tier(99)))
        var rng = Xoshiro256(seed: 21)
        for _ in 0..<50 {
            for pull in test.openPack(using: &rng).pulls { #expect(pull.hit == test.isHit(pull.kind)) }
        }
    }

    @Test("An outcome at exactly 1 pack in 10 is not a hit (P5)")
    func hitBoundary() throws {
        let (world, set, _) = try Fixture.studio()
        let state = try #require(world.catalog.set(set))
        let outcomes = [PackOutcome(id: 1, kind: .tier(1), odds: 10), PackOutcome(id: 2, kind: .tier(2), odds: 90)]
        let layout = PackLayout(id: 9, name: "Edge", ladderID: 1, slots: [PackSlot(id: 1, outcomes: outcomes)])
        let edge = TestRip(pack: layout, ladder: state.ladder, cards: world.catalog.allCards(in: set))
        #expect(!edge.isHit(.tier(1)))
        #expect(!edge.isHit(.tier(2)))
    }

    @Test("A box opens the box size in packs, counts each outcome against its expected count, and lists hits rarest first (P3)")
    func openBox() throws {
        let (world, set) = try richStudio()
        let test = try rip(world, set)
        var rng = Xoshiro256(seed: 8)
        let box = test.openBox(using: &rng)
        #expect(box.packs.count == test.pack.boxSize)
        #expect(box.counts.map(\.kind) == test.stats.lines.map(\.kind))
        let pulled = box.counts.map(\.pulled).reduce(0, +)
        #expect(pulled == 360)
        let expected = box.counts.map(\.expected).reduce(0, +)
        #expect(abs(expected - 360) < 1e-6)
        let all = box.packs.flatMap(\.pulls)
        for count in box.counts {
            let line = try #require(test.stats.line(count.kind))
            #expect(abs(count.expected - line.perPack * 36) < 1e-9)
            #expect(count.pulled == all.filter { $0.kind == count.kind }.count)
        }
        #expect(box.hits.count == all.filter(\.hit).count)
        #expect(box.hits.allSatisfy { $0.hit })
        let chances = box.hits.compactMap { test.stats.line($0.kind)?.chance }
        #expect(chances == chances.sorted())
    }

    @Test("A pack draws by the slot odds (S2)")
    func drawFollowsOdds() throws {
        let (world, set, _) = try Fixture.studio()
        let state = try #require(world.catalog.set(set))
        let outcomes = [PackOutcome(id: 1, kind: .tier(1), odds: 70), PackOutcome(id: 2, kind: .tier(2), odds: 30)]
        let layout = PackLayout(id: 9, name: "Odds", ladderID: 1, slots: [PackSlot(id: 1, outcomes: outcomes)])
        let test = TestRip(pack: layout, ladder: state.ladder, cards: world.catalog.allCards(in: set))
        var rng = Xoshiro256(seed: 99)
        var commons = 0
        for _ in 0..<1000 {
            if test.openPack(using: &rng).pulls[0].kind == .tier(1) { commons += 1 }
        }
        #expect(commons > 650)
        #expect(commons < 750)
    }

    @Test("A version outcome gives the tier's version and never a card that turned it off (C16)")
    func versionPulls() throws {
        var (world, set, mascot) = try Fixture.studio()
        let off = try world.createCard(in: set, CardDraft(name: "Off", characterID: mascot, rarity: 3, excludedVersions: [1]))
        let state = try #require(world.catalog.set(set))
        let cards = world.catalog.allCards(in: set)
        let pool = TestRip.pool(.version("Reverse holo"), ladder: state.ladder, cards: cards, subsets: [])
        #expect(!pool.isEmpty)
        #expect(pool.allSatisfy { $0.1 == .tier(1) })
        #expect(!pool.contains { $0.0 == off })
        let base = TestRip.pool(.tier(3), ladder: state.ladder, cards: cards, subsets: [])
        #expect(base.contains { $0.0 == off })
        #expect(base.allSatisfy { $0.1 == .base })

        let test = try rip(world, set)
        var rng = Xoshiro256(seed: 4)
        for _ in 0..<100 {
            for pull in test.openPack(using: &rng).pulls {
                if case .version = pull.kind { #expect(pull.cardID != off) }
            }
        }
    }

    @Test("A rip changes nothing in the world, and the same seed gives the same pulls (P4)")
    func ripIsPure() throws {
        let (world, set) = try richStudio()
        let before = world.catalog
        let test = try rip(world, set)
        var a = Xoshiro256(seed: 1)
        var b = Xoshiro256(seed: 1)
        var c = Xoshiro256(seed: 2)
        let first = test.openBox(using: &a)
        let second = test.openBox(using: &b)
        let other = test.openBox(using: &c)
        #expect(first == second)
        #expect(first != other)
        #expect(world.catalog == before)
    }
}
