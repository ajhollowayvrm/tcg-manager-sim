import SwiftUI
import UniformTypeIdentifiers
import SimCore

/// Studio facts, saves, and the developer tools.
struct StudioView: View {
    @Environment(GameStore.self) private var store
    @State private var importing = false
    @State private var confirmNewGame = false
    @State private var generateCount = 15

    var body: some View {
        NavigationStack {
            Form {
                if let world = store.world {
                    Section("Studio") {
                        LabeledContent("Name", value: world.studioName)
                        LabeledContent("Week", value: "\(world.week)")
                        LabeledContent("Characters", value: "\(world.characters.count)")
                        LabeledContent(
                            "Created by you",
                            value: "\(world.characters.filter { $0.origin == .created }.count)"
                        )
                        LabeledContent("Sets", value: "\(world.catalog.sets.count)")
                        LabeledContent("Cards", value: "\(world.catalog.cards.count)")
                    }

                    Section {
                        NavigationLink {
                            LadderPresetsView()
                        } label: {
                            LabeledContent("Rarity ladders", value: "\(world.catalog.ladderPresets.count)")
                        }
                    } header: {
                        Text("Cards")
                    } footer: {
                        Text("A new set copies a rarity ladder. Each tier sets the look of its cards: the frame, the layout, the foil, the texture, the stamp, and the extra cost for each copy.")
                    }
                }

                Section {
                    if let url = store.saveURL {
                        ShareLink(item: url) {
                            Label("Export the save", systemImage: "square.and.arrow.up")
                        }
                    }
                    Button {
                        importing = true
                    } label: {
                        Label("Import a save", systemImage: "square.and.arrow.down")
                    }
                    if let saved = store.lastSaved {
                        LabeledContent("Last saved", value: saved.formatted(date: .abbreviated, time: .shortened))
                    }
                } header: {
                    Text("Save")
                } footer: {
                    Text("The game saves after every change. With a free Apple ID, the app stops after 7 days. Do not delete the app when that happens, because that deletes the save. Rebuild it from Xcode. Export the save often as a backup.")
                }

                Section {
                    Stepper("Characters to add: \(generateCount)", value: $generateCount, in: 10...20)
                    Button("Add generated characters") {
                        store.generateCharacters(count: generateCount)
                    }
                    Button("Advance one week") {
                        store.advanceWeek()
                    }
                } header: {
                    Text("Developer tools")
                } footer: {
                    Text("Later, each set adds generated characters when you print it. Until the print system exists, use these tools to test the roster.")
                }

                Section {
                    Button("Start a new game", role: .destructive) {
                        confirmNewGame = true
                    }
                } footer: {
                    Text("The current save moves to an archive file in the Files app. The game does not delete it.")
                }
            }
            .navigationTitle("Studio")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result {
                    store.importSave(from: url)
                }
            }
            .confirmationDialog("Start a new game?", isPresented: $confirmNewGame, titleVisibility: .visible) {
                Button("Start a new game", role: .destructive) { store.startOver() }
            } message: {
                Text("The current save moves to an archive file.")
            }
        }
    }
}

#Preview {
    StudioView()
        .environment(GameStore(preview: .sample()))
}
