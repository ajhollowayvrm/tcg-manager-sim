import SwiftUI
import SimCore

// Singles: the value of each card on the secondary market (decisions M1 to M4).

enum SinglePrice {
    /// "$0.25" below $10, "$281" above.
    static func text(_ price: Double) -> String {
        price < 10 ? String(format: "$%.2f", price) : Money.text(price)
    }
}

/// One single: the card, the version, the price, and the trend.
struct SingleRow: View {
    let world: World
    let single: Single
    var showSet = false
    /// The price analyst shows the copies and the trend (U16).
    private var tracked: Bool { world.market.insights.contains(.priceTracker) }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(single.name).font(.subheadline.weight(.semibold))
                Text((showSet ? (world.catalog.set(single.setID)?.name ?? "") + " · " : "") + single.versionName
                     + (tracked ? " · about \(Int(single.copies.rounded()).formatted()) copies" : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(SinglePrice.text(single.price)).font(.subheadline.monospacedDigit().weight(.semibold))
                if tracked, let trend = world.priceTrend(single), abs(trend) >= 0.01 {
                    Label("\(trend > 0 ? "+" : "")\(Int((trend * 100).rounded()))%",
                          systemImage: trend > 0 ? "arrow.up.right" : "arrow.down.right")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(trend > 0 ? .green : .red)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The set screen's singles: the top cards and the value of a pack (M1, M3).
struct SinglesSection: View {
    let world: World
    let set: CardSet
    @State private var showAll = false

    var body: some View {
        let singles = world.singles(in: set.id)
        VStack(alignment: .leading, spacing: 10) {
            Label("Singles", systemImage: "dollarsign.circle.fill").font(.title2.bold())
            if let release = set.release {
                let value = world.packValue(set.id)
                Text("The singles in one pack are worth \(SinglePrice.text(value)) on average. The pack costs \(String(format: "$%.2f", release.packPrice)).")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(singles.prefix(5)) { single in
                SingleRow(world: world, single: single)
                    .padding(10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            }
            if singles.count > 5 {
                Button("All \(singles.count) singles") { showAll = true }
                    .buttonStyle(.bordered)
            }
            Text("A price is the demand now against the copies that exist. Few copies, a loved character, old age, and a famous artist raise it. A reprint adds copies.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .sheet(isPresented: $showAll) {
            NavigationStack {
                List(singles) { SingleRow(world: world, single: $0) }
                    .navigationTitle("Singles: \(set.name)")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showAll = false } } }
            }
        }
    }
}

/// Studio → Product → Hall of fame: the most valuable singles of all sets (M3).
struct HallOfFameView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        List {
            if let world = store.world {
                let top = world.hallOfFame(limit: 25)
                Section {
                    if top.isEmpty {
                        Text("No released sets yet.").foregroundStyle(.secondary)
                    }
                    ForEach(Array(top.enumerated()), id: \.element.id) { index, single in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(index + 1)").font(.headline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 26)
                            SingleRow(world: world, single: single, showSet: true)
                        }
                    }
                } footer: {
                    Text("Valuable old cards make news in the hobby, and collectors hear of your studio. An old card from a small print can beat a modern card with a richer look.")
                }
            }
        }
        .navigationTitle("Hall of fame")
    }
}
