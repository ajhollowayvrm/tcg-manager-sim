import SwiftUI
import SimCore

/// Chooses between the new-game flow, the starter prompt, and the main tabs.
struct RootView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        @Bindable var store = store
        Group {
            if store.world == nil {
                NewGameFlow()
            } else if !store.ui.starterPromptDone {
                StarterFlow()
            } else {
                MainTabView()
            }
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
        ) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            Tab("Roster", systemImage: "person.3.fill") {
                RosterView()
            }
            Tab("Sets", systemImage: "rectangle.stack.fill") {
                SetsView()
            }
            Tab("Studio", systemImage: "building.2.fill") {
                StudioView()
            }
        }
    }
}

/// A new save: name the studio, then create the required mascot (roster.md, section 6.3).
struct NewGameFlow: View {
    @Environment(GameStore.self) private var store
    @State private var studioName = ""
    @State private var creatingMascot = false

    private var trimmedName: String {
        studioName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "rectangle.stack.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(Theme.accent)
                Text("Start your card studio")
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                Text("You start in a garage. Your first step is your mascot: the face of your cards.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                TextField("Studio name", text: $studioName)
                    .font(.title3)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.next)
                    .onSubmit { if !trimmedName.isEmpty { creatingMascot = true } }
                Spacer()
                Button {
                    creatingMascot = true
                } label: {
                    Text("Create the mascot").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(trimmedName.isEmpty)
            }
            .padding(24)
            .navigationDestination(isPresented: $creatingMascot) {
                CreatorView(
                    mode: .mascot,
                    initial: CharacterDraft(role: .mascot, primaryType: .storm, archetype: .cute, palette: ElementType.storm.defaultPalette),
                    world: nil,
                    title: "Your mascot",
                    confirmLabel: "Create the mascot",
                    onConfirm: { draft in
                        store.startNewGame(studioName: trimmedName, mascot: draft)
                    }
                )
            }
        }
    }
}

/// The optional starter trio (roster.md, section 6.3).
struct StarterFlow: View {
    @Environment(GameStore.self) private var store
    @State private var created = 0
    @State private var creating = false

    private static let starterTypes: [ElementType] = [.fire, .water, .nature]

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()
                if let mascot = store.world?.characters.first {
                    CharacterPortrait(character: mascot, cornerRadius: 24, padding: 16)
                        .frame(width: 160, height: 160)
                    Text("\(mascot.name) is ready")
                        .font(.title2.bold())
                }
                Text("Add a starter trio?")
                    .font(.title3.weight(.semibold))
                Text("Starters are the first partners that new fans pick. Many card games use three starters of different types. You can skip this and create them later.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                if created > 0 {
                    Text("\(created) of 3 starters created")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Button {
                    creating = true
                } label: {
                    Text("Create starter \(created + 1) of 3").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Button("Skip for now") {
                    store.finishStarterPrompt()
                }
                .controlSize(.large)
            }
            .padding(24)
            .navigationDestination(isPresented: $creating) {
                let type = Self.starterTypes[min(created, 2)]
                CreatorView(
                    mode: .starter,
                    initial: CharacterDraft(role: .starter, primaryType: type, palette: type.defaultPalette),
                    world: store.world,
                    title: "Starter \(created + 1) of 3",
                    confirmLabel: "Create the starter",
                    onConfirm: { draft in
                        if let error = store.createCharacter(draft) { return error }
                        created += 1
                        creating = false
                        if created >= 3 { store.finishStarterPrompt() }
                        return nil
                    }
                )
                .id(created)
            }
        }
    }
}
