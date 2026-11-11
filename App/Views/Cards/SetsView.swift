import SwiftUI
import SimCore

/// A navigation value for a set. A wrapper, so that a set ID and a character ID
/// cannot open the wrong screen.
struct SetRoute: Hashable {
    let id: SetID
}

/// The Sets tab (cards.md, section 7.1).
struct SetsView: View {
    @Environment(GameStore.self) private var store
    @State private var creating = false
    @State private var path: [SetRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let world = store.world, !world.catalog.sets.isEmpty {
                    List {
                        // The sets grouped by era, the newest era first (S7).
                        ForEach(world.catalog.eras.reversed()) { era in
                            let sets = world.catalog.sets.filter { $0.eraID == era.id }.reversed()
                            if !sets.isEmpty {
                                Section {
                                    ForEach(Array(sets)) { set in
                                        NavigationLink(value: SetRoute(id: set.id)) {
                                            SetRow(set: set, theme: set.theme.flatMap(world.catalog.theme), count: world.catalog.cards(in: set.id).count)
                                        }
                                    }
                                } header: {
                                    HStack(spacing: 6) {
                                        Text(era.name)
                                        if let gimmick = era.gimmick {
                                            Text(gimmick.name).italic().foregroundStyle(gimmick.color.color)
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    ContentUnavailableView {
                        Label("No sets yet", systemImage: "rectangle.stack")
                    } description: {
                        Text("A set is a group of cards that release together. Create a set, then design its cards.")
                    } actions: {
                        Button("Create a set") { creating = true }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Sets")
            .navigationDestination(for: SetRoute.self) { route in
                SetDetailView(setID: route.id)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        creating = true
                    } label: {
                        Label("New set", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $creating) {
                NavigationStack {
                    NewSetForm { id in
                        creating = false
                        path.append(SetRoute(id: id))
                    } onCancel: {
                        creating = false
                    }
                }
            }
        }
    }
}

private struct SetRow: View {
    let set: CardSet
    let theme: SetTheme?
    let count: Int

    var body: some View {
        HStack(spacing: 12) {
            SetSymbolView(symbol: set.symbol, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(set.name).font(.headline)
                    Text(set.code).font(.caption.weight(.bold).monospaced()).foregroundStyle(.secondary)
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
    let onCreated: (SetID) -> Void
    let onCancel: () -> Void

    @State private var type = SetType.main
    @State private var first = SetDetails(name: "", code: "", symbol: .standard, size: SetType.main.suggestedSize)
    @State private var second = SetDetails(name: "", code: "", symbol: SetSymbol(shape: .moon, color: .indigo), size: SetType.parallel.suggestedSize)
    @State private var theme: ThemeID?
    @State private var presetID = Catalog.defaultLadderID
    @State private var packID = Catalog.defaultPackID
    @State private var sizeEdited = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                Picker("Type", selection: $type) {
                    ForEach(SetType.allCases) { Text($0 == .parallel ? "Parallel pair" : $0.name).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: type) { _, newType in
                    guard !sizeEdited else { return }
                    first.size = newType.suggestedSize
                    second.size = newType.suggestedSize
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
                Text("The set keeps its own copy of the ladder and the pack. A later change to a preset does not change this set. Edit the presets in Studio.")
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle(type == .parallel ? "New parallel pair" : "New set")
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

    private var typeHint: String {
        switch type {
        case .main: "A full expansion. The game adds 10 to 20 new generated characters on its filler cards."
        case .mini: "A small special set. The game adds 3 to 8 new generated characters."
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

#Preview {
    SetsView()
        .environment(GameStore(preview: .sample()))
}
