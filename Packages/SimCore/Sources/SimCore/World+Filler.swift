// Filler cards and the set's generated characters (docs/design/sets.md, section 4).
//
// The game keeps the filler in step with the set: its size (S3), its designed
// cards, and its ladder's filler shares (S4). A change keeps the filler cards
// that still fit, and adds or removes only the difference. A reroll (S5) makes
// all filler cards and generated characters again.

extension SetTheme.Group {
    /// The weight of each kind for a generated character (R17, sets.md section 4.3).
    /// Places and events are not built yet, so only creatures and people get weight.
    var kindMix: [(CharacterKind, Double)] {
        switch self {
        case .elements: [(.creature, 80), (.person, 10)]
        case .history: [(.creature, 30), (.person, 50)]
        case .places: [(.creature, 50), (.person, 15)]
        case .stories: [(.creature, 40), (.person, 25)]
        case .things: [(.creature, 50), (.person, 30)]
        }
    }
}

extension World {
    /// The kind mix of a set with no theme.
    static let noThemeKindMix: [(CharacterKind, Double)] = [(.creature, 75), (.person, 25)]
    /// The chance that a new filler card shows a roster character, not one of the
    /// set's generated characters (R6: "the filler cards can also reuse older roster characters").
    static let rosterReuseChance = 0.2

    /// The count of filler cards at each tier: the filler count times each tier's
    /// share, rounded with the largest-remainder method (S4).
    public static func fillerTargets(count: Int, ladder: RarityLadder) -> [TierID: Int] {
        let total = ladder.tiers.reduce(0) { $0 + $1.fillerShare }
        guard count > 0, total > 0 else { return [:] }
        var targets: [TierID: Int] = [:]
        var remainders: [(TierID, Double, Int)] = []
        var used = 0
        for (rank, tier) in ladder.tiers.enumerated() where tier.fillerShare > 0 {
            let exact = Double(count) * Double(tier.fillerShare) / Double(total)
            let whole = Int(exact.rounded(.down))
            targets[tier.id] = whole
            used += whole
            remainders.append((tier.id, exact - Double(whole), rank))
        }
        // The largest remainders get one more card. On a tie, the more common tier wins.
        remainders.sort { $0.1 != $1.1 ? $0.1 > $1.1 : $0.2 < $1.2 }
        for (id, _, _) in remainders.prefix(count - used) { targets[id, default: 0] += 1 }
        return targets
    }

    /// Makes all filler cards and generated characters of a draft set again (S5).
    public mutating func rerollFiller(_ setID: SetID) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        try requireDraft(setID)
        catalog.cards.removeAll { $0.setID == setID && $0.filler }
        catalog.sets[i].generated = []
        refreshFiller(setID)
    }

    /// Brings the set's filler in step with its size, designed cards, and ladder.
    /// A decision calls it. It never runs on a read.
    mutating func refreshFiller(_ setID: SetID) {
        guard let si = catalog.sets.firstIndex(where: { $0.id == setID }) else { return }
        let set = catalog.sets[si]
        let count = set.fillerCount(designed: catalog.cards(in: setID).count)
        let targets = Self.fillerTargets(count: count, ladder: set.ladder)

        // Keep the filler cards that still fit. Remove the others, newest first.
        var counts: [TierID: Int] = [:]
        var kept: Set<CardID> = []
        for card in catalog.fillerCards(in: setID) where counts[card.rarity, default: 0] < targets[card.rarity, default: 0] {
            counts[card.rarity, default: 0] += 1
            kept.insert(card.id)
        }
        catalog.cards.removeAll { $0.setID == setID && $0.filler && !kept.contains($0.id) }

        // The tiers that need more cards, in a random order.
        var slots: [TierID] = []
        for tier in set.ladder.tiers {
            let need = targets[tier.id, default: 0] - counts[tier.id, default: 0]
            if need > 0 { slots += Array(repeating: tier.id, count: need) }
        }
        generatorRng.shuffle(&slots)

        // The first fill makes the set's new generated characters (R13).
        if catalog.sets[si].generated.isEmpty, count > 0 {
            let range = set.type.generatedRange
            let wanted = min(count, generatorRng.int(range.lowerBound, range.upperBound))
            catalog.sets[si].generated = makeGenerated(wanted, theme: set.theme)
        }

        let fillers = catalog.fillerCards(in: setID)
        var pairs = Set(fillers.map { "\($0.characterID)-\($0.rarity)" })
        // Each generated character with no card yet gets one of the first slots.
        var unused = catalog.sets[si].generated.map(\.id).filter { id in !fillers.contains { $0.characterID == id } }
        let roster = characters.filter { $0.status == .active }.map(\.id)

        for tier in slots {
            var pick: CharacterID?
            if !unused.isEmpty {
                pick = unused.removeFirst()
            } else {
                for _ in 0..<4 {
                    let candidate = pickFillerCharacter(si, roster: roster)
                    pick = candidate
                    if let candidate, !pairs.contains("\(candidate)-\(tier)") { break }
                }
            }
            if pick == nil {
                // No character exists yet, so the set gets one more generated character.
                let extra = makeGenerated(1, theme: set.theme)
                catalog.sets[si].generated += extra
                pick = extra.first?.id
            }
            guard let characterID = pick, let character = character(characterID) else { continue }
            pairs.insert("\(characterID)-\(tier)")
            addFiller(setID, character: character, tier: tier)
        }

        // A generated character that lost all its filler cards leaves the set.
        let used = Set(catalog.fillerCards(in: setID).map(\.characterID))
        catalog.sets[si].generated.removeAll { !used.contains($0.id) }
    }

    private mutating func pickFillerCharacter(_ si: Int, roster: [CharacterID]) -> CharacterID? {
        let generated = catalog.sets[si].generated.map(\.id)
        if !roster.isEmpty, generated.isEmpty || generatorRng.chance(Self.rosterReuseChance) {
            return generatorRng.pick(roster)
        }
        return generated.isEmpty ? nil : generatorRng.pick(generated)
    }

    /// New generated characters in the theme's kind mix (R17). They do not join the roster.
    private mutating func makeGenerated(_ count: Int, theme: ThemeID?) -> [Character] {
        let mix = theme.flatMap { catalog.theme($0)?.group.kindMix } ?? Self.noThemeKindMix
        var taken = takenNames()
        var result: [Character] = []
        for _ in 0..<count {
            let kind = Self.weightedPick(mix, using: &generatorRng)
            let draft = generatedDraft(kind: kind, taken: taken)
            taken.insert(draft.trimmedName.lowercased())
            result.append(makeCharacter(draft, origin: .generated))
        }
        return result
    }

    private mutating func addFiller(_ setID: SetID, character: Character, tier: TierID) {
        var shift = AudienceValues()
        for audience in Audience.allCases where !audience.isDerived {
            shift[audience] = catalog.rng.gauss() * Self.cardShiftSpread
        }
        let id = catalog.takeID()
        catalog.cards.append(Card(
            id: id, setID: setID, filler: true, name: character.name, characterID: character.id, formID: nil,
            rarity: tier, featured: [], excludedVersions: [], ownVersions: [],
            cardShift: shift, createdWeek: week
        ))
    }
}
