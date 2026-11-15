// Singles: the value of each card on the secondary market (decisions M1 to M4,
// docs/design/singles.md).
//
// A single is one card in one version. Its price is the demand for it now,
// divided by the copies that exist:
//
//   copies = packs opened × the single's copies per pack × survival
//   wanted = today's collectors × 1% × character now × nostalgia × look and artist
//            × the last card of an old state × the competition from newer cards
//   price  = $5 × (wanted / copies)^0.8, at least $0.10
//
// So an old card from a small print run can be worth far more than a modern card
// with a richer look from a huge print run. A price is a read. It never draws a
// random number: the weekly wobble comes from a hash of the card and the week.

import Foundation

/// One card in one version: the thing that collectors buy and sell.
public struct SingleKey: Hashable, Sendable {
    public let cardID: CardID
    public let version: VersionKey

    /// A stable text key for the saved price history.
    var storageKey: String {
        switch version {
        case .base: "\(cardID)-b"
        case .tier(let v): "\(cardID)-t\(v)"
        case .own(let v): "\(cardID)-o\(v)"
        }
    }
}

/// The value of one single now.
public struct Single: Sendable, Identifiable, Equatable {
    public let key: SingleKey
    public let setID: SetID
    /// FLAVOR. The card's name.
    public let name: String
    /// FLAVOR. "Base", or the version name, for example "Reverse holo".
    public let versionName: String
    /// Dollars.
    public let price: Double
    /// The copies that exist now.
    public let copies: Double
    /// The copies that collectors want now.
    public let wanted: Double
    /// Copies of this single in one pack, on average.
    public let perPack: Double

    public var id: String { key.storageKey }
}

/// The saved part of the singles market: a short price history for the top singles,
/// and the price milestones that the news already reported.
public struct SinglesState: Codable, Sendable, Equatable {
    /// The weekly price of each tracked single, oldest first. At most `historyWeeks` values.
    public internal(set) var history: [String: [Double]] = [:]
    /// The highest milestone in dollars that the news reported for each single.
    var milestones: [String: Double] = [:]

    public static let historyWeeks = 13
    /// The singles that each set tracks in the history.
    public static let trackedPerSet = 10
    static let milestoneSteps: [Double] = [100, 250, 500, 1_000, 2_500, 5_000, 10_000]
}

extension World {
    // Tuning (M2). The design doc gives the reasons.
    static let singlesRefPrice = 5.0
    static let singlesExponent = 0.8
    static let singlesFloor = 0.10
    /// The share of the collectors who want one specific single, before the factors.
    static let singlesWantShare = 0.01
    /// Each year out of print, this share of the copies is lost, played, or damaged.
    static let singlesYearlyLoss = 0.06
    /// Collectors who care about singles, as a weight of each audience's reached people.
    static let singlesCollectors: [Audience: Double] = [
        .chaseCollectors: 1.0, .artCollectors: 0.5, .investors: 0.7, .completionists: 0.3, .teens: 0.1,
    ]

    public var singlesMarket: SinglesState { singlesState ?? SinglesState() }

    /// Today's collectors of singles: reached people, weighted by audience.
    public var singlesCollectorCount: Double {
        Self.singlesCollectors.reduce(0) { $0 + market.state($1.key).reachedPeople * $1.value }
    }

    /// The copies of each single in one pack, on average, from the set's pull rates.
    public func copiesPerPack(_ setID: SetID) -> [SingleKey: Double] {
        guard let set = catalog.set(setID), let rip = testRip(setID) else { return [:] }
        let cards = catalog.allCards(in: setID)
        var result: [SingleKey: Double] = [:]
        for line in rip.stats.lines where line.perPack > 0 {
            let pool = TestRip.pool(line.kind, ladder: set.ladder, cards: cards, subsets: set.subsets)
            guard !pool.isEmpty else { continue }
            let each = line.perPack / Double(pool.count)
            for (cardID, version) in pool { result[SingleKey(cardID: cardID, version: version), default: 0] += each }
        }
        return result
    }

    /// The packs whose cards are out in the world. Before the release, the market
    /// guesses from the print run. After it, the opened packs count, at least 20% of the print.
    func packsInWorld(_ release: SetRelease) -> Double {
        let printed = Double(release.printedPacks)
        if week < release.releaseWeek { return printed }
        return max(0.2 * printed, printed - release.stockPacks)
    }

    /// The share of the copies that still exist (M2). Copies are lost over the years
    /// since the last print.
    func survival(_ release: SetRelease) -> Double {
        let last = max(release.releaseWeek, release.lastPrintWeek ?? 0)
        let years = Double(max(0, week - last)) / 52
        return exp(-Self.singlesYearlyLoss * years)
    }

    /// Nostalgia grows with the years since the release. The first era's sets gain more (M2).
    func nostalgia(_ set: CardSet) -> Double {
        guard let release = set.release else { return 1 }
        let years = Double(max(0, week - release.releaseWeek)) / 52
        let first = catalog.eras.first?.id == set.eraID
        return 1 + min(3, 0.3 * years) * (first ? 1.5 : 1)
    }

    /// The character factor now: today's appeal, fame, and buzz with collectors (M2).
    func characterNow(_ card: Card) -> Double {
        guard let c = character(card.characterID) else { return 1 }
        let appeal = ((cardAppeal(card, .chaseCollectors) ?? 33) + (cardAppeal(card, .artCollectors) ?? 33)) / 2
        let known = (c.awareness[.chaseCollectors] + c.awareness[.artCollectors]) / 2
        return exp((appeal - 33) / 67) * (1 + known) * (1 + c.buzz / 200)
    }

    /// The look of a single and the fame of its artist. A small weight (M2).
    func lookAndArtist(_ card: Card, _ version: VersionKey, ladder: RarityLadder) -> Double {
        var feel = 0
        if var tier = ladder.tier(card.rarity) {
            if case .tier(let v) = version, let entry = tier.versions.first(where: { $0.id == v }) {
                tier.look = entry.look
                tier.frameStyle = entry.frameStyle
            }
            feel = RarityFeel.score(tier)
        }
        let artist = talent.artist(artistID(of: card))
        let legacy = (artist?.legacy ?? 0) / 100
        let heat = (artist?.heat(at: week) ?? 0) / 100
        return (1 + 0.02 * Double(feel)) * (1 + 0.3 * legacy + 0.3 * heat)
    }

    /// The last cards of a character before a change gain value (L7, M2).
    func lastCardBonus(_ cardID: CardID) -> Double {
        lore.timeline.contains { $0.changes.contains { $0.lastCards.contains(cardID) } } ? 1.3 : 1
    }

    /// Newer released cards of the same character take a small part of the demand (M4).
    func competition(_ card: Card, after release: Int) -> Double {
        let newer = catalog.cards.filter { other in
            !other.filler && other.characterID == card.characterID && other.id != card.id
                && (other.setID.flatMap { catalog.set($0)?.release?.releaseWeek } ?? .min) > release
                && (other.setID.flatMap { catalog.set($0)?.release } != nil)
        }.count
        return max(0.7, 1 / (1 + 0.05 * Double(newer)))
    }

    /// A small weekly wobble from -5% to +5%. A hash, so a read draws no random number.
    func wobble(_ key: SingleKey) -> Double {
        var mixer = SplitMix64(seed: seed ^ UInt64(truncatingIfNeeded: key.storageKey.hashValueStable) ^ (UInt64(week) &* 0x9E37_79B9_7F4A_7C15))
        let unit = Double(mixer.next() >> 11) / Double(1 << 53)
        return 1 + 0.1 * (unit - 0.5)
    }

    /// Every single of a set, most valuable first. Empty for a set with no release plan.
    public func singles(in setID: SetID) -> [Single] {
        guard let set = catalog.set(setID), let release = set.release else { return [] }
        let perPack = copiesPerPack(setID)
        let packs = packsInWorld(release) * survival(release)
        let collectors = singlesCollectorCount
        let nostalgia = nostalgia(set)
        var result: [Single] = []
        for (key, rate) in perPack {
            guard let card = catalog.card(key.cardID) else { continue }
            let copies = max(1, packs * rate)
            let wanted = collectors * Self.singlesWantShare * characterNow(card) * nostalgia
                * lookAndArtist(card, key.version, ladder: set.ladder) * lastCardBonus(card.id)
                * competition(card, after: release.releaseWeek)
            let raw = Self.singlesRefPrice * pow(wanted / copies, Self.singlesExponent) * wobble(key)
            let versionName: String = switch key.version {
            case .base: "Base"
            case .tier(let v): set.ladder.tier(card.rarity)?.versions.first { $0.id == v }?.name ?? "Version"
            case .own(let v): card.ownVersions.first { $0.id == v }?.name ?? "Version"
            }
            result.append(Single(key: key, setID: setID, name: card.name, versionName: versionName,
                                 price: max(Self.singlesFloor, raw), copies: copies, wanted: wanted, perPack: rate))
        }
        return result.sorted { $0.price != $1.price ? $0.price > $1.price : $0.key.storageKey < $1.key.storageKey }
    }

    /// The most valuable singles of all sets (M3).
    public func hallOfFame(limit: Int = 10) -> [Single] {
        Array(catalog.sets.filter { $0.status == .released }.flatMap { singles(in: $0.id).prefix(limit) }
            .sorted { $0.price > $1.price }.prefix(limit))
    }

    /// The value of the singles in one pack, on average (M1).
    public func packValue(_ setID: SetID) -> Double {
        singles(in: setID).reduce(0) { $0 + $1.price * $1.perPack }
    }

    /// The price change over the last 4 weeks, as a share. Nil with no history.
    public func priceTrend(_ single: Single) -> Double? {
        guard let history = singlesMarket.history[single.key.storageKey], history.count >= 2 else { return nil }
        let past = history[max(0, history.count - 5)]
        return past > 0 ? single.price / past - 1 : nil
    }

    // MARK: - The weekly step

    /// Each week: the history of the top singles, the price news, and the fame that
    /// valuable old cards give the studio (M1, M3).
    mutating func runSinglesMarket() {
        var state = singlesMarket
        var b = business
        var fame = 0.0
        var tracked: Set<String> = []
        for set in catalog.sets where set.status == .released {
            for single in singles(in: set.id).prefix(SinglesState.trackedPerSet) {
                let key = single.key.storageKey
                tracked.insert(key)
                var h = state.history[key] ?? []
                h.append(single.price)
                if h.count > SinglesState.historyWeeks { h.removeFirst(h.count - SinglesState.historyWeeks) }
                state.history[key] = h
                let reached = SinglesState.milestoneSteps.last { single.price >= $0 } ?? 0
                if reached > (state.milestones[key] ?? 0) {
                    state.milestones[key] = reached
                    b.report(week, "\(set.name) \(single.name) (\(single.versionName)) now sells for \(Int(reached).formatted()) dollars or more.")
                }
                fame += max(0, single.price - 20).squareRoot()
            }
        }
        state.history = state.history.filter { tracked.contains($0.key) }
        singlesState = state
        businessState = b
        // Valuable singles make news in the hobby: collectors hear of the studio.
        if fame > 0 {
            var m = market
            m.addReach(.chaseCollectors, people: 0.5 * fame)
            m.addReach(.investors, people: 0.3 * fame)
            m.addReach(.artCollectors, people: 0.2 * fame)
            marketState = m
        }
    }

    /// A reprint that cuts the value of a set's top single upsets the collectors (M4).
    mutating func reactToReprint(_ setID: SetID, topBefore: Double) {
        guard topBefore >= 20, let after = singles(in: setID).first?.price, after < 0.7 * topBefore,
              let set = catalog.set(setID) else { return }
        var m = market
        m.changeGoodwill(.investors, by: goodwillLoss(-10))
        m.changeGoodwill(.chaseCollectors, by: goodwillLoss(-5))
        marketState = m
        var b = business
        b.report(week, "The reprint of \(set.name) cut its top single from \(dollars(topBefore)) to \(dollars(after)). Investors and collectors are upset.")
        businessState = b
    }
}

extension String {
    /// A hash that is the same in every run. Swift's own hashValue changes between runs.
    var hashValueStable: UInt64 {
        var h: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in utf8 { h = (h ^ UInt64(byte)) &* 0x100_0000_01b3 }
        return h
    }
}

/// "$1,234" for the news.
private func dollars(_ value: Double) -> String { "$" + Int(value.rounded()).formatted() }
