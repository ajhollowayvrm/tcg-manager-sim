import SwiftUI
import SimCore

/// A form row that opens the theme library (C13). The themes are in groups,
/// and a search field filters them.
struct ThemePickerRow: View {
    @Environment(GameStore.self) private var store
    @Binding var selection: ThemeID?

    var body: some View {
        NavigationLink {
            ThemeList(selection: $selection)
        } label: {
            LabeledContent("Theme") {
                if let theme = selection.flatMap({ store.world?.catalog.theme($0) }) {
                    Label(theme.name, systemImage: theme.symbol)
                } else {
                    Text("None")
                }
            }
        }
    }
}

private struct ThemeList: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Binding var selection: ThemeID?
    @State private var search = ""

    var body: some View {
        let themes = (store.world?.catalog.themes ?? []).filter {
            search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)
        }
        List {
            if search.isEmpty {
                row(name: "None", symbol: "circle.slash", selected: selection == nil) { selection = nil }
            }
            ForEach(SetTheme.Group.allCases) { group in
                let members = themes.filter { $0.group == group }
                if !members.isEmpty {
                    Section(group.name) {
                        ForEach(members) { theme in
                            row(name: theme.name, symbol: theme.symbol, selected: selection == theme.id) {
                                selection = theme.id
                            }
                        }
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "Search the themes")
        .navigationTitle("Theme")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(name: String, symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            dismiss()
        } label: {
            HStack {
                Label(name, systemImage: symbol).foregroundStyle(.primary)
                Spacer()
                if selected { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
            }
        }
        .accessibilityLabel("Theme \(name)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A small chip with the theme's symbol and name.
struct ThemeBadge: View {
    let theme: SetTheme

    var body: some View {
        Label(theme.name, systemImage: theme.symbol)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(theme.tint.opacity(0.18), in: Capsule())
            .foregroundStyle(theme.tint)
    }
}

extension SetTheme {
    /// An element theme uses its type's color. The other themes use the accent.
    var tint: Color { element?.tint ?? Theme.accent }
}
