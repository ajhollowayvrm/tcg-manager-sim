import SwiftUI
import SimCore

// The type, code, symbol, size, and headliner of a set (sets.md, section 3).

extension SetSymbolShape {
    var systemImage: String {
        switch self {
        case .star: "star.fill"
        case .bolt: "bolt.fill"
        case .flame: "flame.fill"
        case .leaf: "leaf.fill"
        case .drop: "drop.fill"
        case .moon: "moon.fill"
        case .sun: "sun.max.fill"
        case .crown: "crown.fill"
        case .shield: "shield.fill"
        case .gem: "diamond.fill"
        case .wave: "water.waves"
        case .mountain: "mountain.2.fill"
        case .key: "key.fill"
        case .swords: "figure.fencing"
        case .sparkle: "sparkles"
        case .eye: "eye.fill"
        }
    }

    var name: String {
        switch self {
        case .gem: "Gem"
        default: rawValue.capitalized
        }
    }
}

/// A set symbol: a white shape on a disc of the symbol's color.
struct SetSymbolView: View {
    let symbol: SetSymbol
    var size: CGFloat = 28

    var body: some View {
        Image(systemName: symbol.shape.systemImage)
            .font(.system(size: size * 0.5, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(symbol.color.color, in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.6), lineWidth: size > 24 ? 2 : 1))
            .accessibilityHidden(true)
    }
}

/// A form row that opens the symbol picker.
struct SetSymbolRow: View {
    @Binding var symbol: SetSymbol
    var label = "Symbol"

    var body: some View {
        NavigationLink {
            SetSymbolPicker(symbol: $symbol)
        } label: {
            LabeledContent(label) {
                SetSymbolView(symbol: symbol, size: 26)
            }
        }
        .accessibilityLabel("\(label): \(symbol.shape.name), \(symbol.color.name)")
    }
}

private struct SetSymbolPicker: View {
    @Binding var symbol: SetSymbol

    var body: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    SetSymbolView(symbol: symbol, size: 72)
                    Spacer()
                }
                .padding(.vertical, 8)
            }
            Section("Shape") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                    ForEach(SetSymbolShape.allCases) { shape in
                        let selected = symbol.shape == shape
                        Button {
                            symbol.shape = shape
                        } label: {
                            Image(systemName: shape.systemImage)
                                .font(.title3)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(selected ? Theme.accent.opacity(0.18) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Shape \(shape.name)")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
            Section("Color") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                    ForEach(PaletteColor.allCases) { color in
                        let selected = symbol.color == color
                        Button {
                            symbol.color = color
                        } label: {
                            Circle()
                                .fill(color.color)
                                .frame(width: 36, height: 36)
                                .overlay(Circle().stroke(selected ? Theme.accent : .primary.opacity(0.15), lineWidth: selected ? 3 : 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Color \(color.name)")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
        }
        .navigationTitle("Set symbol")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The set size: a slider for large steps and a stepper for single cards (S3, S8).
struct SetSizeSection: View {
    @Binding var size: Int
    /// The designed cards that the set already has.
    var designed = 0
    var title = "Size"

    var body: some View {
        Section {
            Stepper(value: $size, in: max(CardSet.sizeRange.lowerBound, designed)...CardSet.sizeRange.upperBound) {
                LabeledContent("Total cards", value: "\(size)")
            }
            .accessibilityLabel(title == "Size" ? "Total cards" : "\(title), total cards")
            .accessibilityValue("\(size)")
            Slider(
                value: Binding(get: { Double(size) }, set: { size = max(designed, Int(($0 / 5).rounded()) * 5) }),
                in: Double(CardSet.sizeRange.lowerBound)...Double(CardSet.sizeRange.upperBound)
            )
            .accessibilityLabel(title == "Size" ? "Set size" : title)
        } header: {
            Text(title)
        } footer: {
            Text(footer)
        }
    }

    private var footer: String {
        let filler = max(0, size - designed)
        let base = designed > 0
            ? "\(designed) designed cards and \(filler) filler cards."
            : "You design 10 to 20 cards. The game makes the other \(max(0, size - 15)) or so as filler cards."
        return base + " A larger set makes each single card rarer in packs. The market also reacts to the size: some buyers like small sets, and some like large sets."
    }
}

/// A form row that opens the headliner picker (R7, R18).
struct HeadlinerRow: View {
    @Environment(GameStore.self) private var store
    @Binding var headliner: Headliner?

    var body: some View {
        NavigationLink {
            HeadlinerPicker(headliner: $headliner)
        } label: {
            LabeledContent("Headliner") {
                if let headliner, let world = store.world, let label = HeadlinerLabel(world: world, headliner: headliner) {
                    HStack(spacing: 6) {
                        label.drawing.frame(width: 28, height: 28)
                        Text(label.name)
                    }
                } else {
                    Text("None")
                }
            }
        }
    }
}

/// The drawing and the name of a headliner.
struct HeadlinerLabel {
    let name: String
    let drawing: CharacterDrawing

    init?(world: World, headliner: Headliner) {
        guard let character = world.character(headliner.characterID) else { return nil }
        if let formID = headliner.formID, let form = character.form(formID) {
            name = form.name
            drawing = CharacterDrawing(form: form)
        } else {
            name = character.name
            drawing = CharacterDrawing(character: character)
        }
    }
}

private struct HeadlinerPicker: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Binding var headliner: Headliner?
    @State private var search = ""

    var body: some View {
        let characters = (store.world?.characters ?? []).filter {
            search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)
                || $0.forms.contains { $0.name.localizedCaseInsensitiveContains(search) }
        }
        List {
            Section {
                row(name: "None", selected: headliner == nil, drawing: nil) { headliner = nil }
            } footer: {
                Text("The headliner is on the pack art and the box art. Later, the market lifts the whole set with the headliner's appeal. A form can be the headliner.")
            }
            ForEach(characters) { character in
                Section {
                    row(
                        name: character.name,
                        selected: headliner == Headliner(characterID: character.id),
                        drawing: CharacterDrawing(character: character)
                    ) { headliner = Headliner(characterID: character.id) }
                    ForEach(character.forms) { form in
                        row(
                            name: form.name,
                            selected: headliner == Headliner(characterID: character.id, formID: form.id),
                            drawing: CharacterDrawing(form: form)
                        ) { headliner = Headliner(characterID: character.id, formID: form.id) }
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "Search the roster")
        .navigationTitle("Headliner")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(name: String, selected: Bool, drawing: CharacterDrawing?, action: @escaping () -> Void) -> some View {
        Button {
            action()
            dismiss()
        } label: {
            HStack(spacing: 12) {
                if let drawing {
                    drawing.frame(width: 36, height: 36)
                } else {
                    Image(systemName: "circle.slash").frame(width: 36, height: 36)
                }
                Text(name).foregroundStyle(.primary)
                Spacer()
                if selected { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
            }
        }
        .accessibilityLabel("Headliner \(name)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The name, code, and symbol of one set. The code follows the name until the
/// player changes the code.
struct SetNameFields: View {
    @Environment(GameStore.self) private var store
    @Binding var details: SetDetails
    /// Codes that the other half of a parallel pair uses.
    var otherCodes: Set<String> = []
    var namePrompt = "Set name"
    /// True in the new set sheet. When the player edits a saved set, the code stays.
    var followsName = true
    @State private var codeEdited = false

    var body: some View {
        TextField(namePrompt, text: $details.name)
            .textInputAutocapitalization(.words)
            .onChange(of: details.name) { _, name in
                guard followsName, !codeEdited, let catalog = store.world?.catalog else { return }
                let taken = Set(catalog.sets.map(\.code)).union(otherCodes)
                details.code = CardSet.suggestCode(for: name, taken: taken)
            }
        LabeledContent("Code") {
            TextField("Code", text: Binding(
                get: { details.code },
                set: { details.code = String($0.uppercased().filter { $0.isASCII && $0.isLetter }.prefix(CardSet.codeRange.upperBound)); codeEdited = true }
            ))
            .multilineTextAlignment(.trailing)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .accessibilityIdentifier(namePrompt == "Set name" ? "Set code" : "\(namePrompt) code")
        }
        SetSymbolRow(symbol: $details.symbol)
    }
}
