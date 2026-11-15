// The demand algorithm (docs/design/sales.md, sections 4 to 6; decisions B4 to B6).
//
// For each audience, a set takes a lifetime share of the yearly money of the
// people who know the studio. Fourteen factors raise or lower that share. Every
// factor is visible on the algorithm screen (B12). A read never draws a random number.

import Foundation

/// One factor of an audience's demand for a set.
public struct DemandFactor: Sendable, Equatable, Identifiable {
    public let name: String
    /// 1.0 means no effect.
    public let value: Double
    /// Why the factor has this value, in one sentence.
    public let note: String
    public var id: String { name }
}

/// One audience's demand for one set, before the weekly conditions.
public struct AudienceDemand: Sendable, Equatable, Identifiable {
    public let audience: Audience
    public let reachedPeople: Double
    public let spend: Double
    public let factors: [DemandFactor]
    /// The share of one year's spend of each person who knows the studio, over the set's life.
    public let lifetimeShare: Double
    public var id: Int { audience.rawValue }

    /// The factors multiplied together.
    public var product: Double { factors.reduce(1) { $0 * $1.value } }
    /// The expected lifetime dollars, with no conditions and no stock limit.
    public var lifetimeDollars: Double { reachedPeople * spend * lifetimeShare }
}

/// The hidden favorites of one audience in one world (B5). They come from the world seed.
public struct AudiencePrefs: Sendable, Equatable {
    /// The favorite chance of a hit in one pack.
    public let hitRate: Double
    /// How much the pull rates matter, 0 to 1.
    public let hitSensitivity: Double
    /// The favorite set size (S8, S12).
    public let size: Double
    /// How much the price matters (elasticity).
    public let priceSensitivity: Double
    /// How much the gimmick matters, 0 to 1.
    public let gimmickSensitivity: Double
    /// How strongly shelf stock reaches this audience (B9).
    public let shelfAffinity: Double

    static func base(_ audience: Audience) -> (hit: Double, hitS: Double, size: Double, price: Double, gimmick: Double, shelf: Double) {
        switch audience {
        case .kids: (0.15, 0.4, 80, 1.2, 0.8, 1.0)
        case .parents: (0.15, 0.2, 80, 1.0, 0.3, 0.8)
        case .teens: (0.25, 0.6, 150, 1.0, 0.8, 0.5)
        case .casualPlayers: (0.2, 0.3, 120, 0.8, 0.4, 0.4)
        case .competitivePlayers: (0.15, 0.3, 180, 0.4, 0.2, 0.2)
        case .nostalgiaAdults: (0.15, 0.3, 100, 0.5, 0.2, 0.2)
        case .completionists: (0.2, 0.3, 250, 0.6, 0.2, 0.2)
        case .chaseCollectors: (0.35, 1.0, 200, 0.3, 0.6, 0.2)
        case .artCollectors: (0.2, 0.3, 150, 0.3, 0.1, 0.1)
        case .investors: (0.3, 0.8, 200, 0.2, 0.3, 0.1)
        case .resellers: (0.3, 0.8, 150, 0.0, 0.3, 0.1)
        }
    }
}

extension World {
    /// A value from the world seed for one audience and one key, 0 ..< 1. Fixed for the world.
    func fixedUnit(_ audience: Audience, _ key: UInt64) -> Double {
        var mixer = SplitMix64(seed: Self.streamSeed(seed, stream: 7) ^ (UInt64(audience.rawValue + 1) &* 0x9E37_79B9_7F4A_7C15) ^ (key &* 0xBF58_476D_1CE4_E5B9))
        return mixer.unit()
    }

    /// The hidden favorites of an audience (B5).
    public func prefs(_ audience: Audience) -> AudiencePrefs {
        let b = AudiencePrefs.base(audience)
        // Each world moves the hit rate and the size by up to about 25%.
        let hit = b.hit * exp((fixedUnit(audience, 1) - 0.5) * 0.5)
        let size = b.size * exp((fixedUnit(audience, 2) - 0.5) * 0.5)
        return AudiencePrefs(hitRate: hit, hitSensitivity: b.hitS, size: size, priceSensitivity: b.price,
                             gimmickSensitivity: b.gimmick, shelfAffinity: b.shelf)
    }

    /// The hidden fit between a theme and an audience, 0.80 to 1.20 (B5, B15).
    public func themeFit(_ theme: ThemeID, _ audience: Audience) -> Double {
        var key: UInt64 = 1469598103934665603
        for byte in theme.utf8 { key = (key ^ UInt64(byte)) &* 1099511628211 }
        return 0.8 + 0.4 * fixedUnit(audience, key)
    }

    // MARK: - The algorithm

    /// Every audience's demand for a set, at a pack price. Resellers come last:
    /// they follow the stock gap, not a lifetime share (B7).
    public func setDemand(_ setID: SetID, packPrice: Double) -> [AudienceDemand] {
        guard let set = catalog.set(setID) else { return [] }
        let context = DemandContext(world: self, set: set)
        return Audience.allCases.map { audience in
            let s = market.state(audience)
            if audience == .resellers {
                return AudienceDemand(audience: audience, reachedPeople: s.reachedPeople, spend: s.spend, factors: [
                    DemandFactor(name: "The stock gap", value: 1, note: "Resellers do not need to know you. In release weeks 0 and 1 they take up to half of the stock when the other audiences want more than you printed."),
                ], lifetimeShare: 0)
            }
            let factors = context.factors(audience, packPrice: packPrice)
            let share = min(Self.maxShare, Self.baseShare * factors.reduce(1) { $0 * $1.value })
            return AudienceDemand(audience: audience, reachedPeople: s.reachedPeople, spend: s.spend, factors: factors, lifetimeShare: share)
        }
    }

    /// B4: a normal set takes 25% of one year's spend over its life, with a ceiling of 90%.
    public static let baseShare = 0.25
    public static let maxShare = 0.9
}

/// The parts of a set that the factors read. Built once for each set.
private struct DemandContext {
    let world: World
    let set: CardSet
    let designed: [Card]
    let filler: [Card]
    let headlinerID: CharacterID?
    let hitChance: Double
    let rarestSingle: Double?
    let gimmickShare: Double
    let artShare: Double
    /// The average artist fame of the designed cards, 0 to 1: popularity or legacy,
    /// whichever is higher. Founder art counts as 0.2 until the founder has legacy.
    let artistScore: Double
    /// The share of designed cards whose artist's style matches the character's personality.
    let styleShare: Double
    let founderShare: Double
    /// The legend who comes back after a gap, with the highest legacy (K10).
    let returning: Artist?
    /// The hot cards, 0 to 3 (K12): each designed card adds its heat / 100, and the
    /// lead's filler adds 5% of a card each. It does not average out.
    let hotCards: Double
    /// The value of the singles in one pack (M1). Nil for a set with no release plan.
    let packValue: Double?

    static let artLayouts: Set<CardLayout> = [.fullArt, .borderless, .frameBreak, .showcase, .extendedArt]

    init(world: World, set: CardSet) {
        self.world = world
        self.set = set
        let designed = world.catalog.cards(in: set.id)
        self.designed = designed
        filler = world.catalog.fillerCards(in: set.id)
        headlinerID = set.headliner.flatMap { h in designed.contains { $0.characterID == h.characterID } ? h.characterID : nil }
        let rip = TestRip(pack: set.pack, ladder: set.ladder, cards: world.catalog.allCards(in: set.id), subsets: set.subsets)
        var none = 1.0
        for slot in rip.pack.slots {
            let p = slot.outcomes.filter { rip.isHit($0.kind) }.reduce(0) { $0 + $1.odds } / 100
            none *= pow(1 - min(1, p), Double(slot.count))
        }
        hitChance = 1 - none
        rarestSingle = rip.stats.lines.compactMap(\.singleOneIn).max()
        gimmickShare = designed.isEmpty ? 0 : Double(designed.filter(\.gimmick).count) / Double(designed.count)
        artShare = designed.isEmpty ? 0 : Double(designed.filter { card in
            set.ladder.tier(card.rarity).map { Self.artLayouts.contains($0.look.layout) } ?? false
        }.count) / Double(designed.count)
        let talent = world.talent
        let count = Double(max(1, designed.count))
        artistScore = designed.reduce(0) { $0 + (talent.artist(world.artistID(of: $1)).map(world.fame) ?? World.founderPopularity) } / count / 100
        styleShare = Double(designed.filter { card in
            guard let artist = talent.artist(world.artistID(of: card)), let style = artist.style,
                  let c = world.character(card.characterID) else { return false }
            return style == c.archetype
        }.count) / count
        founderShare = Double(designed.filter { world.artistID(of: $0) == Artist.founderID }.count) / count
        returning = world.returningLegends(set.id).first
        packValue = set.release == nil ? nil : world.packValue(set.id)
        let leadFillerHeat: Double = set.leadArt.map { lead in
            0.5 * (lead.heat ?? 0) + 0.5 * (talent.artist(lead.artistID)?.heat(at: world.week) ?? 0)
        } ?? 0
        hotCards = min(3, designed.reduce(0) { $0 + world.cardHeat($1) / 100 } + 0.05 * Double(filler.count) * leadFillerHeat / 100)
    }

    func factors(_ audience: Audience, packPrice: Double) -> [DemandFactor] {
        let prefs = world.prefs(audience)
        var list: [DemandFactor] = []
        func add(_ name: String, _ value: Double, _ note: String) {
            list.append(DemandFactor(name: name, value: min(3, max(0.3, value)), note: note))
        }

        // Characters: the average card appeal. The headliner counts three times, filler a fifth.
        var total = 0.0, weight = 0.0
        for card in designed + filler {
            guard let appeal = world.cardAppeal(card, audience) else { continue }
            let w = card.filler ? 0.2 : (card.characterID == headlinerID ? 3 : 1)
            total += appeal * w
            weight += w
        }
        let appeal = weight > 0 ? total / weight : 0
        add("Characters", exp((appeal - 33) / 67),
            "The cards' average appeal for \(audience.name.lowercased()) is \(Int(appeal.rounded())) on a scale of -50 to 100. 33 is normal.")

        // Fame: how well the audience knows the set's characters.
        let ids = Set(designed.compactMap(\.characterID))
        let known = ids.isEmpty ? 0 : ids.compactMap { world.character($0)?.awareness[audience] }.reduce(0, +) / Double(ids.count)
        add("Fame", 1 + 0.8 * known, "\(Int((known * 100).rounded()))% of the audience knows the set's characters.")

        // Pull rates: the chance of a hit against the audience's favorite rate.
        let h = max(0.01, hitChance)
        let bell = exp(-pow(log(h / prefs.hitRate), 2) / (2 * 0.6 * 0.6))
        add("Pull rates", 1 + prefs.hitSensitivity * (bell - 0.5) * 0.8,
            "A hit in \(Int((hitChance * 100).rounded()))% of packs. This audience likes about \(Int((prefs.hitRate * 100).rounded()))%.")

        // A grail: a single card rarer than 1 in 300 packs.
        if audience == .chaseCollectors || audience == .investors {
            if let rarest = rarestSingle, rarest >= 300 {
                add("A grail", 1.15, "The rarest single card comes in 1 of \(Int(rarest.rounded()).formatted()) packs. A true grail draws them.")
            } else {
                add("A grail", 0.9, "No single card is rarer than 1 in 300 packs, so the set has no grail.")
            }
        }

        // Rarity feel (C23): a rarer tier that looks less rare than a more common tier.
        if audience == .chaseCollectors {
            let used = Set((designed + filler).map(\.rarity))
            let inversions = RarityFeel.inversions(set.ladder, only: used)
            let note = inversions.isEmpty
                ? "Each tier with cards feels rarer than the tiers below it."
                : inversions.map { "\($0.tier.name) feels less rare than \($0.below.name)" }.joined(separator: ". ") + "."
            add("Rarity feel", RarityFeel.demandFactor(inversions: inversions.count), note)
        }

        // Completion: how hard the set is to finish.
        if audience == .completionists {
            let rarest = rarestSingle ?? 0
            let value = rarest < 200 ? 1.1 : rarest < 1000 ? 1.0 : rarest < 3000 ? 0.85 : 0.7
            add("Completion", value, "The rarest single card comes in 1 of \(Int(rarest.rounded()).formatted()) packs. Rarer singles make the set harder to finish.")
        }

        // Set size against the favorite size.
        let sizeBell = exp(-pow(log(Double(set.size) / prefs.size), 2) / (2 * 0.5 * 0.5))
        add("Set size", 0.75 + 0.35 * sizeBell, "\(set.size) cards. This audience likes about \(Int(prefs.size.rounded())).")

        // Theme.
        if let theme = set.theme {
            let name = world.catalog.theme(theme)?.name ?? theme
            add("Theme", world.themeFit(theme, audience), "The hidden fit of \(name) with this audience.")
        } else {
            add("Theme", 0.9, "The set has no theme, so it feels bland.")
        }

        // Gimmick: the lift grows with the studio's size, and it fades with each set of the era.
        if let gimmick = world.catalog.gimmick(of: set.id), gimmickShare > 0 {
            let popularity = min(1, world.market.studioShare / 0.01)
            let earlier = world.catalog.sets.filter { $0.eraID == set.eraID && $0.id < set.id && $0.type != .promo }.count
            let freshness = 1 / (1 + 0.25 * Double(earlier))
            let lift = gimmickShare * prefs.gimmickSensitivity * (0.25 * popularity * freshness - 0.05)
            add("Gimmick", 1 + lift,
                "\(Int((gimmickShare * 100).rounded()))% of the cards carry \(gimmick.name). The lift grows with your studio's size. A small studio gets little, and it can lose a little.")
        }

        // Art.
        if audience == .artCollectors {
            let artSets = min(3, set.artSets.count)
            add("Art", 0.8 + 0.6 * artShare + 0.1 * Double(artSets),
                "\(Int((artShare * 100).rounded()))% of the designed cards use an art layout. \(set.artSets.count) art sets.")
        } else if audience == .chaseCollectors, !set.artSets.isEmpty {
            add("Art sets", 1 + 0.05 * Double(min(3, set.artSets.count)), "\(set.artSets.count) art sets. Collectors chase the whole strip.")
        }

        // Artists (costs.md, section 4.4).
        let artistNote = "The artists' average fame is \(Int((artistScore * 100).rounded())) of 100."
            + (founderShare > 0 ? " \(Int((founderShare * 100).rounded()))% of the cards use founder art." : "")
        switch audience {
        case .artCollectors: add("Artists", 0.6 + 1.2 * artistScore, artistNote)
        case .chaseCollectors: add("Artists", 0.85 + 0.45 * artistScore, artistNote)
        default: add("Artists", 0.95 + 0.15 * artistScore, artistNote)
        }
        // A legend returns (K10): a big deal for collectors, and news for everyone.
        if let legend = returning {
            let l = legend.legacy / 100
            let lift = audience == .artCollectors ? 0.6 : audience == .chaseCollectors ? 0.4 : 0.1
            add("Legend returns", 1 + lift * l,
                "\(legend.name) is back after a gap. Legacy \(Int(legend.legacy.rounded())) of 100.")
        }
        // Singles (M1): the pulls' value against the pack price. Half the price is normal.
        if let value = packValue, audience == .chaseCollectors || audience == .investors {
            let ratio = max(0.01, value / max(0.01, packPrice))
            add("Singles", min(1.6, max(0.8, 1 + 0.25 * log2(ratio / 0.5))),
                "The singles in one pack are worth \(String(format: "$%.2f", value)) on average, against a pack price of \(String(format: "$%.2f", packPrice)).")
        }

        // Hot artists (K12): one hot card is enough to matter.
        if hotCards >= 0.05 {
            let lift: Double = switch audience {
            case .artCollectors: 0.3
            case .chaseCollectors: 0.25
            case .investors, .resellers: 0.15
            default: 0.05
            }
            add("Hot artist", 1 + lift * hotCards,
                "Cards by hot artists count as \(String(format: "%.1f", hotCards)) hot cards, of 3 at most.")
        }
        if styleShare > 0 {
            add("Style fit", 1 + 0.1 * styleShare,
                "\(Int((styleShare * 100).rounded()))% of the cards have an artist whose style matches the character's personality.")
        }

        // Factions (L4): presence × fans × fame × the beat, plus rivalry and the arc.
        let presence = world.presence(set.id)
        if !presence.isEmpty || set.story != nil {
            let lore = world.lore
            let story = set.story
            var lift = 0.0
            var parts: [String] = []
            for (f, share) in presence.sorted(by: { $0.value > $1.value }) {
                guard let faction = lore.faction(f) else { continue }
                var beat = 1.0
                if let story, let index = story.factions.firstIndex(of: f) {
                    beat = switch story.beat {
                    case .war: 1.5
                    case .alliance: story.factions.count == 2 && lore.relation(story.factions[0], story.factions[1]) < -20 ? 1.6 : 1.2
                    case .betrayal: index == 0 ? 0.8 : 1.4
                    case .rise: 1.5
                    case .fall: 0.6
                    case .discovery: 1.3
                    }
                }
                let part = share * faction.fans(audience) / 100 * (0.3 + 0.7 * faction.fame[audience]) * beat * 0.5
                lift += part
                parts.append("\(faction.name) \(part >= 0 ? "+" : "")\(Int((part * 100).rounded()))%")
            }
            // Rivalry: two sworn enemies in one set draw both fan groups.
            let present = presence.filter { $0.value >= 0.15 }.map(\.key)
            let rival = present.contains { a in present.contains { b in a < b && lore.relation(a, b) < -50 } } || story?.beat == .war
            if rival {
                lift += 0.08
                parts.append("rivalry +8%")
            }
            // The arc: earlier chapters with the same factions build anticipation.
            let earlier = lore.timeline.filter { $0.setID != set.id }
            let involved = Set(story?.factions ?? Array(presence.keys))
            var arc = 0
            for chapter in earlier.reversed() {
                let factions = Set(chapter.story?.factions ?? Array(chapter.presence.keys))
                if factions.isDisjoint(with: involved) { break }
                arc += 1
            }
            if arc > 0 {
                let value = arc <= 4 ? 0.06 * Double(min(3, arc)) : 0.18 - 0.05 * Double(arc - 4)
                lift += value
                parts.append("arc of \(arc + 1) sets \(value >= 0 ? "+" : "")\(Int((value * 100).rounded()))%")
            }
            if let last = earlier.last?.story, let story {
                if last.beat == .betrayal, last.factions.count == 2, story.factions.contains(last.factions[1]) {
                    lift += 0.1
                    parts.append("the revenge +10%")
                } else if last.beat == .fall, story.beat == .rise, story.factions == last.factions {
                    lift += 0.15
                    parts.append("the return +15%")
                }
            }
            add("Groups", 1 + lift, parts.isEmpty ? "No group on the cards." : parts.joined(separator: ", ") + ".")
        }

        // Hype: the buzz of the set's characters, for example after a change (L7).
        let buzz = ids.isEmpty ? 0 : ids.compactMap { world.character($0)?.buzz }.reduce(0, +) / Double(ids.count)
        if buzz >= 1 {
            add("Hype", 1 + buzz / 250, "The set's characters have an average buzz of \(Int(buzz.rounded())) of 100.")
        }

        // Subsets with their own pack outcome.
        let own = set.subsets.filter(\.ownOutcome).count
        if own > 0, audience == .completionists || audience == .chaseCollectors {
            add("Subsets", 1 + 0.08 * Double(min(2, own)), "\(own) subsets with their own pack outcome, like a Trainer Gallery.")
        }

        // Headliner.
        if [.kids, .parents, .teens, .casualPlayers].contains(audience) {
            if headlinerID != nil {
                add("Headliner", 1.1, "A headliner with a card in the set puts a face on the box.")
            } else if audience == .kids || audience == .parents {
                add("Headliner", 0.9, "No headliner with a card in the set, so the box has no face.")
            }
        }

        // Set type.
        switch set.type {
        case .promo:
            let value: Double = switch audience {
            case .kids, .parents: 1.3
            case .completionists: 1.1
            case .chaseCollectors, .investors: 0.6
            case .competitivePlayers: 0.5
            default: 1.0
            }
            if value != 1 { add("Set type", value, "A promo set is cheap and small. It suits kids and parents, not collectors.") }
        case .mini:
            if [.chaseCollectors, .investors, .nostalgiaAdults].contains(audience) {
                add("Set type", 1.2, "A special set draws collectors.")
            }
        case .parallel:
            if audience == .chaseCollectors || audience == .completionists {
                add("Set type", 1.15, "Collectors want both halves of a parallel pair.")
            } else if audience == .kids || audience == .parents {
                add("Set type", 0.85, "Kids and parents split their money between the two halves.")
            }
        case .main:
            break
        }

        // Price.
        if prefs.priceSensitivity > 0 {
            let value = pow(Pricing.defaultPackPrice / packPrice, prefs.priceSensitivity)
            add("Price", value, String(format: "$%.2f a pack against a normal $%.2f.", packPrice, Pricing.defaultPackPrice))
        }

        // No game: the cards have no game rules (C3).
        if audience == .competitivePlayers {
            add("No game", 0.3, "Your cards have no game rules, so competitive players buy little.")
        } else if audience == .casualPlayers {
            add("No game", 0.7, "Your cards have no game rules, so casual players buy less.")
        }
        return list
    }
}

// MARK: - Buying rhythms (B6)

/// How each audience spreads its lifetime demand over 52 weeks from release.
public enum Rhythm {
    public static let weeks = 52

    /// The share of the lifetime demand in a week since release. The weights add up to 1.
    public static func weight(_ audience: Audience, week: Int) -> Double {
        guard (0..<weeks).contains(week) else { return 0 }
        return table[audience.rawValue][week]
    }

    private static let table: [[Double]] = Audience.allCases.map(curve)

    private static func curve(_ audience: Audience) -> [Double] {
        let (front, halfLife, delayed): (Double, Double, Bool) = switch audience {
        case .resellers: (1.0, 1, false)
        case .chaseCollectors: (0.5, 3, false)
        case .competitivePlayers: (0.5, 4, false)
        case .investors: (0.4, 8, false)
        case .teens: (0.25, 6, false)
        case .completionists: (0.2, 20, false)
        case .casualPlayers: (0.1, 20, false)
        case .artCollectors: (0.05, 4, true)
        case .kids: (0.05, 30, false)
        case .parents: (0.05, 30, false)
        case .nostalgiaAdults: (0.05, 26, false)
        }
        var rest = (0..<weeks).map { w -> Double in
            let decay = pow(0.5, Double(w) / halfLife)
            return delayed ? Double(w) * decay : decay
        }
        let sum = rest.reduce(0, +)
        rest = rest.map { $0 / sum * (1 - front) }
        rest[0] += front * 0.7
        rest[1] += front * 0.3
        return rest
    }
}
