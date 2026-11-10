// Sample worlds for SwiftUI previews and tests.
//
// `applyPreviewExposure` sets awareness, knowledge and buzz directly. No real
// game path does this. It exists only so that previews can show filled
// screens before the set and market systems exist.

extension World {
    public static func sample(seed: UInt64 = 42) -> World {
        var world = World(seed: seed, studioName: "Sample Studio")
        do {
            let mascot = try world.createCharacter(CharacterDraft(
                name: "Pipkit", role: .mascot, primaryType: .storm, archetype: .cute,
                palette: [.sunflower, .ember, .cream],
                body: BodyParts(shape: .round, head: .longEars, eyes: .sparkle, tail: .flame, pattern: .belly)
            ))
            let ember = try world.createCharacter(CharacterDraft(
                name: "Ember", role: .starter, primaryType: .fire, archetype: .fierce,
                palette: [.crimson, .gold],
                body: BodyParts(shape: .egg, head: .horns, eyes: .sharp, tail: .flame, pattern: .belly)
            ))
            try world.createCharacter(CharacterDraft(
                name: "Emberax", role: .starter, primaryType: .fire, secondaryType: .dragon, archetype: .majestic,
                palette: [.crimson, .charcoal, .gold],
                body: BodyParts(shape: .tall, head: .crest, eyes: .sharp, tail: .long, pattern: .stripes),
                evolvesFrom: ember
            ))
            try world.createCharacter(CharacterDraft(
                name: "Ripplet", role: .starter, primaryType: .water, archetype: .cute,
                palette: [.ocean, .snow],
                body: BodyParts(shape: .wide, head: .none, eyes: .big, tail: .fin, pattern: .spots),
                rivals: [ember]
            ))
            try world.createCharacter(CharacterDraft(
                name: "Sprigbun", role: .starter, primaryType: .nature, archetype: .goofy,
                palette: [.lime, .forest],
                body: BodyParts(shape: .round, head: .sprout, eyes: .sleepy, tail: .leaf, pattern: .none),
                companions: [mascot]
            ))
            let noctra = try world.createCharacter(CharacterDraft(
                name: "Noctra", role: .legendary, primaryType: .shadow, archetype: .mysterious,
                palette: [.charcoal, .violet],
                body: BodyParts(shape: .bird, head: .crest, eyes: .sharp, tail: .long, pattern: .mask)
            ))
            try world.createCharacter(CharacterDraft(
                name: "Solara", role: .legendary, primaryType: .light, archetype: .majestic,
                palette: [.snow, .gold],
                body: BodyParts(shape: .bird, head: .crest, eyes: .round, tail: .long, pattern: .none),
                counterpart: noctra
            ))
            try world.createForm(of: mascot, CharacterDraft(
                name: "Mega Pipkit", role: .legendary, primaryType: .storm, secondaryType: .light, archetype: .majestic,
                palette: [.gold, .ember, .snow],
                body: BodyParts(shape: .tall, head: .longEars, eyes: .sparkle, tail: .flame, pattern: .stripes)
            ))
            try world.createCharacter(CharacterDraft(
                name: "Mara", role: .trainer, primaryType: .storm, archetype: .cool,
                palette: [.indigo, .ember, .gold], kind: .person,
                person: PersonParts(skin: .tan, hair: .ponytail, eyes: .sharp, outfit: .jacket, accessory: .scarf),
                companions: [mascot]
            ))
            try world.generateCharacters(count: 12)

            let set = try world.createSet(name: "Storm Rising", theme: "castles", presetID: Catalog.defaultLadderID)
            let tiers = world.catalog.set(set)?.ladder.tiers ?? []
            let pipkit = world.character(mascot)
            try world.createCard(in: set, CardDraft(name: "Pipkit", characterID: mascot, rarity: tiers[0].id))
            try world.createCard(in: set, CardDraft(name: "Pipkit, Spark Starter", characterID: mascot, rarity: tiers[3].id))
            try world.createCard(in: set, CardDraft(
                name: "Mega Pipkit, Stormcrown", characterID: mascot, formID: pipkit?.forms.first?.id,
                rarity: tiers[7].id, featured: [noctra]
            ))
            try world.createCard(in: set, CardDraft(name: "Ember, First Flame", characterID: ember, rarity: tiers[2].id))
        } catch {
            preconditionFailure("The sample world must build: \(error)")
        }
        world.applyPreviewExposure()
        return world
    }

    /// PREVIEW ONLY. See the file comment.
    public mutating func applyPreviewExposure() {
        var rng = Xoshiro256(seed: seed &+ 99)
        for i in characters.indices {
            let reach = rng.unit()
            for audience in Audience.allCases {
                characters[i].awareness[audience] = min(1, max(0, reach * rng.uniform(0.3, 1)))
                characters[i].knowledge[audience] = rng.uniform(0, 0.8)
            }
            characters[i].buzz = rng.uniform(0, 80)
            characters[i].fatigue = rng.uniform(0, 40)
        }
    }
}
