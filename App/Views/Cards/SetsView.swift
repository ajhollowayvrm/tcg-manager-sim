import SwiftUI
import SimCore

/// A navigation value for a set. A wrapper, so that a set ID and a character ID
/// cannot open the wrong screen.
struct SetRoute: Hashable {
    let id: SetID
}

/// One set in a list: its symbol, name, series number, code, type, and size.
struct SetRow: View {
    let set: CardSet
    let theme: SetTheme?
    let count: Int
    /// The series number in the set's era, for example "SV2" (E6).
    let series: String?

    var body: some View {
        HStack(spacing: 12) {
            SetSymbolView(symbol: set.symbol, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(set.name).font(.headline)
                    Text([series, set.code].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption.weight(.bold).monospaced()).foregroundStyle(.secondary)
                }
                Text([set.type.name, theme?.name, "\(count) of \(set.size) cards", "draft"].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

/// A new set: the type, the name, code, and symbol, the theme, the size, and a
/// ladder preset (sets.md, section 7.1). A parallel pair asks for two names,
/// codes, symbols, and sizes.
struct NewSetForm: View {
    @Environment(GameStore.self) private var store
    /// The types that the sheet offers. An era screen offers the series types,
    /// and the promo screen offers only the promo type (E9).
    let types: [SetType]
    let onCreated: (SetID) -> Void
    let onCancel: () -> Void

    @State private var type: SetType
    @State private var first: SetDetails
    @State private var second = SetDetails(name: "", code: "", symbol: SetSymbol(shape: .moon, color: .indigo), size: SetType.parallel.suggestedSize)
    @State private var theme: ThemeID?
    @State private var presetID = Catalog.defaultLadderID
    @State private var packID = Catalog.defaultPackID
    @State private var sizeEdited = false
    @State private var error: String?

    init(types: [SetType] = [.main, .mini, .parallel], onCreated: @escaping (SetID) -> Void, onCancel: @escaping () -> Void) {
        self.types = types
        self.onCreated = onCreated
        self.onCancel = onCancel
        let type = types.first ?? .main
        _type = State(initialValue: type)
        _first = State(initialValue: SetDetails(name: "", code: "", symbol: .standard, size: type.suggestedSize))
    }

    var body: some View {
        Form {
            Section {
                if types.count > 1 {
                    Picker("Type", selection: $type) {
                        ForEach(types) { Text($0 == .parallel ? "Parallel pair" : $0.name).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: type) { _, newType in
                        guard !sizeEdited else { return }
                        first.size = newType.suggestedSize
                        second.size = newType.suggestedSize
                    }
                }
            } footer: {
                Text(typeHint)
            }
            if type == .parallel {
                Section("First set") {
                    SetNameFields(details: $first, otherCodes: [second.code], namePrompt: "First set name")
                }
                Section("Second set") {
                    SetNameFields(details: $second, otherCodes: [first.code], namePrompt: "Second set name")
                }
            } else {
                Section("Name") {
                    SetNameFields(details: $first)
                }
            }
            Section {
                ThemePickerRow(selection: $theme)
            } footer: {
                Text("The theme is the shape of the set, for example Feudalism or Castles. It also sets the mix of kinds in the filler cards. Later, the market will reward a theme that is in fashion.")
            }
            SetSizeSection(size: sizeBinding($first), title: type == .parallel ? "First set size" : "Size")
            if type == .parallel {
                SetSizeSection(size: sizeBinding($second), title: "Second set size")
            }
            Section {
                Picker("Rarity ladder", selection: $presetID) {
                    ForEach(store.world?.catalog.ladderPresets ?? []) { preset in
                        Text(preset.name).tag(preset.id)
                    }
                }
                if let preset = store.world?.catalog.preset(presetID) {
                    TierStrip(tiers: preset.tiers)
                }
                Picker("Pack", selection: $packID) {
                    ForEach(store.world?.catalog.packPresets ?? []) { pack in
                        Text(pack.name).tag(pack.id)
                    }
                }
            } footer: {
                Text("The current era picks the ladder and the pack first. The set keeps its own copy of both. A later change to a preset does not change this set. Edit the presets in Studio.")
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
        }
        .onAppear(perform: preselectEraPresets)
        .navigationTitle(type == .parallel ? "New parallel pair" : type == .promo ? "New promo set" : "New set")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", action: onCancel)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") {
                    var a = first
                    var b = second
                    a.theme = theme
                    b.theme = theme
                    let result = type == .parallel
                        ? store.createParallelPair(a, b, presetID: presetID, packID: packID)
                        : store.createSet(type, a, presetID: presetID, packID: packID)
                    switch result {
                    case .success(let id): onCreated(id)
                    case .failure(let failure): error = failure.message
                    }
                }
            }
        }
    }

    /// The new set starts with the current era's ladder and pack (eras.md, section 4).
    private func preselectEraPresets() {
        guard let catalog = store.world?.catalog else { return }
        let era = catalog.currentEra
        if catalog.preset(era.ladderPresetID) != nil { presetID = era.ladderPresetID }
        if catalog.packPreset(era.packPresetID) != nil { packID = era.packPresetID }
    }

    private var typeHint: String {
        switch type {
        case .main: "A full expansion. The game adds 10 to 20 new generated characters on its filler cards."
        case .mini: "A special set inside the era, like 151. It takes the number of the main set before it, plus .5. The game adds 3 to 8 new generated characters."
        case .promo: "A small set outside the series numbers, like a McDonald's Collection. It takes the current era's look. Its filler cards reprint characters from your roster."
        case .parallel: "Two sets that release in the same week. Collectors want both. Other buyers split their money between them."
        }
    }

    private func sizeBinding(_ details: Binding<SetDetails>) -> Binding<Int> {
        Binding(get: { details.wrappedValue.size }, set: { details.wrappedValue.size = $0; sizeEdited = true })
    }
}

/// The tiers of a ladder as small colored chips, from common to rarest.
struct TierStrip: View {
    let tiers: [RarityTier]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tiers) { tier in
                    HStack(spacing: 3) {
                        RaritySymbolView(symbol: tier.symbol, size: 9)
                        Text(tier.code).font(.caption.weight(.bold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .foregroundStyle(.white)
                    .background(tier.color.color, in: Capsule())
                }
            }
        }
    }
}

