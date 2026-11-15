import SwiftUI
import SimCore

/// One set and its cards (cards.md, section 7.2).
struct SetDetailView: View {
    @Environment(GameStore.self) private var store
    let setID: SetID

    enum Sheet: Identifiable {
        case newCard
        case editCard(CardID)
        case ladder
        case details
        case pack
        case testRip
        case subset(SubsetID?)
        case artSet(ArtSetID?)
        case lead

        var id: String {
            switch self {
            case .newCard: "new"
            case .editCard(let id): "card-\(id)"
            case .ladder: "ladder"
            case .details: "details"
            case .pack: "pack"
            case .testRip: "rip"
            case .subset(let id): "subset-\(id ?? 0)"
            case .artSet(let id): "art-\(id ?? 0)"
            case .lead: "lead"
            }
        }
    }

    @State private var sheet: Sheet?
    @State private var confirmDelete: CardID?
    @State private var confirmReroll = false

    var body: some View {
        if let world = store.world, let set = world.catalog.set(setID) {
            content(world, set)
        } else {
            ContentUnavailableView("Set not found", systemImage: "questionmark")
        }
    }

    private func content(_ world: World, _ set: CardSet) -> some View {
        let cards = world.catalog.cards(in: set.id)
        let numbers = world.catalog.cardNumbers(in: set.id)
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header(world, set, theme: set.theme.flatMap(world.catalog.theme), count: cards.count)
                if set.status != .draft {
                    ReleaseSection(world: world, set: set)
                    SinglesSection(world: world, set: set)
                }
                if cards.isEmpty {
                    ContentUnavailableView {
                        Label("No cards yet", systemImage: "rectangle.portrait")
                    } description: {
                        Text("Each card has a character, a name, a rarity, and the other IP in its art. The rarity tier sets the look.")
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 14) {
                        ForEach(cards) { card in
                            if let face = CardFace(world: world, card: card, numbers: numbers) {
                                Button {
                                    sheet = .editCard(card.id)
                                } label: {
                                    VStack(spacing: 4) {
                                        CardView(face: face)
                                        let count = versionCount(card, set)
                                        if count > 1 {
                                            Text("\(count) versions").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    Button("Delete the card", systemImage: "trash", role: .destructive) {
                                        confirmDelete = card.id
                                    }
                                }
                            }
                        }
                    }
                }
                if set.status == .draft {
                    Button {
                        sheet = .newCard
                    } label: {
                        Label("Add a card", systemImage: "plus.rectangle.portrait")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                } else {
                    Label("This set is \(set.status == .scheduled ? "scheduled" : "released"). It cannot change.", systemImage: "lock.fill")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if !cards.isEmpty {
                    Group {
                        ArtSetsSection(world: world, set: set, numbers: numbers) { sheet = .artSet($0) }
                        SubsetsSection(world: world, set: set, numbers: numbers) { sheet = .subset($0) }
                    }
                    .disabled(set.status != .draft)
                }
                LeadArtistSection(world: world, set: set) { sheet = .lead }
                StorySection(world: world, set: set)
                if set.status == .draft {
                    ReleaseSection(world: world, set: set)
                }
                PackSummary(world: world, set: set) { sheet = .pack }
                    .disabled(set.status != .draft)
                testRipButton(world, set)
                FillerSection(world: world, set: set, designed: cards.count, numbers: numbers, locked: set.status != .draft) {
                    confirmReroll = true
                }
            }
            .padding(16)
        }
        .navigationTitle(set.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) { NextWeekButton() }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Edit the set details", systemImage: "pencil") { sheet = .details }
                    Button("Edit the rarity ladder", systemImage: "list.number") { sheet = .ladder }
                    Button("Edit the pack", systemImage: "shippingbox") { sheet = .pack }
                } label: {
                    Label("Set options", systemImage: "ellipsis.circle")
                }
                .disabled(set.status != .draft)
            }
        }
        .sheet(item: $sheet) { sheet in
            NavigationStack { sheetView(sheet, world, set) }
                .interactiveDismissDisabled()
        }
        .confirmationDialog(
            world.catalog.fillerCards(in: set.id).isEmpty ? "Make the filler cards?" : "Reroll all filler cards?",
            isPresented: $confirmReroll,
            titleVisibility: .visible
        ) {
            Button(world.catalog.fillerCards(in: set.id).isEmpty ? "Make them" : "Reroll") {
                store.rerollFiller(set.id)
            }
        } message: {
            Text("The game makes new filler cards and new generated characters. The current generated characters leave the set.")
        }
        .confirmationDialog(
            "Delete this card?",
            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let id = confirmDelete { store.deleteCard(id) }
                confirmDelete = nil
            }
        }
    }

    private func versionCount(_ card: Card, _ set: CardSet) -> Int {
        set.ladder.tier(card.rarity)?.versions(excluding: card.excludedVersions, own: card.ownVersions).count ?? 1
    }

    private func header(_ world: World, _ set: CardSet, theme: SetTheme?, count: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                SetSymbolView(symbol: set.symbol, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(set.name).font(.largeTitle.bold())
                    Text([world.catalog.seriesNumber(of: set.id), set.code].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.bold).monospaced()).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                Chip(text: set.type.name)
                if let theme { ThemeBadge(theme: theme) }
                Chip(text: set.status.rawValue.capitalized)
            }
            if let era = world.catalog.era(set.eraID) {
                HStack(spacing: 6) {
                    Label(era.name, systemImage: "hourglass").font(.subheadline.weight(.semibold))
                    if let gimmick = era.gimmick { GimmickBadge(gimmick: gimmick) }
                }
                .foregroundStyle(.secondary)
            }
            if let pair = world.catalog.pair(of: set.id) {
                NavigationLink(value: SetRoute(id: pair.id)) {
                    Label("Releases with \(pair.name)", systemImage: "rectangle.on.rectangle")
                        .font(.subheadline.weight(.semibold))
                }
            }
            headlinerLine(world, set)
            Button {
                sheet = .ladder
            } label: {
                HStack {
                    TierStrip(tiers: set.ladder.tiers)
                    if set.status == .draft {
                        Image(systemName: "pencil.circle.fill").foregroundStyle(Theme.accent)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(set.status != .draft)
            .accessibilityLabel("Rarity ladder")
            .accessibilityHint(set.status == .draft ? "Opens the ladder editor" : "")
            let range = CardSet.featuredRange
            Label(
                count < range.lowerBound
                    ? "\(count) designed \(count == 1 ? "card" : "cards"). Aim for \(range.lowerBound) to \(range.upperBound)."
                    : count > range.upperBound
                        ? "\(count) designed cards. That is more than \(range.upperBound)."
                        : "\(count) designed cards. This is in the range of \(range.lowerBound) to \(range.upperBound).",
                systemImage: range.contains(count) ? "checkmark.circle.fill" : "info.circle"
            )
            .font(.subheadline)
            .foregroundStyle(range.contains(count) ? .green : .secondary)
            Label(
                "\(set.size) cards in all. The game will make \(set.fillerCount(designed: count)) filler cards.",
                systemImage: "square.stack.3d.up"
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func headlinerLine(_ world: World, _ set: CardSet) -> some View {
        if let headliner = set.headliner, let label = HeadlinerLabel(world: world, headliner: headliner) {
            HStack(spacing: 8) {
                label.drawing.frame(width: 32, height: 32)
                Text("Headliner: \(label.name)").font(.subheadline.weight(.semibold))
            }
            if !world.catalog.headlinerHasCard(set.id) {
                Label("\(label.name) has no card in this set yet.", systemImage: "exclamationmark.triangle")
                    .font(.subheadline)
                    .foregroundStyle(.orange)
            }
        } else {
            Button {
                sheet = .details
            } label: {
                Label("Pick a headliner", systemImage: "star.square")
                    .font(.subheadline.weight(.semibold))
            }
        }
    }

    /// Open packs of this set to test it (test-rip.md, section 4). A blocking warning stops it.
    @ViewBuilder
    private func testRipButton(_ world: World, _ set: CardSet) -> some View {
        let blocked = world.testRip(set.id) == nil
        Button {
            sheet = .testRip
        } label: {
            Label("Test rip", systemImage: "sparkles.rectangle.stack")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .disabled(blocked)
        if blocked {
            Label("Fix the pack warnings to open a test rip.", systemImage: "exclamationmark.octagon.fill")
                .font(.caption)
                .foregroundStyle(.red)
        }
    }

    @ViewBuilder
    private func sheetView(_ sheet: Sheet, _ world: World, _ set: CardSet) -> some View {
        switch sheet {
        case .newCard:
            CardDesignerView(setID: set.id, cardID: nil, initial: CardDraft()) {
                self.sheet = nil
            }
        case .editCard(let id):
            if let card = world.catalog.card(id) {
                CardDesignerView(setID: set.id, cardID: id, initial: CardDraft(from: card)) {
                    self.sheet = nil
                }
            }
        case .ladder:
            LadderEditorView(
                title: "\(set.name) ladder",
                initial: set.ladder,
                editsName: false,
                footer: "This ladder belongs to this set only. A tier that a designed card uses cannot be removed.",
                saved: set.ladder,
                onSave: { ladder in
                    let error = store.updateSetLadder(set.id, ladder)
                    if error == nil { self.sheet = nil }
                    return error
                },
                onCancel: { self.sheet = nil }
            )
        case .pack:
            PackEditorView(
                title: "\(set.name) pack",
                initial: set.pack,
                fixedLadder: set.ladder,
                cards: world.catalog.allCards(in: set.id),
                subsets: set.subsets,
                onSave: { pack in
                    let error = store.updateSetPack(set.id, pack)
                    if error == nil { self.sheet = nil }
                    return error
                },
                onCancel: { self.sheet = nil }
            )
        case .testRip:
            if let rip = world.testRip(set.id) {
                TestRipView(world: world, set: set, rip: rip) { self.sheet = nil }
            }
        case .subset(let id):
            SubsetEditor(world: world, set: set, existing: id.flatMap(set.subset)) { self.sheet = nil }
        case .artSet(let id):
            ArtSetEditor(world: world, set: set, existing: set.artSets.first { $0.id == id }) { self.sheet = nil }
        case .lead:
            LeadArtistPicker(setID: set.id) { self.sheet = nil }
        case .details:
            SetDetailsForm(set: set, designed: world.catalog.cards(in: set.id).count) { self.sheet = nil }
        }
    }
}

/// The set's pack in one card: its size, its rarest pulls, and its warnings (sets.md, section 7.2).
private struct PackSummary: View {
    let world: World
    let set: CardSet
    let onEdit: () -> Void

    var body: some View {
        let stats = world.packStats(set.id)
        let warnings = world.packWarnings(set.id)
        // The two rarest tiers that a pack can give.
        let chase = (stats?.lines ?? []).filter { $0.kind.tierID != nil && $0.chance > 0 && $0.chance < 0.5 }.suffix(2)
        Button(action: onEdit) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Pack", systemImage: "shippingbox.fill").font(.title2.bold())
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                Text("\(set.pack.cardCount) cards in a pack · \(set.pack.boxSize) packs in a box")
                    .font(.subheadline)
                ForEach(Array(chase), id: \.kind) { line in
                    let name = set.pack.label(line.kind, ladder: set.ladder, subsets: set.subsets)
                    HStack {
                        Text(name).font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("1 in \(Int((line.oneIn ?? 0).rounded()).formatted()) packs").font(.subheadline.monospacedDigit())
                    }
                }
                if !warnings.isEmpty {
                    let blocking = warnings.contains { $0.blocksPrint }
                    Label(
                        warnings.count == 1 ? warnings[0].message : "\(warnings.count) warnings. Open the pack to see them.",
                        systemImage: blocking ? "exclamationmark.octagon.fill" : "exclamationmark.triangle"
                    )
                    .font(.caption)
                    .foregroundStyle(blocking ? .red : .orange)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open the pack")
    }
}

/// The filler cards by tier, and the set's new generated characters (sets.md, section 4).
private struct FillerSection: View {
    let world: World
    let set: CardSet
    let designed: Int
    let numbers: [CardID: String]
    /// A scheduled or released set cannot reroll its filler (B2).
    let locked: Bool
    let onReroll: () -> Void

    var body: some View {
        let filler = world.catalog.fillerCards(in: set.id)
        let wanted = set.fillerCount(designed: designed)
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Filler cards").font(.title2.bold())
                Spacer()
                Text("\(filler.count)").font(.title3.monospacedDigit()).foregroundStyle(.secondary)
            }
            Text("The game makes these cards. They fill the set after your designed cards. The theme sets the mix of creatures and people.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if !set.generated.isEmpty {
                generatedStrip
            }
            ForEach(set.ladder.tiers) { tier in
                let cards = filler.filter { $0.rarity == tier.id }
                if !cards.isEmpty {
                    tierRow(tier, cards)
                }
            }
            if wanted > 0, !locked {
                Button(action: onReroll) {
                    Label(filler.isEmpty ? "Make the filler cards" : "Reroll the filler", systemImage: "dice")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
    }

    private var generatedStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(set.generated.count) new generated characters")
                .font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(set.generated) { character in
                        VStack(spacing: 4) {
                            CharacterDrawing(character: character)
                                .frame(width: 56, height: 56)
                            Text(character.name)
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                        }
                        .frame(width: 70)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Generated \(character.kind.name.lowercased()) \(character.name)")
                    }
                }
            }
            Text("They join the roster when the set is printed. One of them can become a hit.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func tierRow(_ tier: RarityTier, _ cards: [Card]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                HStack(spacing: 3) {
                    RaritySymbolView(symbol: tier.symbol, count: tier.symbolCount, size: 9)
                    Text(tier.code).font(.caption.weight(.bold))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .foregroundStyle(.white)
                .background(tier.color.color, in: Capsule())
                Text("\(tier.name): \(cards.count) cards").font(.subheadline.weight(.semibold))
            }
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 8) {
                    ForEach(cards) { card in
                        if let face = CardFace(world: world, card: card, numbers: numbers) {
                            CardView(face: face)
                                .frame(width: 64, height: 90)
                                .accessibilityLabel("Filler card \(card.name)")
                        }
                    }
                }
            }
        }
    }
}

/// The set's name, code, symbol, type, theme, size, and headliner (sets.md, section 7.2).
private struct SetDetailsForm: View {
    @Environment(GameStore.self) private var store
    let set: CardSet
    let designed: Int
    let onDone: () -> Void

    @State private var details: SetDetails
    @State private var type: SetType
    @State private var error: String?

    init(set: CardSet, designed: Int, onDone: @escaping () -> Void) {
        self.set = set
        self.designed = designed
        self.onDone = onDone
        _details = State(initialValue: SetDetails(from: set))
        _type = State(initialValue: set.type)
    }

    var body: some View {
        Form {
            Section("Name") {
                SetNameFields(details: $details, followsName: false)
            }
            Section {
                if set.type == .parallel {
                    LabeledContent("Type", value: SetType.parallel.name)
                } else {
                    Picker("Type", selection: $type) {
                        Text(SetType.main.name).tag(SetType.main)
                        Text(SetType.mini.name).tag(SetType.mini)
                        Text(SetType.promo.name).tag(SetType.promo)
                    }
                    .pickerStyle(.segmented)
                }
            } footer: {
                Text(set.type == .parallel
                     ? "A parallel set stays parallel. It releases with its pair."
                     : "The type sets how many new characters the game generates for the filler cards.")
            }
            Section {
                ThemePickerRow(selection: $details.theme)
            }
            Section {
                HeadlinerRow(headliner: $details.headliner)
            } footer: {
                Text("The headliner is on the pack art and the box art.")
            }
            SetSizeSection(size: $details.size, designed: designed)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Set details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    error = store.updateSet(set.id, details, type: type)
                    if error == nil { onDone() }
                }
            }
        }
    }
}

#Preview {
    let world = World.sample()
    NavigationStack {
        SetDetailView(setID: world.catalog.sets[0].id)
    }
    .environment(GameStore(preview: world))
}
