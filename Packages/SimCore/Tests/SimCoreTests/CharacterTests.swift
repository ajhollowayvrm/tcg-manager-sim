import Testing
@testable import SimCore

@Suite("Character appeal and forms")
struct CharacterTests {
    private func hero() throws -> (world: World, id: CharacterID) {
        var world = World(seed: 77, studioName: "Test")
        let id = try world.createCharacter(CharacterDraft(
            name: "Hero", role: .starter, primaryType: .fire, secondaryType: .dragon, archetype: .fierce
        ))
        return (world, id)
    }

    @Test("A new character has no awareness, buzz, fatigue, knowledge, or affection (R5, R11)")
    func startsAtZero() throws {
        let (world, id) = try hero()
        let c = try #require(world.character(id))
        #expect(c.awareness == AudienceValues())
        #expect(c.knowledge == AudienceValues())
        #expect(c.truth.affection == AudienceValues())
        #expect(c.buzz == 0)
        #expect(c.fatigue == 0)
        #expect(c.status == .active)
        #expect(c.origin == .created)
    }

    @Test("Popularity is awareness times true appeal (R4)")
    func popularity() throws {
        var (world, id) = try hero()
        world.characters[0].awareness[.kids] = 0.5
        let c = try #require(world.character(id))
        let appeal = c.trueAppeal(.kids, fits: world.fits)
        #expect(c.popularity(.kids, fits: world.fits) == 0.5 * appeal)
        #expect(c.popularity(.teens, fits: world.fits) == 0)
    }

    @Test("True appeal is fit plus random part plus affection, kept in the appeal range")
    func trueAppeal() throws {
        var (world, id) = try hero()
        let c = try #require(world.character(id))
        let fit = c.fitPart(.teens, fits: world.fits)
        let expected = Character.clampAppeal(fit + c.truth.randomPart[.teens] + c.truth.affection[.teens])
        #expect(c.trueAppeal(.teens, fits: world.fits) == expected)

        world.characters[0].truth.affection[.teens] = 500
        let high = try #require(world.character(id))
        #expect(high.trueAppeal(.teens, fits: world.fits) == Character.appealRange.upperBound)
        world.characters[0].truth.affection[.teens] = -500
        let low = try #require(world.character(id))
        #expect(low.trueAppeal(.teens, fits: world.fits) == Character.appealRange.lowerBound)
    }

    @Test("The fit part adds a second type at half weight (R1)")
    func fitFormula() throws {
        let (world, id) = try hero()
        let c = try #require(world.character(id))
        let fits = world.fits
        let type = (fits.typeFit(.fire, .kids) + 0.5 * fits.typeFit(.dragon, .kids)) / 1.5
        let expected = 20 + 30 * fits.archetypeFit(.fierce, .kids) + 18 * type + 18 * fits.roleFit(.starter, .kids)
        #expect(c.fitPart(.kids, fits: fits) == expected)
        #expect(c.fitPart(.resellers, fits: fits) == 0)
    }

    @Test("Reseller appeal comes from the other audiences and buzz (R12)")
    func resellerAppeal() throws {
        var (world, id) = try hero()
        world.characters[0].awareness = AudienceValues(repeating: 0.8)
        let calm = try #require(world.character(id))
        world.characters[0].buzz = 100
        let hot = try #require(world.character(id))
        let calmValue = calm.trueAppeal(.resellers, fits: world.fits)
        let hotValue = hot.trueAppeal(.resellers, fits: world.fits)
        #expect(hotValue > calmValue)
        #expect(hotValue <= Character.appealRange.upperBound)
    }

    @Test("A reading is pure, stays in range, and narrows as knowledge grows (R4)")
    func readings() throws {
        var (world, id) = try hero()
        let c = try #require(world.character(id))
        let first = c.reading(.kids, fits: world.fits)
        #expect(first == c.reading(.kids, fits: world.fits))
        #expect(first.low >= Character.appealRange.lowerBound)
        #expect(first.high <= Character.appealRange.upperBound)
        #expect(first.low <= first.mid)
        #expect(first.mid <= first.high)

        world.characters[0].knowledge = AudienceValues(repeating: 1)
        let known = try #require(world.character(id))
        let narrow = known.reading(.kids, fits: world.fits)
        #expect(narrow.high - narrow.low <= 8.000001)
        #expect(first.high - first.low > 8)
    }

    @Test("A form with its character's feel and no shift has its character's appeal (R23)")
    func formSameFeel() throws {
        var (world, id) = try hero()
        let c = try #require(world.character(id))
        var draft = CharacterDraft(from: c)
        draft.name = "Hero Mega"
        let formID = try world.createForm(of: id, draft)
        world.characters[0].forms[0].appealShift = AudienceValues()
        let updated = try #require(world.character(id))
        let form = try #require(updated.form(formID))
        let base = updated.trueAppeal(.kids, fits: world.fits)
        #expect(updated.formAppeal(form, .kids, fits: world.fits) == base)
    }

    @Test("A form moves by half the fit difference plus its shift, and resellers follow the character (R23)")
    func formFormula() throws {
        var (world, id) = try hero()
        let formID = try world.createForm(of: id, CharacterDraft(
            name: "Dark Hero", role: .villain, primaryType: .shadow, archetype: .creepy
        ))
        world.characters[0].forms[0].appealShift[.teens] = 3
        let c = try #require(world.character(id))
        let form = try #require(c.form(formID))
        let fits = world.fits
        let formFit = Character.fitPart(role: .villain, primaryType: .shadow, secondaryType: nil,
                                        archetype: .creepy, audience: .teens, fits: fits)
        let delta = formFit - c.fitPart(.teens, fits: fits)
        let raw = c.trueAppeal(.teens, fits: fits) + World.formFitWeight * delta + 3
        #expect(c.formAppeal(form, .teens, fits: fits) == Character.clampAppeal(raw))
        let reseller = c.formAppeal(form, .resellers, fits: fits)
        #expect(reseller == c.trueAppeal(.resellers, fits: fits))
    }

    @Test("The character kind follows the person look (R14)")
    func kinds() throws {
        let (world, mascot) = try Fixture.world()
        #expect(world.character(mascot)?.kind == .person)
        let (other, id) = try hero()
        #expect(other.character(id)?.kind == .creature)
        #expect(other.character(id)?.person == nil)
    }
}
