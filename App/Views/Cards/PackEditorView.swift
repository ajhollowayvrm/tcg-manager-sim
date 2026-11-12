import SwiftUI
import SimCore

// Packs and pull rates (docs/design/sets.md, sections 5 and 7.3).

/// Edits a copy of a pack. A pack preset can change its name and its ladder. A
/// set's own pack uses the set's ladder and shows the single-card chances and the warnings.
struct PackEditorView: View {
    @Environment(GameStore.self) private var store
    let title: String
    /// The set's ladder. Nil for a pack preset, which uses the ladder preset it names.
    let fixedLadder: RarityLadder?
    /// The set's cards, designed and filler. Nil for a pack preset.
    let cards: [Card]?
    /// The set's subsets. A subset with its own outcome can go into a slot (S14).
    let subsets: [Subset]
    let onSave: (PackLayout) -> String?
    let onCancel: () -> Void

    @State private var pack: PackLayout
    @State private var error: String?

    init(
        title: String,
        initial: PackLayout,
        fixedLadder: RarityLadder?,
        cards: [Card]?,
        subsets: [Subset] = [],
        onSave: @escaping (PackLayout) -> String?,
        onCancel: @escaping () -> Void
    ) {
        self.title = title
        self.fixedLadder = fixedLadder
        self.cards = cards
        self.subsets = subsets
        self.onSave = onSave
        self.onCancel = onCancel
        _pack = State(initialValue: initial)
    }

    private var ladder: RarityLadder {
        fixedLadder ?? store.world?.catalog.preset(pack.ladderID) ?? RarityLadder.defaultLadder(id: Catalog.defaultLadderID)
    }

    var body: some View {
        let ladder = ladder
        let stats = PackStats(pack: pack, ladder: ladder, cards: cards, subsets: subsets)
        List {
            if fixedLadder == nil {
                Section {
                    TextField("Pack name", text: $pack.name)
                    Picker("Tiers from", selection: $pack.ladderID) {
                        ForEach(store.world?.catalog.ladderPresets ?? []) { Text($0.name).tag($0.id) }
                    }
                } footer: {
                    Text("The slots pick tiers from this ladder. A set matches each tier to its own ladder, first by ID, then by name.")
                }
            }
            Section {
                ForEach(Array(pack.slots.enumerated()), id: \.element.id) { index, slot in
                    NavigationLink {
                        SlotEditor(slot: $pack.slots.slot(slot.id, fallback: slot), number: index + 1, ladder: ladder, subsets: subsets)
                    } label: {
                        SlotRow(slot: slot, number: index + 1, ladder: ladder, subsets: subsets)
                    }
                    .accessibilityLabel("Slot \(index + 1)")
                }
                .onMove { pack.slots.move(fromOffsets: $0, toOffset: $1) }
                .onDelete { pack.slots.remove(atOffsets: $0) }
                Button {
                    let first = ladder.tiers.first.map { PackOutcomeKind.tier($0.id) } ?? .tier(0)
                    pack.slots.append(PackSlot(id: pack.nextSlotID, outcomes: [PackOutcome(id: 1, kind: first, odds: 100)]))
                } label: {
                    Label("Add a slot", systemImage: "plus")
                }
                .disabled(pack.cardCount >= PackLayout.cardRange.upperBound)
            } header: {
                Text("\(pack.cardCount) cards in a pack")
            } footer: {
                Text("Each slot gives one card for each of its positions. The odds in a slot add up to 100%, so a rarer chase takes odds from another outcome in the same slot.")
            }
            Section {
                Stepper(value: $pack.boxSize, in: PackLayout.boxRange) {
                    LabeledContent("Packs in a box", value: "\(pack.boxSize)")
                }
            }
            Section {
                ForEach(stats.lines, id: \.kind) { line in
                    PullRateRow(line: line, label: pack.label(line.kind, ladder: ladder, subsets: subsets), boxSize: stats.boxSize,
                                color: line.kind.tierID.flatMap { ladder.tier($0)?.color.color })
                }
            } header: {
                Text("Pull rates")
            } footer: {
                Text(cards == nil
                     ? "A set also shows the chance of one single card. A larger set makes each single card rarer."
                     : "One card is the chance of one specific card from that pool. A larger set makes each single card rarer.")
            }
            if let cards {
                let warnings = pack.warnings(ladder: ladder, cards: cards, subsets: subsets)
                if !warnings.isEmpty {
                    Section("Warnings") {
                        ForEach(Array(warnings.enumerated()), id: \.offset) { _, warning in
                            Label(warning.message, systemImage: warning.blocksPrint ? "exclamationmark.octagon.fill" : "exclamationmark.triangle")
                                .foregroundStyle(warning.blocksPrint ? .red : .orange)
                                .font(.subheadline)
                        }
                    }
                }
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
            ToolbarItem(placement: .confirmationAction) { Button("Save") { error = onSave(pack) } }
            ToolbarItem(placement: .bottomBar) { EditButton() }
        }
    }
}

/// One slot: its card count and its outcomes as a stacked bar.
private struct SlotRow: View {
    let slot: PackSlot
    let number: Int
    let ladder: RarityLadder
    let subsets: [Subset]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Slot \(number)").font(.headline)
                Spacer()
                Text(slot.count == 1 ? "1 card" : "\(slot.count) cards").font(.subheadline).foregroundStyle(.secondary)
            }
            OddsBar(slot: slot, ladder: ladder).frame(height: 10)
            Text(slot.outcomes.map { "\(PackLayout.labelFor($0.kind, ladder: ladder, subsets: subsets)) \($0.odds.percent)" }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(abs(slot.oddsSum - 100) < 0.001 ? Color.secondary : Color.red)
                .lineLimit(2)
        }
        .padding(.vertical, 4)
    }
}

/// The outcomes of a slot as one bar. Each part's width follows its odds.
private struct OddsBar: View {
    let slot: PackSlot
    let ladder: RarityLadder

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 1) {
                ForEach(slot.outcomes) { outcome in
                    Rectangle()
                        .fill(color(outcome.kind))
                        .frame(width: max(outcome.odds > 0 ? 3 : 0, geo.size.width * min(1, outcome.odds / 100) - 1))
                }
                Spacer(minLength: 0)
            }
        }
        .background(Color(.tertiarySystemFill))
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }

    private func color(_ kind: PackOutcomeKind) -> Color {
        switch kind {
        case .tier(let id): ladder.tier(id)?.color.color ?? .red
        case .version: Color(.systemGray3)
        case .subset: Color(.systemTeal)
        }
    }
}

/// One line of the pull rates.
private struct PullRateRow: View {
    let line: PackStats.Line
    let label: String
    let boxSize: Int
    let color: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Circle().fill(color ?? Color(.systemGray3)).frame(width: 10, height: 10)
                Text(label).font(.subheadline.weight(.semibold))
                Spacer()
                Text(rate).font(.subheadline.monospacedDigit())
            }
            HStack {
                Text("About \((line.perPack * Double(boxSize)).formatted(.number.precision(.fractionLength(0...1)))) in a box")
                Spacer()
                if let single = line.singleOneIn {
                    Text("One card: 1 in \(Int(single.rounded()).formatted()) packs")
                } else if line.pool == 0 {
                    Text("No cards yet")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Pull rate \(label)")
    }

    private var rate: String {
        if line.chance >= 0.5 {
            return "\(line.perPack.formatted(.number.precision(.fractionLength(0...1)))) per pack"
        }
        guard let oneIn = line.oneIn else { return "Never" }
        return "1 in \(Int(oneIn.rounded()).formatted()) packs"
    }
}

/// One slot: its card count and its outcomes with their odds.
private struct SlotEditor: View {
    @Binding var slot: PackSlot
    let number: Int
    let ladder: RarityLadder
    let subsets: [Subset]
    /// The outcomes when the slider drag started. The other outcomes keep this ratio (S15).
    @State private var dragBase: [PackOutcome]?

    private var kinds: [PackOutcomeKind] {
        var names: [String] = []
        for tier in ladder.tiers {
            for version in tier.versions where !names.contains(where: { $0.lowercased() == version.name.lowercased() }) {
                names.append(version.name)
            }
        }
        return ladder.tiers.map { .tier($0.id) } + names.map { .version($0) }
            + subsets.filter(\.ownOutcome).map { .subset($0.id) }
    }

    var body: some View {
        Form {
            Section {
                Stepper(value: $slot.count, in: 1...PackLayout.cardRange.upperBound) {
                    LabeledContent("Cards from this slot", value: "\(slot.count)")
                }
            } footer: {
                Text("For example, 4 cards from a slot that gives only Commons.")
            }
            Section {
                ForEach(Array(slot.outcomes.enumerated()), id: \.element.id) { index, outcome in
                    VStack(alignment: .leading, spacing: 8) {
                        Picker("Gives", selection: kindBinding(index)) {
                            ForEach(kinds, id: \.self) { kind in
                                Text(PackLayout.labelFor(kind, ladder: ladder, subsets: subsets)).tag(kind)
                            }
                            if !kinds.contains(outcome.kind) {
                                Text("Pick a tier").tag(outcome.kind)
                            }
                        }
                        HStack {
                            Slider(value: oddsBinding(index), in: 0...100) { editing in
                                dragBase = editing ? slot.outcomes : nil
                            }
                            .disabled(slot.outcomes.count < 2)
                            .accessibilityLabel("Odds \(PackLayout.labelFor(outcome.kind, ladder: ladder, subsets: subsets))")
                            TextField("Odds", value: oddsBinding(index), format: .number.precision(.fractionLength(0...2)))
                                .keyboardType(.decimalPad)
                                .disabled(slot.outcomes.count < 2)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 64)
                            Text("%").foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onDelete { slot.removeOutcomes(atOffsets: $0) }
                Button {
                    let unused = kinds.first { kind in !slot.outcomes.contains { $0.kind == kind } } ?? .tier(0)
                    slot.outcomes.append(PackOutcome(id: slot.nextOutcomeID, kind: unused, odds: 0))
                } label: {
                    Label("Add an outcome", systemImage: "plus")
                }
            } header: {
                Text("Outcomes")
            } footer: {
                let sum = slot.oddsSum
                VStack(alignment: .leading, spacing: 4) {
                    Text("The odds add up to \(sum.percent).")
                        .foregroundStyle(abs(sum - 100) < 0.001 ? Color.secondary : Color.red)
                    Text("When you change one outcome, the other outcomes share the change by their ratio, so the slot stays at 100%. A reverse holo outcome gives the reverse holo of a card at any tier that has one.")
                }
            }
        }
        .navigationTitle("Slot \(number)")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func kindBinding(_ index: Int) -> Binding<PackOutcomeKind> {
        Binding(
            get: { slot.outcomes.indices.contains(index) ? slot.outcomes[index].kind : .tier(0) },
            set: { if slot.outcomes.indices.contains(index) { slot.outcomes[index].kind = $0 } }
        )
    }

    /// Changes one outcome's odds. The other outcomes rebalance, so the slot
    /// stays at 100% (S15, sets.md section 5.4).
    private func oddsBinding(_ index: Int) -> Binding<Double> {
        Binding(
            get: { slot.outcomes.indices.contains(index) ? slot.outcomes[index].odds : 0 },
            set: { slot.setOdds($0, at: index, base: dragBase) }
        )
    }
}

/// Studio: the list of pack presets (S6).
struct PackPresetsView: View {
    @Environment(GameStore.self) private var store
    @State private var editing: PackLayout?

    var body: some View {
        List {
            Section {
                ForEach(store.world?.catalog.packPresets ?? []) { pack in
                    let isDefault = pack.id == Catalog.defaultPackID
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(pack.name).font(.headline)
                            if isDefault {
                                Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(pack.cardCount) cards · box of \(pack.boxSize)").font(.subheadline).foregroundStyle(.secondary)
                        }
                        Text("Tiers from \(store.world?.catalog.preset(pack.ladderID)?.name ?? "a deleted ladder")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                    .onTapGesture { if !isDefault { editing = pack } }
                    .swipeActions {
                        Button("Copy", systemImage: "doc.on.doc") { copy(pack) }.tint(.blue)
                        if !isDefault {
                            Button("Delete", systemImage: "trash", role: .destructive) { store.deletePackPreset(pack.id) }
                        }
                    }
                    .contextMenu {
                        Button("Make a copy", systemImage: "doc.on.doc") { copy(pack) }
                        if !isDefault {
                            Button("Edit", systemImage: "pencil") { editing = pack }
                            Button("Delete", systemImage: "trash", role: .destructive) { store.deletePackPreset(pack.id) }
                        }
                    }
                }
            } footer: {
                Text("A new set starts from a pack preset and keeps its own copy. The default pack cannot change: make a copy, then edit the copy. Swipe or touch and hold a pack to copy it.")
            }
        }
        .navigationTitle("Pack presets")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    copy(store.world?.catalog.packPreset(Catalog.defaultPackID))
                } label: {
                    Label("New pack", systemImage: "plus")
                }
            }
        }
        .sheet(item: $editing) { pack in
            NavigationStack {
                PackEditorView(
                    title: "Edit pack",
                    initial: pack,
                    fixedLadder: nil,
                    cards: nil,
                    onSave: { edited in
                        let error = store.updatePackPreset(edited)
                        if error == nil { editing = nil }
                        return error
                    },
                    onCancel: { editing = nil }
                )
            }
            .interactiveDismissDisabled()
        }
    }

    private func copy(_ pack: PackLayout?) {
        guard let pack, let world = store.world else { return }
        let taken = Set(world.catalog.packPresets.map { $0.name.lowercased() })
        var name = "\(pack.name) copy"
        var index = 2
        while taken.contains(name.lowercased()) {
            name = "\(pack.name) copy \(index)"
            index += 1
        }
        if case .success(let id) = store.createPackPreset(copying: pack.id, name: String(name.prefix(PackLayout.nameLimit))),
           let created = store.world?.catalog.packPreset(id) {
            editing = created
        }
    }
}

extension PackLayout {
    static func labelFor(_ kind: PackOutcomeKind, ladder: RarityLadder, subsets: [Subset] = []) -> String {
        switch kind {
        case .tier(let id): ladder.tier(id)?.code ?? "?"
        case .version(let name): name
        case .subset(let id): subsets.first { $0.id == id }?.name ?? "Removed subset"
        }
    }
}

extension Double {
    /// "100%", "1.3%", "0.75%".
    var percent: String {
        "\(formatted(.number.precision(.fractionLength(0...2))))%"
    }
}

extension Binding where Value == [PackSlot] {
    /// The slot with this ID. A slot that was removed gives the fallback.
    func slot(_ id: Int, fallback: PackSlot) -> Binding<PackSlot> {
        Binding<PackSlot>(
            get: { wrappedValue.first { $0.id == id } ?? fallback },
            set: { newValue in
                if let i = wrappedValue.firstIndex(where: { $0.id == id }) { wrappedValue[i] = newValue }
            }
        )
    }
}
