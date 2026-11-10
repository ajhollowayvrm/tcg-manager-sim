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
