import SwiftUI
import SimCore

/// The era designer (docs/design/eras.md, section 6; E2). Five steps, with a live
/// sample card at the top. The same view starts a new era and changes an era.
struct EraDesignerView: View {
    @Environment(GameStore.self) private var store
    /// Nil starts a new era.
    let eraID: EraID?
    let onDone: () -> Void

    enum Step: CaseIterable {
        case name, nameBar, gimmick, defaults, review

        var title: String {
            switch self {
            case .name: "Name and code"
            case .nameBar: "Name bar"
            case .gimmick: "Gimmick"
            case .defaults: "Defaults"
            case .review: "Review"
            }
        }
    }

    @State private var draft: EraDraft
    @State private var hasGimmick: Bool
    @State private var gimmick: Gimmick
    /// The code follows the name until the player types a code.
    @State private var codeEdited: Bool
    @State private var stepIndex = 0
    @State private var error: String?
    /// A change of the ladder cleared the home tier.
    @State private var homeCleared = false

    init(eraID: EraID?, initial: EraDraft, onDone: @escaping () -> Void) {
        self.eraID = eraID
        self.onDone = onDone
        _draft = State(initialValue: initial)
        _hasGimmick = State(initialValue: initial.gimmick != nil)
        _gimmick = State(initialValue: initial.gimmick ?? Gimmick(name: "ex", color: .gold))
        _codeEdited = State(initialValue: eraID != nil)
    }

    private var step: Step { Step.allCases[stepIndex] }
    private var isLastStep: Bool { stepIndex == Step.allCases.count - 1 }
    /// The draft with the gimmick switch applied.
    private var result: EraDraft {
        var d = draft
        d.gimmick = hasGimmick ? gimmick : nil
        return d
    }

    private var canAdvance: Bool {
        switch step {
        case .name: !draft.name.trimmingCharacters(in: .whitespaces).isEmpty && Era.codeRange.contains(draft.code.count)
        case .gimmick: !hasGimmick || !gimmick.name.trimmingCharacters(in: .whitespaces).isEmpty
        default: true
        }
    }

    var body: some View {
        if let world = store.world {
            content(world)
        } else {
            ContentUnavailableView("No game is running", systemImage: "questionmark")
        }
    }

    private func content(_ world: World) -> some View {
        let ladder = world.catalog.preset(draft.ladderPresetID) ?? RarityLadder.defaultLadder(id: Catalog.defaultLadderID)
        return VStack(spacing: 0) {
            sampleCard(world, ladder: ladder)
                .frame(height: 220)
                .padding(.top, 8)
                .animation(.snappy, value: result)
            ProgressView(value: Double(stepIndex + 1), total: Double(Step.allCases.count))
                .padding(.horizontal, 16)
                .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(step.title).font(.title2.bold())
                    switch step {
                    case .name: nameStep(world)
                    case .nameBar: nameBarStep
                    case .gimmick: gimmickStep(ladder)
                    case .defaults: defaultsStep(world)
                    case .review: reviewStep(world, ladder: ladder)
                    }
                    if let error {
                        Text(error).foregroundStyle(.red).font(.subheadline)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            bottomBar
        }
        .navigationTitle(eraID == nil ? "New era" : "Edit era")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
        }
    }

    // MARK: - The sample card

    /// The step's sample: a common card, or a home-tier card with the gimmick.
    private func sampleCard(_ world: World, ladder: RarityLadder) -> some View {
        let gimmickStep = step == .gimmick || step == .review
        let tier = gimmickStep && hasGimmick ? gimmickSampleTier(ladder) : ladder.tiers.first
        return CardView(face: sampleFace(world, tier: tier, withGimmick: gimmickStep && hasGimmick), animated: true)
    }

    /// The home tier, or a tier with a solid frame, or the middle tier.
    private func gimmickSampleTier(_ ladder: RarityLadder) -> RarityTier? {
        if let home = gimmick.homeTierID, let tier = ladder.tier(home) { return tier }
        return ladder.tiers.last { $0.frameStyle == .solid } ?? ladder.tiers.first
    }

    /// A card of the studio's mascot in the era's look. With no mascot, a sample creature.
    private func sampleFace(_ world: World, tier: RarityTier?, withGimmick: Bool) -> CardFace {
        let shownGimmick = withGimmick ? gimmick : nil
        var face: CardFace
        if let mascot = world.characters.first(where: { $0.role == .mascot }) ?? world.characters.first,
           let ladder = world.catalog.preset(draft.ladderPresetID) {
            let card = CardDraft(name: "\(mascot.name), Era Sample", characterID: mascot.id, rarity: tier?.id)
            face = CardFace(world: world, draft: card, ladder: ladder, gimmick: shownGimmick, eraBar: draft.nameBar)
        } else {
            face = CardFace(name: "Pipkit, Era Sample", tier: tier, version: tier?.baseVersion ?? CardVersion(id: 0, name: "Base", look: .plain))
            face.gimmick = shownGimmick
            face.nameBar = shownGimmick?.nameBar ?? draft.nameBar
            face.frameColor = shownGimmick?.frameColor
        }
        face.number = "001/100"
        return face
    }

    // MARK: - Steps

    private func nameStep(_ world: World) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Era name", text: Binding(get: { draft.name }, set: { name in
                draft.name = name
                if !codeEdited { draft.code = world.catalog.suggestedEraCode(for: name, editing: eraID) }
            }))
            .font(.title3)
            .textFieldStyle(.roundedBorder)
            .textInputAutocapitalization(.words)
            .accessibilityLabel("Era name")
            HStack {
                Text("Code")
                TextField("SV", text: Binding(get: { draft.code }, set: { code in
                    draft.code = String(code.uppercased().filter { $0.isASCII && $0.isLetter }.prefix(Era.codeRange.upperBound))
                    codeEdited = true
                }))
                .font(.title3.monospaced())
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .frame(width: 90)
                .accessibilityLabel("Era code")
                Spacer()
            }
            Text("The code numbers the era's sets: \(draft.code.isEmpty ? "SV" : draft.code)1, \(draft.code.isEmpty ? "SV" : draft.code)2, and a mini set takes .5. Use 2 or 3 letters.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var nameBarStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Every card of the era's sets uses this name bar. A player can date a card by its look.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            NameBarPicker(style: $draft.nameBar, label: "Name bar")
        }
    }

    private func gimmickStep(_ ladder: RarityLadder) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Toggle("Gimmick", isOn: $hasGimmick)
            if hasGimmick {
                TextField("Gimmick name", text: $gimmick.name)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityLabel("Gimmick name")
                Text("Color").font(.headline)
                PaletteGrid(selection: $gimmick.color, label: "Gimmick color")
                Picker("Mark", selection: $gimmick.mark) {
                    ForEach(GimmickMark.allCases) { Text($0.name).tag($0) }
                }
                .pickerStyle(.segmented)
                Text(gimmick.mark.hint).font(.footnote).foregroundStyle(.secondary)

                Divider()
                Text("Gimmick frame").font(.headline)
                Text("A gimmick card uses its own name bar in place of the era's. The tier keeps its layout, foil, and rarity.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                NameBarPicker(style: $gimmick.nameBar, label: "Gimmick name bar")
                Toggle("Own frame color", isOn: Binding(
                    get: { gimmick.frameColor != nil },
                    set: { gimmick.frameColor = $0 ? gimmick.color : nil }
                ))
                if let frame = gimmick.frameColor {
                    PaletteGrid(selection: Binding(get: { frame }, set: { gimmick.frameColor = $0 }), label: "Frame color")
                    Text("On a tier with a solid frame, a gimmick card takes this color. Rainbow, gold, silver, and black frames stay.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Divider()
                Picker("Home tier", selection: $gimmick.homeTierID) {
                    Text("None").tag(TierID?.none)
                    ForEach(ladder.tiers) { tier in Text(tier.name).tag(TierID?.some(tier.id)) }
                }
                .onChange(of: gimmick.homeTierID) { homeCleared = false }
                Text("A new card at the home tier carries the gimmick by default, like the ex cards at Double Rare. A card at another tier can still carry it.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if homeCleared {
                    Label("The new ladder has no such tier. Pick the home tier again.", systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            } else {
                Text("A gimmick is a mark on some cards, for example \"ex\". It has no gameplay. A new gimmick excites the market, and it tires with each set that uses it. An early gimmick, before the studio is popular, does little and can hurt the set.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func defaultsStep(_ world: World) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Rarity ladder", selection: $draft.ladderPresetID) {
                ForEach(world.catalog.ladderPresets) { Text($0.name).tag($0.id) }
            }
            .onChange(of: draft.ladderPresetID) { _, id in
                guard let home = gimmick.homeTierID else { return }
                if world.catalog.preset(id)?.tier(home) == nil {
                    gimmick.homeTierID = nil
                    homeCleared = true
                }
            }
            Picker("Pack", selection: $draft.packPresetID) {
                ForEach(world.catalog.packPresets) { Text($0.name).tag($0.id) }
            }
            Text("A new set of this era starts with this ladder and this pack. You can still pick others for each set. A set keeps its own copy, so a later change here does not change a set.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if homeCleared {
                Label("The new ladder has no such home tier. Pick the home tier again in the Gimmick step.", systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        }
    }

    private func reviewStep(_ world: World, ladder: RarityLadder) -> some View {
        let tiers = reviewTiers(ladder)
        return VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(tiers.enumerated()), id: \.offset) { _, entry in
                        VStack(spacing: 4) {
                            CardView(face: sampleFace(world, tier: entry.tier, withGimmick: entry.gimmick)).frame(width: 110)
                            Text(entry.gimmick ? "\(entry.tier.code) \(gimmick.name)" : entry.tier.code)
                                .font(.caption.weight(.semibold))
                        }
                    }
                }
                .padding(2)
            }
            LabeledContent("Code", value: "\(draft.code): \(draft.code)1, \(draft.code)2, \(draft.code)2.5")
            LabeledContent("Ladder", value: world.catalog.preset(draft.ladderPresetID)?.name ?? "Default")
            LabeledContent("Pack", value: world.catalog.packPreset(draft.packPresetID)?.name ?? "Default")
            if hasGimmick {
                LabeledContent("Home tier", value: gimmick.homeTierID.flatMap(ladder.tier)?.name ?? "None")
            }
            Text(eraID == nil
                ? "\"Start the era\" ends \(world.catalog.currentEra.name). New sets join the new era."
                : "A change to the name bar or the gimmick changes the look of every card of this era's sets.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    /// The most common tier, a Rare, a home-tier gimmick card, and the rarest tier.
    private func reviewTiers(_ ladder: RarityLadder) -> [(tier: RarityTier, gimmick: Bool)] {
        var result: [(tier: RarityTier, gimmick: Bool)] = []
        if let first = ladder.tiers.first { result.append((first, false)) }
        if let rare = ladder.tiers.first(where: { $0.name.lowercased() == "rare" }) ?? ladder.tiers.dropFirst().first,
           !result.contains(where: { $0.tier.id == rare.id }) {
            result.append((rare, false))
        }
        if hasGimmick, let tier = gimmickSampleTier(ladder) { result.append((tier, true)) }
        if let last = ladder.tiers.last, !result.contains(where: { $0.tier.id == last.id && !$0.gimmick }) {
            result.append((last, false))
        }
        return result
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
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
                Text(isLastStep ? (eraID == nil ? "Start the era" : "Save") : "Next").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canAdvance)
        }
        .controlSize(.large)
        .padding(16)
        .background(.bar)
    }

    private func advance() {
        guard isLastStep else {
            stepIndex += 1
            error = nil
            return
        }
        error = eraID.map { store.updateEra($0, result) } ?? store.startEra(result)
        if error == nil { onDone() }
    }
}

// MARK: - Parts

/// The shape and the color of a name bar (eras.md, section 2.2).
private struct NameBarPicker: View {
    @Binding var style: NameBarStyle
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("\(label) shape", selection: $style.shape) {
                ForEach(NameBarShape.allCases) { Text($0.name).tag($0) }
            }
            .pickerStyle(.segmented)
            if style.shape != .plain {
                PaletteGrid(selection: $style.color, label: "\(label) color")
            } else {
                Text("No bar. The name sits on the frame with a shadow.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

/// The 16 palette colors as a grid of circles.
struct PaletteGrid: View {
    @Binding var selection: PaletteColor
    let label: String

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
            ForEach(PaletteColor.allCases) { color in
                Button {
                    selection = color
                } label: {
                    Circle()
                        .fill(color.color)
                        .frame(width: 28, height: 28)
                        .overlay(Circle().stroke(selection == color ? Theme.accent : .primary.opacity(0.15),
                                                 lineWidth: selection == color ? 3 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(label) \(color.name)")
                .accessibilityAddTraits(selection == color ? .isSelected : [])
            }
        }
    }
}

extension NameBarShape {
    var name: String {
        switch self {
        case .rounded: "Rounded"
        case .square: "Square"
        case .banner: "Banner"
        case .plain: "None"
        }
    }
}

extension GimmickMark {
    var name: String {
        switch self {
        case .word: "Word"
        case .badge: "Badge"
        case .logo: "Logo"
        }
    }

    var hint: String {
        switch self {
        case .word: "The gimmick word in its color, after the character name."
        case .badge: "The gimmick word in a colored block, after the character name."
        case .logo: "A large, heavy gimmick word, after the character name."
        }
    }
}
