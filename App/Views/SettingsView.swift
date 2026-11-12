import SwiftUI
import UniformTypeIdentifiers
import SimCore

/// The Settings tab: the save, the developer tools, and a new game.
struct SettingsView: View {
    @Environment(GameStore.self) private var store
    @State private var importing = false
    @State private var confirmNewGame = false
    @State private var generateCount = 15

    var body: some View {
        NavigationStack {
            Form {
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
            .navigationTitle("Settings")
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
    SettingsView()
        .environment(GameStore(preview: .sample()))
}
