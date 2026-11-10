import SwiftUI
import SimCore

/// Edits one printed version (C16): its name, look, frame, and cost. A tier's
/// extra versions and a card's own versions use the same editor.
struct VersionEditor: View {
    @Binding var version: CardVersion
    /// The tier that the version belongs to. It gives the preview its rarity corner and color.
    let tier: RarityTier?
    /// Shows a remove button when set.
    var onRemove: (() -> Void)?

    var body: some View {
        Form {
            Section {
                CardView(face: CardFace(name: version.name.isEmpty ? "Preview" : version.name, tier: tier, version: version), animated: true)
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
            Section("Version name") {
                TextField("Version name", text: $version.name)
            }
            Section {
                Picker("Layout", selection: $version.look.layout) {
                    ForEach(CardLayout.allCases) { Text($0.name).tag($0) }
                }
                Picker("Foil", selection: $version.look.foil) {
                    ForEach(FoilPattern.allCases) { Text($0.name).tag($0) }
                }
                Toggle("Textured surface", isOn: $version.look.textured)
                Picker("Stamp", selection: $version.look.stamp) {
                    ForEach(CardStamp.allCases) { Text($0.name).tag($0) }
                }
                Picker("Frame style", selection: $version.frameStyle) {
                    ForEach(FrameStyle.allCases) { Text($0.name).tag($0) }
                }
            } header: {
                Text("Look")
            } footer: {
                Text(version.look.layout.hint)
            }
            PrintCostSection(look: version.look, frame: version.frameStyle)
            if let onRemove {
                Section {
                    Button("Remove this version", role: .destructive, action: onRemove)
                }
            }
        }
        .navigationTitle(version.name.isEmpty ? "Version" : version.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One row in a list of versions: a small card, the name, and the look.
struct VersionRow: View {
    let version: CardVersion
    let tier: RarityTier?
    /// The real card in this version. Nil shows a sample character.
    var face: CardFace?

    var body: some View {
        HStack(spacing: 12) {
            CardView(face: face ?? CardFace(name: version.name, tier: tier, version: version))
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(version.name)
                Text(version.look.summary + (version.costPerCopy > 0 ? " · +\(version.costPerCopy.dollars)" : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// The extra print cost of a look, part by part (C17). The game sets these
/// prices, so the section only shows them.
struct PrintCostSection: View {
    let look: CardLook
    let frame: FrameStyle

    var body: some View {
        Section {
            let parts: [(String, Double)] = [
                ("Layout: \(look.layout.name)", PrintCost.layout(look.layout)),
                ("Foil: \(look.foil.name)", PrintCost.foil(look.foil)),
                ("Texture", look.textured ? PrintCost.textured : 0),
                ("Stamp: \(look.stamp.name)", PrintCost.stamp(look.stamp)),
                ("Frame: \(frame.name)", PrintCost.frame(frame)),
            ].filter { $0.1 > 0 }
            ForEach(parts, id: \.0) { part in
                LabeledContent(part.0, value: "+\(part.1.dollars)")
            }
            LabeledContent("Total for each copy") {
                Text("+\(PrintCost.extra(for: look, frame: frame).dollars)").fontWeight(.semibold)
            }
        } header: {
            Text("Extra cost for each printed copy")
        } footer: {
            Text("The printer sets these prices. A plain card costs about $0.02 to $0.03 to print. Each part of the look adds to that for every copy.")
        }
    }
}

