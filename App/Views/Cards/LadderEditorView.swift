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
    /// The saved ladder of a set. When set, the editor warns that a save makes the filler again (S17).
    let saved: RarityLadder?

    @State private var ladder: RarityLadder
    @State private var error: String?

    init(
        title: String,
        initial: RarityLadder,
        editsName: Bool,
        footer: String,
        saved: RarityLadder? = nil,
        onSave: @escaping (RarityLadder) -> String?,
        onCancel: @escaping () -> Void
    ) {
        self.saved = saved
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
            let inversions = RarityFeel.inversions(ladder)
            Section {
                ForEach($ladder.tiers) { $tier in
                    let index = ladder.tiers.firstIndex { $0.id == tier.id } ?? 0
                    let lower = index > 0 ? ladder.tiers[index - 1] : nil
                    NavigationLink {
                        TierEditor(tier: $tier, lower: lower)
                    } label: {
                        TierRow(tier: tier, rank: index + 1, lower: lower, inversion: inversions.first { $0.tier.id == tier.id })
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
                let shares = ladder.tiers.reduce(0) { $0 + $1.fillerShare }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Filler shares: \(shares)%" + (shares == 100 ? "." : ". They must add up to 100%."))
                        .foregroundStyle(shares == 100 ? Color.secondary : Color.red)
                    Text("\(footer) A ladder has \(RarityLadder.tierRange.lowerBound) to \(RarityLadder.tierRange.upperBound) tiers. Tap Edit to reorder or remove tiers. The pack sets the pull rates.")
                }
            }
            FeelSummary(inversions: inversions)
            if let saved, World.ladderResetsFiller(from: saved, to: ladder) {
                Section {
                    Label("Save makes all the filler cards again. A change to the tiers or to the filler shares resets the filler. Your designed cards stay.",
                          systemImage: "arrow.triangle.2.circlepath")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                }
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
    let lower: RarityTier?
    let inversion: FeelInversion?

    var body: some View {
        HStack(spacing: 10) {
            Text("\(rank)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 20)
            HStack(spacing: 4) {
                RaritySymbolView(symbol: tier.symbol, count: tier.symbolCount, size: 10)
                Text(tier.code).font(.caption.weight(.bold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .foregroundStyle(tier.color.prefersDarkText ? .black : .white)
            .background(tier.color.color, in: Capsule())
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(tier.name)
                    Spacer()
                    FeelBadge(score: RarityFeel.score(tier), bad: inversion != nil)
                }
                Text(tier.look.summary + (tier.costPerCopy > 0 ? " · +\(tier.costPerCopy.dollars)" : "")
                     + (tier.versions.isEmpty ? "" : " · also " + tier.versions.map(\.name).joined(separator: ", "))
                     + (tier.fillerShare > 0 ? " · filler \(tier.fillerShare)%" : "")
                     + (tier.secret ? " · secret" : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let inversion {
                    Label("Feels less rare than \(inversion.below.name)", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if let lower {
                    UpgradeLine(lower: lower, tier: tier)
                }
            }
        }
    }
}

/// The feel score of a tier in a small capsule. Red when the tier feels less rare than a more common tier.
private struct FeelBadge: View {
    let score: Int
    let bad: Bool

    var body: some View {
        Label("\(score)", systemImage: "sparkles")
            .font(.caption2.weight(.semibold).monospacedDigit())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(bad ? Color.red : Theme.accent)
            .background((bad ? Color.red : Theme.accent).opacity(0.12), in: Capsule())
            .accessibilityLabel("Feel \(score)")
    }
}

/// The upgrade of a tier over the tier below it, for example "+ Full art, + Silver frame".
private struct UpgradeLine: View {
    let lower: RarityTier
    let tier: RarityTier

    var body: some View {
        let change = RarityFeel.change(from: lower, to: tier)
        let up = change.up.map { "+ " + $0.kind.label(tier) }
        let down = change.down.map { "− " + $0.kind.label(lower) }
        if up.isEmpty && down.isEmpty {
            Text("No upgrade over \(lower.name)").font(.caption).foregroundStyle(.orange)
        } else {
            Text((up + down).joined(separator: ", "))
                .font(.caption)
                .foregroundStyle(up.isEmpty ? .orange : .green)
        }
    }
}

/// The ladder's rarity feel: the warnings, and what they do to the market (C23).
private struct FeelSummary: View {
    let inversions: [FeelInversion]

    var body: some View {
        Section {
            if inversions.isEmpty {
                Label("Each tier feels rarer than the tiers below it.", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            } else {
                ForEach(inversions, id: \.tier.id) { inversion in
                    Label("\(inversion.tier.name) feels less rare than \(inversion.below.name).", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        } header: {
            Text("Rarity feel")
        } footer: {
            Text("The symbol, the layout, the foils, the texture, the stamps, the frame, and a secret number give feel points. Chase collectors buy \(Int(((1 - RarityFeel.demandFactor(inversions: 1)) * 100).rounded()))% less for each rarer tier with cards that feels less rare than a more common tier, down to \(Int(((1 - RarityFeel.demandFactor(inversions: 99)) * 100).rounded()))% less.")
        }
    }
}

extension FeelPart.Kind {
    /// The part of `tier` that this kind names, for example "Full art".
    func label(_ tier: RarityTier) -> String {
        switch self {
        case .symbol: tier.symbolName
        case .layout: tier.look.layout.name
        case .foil: tier.look.foils.map(\.name).joined(separator: " + ")
        case .texture: "Textured"
        case .stamp: tier.look.stamps.map(\.name).joined(separator: " + ")
        case .frame: "\(tier.frameStyle.name) frame"
        case .secret: "Secret number"
        }
    }
}

/// One tier: name, code, symbol, and color. All flavor.
private struct TierEditor: View {
    @Binding var tier: RarityTier
    /// The more common tier just below this one, for the upgrade line.
    let lower: RarityTier?

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
                LabeledContent("Feel") {
                    FeelBadge(score: RarityFeel.score(tier), bad: lower.map { RarityFeel.score($0) > RarityFeel.score(tier) } ?? false)
                }
                if let lower {
                    LabeledContent("Over \(lower.name)") { UpgradeLine(lower: lower, tier: tier) }
                }
            } header: {
                Text("Rarity feel")
            } footer: {
                Text("How rare the cards look. A rarer tier must feel rarer than the tiers below it, or chase collectors buy less.")
            }
            Section {
                Stepper(value: $tier.fillerShare, in: 0...100) {
                    LabeledContent("Filler share", value: "\(tier.fillerShare)%")
                }
                .accessibilityLabel("Filler share")
                .accessibilityValue("\(tier.fillerShare)%")
                Slider(
                    value: Binding(get: { Double(tier.fillerShare) }, set: { tier.fillerShare = Int($0.rounded()) }),
                    in: 0...100
                )
                .accessibilityLabel("Filler share slider")
            } header: {
                Text("Filler")
            } footer: {
                Text("The share of the set's filler cards at this tier. The game makes the filler cards. The shares of all tiers must add up to 100%. A tier with 0% has only the cards that you design.")
            }
            Section {
                Toggle("Secret", isOn: $tier.secret)
            } footer: {
                Text("A secret tier's cards number above the printed set total, for example 205/191. The set looks smaller than it is, and collectors chase the master set.")
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
            Section {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 10) {
                    ForEach(RaritySymbol.allCases) { symbol in
                        let selected = tier.symbol == symbol
                        Button {
                            tier.tapSymbol(symbol)
                        } label: {
                            RaritySymbolView(symbol: symbol, count: selected ? tier.symbolCount : 1, size: selected && tier.symbolCount > 2 ? 9 : 13)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(selected ? Theme.accent.opacity(0.18) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(symbol.name)
                        .accessibilityValue(selected ? "\(tier.symbolCount)" : "")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            } header: {
                Text("Symbol")
            } footer: {
                Text("Tap a symbol again to show it two or three times. A fourth tap goes back to one.")
            }
            Section {
                LookFields(look: $tier.look)
            } header: {
                Text("Card look")
            } footer: {
                Text(tier.look.layout.hint + " Every card at this tier gets this look.")
            }
            PrintCostSection(look: tier.look, frame: tier.frameStyle)
            Section {
                ForEach(tier.versions) { version in
                    NavigationLink {
                        VersionEditor(version: $tier.versions.version(version.id, fallback: version), tier: tier) {
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
