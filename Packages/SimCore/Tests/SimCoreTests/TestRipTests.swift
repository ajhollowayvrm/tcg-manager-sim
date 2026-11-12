import Foundation
import Testing
@testable import SimCore

@Suite("Test rip")
struct TestRipTests {
    /// A set with filler in C, U, and R, plus one designed card at each other tier.
    func setup(chase: Bool = true) throws -> (World, SetID, CharacterID) {
        var world = World(seed: 33, studioName: "Test")
        let aryla = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        let set = try world.createSet(name: "Base", theme: nil, presetID: Catalog.defaultLadderID)
        if chase {
            let tiers = try #require(world.catalog.set(set)?.ladder.tiers)
            try world.createCards(in: set, tiers[3...].map { CardDraft(name: "Aryla \($0.code)", characterID: aryla, rarity: $0.id) })
        }
        return (world, set, aryla)
    }

    @Test("A pack gives its card count, in slot order (P1)")
    func slotOrder() throws {
        let (world, set, _) = try setup()
        let rip = try #require(world.testRip(set))
        var rng = Xoshiro256(seed: 1)
        let pack = rip.openPack(using: &rng)
        #expect(pack.positions.count == 10)
        #expect(pack.positions.map(\.slot) == [1, 1, 1, 1, 2, 2, 2, 3, 4, 5])
        #expect(pack.pulls.count == 10)
        let commons = try #require(world.catalog.set(set)?.ladder.tiers[0].id)
        #expect(pack.pulls.prefix(4).allSatisfy { $0.kind == .tier(commons) && $0.version == .base })
    }

    @Test("A pack gives no card in the same version twice while the pool has an unused card")
    func noDuplicates() throws {
        let (world, set, _) = try setup()
        let rip = try #require(world.testRip(set))
        var rng = Xoshiro256(seed: 2)
        for _ in 0..<300 {
            let keys = rip.openPack(using: &rng).pulls.map { "\($0.cardID)-\($0.version)" }
            #expect(Set(keys).count == keys.count)
        }
    }

    @Test("A test rip is pure: the same seed gives the same pack, and the world does not change (P4)")
    func pure() throws {
        let (world, set, _) = try setup()
        let before = world
        let rip = try #require(world.testRip(set))
        var a = Xoshiro256(seed: 9)
        var b = Xoshiro256(seed: 9)
        #expect(rip.openPack(using: &a) == rip.openPack(using: &b))
        _ = rip.openBox(using: &a)
        #expect(world == before)
    }

    @Test("A version outcome gives the tier's version, and skips a card that turned it off (C16)")
    func versions() throws {
        var (world, set, aryla) = try setup()
        let common = try #require(world.catalog.set(set)?.ladder.tiers[0])
        let reverseID = common.versions[0].id
        let plain = try world.createCard(in: set, CardDraft(name: "No shine", characterID: aryla, rarity: common.id, excludedVersions: [reverseID]))
        let rip = try #require(world.testRip(set))
        var rng = Xoshiro256(seed: 3)
        let reverse = (0..<200).flatMap { _ in rip.openPack(using: &rng).pulls }.filter { $0.kind == .version("Reverse holo") }
        #expect(!reverse.isEmpty)
        #expect(reverse.allSatisfy { if case .tier = $0.version { true } else { false } })
        #expect(!reverse.contains { $0.cardID == plain })
    }

    @Test("An empty outcome gives its odds to the other outcomes in its slot (test-rip.md, section 3)")
    func emptyOutcomes() throws {
        let (world, set, _) = try setup(chase: false)
        let rip = try #require(world.testRip(set))
        // Slot 4 has only the reverse holo left, and slot 5 has only the Rare left.
        #expect(rip.pack.slots[3].outcomes.map(\.odds) == [100])
        #expect(rip.pack.slots[4].outcomes.map(\.odds) == [100])
        #expect(abs(try #require(rip.stats.line(.version("Reverse holo"))?.perPack) - 2) < 1e-9)
        var rng = Xoshiro256(seed: 4)
        #expect(rip.openPack(using: &rng).pulls.count == 10)
    }

    @Test("A slot with no cards at all gives an empty position")
    func emptySlot() throws {
        var (world, set, _) = try setup(chase: false)
        let ladder = try #require(world.catalog.set(set)?.ladder)
        var pack = try #require(world.catalog.set(set)?.pack)
        pack.slots.append(PackSlot(id: pack.nextSlotID, outcomes: [PackOutcome(id: 1, kind: .tier(ladder.tiers[8].id), odds: 100)]))
        try world.updateSetPack(set, pack)
        let rip = try #require(world.testRip(set))
        var rng = Xoshiro256(seed: 5)
        let opened = rip.openPack(using: &rng)
        #expect(opened.positions.count == 11)
        #expect(opened.positions.last == RipPosition(slot: 6, pull: nil))
    }

    @Test("A hit is an outcome that comes in fewer than 1 pack in 10")
    func hits() throws {
        let (world, set, _) = try setup()
        let rip = try #require(world.testRip(set))
        let tiers = try #require(world.catalog.set(set)?.ladder.tiers)
        let hits = tiers.filter { rip.isHit(.tier($0.id)) }.map(\.name)
        #expect(hits == ["Ultra Rare", "Illustration Rare", "Special Illustration Rare", "Gold"])
        #expect(!rip.isHit(.version("Reverse holo")))
    }

    @Test("A box opens its box size, and its counts follow the expected counts (P3)")
    func box() throws {
        let (world, set, _) = try setup()
        let rip = try #require(world.testRip(set))
        var rng = Xoshiro256(seed: 6)
        let box = rip.openBox(using: &rng)
        #expect(box.packs.count == 36)
        let commons = try #require(box.counts.first)
        #expect(commons.pulled == 144)
        #expect(commons.expected == 144)
        #expect(box.counts.reduce(0) { $0 + $1.pulled } == 360)
        #expect(box.hits.count == box.packs.flatMap(\.hits).count)
        // The rarest outcome comes first.
        let rank = Dictionary(uniqueKeysWithValues: rip.stats.lines.map { ($0.kind, $0.chance) })
        let order = box.hits.map { rank[$0.kind] ?? 0 }
        #expect(order == order.sorted())

        // Over many boxes, each mean count is near its expected count.
        let boxes = (0..<300).map { _ in rip.openBox(using: &rng) }
        for count in box.counts {
            let mean = Double(boxes.reduce(0) { $0 + ($1.counts.first { $0.kind == count.kind }?.pulled ?? 0) }) / 300
            #expect(abs(mean - count.expected) < max(0.15, count.expected * 0.05), "\(count.kind)")
        }
    }

    @Test("A blocking warning stops the test rip (test-rip.md, section 4)")
    func blocked() throws {
        var (world, set, _) = try setup(chase: false)
        var ladder = try #require(world.catalog.set(set)?.ladder)
        ladder.tiers.removeLast()
        try world.updateSetLadder(set, ladder)
        #expect(world.testRip(set) == nil)
    }
}
