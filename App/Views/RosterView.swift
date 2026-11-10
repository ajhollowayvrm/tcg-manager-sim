import SwiftUI
import SimCore

/// The roster grid (roster.md, section 8.1).
struct RosterView: View {
    @Environment(GameStore.self) private var store

    enum Sort: String, CaseIterable, Identifiable {
        case newest = "Newest"
        case name = "Name"
        case popularity = "Popularity"
        case appeal = "Best reading"
        case buzz = "Buzz"
        var id: String { rawValue }
    }

    enum OriginFilter: String, CaseIterable, Identifiable {
        case all = "All origins"
        case created = "Created by you"
        case generated = "Generated"
        var id: String { rawValue }
    }

    enum StatusFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case active = "Active"
        case retired = "Retired"
        var id: String { rawValue }
    }

    @State private var sort: Sort = .newest
    @State private var origin: OriginFilter = .all
    @State private var status: StatusFilter = .all
    @State private var typeFilter: ElementType?
    @State private var search = ""
    @State private var creating = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let world = store.world {
                    let shown = filtered(world)
                    if shown.isEmpty {
                        ContentUnavailableView(
                            "No characters match",
                            systemImage: "person.crop.circle.badge.questionmark",
                            description: Text("Change the filters, or create a new character.")
                        )
                        .padding(.top, 60)
                    } else {
                        Text("\(shown.count) of \(world.characters.count) characters")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 16) {
                            ForEach(shown) { character in
                                NavigationLink(value: character.id) {
                                    CharacterTile(character: character)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("Roster")
            .searchable(text: $search, prompt: "Search names")
            .navigationDestination(for: CharacterID.self) { id in
                CharacterDetailView(id: id)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { filterMenu }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New character")
                }
            }
            .sheet(isPresented: $creating) {
                NavigationStack {
                    CreatorView(
                        mode: .new,
                        initial: CharacterDraft(),
                        world: store.world,
                        title: "New character",
                        confirmLabel: "Create",
                        onConfirm: { draft in
                            let error = store.createCharacter(draft)
                            if error == nil { creating = false }
                            return error
                        },
                        onCancel: { creating = false }
                    )
                }
                .interactiveDismissDisabled()
            }
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Sort", selection: $sort) {
                ForEach(Sort.allCases) { Text($0.rawValue).tag($0) }
            }
            Picker("Origin", selection: $origin) {
                ForEach(OriginFilter.allCases) { Text($0.rawValue).tag($0) }
            }
            Picker("Status", selection: $status) {
                ForEach(StatusFilter.allCases) { Text($0.rawValue).tag($0) }
            }
            Picker("Type", selection: $typeFilter) {
                Text("All types").tag(ElementType?.none)
                ForEach(ElementType.allCases) { type in
                    Label(type.name, systemImage: type.symbol).tag(ElementType?.some(type))
                }
            }
        } label: {
            Image(systemName: isFiltered ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Sort and filter")
    }

    private var isFiltered: Bool {
        origin != .all || status != .all || typeFilter != nil
    }

    private func filtered(_ world: World) -> [Character] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let matches = world.characters.filter { c in
            (query.isEmpty || c.name.lowercased().contains(query))
                && (origin == .all || (origin == .created) == (c.origin == .created))
                && (status == .all || (status == .active) == (c.status == .active))
                && (typeFilter == nil || c.primaryType == typeFilter || c.secondaryType == typeFilter)
        }
        let fits = world.fits
        switch sort {
        case .newest:
            return matches.sorted { $0.id > $1.id }
        case .name:
            return matches.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case .popularity:
            return matches.sorted { bestPopularity($0, fits) > bestPopularity($1, fits) }
        case .appeal:
            return matches.sorted { bestReading($0, fits) > bestReading($1, fits) }
        case .buzz:
            return matches.sorted { $0.buzz > $1.buzz }
        }
    }

    private func bestPopularity(_ c: Character, _ fits: FitTables) -> Double {
        Audience.allCases.map { c.popularity($0, fits: fits) }.max() ?? 0
    }

    private func bestReading(_ c: Character, _ fits: FitTables) -> Double {
        Audience.allCases.map { c.reading($0, fits: fits).mid }.max() ?? 0
    }
}

struct CharacterTile: View {
    let character: Character

    var body: some View {
        VStack(spacing: 6) {
            ZStack(alignment: .topTrailing) {
                CharacterPortrait(character: character)
                Image(systemName: character.primaryType.symbol)
                    .font(.caption)
                    .foregroundStyle(character.primaryType.tint)
                    .padding(6)
            }
            .overlay(alignment: .topLeading) {
                if character.fatigue >= 50 {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .padding(6)
                        .accessibilityLabel("Overused")
                }
            }
            .overlay(alignment: .bottomLeading) {
                if character.origin == .generated {
                    Image(systemName: "dice.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(6)
                        .accessibilityLabel("Generated")
                }
            }
            Text(character.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .opacity(character.status == .retired ? 0.45 : 1)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        var parts = [character.role.name]
        if character.status == .retired { parts.append("Retired") }
        return parts.joined(separator: " · ")
    }
}

#Preview {
    RosterView()
        .environment(GameStore(preview: .sample()))
}
