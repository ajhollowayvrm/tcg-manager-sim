import SwiftUI
import SimCore

/// Business → Distributors and retailers (N1 to N4).
struct ChannelsView: View {
    @Environment(GameStore.self) private var store
    @AppStorage(HiddenNumbers.key) private var showHidden = true

    var body: some View {
        if let world = store.world {
            let book = world.channels
            List {
                Section {
                    LabeledContent("Contract", value: book.hasDistributor ? "Signed" : "None")
                    if book.hasDistributor {
                        Button("End the contract", role: .destructive) { store.endDistributor() }
                    } else {
                        Button("Sign with a distributor", systemImage: "signature") { store.signDistributor() }
                    }
                } header: {
                    Text("Distributor")
                } footer: {
                    Text(book.hasDistributor
                         ? "Hobby stores and big-box both order. You get 38% of the pack price. Ending the contract is free. Packs that already shipped stay in the stores."
                         : "You sell direct to hobby stores at 45%, but you reach only 40% of their demand. Big-box does not order. Signing is free.")
                }
                Section {
                    ForEach(Channel.allCases) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(c.name)
                                Spacer()
                                Text(c == .web ? "Open" : book.phrase(c)).foregroundStyle(.secondary)
                            }
                            Text("You get \(Int((book.studioShare(c) * 100).rounded()))% of the pack price"
                                 + (c == .bigBox && !book.hasDistributor ? " (needs a distributor)" : ""))
                                .font(.caption).foregroundStyle(.secondary)
                            if showHidden, c != .web {
                                Text(String(format: "Trust %.2f", book.trust(c))).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Channels")
                } footer: {
                    Text("A store that sells most of a set orders more next time. A store that sells little orders less. Big-box drops you after a very weak set. Your web store pays 70% when a pack sells.")
                }
                Section {
                    let sets = world.catalog.sets.filter { $0.release != nil }
                    if sets.isEmpty {
                        Text("No set has a print run yet.").foregroundStyle(.secondary)
                    }
                    ForEach(sets) { set in
                        LabeledContent(set.name, value: "\(Money.packs(world.warehousePacks(set.id) ?? 0)) packs")
                    }
                } header: {
                    Text("Warehouse")
                } footer: {
                    Text("The warehouse holds packs that no store ordered, held-back packs, and reprints. Storage costs $20 a month for each 3,600 packs.")
                }
            }
            .navigationTitle("Distributors and retailers")
        }
    }
}
