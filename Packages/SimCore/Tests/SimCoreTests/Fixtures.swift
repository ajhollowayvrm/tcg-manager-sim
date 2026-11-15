import Testing
@testable import SimCore

/// Shared, cheap test worlds. Each call builds a new value, so tests can run in parallel.
enum Fixture {
    /// A new world with one person mascot.
    static func world(seed: UInt64 = 2026) throws -> (world: World, mascot: CharacterID) {
        var world = World(seed: seed, studioName: "Test")
        let mascot = try world.createCharacter(CharacterDraft(name: "Aryla", role: .mascot, kind: .person))
        return (world, mascot)
    }

    /// A world with a mascot and a small draft main set (10 cards: the smallest size).
    static func studio(seed: UInt64 = 2026, size: Int = 10) throws -> (world: World, set: SetID, mascot: CharacterID) {
        var (world, mascot) = try world(seed: seed)
        let set = try world.createSet(.main, SetDetails(name: "Base", code: "BAS", size: size,
                                                        headliner: Headliner(characterID: mascot)),
                                      presetID: Catalog.defaultLadderID)
        return (world, set, mascot)
    }

    /// The studio with one designed card, the founder as the lead artist, and the
    /// release scheduled at the earliest week. The art is done at once.
    static func scheduled(seed: UInt64 = 2026, size: Int = 10, boxes: Int = 50) throws -> (world: World, set: SetID, mascot: CharacterID) {
        var (world, set, mascot) = try studio(seed: seed, size: size)
        try world.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        try world.setLeadArtist(set, Artist.founderID)
        try world.scheduleRelease(set, boxes: boxes, packPrice: Pricing.defaultPackPrice, releaseWeek: world.week + Pricing.previewWeeks)
        return (world, set, mascot)
    }

    /// The scheduled studio, advanced to its release week.
    static func released(seed: UInt64 = 2026, size: Int = 10, boxes: Int = 50) throws -> (world: World, set: SetID, mascot: CharacterID) {
        var (world, set, mascot) = try scheduled(seed: seed, size: size, boxes: boxes)
        while world.catalog.set(set)?.status != .released { world.advanceWeek() }
        return (world, set, mascot)
    }
}
