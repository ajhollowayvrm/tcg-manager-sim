import SwiftUI
import SimCore

/// The character creator (roster.md, section 8.3). One step per screen,
/// with a live drawing at the top. The same view does a new character, a
/// redesign, a new form, and a form edit.
struct CreatorView: View {
    enum Mode: Equatable {
        case new
        case mascot
        case starter
        case redesign(CharacterID)
        case form(of: CharacterID)
        case editForm(FormID, of: CharacterID)

        /// A form has the kind of its character, and relations belong to the character.
        var isForm: Bool {
            switch self {
            case .form, .editForm: true
            default: false
            }
        }
    }

    enum Step: CaseIterable {
        case kind, role, type, archetype, palette, body, name, relations

        var title: String {
            switch self {
            case .kind: "Creature or person"
            case .role: "Role"
            case .type: "Type"
            case .archetype: "Personality"
            case .palette: "Colors"
            case .body: "Look"
            case .name: "Name"
            case .relations: "Relations"
            }
        }
    }

    let mode: Mode
    let world: World?
    let title: String
    let confirmLabel: String
    /// Returns an error message, or nil on success.
    let onConfirm: (CharacterDraft) -> String?
    var onCancel: (() -> Void)?

    @State private var draft: CharacterDraft
    @State private var stepIndex = 0
    @State private var error: String?

    init(
        mode: Mode,
        initial: CharacterDraft,
        world: World?,
        title: String,
        confirmLabel: String,
        onConfirm: @escaping (CharacterDraft) -> String?,
        onCancel: (() -> Void)? = nil
    ) {
        self.mode = mode
        self.world = world
        self.title = title
        self.confirmLabel = confirmLabel
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        _draft = State(initialValue: initial)
    }

    private var editingID: CharacterID? {
        if case .redesign(let id) = mode { return id }
        return nil
    }

    /// Characters that this character can link to.
    private var others: [Character] {
        (world?.characters ?? []).filter { $0.id != editingID }
    }

    private var steps: [Step] {
        Step.allCases.filter { step in
            switch step {
            case .kind: !mode.isForm
            case .role: mode != .mascot && mode != .starter
            case .relations: !mode.isForm && !others.isEmpty
            default: true
            }
        }
    }

    private var step: Step { steps[min(stepIndex, steps.count - 1)] }
    private var isLastStep: Bool { stepIndex >= steps.count - 1 }

    private var canAdvance: Bool {
        switch step {
        case .palette: CharacterDraft.paletteRange.contains(draft.palette.count)
        case .name: !draft.trimmedName.isEmpty
        default: true
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            preview
            ProgressView(value: Double(stepIndex + 1), total: Double(steps.count))
                .padding(.horizontal, 16)
                .padding(.top, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(step.title).font(.title2.bold())
                    stepContent
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(stepIndex > 0)
        .toolbar {
            if let onCancel {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selectionSignature)
    }

    /// Every choice except the name, so typing does not cause haptics.
    private var selectionSignature: String {
        var copy = draft
        copy.name = ""
        return String(describing: copy)
    }

    // MARK: Layout

    private var preview: some View {
        VStack(spacing: 4) {
            CharacterDrawing(draft: draft)
                .padding(10)
                .frame(height: 170)
                .frame(maxWidth: .infinity)
                .background(draft.primaryType.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 20))
            Text(draft.trimmedName.isEmpty ? "Unnamed" : draft.trimmedName).font(.headline)
            Text(summary).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var summary: String {
        var parts = [draft.kind.name, draft.role.name, draft.primaryType.name]
        if let secondary = draft.secondaryType { parts[2] += "/\(secondary.name)" }
        parts.append(draft.archetype.name)
        return parts.joined(separator: " · ")
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
                    Text(isLastStep ? confirmLabel : "Next").frame(maxWidth: .infinity)
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
        if isLastStep {
            error = onConfirm(draft)
        } else {
            stepIndex += 1
            error = nil
        }
    }

    // MARK: Steps

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .kind: kindStep
        case .role: roleStep
        case .type: typeStep
        case .archetype: archetypeStep
        case .palette: paletteStep
        case .body: bodyStep
        case .name: nameStep
        case .relations: relationsStep
        }
    }

    private var kindStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Any role can be a creature or a person. A mascot can be either.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                OptionButton(title: "Creature", subtitle: "A monster, a pet, a spirit", symbol: "pawprint.fill", selected: draft.kind == .creature) {
                    draft.kind = .creature
                }
                OptionButton(title: "Person", subtitle: "A human character", symbol: "person.fill", selected: draft.kind == .person) {
                    draft.kind = .person
                }
            }
        }
    }

    private var roleStep: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(Role.allCases) { role in
                OptionButton(title: role.name, subtitle: role.hint, selected: draft.role == role) {
                    draft.role = role
                }
            }
        }
    }

    private var typeStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 10) {
                ForEach(ElementType.allCases) { type in
                    OptionButton(title: type.name, symbol: type.symbol, tint: type.tint, selected: draft.primaryType == type) {
                        let oldDefault = draft.primaryType.defaultPalette
                        draft.primaryType = type
                        if draft.secondaryType == type { draft.secondaryType = nil }
                        // Follow the type's colors until the player picks colors.
                        if draft.palette == oldDefault { draft.palette = type.defaultPalette }
                    }
                }
            }
            Text("Second type (optional)").font(.headline)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 10) {
                OptionButton(title: "None", symbol: "circle.slash", tint: .secondary, selected: draft.secondaryType == nil) {
                    draft.secondaryType = nil
                }
                ForEach(ElementType.allCases.filter { $0 != draft.primaryType }) { type in
                    OptionButton(title: type.name, symbol: type.symbol, tint: type.tint, selected: draft.secondaryType == type) {
                        draft.secondaryType = type
                    }
                }
            }
        }
    }

    private var archetypeStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Different audiences like different personalities. Your release reports will show you which.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(Archetype.allCases) { archetype in
                    OptionButton(title: archetype.name, selected: draft.archetype == archetype) {
                        draft.archetype = archetype
                    }
                }
            }
        }
    }

    private var paletteStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(draft.kind == .person
                 ? "Pick 2 or 3 colors. The first color is the outfit. The second is the hair. The third is the detail."
                 : "Pick 2 or 3 colors. The first color is the body. The second is the accent. The third is the detail.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 14) {
                ForEach(PaletteColor.allCases) { color in
                    let index = draft.palette.firstIndex(of: color)
                    Button {
                        if let index {
                            draft.palette.remove(at: index)
                        } else if draft.palette.count < CharacterDraft.paletteRange.upperBound {
                            draft.palette.append(color)
                        }
                    } label: {
                        VStack(spacing: 4) {
                            ZStack {
                                Circle()
                                    .fill(color.color)
                                    .frame(width: 48, height: 48)
                                    .overlay(Circle().stroke(index != nil ? Theme.accent : .primary.opacity(0.15), lineWidth: index != nil ? 3 : 1))
                                if let index {
                                    Text("\(index + 1)")
                                        .font(.headline)
                                        .foregroundStyle(.white)
                                        .shadow(radius: 2)
                                }
                            }
                            Text(color.name).font(.caption2)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(color.name)
                    .accessibilityAddTraits(index != nil ? .isSelected : [])
                }
            }
        }
    }

    private var bodyStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("The look is for you and your fans. It does not change sales.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if draft.kind == .person {
                skinPicker
                partPicker("Hair", PersonParts.Hair.allCases, $draft.person.hair)
                partPicker("Eyes", PersonParts.Eyes.allCases, $draft.person.eyes)
                partPicker("Outfit", PersonParts.Outfit.allCases, $draft.person.outfit)
                partPicker("Accessory", PersonParts.Accessory.allCases, $draft.person.accessory)
            } else {
                partPicker("Body", BodyParts.Shape.allCases, $draft.body.shape)
                partPicker("Head", BodyParts.Head.allCases, $draft.body.head)
                partPicker("Eyes", BodyParts.Eyes.allCases, $draft.body.eyes)
                partPicker("Tail", BodyParts.Tail.allCases, $draft.body.tail)
                partPicker("Pattern", BodyParts.Pattern.allCases, $draft.body.pattern)
            }
            Button {
                var rng = SystemRandomNumberGenerator()
                if draft.kind == .person {
                    draft.person = PersonParts.random(using: &rng)
                } else {
                    draft.body = BodyParts.random(using: &rng)
                }
            } label: {
                Label("Shuffle the look", systemImage: "shuffle")
            }
            .buttonStyle(.bordered)
        }
    }

    private var skinPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Skin").font(.subheadline.weight(.semibold))
            HStack(spacing: 10) {
                ForEach(PersonParts.Skin.allCases, id: \.self) { tone in
                    let selected = draft.person.skin == tone
                    Button {
                        draft.person.skin = tone
                    } label: {
                        Circle()
                            .fill(tone.color)
                            .frame(width: 40, height: 40)
                            .overlay(Circle().stroke(selected ? Theme.accent : .primary.opacity(0.15), lineWidth: selected ? 3 : 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Self.label(tone.rawValue))
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    private func partPicker<Part: RawRepresentable & Hashable>(
        _ label: String,
        _ options: [Part],
        _ selection: Binding<Part>
    ) -> some View where Part.RawValue == String {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.semibold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.self) { option in
                        let selected = selection.wrappedValue == option
                        Button {
                            selection.wrappedValue = option
                        } label: {
                            Text(Self.label(option.rawValue))
                                .font(.subheadline)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 40)
                                .background(selected ? Theme.accent.opacity(0.18) : Color(.secondarySystemBackground), in: Capsule())
                                .overlay(Capsule().stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// "catEars" -> "Cat ears"
    private static func label(_ raw: String) -> String {
        var words: [String] = []
        var current = ""
        for ch in raw {
            if ch.isUppercase, !current.isEmpty {
                words.append(current)
                current = String(ch).lowercased()
            } else {
                current.append(ch)
            }
        }
        words.append(current)
        let text = words.joined(separator: " ")
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Name", text: $draft.name)
                .font(.title3)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .submitLabel(.done)
            Text("\(draft.trimmedName.count) of \(CharacterDraft.nameLimit) characters")
                .font(.caption)
                .foregroundStyle(draft.trimmedName.count > CharacterDraft.nameLimit ? .red : .secondary)
            Button {
                var rng = SystemRandomNumberGenerator()
                let taken = Set((world?.characters ?? []).map { $0.name.lowercased() })
                draft.name = NameGenerator.uniqueName(for: draft.primaryType, kind: draft.kind, taken: taken, using: &rng)
            } label: {
                Label("Suggest a name", systemImage: "wand.and.stars")
            }
            .buttonStyle(.bordered)
        }
    }

    private var relationsStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("All relations are optional. Later, evolution lines and counterparts will open art sets and parallel sets.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            singlePicker("Evolves from", selection: $draft.evolvesFrom)
            singlePicker("Counterpart", selection: $draft.counterpart)
            multiPicker("Rivals", selection: $draft.rivals)
            multiPicker("Companions", selection: $draft.companions)
        }
    }

    private func singlePicker(_ label: String, selection: Binding<CharacterID?>) -> some View {
        HStack {
            Text(label).font(.subheadline.weight(.semibold))
            Spacer()
            Picker(label, selection: selection) {
                Text("None").tag(CharacterID?.none)
                ForEach(others) { c in
                    Text(c.name).tag(CharacterID?.some(c.id))
                }
            }
            .pickerStyle(.menu)
        }
    }

    private func multiPicker(_ label: String, selection: Binding<[CharacterID]>) -> some View {
        DisclosureGroup {
            VStack(spacing: 0) {
                ForEach(others) { c in
                    let isOn = selection.wrappedValue.contains(c.id)
                    Button {
                        if isOn {
                            selection.wrappedValue.removeAll { $0 == c.id }
                        } else {
                            selection.wrappedValue.append(c.id)
                        }
                    } label: {
                        HStack {
                            CharacterDrawing(character: c).frame(width: 32, height: 32)
                            Text(c.name)
                            Spacer()
                            if isOn { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
                        }
                        .contentShape(Rectangle())
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
            }
        } label: {
            HStack {
                Text(label).font(.subheadline.weight(.semibold))
                Spacer()
                Text(selection.wrappedValue.isEmpty ? "None" : "\(selection.wrappedValue.count) selected")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    NavigationStack {
        CreatorView(
            mode: .new,
            initial: CharacterDraft(),
            world: .sample(),
            title: "New character",
            confirmLabel: "Create",
            onConfirm: { _ in nil },
            onCancel: {}
        )
    }
}
