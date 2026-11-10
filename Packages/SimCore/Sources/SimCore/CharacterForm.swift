// A form of a character (decision R23, model C). Example: a mega form.
//
// A form is part of its character, not a separate roster entry. The form
// shares the character's popularity: awareness, affection, and knowledge.
// The form adds a small appeal adjustment and its own buzz.

public typealias FormID = Int

public struct CharacterForm: Codable, Sendable, Equatable, Identifiable {
    /// Unique in the world. Forms and characters use one ID counter.
    public let id: FormID

    // MARK: Feel (the player sets these)

    /// FLAVOR.
    public internal(set) var name: String
    /// Reader: the form's appeal adjustment (role × audience fit).
    public internal(set) var role: Role
    /// Reader: the form's appeal adjustment (type × audience fit).
    public internal(set) var primaryType: ElementType
    /// Reader: the form's appeal adjustment, at half weight.
    public internal(set) var secondaryType: ElementType?
    /// Reader: the form's appeal adjustment (archetype × audience fit).
    public internal(set) var archetype: Archetype
    /// Reader: special-rarity match (set design, not built yet).
    public internal(set) var palette: [PaletteColor]
    /// FLAVOR. The creature drawing only.
    public internal(set) var body: BodyParts
    /// FLAVOR. The person drawing only. Nil when the character is a creature.
    public internal(set) var person: PersonParts?

    /// FLAVOR. A form always has the kind of its character.
    public var kind: CharacterKind { person == nil ? .creature : .person }

    // MARK: Hidden truth

    /// The form's own appeal adjustment for each audience. It adds to the
    /// character's true appeal. Reader: demand for a card that shows this form
    /// (set design, not built yet).
    public internal(set) var appealShift: AudienceValues

    // MARK: Visible state

    /// The form's own short-term attention, 0...100. A form's buzz also lifts
    /// its character's buzz (World.formBuzzLift).
    public internal(set) var buzz: Double
    /// The week the form joined the roster.
    public let createdWeek: Int
}

extension Character {
    /// The form with this ID, if the character has it.
    public func form(_ id: FormID) -> CharacterForm? {
        forms.first { $0.id == id }
    }

    /// The appeal of one form for one audience: the character's true appeal,
    /// plus part of the fit difference between the form's feel and the
    /// character's feel, plus the form's own shift.
    public func formAppeal(_ form: CharacterForm, _ audience: Audience, fits: FitTables) -> Double {
        let base = trueAppeal(audience, fits: fits)
        guard !audience.isDerived else { return base }
        let formFit = Self.fitPart(
            role: form.role, primaryType: form.primaryType, secondaryType: form.secondaryType,
            archetype: form.archetype, audience: audience, fits: fits
        )
        let fitDelta = formFit - fitPart(audience, fits: fits)
        return Self.clampAppeal(base + World.formFitWeight * fitDelta + form.appealShift[audience])
    }
}
