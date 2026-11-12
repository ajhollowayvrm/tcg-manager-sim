import SwiftUI
import SimCore

/// The Business tab (U2): the studio and other businesses. Money and the ledger
/// are here (B3). The other business systems do not exist yet, so the tab lists them.
struct BusinessView: View {
    @Environment(GameStore.self) private var store
    private let areas: [(title: String, systemImage: String, detail: String)] = [
        ("Printers", "printer.fill", "Print runs, foil capacity, and the cost of each card. Later, your own print facility."),
        ("Distributors and retailers", "shippingbox.and.arrow.backward.fill", "Orders, store limits, and how much stock each channel takes."),
        ("Partners", "person.2.fill", "Crossover sets, licensing your IP, promotions, and creators. A media crossover can start your growth."),
        ("Lenders and backers", "banknote.fill", "Bank loans, revenue-based financing, and crowdfunds."),
    ]

    var body: some View {
        NavigationStack {
            List {
                if let world = store.world {
                    MoneySection(business: world.business)
                }
                Section {
                    ForEach(areas, id: \.title) { area in
                        HStack(alignment: .top, spacing: 14) {
                            Image(systemName: area.systemImage)
                                .font(.title3)
                                .foregroundStyle(.secondary)
                                .frame(width: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(area.title).font(.headline)
                                Text(area.detail).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                } header: {
                    Text("Coming later")
                } footer: {
                    Text("This tab is your studio and other businesses. The systems above do not exist yet.")
                }
            }
            .navigationTitle("Business")
        }
    }
}

#Preview {
    BusinessView()
        .environment(GameStore(preview: .sample()))
}
