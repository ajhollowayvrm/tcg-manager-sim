// The card designer's decisions (docs/design/cards.md).

extension World {
    /// The spread of a new card's hidden appeal shift (R24).
    public static let cardShiftSpread = 10.0
    /// The weight of each featured character's appeal in a card's appeal (R22).
    public static let featuredWeight = 0.25

    // MARK: - Reads

    /// The appeal of a card for one audience (cards.md, section 3). The rarity
    /// and its look do not change appeal. They change value in the market.
    /// Reader: the market (not built yet).
    public func cardAppeal(_ card: Card, _ audience: Audience) -> Double? {
        guard let c = character(card.characterID) else { return nil }
        var value: Double
        if let formID = card.formID, let form = c.form(formID) {
            value = c.formAppeal(form, audience, fits: fits)
        } else {
            value = c.trueAppeal(audience, fits: fits)
        }
        for id in card.featured {
            if let other = character(id) {
                value += Self.featuredWeight * other.trueAppeal(audience, fits: fits)
            }
        }
        value += card.cardShift[audience]
        return Character.clampAppeal(value)
    }

    // MARK: - Sets

    /// A main set or a mini set. A parallel set is created as a pair.
    @discardableResult
    public mutating func createSet(
        _ type: SetType, _ details: SetDetails, presetID: LadderID, packID: PackID = Catalog.defaultPackID
    ) throws(CardError) -> SetID {
        if type == .parallel { throw .parallelNeedsPair }
        guard let preset = catalog.preset(presetID) else { throw .unknownPreset(presetID) }
        let pack = try setPack(packID, ladder: preset)
        let d = try validSetDetails(details, editing: nil, designed: 0)
        let id = addSet(type, d, ladder: preset, pack: pack, pairID: nil)
        refreshFiller(id)
        return id
    }

    /// A main set with a suggested code and the standard symbol.
    @discardableResult
    public mutating func createSet(name: String, theme: ThemeID?, presetID: LadderID) throws(CardError) -> SetID {
        try createSet(.main, SetDetails(name: name, code: catalog.suggestedCode(for: name), theme: theme), presetID: presetID)
    }

    /// Two parallel sets that release together (D2, S9). Each set takes its own
    /// copy of the ladder. The function checks both sets first. If one fails, it adds no set.
    @discardableResult
    public mutating func createParallelPair(
        _ first: SetDetails, _ second: SetDetails, presetID: LadderID, packID: PackID = Catalog.defaultPackID
    ) throws(CardError) -> (SetID, SetID) {
        guard let preset = catalog.preset(presetID) else { throw .unknownPreset(presetID) }
        let pack = try setPack(packID, ladder: preset)
        let a = try validSetDetails(first, editing: nil, designed: 0)
        let b = try validSetDetails(second, editing: nil, designed: 0)
        if a.name.lowercased() == b.name.lowercased() { throw .duplicateSetName(b.name) }
        if a.code == b.code { throw .duplicateSetCode(b.code) }
        let firstID = addSet(.parallel, a, ladder: preset, pack: pack, pairID: nil)
        let secondID = addSet(.parallel, b, ladder: preset, pack: pack, pairID: firstID)
        if let i = catalog.sets.firstIndex(where: { $0.id == firstID }) { catalog.sets[i].pairID = secondID }
        refreshFiller(firstID)
        refreshFiller(secondID)
        return (firstID, secondID)
    }

    public mutating func updateSet(_ id: SetID, _ details: SetDetails) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == id }) else { throw .unknownSet(id) }
        let d = try validSetDetails(details, editing: id, designed: catalog.cards(in: id).count)
        catalog.sets[i].name = d.name
        catalog.sets[i].code = d.code
        catalog.sets[i].symbol = d.symbol
        catalog.sets[i].theme = d.theme
        catalog.sets[i].size = d.size
        catalog.sets[i].headliner = d.headliner
        refreshFiller(id)
    }

    public mutating func updateSet(_ id: SetID, name: String, theme: ThemeID?) throws(CardError) {
        guard let set = catalog.set(id) else { throw .unknownSet(id) }
        var details = SetDetails(from: set)
        details.name = name
        details.theme = theme
        try updateSet(id, details)
    }

    /// A main set can become a mini set, and back. A parallel set stays parallel.
    public mutating func updateSetType(_ id: SetID, _ type: SetType) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == id }) else { throw .unknownSet(id) }
        if catalog.sets[i].type == type { return }
        if type == .parallel || catalog.sets[i].type == .parallel { throw .parallelTypeFixed }
        catalog.sets[i].type = type
    }

    /// A set's copy of a pack preset, with its tiers matched to the set's ladder (S6).
    private func setPack(_ packID: PackID, ladder: RarityLadder) throws(CardError) -> PackLayout {
        guard let preset = catalog.packPreset(packID) else { throw .unknownPack(packID) }
        return preset.resolved(against: ladder, source: catalog.preset(preset.ladderID))
    }

    private mutating func addSet(_ type: SetType, _ d: SetDetails, ladder: RarityLadder, pack: PackLayout, pairID: SetID?) -> SetID {
        let id = catalog.takeID()
        catalog.sets.append(CardSet(
            id: id, name: d.name, type: type, code: d.code, symbol: d.symbol, theme: d.theme,
            size: d.size, pairID: pairID, headliner: d.headliner,
            ladder: ladder, pack: pack, eraID: catalog.currentEra.id, subsets: [], artSets: [],
            generated: [], status: .draft, createdWeek: week
        ))
        return id
    }

    /// Changes a set's own ladder (C10). A tier that a card uses must stay.
    public mutating func updateSetLadder(_ id: SetID, _ ladder: RarityLadder) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == id }) else { throw .unknownSet(id) }
        try validate(ladder)
        let kept = Set(ladder.tiers.map(\.id))
        for card in catalog.cards(in: id) where !kept.contains(card.rarity) {
            throw .tierInUse(catalog.sets[i].ladder.tier(card.rarity)?.name ?? "a tier")
        }
        catalog.sets[i].ladder.tiers = ladder.tiers
        refreshFiller(id)
    }

    // MARK: - Cards

    @discardableResult
    public mutating func createCard(in setID: SetID, _ draft: CardDraft) throws(CardError) -> CardID {
        guard let set = catalog.set(setID) else { throw .unknownSet(setID) }
        let d = try validCard(draft, ladder: set.ladder)
        if catalog.cards(in: setID).count >= set.size { throw .setFull(set.size) }
        var shift = AudienceValues()
        for audience in Audience.allCases where !audience.isDerived {
            shift[audience] = catalog.rng.gauss() * Self.cardShiftSpread
        }
        let id = catalog.takeID()
        catalog.cards.append(Card(
            id: id, setID: setID, filler: false, name: d.name, characterID: d.characterID, formID: d.formID,
            rarity: d.rarity, featured: d.featured,
            excludedVersions: d.excludedVersions, ownVersions: d.ownVersions,
            cardShift: shift, createdWeek: week, gimmick: d.gimmick
        ))
        refreshFiller(setID)
        return id
    }

    /// Adds one card for each draft, for example one character at Common, Rare,
    /// Ultra Rare, and SIR (D1). Each card is a separate card with its own shift.
    /// The function checks every draft first. If one draft fails, it adds no card.
    @discardableResult
    public mutating func createCards(in setID: SetID, _ drafts: [CardDraft]) throws(CardError) -> [CardID] {
        guard let set = catalog.set(setID) else { throw .unknownSet(setID) }
        if drafts.isEmpty { throw .noRarity }
        for draft in drafts { _ = try validCard(draft, ladder: set.ladder) }
        if catalog.cards(in: setID).count + drafts.count > set.size { throw .setFull(set.size) }
        var ids: [CardID] = []
        for draft in drafts { ids.append(try createCard(in: setID, draft)) }
        return ids
    }

    /// Changes a card. The card keeps its hidden shift.
    public mutating func updateCard(_ id: CardID, _ draft: CardDraft) throws(CardError) {
        guard let i = catalog.cards.firstIndex(where: { $0.id == id }) else { throw .unknownCard(id) }
        if catalog.cards[i].filler { throw .fillerLocked }
        guard let setID = catalog.cards[i].setID, let set = catalog.set(setID) else { throw .unknownSet(-1) }
        let d = try validCard(draft, ladder: set.ladder)
        catalog.cards[i].name = d.name
        catalog.cards[i].characterID = d.characterID
        catalog.cards[i].formID = d.formID
        catalog.cards[i].rarity = d.rarity
        catalog.cards[i].featured = d.featured
        catalog.cards[i].excludedVersions = d.excludedVersions
        catalog.cards[i].ownVersions = d.ownVersions
        catalog.cards[i].gimmick = d.gimmick
    }

    /// Changes a card, and adds one new card for each draft in `adding` (C18).
    /// The function checks every draft first. If one draft fails, nothing changes.
    @discardableResult
    public mutating func updateCard(_ id: CardID, _ draft: CardDraft, adding extra: [CardDraft]) throws(CardError) -> [CardID] {
        guard let card = catalog.card(id) else { throw .unknownCard(id) }
        guard let setID = card.setID, let set = catalog.set(setID) else { throw .unknownSet(-1) }
        for d in [draft] + extra { _ = try validCard(d, ladder: set.ladder) }
        if catalog.cards(in: setID).count + extra.count > set.size { throw .setFull(set.size) }
        try updateCard(id, draft)
        var ids: [CardID] = []
        for d in extra { ids.append(try createCard(in: setID, d)) }
        return ids
    }

    public mutating func deleteCard(_ id: CardID) throws(CardError) {
        guard let card = catalog.card(id) else { throw .unknownCard(id) }
        if card.filler { throw .fillerLocked }
        catalog.cards.removeAll { $0.id == id }
        if let setID = card.setID {
            removeFromArtSets(id, setID: setID)
            refreshFiller(setID)
        }
    }

    // MARK: - Ladder presets (C4)

    /// A new preset that copies an existing one.
    @discardableResult
    public mutating func createPreset(copying presetID: LadderID, name: String) throws(CardError) -> LadderID {
        guard let source = catalog.preset(presetID) else { throw .unknownPreset(presetID) }
        let trimmed = try validPresetName(name, editing: nil)
        let id = catalog.takeID()
        catalog.ladderPresets.append(RarityLadder(id: id, name: trimmed, tiers: source.tiers))
        return id
    }

    public mutating func updatePreset(_ ladder: RarityLadder) throws(CardError) {
        guard ladder.id != Catalog.defaultLadderID else { throw .defaultPresetLocked }
        guard let i = catalog.ladderPresets.firstIndex(where: { $0.id == ladder.id }) else { throw .unknownPreset(ladder.id) }
        var copy = ladder
        copy.name = try validPresetName(ladder.name, editing: ladder.id)
        try validate(copy)
        catalog.ladderPresets[i] = copy
    }

    /// A set keeps its own copy, so deleting a preset does not change any set (C10).
    public mutating func deletePreset(_ id: LadderID) throws(CardError) {
        guard id != Catalog.defaultLadderID else { throw .defaultPresetLocked }
        guard catalog.preset(id) != nil else { throw .unknownPreset(id) }
        let removed = catalog.preset(id)
        catalog.ladderPresets.removeAll { $0.id == id }
        // An era that used the preset goes back to the default preset (eras.md, section 4).
        // Its home tier matches a default tier by name, or it clears.
        let fallback = catalog.preset(Catalog.defaultLadderID)
        for i in catalog.eras.indices where catalog.eras[i].ladderPresetID == id {
            catalog.eras[i].ladderPresetID = Catalog.defaultLadderID
            if let home = catalog.eras[i].gimmick?.homeTierID {
                let name = removed?.tier(home)?.name.lowercased()
                catalog.eras[i].gimmick?.homeTierID = fallback?.tiers.first { $0.name.lowercased() == name }?.id
            }
        }
    }

    // MARK: - Validation

    struct ValidCard {
        var name: String
        var characterID: CharacterID
        var formID: FormID?
        var rarity: TierID
        var featured: [CharacterID]
        var excludedVersions: [VersionID]
        var ownVersions: [CardVersion]
        var gimmick: Bool
    }

    func validCard(_ d: CardDraft, ladder: RarityLadder) throws(CardError) -> ValidCard {
        let name = try validName(d.name, limit: Card.nameLimit)
        guard let characterID = d.characterID else { throw .noSubject }
        guard let c = character(characterID) else { throw .unknownCharacter(characterID) }
        if let formID = d.formID, c.form(formID) == nil { throw .unknownForm(formID) }
        guard let rarity = d.rarity else { throw .noRarity }
        guard let tier = ladder.tier(rarity) else { throw .unknownTier(rarity) }
        if d.ownVersions.count > CardVersion.ownLimit { throw .tooManyVersions }
        let ownVersions = try validVersions(d.ownVersions, alongside: tier.versions)
        // A version that the tier no longer has is not kept.
        let excluded = d.excludedVersions.filter { id in tier.versions.contains { $0.id == id } }
        if d.featured.count > Card.featuredLimit { throw .tooManyFeatured }
        if Set(d.featured).count != d.featured.count { throw .duplicateFeatured }
        for id in d.featured {
            if id == characterID { throw .featuredSubject }
            if character(id) == nil { throw .unknownCharacter(id) }
        }
        return ValidCard(name: name, characterID: characterID, formID: d.formID, rarity: rarity, featured: d.featured,
                         excludedVersions: excluded, ownVersions: ownVersions, gimmick: d.gimmick)
    }

    func validate(_ ladder: RarityLadder) throws(CardError) {
        guard RarityLadder.tierRange.contains(ladder.tiers.count) else { throw .ladderSize }
        if Set(ladder.tiers.map(\.id)).count != ladder.tiers.count { throw .duplicateTierID }
        var names: Set<String> = []
        for tier in ladder.tiers {
            let name = tier.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty { throw .emptyTierName }
            if !names.insert(name.lowercased()).inserted { throw .duplicateTierName(name) }
            let code = tier.code.trimmingCharacters(in: .whitespacesAndNewlines)
            if code.isEmpty || code.count > RarityLadder.codeLimit { throw .badTierCode(name) }
            _ = try validVersions(tier.versions, alongside: [])
            if !(0...100).contains(tier.fillerShare) { throw .badFillerShare(name) }
        }
        let shares = ladder.tiers.reduce(0) { $0 + $1.fillerShare }
        if shares != 100 { throw .fillerShares(shares) }
    }

    /// Version names must be unique: among the versions, among the versions next
    /// to them (a card's own versions sit next to its tier's versions), and with "Base".
    /// Each version ID must be unique and must not be the base ID.
    func validVersions(_ versions: [CardVersion], alongside others: [CardVersion]) throws(CardError) -> [CardVersion] {
        var names: Set<String> = ["base"]
        for other in others { names.insert(other.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) }
        var ids: Set<VersionID> = []
        var result: [CardVersion] = []
        for version in versions {
            let name = version.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty { throw .emptyVersionName }
            if name.count > CardVersion.nameLimit { throw .nameTooLong(CardVersion.nameLimit) }
            if !names.insert(name.lowercased()).inserted { throw .duplicateVersionName(name) }
            if version.id == CardVersion.baseID || !ids.insert(version.id).inserted { throw .duplicateTierID }
            var copy = version
            copy.name = name
            result.append(copy)
        }
        return result
    }

    func validName(_ name: String, limit: Int) throws(CardError) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { throw .emptyName }
        if trimmed.count > limit { throw .nameTooLong(limit) }
        return trimmed
    }

    func validSetName(_ name: String, editing: SetID?) throws(CardError) -> String {
        let trimmed = try validName(name, limit: CardSet.nameLimit)
        if catalog.sets.contains(where: { $0.id != editing && $0.name.lowercased() == trimmed.lowercased() }) {
            throw .duplicateSetName(trimmed)
        }
        return trimmed
    }

    func validSetDetails(_ details: SetDetails, editing: SetID?, designed: Int) throws(CardError) -> SetDetails {
        var d = details
        d.name = try validSetName(details.name, editing: editing)
        d.code = details.code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard CardSet.codeRange.contains(d.code.count), d.code.allSatisfy({ $0.isASCII && $0.isLetter }) else {
            throw .badSetCode
        }
        if catalog.takenCodes(except: editing).contains(d.code) { throw .duplicateSetCode(d.code) }
        if let theme = d.theme, catalog.theme(theme) == nil { throw .unknownTheme(theme) }
        guard CardSet.sizeRange.contains(d.size) else { throw .badSetSize }
        if d.size < designed { throw .sizeBelowCards(designed) }
        if let headliner = d.headliner {
            guard let c = character(headliner.characterID) else { throw .unknownCharacter(headliner.characterID) }
            if let formID = headliner.formID, c.form(formID) == nil { throw .unknownForm(formID) }
        }
        return d
    }

    func validPresetName(_ name: String, editing: LadderID?) throws(CardError) -> String {
        let trimmed = try validName(name, limit: RarityLadder.nameLimit)
        if catalog.ladderPresets.contains(where: { $0.id != editing && $0.name.lowercased() == trimmed.lowercased() }) {
            throw .duplicatePresetName(trimmed)
        }
        return trimmed
    }
}
