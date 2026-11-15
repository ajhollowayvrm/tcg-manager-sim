import Testing
@testable import SimCore

fileprivate func tier(
    _ id: Int, symbol: RaritySymbol = .circle, count: Int = 1, frame: FrameStyle = .solid,
    look: CardLook = .plain, secret: Bool = false
) -> RarityTier {
    RarityTier(id: id, name: "T\(id)", code: "T", symbol: symbol, symbolCount: count, color: .slate,
               frameStyle: frame, look: look, secret: secret)
}

fileprivate func ladder(_ tiers: [RarityTier]) -> RarityLadder {
    RarityLadder(id: 5, name: "Test", tiers: tiers)
}

@Suite("Rarity feel")
struct RarityFeelTests {
    @Test("Frame break and showcase feel below full art, and borderless feels above it (C24)")
    func layoutPoints() {
        #expect(RarityFeel.layout(.standard) == 0)
        #expect(RarityFeel.layout(.extendedArt) == 2)
        #expect(RarityFeel.layout(.showcase) == 3)
        #expect(RarityFeel.layout(.frameBreak) == 3)
        #expect(RarityFeel.layout(.fullArt) == 4)
        #expect(RarityFeel.layout(.borderless) == 5)
        #expect(RarityFeel.layout(.frameBreak) < RarityFeel.layout(.fullArt))
        #expect(RarityFeel.layout(.showcase) < RarityFeel.layout(.fullArt))
    }

    @Test("Each part of a tier gives points, and the score is their sum (C23)")
    func partsAndScore() {
        let plain = tier(1)
        #expect(RarityFeel.score(plain) == 0)
        #expect(RarityFeel.parts(plain).map(\.kind) == FeelPart.Kind.allCases)
        #expect(RarityFeel.parts(plain).allSatisfy { $0.points == 0 })

        let look = CardLook(layout: .fullArt, foil: .holo, textured: true, stamp: .signature)
        let rare = tier(2, symbol: .star, count: 2, frame: .silver, look: look, secret: true)
        let points = Dictionary(uniqueKeysWithValues: RarityFeel.parts(rare).map { ($0.kind, $0.points) })
        #expect(points[.symbol] == 3)
        #expect(points[.layout] == 4)
        #expect(points[.foil] == 2)
        #expect(points[.texture] == 2)
        #expect(points[.stamp] == 3)
        #expect(points[.frame] == 2)
        #expect(points[.secret] == 4)
        #expect(RarityFeel.score(rare) == 20)
        let sum = RarityFeel.parts(rare).map(\.points).reduce(0, +)
        #expect(RarityFeel.score(rare) == sum)
    }

    @Test("A repeated symbol, a stacked foil, and a stacked stamp each add points (C20, C22, C23)")
    func stacking() {
        let once = RarityFeel.score(tier(1, symbol: .star, count: 1))
        let thrice = RarityFeel.score(tier(1, symbol: .star, count: 3))
        #expect(thrice - once == 2)

        let single = RarityFeel.score(tier(1, look: CardLook(foil: .cosmos)))
        #expect(single == 3)
        let two = RarityFeel.score(tier(1, look: CardLook(foils: [.cosmos, .etched])))
        #expect(two == 4)
        let mixed = RarityFeel.score(tier(1, look: CardLook(foils: [.holo, .gold])))
        #expect(mixed == 6)
        let stamps = RarityFeel.score(tier(1, look: CardLook(foils: [], stamps: [.signature, .serialized])))
        #expect(stamps == 7)
    }

    @Test("The default ladder climbs, with no inversion, and the stated scores hold (C23, C24)")
    func defaultLadderClimbs() {
        let tiers = RarityLadder.defaultLadder(id: 1).tiers
        let scores = tiers.map(RarityFeel.score)
        for pair in zip(scores, scores.dropFirst()) { #expect(pair.0 <= pair.1) }
        #expect(RarityFeel.inversions(RarityLadder.defaultLadder(id: 1)).isEmpty)
        #expect(scores[0] == 0)
        #expect(RarityFeel.score(tiers[6]) == 14)
        #expect(RarityFeel.score(tiers[7]) == 18)
        #expect(RarityFeel.score(tiers[7]) > RarityFeel.score(tiers[6]))
    }

    @Test("An upgrade lists the parts that give more, and a downgrade lists the parts that give less (C23)")
    func change() {
        let gold = RarityLadder.defaultLadder(id: 1).tiers[8]
        let rare = RarityLadder.defaultLadder(id: 1).tiers[2]
        let up = RarityFeel.change(from: rare, to: gold)
        let upKinds = up.up.map(\.kind)
        #expect(upKinds.contains(.layout))
        #expect(upKinds.contains(.foil))
        #expect(upKinds.contains(.secret))
        #expect(up.down.isEmpty)
        let down = RarityFeel.change(from: gold, to: rare)
        #expect(down.up.isEmpty)
        let foil = down.down.first { $0.kind == .foil }
        #expect(foil?.points == 5)
        #expect(RarityFeel.change(from: gold, to: gold).up.isEmpty)
        #expect(RarityFeel.change(from: gold, to: gold).down.isEmpty)
    }

    @Test("A rarer tier that feels less rare than a more common tier is an inversion (C23)")
    func inversions() {
        let flashy = tier(2, symbol: .crown, look: CardLook(layout: .fullArt, foil: .gold))
        let list = ladder([tier(1), flashy, tier(3), tier(4, look: CardLook(foil: .rainbow))])
        let found = RarityFeel.inversions(list)
        #expect(found.map(\.tier.id) == [3, 4])
        #expect(found.map(\.below.id) == [2, 2])

        let only = RarityFeel.inversions(list, only: [1, 2, 4])
        #expect(only.map(\.tier.id) == [4])
        let onlyEnds = RarityFeel.inversions(list, only: [1, 3])
        #expect(onlyEnds.isEmpty)
        let equal = ladder([tier(1, look: CardLook(foil: .holo)), tier(2, look: CardLook(foil: .holo))])
        #expect(RarityFeel.inversions(equal).isEmpty)
    }

    @Test("Chase demand drops 8% for each inversion, down to 70% (C23)")
    func demandFactor() {
        #expect(RarityFeel.demandFactor(inversions: 0) == 1)
        #expect(abs(RarityFeel.demandFactor(inversions: 1) - 0.92) < 1e-9)
        #expect(abs(RarityFeel.demandFactor(inversions: 3) - 0.76) < 1e-9)
        #expect(RarityFeel.demandFactor(inversions: 4) == 0.7)
        #expect(RarityFeel.demandFactor(inversions: 20) == 0.7)
    }
}
