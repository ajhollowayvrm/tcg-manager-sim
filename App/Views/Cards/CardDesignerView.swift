import SwiftUI
import SimCore

/// The card designer (cards.md, section 7.3). Five steps, one screen each,
/// with the live card at the top. The same view adds a card and changes a card.
/// A new card can take more than one rarity. Each rarity adds a separate card (D1).
struct CardDesignerView: View {
    @Environment(GameStore.self) private var store
    let setID: SetID
    /// Nil adds a new card.
    let cardID: CardID?
    let onDone: () -> Void

    enum Step: CaseIterable {
        case subject, name, rarity, versions, art

        var title: String {
            switch self {
            case .subject: "Subject"
            case .name: "Card name"
            case .rarity: "Rarity"
            case .versions: "Versions"
            case .art: "Art"
            }
        }
    }

    @State private var draft: CardDraft
    @State private var stepIndex = 0
    @State private var error: String?
    @State private var search = ""
    @State private var designingForm = false
    /// The version that the card at the top shows.
    @State private var previewVersion: VersionKey = .base
    /// The card's own version that the version editor shows.
    @State private var editingOwnVersion: VersionID?
    /// New cards only: the picked tiers, from the most common to the rarest.
    /// Each tier adds a separate card (D1). `draft.rarity` is the tier on show.
    @State private var rarities: [TierID]
    /// New cards only: the version choices of each picked tier that is not on show.
    @State private var stashedVersions: [TierID: TierVersions] = [:]

    /// The version choices of one card: the tier versions it turns off, and its own versions.
    struct TierVersions {
        var excluded: [VersionID] = []
        var own: [CardVersion] = []
    }

    init(setID: SetID, cardID: CardID?, initial: CardDraft, onDone: @escaping () -> Void) {
        self.setID = setID
        self.cardID = cardID
        self.onDone = onDone
        _draft = State(initialValue: initial)
        _rarities = State(initialValue: initial.rarity.map { [$0] } ?? [])
    }

    private var step: Step { Step.allCases[stepIndex] }
    private var isLastStep: Bool { stepIndex == Step.allCases.count - 1 }
    /// A new card can take more than one rarity. A saved card has one rarity.
    private var isNew: Bool { cardID == nil }

    private var canAdvance: Bool {
        switch step {
        case .subject: draft.characterID != nil
        case .name: !draft.trimmedName.isEmpty
        case .rarity: isNew ? !rarities.isEmpty : draft.rarity != nil
        default: true
        }
    }

    private var confirmLabel: String {
        if !isNew { return "Save the card" }
        return rarities.count > 1 ? "Add \(rarities.count) cards" : "Add the card"
    }

    var body: some View {
        if let world = store.world, let set = world.catalog.set(setID) {
            content(world, set)
        } else {
            ContentUnavailableView("Set not found", systemImage: "questionmark")
        }
    }

    private func content(_ world: World, _ set: CardSet) -> some View {
        VStack(spacing: 0) {
            CardView(face: CardFace(world: world, draft: draft, ladder: set.ladder, version: previewVersion), animated: true)
                .frame(height: 220)
                .padding(.top, 8)
                .animation(.snappy, value: draft)
            ProgressView(value: Double(stepIndex + 1), total: Double(Step.allCases.count))
                .padding(.horizontal, 16)
                .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(step.title).font(.title2.bold())
                    stepContent(world, set)
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .navigationTitle(cardID == nil ? "New card" : "Change the card")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", action: onDone)
            }
        }
        .sheet(isPresented: $designingForm) {
            if let id = draft.characterID, let character = world.character(id) {
                NavigationStack { newDesign(world, character) }
                    .interactiveDismissDisabled()
            }
        }
        .sensoryFeedback(.selection, trigger: selectionSignature)
    }

    /// Every choice except the name, so typing does not cause haptics.
    private var selectionSignature: String {
        var copy = draft
        copy.name = ""
        return String(describing: copy) + String(describing: rarities)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 12) {
                Button {
                    stepIndex -= 1
                    error = nil
                } label: {
                    Text("Back").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(stepIndex == 0)

                Button {
                    advance()
                } label: {
                    Text(isLastStep ? confirmLabel : "Next")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canAdvance)
            }
            .controlSize(.large)
        }
        .padding(16)
        .background(.bar)
    }

    private func advance() {
        guard isLastStep else {
            stepIndex += 1
            error = nil
            return
        }
        if let cardID {
            error = store.updateCard(cardID, draft)
        } else {
            error = store.createCards(in: setID, newCardDrafts())
        }
        if error == nil { onDone() }
    }

    /// One draft for each picked tier. The subject, name, and art are the same.
    /// The versions belong to each tier.
    private func newCardDrafts() -> [CardDraft] {
        var all = stashedVersions
        if let shown = draft.rarity {
            all[shown] = TierVersions(excluded: draft.excludedVersions, own: draft.ownVersions)
        }
        return rarities.map { id in
            var copy = draft
            let versions = all[id] ?? TierVersions()
            copy.rarity = id
            copy.excludedVersions = versions.excluded
            copy.ownVersions = versions.own
            return copy
        }
    }

    /// Shows a picked tier on the card and in the Versions step. The designer
    /// keeps the version choices of the tier that was on show.
    private func show(_ id: TierID?) {
        guard id != draft.rarity else { return }
        if let shown = draft.rarity {
            stashedVersions[shown] = TierVersions(excluded: draft.excludedVersions, own: draft.ownVersions)
        }
        let next = id.flatMap { stashedVersions.removeValue(forKey: $0) } ?? TierVersions()
        draft.rarity = id
        draft.excludedVersions = next.excluded
        draft.ownVersions = next.own
        previewVersion = .base
    }

    /// New cards only: adds a tier to the picked tiers, or removes it.
    private func toggle(_ tier: RarityTier, in ladder: RarityLadder) {
        if let index = rarities.firstIndex(of: tier.id) {
            rarities.remove(at: index)
            stashedVersions[tier.id] = nil
            if draft.rarity == tier.id {
                // Drop the choices of the removed tier, then show the rarest tier left.
                draft.rarity = nil
                draft.excludedVersions = []
                draft.ownVersions = []
                previewVersion = .base
                show(rarities.last)
            }
        } else {
            rarities.append(tier.id)
            let order = ladder.tiers.map(\.id)
            rarities.sort { (order.firstIndex(of: $0) ?? .max) < (order.firstIndex(of: $1) ?? .max) }
            show(tier.id)
        }
    }

    // MARK: Steps

    @ViewBuilder
    private func stepContent(_ world: World, _ set: CardSet) -> some View {
        switch step {
        case .subject: subjectStep(world)
        case .name: nameStep(world)
        case .rarity: rarityStep(set.ladder)
        case .versions: versionsStep(set.ladder)
        case .art: artStep(world)
        }
    }

    private func subjectStep(_ world: World) -> some View {
        let shown = world.characters.filter {
            search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)
        }
        return VStack(alignment: .leading, spacing: 14) {
            if let id = draft.characterID, let character = world.character(id) {
                formPicker(character)
            }
            Text("Character").font(.headline)
            TextField("Search the roster", text: $search)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 10)], spacing: 12) {
                ForEach(shown) { character in
                    let selected = draft.characterID == character.id
                    Button {
                        pick(character)
                    } label: {
                        VStack(spacing: 4) {
                            CharacterPortrait(character: character, cornerRadius: 12, padding: 6)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.accent : .clear, lineWidth: 3))
                            Text(character.name).font(.caption).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Character \(character.name)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    /// The base form, a saved form, or a new design (R26).
    private func formPicker(_ character: Character) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Form of \(character.name)").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    formChip(title: "Base form", selected: draft.formID == nil, drawing: CharacterDrawing(character: character)) {
                        draft.formID = nil
                    }
                    ForEach(character.forms) { form in
                        formChip(title: form.name, selected: draft.formID == form.id, drawing: CharacterDrawing(form: form)) {
                            draft.formID = form.id
                        }
                    }
                    Button {
                        designingForm = true
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.title)
                                .foregroundStyle(Theme.accent)
                                .frame(width: 64, height: 64)
                                .background(Theme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                            Text("New design").font(.caption.weight(.semibold))
                        }
                        .frame(width: 84)
                    }
                    .buttonStyle(.plain)
                }
            }
            Text("A new design is saved as a form of \(character.name). Later cards can show it again.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func formChip(title: String, selected: Bool, drawing: CharacterDrawing, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                drawing
                    .padding(4)
                    .frame(width: 64, height: 64)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.accent : .clear, lineWidth: 3))
                Text(title).font(.caption).lineLimit(2).multilineTextAlignment(.center)
            }
            .frame(width: 84)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func newDesign(_ world: World, _ character: Character) -> some View {
        var initial = CharacterDraft(from: character)
        initial.name = "Mega \(character.name)"
        return CreatorView(
            mode: .form(of: character.id),
            initial: initial,
            world: world,
            title: "New design of \(character.name)",
            confirmLabel: "Save the design",
            onConfirm: { formDraft in
                switch store.createFormForCard(of: character.id, formDraft) {
                case .success(let id):
                    draft.formID = id
                    designingForm = false
                    return nil
                case .failure(let failure):
                    return failure.message
                }
            },
            onCancel: { designingForm = false }
        )
    }

    private func pick(_ character: Character) {
        let previous = draft.characterID.flatMap { store.world?.character($0) }
        // Follow the character's name until the player types a title.
        if draft.trimmedName.isEmpty || draft.trimmedName == previous?.name {
            draft.name = character.name
        }
        draft.characterID = character.id
        draft.formID = nil
        draft.featured.removeAll { $0 == character.id }
    }

    private func nameStep(_ world: World) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Card name", text: $draft.name)
                .font(.title3)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .submitLabel(.done)
            Text("\(draft.trimmedName.count) of \(Card.nameLimit) characters")
                .font(.caption)
                .foregroundStyle(draft.trimmedName.count > Card.nameLimit ? .red : .secondary)
            Text("Card names use the format \"Character, Title\". For example: Aryla, Destined Trainee.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let id = draft.characterID, let character = world.character(id), !draft.name.contains(",") {
                Button {
                    draft.name = "\(character.name), "
                } label: {
                    Label("Add a title", systemImage: "text.cursor")
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func rarityStep(_ ladder: RarityLadder) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("The rarity gives the card its natural value and its look. The list goes from the most common to the rarest. Edit the looks in the set's rarity ladder.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if isNew {
                Text(rarities.count > 1
                     ? "\(rarities.count) rarities picked. This adds \(rarities.count) separate cards with the same subject, name, and art."
                     : "Pick one or more rarities. Each rarity adds a separate card, for example one character at Rare, Ultra Rare, and SIR.")
                    .font(.subheadline.weight(.semibold))
            }
            ForEach(Array(ladder.tiers.enumerated()), id: \.element.id) { index, tier in
                let selected = isNew ? rarities.contains(tier.id) : draft.rarity == tier.id
                choiceRow(
                    selected: selected,
                    label: "Rarity \(tier.name)"
                ) {
                    if isNew {
                        toggle(tier, in: ladder)
                    } else {
                        if draft.rarity != tier.id {
                            draft.excludedVersions = []
                            previewVersion = .base
                        }
                        draft.rarity = tier.id
                    }
                } content: {
                    Text("\(index + 1)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 20)
                    HStack(spacing: 4) {
                        RaritySymbolView(symbol: tier.symbol, size: 11)
                        Text(tier.code).font(.caption.weight(.bold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .foregroundStyle(.white)
                    .background(tier.color.color, in: Capsule())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tier.name)
                        Text(tier.look.summary).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if tier.costPerCopy > 0 {
                        Text("+\(tier.costPerCopy.dollars)").font(.subheadline).foregroundStyle(.secondary)
                    }
                    if isNew {
                        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(selected ? Theme.accent : .secondary)
                    }
                }
            }
        }
    }

    /// New cards with more than one rarity: picks the card whose versions the step shows.
    @ViewBuilder
    private func rarityPicker(_ ladder: RarityLadder) -> some View {
        if isNew, rarities.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
                Text("Each rarity is a separate card with its own versions. Pick a card:")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(rarities.compactMap(ladder.tier), id: \.id) { tier in
                            let shown = draft.rarity == tier.id
                            Button {
                                show(tier.id)
                            } label: {
                                HStack(spacing: 4) {
                                    RaritySymbolView(symbol: tier.symbol, size: 11)
                                    Text(tier.code).font(.subheadline.weight(.bold))
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .foregroundStyle(.white)
                                .background(tier.color.color, in: Capsule())
                                .overlay(Capsule().stroke(shown ? Theme.accent : .clear, lineWidth: 3))
                                .opacity(shown ? 1 : 0.55)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Versions for \(tier.name)")
                            .accessibilityAddTraits(shown ? .isSelected : [])
                        }
                    }
                    .padding(2)
                }
            }
        }
    }

    /// The tier's versions to keep or turn off, and the card's own versions (C16).
    @ViewBuilder
    private func versionsStep(_ ladder: RarityLadder) -> some View {
        if let tier = draft.rarity.flatMap(ladder.tier) {
            VStack(alignment: .leading, spacing: 10) {
                rarityPicker(ladder)
                Text("Each version is a separate printed collectible. Tap a version to see it on the card above.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                versionChoice(.base, tier.baseVersion, tier, detail: "Every card has it")

                if !tier.versions.isEmpty {
                    Text("From the \(tier.name) tier").font(.headline).padding(.top, 6)
                    ForEach(tier.versions) { version in
                        let isOn = !draft.excludedVersions.contains(version.id)
                        HStack {
                            versionChoice(.tier(version.id), version, tier, detail: nil)
                            Toggle("Print \(version.name)", isOn: Binding(
                                get: { isOn },
                                set: { on in
                                    if on {
                                        draft.excludedVersions.removeAll { $0 == version.id }
                                    } else {
                                        draft.excludedVersions.append(version.id)
                                        if previewVersion == .tier(version.id) { previewVersion = .base }
                                    }
                                }
                            ))
                            .labelsHidden()
                        }
                        .opacity(isOn ? 1 : 0.5)
                    }
                }

                Text("Only this card").font(.headline).padding(.top, 6)
                if draft.ownVersions.isEmpty {
                    Text("For example, a true alt art of this card.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                ForEach(draft.ownVersions) { version in
                    HStack {
                        versionChoice(.own(version.id), version, tier, detail: nil)
                        Button {
                            editingOwnVersion = version.id
                        } label: {
                            Image(systemName: "pencil.circle.fill").font(.title2)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.accent)
                        .accessibilityLabel("Edit \(version.name)")
                    }
                }
                HStack {
                    Button {
                        addOwnVersion(CardVersion.altArt(id: draft.nextOwnVersionID))
                    } label: {
                        Label("Add an alt art", systemImage: "photo.artframe")
                    }
                    Button {
                        let id = draft.nextOwnVersionID
                        addOwnVersion(CardVersion(id: id, name: "Special \(id)", look: CardLook(foil: .galaxy)))
                    } label: {
                        Label("Add a version", systemImage: "plus")
                    }
                }
                .buttonStyle(.bordered)
                .disabled(draft.ownVersions.count >= CardVersion.ownLimit)
            }
            .sheet(isPresented: Binding(get: { editingOwnVersion != nil }, set: { if !$0 { editingOwnVersion = nil } })) {
                if let id = editingOwnVersion, let index = draft.ownVersions.firstIndex(where: { $0.id == id }) {
                    NavigationStack {
                        VersionEditor(version: $draft.ownVersions[index], tier: tier) {
                            draft.ownVersions.removeAll { $0.id == id }
                            if previewVersion == .own(id) { previewVersion = .base }
                            editingOwnVersion = nil
                        }
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { editingOwnVersion = nil }
                            }
                        }
                    }
                }
            }
        } else {
            Text("Pick a rarity first.").foregroundStyle(.secondary)
        }
    }

    private func addOwnVersion(_ version: CardVersion) {
        draft.ownVersions.append(version)
        previewVersion = .own(version.id)
    }

    private func versionChoice(_ key: VersionKey, _ version: CardVersion, _ tier: RarityTier, detail: String?) -> some View {
        choiceRow(selected: previewVersion == key, label: "Version \(version.name)") {
            previewVersion = key
        } content: {
            VersionRow(version: version, tier: tier, face: store.world.flatMap { world in
                draft.setLadder(world, setID).map { CardFace(world: world, draft: draft, ladder: $0, version: key) }
            })
            Spacer()
            if let detail {
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func artStep(_ world: World) -> some View {
        let others = world.characters.filter { $0.id != draft.characterID }
        return VStack(alignment: .leading, spacing: 10) {
            Text("The art can show up to \(Card.featuredLimit) other characters. Each one adds its own appeal. An audience that dislikes a featured character buys less. Artists arrive later.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text("\(draft.featured.count) of \(Card.featuredLimit) selected")
                .font(.subheadline.weight(.semibold))
            ForEach(others) { other in
                let isOn = draft.featured.contains(other.id)
                let full = draft.featured.count >= Card.featuredLimit
                Button {
                    if isOn {
                        draft.featured.removeAll { $0 == other.id }
                    } else if !full {
                        draft.featured.append(other.id)
                    }
                } label: {
                    HStack {
                        CharacterDrawing(character: other).frame(width: 36, height: 36)
                        Text(other.name)
                        Spacer()
                        Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(isOn ? Theme.accent : .secondary)
                    }
                    .contentShape(Rectangle())
                    .frame(minHeight: 44)
                    .opacity(!isOn && full ? 0.4 : 1)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Feature \(other.name)")
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }

    private func choiceRow<Content: View>(
        selected: Bool,
        label: String,
        action: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) { content() }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? Theme.accent.opacity(0.15) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

extension Double {
    /// "$0.02", "$0.015", "$0.25".
    var dollars: String {
        formatted(.currency(code: "USD").precision(.fractionLength(2...3)))
    }
}

#Preview {
    let world = World.sample()
    NavigationStack {
        CardDesignerView(setID: world.catalog.sets[0].id, cardID: nil, initial: CardDraft()) {}
    }
    .environment(GameStore(preview: world))
}

private extension CardDraft {
    /// The ladder of the set that the card is in.
    func setLadder(_ world: World, _ setID: SetID) -> RarityLadder? {
        world.catalog.set(setID)?.ladder
    }
}
