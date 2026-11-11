import SwiftUI
import SimCore

// Eras and gimmicks, subsets, and art sets (docs/design/sets.md, sections 6 and 7).

// MARK: - Eras (S7, S13)

/// Studio: the current era, the past eras, and "Start a new era".
struct ErasView: View {
    @Environment(GameStore.self) private var store
    @State private var editing: Era?
    @State private var starting = false

    var body: some View {
        let eras = store.world?.catalog.eras ?? []
        let current = store.world?.catalog.currentEra
        List {
            if let current {
                Section {
                    Button { editing = current } label: { EraRow(era: current, sets: setCount(current.id)) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Era \(current.name)")
                    Button {
                        starting = true
                    } label: {
                        Label("Start a new era", systemImage: "sparkles")
                    }
                } header: {
                    Text("Current era")
                } footer: {
                    Text("New sets join the current era and use its gimmick. A new era ends this one. An early gimmick does little, and it can hurt the set.")
                }
            }
            let past = eras.filter { $0.id != current?.id }.reversed()
            if !past.isEmpty {
                Section("Past eras") {
                    ForEach(Array(past)) { era in
                        Button { editing = era } label: { EraRow(era: era, sets: setCount(era.id)) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationTitle("Eras")
        .sheet(item: $editing) { era in
            NavigationStack {
                EraForm(title: "Edit era", initialName: era.name, initialGimmick: era.gimmick) { name, gimmick in
                    let error = store.updateEra(era.id, name: name, gimmick: gimmick)
                    if error == nil { editing = nil }
                    return error
                } onCancel: { editing = nil }
            }
        }
        .sheet(isPresented: $starting) {
            NavigationStack {
                EraForm(title: "New era", initialName: "", initialGimmick: nil) { name, gimmick in
                    let error = store.startEra(name: name, gimmick: gimmick)
                    if error == nil { starting = false }
                    return error
                } onCancel: { starting = false }
            }
        }
    }

    private func setCount(_ id: EraID) -> Int {
        store.world?.catalog.sets.filter { $0.eraID == id }.count ?? 0
    }
}

private struct EraRow: View {
    let era: Era
    let sets: Int

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(era.name).font(.headline)
                Text(era.endWeek.map { "Weeks \(era.startWeek) to \($0)" } ?? "Since week \(era.startWeek)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(sets) \(sets == 1 ? "set" : "sets")").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if let gimmick = era.gimmick {
                GimmickBadge(gimmick: gimmick)
            } else {
                Text("No gimmick").font(.caption).foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
        .padding(.vertical, 4)
    }
}

/// The gimmick word in its color, for example "ex".
struct GimmickBadge: View {
    let gimmick: Gimmick

    var body: some View {
        Text(gimmick.name)
            .font(.subheadline.weight(.heavy).italic())
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(.white)
            .background(gimmick.color.color, in: Capsule())
    }
}

/// The name of an era, and its gimmick or no gimmick.
private struct EraForm: View {
    let title: String
    let onSave: (String, Gimmick?) -> String?
    let onCancel: () -> Void

    @State private var name: String
    @State private var hasGimmick: Bool
    @State private var gimmick: Gimmick
    @State private var error: String?

    init(title: String, initialName: String, initialGimmick: Gimmick?,
         onSave: @escaping (String, Gimmick?) -> String?, onCancel: @escaping () -> Void) {
        self.title = title
        self.onSave = onSave
        self.onCancel = onCancel
        _name = State(initialValue: initialName)
        _hasGimmick = State(initialValue: initialGimmick != nil)
        _gimmick = State(initialValue: initialGimmick ?? Gimmick(name: "ex", color: .gold))
    }

    var body: some View {
        Form {
            Section("Name") {
                TextField("Era name", text: $name)
                    .textInputAutocapitalization(.words)
            }
            Section {
                Toggle("Gimmick", isOn: $hasGimmick)
                if hasGimmick {
                    TextField("Gimmick name", text: $gimmick.name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
                        ForEach(PaletteColor.allCases) { color in
                            Button {
                                gimmick.color = color
                            } label: {
                                Circle()
                                    .fill(color.color)
                                    .frame(width: 28, height: 28)
                                    .overlay(Circle().stroke(gimmick.color == color ? Theme.accent : .primary.opacity(0.15),
                                                             lineWidth: gimmick.color == color ? 3 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Gimmick color \(color.name)")
                        }
                    }
                    HStack {
                        Text("Example")
                        Spacer()
                        Text("Aryla ") + Text(gimmick.name).foregroundColor(gimmick.color.color).italic().bold()
                    }
                }
            } footer: {
                Text("A gimmick is a mark on some cards, for example \"ex\". It has no gameplay. A new gimmick excites the market, and it tires with each set that uses it. An early gimmick, before the studio is popular, does little and can hurt the set.")
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { error = onSave(name, hasGimmick ? gimmick : nil) }
            }
        }
    }
}

// MARK: - Subsets (S11, S14)

/// The set screen's subsets: each with its cards and its numbers.
struct SubsetsSection: View {
    let world: World
    let set: CardSet
    let numbers: [CardID: String]
    let onEdit: (SubsetID?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Subsets").font(.title2.bold())
            Text("A subset is a sub-collection with its own numbers, for example the Trainer Gallery: TG01/TG30.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ForEach(set.subsets) { subset in
                let cards = world.catalog.cards(in: set.id).filter { $0.subsetID == subset.id }
                Button { onEdit(subset.id) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(subset.prefix).font(.caption.weight(.heavy).monospaced())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Color(.tertiarySystemFill), in: Capsule())
                            Text(subset.name).font(.headline)
                            Spacer()
                            Text(cards.count == 1 ? "1 card" : "\(cards.count) cards").font(.subheadline).foregroundStyle(.secondary)
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                        }
                        Text(subset.ownOutcome ? "Its own pack outcome" : "Pulled through its cards' tiers")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if !cards.isEmpty {
                            CardStrip(world: world, cards: cards, numbers: numbers, width: 56)
                        }
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Subset \(subset.name)")
            }
            if set.subsets.count < Subset.limit {
                Button { onEdit(nil) } label: {
                    Label("Add a subset", systemImage: "square.stack")
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

/// A subset's name, prefix, pack outcome switch, and cards.
struct SubsetEditor: View {
    @Environment(GameStore.self) private var store
    let world: World
    let set: CardSet
    let existing: Subset?
    let onDone: () -> Void

    @State private var name: String
    @State private var prefix: String
    @State private var ownOutcome: Bool
    @State private var members: Set<CardID>
    @State private var error: String?
    @State private var confirmDelete = false

    init(world: World, set: CardSet, existing: Subset?, onDone: @escaping () -> Void) {
        self.world = world
        self.set = set
        self.existing = existing
        self.onDone = onDone
        _name = State(initialValue: existing?.name ?? "")
        _prefix = State(initialValue: existing?.prefix ?? "")
        _ownOutcome = State(initialValue: existing?.ownOutcome ?? false)
        _members = State(initialValue: Set(world.catalog.cards(in: set.id).filter { $0.subsetID == existing?.id && existing != nil }.map(\.id)))
    }

    var body: some View {
        Form {
            Section {
                TextField("Subset name", text: $name).textInputAutocapitalization(.words)
                LabeledContent("Prefix") {
                    TextField("TG", text: Binding(
                        get: { prefix },
                        set: { prefix = String($0.uppercased().filter { $0.isASCII && $0.isLetter }.prefix(Subset.prefixLimit)) }
                    ))
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("Subset prefix")
                }
            } footer: {
                Text("The prefix starts each card number in the subset, for example TG04/TG30.")
            }
            Section {
                Toggle("Own pack outcome", isOn: $ownOutcome)
            } footer: {
                Text("On: a pack slot can give this subset, and its cards come only through that outcome, like the Trainer Gallery. Add the outcome in the pack. Off: its cards come through their own tiers.")
            }
            Section {
                ForEach(world.catalog.cards(in: set.id)) { card in
                    let other = card.subsetID.flatMap { id in id == existing?.id ? nil : set.subset(id) }
                    Button {
                        if members.contains(card.id) { members.remove(card.id) } else { members.insert(card.id) }
                    } label: {
                        HStack(spacing: 12) {
                            if let face = CardFace(world: world, card: card) {
                                CardView(face: face).frame(width: 40, height: 56)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(world.catalog.displayName(card)).foregroundStyle(.primary)
                                Text([set.ladder.tier(card.rarity)?.name, other.map { "now in \($0.name)" }].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: members.contains(card.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(members.contains(card.id) ? Theme.accent : .secondary)
                        }
                    }
                    .accessibilityLabel("Subset card \(world.catalog.displayName(card))")
                    .accessibilityAddTraits(members.contains(card.id) ? .isSelected : [])
                }
            } header: {
                Text("Designed cards")
            } footer: {
                Text("Only designed cards go into a subset. A card can be in one subset at a time.")
            }
            if existing != nil {
                Section {
                    Button("Delete the subset", role: .destructive) { confirmDelete = true }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(existing == nil ? "New subset" : "Edit subset")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    let subset = Subset(id: existing?.id ?? 0, name: name, prefix: prefix, ownOutcome: ownOutcome)
                    error = store.saveSubset(set.id, subset, cards: Array(members))
                    if error == nil { onDone() }
                }
            }
        }
        .confirmationDialog("Delete this subset?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let id = existing?.id { store.deleteSubset(set.id, id) }
                onDone()
            }
        } message: {
            Text("Its cards return to the main set.")
        }
    }
}

// MARK: - Art sets (S10)

/// The set screen's art sets: each as one strip with a connected background.
struct ArtSetsSection: View {
    let world: World
    let set: CardSet
    let numbers: [CardID: String]
    let onEdit: (ArtSetID?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Art sets").font(.title2.bold())
            Text("An art set is 2 to 5 designed cards whose art connects into one picture. Collectors want the whole group.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ForEach(set.artSets) { artSet in
                let cards = artSet.cards.compactMap(world.catalog.card)
                Button { onEdit(artSet.id) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(artSet.name).font(.headline)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                        }
                        ArtSetStrip(world: world, cards: cards, numbers: numbers)
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Art set \(artSet.name)")
            }
            if world.catalog.cards(in: set.id).count >= ArtSet.cardRange.lowerBound {
                Button { onEdit(nil) } label: {
                    Label("Add an art set", systemImage: "rectangle.split.3x1")
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

/// The cards of an art set side by side on one background in the first card's colors.
struct ArtSetStrip: View {
    let world: World
    let cards: [Card]
    let numbers: [CardID: String]

    var body: some View {
        let palette = cards.first.flatMap { world.character($0.characterID)?.palette } ?? [.sky, .indigo]
        HStack(spacing: 2) {
            ForEach(cards) { card in
                if let face = CardFace(world: world, card: card, numbers: numbers) {
                    CardView(face: face)
                        .frame(maxWidth: 76)
                        .aspectRatio(5 / 7, contentMode: .fit)
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .background(
            LinearGradient(colors: palette.map(\.color), startPoint: .leading, endPoint: .trailing).opacity(0.55),
            in: RoundedRectangle(cornerRadius: 12)
        )
    }
}

/// A row of small cards that scrolls sideways.
struct CardStrip: View {
    let world: World
    let cards: [Card]
    let numbers: [CardID: String]
    var width: CGFloat = 64

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 8) {
                ForEach(cards) { card in
                    if let face = CardFace(world: world, card: card, numbers: numbers) {
                        CardView(face: face).frame(width: width, height: width * 1.4)
                    }
                }
            }
        }
    }
}

/// An art set's name and its cards, in order. A tap adds a card at the end or removes it.
struct ArtSetEditor: View {
    @Environment(GameStore.self) private var store
    let world: World
    let set: CardSet
    let existing: ArtSet?
    let onDone: () -> Void

    @State private var name: String
    @State private var order: [CardID]
    @State private var error: String?

    init(world: World, set: CardSet, existing: ArtSet?, onDone: @escaping () -> Void) {
        self.world = world
        self.set = set
        self.existing = existing
        self.onDone = onDone
        _name = State(initialValue: existing?.name ?? "")
        _order = State(initialValue: existing?.cards ?? [])
    }

    var body: some View {
        Form {
            Section("Name") {
                TextField("Art set name", text: $name).textInputAutocapitalization(.words)
            }
            if order.count >= 2 {
                Section("Preview") {
                    ArtSetStrip(world: world, cards: order.compactMap(world.catalog.card), numbers: world.catalog.cardNumbers(in: set.id))
                        .listRowInsets(EdgeInsets())
                }
            }
            Section {
                let taken = Set(set.artSets.filter { $0.id != existing?.id }.flatMap(\.cards))
                ForEach(world.catalog.cards(in: set.id)) { card in
                    let position = order.firstIndex(of: card.id).map { $0 + 1 }
                    Button {
                        if let i = order.firstIndex(of: card.id) {
                            order.remove(at: i)
                        } else if order.count < ArtSet.cardRange.upperBound {
                            order.append(card.id)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            if let face = CardFace(world: world, card: card) {
                                CardView(face: face).frame(width: 40, height: 56)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(world.catalog.displayName(card)).foregroundStyle(.primary)
                                Text(taken.contains(card.id) ? "In another art set" : set.ladder.tier(card.rarity)?.name ?? "")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let position {
                                Text("\(position)")
                                    .font(.subheadline.weight(.bold))
                                    .frame(width: 26, height: 26)
                                    .background(Theme.accent, in: Circle())
                                    .foregroundStyle(.white)
                            } else {
                                Image(systemName: "circle").foregroundStyle(.secondary)
                            }
                        }
                    }
                    .disabled(taken.contains(card.id))
                    .accessibilityLabel("Art set card \(world.catalog.displayName(card))")
                }
            } header: {
                Text("Cards, in order")
            } footer: {
                Text("Tap the cards in the order of the picture, from left to right. An art set has 2 to 5 cards. A card can be in one art set only.")
            }
            if existing != nil {
                Section {
                    Button("Delete the art set", role: .destructive) {
                        if let id = existing?.id { store.deleteArtSet(set.id, id) }
                        onDone()
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(existing == nil ? "New art set" : "Edit art set")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    error = store.saveArtSet(set.id, ArtSet(id: existing?.id ?? 0, name: name, cards: order))
                    if error == nil { onDone() }
                }
            }
        }
    }
}
