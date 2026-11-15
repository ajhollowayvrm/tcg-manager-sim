import Foundation
import Testing
@testable import SimCore

@Suite("Catalog")
struct CatalogTests {
    @Test("The default ladder has nine tiers, shares that add up to 100, and secret tiers last (C4, S4, S11)")
    func defaultLadderShape() {
        let ladder = RarityLadder.defaultLadder(id: Catalog.defaultLadderID)
        #expect(ladder.tiers.count == 9)
        #expect(Set(ladder.tiers.map(\.id)).count == 9)
        let shares = ladder.tiers.map(\.fillerShare).reduce(0, +)
        #expect(shares == 100)
        let secret = ladder.tiers.filter(\.secret).map(\.code)
        #expect(secret == ["IR", "SIR", "G"])
        let secretShares = ladder.tiers.filter(\.secret).map(\.fillerShare).reduce(0, +)
        #expect(secretShares == 0)
        #expect(ladder.rank(of: 1) == 1)
        #expect(ladder.rank(of: 9) == 9)
        #expect(ladder.rank(of: 99) == nil)
        #expect(ladder.tier(5)?.name == "Double Rare")
        #expect(ladder.nextTierID == 10)
        #expect(RarityLadder.tierRange == 2...12)
    }

    @Test("A new catalog holds the default ladder, the default pack, and the first era (C4, S6, S13)")
    func newCatalog() {
        let catalog = Catalog(seed: 1, themeSeed: 2)
        #expect(catalog.ladderPresets.map(\.id) == [Catalog.defaultLadderID])
        #expect(catalog.packPresets.map(\.id) == [Catalog.defaultPackID])
        #expect(catalog.eras == [Era.first])
        #expect(catalog.sets.isEmpty)
        #expect(catalog.cards.isEmpty)
        #expect(catalog.currentEra.id == Era.first.id)
    }

    @Test("A tier shows its symbol one to three times, and a tap cycles the count (C20)")
    func symbolCount() {
        #expect(RaritySymbol.allCases.count == 24)
        var tier = RarityTier(id: 1, name: "Rare", code: "R", symbol: .star, color: .ocean)
        #expect(tier.symbolCount == 1)
        tier.tapSymbol(.star)
        #expect(tier.symbolCount == 2)
        tier.tapSymbol(.star)
        #expect(tier.symbolCount == 3)
        tier.tapSymbol(.star)
        #expect(tier.symbolCount == 1)
        tier.tapSymbol(.star)
        tier.tapSymbol(.moon)
        #expect(tier.symbol == .moon)
        #expect(tier.symbolCount == 1)
        let high = RarityTier(id: 2, name: "High", code: "H", symbol: .star, symbolCount: 9, color: .ocean)
        let low = RarityTier(id: 3, name: "Low", code: "L", symbol: .star, symbolCount: 0, color: .ocean)
        #expect(high.symbolCount == 3)
        #expect(low.symbolCount == 1)
    }

    @Test("A look stacks foils and stamps in a fixed order, with no duplicates and no none (C22)")
    func lookStacking() {
        var look = CardLook(foils: [.gold, .holo, .holo, .none], stamps: [.serialized, .none, .signature, .signature])
        #expect(look.foils == [.holo, .gold])
        #expect(look.stamps == [.serialized, .signature])
        look.toggle(FoilPattern.cosmos)
        #expect(look.has(FoilPattern.cosmos))
        look.toggle(FoilPattern.cosmos)
        #expect(!look.has(FoilPattern.cosmos))
        look.toggle(CardStamp.eventStamp)
        #expect(look.stamps == [.serialized, .signature, .eventStamp])
        look.toggle(FoilPattern.none)
        look.toggle(CardStamp.none)
        #expect(look.foils.isEmpty)
        #expect(look.stamps.isEmpty)
        #expect(CardLook.plain.foils.isEmpty)
        #expect(CardLook(foil: .holo).foils == [.holo])
    }

    @Test("The print cost is the sum of the parts, and each stacked foil and stamp adds its own (C17, C22)")
    func printCost() {
        #expect(PrintCost.extra(for: .plain, frame: .solid) == 0)
        let full = CardLook(layout: .fullArt, foil: .holo, textured: true)
        let cost = PrintCost.extra(for: full, frame: .silver)
        #expect(abs(cost - 0.07) < 1e-9)
        let stacked = CardLook(foils: [.crackedIce, .etched], stamps: [.signature, .serialized])
        let stackedCost = PrintCost.extra(for: stacked, frame: .solid)
        #expect(abs(stackedCost - 0.295) < 1e-9)
        let one = PrintCost.extra(for: CardLook(foil: .holo), frame: .solid)
        let two = PrintCost.extra(for: CardLook(foils: [.holo, .gold]), frame: .solid)
        #expect(abs((two - one) - PrintCost.foil(.gold)) < 1e-9)
        let ladder = RarityLadder.defaultLadder(id: 1)
        let sir = ladder.tiers[7]
        #expect(abs(sir.costPerCopy - 0.08) < 1e-9)
        #expect(ladder.tiers[0].costPerCopy == 0)
        #expect(CardVersion.reverseHolo.costPerCopy == PrintCost.foil(.reverseHolo))
    }

    @Test("A card's versions are the base, the tier's extras that it kept, and its own (C16)")
    func versionList() {
        let tier = RarityLadder.defaultLadder(id: 1).tiers[0]
        let own = [CardVersion.altArt(id: 1)]
        let all = tier.versions(excluding: [], own: own).map(\.key)
        #expect(all == [.base, .tier(1), .own(1)])
        let kept = tier.versions(excluding: [1], own: own).map(\.key)
        #expect(kept == [.base, .own(1)])
        #expect(tier.baseVersion.id == CardVersion.baseID)
        #expect(tier.baseVersion.look == tier.look)
        #expect(tier.nextVersionID == 2)
        let plain = RarityLadder.defaultLadder(id: 1).tiers[4]
        #expect(plain.nextVersionID == 1)
        var draft = CardDraft(ownVersions: own)
        #expect(draft.nextOwnVersionID == 2)
        draft.ownVersions = []
        #expect(draft.nextOwnVersionID == 1)
    }

    @Test("A save from before the symbol count and the stacked looks still loads (C20, C22)")
    func oldSaveDecode() throws {
        let tier = RarityTier(id: 1, name: "Rare", code: "R", symbol: .star, color: .ocean)
        let data = try JSONEncoder().encode(tier)
        var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        json["symbol"] = "tripleStar"
        json["symbolCount"] = nil
        json["look"] = ["layout": "standard", "foil": "holo", "textured": false, "stamp": "signature"]
        let old = try JSONSerialization.data(withJSONObject: json)
        let loaded = try JSONDecoder().decode(RarityTier.self, from: old)
        #expect(loaded.symbol == .star)
        #expect(loaded.symbolCount == 3)
        #expect(loaded.look.foils == [.holo])
        #expect(loaded.look.stamps == [.signature])
        json["symbol"] = "mystery"
        let unknown = try JSONSerialization.data(withJSONObject: json)
        let fallback = try JSONDecoder().decode(RarityTier.self, from: unknown)
        #expect(fallback.symbol == .circle)
    }
}
