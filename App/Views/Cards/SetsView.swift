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
                    List(world.catalog.sets.reversed()) { set in
                        NavigationLink(value: SetRoute(id: set.id)) {
                            SetRow(set: set, theme: set.theme.flatMap(world.catalog.theme), count: world.catalog.cards(in: set.id).count)
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
            Image(systemName: theme?.symbol ?? "rectangle.stack.fill")
                .font(.title2)
                .foregroundStyle(theme?.tint ?? Theme.accent)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(set.name).font(.headline)
                Text([theme?.name, "\(count) \(count == 1 ? "card" : "cards")", "draft"].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

/// A new set: a name, a theme, and a ladder preset (C4, C10).
struct NewSetForm: View {
    @Environment(GameStore.self) private var store
    let onCreated: (SetID) -> Void
    let onCancel: () -> Void

    @State private var name = ""
    @State private var theme: ThemeID?
    @State private var presetID = Catalog.defaultLadderID
    @State private var error: String?

    var body: some View {
        Form {
            Section("Name") {
                TextField("Set name", text: $name)
                    .textInputAutocapitalization(.words)
            }
            Section {
                ThemePickerRow(selection: $theme)
            } footer: {
                Text("The theme is the shape of the set, for example Feudalism or Castles. Later, the market will reward a theme that is in fashion.")
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
            } footer: {
                Text("The set keeps its own copy of the ladder. A later change to the preset does not change this set. Edit the presets in Studio.")
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle("New set")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", action: onCancel)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") {
                    switch store.createSet(name: name, theme: theme, presetID: presetID) {
                    case .success(let id): onCreated(id)
                    case .failure(let failure): error = failure.message
                    }
                }
            }
        }
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
