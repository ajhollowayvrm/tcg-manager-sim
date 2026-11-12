import SwiftUI
import SimCore

/// A screen inside the Studio tab.
enum StudioRoute: Hashable {
    case product
    case upgrades
    case roster
    case era(EraID)
    case promos
    case ladders
    case packs
}

/// The Studio tab (U3): a quick look at the business, then Product and Upgrades.
/// The tab owns the navigation stack for every screen inside it.
struct StudioView: View {
    @Environment(GameStore.self) private var store
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                if let world = store.world {
                    VStack(alignment: .leading, spacing: 16) {
                        StatusWidget(world: world)
                        HStack(spacing: 12) {
                            NavigationLink(value: StudioRoute.product) {
                                bigButton("Product", systemImage: "rectangle.stack.fill",
                                          detail: "Roster, eras, sets, and tools")
                            }
                            NavigationLink(value: StudioRoute.upgrades) {
                                bigButton("Upgrades", systemImage: "arrow.up.circle.fill",
                                          detail: "\(world.market.insights.count) of \(MarketInsight.allCases.count) owned")
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(16)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(store.world?.studioName ?? "Studio")
            .toolbar { ToolbarItem(placement: .primaryAction) { NextWeekButton() } }
            .navigationDestination(for: StudioRoute.self) { route in
                switch route {
                case .product: ProductView()
                case .upgrades: UpgradesView()
                case .roster: RosterView()
                case .era(let id): EraDetailView(eraID: id) { path.append(SetRoute(id: $0)) }
                case .promos: PromoSetsView { path.append(SetRoute(id: $0)) }
                case .ladders: LadderPresetsView()
                case .packs: PackPresetsView()
                }
            }
            .navigationDestination(for: CharacterID.self) { id in
                CharacterDetailView(id: id)
            }
            .navigationDestination(for: SetRoute.self) { route in
                SetDetailView(setID: route.id)
            }
        }
    }

    private func bigButton(_ title: String, systemImage: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: systemImage).font(.title).foregroundStyle(Theme.accent)
            Text(title).font(.title3.bold())
            Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(2, reservesSpace: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

/// A quick look at the business (U3, B3): the calendar, the hobby, the reach,
/// the current era, the IP, and the cash.
private struct StatusWidget: View {
    let world: World

    var body: some View {
        let market = world.market
        let era = world.catalog.currentEra
        let reached = market.audiences.reduce(0) { $0 + $1.reachedPeople }
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            tile("Calendar", systemImage: "calendar", value: Market.calendar(week: world.week), detail: "Week \(world.week)")
            tile("Hobby", systemImage: "flame.fill", value: market.hobbyPhrase.replacingOccurrences(of: "The hobby is ", with: "").capitalizedFirst,
                 detail: market.hobbyDirection > 0 ? "Rising" : market.hobbyDirection < 0 ? "Falling" : "Steady")
            tile("Reach", systemImage: "megaphone.fill",
                 value: market.insights.contains(.reach) ? "About \(MarketFormat.people(reached))" : "Unknown",
                 detail: market.insights.contains(.reach) ? "People who know you" : "Needs the Fan survey")
            tile("Era", systemImage: "hourglass", value: "\(era.name)",
                 detail: "\(era.code) · \(world.catalog.sets.filter { $0.eraID == era.id && $0.type != .promo }.count) sets")
            tile("Your IP", systemImage: "person.3.fill", value: "\(world.characters.count) characters",
                 detail: "\(world.catalog.sets.count) sets · \(world.catalog.cards.count) cards")
            tile("Cash", systemImage: "banknote.fill", value: Money.text(world.business.cash),
                 detail: world.business.cash < 0 ? "Below zero" : "Ledger in Business")
        }
    }

    private func tile(_ title: String, systemImage: String, value: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: systemImage).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.headline).lineLimit(1).minimumScaleFactor(0.7)
            Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Studio → Upgrades (U3). Until money exists, an upgrade is free to unlock
/// and to lock again.
struct UpgradesView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        List {
            if let world = store.world {
                Section {
                    ForEach(MarketInsight.allCases) { insight in
                        let owned = world.market.insights.contains(insight)
                        Toggle(isOn: Binding(get: { owned }, set: { store.setMarketInsight(insight, on: $0) })) {
                            HStack(spacing: 12) {
                                Image(systemName: owned ? "checkmark.seal.fill" : "lock.fill")
                                    .foregroundStyle(owned ? Theme.accent : .secondary)
                                    .frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(insight.upgradeName)
                                    Text(insight.unlocks).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .accessibilityLabel("Upgrade \(insight.upgradeName)")
                    }
                } header: {
                    Text("Market research")
                } footer: {
                    Text("Each upgrade shows one part of the Market tab. Until money exists, the upgrades are free.")
                }
            }
        }
        .navigationTitle("Upgrades")
    }
}

/// Studio → Product: the roster, the eras with their sets, the promo sets, and
/// the tools (E10). An era holds its sets. The ladders and the packs are tools.
struct ProductView: View {
    @Environment(GameStore.self) private var store
    @State private var startingEra = false

    var body: some View {
        Group {
            List {
                if let world = store.world {
                    Section("Your IP") {
                        NavigationLink(value: StudioRoute.roster) {
                            hubRow("Roster", systemImage: "person.3.fill",
                                   detail: "\(count(world.characters.count, "character")), \(world.characters.filter { $0.origin == .created }.count) created by you")
                        }
                    }

                    erasSection(world)

                    Section {
                        NavigationLink(value: StudioRoute.promos) {
                            hubRow("Promo sets", systemImage: "gift.fill",
                                   detail: count(world.catalog.sets.filter { $0.type == .promo }.count, "promo set"))
                        }
                    } footer: {
                        Text("Small sets outside the series numbers, like a McDonald's Collection.")
                    }

                    Section {
                        NavigationLink(value: StudioRoute.ladders) {
                            hubRow("Rarity ladders", systemImage: "list.number",
                                   detail: count(world.catalog.ladderPresets.count, "preset"))
                        }
                        NavigationLink(value: StudioRoute.packs) {
                            hubRow("Pack presets", systemImage: "shippingbox.fill",
                                   detail: count(world.catalog.packPresets.count, "preset"))
                        }
                    } header: {
                        Text("Tools")
                    } footer: {
                        Text("A new set copies a rarity ladder and a pack. Each tier sets the look of its cards. The pack sets the pull rates: the slots, and the odds in each slot.")
                    }
                }
            }
            .navigationTitle("Product")
            .sheet(isPresented: $startingEra) {
                NavigationStack {
                    EraDesignerView(eraID: nil, initial: newEraDraft) { startingEra = false }
                }
                .interactiveDismissDisabled()
            }
        }
    }

    /// The eras, the current era first. Each era opens its sets (E10).
    private func erasSection(_ world: World) -> some View {
        let current = world.catalog.currentEra
        return Section {
            ForEach(world.catalog.eras.reversed()) { era in
                NavigationLink(value: StudioRoute.era(era.id)) {
                    EraRow(era: era, sets: world.catalog.sets.filter { $0.eraID == era.id && $0.type != .promo }.count)
                }
                .accessibilityLabel("Era \(era.name)")
            }
            Button {
                startingEra = true
            } label: {
                Label("Start a new era", systemImage: "sparkles")
            }
        } header: {
            Text("Eras")
        } footer: {
            Text("An era holds its sets. New sets join the current era, \(current.name), and use its look and gimmick. A new era ends the current one.")
        }
    }

    /// A new era starts with the current era's look and presets (eras.md, section 6).
    private var newEraDraft: EraDraft {
        guard let current = store.world?.catalog.currentEra else { return EraDraft() }
        return EraDraft(nameBar: current.nameBar, ladderPresetID: current.ladderPresetID, packPresetID: current.packPresetID)
    }

    /// "1 set", "2 sets".
    private func count(_ n: Int, _ noun: String) -> String { "\(n) \(noun)\(n == 1 ? "" : "s")" }

    private func hubRow(_ title: String, systemImage: String, detail: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(Theme.accent)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

/// One era: its look and its sets in series order (E10). Only the current era
/// takes new sets (S13).
struct EraDetailView: View {
    @Environment(GameStore.self) private var store
    let eraID: EraID
    let onOpenSet: (SetID) -> Void
    @State private var editing = false
    @State private var creating = false

    var body: some View {
        if let world = store.world, let era = world.catalog.era(eraID) {
            content(world, era)
        } else {
            ContentUnavailableView("Era not found", systemImage: "questionmark")
        }
    }

    private func content(_ world: World, _ era: Era) -> some View {
        let isCurrent = world.catalog.currentEra.id == era.id
        let numbers = world.catalog.seriesNumbers(in: era.id)
        let sets = world.catalog.sets.filter { $0.eraID == era.id && $0.type != .promo }
        return List {
            Section {
                LabeledContent("Code", value: era.code)
                LabeledContent("Weeks", value: era.endWeek.map { "\(era.startWeek) to \($0)" } ?? "Since \(era.startWeek), now")
                LabeledContent("Name bar", value: "\(era.nameBar.shape.name), \(era.nameBar.color.name)")
                HStack {
                    Text("Gimmick")
                    Spacer()
                    if let gimmick = era.gimmick { GimmickBadge(gimmick: gimmick) } else { Text("None").foregroundStyle(.secondary) }
                }
                Button("Edit the era", systemImage: "paintbrush") { editing = true }
            }
            Section {
                ForEach(sets) { set in
                    NavigationLink(value: SetRoute(id: set.id)) {
                        SetRow(set: set, theme: set.theme.flatMap(world.catalog.theme),
                               count: world.catalog.cards(in: set.id).count, series: numbers[set.id])
                    }
                }
                if isCurrent {
                    Button {
                        creating = true
                    } label: {
                        Label("New set", systemImage: "plus.rectangle.on.rectangle")
                    }
                }
            } header: {
                Text("Sets")
            } footer: {
                Text(isCurrent
                     ? "Main sets count \(era.code)1, \(era.code)2. A special set takes .5. A parallel pair takes one number with a letter."
                     : "A past era takes no new sets. New sets join the current era.")
            }
        }
        .navigationTitle(era.name)
        .sheet(isPresented: $editing) {
            NavigationStack {
                EraDesignerView(eraID: era.id, initial: EraDraft(from: era)) { editing = false }
            }
            .interactiveDismissDisabled()
        }
        .sheet(isPresented: $creating) {
            NavigationStack {
                NewSetForm(types: [.main, .mini, .parallel]) { id in
                    creating = false
                    onOpenSet(id)
                } onCancel: {
                    creating = false
                }
            }
        }
    }
}

/// The promo sets, grouped by era, the newest era first (E9).
struct PromoSetsView: View {
    @Environment(GameStore.self) private var store
    let onOpenSet: (SetID) -> Void
    @State private var creating = false

    var body: some View {
        List {
            if let world = store.world {
                ForEach(world.catalog.eras.reversed()) { era in
                    let promos = world.catalog.sets.filter { $0.eraID == era.id && $0.type == .promo }.reversed()
                    if !promos.isEmpty {
                        Section(era.name) {
                            ForEach(Array(promos)) { set in
                                NavigationLink(value: SetRoute(id: set.id)) {
                                    SetRow(set: set, theme: set.theme.flatMap(world.catalog.theme),
                                           count: world.catalog.cards(in: set.id).count, series: nil)
                                }
                            }
                        }
                    }
                }
                Section {
                    Button {
                        creating = true
                    } label: {
                        Label("New promo set", systemImage: "gift")
                    }
                } footer: {
                    Text("A promo set has its own code but no series number. It takes the look of the current era, \(world.catalog.currentEra.name). Its filler cards reprint characters from your roster.")
                }
            }
        }
        .navigationTitle("Promo sets")
        .sheet(isPresented: $creating) {
            NavigationStack {
                NewSetForm(types: [.promo]) { id in
                    creating = false
                    onOpenSet(id)
                } onCancel: {
                    creating = false
                }
            }
        }
    }
}

#Preview {
    StudioView()
        .environment(GameStore(preview: .sample()))
}

extension String {
    /// "hot" → "Hot".
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
