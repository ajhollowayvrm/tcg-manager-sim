import SwiftUI
import SimCore

/// Edits one rarity ladder: rename, add, remove, and reorder its tiers (C4).
/// It edits a copy, and `onSave` decides where the copy goes: a preset or a set.
struct LadderEditorView: View {
    let title: String
    let editsName: Bool
    let footer: String
    /// Returns an error message, or nil on success.
    let onSave: (RarityLadder) -> String?
    let onCancel: () -> Void

    @State private var ladder: RarityLadder
    @State private var error: String?

    init(
        title: String,
        initial: RarityLadder,
        editsName: Bool,
        footer: String,
        onSave: @escaping (RarityLadder) -> String?,
        onCancel: @escaping () -> Void
    ) {
        self.title = title
        self.editsName = editsName
        self.footer = footer
        self.onSave = onSave
        self.onCancel = onCancel
        _ladder = State(initialValue: initial)
    }

    var body: some View {
        List {
            if editsName {
                Section("Ladder name") {
                    TextField("Ladder name", text: $ladder.name)
                }
            }
            Section {
                ForEach($ladder.tiers) { $tier in
                    NavigationLink {
                        TierEditor(tier: $tier)
                    } label: {
                        TierRow(tier: tier, rank: (ladder.rank(of: tier.id) ?? 0))
                    }
                }
                .onMove { ladder.tiers.move(fromOffsets: $0, toOffset: $1) }
                .onDelete { ladder.tiers.remove(atOffsets: $0) }

                Button {
                    let id = ladder.nextTierID
                    ladder.tiers.append(RarityTier(id: id, name: "New tier \(id)", code: "N\(id)", symbol: .star, color: .violet))
                } label: {
                    Label("Add a tier", systemImage: "plus")
                }
                .disabled(ladder.tiers.count >= RarityLadder.tierRange.upperBound)
            } header: {
                Text("Tiers, from the most common to the rarest")
            } footer: {
                Text("\(footer) A ladder has \(RarityLadder.tierRange.lowerBound) to \(RarityLadder.tierRange.upperBound) tiers. Tap Edit to reorder or remove tiers. Pull rates arrive with the pack design (C9).")
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", action: onCancel)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { error = onSave(ladder) }
            }
            ToolbarItem(placement: .bottomBar) {
                EditButton()
            }
        }
    }
}

private struct TierRow: View {
    let tier: RarityTier
    let rank: Int

    var body: some View {
        HStack(spacing: 10) {
            Text("\(rank)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 20)
            HStack(spacing: 4) {
                RaritySymbolView(symbol: tier.symbol, size: 10)
                Text(tier.code).font(.caption.weight(.bold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .foregroundStyle(.white)
            .background(tier.color.color, in: Capsule())
            VStack(alignment: .leading, spacing: 2) {
                Text(tier.name)
                Text(tier.look.summary + (tier.costPerCopy > 0 ? " · +\(tier.costPerCopy.dollars)" : "")
                     + (tier.versions.isEmpty ? "" : " · also " + tier.versions.map(\.name).joined(separator: ", ")))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// One tier: name, code, symbol, and color. All flavor.
private struct TierEditor: View {
    @Binding var tier: RarityTier

    var body: some View {
        Form {
            Section {
                CardView(face: CardFace(name: tier.name.isEmpty ? "Preview" : tier.name, tier: tier), animated: true)
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
            Section("Name") {
                TextField("Tier name", text: $tier.name)
            }
            Section {
                TextField("Code", text: $tier.code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            } header: {
                Text("Code")
            } footer: {
                Text("1 to \(RarityLadder.codeLimit) characters, for example SIR. The code shows in the card corner.")
            }
            Section("Symbol") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                    ForEach(RaritySymbol.allCases) { symbol in
                        let selected = tier.symbol == symbol
                        Button {
                            tier.symbol = symbol
                        } label: {
                            RaritySymbolView(symbol: symbol, size: 14)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(selected ? Theme.accent.opacity(0.18) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(symbol.name)
                    }
                }
            }
            Section {
                Picker("Layout", selection: $tier.look.layout) {
                    ForEach(CardLayout.allCases) { Text($0.name).tag($0) }
                }
                Picker("Foil", selection: $tier.look.foil) {
                    ForEach(FoilPattern.allCases) { Text($0.name).tag($0) }
                }
                Toggle("Textured surface", isOn: $tier.look.textured)
                Picker("Stamp", selection: $tier.look.stamp) {
                    ForEach(CardStamp.allCases) { Text($0.name).tag($0) }
                }
            } header: {
                Text("Card look")
            } footer: {
                Text(tier.look.layout.hint + " Every card at this tier gets this look.")
            }
            PrintCostSection(look: tier.look, frame: tier.frameStyle)
            Section {
                ForEach($tier.versions) { $version in
                    NavigationLink {
                        VersionEditor(version: $version, tier: tier) {
                            tier.versions.removeAll { $0.id == version.id }
                        }
                    } label: {
                        VersionRow(version: version, tier: tier)
                    }
                }
                .onDelete { tier.versions.remove(atOffsets: $0) }
                Button {
                    let id = tier.nextVersionID
                    tier.versions.append(CardVersion(id: id, name: "Version \(id + 1)", look: CardLook(foil: .reverseHolo)))
                } label: {
                    Label("Add a version", systemImage: "plus")
                }
            } header: {
                Text("Extra versions")
            } footer: {
                Text("Every card at this tier is also printed in these versions, for example a reverse holo. Each version is a separate collectible. A card can turn a version off in the card designer.")
            }
            Section {
                Picker("Frame style", selection: $tier.frameStyle) {
                    ForEach(FrameStyle.allCases) { Text($0.name).tag($0) }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Frame style")
            } footer: {
                Text("Every card at this tier gets this frame. A solid frame uses the color below.")
            }
            Section("Color") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                    ForEach(PaletteColor.allCases) { color in
                        let selected = tier.color == color
                        Button {
                            tier.color = color
                        } label: {
                            Circle()
                                .fill(color.color)
                                .frame(width: 36, height: 36)
                                .overlay(Circle().stroke(selected ? Theme.accent : .primary.opacity(0.15), lineWidth: selected ? 3 : 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(color.name)
                    }
                }
            }
        }
        .navigationTitle(tier.name.isEmpty ? "Tier" : tier.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Studio: the list of ladder presets (C4).
struct LadderPresetsView: View {
    @Environment(GameStore.self) private var store
    @State private var editing: RarityLadder?

    var body: some View {
        List {
            Section {
                ForEach(store.world?.catalog.ladderPresets ?? []) { preset in
                    let isDefault = preset.id == Catalog.defaultLadderID
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(preset.name).font(.headline)
                            if isDefault {
                                Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(preset.tiers.count) tiers").font(.subheadline).foregroundStyle(.secondary)
                        }
                        TierStrip(tiers: preset.tiers)
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if !isDefault { editing = preset }
                    }
                    .swipeActions {
                        Button("Copy", systemImage: "doc.on.doc") { copy(preset) }
                            .tint(.blue)
                        if !isDefault {
                            Button("Delete", systemImage: "trash", role: .destructive) { store.deletePreset(preset.id) }
                        }
                    }
                    .contextMenu {
                        Button("Make a copy", systemImage: "doc.on.doc") { copy(preset) }
                        if !isDefault {
                            Button("Edit", systemImage: "pencil") { editing = preset }
                            Button("Delete", systemImage: "trash", role: .destructive) { store.deletePreset(preset.id) }
                        }
                    }
                }
            } footer: {
                Text("A new set starts from a preset and keeps its own copy. The default ladder cannot change: make a copy, then edit the copy. Swipe or touch and hold a ladder to copy it.")
            }
        }
        .navigationTitle("Rarity ladders")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    copy(store.world?.catalog.preset(Catalog.defaultLadderID))
                } label: {
                    Label("New ladder", systemImage: "plus")
                }
            }
        }
        .sheet(item: $editing) { preset in
            NavigationStack {
                LadderEditorView(
                    title: "Edit ladder",
                    initial: preset,
                    editsName: true,
                    footer: "A change here does not change existing sets.",
                    onSave: { ladder in
                        let error = store.updatePreset(ladder)
                        if error == nil { editing = nil }
                        return error
                    },
                    onCancel: { editing = nil }
                )
            }
            .interactiveDismissDisabled()
        }
    }

    private func copy(_ preset: RarityLadder?) {
        guard let preset, let world = store.world else { return }
        let taken = Set(world.catalog.ladderPresets.map { $0.name.lowercased() })
        var name = "\(preset.name.replacingOccurrences(of: " (default)", with: "")) copy"
        var index = 2
        while taken.contains(name.lowercased()) {
            name = "\(preset.name.replacingOccurrences(of: " (default)", with: "")) copy \(index)"
            index += 1
        }
        if case .success(let id) = store.createPreset(copying: preset.id, name: name),
           let created = store.world?.catalog.preset(id) {
            editing = created
        }
    }
}
