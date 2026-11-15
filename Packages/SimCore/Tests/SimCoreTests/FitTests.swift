import Testing
@testable import SimCore

@Suite("Fit tables, names, and feel parts")
struct FitTests {
    @Test("Fit tables repeat for a seed and differ for another seed (D8)")
    func seeded() {
        let a = FitTables(seed: 1)
        #expect(a == FitTables(seed: 1))
        #expect(a != FitTables(seed: 2))
    }

    @Test("Fit tables have one row for each value and one column for each audience")
    func shape() {
        let fits = FitTables(seed: 4)
        let audiences = Audience.allCases.count
        #expect(fits.archetype.count == Archetype.allCases.count)
        #expect(fits.type.count == ElementType.allCases.count)
        #expect(fits.role.count == Role.allCases.count)
        #expect(fits.archetype.allSatisfy { $0.count == audiences })
        #expect(fits.type.allSatisfy { $0.count == audiences })
        #expect(fits.role.allSatisfy { $0.count == audiences })
    }

    @Test("Every fit value is in -1...1, and the reseller column is 0")
    func bounds() {
        let fits = FitTables(seed: 5)
        let rows = fits.archetype + fits.type + fits.role
        let reseller = Audience.resellers.rawValue
        let values = rows.flatMap { $0 }
        #expect(values.allSatisfy { $0 >= -1 && $0 <= 1 })
        #expect(rows.allSatisfy { $0[reseller] == 0 })
    }

    @Test("A world perturbs the base tables, so the fit is not the base")
    func perturbed() {
        let fits = FitTables(seed: 6)
        #expect(fits.archetype != FitTables.baseArchetype)
        #expect(fits.type != FitTables.baseType)
        #expect(fits.role != FitTables.baseRole)
    }

    @Test("The fit accessors read the matching table cell")
    func accessors() {
        let fits = FitTables(seed: 7)
        #expect(fits.archetypeFit(.cool, .teens) == fits.archetype[1][2])
        #expect(fits.typeFit(.water, .kids) == fits.type[1][0])
        #expect(fits.roleFit(.mascot, .parents) == fits.role[2][1])
    }

    @Test("A name for a type uses that type's prefix and a suffix")
    func typeNames() {
        var rng = Xoshiro256(seed: 31)
        let name = NameGenerator.name(for: .fire, using: &rng)
        let prefixes = NameGenerator.prefixes[.fire] ?? []
        let hit = prefixes.contains { prefix in
            guard name.hasPrefix(prefix) else { return false }
            return NameGenerator.suffixes.contains(String(name.dropFirst(prefix.count)))
        }
        #expect(hit)
    }

    @Test("A person name comes from the person list (R14)")
    func personNames() {
        var rng = Xoshiro256(seed: 32)
        let name = NameGenerator.name(for: .person, type: .fire, using: &rng)
        #expect(NameGenerator.personNames.contains(name))
    }

    @Test("Names repeat for a seed")
    func nameSeed() {
        var a = Xoshiro256(seed: 33)
        var b = Xoshiro256(seed: 33)
        let first = NameGenerator.name(for: .ice, using: &a)
        let second = NameGenerator.name(for: .ice, using: &b)
        #expect(first == second)
    }

    @Test("A unique name is never in the taken set, and a numeral ends a full pool (R13)")
    func uniqueNames() {
        var taken: Set<String> = []
        for prefix in NameGenerator.prefixes[.stone] ?? [] {
            for suffix in NameGenerator.suffixes { taken.insert((prefix + suffix).lowercased()) }
        }
        var rng = Xoshiro256(seed: 34)
        let name = NameGenerator.uniqueName(for: .stone, taken: taken, using: &rng)
        #expect(!taken.contains(name.lowercased()))
        #expect(name.hasSuffix(" 2"))
        var free = Xoshiro256(seed: 34)
        let easy = NameGenerator.uniqueName(for: .stone, taken: [], using: &free)
        #expect(!easy.contains(" "))
    }

    @Test("Audience facts: eleven audiences, and only resellers are derived (R12)")
    func audiences() {
        #expect(Audience.allCases.count == 11)
        let derived = Audience.allCases.filter(\.isDerived)
        #expect(derived == [.resellers])
        #expect(AudienceValues().values.count == 11)
    }

    @Test("AudienceValues reads, writes, and maps one value for each audience")
    func audienceValues() {
        var values = AudienceValues(repeating: 2)
        values[.teens] = 5
        let doubled = values.map { $0 * 2 }
        #expect(values[.teens] == 5)
        #expect(values[.kids] == 2)
        #expect(doubled[.teens] == 10)
        #expect(doubled[.kids] == 4)
    }

    @Test("The generator colors are 16 different palette colors")
    func generatorColors() {
        let colors = PaletteColor.generatorColors
        #expect(colors.count == 16)
        #expect(Set(colors).count == 16)
    }

    @Test("Random looks repeat for a seed and draw one value for each part")
    func randomLooks() {
        var a = Xoshiro256(seed: 41)
        var b = Xoshiro256(seed: 41)
        #expect(BodyParts.random(using: &a) == BodyParts.random(using: &b))
        var expected = Xoshiro256(seed: 41)
        for _ in 0..<5 { _ = expected.next() }
        #expect(a == expected)
        #expect(PersonParts.random(using: &a) == PersonParts.random(using: &b))
        for _ in 0..<5 { _ = expected.next() }
        #expect(a == expected)
    }
}
