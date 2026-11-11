import Foundation

// Save migrations. Each step changes the JSON of an old world to the next
// version, before the decoder reads it.

extension World {
    public enum MigrationError: Error, Equatable {
        case notAWorld
        case missingSeed
    }

    /// Changes the JSON object of a world to the current version.
    public static func migrate(_ world: inout [String: Any]) throws {
        guard let version = world["version"] as? Int else { throw MigrationError.notAWorld }
        if version < 2 { try migrateFormsIntoCharacters(&world) }
        if version < 3 { try addCatalog(&world) }
        if version < 4 { try addThemes(&world) }
        if version < 5 { try addFrameStyles(&world) }
        if version < 6 { try moveLooksToTiers(&world) }
        if version < 7 { try addVersions(&world) }
        if version < 8 { try addSetIdentity(&world) }
        if version < 9 { try addFiller(&world) }
        if version < 10 { try addPacks(&world) }
        if version < 11 { try addEras(&world) }
    }

    /// Version 1 to 2 (R23). In version 1, a form was a separate character
    /// with a `formOf` link. In version 2, a form lives inside its character
    /// and shares the character's popularity.
    ///
    /// - The form keeps its ID, name, feel, look, buzz, and creation week.
    /// - The form's appeal shift is half of the difference between its old
    ///   random appeal and its character's random appeal.
    /// - The form's own awareness and affection end. The form now uses its character's.
    /// - Links from other characters to the old form entry are removed.
    static func migrateFormsIntoCharacters(_ world: inout [String: Any]) throws {
        guard var characters = world["characters"] as? [[String: Any]] else { throw MigrationError.notAWorld }

        let byID = Dictionary(characters.compactMap { c in (c["id"] as? Int).map { ($0, c) } }, uniquingKeysWith: { a, _ in a })
        var formsByBase: [Int: [[String: Any]]] = [:]
        var movedIDs: Set<Int> = []

        for c in characters {
            guard let id = c["id"] as? Int,
                  let baseID = c["formOf"] as? Int,
                  let base = byID[baseID], base["formOf"] == nil
            else { continue }
            formsByBase[baseID, default: []].append(form(from: c, base: base))
            movedIDs.insert(id)
        }

        characters.removeAll { ($0["id"] as? Int).map(movedIDs.contains) ?? false }
        for i in characters.indices {
            var c = characters[i]
            c.removeValue(forKey: "formOf")
            for key in ["evolvesFrom", "counterpart"] {
                if let link = c[key] as? Int, movedIDs.contains(link) { c.removeValue(forKey: key) }
            }
            for key in ["rivals", "companions"] {
                if let links = c[key] as? [Int] { c[key] = links.filter { !movedIDs.contains($0) } }
            }
            let id = c["id"] as? Int ?? -1
            c["forms"] = formsByBase[id] ?? []
            characters[i] = c
        }

        world["characters"] = characters
        world["version"] = 2
    }

    /// Version 2 to 3: an empty catalog with the default ladder and treatments.
    /// The catalog's random stream comes from the world seed, as in a new world.
    static func addCatalog(_ world: inout [String: Any]) throws {
        guard let seed = (world["seed"] as? NSNumber)?.uint64Value else { throw MigrationError.missingSeed }
        var catalog = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(Catalog(seed: streamSeed(seed, stream: 4), themeSeed: 0))
        ) as? [String: Any] ?? [:]
        // Version 3 had no themes. The next step adds them.
        catalog.removeValue(forKey: "themes")
        world["catalog"] = catalog
        world["version"] = 3
    }

    /// Version 3 to 4 (C13): the theme library. In version 3, a set's theme
    /// was an element type. That type's theme in the library has the same ID.
    static func addThemes(_ world: inout [String: Any]) throws {
        guard let seed = (world["seed"] as? NSNumber)?.uint64Value else { throw MigrationError.missingSeed }
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        catalog["themes"] = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(SetTheme.library(seed: streamSeed(seed, stream: 5)))
        )
        world["catalog"] = catalog
        world["version"] = 4
    }

    /// Version 4 to 5 (C14): each tier gets a frame style. A tier in a set or in a
    /// player's preset gets a solid frame, so its look does not change. The locked
    /// default preset becomes the current default ladder. The next step handles treatments.
    static func addFrameStyles(_ world: inout [String: Any]) throws {
        try updateLadders(&world) { tier in
            if tier["frameStyle"] == nil { tier["frameStyle"] = FrameStyle.solid.rawValue }
        }
        world["version"] = 5
    }

    /// Version 5 to 6 (C15): the tier sets the card look and cost, and the treatment
    /// list ends.
    /// - Each tier in a set or in a player's preset gets a plain look and no extra cost,
    ///   so its look does not change.
    /// - The studio's treatment list and each card's treatment are removed. A tier is
    ///   shared by many cards, so one card's treatment cannot move to its tier.
    static func moveLooksToTiers(_ world: inout [String: Any]) throws {
        try updateLadders(&world) { tier in
            if tier["look"] == nil { tier["look"] = try? jsonObject(CardLook.plain) }
        }
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        catalog.removeValue(forKey: "treatments")
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).map { card in
            var c = card
            c.removeValue(forKey: "treatment")
            return c
        }
        world["catalog"] = catalog
        world["version"] = 6
    }

    /// Version 6 to 7 (C16): printed versions. A tier in a set or in a player's
    /// preset gets no extra versions, so its cards do not change. Each card gets
    /// no excluded versions and no versions of its own.
    static func addVersions(_ world: inout [String: Any]) throws {
        try updateLadders(&world) { tier in
            if tier["versions"] == nil { tier["versions"] = [Any]() }
        }
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).map { card in
            var c = card
            if c["excludedVersions"] == nil { c["excludedVersions"] = [Int]() }
            if c["ownVersions"] == nil { c["ownVersions"] = [Any]() }
            return c
        }
        world["catalog"] = catalog
        world["version"] = 7
    }

    /// Version 7 to 8 (sets.md, section 3): each set gets a type, a code, a symbol,
    /// a size, no pair, and no headliner.
    /// - Every old set becomes a main set with the standard symbol.
    /// - The code comes from the set's name, and it is unique.
    /// - The size is the suggested main size, or the set's card count when that is larger.
    static func addSetIdentity(_ world: inout [String: Any]) throws {
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        let cards = catalog["cards"] as? [[String: Any]] ?? []
        var taken: Set<String> = []
        let symbol = try jsonObject(SetSymbol.standard)
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map { set in
            var s = set
            let id = set["id"] as? Int
            let count = cards.filter { ($0["setID"] as? Int) == id }.count
            let code = CardSet.suggestCode(for: set["name"] as? String ?? "", taken: taken)
            taken.insert(code)
            if s["type"] == nil { s["type"] = SetType.main.rawValue }
            if s["code"] == nil { s["code"] = code }
            if s["symbol"] == nil { s["symbol"] = symbol }
            if s["size"] == nil {
                s["size"] = min(CardSet.sizeRange.upperBound, max(SetType.main.suggestedSize, count))
            }
            return s
        }
        world["catalog"] = catalog
        world["version"] = 8
    }

    /// Version 8 to 9 (S4, sets.md section 4): filler cards.
    /// - Each ladder gets filler shares by tier order: 50, 33, and 17 for the three
    ///   most common tiers, or 60 and 40 for a ladder of two tiers. The other tiers get 0.
    /// - Each card is a designed card. Each set has no generated characters.
    /// - An old set has no filler cards. The set screen offers "Make the filler cards".
    static func addFiller(_ world: inout [String: Any]) throws {
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        func shared(_ ladder: [String: Any]) -> [String: Any] {
            var copy = ladder
            let tiers = ladder["tiers"] as? [[String: Any]] ?? []
            let shares = tiers.count == 2 ? [60, 40] : [50, 33, 17]
            copy["tiers"] = tiers.enumerated().map { index, tier in
                var t = tier
                if t["fillerShare"] == nil { t["fillerShare"] = index < shares.count ? shares[index] : 0 }
                return t
            }
            return copy
        }
        let defaultLadder = try jsonObject(RarityLadder.defaultLadder(id: Catalog.defaultLadderID))
        catalog["ladderPresets"] = (catalog["ladderPresets"] as? [[String: Any]] ?? []).map { preset in
            (preset["id"] as? Int) == Catalog.defaultLadderID ? defaultLadder : shared(preset)
        }
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map { set in
            var s = set
            if let ladder = set["ladder"] as? [String: Any] { s["ladder"] = shared(ladder) }
            if s["generated"] == nil { s["generated"] = [Any]() }
            return s
        }
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).map { card in
            var c = card
            if c["filler"] == nil { c["filler"] = false }
            return c
        }
        world["catalog"] = catalog
        world["version"] = 9
    }

    /// Version 9 to 10 (S2, S6): packs. The studio gets the default pack preset.
    /// Each set gets a copy of it, with its tiers matched to the set's ladder by ID,
    /// then by the default ladder's tier names.
    static func addPacks(_ world: inout [String: Any]) throws {
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        let pack = PackLayout.defaultPack(id: Catalog.defaultPackID)
        let source = RarityLadder.defaultLadder(id: Catalog.defaultLadderID)
        if catalog["packPresets"] == nil { catalog["packPresets"] = [try jsonObject(pack)] }
        catalog["sets"] = try (catalog["sets"] as? [[String: Any]] ?? []).map { set in
            var s = set
            if s["pack"] == nil {
                // Read only the tier IDs and names. A full decode of the ladder would
                // need fields that later steps add, for example `secret` (version 11).
                let tiers = ((set["ladder"] as? [String: Any])?["tiers"] as? [[String: Any]] ?? []).compactMap { tier -> RarityTier? in
                    guard let id = tier["id"] as? Int, let name = tier["name"] as? String else { return nil }
                    return RarityTier(id: id, name: name, code: "?", symbol: .circle, color: .slate)
                }
                let ladder = RarityLadder(id: 0, name: "", tiers: tiers)
                s["pack"] = try jsonObject(pack.resolved(against: ladder, source: source))
            }
            return s
        }
        world["catalog"] = catalog
        world["version"] = 10
    }

    /// Version 10 to 11 (S7, S10, S11, S13, S14): eras, secret tiers, subsets, and art sets.
    /// - The studio gets the first era, "Base", with no gimmick. Every set joins it.
    /// - Each tier in a set or in a player's preset is not secret, so card numbers do not
    ///   jump. The locked default preset becomes the current default ladder.
    /// - Each set has no subsets and no art sets. Each card has no gimmick and no subset.
    static func addEras(_ world: inout [String: Any]) throws {
        try updateLadders(&world) { tier in
            if tier["secret"] == nil { tier["secret"] = false }
        }
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        if catalog["eras"] == nil { catalog["eras"] = [try jsonObject(Era.first)] }
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map { set in
            var s = set
            if s["eraID"] == nil { s["eraID"] = Era.first.id }
            if s["subsets"] == nil { s["subsets"] = [Any]() }
            if s["artSets"] == nil { s["artSets"] = [Any]() }
            return s
        }
        catalog["cards"] = (catalog["cards"] as? [[String: Any]] ?? []).map { card in
            var c = card
            if c["gimmick"] == nil { c["gimmick"] = false }
            return c
        }
        world["catalog"] = catalog
        world["version"] = 11
    }

    /// Changes every tier of every ladder: the presets and each set's own copy.
    /// The locked default preset becomes the current default ladder.
    private static func updateLadders(_ world: inout [String: Any], _ change: (inout [String: Any]) -> Void) throws {
        guard var catalog = world["catalog"] as? [String: Any] else { throw MigrationError.notAWorld }
        func changed(_ ladder: [String: Any]) -> [String: Any] {
            var copy = ladder
            copy["tiers"] = (ladder["tiers"] as? [[String: Any]] ?? []).map { tier in
                var t = tier
                change(&t)
                return t
            }
            return copy
        }
        let defaultLadder = try jsonObject(RarityLadder.defaultLadder(id: Catalog.defaultLadderID))
        catalog["ladderPresets"] = (catalog["ladderPresets"] as? [[String: Any]] ?? []).map { preset in
            (preset["id"] as? Int) == Catalog.defaultLadderID ? defaultLadder : changed(preset)
        }
        catalog["sets"] = (catalog["sets"] as? [[String: Any]] ?? []).map { set in
            var s = set
            if let ladder = set["ladder"] as? [String: Any] { s["ladder"] = changed(ladder) }
            return s
        }
        world["catalog"] = catalog
    }

    private static func jsonObject<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: .fragmentsAllowed)
    }

    private static func form(from old: [String: Any], base: [String: Any]) -> [String: Any] {
        func randomPart(_ c: [String: Any]) -> [Double] {
            let truth = c["truth"] as? [String: Any]
            let part = truth?["randomPart"] as? [String: Any]
            return part?["values"] as? [Double] ?? []
        }
        let mine = randomPart(old)
        let theirs = randomPart(base)
        var shift = Array(repeating: 0.0, count: Audience.allCases.count)
        for audience in Audience.allCases where !audience.isDerived {
            let i = audience.rawValue
            if i < mine.count, i < theirs.count { shift[i] = 0.5 * (mine[i] - theirs[i]) }
        }

        var form: [String: Any] = ["appealShift": ["values": shift]]
        for key in ["id", "name", "role", "primaryType", "secondaryType", "archetype", "palette", "body", "buzz", "createdWeek"] {
            if let value = old[key] { form[key] = value }
        }
        // A form has the kind of its character.
        if base["person"] != nil {
            form["person"] = old["person"] ?? base["person"]
        }
        return form
    }
}
