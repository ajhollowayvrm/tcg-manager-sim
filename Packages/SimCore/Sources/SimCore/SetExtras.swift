// Eras and gimmicks, subsets, art sets, and card numbers
// (docs/design/sets.md, section 6; decisions S7, S10, S11, S13, S14).

public typealias EraID = Int
public typealias SubsetID = Int
public typealias ArtSetID = Int

/// A named mark that the game puts on some cards, for example "ex" (D3, S7).
/// Cards are for collecting only (C3), so a gimmick is a name and a look.
public struct Gimmick: Codable, Sendable, Equatable, Hashable {
    /// FLAVOR. "ex", "Mega", "Tera". The card name gets it: "Aryla ex, Destined Trainee".
    public var name: String
    /// FLAVOR. The color of the gimmick badge on the card.
    public var color: PaletteColor

    public static let nameLimit = 12

    public init(name: String, color: PaletteColor = .gold) {
        self.name = name
        self.color = color
    }
}

/// A named period with a start, an end, and one gimmick (S7). The player starts
/// and ends an era. One era runs at a time (S13).
public struct Era: Codable, Sendable, Equatable, Identifiable {
    public let id: EraID
    /// FLAVOR.
    public internal(set) var name: String
    /// Nil means no gimmick. Reader: the gimmick on the era's cards. Gimmick
    /// freshness and the early-gimmick effect (market, not built yet; S13).
    public internal(set) var gimmick: Gimmick?
    /// Reader: gimmick freshness (market, not built yet).
    public let startWeek: Int
    /// Nil while the era runs. Reader: nostalgia for the era's sets (market, not built yet).
    public internal(set) var endWeek: Int?

    public static let nameLimit = 30
    /// The first era of every save. Its ID is 1 in the era list (S13).
    public static let first = Era(id: 1, name: "Base", gimmick: nil, startWeek: 0, endWeek: nil)
}

/// A sub-collection inside a set with its own numbers, for example the Trainer
/// Gallery "TG04/TG30" (S11).
public struct Subset: Codable, Sendable, Equatable, Hashable, Identifiable {
    /// Unique in its set.
    public let id: SubsetID
    /// FLAVOR.
    public var name: String
    /// FLAVOR. 1 to 3 capital letters, for example "TG".
    public var prefix: String
    /// When true, a slot can give the subset, and the pack draws its cards only
    /// through that outcome (S14). When false, its cards come through their tiers.
    public var ownOutcome: Bool

    public static let limit = 3
    public static let prefixLimit = 3
    public static let nameLimit = 30

    public init(id: SubsetID, name: String, prefix: String, ownOutcome: Bool = false) {
        self.id = id
        self.name = name
        self.prefix = prefix
        self.ownOutcome = ownOutcome
    }
}

/// An ordered group of designed cards whose art connects into one picture (D3, S10).
/// Reader: chase demand for the whole group (market, not built yet).
public struct ArtSet: Codable, Sendable, Equatable, Hashable, Identifiable {
    /// Unique in its set.
    public let id: ArtSetID
    /// FLAVOR.
    public var name: String
    /// 2 to 5 designed cards of the set, in order.
    public var cards: [CardID]

    public static let cardRange = 2...5
    public static let nameLimit = 30

    public init(id: ArtSetID, name: String, cards: [CardID]) {
        self.id = id
        self.name = name
        self.cards = cards
    }
}

extension CardSet {
    public func subset(_ id: SubsetID) -> Subset? { subsets.first { $0.id == id } }

    /// An ID for a new subset or art set in this set.
    public var nextPartID: Int { ((subsets.map(\.id) + artSets.map(\.id)).max() ?? 0) + 1 }
}

extension Catalog {
    /// The era that runs now (S13).
    public var currentEra: Era { eras.last { $0.endWeek == nil } ?? eras.last ?? Era.first }

    public func era(_ id: EraID) -> Era? { eras.first { $0.id == id } }

    /// The gimmick of a set's era, if any.
    public func gimmick(of setID: SetID) -> Gimmick? {
        set(setID).flatMap { era($0.eraID)?.gimmick }
    }

    /// The name that a card shows. A card that carries the gimmick gets the
    /// gimmick after the character part: "Aryla ex, Destined Trainee".
    public func displayName(_ card: Card) -> String {
        guard card.gimmick, let setID = card.setID, let gimmick = gimmick(of: setID) else { return card.name }
        if let comma = card.name.range(of: ", ") {
            return card.name[..<comma.lowerBound] + " " + gimmick.name + card.name[comma.lowerBound...]
        }
        return card.name + " " + gimmick.name
    }

    /// The printed number of each card in a set (S11). The main set numbers by tier,
    /// from the most common tier to the rarest, then in the order the cards were made.
    /// The printed total counts only the tiers that are not secret, so a secret card
    /// numbers above it: "205/191". A subset numbers on its own: "TG04/TG30".
    public func cardNumbers(in setID: SetID) -> [CardID: String] {
        guard let set = set(setID) else { return [:] }
        let all = allCards(in: setID)
        var result: [CardID: String] = [:]
        let main = all.filter { $0.subsetID == nil }
        let ordered = set.ladder.tiers.flatMap { tier in main.filter { $0.rarity == tier.id } }
        let printed = ordered.filter { set.ladder.tier($0.rarity)?.secret != true }.count
        let width = max(3, String(max(printed, ordered.count)).count)
        func padded(_ n: Int, _ w: Int) -> String {
            let text = String(n)
            return String(repeating: "0", count: max(0, w - text.count)) + text
        }
        for (index, card) in ordered.enumerated() {
            result[card.id] = "\(padded(index + 1, width))/\(padded(printed, width))"
        }
        for subset in set.subsets {
            let members = set.ladder.tiers.flatMap { tier in all.filter { $0.subsetID == subset.id && $0.rarity == tier.id } }
            for (index, card) in members.enumerated() {
                result[card.id] = "\(subset.prefix)\(padded(index + 1, 2))/\(subset.prefix)\(padded(members.count, 2))"
            }
        }
        return result
    }
}

extension World {
    // MARK: - Eras (S7, S13)

    /// Ends the current era and starts a new one. New sets join it.
    @discardableResult
    public mutating func startEra(name: String, gimmick: Gimmick?) throws(CardError) -> EraID {
        let trimmed = try validEraName(name)
        let g = try validGimmick(gimmick)
        if let i = catalog.eras.lastIndex(where: { $0.endWeek == nil }) { catalog.eras[i].endWeek = week }
        let id = (catalog.eras.map(\.id).max() ?? 0) + 1
        catalog.eras.append(Era(id: id, name: trimmed, gimmick: g, startWeek: week, endWeek: nil))
        return id
    }

    /// Renames an era, or changes its gimmick.
    public mutating func updateEra(_ id: EraID, name: String, gimmick: Gimmick?) throws(CardError) {
        guard let i = catalog.eras.firstIndex(where: { $0.id == id }) else { throw .unknownEra(id) }
        catalog.eras[i].name = try validEraName(name)
        catalog.eras[i].gimmick = try validGimmick(gimmick)
    }

    func validEraName(_ name: String) throws(CardError) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { throw .emptyEraName }
        if trimmed.count > Era.nameLimit { throw .nameTooLong(Era.nameLimit) }
        return trimmed
    }

    func validGimmick(_ gimmick: Gimmick?) throws(CardError) -> Gimmick? {
        guard var g = gimmick else { return nil }
        g.name = g.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if g.name.isEmpty || g.name.count > Gimmick.nameLimit { throw .badGimmickName }
        return g
    }

    // MARK: - Subsets (S11, S14)

    /// Adds or changes a subset, and sets which designed cards are in it.
    /// A card leaves any other subset of the set.
    @discardableResult
    public mutating func saveSubset(_ setID: SetID, _ subset: Subset, cards: [CardID]) throws(CardError) -> SubsetID {
        guard let si = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        var s = subset
        s.name = try validName(subset.name, limit: Subset.nameLimit)
        s.prefix = subset.prefix.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard (1...Subset.prefixLimit).contains(s.prefix.count), s.prefix.allSatisfy({ $0.isASCII && $0.isLetter }) else {
            throw .badSubsetPrefix
        }
        let others = catalog.sets[si].subsets.filter { $0.id != subset.id }
        if let clash = others.first(where: { $0.name.lowercased() == s.name.lowercased() || $0.prefix == s.prefix }) {
            throw .duplicateSubset(clash.prefix == s.prefix ? s.prefix : s.name)
        }
        let isNew = catalog.sets[si].subset(subset.id) == nil
        if isNew, catalog.sets[si].subsets.count >= Subset.limit { throw .tooManySubsets }
        let designed = Set(catalog.cards(in: setID).map(\.id))
        if !cards.allSatisfy(designed.contains) { throw .subsetCard }

        let id = isNew ? catalog.sets[si].nextPartID : subset.id
        let saved = Subset(id: id, name: s.name, prefix: s.prefix, ownOutcome: s.ownOutcome)
        if isNew {
            catalog.sets[si].subsets.append(saved)
        } else if let i = catalog.sets[si].subsets.firstIndex(where: { $0.id == id }) {
            catalog.sets[si].subsets[i] = saved
        }
        let members = Set(cards)
        for i in catalog.cards.indices where catalog.cards[i].setID == setID && !catalog.cards[i].filler {
            if members.contains(catalog.cards[i].id) {
                catalog.cards[i].subsetID = id
            } else if catalog.cards[i].subsetID == id {
                catalog.cards[i].subsetID = nil
            }
        }
        return id
    }

    /// Removes a subset. Its cards return to the main set. A slot that gave the
    /// subset now points nowhere, and the pack warnings ask the player to fix it.
    public mutating func deleteSubset(_ setID: SetID, _ id: SubsetID) throws(CardError) {
        guard let si = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        guard catalog.sets[si].subset(id) != nil else { throw .unknownSubset(id) }
        catalog.sets[si].subsets.removeAll { $0.id == id }
        for i in catalog.cards.indices where catalog.cards[i].subsetID == id && catalog.cards[i].setID == setID {
            catalog.cards[i].subsetID = nil
        }
    }

    // MARK: - Art sets (S10)

    /// Adds or changes an art set: 2 to 5 designed cards of the set, in order.
    /// A card can be in one art set only.
    @discardableResult
    public mutating func saveArtSet(_ setID: SetID, _ artSet: ArtSet) throws(CardError) -> ArtSetID {
        guard let si = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        let name = try validName(artSet.name, limit: ArtSet.nameLimit)
        guard ArtSet.cardRange.contains(artSet.cards.count), Set(artSet.cards).count == artSet.cards.count else {
            throw .artSetSize
        }
        let designed = Set(catalog.cards(in: setID).map(\.id))
        if !artSet.cards.allSatisfy(designed.contains) { throw .artSetCard }
        for other in catalog.sets[si].artSets where other.id != artSet.id {
            if let shared = other.cards.first(where: artSet.cards.contains) {
                throw .cardInTwoArtSets(catalog.card(shared).map { catalog.displayName($0) } ?? "A card")
            }
        }
        if let i = catalog.sets[si].artSets.firstIndex(where: { $0.id == artSet.id }) {
            catalog.sets[si].artSets[i] = ArtSet(id: artSet.id, name: name, cards: artSet.cards)
            return artSet.id
        }
        let id = catalog.sets[si].nextPartID
        catalog.sets[si].artSets.append(ArtSet(id: id, name: name, cards: artSet.cards))
        return id
    }

    public mutating func deleteArtSet(_ setID: SetID, _ id: ArtSetID) throws(CardError) {
        guard let si = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        catalog.sets[si].artSets.removeAll { $0.id == id }
    }

    /// A deleted card leaves its art set. An art set with fewer than 2 cards ends.
    mutating func removeFromArtSets(_ cardID: CardID, setID: SetID) {
        guard let si = catalog.sets.firstIndex(where: { $0.id == setID }) else { return }
        for i in catalog.sets[si].artSets.indices { catalog.sets[si].artSets[i].cards.removeAll { $0 == cardID } }
        catalog.sets[si].artSets.removeAll { $0.cards.count < ArtSet.cardRange.lowerBound }
    }
}
