import SwiftUI
import SimCore

/// Open packs of a set to test it (docs/design/test-rip.md). A test rip is free,
/// and the game keeps nothing (P4). The pulls are gone when the sheet closes.
struct TestRipView: View {
    let world: World
    let set: CardSet
    let rip: TestRip
    let onClose: () -> Void

    private enum Opened {
        case pack(RippedPack)
        case box(RippedBox)
    }

    @State private var opened: Opened?
    @State private var shown: ShownPull?
    /// The rip is not part of the world, so it does not use a world stream (P4).
    @State private var rng = SystemRandomNumberGenerator()

    var body: some View {
        let numbers = world.catalog.cardNumbers(in: set.id)
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Wrapper(world: world, set: set)
                switch opened {
                case .pack(let pack):
                    PackGrid(world: world, set: set, rip: rip, pack: pack, numbers: numbers) { shown = ShownPull(pull: $0) }
                    actions(again: "Open another pack", other: "Open a box", box: false)
                case .box(let box):
                    BoxResult(world: world, set: set, rip: rip, box: box, numbers: numbers) { shown = ShownPull(pull: $0) }
                    actions(again: "Open another box", other: "Open a pack", box: true)
                case nil:
                    ProgressView()
                }
                Text("A test rip is free. The game keeps no pulls, and nothing changes in the world.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
        }
        .navigationTitle("Test rip")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done", action: onClose)
            }
        }
        .onAppear { if opened == nil { openPack() } }
        .sheet(item: $shown) { item in
            NavigationStack {
                PullDetail(world: world, set: set, rip: rip, pull: item.pull, numbers: numbers)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { shown = nil }
                        }
                    }
            }
        }
    }

    private func actions(again: String, other: String, box: Bool) -> some View {
        VStack(spacing: 10) {
            Button {
                box ? openBox() : openPack()
            } label: {
                Label(again, systemImage: box ? "shippingbox.fill" : "rectangle.stack.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button {
                box ? openPack() : openBox()
            } label: {
                Label(other, systemImage: box ? "rectangle.stack" : "shippingbox")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
    }

    private func openPack() { opened = .pack(rip.openPack(using: &rng)) }
    private func openBox() { opened = .box(rip.openBox(using: &rng)) }
}

/// A pull that the large card sheet shows.
private struct ShownPull: Identifiable {
    let id = UUID()
    let pull: Pull
}

/// The pack wrapper: the set name, the code, the symbol, and the headliner (test-rip.md, section 5).
private struct Wrapper: View {
    let world: World
    let set: CardSet

    var body: some View {
        let headliner = set.headliner.flatMap { HeadlinerLabel(world: world, headliner: $0) }
        let color = set.symbol.color.color
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                SetSymbolView(symbol: set.symbol, size: 36)
                Text(set.name).font(.title2.bold())
                Text([world.catalog.seriesNumber(of: set.id), set.code, "\(set.pack.cardCount) cards"].compactMap { $0 }.joined(separator: " · ")).font(.subheadline.weight(.semibold).monospaced())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let headliner {
                headliner.drawing.frame(width: 88, height: 88)
            }
        }
        .padding(16)
        .background(
            LinearGradient(colors: [color.opacity(0.35), color.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .accessibilityElement(children: .combine)
    }
}

/// One pack, all at once, in slot order (P1, P2).
private struct PackGrid: View {
    let world: World
    let set: CardSet
    let rip: TestRip
    let pack: RippedPack
    let numbers: [CardID: String]
    let onTap: (Pull) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            let hits = pack.hits.count
            Text(hits == 0 ? "No hits in this pack." : hits == 1 ? "1 hit in this pack." : "\(hits) hits in this pack.")
                .font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 14) {
                ForEach(Array(pack.positions.enumerated()), id: \.offset) { _, position in
                    if let pull = position.pull {
                        PullTile(world: world, set: set, pull: pull, numbers: numbers, onTap: onTap)
                    } else {
                        EmptyTile(slot: position.slot)
                    }
                }
            }
        }
    }
}

/// One box: its hits, and each outcome's count next to its expected count (P3).
private struct BoxResult: View {
    let world: World
    let set: CardSet
    let rip: TestRip
    let box: RippedBox
    let numbers: [CardID: String]
    let onTap: (Pull) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("\(box.packs.count) packs · \(box.hits.count) \(box.hits.count == 1 ? "hit" : "hits")").font(.headline)
            if !box.hits.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 14) {
                    ForEach(Array(box.hits.enumerated()), id: \.offset) { _, pull in
                        PullTile(world: world, set: set, pull: pull, numbers: numbers, onTap: onTap)
                    }
                }
            }
            counts
            NavigationLink {
                BoxPacks(world: world, set: set, rip: rip, box: box, numbers: numbers, onTap: onTap)
            } label: {
                Label("Show all packs", systemImage: "list.bullet")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    /// No color for luck: most boxes are uneven (test-rip.md, section 6).
    private var counts: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
            GridRow {
                Text("Outcome")
                Text("Pulled").gridColumnAlignment(.trailing)
                Text("Expected").gridColumnAlignment(.trailing)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            Divider()
            ForEach(box.counts, id: \.kind) { count in
                GridRow {
                    Text(set.pack.label(count.kind, ladder: set.ladder, subsets: set.subsets))
                    Text("\(count.pulled)").monospacedDigit()
                    Text(count.expected.formatted(.number.precision(.fractionLength(count.expected < 10 ? 1 : 0))))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                .font(.subheadline)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// The packs of one box. A tap opens one pack's grid.
private struct BoxPacks: View {
    let world: World
    let set: CardSet
    let rip: TestRip
    let box: RippedBox
    let numbers: [CardID: String]
    let onTap: (Pull) -> Void

    var body: some View {
        List(Array(box.packs.enumerated()), id: \.offset) { index, pack in
            NavigationLink {
                ScrollView {
                    PackGrid(world: world, set: set, rip: rip, pack: pack, numbers: numbers, onTap: onTap).padding(16)
                }
                .navigationTitle("Pack \(index + 1)")
            } label: {
                HStack {
                    Text("Pack \(index + 1)")
                    Spacer()
                    let names = pack.hits.map { set.shortLabel($0.kind) }
                    Text(names.isEmpty ? "No hits" : names.joined(separator: ", "))
                        .foregroundStyle(names.isEmpty ? .secondary : .primary)
                        .font(.subheadline.weight(names.isEmpty ? .regular : .semibold))
                }
            }
        }
        .navigationTitle("All packs")
    }
}

/// One pulled card. A hit glows and shows its outcome (test-rip.md, section 5).
private struct PullTile: View {
    let world: World
    let set: CardSet
    let pull: Pull
    let numbers: [CardID: String]
    let onTap: (Pull) -> Void

    var body: some View {
        if let card = world.catalog.card(pull.cardID),
           let face = CardFace(world: world, card: card, version: pull.version, numbers: numbers) {
            let glow = (face.tier?.color ?? .gold).color
            Button {
                onTap(pull)
            } label: {
                VStack(spacing: 4) {
                    CardView(face: face)
                        .shadow(color: pull.hit ? glow.opacity(0.9) : .clear, radius: pull.hit ? 10 : 0)
                    if pull.hit {
                        Text(set.shortLabel(pull.kind))
                            .font(.caption2.weight(.heavy))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(glow, in: Capsule())
                            .foregroundStyle(.white)
                    } else if pull.version != .base {
                        Text(set.versionName(card, pull.version)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(face.name), \(set.versionName(card, pull.version))\(pull.hit ? ", a hit" : "")")
        }
    }
}

/// A position whose slot has no cards (test-rip.md, section 3).
private struct EmptyTile: View {
    let slot: Int

    var body: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            .foregroundStyle(.orange)
            .aspectRatio(5.0 / 7.0, contentMode: .fit)
            .overlay {
                Text("Slot \(slot) has no cards yet")
                    .font(.caption2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.orange)
                    .padding(6)
            }
    }
}

/// One pull, large. The large card moves its foil.
private struct PullDetail: View {
    let world: World
    let set: CardSet
    let rip: TestRip
    let pull: Pull
    let numbers: [CardID: String]

    var body: some View {
        ScrollView {
            if let card = world.catalog.card(pull.cardID),
               let face = CardFace(world: world, card: card, version: pull.version, numbers: numbers) {
                VStack(spacing: 14) {
                    CardView(face: face, animated: true).frame(maxWidth: 320)
                    Text(face.name).font(.title2.bold())
                    Text([numbers[card.id], set.versionName(card, pull.version)].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.monospaced())
                        .foregroundStyle(.secondary)
                    if let line = rip.stats.line(pull.kind), let oneIn = line.oneIn {
                        let name = set.pack.label(pull.kind, ladder: set.ladder, subsets: set.subsets)
                        Label(
                            line.chance >= 0.5
                                ? "\(name): \(line.perPack.formatted(.number.precision(.fractionLength(1)))) per pack"
                                : "\(name): 1 in \(Int(oneIn.rounded()).formatted()) packs",
                            systemImage: pull.hit ? "sparkles" : "shippingbox"
                        )
                        .font(.subheadline.weight(.semibold))
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(pull.hit ? "A hit" : "A pull")
        .navigationBarTitleDisplayMode(.inline)
    }
}

extension CardSet {
    /// A short name for an outcome: the tier code, for example "SIR", or the version or subset name.
    func shortLabel(_ kind: PackOutcomeKind) -> String {
        if let id = kind.tierID, let tier = ladder.tier(id) { return tier.code }
        return pack.label(kind, ladder: ladder, subsets: subsets)
    }

    /// The name of a pulled version: the tier name for the base version, or the version name.
    func versionName(_ card: Card, _ version: VersionKey) -> String {
        guard let tier = ladder.tier(card.rarity) else { return "No rarity" }
        return tier.versions(excluding: [], own: card.ownVersions).first { $0.key == version }.map {
            version == .base ? tier.name : $0.version.name
        } ?? tier.name
    }
}
