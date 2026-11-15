import SwiftUI
import SimCore

// Lore: races, factions, relations, story beats, and the timeline (docs/design/lore.md).

/// Studio → Product → Lore (L8 to L10): races, groups, relations, and the timeline.
struct LoreView: View {
    @Environment(GameStore.self) private var store
    @State private var adding: LoreItemForm.Kind?
    @State private var deleting: LoreItem?
    @State private var error: String?

    enum LoreItem: Identifiable {
        case race(Race), group(Faction)
        var id: String {
            switch self {
            case .race(let r): "race-\(r.id)"
            case .group(let g): "group-\(g.id)"
            }
        }
        var name: String {
            switch self {
            case .race(let r): r.name
            case .group(let g): g.name
            }
        }
    }

    var body: some View {
        List {
            if let world = store.world {
                let lore = world.lore
                Section {
                    ForEach(lore.races) { race in
                        HStack {
                            Label(race.name, systemImage: race.emblem.systemImage).foregroundStyle(race.color.color)
                            Spacer()
                            Text(count(world.characters.filter { $0.raceID == race.id }.count, "character"))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .swipeActions { Button("Delete", role: .destructive) { deleting = .race(race) } }
                        .contextMenu { Button("Delete the race", systemImage: "trash", role: .destructive) { deleting = .race(race) } }
                    }
                    Button("Add a race", systemImage: "plus") { adding = .race }
                } header: {
                    Text("Races")
                } footer: {
                    Text("A race is what a character is, for example Orcs or Elves.")
                }
                Section {
                    ForEach(lore.factions.filter { $0.parentID == nil }) { group in
                        GroupRow(world: world, group: group, inner: false) { deleting = .group(group) }
                        ForEach(lore.factions.filter { $0.parentID == group.id }) { innerGroup in
                            GroupRow(world: world, group: innerGroup, inner: true) { deleting = .group(innerGroup) }
                        }
                    }
                    Button("Add a group", systemImage: "flag") { adding = .group }
                } header: {
                    Text("Groups")
                } footer: {
                    Text("A group is who a character serves: a kingdom, a clan, an order, a guild, a tribe, or a cult. Any race can join. A group can sit inside one larger group. Each group has its own fans, and its tone sets who likes it.")
                }
                if lore.factions.count >= 2 {
                    Section {
                        ForEach(pairs(lore), id: \.0) { _, a, b in
                            RelationRow(world: world, a: a, b: b)
                        }
                    } header: {
                        Text("Relations")
                    } footer: {
                        Text("Set where each pair starts. The sets' story beats move it: a war pushes two groups apart, and an alliance brings them together.")
                    }
                }
                Section {
                    if lore.timeline.isEmpty {
                        Text("No chapters yet. Each released set adds one.").foregroundStyle(.secondary)
                    }
                    ForEach(Array(lore.timeline.enumerated().reversed()), id: \.offset) { index, chapter in
                        ChapterRow(world: world, number: index + 1, chapter: chapter)
                    }
                } header: {
                    Text("Timeline")
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Lore")
        .sheet(item: $adding) { kind in
            NavigationStack { LoreItemForm(kind: kind) { adding = nil } }
        }
        .confirmationDialog("Delete \(deleting?.name ?? "")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                switch deleting {
                case .race(let r): error = store.deleteRace(r.id)
                case .group(let g): error = store.deleteGroup(g.id)
                case nil: break
                }
                deleting = nil
            }
        } message: {
            Text(deleteMessage)
        }
    }

    private var deleteMessage: String {
        switch deleting {
        case .race: "Its characters keep their group, but lose the race."
        case .group: "Its characters, forms, relations, and draft stories lose it. Released chapters keep it in the timeline."
        case nil: ""
        }
    }

    private func count(_ n: Int, _ noun: String) -> String { "\(n) \(noun)\(n == 1 ? "" : "s")" }

    private func pairs(_ lore: Lore) -> [(String, FactionID, FactionID)] {
        var result: [(String, FactionID, FactionID)] = []
        for (i, a) in lore.factions.enumerated() {
            for b in lore.factions.dropFirst(i + 1) { result.append(("\(a.id)-\(b.id)", a.id, b.id)) }
        }
        return result
    }
}

/// One group: its kind, tone, members, and the races among them.
private struct GroupRow: View {
    @Environment(GameStore.self) private var store
    let world: World
    let group: Faction
    let inner: Bool
    let onDelete: () -> Void

    var body: some View {
        let members = world.characters.filter { $0.factionID == group.id }
        let races = Set(members.compactMap(\.raceID)).compactMap { world.lore.race($0)?.name }.sorted()
        HStack(alignment: .top, spacing: 8) {
            if inner { Image(systemName: "arrow.turn.down.right").foregroundStyle(.secondary).font(.caption) }
            Image(systemName: group.emblem.systemImage).foregroundStyle(group.color.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(group.name).font(.subheadline.weight(.semibold))
                Text([(group.kind?.name ?? "Group"), group.tone.name, "\(members.count) members", races.isEmpty ? nil : races.joined(separator: ", ")]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
                // The lore researcher shows the group's biggest fans (U8).
                if world.market.insights.contains(.loreResearcher) {
                    let top = Audience.allCases.filter { $0 != .resellers }
                        .sorted { group.fans($0) > group.fans($1) }.prefix(3)
                    Text("Fans: " + top.map { "\($0.name) \(Int(group.fans($0).rounded()))" }.joined(separator: ", "))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.leading, inner ? 12 : 0)
        .swipeActions { Button("Delete", role: .destructive, action: onDelete) }
        .contextMenu {
            Menu("Inside a larger group") {
                Button("None") { _ = store.setGroupParent(group.id, to: nil) }
                ForEach(world.lore.factions.filter { $0.parentID == nil && $0.id != group.id }) { other in
                    Button(other.name) { _ = store.setGroupParent(group.id, to: other.id) }
                }
            }
            Button("Delete the \((group.kind?.name ?? "group").lowercased())", systemImage: "trash", role: .destructive, action: onDelete)
        }
    }
}

/// One pair of factions: the phrase, and a stepper for the relation.
private struct RelationRow: View {
    @Environment(GameStore.self) private var store
    let world: World
    let a: FactionID
    let b: FactionID

    var body: some View {
        let lore = world.lore
        let value = lore.relation(a, b)
        Stepper(value: Binding(get: { value }, set: { _ = store.setRelation(a, b, to: $0) }), in: -100...100, step: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(lore.faction(a)?.name ?? "") and \(lore.faction(b)?.name ?? "")").font(.subheadline.weight(.semibold))
                Text("\(Lore.relationPhrase(value)) (\(Int(value)))").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// One chapter of the timeline: the set, the beat, the factions, and the changes.
private struct ChapterRow: View {
    let world: World
    let number: Int
    let chapter: Chapter

    var body: some View {
        let lore = world.lore
        VStack(alignment: .leading, spacing: 3) {
            Text("Chapter \(number): \(world.catalog.set(chapter.setID)?.name ?? "A set")").font(.headline)
            if let story = chapter.story {
                Text("\(story.beat.name): \(story.factions.map { lore.faction($0)?.name ?? "a removed group" }.joined(separator: " and "))")
                    .font(.subheadline)
            }
            ForEach(Array(chapter.changes.enumerated()), id: \.offset) { _, change in
                Text(changeText(change))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.accent)
            }
            Text(Market.calendar(week: chapter.week)).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private extension ChapterRow {
    func changeText(_ change: StateChange) -> String {
        let name = world.character(change.characterID)?.name ?? "A character"
        switch change.kind {
        case .defected: return "\(name) changed sides."
        case .fell: return "\(name) fell."
        case .turned: return "\(name) turned."
        }
    }
}

/// A new race, or a new group of a kind (L8, L9). The title says exactly what it adds.
struct LoreItemForm: View {
    enum Kind: String, Identifiable { case race, group; var id: String { rawValue } }
    @Environment(GameStore.self) private var store
    let kind: Kind
    let onDone: () -> Void
    @State private var name = ""
    @State private var groupKind = GroupKind.kingdom
    @State private var parent: FactionID?
    @State private var emblem = SetSymbolShape.flame
    @State private var color = PaletteColor.crimson
    @State private var tone = FactionTone.heroic
    @State private var error: String?

    private var noun: String { kind == .race ? "race" : groupKind.name.lowercased() }

    var body: some View {
        Form {
            if kind == .group {
                Section {
                    Picker("Kind", selection: $groupKind) {
                        ForEach(GroupKind.allCases) { Text($0.name).tag($0) }
                    }
                    .accessibilityLabel("Kind")
                } footer: {
                    Text("A kingdom rules land. A clan or a tribe is kin. An order or a guild has a purpose. A cult follows a belief. Any race can join any group.")
                }
            }
            Section("Name") {
                TextField(kind == .race ? "Race name, for example Orcs" : "\(groupKind.name) name", text: $name)
                    .textInputAutocapitalization(.words)
                    .accessibilityLabel(kind == .race ? "Race name" : "Group name")
            }
            if kind == .group, let world = store.world {
                Section {
                    Picker("Inside", selection: $parent) {
                        Text("No larger group").tag(FactionID?.none)
                        ForEach(world.lore.factions.filter { $0.parentID == nil }) { Text($0.name).tag(FactionID?.some($0.id)) }
                    }
                    Picker("Tone", selection: $tone) {
                        ForEach(FactionTone.allCases) { Text($0.name).tag($0) }
                    }
                } footer: {
                    Text("A group can sit inside one larger group, for example an order inside a kingdom. The tone sets its hidden fans: heroic suits kids and parents, dark and rebel suit teens, and ancient and noble suit collectors.")
                }
            }
            Section("Emblem") {
                Picker("Shape", selection: $emblem) {
                    ForEach(SetSymbolShape.allCases) { Label($0.name, systemImage: $0.systemImage).tag($0) }
                }
                PaletteGrid(selection: $color, label: "Color")
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New \(noun)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Add the \(noun)") {
                    error = kind == .race
                        ? store.createRace(name: name, emblem: emblem, color: color)
                        : store.createGroup(name: name, kind: groupKind, parent: parent, tone: tone, emblem: emblem, color: color)
                    if error == nil { onDone() }
                }
            }
        }
    }
}

/// The character screen's Lore section: race, faction, and each form's side (L1, L5).
struct CharacterLoreSection: View {
    @Environment(GameStore.self) private var store
    let world: World
    let character: Character

    var body: some View {
        let lore = world.lore
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Lore")
            if lore.factions.isEmpty && lore.races.isEmpty {
                Text("No races or groups yet. Add them in Studio → Product → Lore.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Picker("Race", selection: Binding(
                    get: { character.raceID },
                    set: { store.setLore(character.id, race: $0, faction: character.factionID) }
                )) {
                    Text("No race").tag(RaceID?.none)
                    ForEach(lore.races) { Text($0.name).tag(RaceID?.some($0.id)) }
                }
                .accessibilityLabel("Race")
                Picker("Group", selection: Binding(
                    get: { character.factionID },
                    set: { store.setLore(character.id, race: character.raceID, faction: $0) }
                )) {
                    Text("No group").tag(FactionID?.none)
                    ForEach(lore.factions) { f in
                        Text(f.name + (f.parentID.flatMap { lore.faction($0)?.name }.map { ", in \($0)" } ?? "")).tag(FactionID?.some(f.id))
                    }
                }
                .accessibilityLabel("Group")
                ForEach(character.forms) { form in
                    Picker("\(form.name)'s side", selection: Binding(
                        get: { form.factionID },
                        set: { store.setFormFaction(character.id, form: form.id, faction: $0) }
                    )) {
                        Text("Same as \(character.name)").tag(FactionID?.none)
                        ForEach(lore.factions) { Text($0.name).tag(FactionID?.some($0.id)) }
                    }
                }
                Text("A form can sit on another side, for example a dark form that joins the enemy. Its cards count for that group.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// The set screen's Story section: the beat, its factions, and a named character (L3, L5, L7).
struct StorySection: View {
    @Environment(GameStore.self) private var store
    let world: World
    let set: CardSet
    @State private var error: String?

    var body: some View {
        let lore = world.lore
        let story = set.story
        let locked = set.status != .draft
        VStack(alignment: .leading, spacing: 10) {
            Label("Story", systemImage: "book.closed.fill").font(.title2.bold())
            if lore.factions.isEmpty {
                Text("Add groups in Studio → Product → Lore. Then each set can tell a chapter.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                Picker("Beat", selection: Binding(
                    get: { story?.beat },
                    set: { beat in
                        error = store.setStory(set.id, beat.map { b in
                            SetStory(beat: b, factions: Array((story?.factions ?? []).prefix(b.factionCount.upperBound)))
                        })
                    }
                )) {
                    Text("No beat").tag(Beat?.none)
                    ForEach(Beat.allCases) { Text($0.name).tag(Beat?.some($0)) }
                }
                .disabled(locked)
                if let story {
                    ForEach(0..<story.beat.factionCount.upperBound, id: \.self) { slot in
                        Picker(slotName(story.beat, slot), selection: Binding(
                            get: { story.factions.indices.contains(slot) ? story.factions[slot] : nil },
                            set: { value in
                                var s = story
                                if let value {
                                    if s.factions.indices.contains(slot) { s.factions[slot] = value } else { s.factions.append(value) }
                                } else if s.factions.indices.contains(slot) {
                                    s.factions.remove(at: slot)
                                }
                                error = store.setStory(set.id, s)
                            }
                        )) {
                            Text("Pick a group").tag(FactionID?.none)
                            ForEach(lore.factions) { Text($0.name).tag(FactionID?.some($0.id)) }
                        }
                        .disabled(locked)
                    }
                    if story.beat == .betrayal || story.beat == .fall {
                        Picker(story.beat == .betrayal ? "Who changes sides" : "Who falls", selection: Binding(
                            get: { story.character },
                            set: { var s = story; s.character = $0; error = store.setStory(set.id, s) }
                        )) {
                            Text("No one").tag(CharacterID?.none)
                            ForEach(world.characters.filter { $0.status == .active }) { Text($0.name).tag(CharacterID?.some($0.id)) }
                        }
                        .disabled(locked)
                    }
                    Text(beatHint(story.beat)).font(.caption).foregroundStyle(.secondary)
                }
                let presence = world.presence(set.id)
                if !presence.isEmpty {
                    Text("On the cards: " + presence.sorted { $0.value > $1.value }
                        .map { "\(lore.faction($0.key)?.name ?? "") \(Int(($0.value * 100).rounded()))%" }.joined(separator: ", "))
                        .font(.subheadline)
                }
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func slotName(_ beat: Beat, _ slot: Int) -> String {
        switch beat {
        case .betrayal: slot == 0 ? "The traitor" : "The betrayed"
        case .war, .alliance: slot == 0 ? "One side" : "The other side"
        default: "Group"
        }
    }

    private func beatHint(_ beat: Beat) -> String {
        switch beat {
        case .war: "Both sides' fans buy more, and the two groups move apart."
        case .alliance: "A small lift with both. A big one if they were enemies."
        case .betrayal: "The betrayed side's fans wait for the revenge. The traitor's fans split."
        case .rise: "The group's fans buy more, and it gains fame."
        case .fall: "Its fans are angry now, and they will want its return."
        case .discovery: "Curiosity with every audience. A good way to introduce a race."
        }
    }
}
