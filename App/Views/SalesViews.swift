import SwiftUI
import Charts
import SimCore

// The selling engine's screens (docs/design/sales.md, section 11).

/// The Settings switch that shows the true factors and the forecast (B12).
enum HiddenNumbers {
    static let key = "showHiddenNumbers"
}

extension Audience {
    /// A fixed color for charts.
    var chartColor: Color {
        switch self {
        case .kids: PaletteColor.sunflower.color
        case .parents: PaletteColor.rose.color
        case .teens: PaletteColor.ember.color
        case .casualPlayers: PaletteColor.lime.color
        case .competitivePlayers: PaletteColor.forest.color
        case .nostalgiaAdults: PaletteColor.cream.color
        case .completionists: PaletteColor.sky.color
        case .chaseCollectors: PaletteColor.crimson.color
        case .artCollectors: PaletteColor.violet.color
        case .investors: PaletteColor.gold.color
        case .resellers: PaletteColor.charcoal.color
        }
    }

    static var chartScale: KeyValuePairs<String, Color> {
        [
            Audience.kids.name: Audience.kids.chartColor, Audience.parents.name: Audience.parents.chartColor,
            Audience.teens.name: Audience.teens.chartColor, Audience.casualPlayers.name: Audience.casualPlayers.chartColor,
            Audience.competitivePlayers.name: Audience.competitivePlayers.chartColor,
            Audience.nostalgiaAdults.name: Audience.nostalgiaAdults.chartColor,
            Audience.completionists.name: Audience.completionists.chartColor,
            Audience.chaseCollectors.name: Audience.chaseCollectors.chartColor,
            Audience.artCollectors.name: Audience.artCollectors.chartColor,
            Audience.investors.name: Audience.investors.chartColor, Audience.resellers.name: Audience.resellers.chartColor,
            "Missed": Color.gray.opacity(0.35),
        ]
    }
}

enum Money {
    static func text(_ value: Double) -> String {
        let sign = value < 0 ? "-" : ""
        return "\(sign)$\(Int(abs(value).rounded()).formatted())"
    }

    static func packs(_ value: Double) -> String { Int(value.rounded()).formatted() }
}

// MARK: - Time

/// "Next week", with a menu that skips 4 weeks (B11).
struct NextWeekButton: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        Menu {
            Button("Skip 4 weeks", systemImage: "forward.fill") { store.advanceWeeks(4) }
            Button("Skip to the next event", systemImage: "forward.end.fill") { store.advanceToNextEvent() }
        } label: {
            Label("Next week", systemImage: "forward.frame.fill")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Theme.accent, in: Capsule())
                .foregroundStyle(.white)
        } primaryAction: {
            store.advanceWeek()
        }
        .accessibilityLabel("Next week")
    }
}

// MARK: - Charts

/// Weekly packs, stacked by audience, with missed demand in gray.
struct SalesChart: View {
    let weeks: [WeekSales]
    var showMissed = true

    private struct Point: Identifiable {
        let id = UUID()
        let week: Int
        let series: String
        let packs: Double
    }

    var body: some View {
        let points = weeks.flatMap { w -> [Point] in
            var list = Audience.allCases.compactMap { a -> Point? in
                let packs = w.sold[a.rawValue]
                return packs > 0.5 ? Point(week: w.week, series: a.name, packs: packs) : nil
            }
            if showMissed, w.totalMissed > 0.5 { list.append(Point(week: w.week, series: "Missed", packs: w.totalMissed)) }
            return list
        }
        Chart(points) { point in
            BarMark(x: .value("Week", point.week), y: .value("Packs", point.packs))
                .foregroundStyle(by: .value("Audience", point.series))
        }
        .chartForegroundStyleScale(Audience.chartScale)
        .chartLegend(position: .bottom, alignment: .leading, spacing: 8)
        .chartXAxisLabel("Week")
        .frame(height: 260)
        .accessibilityLabel("Weekly packs by audience")
    }
}

// MARK: - The set screen's release section

/// Set screen → Release: plan it, wait for it, or see its sales.
struct ReleaseSection: View {
    @Environment(GameStore.self) private var store
    @AppStorage(HiddenNumbers.key) private var showHidden = true
    let world: World
    let set: CardSet
    @State private var planning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Release", systemImage: "calendar.badge.clock").font(.title2.bold())
            switch set.status {
            case .draft:
                Text(set.leadArt == nil
                     ? "Pick a lead artist first. Every print run needs an artist."
                     : "Plan a print run, a pack price, and a release week. Scheduling pays the print cost and locks the set.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button {
                    planning = true
                } label: {
                    Label("Plan the release", systemImage: "printer.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(set.leadArt == nil)
            case .scheduled:
                if let release = set.release {
                    let weeks = release.releaseWeek - world.week
                    Text("Releases in \(weeks) \(weeks == 1 ? "week" : "weeks"): \(Market.calendar(week: release.releaseWeek)).")
                        .font(.headline)
                    Text("\(Money.packs(Double(release.printedPacks))) packs printed at \(String(format: "$%.2f", release.packPrice)). The previews run now.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if showHidden || world.market.insights.contains(.curve) {
                        SalesChart(weeks: world.forecast(set.id))
                        Text("Forecast for the first 12 weeks, with no luck.").font(.caption).foregroundStyle(.secondary)
                    }
                    salesLink
                }
            case .released:
                if let release = set.release {
                    let weeks = world.business.sales[set.id] ?? []
                    let sold = weeks.reduce(0) { $0 + $1.totalSold }
                    HStack {
                        stat("Sold", Money.packs(sold))
                        stat("Stock", Money.packs(release.stockPacks))
                        stat("Revenue", Money.text(weeks.reduce(0) { $0 + $1.revenue }))
                    }
                    SalesChart(weeks: Array(weeks.suffix(12)))
                    salesLink
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        .sheet(isPresented: $planning) {
            NavigationStack {
                ReleasePlanView(setID: set.id) { planning = false }
            }
        }
    }

    private var salesLink: some View {
        NavigationLink {
            SetSalesView(setID: set.id)
        } label: {
            Label("Sales and the algorithm", systemImage: "function").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.headline.monospacedDigit())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - The release plan

/// The print run, the pack price, the release week, and a live forecast (B1).
struct ReleasePlanView: View {
    @Environment(GameStore.self) private var store
    @AppStorage(HiddenNumbers.key) private var showHidden = true
    let setID: SetID
    let onDone: () -> Void

    @State private var boxes = 500
    @State private var price = Pricing.defaultPackPrice
    @State private var releaseWeek: Int?
    @State private var error: String?
    @State private var campaign = Campaign()
    @State private var holdBackPercent = 0

    var body: some View {
        if let world = store.world, let set = world.catalog.set(setID) {
            let holdBack = Double(holdBackPercent) / 100
            let orders = world.orderPlan(setID, boxes: boxes, packPrice: price, holdBack: holdBack)
            let earliest = max(world.week + Pricing.previewWeeks, world.setArtReadyWeek(setID))
            let week = max(earliest, releaseWeek ?? world.week + 4)
            let cost = world.printCost(setID, boxes: boxes)
            let packs = boxes * set.pack.boxSize
            Form {
                Section {
                    Stepper(value: $boxes, in: Pricing.boxRange, step: boxes < 100 ? 10 : 50) {
                        LabeledContent("Boxes", value: boxes.formatted())
                    }
                    LabeledContent("Packs", value: packs.formatted())
                    LabeledContent("Cost for each pack", value: String(format: "$%.3f", world.printCostPerPack(setID)))
                    LabeledContent("Lead artist's pay", value: Money.text(world.leadArtCost(setID)))
                    LabeledContent("Print cost", value: Money.text(cost))
                    LabeledContent("Cash after") {
                        Text(Money.text(world.business.cash - cost)).foregroundStyle(world.business.cash - cost < 0 ? .red : .primary)
                    }
                } header: {
                    Text("Print run")
                } footer: {
                    Text("Each card costs $0.025, each wrapper $0.05, plus the looks. The first run adds a \(Money.text(world.printSetupCost)) setup and the lead artist's pay. A larger run reaches more people from the shelves, and risks unsold stock.")
                }
                Section {
                    Stepper(value: $price, in: Pricing.packPriceRange, step: 0.25) {
                        LabeledContent("Pack price", value: String(format: "$%.2f", price))
                    }
                    LabeledContent("You get for each pack", value: "$\(String(format: "%.2f", price * 0.38)) to $\(String(format: "%.2f", price * 0.70))")
                } header: {
                    Text("Price")
                } footer: {
                    Text("You get 38% from a distributor or big-box, 45% from a hobby store direct, and 70% on your web store. Kids and parents notice the price most.")
                }
                Section {
                    Stepper(value: Binding(get: { week }, set: { releaseWeek = $0 }),
                            in: earliest...(world.week + 104)) {
                        LabeledContent("Release", value: Market.calendar(week: week))
                    }
                    LabeledContent("Season then", value: Market.seasonPhrase(week: week))
                    LabeledContent("Art done", value: Market.calendar(week: world.setArtReadyWeek(setID)))
                } header: {
                    Text("Release week")
                } footer: {
                    Text("Previews run for 3 weeks before the release. The set cannot release before its art is done. The holidays lift kids and parents.")
                }
                if let orders {
                    Section {
                        Stepper(value: $holdBackPercent, in: 0...50, step: 5) {
                            LabeledContent("Hold back for the web store", value: "\(holdBackPercent)%")
                        }
                        LabeledContent("Held back", value: "\(orders.heldBack.formatted()) packs")
                        if orders.backerPacks > 0 {
                            LabeledContent("Owed to backers", value: "\(orders.backerPacks.formatted()) packs")
                        }
                        LabeledContent("Hobby stores order", value: "\(orders.orders(.hobby).formatted()) packs")
                        if world.channels.hasDistributor {
                            LabeledContent("Big-box retail orders", value: "\(orders.orders(.bigBox).formatted()) packs")
                        } else {
                            LabeledContent("Big-box retail orders", value: "Needs a distributor")
                        }
                        LabeledContent("Paid at shipment", value: Money.text(orders.shipmentMoney))
                        if orders.shortage {
                            Text("The stores want more than the print run gives. Each store gets less.").foregroundStyle(.orange)
                        }
                    } header: {
                        Text("Orders and the web store")
                    } footer: {
                        Text("The stores order before the release, and pay when the packs ship. Held-back packs stay in your warehouse and sell on your web store at 70%.")
                    }
                }
                CampaignSection(world: world, campaign: $campaign)
                Section {
                    if showHidden || world.market.insights.contains(.forecast) {
                        let forecast = world.forecast(setID, boxes: boxes, packPrice: price, releaseWeek: week, campaign: campaign,
                                                      holdBack: holdBack)
                        let sold = forecast.reduce(0) { $0 + $1.totalSold }
                        let missed = forecast.reduce(0) { $0 + $1.totalMissed }
                        let revenue = forecast.reduce(0) { $0 + $1.revenue }
                        LabeledContent("Packs sold", value: Money.packs(sold))
                        LabeledContent("Missed for lack of stock", value: Money.packs(missed))
                        LabeledContent("Revenue", value: Money.text(revenue))
                        LabeledContent("Profit after print and marketing", value: Money.text(revenue - cost - world.cost(of: campaign)))
                        if showHidden || world.market.insights.contains(.curve) {
                            SalesChart(weeks: forecast)
                        }
                    } else {
                        LockedRow(insight: .forecast)
                    }
                } header: {
                    Text("Forecast, first 12 weeks")
                } footer: {
                    Text("The forecast has no luck in it. Real weeks move about 15% either way.")
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle("Plan the release")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Schedule") {
                        error = store.scheduleRelease(setID, boxes: boxes, packPrice: price, releaseWeek: week, campaign: campaign,
                                                    holdBack: holdBack)
                        if error == nil { onDone() }
                    }
                }
            }
        }
    }
}

// MARK: - Sales and the algorithm

/// One set's sales week by week, its stock and reprints, and the algorithm of each audience.
struct SetSalesView: View {
    @Environment(GameStore.self) private var store
    @AppStorage(HiddenNumbers.key) private var showHidden = true
    let setID: SetID
    @State private var reprintBoxes = 200
    @State private var error: String?

    var body: some View {
        if let world = store.world, let set = world.catalog.set(setID), let release = set.release {
            let weeks = world.business.sales[setID] ?? []
            let visible = showHidden || world.market.insights.contains(.forecast)
            List {
                Section {
                    LabeledContent("Status", value: set.status == .released
                                   ? "Week \(world.week - release.releaseWeek) of its life"
                                   : "Releases \(Market.calendar(week: release.releaseWeek))")
                    LabeledContent("Packs sold", value: Money.packs(weeks.reduce(0) { $0 + $1.totalSold }))
                    LabeledContent("Missed for lack of stock", value: Money.packs(weeks.reduce(0) { $0 + $1.totalMissed }))
                    LabeledContent("Stock left", value: Money.packs(release.stockPacks))
                    LabeledContent("Printed", value: release.printedPacks.formatted())
                    LabeledContent("Revenue to you", value: Money.text(weeks.reduce(0) { $0 + $1.revenue }))
                    if let campaign = release.campaign {
                        LabeledContent("Marketing", value: "\(Money.text(world.cost(of: campaign))) · \(Money.packs(release.campaignReached ?? 0)) people reached")
                    }
                }
                if let ch = release.channels {
                    Section {
                        ForEach(Channel.allCases) { c in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.name).font(.subheadline.bold())
                                Text("Sold \(Money.packs(ch.sold(c))) packs"
                                     + (c == .web ? "" : " · \(Money.packs(ch.stock(c))) in stock · \(Money.packs(ch.received(c))) received"))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        LabeledContent("Warehouse", value: "\(Money.packs(ch.warehouse(total: release.stockPacks))) packs")
                        if ch.backerPacks > 0 {
                            LabeledContent("Sent to backers", value: "\(ch.backerPacks.formatted()) packs")
                        }
                        if ch.limited {
                            Text("Big-box stores limit this set to 2 packs a person.").foregroundStyle(.orange)
                        }
                    } header: {
                        Text("Channels")
                    } footer: {
                        Text("Stores pay when packs ship. The web store pays when a pack sells. The warehouse costs about $20 a month for each 3,600 packs.")
                    }
                }
                if !weeks.isEmpty {
                    Section("Weekly sales") {
                        SalesChart(weeks: weeks)
                    }
                }
                Section {
                    Stepper(value: $reprintBoxes, in: 10...Pricing.boxRange.upperBound, step: 50) {
                        LabeledContent("Reprint", value: "\(reprintBoxes.formatted()) boxes")
                    }
                    let cost = Double(reprintBoxes * set.pack.boxSize) * world.printCostPerPack(setID)
                    Button("Order the reprint for \(Money.text(cost))", systemImage: "printer") {
                        error = store.reprint(setID, boxes: reprintBoxes)
                    }
                    ForEach(Array(release.pendingReprints.enumerated()), id: \.offset) { _, r in
                        LabeledContent("Arrives \(Market.calendar(week: r.arrivalWeek))", value: "\(r.packs.formatted()) packs")
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                } header: {
                    Text("Reprints")
                } footer: {
                    Text("A reprint arrives \(world.reprintDelay) weeks after the order. Kids, parents, and completionists like a reprint. Investors do not.")
                }
                Section {
                    if visible {
                        ForEach(world.setDemand(setID, packPrice: release.packPrice)) { d in
                            NavigationLink {
                                AudienceAlgorithmView(setID: setID, audience: d.audience)
                            } label: {
                                AlgorithmRow(demand: d, sold: weeks.reduce(0) { $0 + $1.sold[d.audience.rawValue] })
                            }
                        }
                    } else {
                        LockedRow(insight: .forecast)
                    }
                } header: {
                    Text("The algorithm")
                } footer: {
                    Text("Each audience takes a share of the yearly money of the people who know you. The factors raise or lower that share. Tap an audience to see every factor.")
                }
            }
            .navigationTitle(set.name)
        } else {
            ContentUnavailableView("No release yet", systemImage: "calendar")
        }
    }
}

/// One audience in the algorithm list: its share and its packs so far.
private struct AlgorithmRow: View {
    let demand: AudienceDemand
    let sold: Double

    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(demand.audience.chartColor).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(demand.audience.name).font(.subheadline.weight(.semibold))
                Text(demand.audience == .resellers
                     ? "Follow the stock gap"
                     : "Share \(percent(demand.lifetimeShare)) · factors ×\(String(format: "%.2f", demand.product))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(Money.packs(sold)).font(.subheadline.monospacedDigit())
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Algorithm \(demand.audience.name)")
    }
}

private func percent(_ value: Double) -> String { "\((value * 100).formatted(.number.precision(.fractionLength(1))))%" }

/// One audience's full demand for one set: every factor, the conditions now,
/// the buying rhythm, and the real sales (B12).
struct AudienceAlgorithmView: View {
    @Environment(GameStore.self) private var store
    let setID: SetID
    let audience: Audience

    var body: some View {
        if let world = store.world, let set = world.catalog.set(setID), let release = set.release,
           let d = world.setDemand(setID, packPrice: release.packPrice).first(where: { $0.audience == audience }) {
            let market = world.market
            let weeks = world.business.sales[setID] ?? []
            List {
                Section {
                    LabeledContent("People who know you", value: Money.packs(d.reachedPeople))
                    LabeledContent("Yearly spend for each person", value: Money.text(d.spend))
                    LabeledContent("Their yearly money", value: Money.text(d.reachedPeople * d.spend))
                } header: {
                    Text("Who can buy")
                }
                Section {
                    LabeledContent("A normal set", value: percent(World.baseShare))
                    ForEach(d.factors) { factor in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(factor.name).font(.subheadline.weight(.semibold))
                                Spacer()
                                Text("×\(String(format: "%.2f", factor.value))")
                                    .font(.subheadline.monospacedDigit().weight(.semibold))
                                    .foregroundStyle(factor.value > 1.005 ? .green : factor.value < 0.995 ? .red : .secondary)
                            }
                            Text(factor.note).font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                    LabeledContent("Lifetime share") {
                        Text(percent(d.lifetimeShare)).fontWeight(.bold)
                    }
                    LabeledContent("Lifetime money for this set", value: Money.text(d.lifetimeDollars))
                    LabeledContent("Lifetime packs", value: Money.packs(d.lifetimeDollars / release.packPrice))
                } header: {
                    Text("The factors")
                } footer: {
                    Text("Lifetime share = 25% × every factor, with a ceiling of 90%. Green raises demand. Red lowers it.")
                }
                Section {
                    LabeledContent("Season", value: "×\(String(format: "%.2f", market.season(audience, week: world.week)))")
                    LabeledContent("Hobby heat", value: "×\(String(format: "%.2f", market.hobby(audience)))")
                    LabeledContent("Release fatigue", value: "×\(String(format: "%.2f", market.fatigueMultiplier(audience)))")
                    LabeledContent("Goodwill", value: "×\(String(format: "%.2f", market.goodwillMultiplier(audience)))")
                    if audience != .resellers {
                        let cap = World.walletShare * d.reachedPeople * d.spend
                        LabeledContent("Fan wallet left", value: "\(Money.text(world.walletLeft(audience))) of \(Money.text(cap))")
                    }
                } header: {
                    Text("This week's conditions")
                } footer: {
                    Text("Each week, the conditions multiply the demand, then about 15% of luck. Over any 52 weeks, your sets together can take at most half of a fan's yearly money. When the wallet runs low, every set gets less.")
                }
                Section {
                    let lifeWeek = world.week - release.releaseWeek
                    Chart {
                        ForEach(0..<Rhythm.weeks, id: \.self) { w in
                            AreaMark(x: .value("Week", w), y: .value("Share", Rhythm.weight(audience, week: w) * 100))
                                .foregroundStyle(audience.chartColor.opacity(0.5))
                        }
                        if (0..<Rhythm.weeks).contains(lifeWeek) {
                            RuleMark(x: .value("Now", lifeWeek)).foregroundStyle(.primary)
                        }
                    }
                    .chartXAxisLabel("Week since release")
                    .chartYAxisLabel("% of lifetime")
                    .frame(height: 160)
                    Text(AudienceProfile.of(audience).rhythm).font(.caption).foregroundStyle(.secondary)
                } header: {
                    Text("Buying rhythm")
                }
                if !weeks.isEmpty {
                    Section("Packs sold to this audience") {
                        Chart {
                            ForEach(weeks, id: \.week) { w in
                                BarMark(x: .value("Week", w.week), y: .value("Packs", w.sold[audience.rawValue]))
                                    .foregroundStyle(audience.chartColor)
                                if w.missed[audience.rawValue] > 0.5 {
                                    BarMark(x: .value("Week", w.week), y: .value("Packs", w.missed[audience.rawValue]))
                                        .foregroundStyle(Color.gray.opacity(0.35))
                                }
                            }
                        }
                        .frame(height: 160)
                    }
                }
            }
            .navigationTitle(audience.name)
        }
    }
}

// MARK: - The Market tab's sales

/// Market → Sales: the latest week across all sets, and the releases.
struct MarketSalesSection: View {
    let world: World

    var body: some View {
        let released = world.catalog.sets.filter { $0.release != nil }
        if !released.isEmpty {
            let latest = released.compactMap { world.business.sales[$0.id]?.last }.filter { $0.week == world.week }
            Section {
                if !latest.isEmpty {
                    LabeledContent("Packs this week", value: Money.packs(latest.reduce(0) { $0 + $1.totalSold }))
                    LabeledContent("Revenue this week", value: Money.text(latest.reduce(0) { $0 + $1.revenue }))
                    let byAudience = Audience.allCases.map { a in (a, latest.reduce(0) { $0 + $1.sold[a.rawValue] }) }
                        .filter { $0.1 > 0.5 }.sorted { $0.1 > $1.1 }.prefix(3)
                    ForEach(Array(byAudience), id: \.0) { a, packs in
                        LabeledContent(a.name, value: Money.packs(packs))
                    }
                }
                ForEach(released) { set in
                    NavigationLink {
                        SetSalesView(setID: set.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(set.name).font(.headline)
                            Text(set.status == .released
                                 ? "\(Money.packs((world.business.sales[set.id] ?? []).reduce(0) { $0 + $1.totalSold })) packs sold · \(Money.packs(set.release?.stockPacks ?? 0)) in stock"
                                 : "Releases \(Market.calendar(week: set.release?.releaseWeek ?? 0))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            } header: {
                Text("Sales")
            }
        }
    }
}

// MARK: - Money

/// Business → Money: the cash and the ledger (B3).
struct MoneySection: View {
    let business: Business

    var body: some View {
        Section {
            LabeledContent("Cash") {
                Text(Money.text(business.cash)).font(.headline.monospacedDigit()).foregroundStyle(business.cash < 0 ? .red : .primary)
            }
            if business.cash < 0 {
                Label("Cash is below zero. Loans come later.", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            NavigationLink {
                List(Array(business.ledger.enumerated().reversed()), id: \.offset) { _, entry in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.note).font(.subheadline)
                            Text(Market.calendar(week: entry.week)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(Money.text(entry.amount)).font(.subheadline.monospacedDigit())
                            .foregroundStyle(entry.amount < 0 ? .red : .green)
                    }
                }
                .navigationTitle("Ledger")
            } label: {
                LabeledContent("Ledger", value: "\(business.ledger.count) entries")
            }
        } header: {
            Text("Money")
        }
    }
}

// MARK: - Marketing (costs.md, section 5)

/// The release plan's marketing: previews, creators, store events, and ads (K5).
struct CampaignSection: View {
    let world: World
    @Binding var campaign: Campaign

    var body: some View {
        Section {
            Stepper(value: $campaign.previewBudget, in: 0...100_000, step: 1_000) {
                LabeledContent("Previews", value: Money.text(campaign.previewBudget))
            }
            Stepper(value: $campaign.adBudget, in: 0...500_000, step: 1_000) {
                LabeledContent("Ads", value: Money.text(campaign.adBudget))
            }
            Stepper(value: $campaign.storeKits, in: 0...50_000, step: 100) {
                LabeledContent("Store event kits", value: campaign.storeKits.formatted())
            }
            ForEach(world.creators) { creator in
                let picked = campaign.creators.contains(creator.id)
                Button {
                    if picked { campaign.creators.removeAll { $0 == creator.id } } else { campaign.creators.append(creator.id) }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(creator.name).font(.subheadline.weight(.semibold))
                            Text("\(MarketFormat.people(creator.subscribers)) subscribers · \(mixText(creator)) · \(Money.text(creator.price)) a video")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(picked ? Theme.accent : .secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Creator \(creator.name)")
            }
            LabeledContent("Marketing cost", value: Money.text(world.cost(of: campaign)))
            LabeledContent("New people", value: Money.packs(world.reach(of: campaign)))
        } header: {
            Text("Marketing")
        } footer: {
            Text("Previews reach collectors, teens, and players at $5 a person. Ads reach kids, parents, and teens at $8 for 1,000 views. Creators reach their own fans at $25 for 1,000 views. Each event kit costs $8 and reaches one player. You pay when you schedule.")
        }
    }

    private func mixText(_ creator: Creator) -> String {
        creator.mix.sorted { $0.value > $1.value }.prefix(2).map { $0.key.name.lowercased() }.joined(separator: ", ")
    }
}

/// Business → Brand budget: ads and creators every week, release or not (K6).
struct BrandBudgetSection: View {
    @Environment(GameStore.self) private var store
    let business: Business

    var body: some View {
        let budget = business.brandBudget ?? 0
        let adShare = business.brandAdShare ?? 0.5
        Section {
            Stepper(value: Binding(get: { budget }, set: { store.setBrandBudget($0, adShare: adShare) }), in: 0...200_000, step: 500) {
                LabeledContent("Each week", value: Money.text(budget))
            }
            VStack(alignment: .leading, spacing: 4) {
                Slider(value: Binding(get: { adShare }, set: { store.setBrandBudget(budget, adShare: $0) }), in: 0...1)
                    .accessibilityLabel("Share for ads")
                HStack {
                    Text("Creators \(Int(((1 - adShare) * 100).rounded()))%")
                    Spacer()
                    Text("Ads \(Int((adShare * 100).rounded()))%")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        } header: {
            Text("Brand budget")
        } footer: {
            Text("A standing weekly amount that keeps new people learning about you. Ads reach kids and parents. Creators reach collectors and players.")
        }
    }
}
