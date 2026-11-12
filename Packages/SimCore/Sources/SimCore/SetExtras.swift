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
    /// FLAVOR. The color of the gimmick word or mark on the card.
    public var color: PaletteColor
    /// FLAVOR. How the gimmick word shows on the card (eras.md, section 2.3; E4).
    public var mark: GimmickMark
    /// FLAVOR. A gimmick card uses this name bar in place of the era's (E4).
    public var nameBar: NameBarStyle
    /// FLAVOR. On a tier with a solid frame, a gimmick card takes this color in
    /// place of the tier color (E4). Nil keeps the tier color.
    public var frameColor: PaletteColor?
    /// A tier of the era's ladder preset. A new card at this tier carries the
    /// gimmick by default (E5). Reader: the card designer.
    public var homeTierID: TierID?

    public static let nameLimit = 12

    public init(
        name: String, color: PaletteColor = .gold, mark: GimmickMark = .word,
        nameBar: NameBarStyle = .classic, frameColor: PaletteColor? = nil, homeTierID: TierID? = nil
    ) {
        self.name = name
        self.color = color
        self.mark = mark
        self.nameBar = nameBar
        self.frameColor = frameColor
        self.homeTierID = homeTierID
    }

    /// A save from before the era designer has only a name and a color.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        color = try c.decode(PaletteColor.self, forKey: .color)
        mark = try c.decodeIfPresent(GimmickMark.self, forKey: .mark) ?? .word
        nameBar = try c.decodeIfPresent(NameBarStyle.self, forKey: .nameBar) ?? .classic
        frameColor = try c.decodeIfPresent(PaletteColor.self, forKey: .frameColor)
        homeTierID = try c.decodeIfPresent(TierID.self, forKey: .homeTierID)
    }
}

/// How a gimmick word shows on a card (eras.md, section 2.3). FLAVOR.
public enum GimmickMark: String, CaseIterable, Codable, Sendable, Identifiable {
    /// The colored word after the character name.
    case word
    /// The word in a colored capsule.
    case badge
    /// A large word with an outline and a shine.
    case logo

    public var id: String { rawValue }
}

/// The shape of a card's name bar (eras.md, section 2.2). FLAVOR.
public enum NameBarShape: String, CaseIterable, Codable, Sendable, Identifiable {
    /// Rounded corners: the look before the era designer.
    case rounded
    case square
    /// Pointed ends, like a ribbon.
    case banner
    /// No bar. The name sits on the frame with a shadow.
    case plain

    public var id: String { rawValue }
}

/// The name bar of a card: an era sets it, and a gimmick can set its own (E3, E4). FLAVOR.
public struct NameBarStyle: Codable, Sendable, Equatable, Hashable {
    public var shape: NameBarShape
    /// The game picks black or white text for the best contrast.
    public var color: PaletteColor

    public init(shape: NameBarShape = .rounded, color: PaletteColor = .snow) {
        self.shape = shape
        self.color = color
    }

    /// The look of the cards before the era designer.
    public static let classic = NameBarStyle()
}

/// A named period with a start, an end, a look, and one gimmick (S7, E1). The
/// player starts and ends an era. One era runs at a time (S13).
public struct Era: Codable, Sendable, Equatable, Identifiable {
    public let id: EraID
    /// FLAVOR.
    public internal(set) var name: String
    /// 2 or 3 capital letters, unique among the eras (E6). Reader: the series numbers.
    public internal(set) var code: String
    /// FLAVOR. The name bar of each card in the era's sets (E3).
    public internal(set) var nameBar: NameBarStyle
    /// Nil means no gimmick. Reader: the gimmick on the era's cards. Gimmick
    /// freshness and the early-gimmick effect (market, not built yet; S13).
    public internal(set) var gimmick: Gimmick?
    /// The ladder preset that the new set sheet preselects (eras.md, section 4).
    public internal(set) var ladderPresetID: LadderID
    /// The pack preset that the new set sheet preselects (eras.md, section 4).
    public internal(set) var packPresetID: PackID
    /// Reader: gimmick freshness (market, not built yet).
    public let startWeek: Int
    /// Nil while the era runs. Reader: nostalgia for the era's sets (market, not built yet).
    public internal(set) var endWeek: Int?

    public static let nameLimit = 30
    public static let codeRange = 2...3
    /// The first era of every save. Its ID is 1 in the era list (S13).
    public static let first = Era(id: 1, name: "Base", code: "BS", gimmick: nil, startWeek: 0)

    public init(
        id: EraID, name: String, code: String, nameBar: NameBarStyle = .classic, gimmick: Gimmick?,
        ladderPresetID: LadderID = Catalog.defaultLadderID, packPresetID: PackID = Catalog.defaultPackID,
        startWeek: Int, endWeek: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.code = code
        self.nameBar = nameBar
        self.gimmick = gimmick
        self.ladderPresetID = ladderPresetID
        self.packPresetID = packPresetID
        self.startWeek = startWeek
        self.endWeek = endWeek
    }

    /// A save from before the era designer has no code, look, or presets. The
    /// defaults keep the cards as they were (eras.md, section 7).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(EraID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        code = try c.decodeIfPresent(String.self, forKey: .code)
            ?? (id == Era.first.id ? Era.first.code : Era.suggestCode(for: name, taken: []))
        nameBar = try c.decodeIfPresent(NameBarStyle.self, forKey: .nameBar) ?? .classic
        gimmick = try c.decodeIfPresent(Gimmick.self, forKey: .gimmick)
        ladderPresetID = try c.decodeIfPresent(LadderID.self, forKey: .ladderPresetID) ?? Catalog.defaultLadderID
        packPresetID = try c.decodeIfPresent(PackID.self, forKey: .packPresetID) ?? Catalog.defaultPackID
        startWeek = try c.decode(Int.self, forKey: .startWeek)
        endWeek = try c.decodeIfPresent(Int.self, forKey: .endWeek)
    }

    /// A code from the name: the first letters of the words, or the first two
    /// letters of one word. A taken code tries other letters of the name.
    public static func suggestCode(for name: String, taken: Set<String>) -> String {
        let words = name.uppercased()
            .split(whereSeparator: { !$0.isLetter })
            .map { String($0.filter { $0.isASCII && $0.isLetter }) }
            .filter { !$0.isEmpty }
        let letters = Array(words.joined())
        var candidates: [String] = []
        if words.count >= 2 { candidates.append(String(words.prefix(3).compactMap(\.first))) }
        if let first = letters.first {
            for second in letters.dropFirst() { candidates.append(String([first, second])) }
        }
        for candidate in candidates where codeRange.contains(candidate.count) && !taken.contains(candidate) {
            return candidate
        }
        let head = String(letters.first ?? "E")
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for a in alphabet where !taken.contains(head + String(a)) { return head + String(a) }
        for a in alphabet {
            for b in alphabet where !taken.contains(head + String(a) + String(b)) { return head + String(a) + String(b) }
        }
        return head + "ZZ"
    }
}

/// The choices of the era designer (eras.md, section 6).
public struct EraDraft: Sendable, Equatable {
    public var name: String
    public var code: String
    public var nameBar: NameBarStyle
    public var gimmick: Gimmick?
    public var ladderPresetID: LadderID
    public var packPresetID: PackID

    public init(
        name: String = "", code: String = "", nameBar: NameBarStyle = .classic, gimmick: Gimmick? = nil,
        ladderPresetID: LadderID = Catalog.defaultLadderID, packPresetID: PackID = Catalog.defaultPackID
    ) {
        self.name = name
        self.code = code
        self.nameBar = nameBar
        self.gimmick = gimmick
        self.ladderPresetID = ladderPresetID
        self.packPresetID = packPresetID
    }

    public init(from era: Era) {
        self.init(name: era.name, code: era.code, nameBar: era.nameBar, gimmick: era.gimmick,
                  ladderPresetID: era.ladderPresetID, packPresetID: era.packPresetID)
    }
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

    /// The era of a set.
    public func era(of setID: SetID) -> Era? { set(setID).flatMap { era($0.eraID) } }

    /// A free era code from a name (E6).
    public func suggestedEraCode(for name: String, editing: EraID? = nil) -> String {
        Era.suggestCode(for: name, taken: Set(eras.filter { $0.id != editing }.map(\.code)))
    }

    /// The gimmick's home tier in a set's own ladder (E5). The game matches it
    /// first by the tier ID, then by the tier name in the era's ladder preset (S6).
    public func homeTier(of setID: SetID) -> TierID? {
        guard let set = set(setID), let era = era(set.eraID), let home = era.gimmick?.homeTierID else { return nil }
        let name = preset(era.ladderPresetID)?.tier(home)?.name
        if let tier = set.ladder.tier(home), name == nil || tier.name.lowercased() == name?.lowercased() { return tier.id }
        guard let name else { return nil }
        return set.ladder.tiers.first { $0.name.lowercased() == name.lowercased() }?.id
    }

    /// The series number of each set in an era, for example "SV3.5" (E6, E8).
    /// Main sets count up. A mini set takes the main number before it, plus .5,
    /// then .6. A parallel pair takes one main number with a letter: "SV4a", "SV4b".
    /// The game calculates the numbers from the order of the sets. It does not store them.
    public func seriesNumbers(in eraID: EraID) -> [SetID: String] {
        guard let era = era(eraID) else { return [:] }
        var result: [SetID: String] = [:]
        var main = 0
        var minis = 0
        for set in sets.filter({ $0.eraID == eraID }).sorted(by: { $0.id < $1.id }) {
            switch set.type {
            case .main:
                main += 1
                minis = 0
                result[set.id] = "\(era.code)\(main)"
            case .mini:
                minis += 1
                result[set.id] = "\(era.code)\(main).\(4 + minis)"
            case .parallel:
                if let pairID = set.pairID, let first = result[pairID] {
                    result[set.id] = String(first.dropLast()) + "b"
                } else {
                    main += 1
                    minis = 0
                    result[set.id] = "\(era.code)\(main)a"
                }
            }
        }
        return result
    }

    /// The series number of one set, for example "SV2".
    public func seriesNumber(of setID: SetID) -> String? {
        set(setID).flatMap { seriesNumbers(in: $0.eraID)[setID] }
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

    /// Ends the current era and starts a new one from the era designer (E2). New sets join it.
    @discardableResult
    public mutating func startEra(_ draft: EraDraft) throws(CardError) -> EraID {
        let d = try validEra(draft, editing: nil)
        if let i = catalog.eras.lastIndex(where: { $0.endWeek == nil }) { catalog.eras[i].endWeek = week }
        let id = (catalog.eras.map(\.id).max() ?? 0) + 1
        catalog.eras.append(Era(
            id: id, name: d.name, code: d.code, nameBar: d.nameBar, gimmick: d.gimmick,
            ladderPresetID: d.ladderPresetID, packPresetID: d.packPresetID, startWeek: week
        ))
        return id
    }

    /// Starts an era with a name and a gimmick. The code comes from the name, and
    /// the look and the presets come from the current era.
    @discardableResult
    public mutating func startEra(name: String, gimmick: Gimmick?) throws(CardError) -> EraID {
        let current = catalog.currentEra
        return try startEra(EraDraft(
            name: name, code: catalog.suggestedEraCode(for: name), nameBar: current.nameBar, gimmick: gimmick,
            ladderPresetID: current.ladderPresetID, packPresetID: current.packPresetID
        ))
    }

    /// Changes an era. The look changes on every card of the era's sets. A set
    /// keeps its own ladder and pack (eras.md, section 4).
    public mutating func updateEra(_ id: EraID, _ draft: EraDraft) throws(CardError) {
        guard let i = catalog.eras.firstIndex(where: { $0.id == id }) else { throw .unknownEra(id) }
        let d = try validEra(draft, editing: id)
        catalog.eras[i].name = d.name
        catalog.eras[i].code = d.code
        catalog.eras[i].nameBar = d.nameBar
        catalog.eras[i].gimmick = d.gimmick
        catalog.eras[i].ladderPresetID = d.ladderPresetID
        catalog.eras[i].packPresetID = d.packPresetID
    }

    /// Renames an era, or changes its gimmick. The other parts stay.
    public mutating func updateEra(_ id: EraID, name: String, gimmick: Gimmick?) throws(CardError) {
        guard let era = catalog.era(id) else { throw .unknownEra(id) }
        var draft = EraDraft(from: era)
        draft.name = name
        draft.gimmick = gimmick
        try updateEra(id, draft)
    }

    func validEra(_ draft: EraDraft, editing: EraID?) throws(CardError) -> EraDraft {
        var d = draft
        d.name = try validEraName(draft.name)
        d.code = draft.code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard Era.codeRange.contains(d.code.count), d.code.allSatisfy({ $0.isASCII && $0.isLetter }) else { throw .badEraCode }
        if catalog.eras.contains(where: { $0.id != editing && $0.code == d.code }) { throw .duplicateEraCode(d.code) }
        guard let ladder = catalog.preset(d.ladderPresetID) else { throw .unknownPreset(d.ladderPresetID) }
        guard catalog.packPreset(d.packPresetID) != nil else { throw .unknownPack(d.packPresetID) }
        d.gimmick = try validGimmick(draft.gimmick)
        if let home = d.gimmick?.homeTierID, ladder.tier(home) == nil { throw .badHomeTier }
        return d
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
