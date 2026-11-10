import SwiftUI
import SimCore

/// The character detail screen (roster.md, section 8.2).
struct CharacterDetailView: View {
    @Environment(GameStore.self) private var store
    let id: CharacterID

    enum Editor: Identifiable {
        case redesign
        case editForm(FormID)

        var id: String {
            switch self {
            case .redesign: "redesign"
            case .editForm(let id): "form-\(id)"
            }
        }
    }

    @State private var showAllAudiences = false
    @State private var editor: Editor?
    @State private var confirmRetire = false

    var body: some View {
        if let world = store.world, let character = world.character(id) {
            content(world, character)
        } else {
            ContentUnavailableView("Character not found", systemImage: "questionmark")
        }
    }

    private func content(_ world: World, _ c: Character) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(world, c)
                appealSection(world, c)
                attentionSection(c)
                formsSection(c)
                cardsSection
                relationsSection(world, c)
                actionsSection(c)
            }
            .padding(16)
        }
        .navigationTitle(c.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editor) { editor in
            NavigationStack { editorView(editor, world, c) }
                .interactiveDismissDisabled()
        }
        .confirmationDialog("Retire \(c.name)?", isPresented: $confirmRetire, titleVisibility: .visible) {
            Button("Retire", role: .destructive) { store.retire(c.id) }
        } message: {
            Text("A retired character does not appear on new cards. Its old cards stay on the market. You can bring it back later.")
        }
    }

    // MARK: Sections

    private func header(_ world: World, _ c: Character) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            CharacterPortrait(character: c, cornerRadius: 24, padding: 20)
                .frame(maxWidth: .infinity)
                .frame(height: 240)
            VStack(alignment: .leading, spacing: 4) {
                Text(c.name).font(.largeTitle.bold())
                Text(subtitle(world, c)).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                TypeBadge(type: c.primaryType)
                if let secondary = c.secondaryType { TypeBadge(type: secondary) }
                Chip(text: c.archetype.name)
                Chip(text: c.role.name)
            }
            PaletteSwatches(palette: c.palette)
        }
    }

    private func subtitle(_ world: World, _ c: Character) -> String {
        var parts: [String] = []
        parts.append(c.origin == .created ? "Created by you" : "Generated")
        parts.append("joined in week \(c.createdWeek)")
        if c.status == .retired { parts.append("retired") }
        let stage = world.stage(of: c.id)
        if stage > 1 || !world.nextStages(of: c.id).isEmpty { parts.append("stage \(stage)") }
        return parts.joined(separator: " · ")
    }

    private func appealSection(_ world: World, _ c: Character) -> some View {
        let fits = world.fits
        let ranked = Audience.allCases.sorted { a, b in
            let pa = c.popularity(a, fits: fits)
            let pb = c.popularity(b, fits: fits)
            if pa != pb { return pa > pb }
            return c.reading(a, fits: fits).mid > c.reading(b, fits: fits).mid
        }
        let shown = showAllAudiences ? ranked : Array(ranked.prefix(3))
        let unknown = Audience.allCases.allSatisfy { c.awareness[$0] <= 0.0005 }

        return VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                title: "Appeal",
                caption: "Each bar is your studio's reading, from dislike (left) to love (right). A wide bar means that you know little. The line marks zero."
            )
            if unknown {
                Label("Nobody knows \(c.name) yet. Awareness grows when \(c.name) appears on cards.", systemImage: "eye.slash")
                    .font(.footnote)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            }
            ForEach(shown) { audience in
                AudienceRangeBar(
                    audience: audience,
                    reading: c.reading(audience, fits: fits),
                    awareness: c.awareness[audience]
                )
            }
            Button(showAllAudiences ? "Show the top 3 audiences" : "Show all \(Audience.allCases.count) audiences") {
                withAnimation(.snappy) { showAllAudiences.toggle() }
            }
            .font(.subheadline.weight(.semibold))
        }
    }

    private func attentionSection(_ c: Character) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Buzz and fatigue")
            Gauge(value: c.buzz, in: 0...100) {
                Text("Buzz")
            } currentValueLabel: {
                Text("\(Int(c.buzz))")
            }
            .gaugeStyle(.accessoryLinearCapacity)
            .tint(Theme.accent)
            Gauge(value: c.fatigue, in: 0...100) {
                Text("Fatigue")
            } currentValueLabel: {
                Text("\(Int(c.fatigue))")
            }
            .gaugeStyle(.accessoryLinearCapacity)
            .tint(.orange)
            Text("Buzz rises with new cards and coverage, and falls each week. Fatigue rises when a character appears too often.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func formsSection(_ c: Character) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: "Forms",
                caption: "A form is a new design of \(c.name), for example a mega form. When you make a card with a new design, the game saves the form here. Every form shares \(c.name)'s popularity, and has its own appeal and buzz."
            )
            if c.forms.isEmpty {
                Text("No forms yet. The first form arrives with a card that shows a new design.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(c.forms) { form in
                            Button {
                                editor = .editForm(form.id)
                            } label: {
                                VStack(spacing: 4) {
                                    CharacterDrawing(form: form)
                                        .padding(6)
                                        .frame(width: 96, height: 96)
                                        .background(form.primaryType.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
                                    Text(form.name).font(.caption.weight(.semibold)).lineLimit(2).multilineTextAlignment(.center)
                                    Text("\(form.role.name) · buzz \(Int(form.buzz))").font(.caption2).foregroundStyle(.secondary)
                                }
                                .frame(width: 104)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Form \(form.name)")
                        }
                    }
                }
            }
        }
    }

    private var cardsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: "Cards")
            Text("No cards yet. Cards arrive with the set designer.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func relationsSection(_ world: World, _ c: Character) -> some View {
        let rows: [(String, [Character])] = [
            ("Evolves from", c.evolvesFrom.flatMap(world.character).map { [$0] } ?? []),
            ("Evolves into", world.nextStages(of: c.id)),
            ("Counterpart", c.counterpart.flatMap(world.character).map { [$0] } ?? []),
            ("Rivals", c.rivals.compactMap(world.character)),
            ("Companions", c.companions.compactMap(world.character)),
        ].filter { !$0.1.isEmpty }

        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Relations")
            if rows.isEmpty {
                Text("No relations. Add them with Redesign.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(rows, id: \.0) { label, characters in
                VStack(alignment: .leading, spacing: 6) {
                    Text(label).font(.subheadline.weight(.semibold))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(characters) { other in
                                NavigationLink(value: other.id) {
                                    VStack(spacing: 4) {
                                        CharacterPortrait(character: other, cornerRadius: 12, padding: 4)
                                            .frame(width: 64, height: 64)
                                        Text(other.name).font(.caption).lineLimit(1)
                                    }
                                    .frame(width: 72)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }

    private func actionsSection(_ c: Character) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Actions")
            Button {
                editor = .redesign
            } label: {
                Label("Redesign", systemImage: "paintbrush.pointed")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            if c.status == .active {
                Button(role: .destructive) {
                    confirmRetire = true
                } label: {
                    Label("Retire", systemImage: "archivebox")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            } else {
                Button {
                    store.restore(c.id)
                } label: {
                    Label("Bring back", systemImage: "arrow.uturn.backward")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            Text("A redesign costs some of the affection that fans have for \(c.name). A bigger change costs more. A change to a form costs half as much.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func editorView(_ editor: Editor, _ world: World, _ c: Character) -> some View {
        switch editor {
        case .redesign:
            CreatorView(
                mode: .redesign(c.id),
                initial: CharacterDraft(from: c),
                world: world,
                title: "Redesign \(c.name)",
                confirmLabel: "Save the redesign",
                onConfirm: { draft in
                    let error = store.redesign(c.id, draft)
                    if error == nil { self.editor = nil }
                    return error
                },
                onCancel: { self.editor = nil }
            )
        case .editForm(let formID):
            if let form = c.form(formID) {
                CreatorView(
                    mode: .editForm(formID, of: c.id),
                    initial: CharacterDraft(from: form),
                    world: world,
                    title: "Change \(form.name)",
                    confirmLabel: "Save the form",
                    onConfirm: { draft in
                        let error = store.redesignForm(formID, of: c.id, draft)
                        if error == nil { self.editor = nil }
                        return error
                    },
                    onCancel: { self.editor = nil }
                )
            }
        }
    }
}

#Preview {
    let world = World.sample()
    NavigationStack {
        CharacterDetailView(id: world.characters[1].id)
    }
    .environment(GameStore(preview: world))
}
