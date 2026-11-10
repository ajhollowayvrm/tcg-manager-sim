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

    @discardableResult
    public mutating func createSet(name: String, theme: ThemeID?, presetID: LadderID) throws(CardError) -> SetID {
        let trimmed = try validSetName(name, editing: nil)
        if let theme, catalog.theme(theme) == nil { throw .unknownTheme(theme) }
        guard let preset = catalog.preset(presetID) else { throw .unknownPreset(presetID) }
        let id = catalog.takeID()
        catalog.sets.append(CardSet(
            id: id, name: trimmed, theme: theme, ladder: preset, status: .draft, createdWeek: week
        ))
        return id
    }

    public mutating func updateSet(_ id: SetID, name: String, theme: ThemeID?) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == id }) else { throw .unknownSet(id) }
        if let theme, catalog.theme(theme) == nil { throw .unknownTheme(theme) }
        catalog.sets[i].name = try validSetName(name, editing: id)
        catalog.sets[i].theme = theme
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
    }

    // MARK: - Cards

    @discardableResult
    public mutating func createCard(in setID: SetID, _ draft: CardDraft) throws(CardError) -> CardID {
        guard let set = catalog.set(setID) else { throw .unknownSet(setID) }
        let d = try validCard(draft, ladder: set.ladder)
        var shift = AudienceValues()
        for audience in Audience.allCases where !audience.isDerived {
            shift[audience] = catalog.rng.gauss() * Self.cardShiftSpread
        }
        let id = catalog.takeID()
        catalog.cards.append(Card(
            id: id, setID: setID, name: d.name, characterID: d.characterID, formID: d.formID,
            rarity: d.rarity, featured: d.featured,
            excludedVersions: d.excludedVersions, ownVersions: d.ownVersions,
            cardShift: shift, createdWeek: week
        ))
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
        var ids: [CardID] = []
        for draft in drafts { ids.append(try createCard(in: setID, draft)) }
        return ids
    }

    /// Changes a card. The card keeps its hidden shift.
    public mutating func updateCard(_ id: CardID, _ draft: CardDraft) throws(CardError) {
        guard let i = catalog.cards.firstIndex(where: { $0.id == id }) else { throw .unknownCard(id) }
        guard let setID = catalog.cards[i].setID, let set = catalog.set(setID) else { throw .unknownSet(-1) }
        let d = try validCard(draft, ladder: set.ladder)
        catalog.cards[i].name = d.name
        catalog.cards[i].characterID = d.characterID
        catalog.cards[i].formID = d.formID
        catalog.cards[i].rarity = d.rarity
        catalog.cards[i].featured = d.featured
        catalog.cards[i].excludedVersions = d.excludedVersions
        catalog.cards[i].ownVersions = d.ownVersions
    }

    public mutating func deleteCard(_ id: CardID) throws(CardError) {
        guard catalog.card(id) != nil else { throw .unknownCard(id) }
        catalog.cards.removeAll { $0.id == id }
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
        catalog.ladderPresets.removeAll { $0.id == id }
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
                         excludedVersions: excluded, ownVersions: ownVersions)
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
        }
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

    func validPresetName(_ name: String, editing: LadderID?) throws(CardError) -> String {
        let trimmed = try validName(name, limit: RarityLadder.nameLimit)
        if catalog.ladderPresets.contains(where: { $0.id != editing && $0.name.lowercased() == trimmed.lowercased() }) {
            throw .duplicatePresetName(trimmed)
        }
        return trimmed
    }
}
