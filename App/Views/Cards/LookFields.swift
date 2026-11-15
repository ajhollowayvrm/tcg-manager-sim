import SwiftUI
import SimCore

/// The parts of a look: the layout, the foils, the texture, and the stamps (C14).
/// Foils and stamps stack (C22). A tier and a version use the same rows.
struct LookFields: View {
    @Binding var look: CardLook

    var body: some View {
        Picker("Layout", selection: $look.layout) {
            ForEach(CardLayout.allCases) { Text($0.name).tag($0) }
        }
        NavigationLink {
            StackList(
                look: $look,
                title: "Foils",
                options: FoilPattern.allCases.filter { $0 != .none },
                name: \.name,
                cost: PrintCost.foil,
                isOn: { $0.has($1) },
                toggle: { $0.toggle($1) },
                footer: "Pick one foil or stack more. For example, Cracked ice on the art and Etched on the frame. Each foil adds its own print cost."
            )
        } label: {
            LabeledContent("Foils", value: look.foils.isEmpty ? "None" : look.foils.map(\.name).joined(separator: " + "))
        }
        Toggle("Textured surface", isOn: $look.textured)
        NavigationLink {
            StackList(
                look: $look,
                title: "Stamps",
                options: CardStamp.allCases.filter { $0 != .none },
                name: \.name,
                cost: PrintCost.stamp,
                isOn: { $0.has($1) },
                toggle: { $0.toggle($1) },
                footer: "Pick one stamp or stack more. For example, a signature and a serial number. Each stamp adds its own print cost."
            )
        } label: {
            LabeledContent("Stamps", value: look.stamps.isEmpty ? "None" : look.stamps.map(\.name).joined(separator: " + "))
        }
    }
}

/// A list of options with a check mark on each option that is on.
private struct StackList<Option: Hashable>: View {
    @Binding var look: CardLook
    let title: String
    let options: [Option]
    let name: (Option) -> String
    let cost: (Option) -> Double
    let isOn: (CardLook, Option) -> Bool
    let toggle: (inout CardLook, Option) -> Void
    let footer: String

    var body: some View {
        Form {
            Section {
                ForEach(options, id: \.self) { option in
                    let on = isOn(look, option)
                    Button {
                        toggle(&look, option)
                    } label: {
                        HStack {
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(on ? Theme.accent : .secondary)
                            Text(name(option)).foregroundStyle(.primary)
                            Spacer()
                            Text("+\(cost(option).dollars)").font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            } footer: {
                Text(footer)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
