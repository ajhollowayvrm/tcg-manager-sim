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

        var id: String {
            switch self {
            case .newCard: "new"
            case .editCard(let id): "card-\(id)"
            case .ladder: "ladder"
            case .details: "details"
            }
        }
    }

    @State private var sheet: Sheet?
    @State private var confirmDelete: CardID?

    var body: some View {
        if let world = store.world, let set = world.catalog.set(setID) {
            content(world, set)
        } else {
            ContentUnavailableView("Set not found", systemImage: "questionmark")
        }
    }

    private func content(_ world: World, _ set: CardSet) -> some View {
        let cards = world.catalog.cards(in: set.id)
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header(set, theme: set.theme.flatMap(world.catalog.theme), count: cards.count)
                if cards.isEmpty {
                    ContentUnavailableView {
                        Label("No cards yet", systemImage: "rectangle.portrait")
                    } description: {
                        Text("Each card has a character, a name, a rarity, and the other IP in its art. The rarity tier sets the look.")
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 14) {
                        ForEach(cards) { card in
                            if let face = CardFace(world: world, card: card) {
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
                Button {
                    sheet = .newCard
                } label: {
                    Label("Add a card", systemImage: "plus.rectangle.portrait")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(16)
        }
        .navigationTitle(set.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Edit the name and theme", systemImage: "pencil") { sheet = .details }
                    Button("Edit the rarity ladder", systemImage: "list.number") { sheet = .ladder }
                } label: {
                    Label("Set options", systemImage: "ellipsis.circle")
                }
            }
        }
        .sheet(item: $sheet) { sheet in
            NavigationStack { sheetView(sheet, world, set) }
                .interactiveDismissDisabled()
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

    private func header(_ set: CardSet, theme: SetTheme?, count: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(set.name).font(.largeTitle.bold())
            HStack(spacing: 8) {
                if let theme { ThemeBadge(theme: theme) }
                Chip(text: "Draft")
            }
            TierStrip(tiers: set.ladder.tiers)
            let range = CardSet.featuredRange
            Label(
                count < range.lowerBound
                    ? "\(count) \(count == 1 ? "card" : "cards"). Aim for \(range.lowerBound) to \(range.upperBound) featured cards."
                    : count > range.upperBound
                        ? "\(count) cards. That is more than \(range.upperBound) featured cards."
                        : "\(count) featured cards. This is in the range of \(range.lowerBound) to \(range.upperBound).",
                systemImage: range.contains(count) ? "checkmark.circle.fill" : "info.circle"
            )
            .font(.subheadline)
            .foregroundStyle(range.contains(count) ? .green : .secondary)
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
                footer: "This ladder belongs to this set only. A tier that a card uses cannot be removed.",
                onSave: { ladder in
                    let error = store.updateSetLadder(set.id, ladder)
                    if error == nil { self.sheet = nil }
                    return error
                },
                onCancel: { self.sheet = nil }
            )
        case .details:
            SetDetailsForm(set: set) { self.sheet = nil }
        }
    }
}

/// Rename a set, or change its theme.
private struct SetDetailsForm: View {
    @Environment(GameStore.self) private var store
    let set: CardSet
    let onDone: () -> Void

    @State private var name: String
    @State private var theme: ThemeID?
    @State private var error: String?

    init(set: CardSet, onDone: @escaping () -> Void) {
        self.set = set
        self.onDone = onDone
        _name = State(initialValue: set.name)
        _theme = State(initialValue: set.theme)
    }

    var body: some View {
        Form {
            TextField("Set name", text: $name)
            ThemePickerRow(selection: $theme)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Set details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    error = store.updateSet(set.id, name: name, theme: theme)
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
