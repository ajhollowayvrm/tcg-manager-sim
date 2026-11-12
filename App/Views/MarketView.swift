import SwiftUI
import SimCore

/// The Market tab (U2; audiences.md, section 7). The season and the hobby heat are
/// common knowledge. Each other part needs its own upgrade (A5).
struct MarketView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let world = store.world {
            content(world, world.market)
        } else {
            ContentUnavailableView("No game is running", systemImage: "questionmark")
        }
    }

    private func content(_ world: World, _ market: Market) -> some View {
        List {
            Section {
                LabeledContent("Calendar", value: Market.calendar(week: world.week))
                LabeledContent("Season", value: Market.seasonPhrase(week: world.week))
                HStack {
                    Text("Hobby")
                    Spacer()
                    Text(market.hobbyPhrase).foregroundStyle(.secondary)
                    Image(systemName: market.hobbyDirection > 0 ? "arrow.up.right" : market.hobbyDirection < 0 ? "arrow.down.right" : "arrow.right")
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(market.hobbyDirection > 0 ? "rising" : market.hobbyDirection < 0 ? "falling" : "steady")
                }
            } header: {
                Text("Conditions")
            } footer: {
                Text("Every studio sees the season and the hobby. A hot hobby swells the investors and the resellers. A slump shrinks them.")
            }

            MarketSalesSection(world: world)

            let news = world.business.news.suffix(8).reversed()
            if !news.isEmpty {
                Section("News") {
                    ForEach(Array(news.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.text).font(.subheadline)
                            Text(Market.calendar(week: item.week)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section {
                ForEach(Audience.allCases) { audience in
                    NavigationLink {
                        AudienceDetailView(audience: audience)
                    } label: {
                        AudienceMarketRow(market: market, audience: audience)
                    }
                }
            } header: {
                Text("Audiences")
            } footer: {
                Text(market.insights.isEmpty
                     ? "Your studio knows little about the market yet. Each upgrade shows one more part."
                     : "Ranges get narrower with more research.")
            }

            let locked = MarketInsight.allCases.filter { !market.insights.contains($0) && $0 != .forecast && $0 != .curve }
            if !locked.isEmpty {
                Section("Upgrades that show more") {
                    ForEach(locked) { insight in
                        LockedRow(insight: insight)
                    }
                }
            }
        }
        .navigationTitle("Market")
        .toolbar { ToolbarItem(placement: .primaryAction) { NextWeekButton() } }
    }

}

/// One audience: its size and the studio's reach, as far as the upgrades allow.
private struct AudienceMarketRow: View {
    let market: Market
    let audience: Audience

    var body: some View {
        let s = market.state(audience)
        VStack(alignment: .leading, spacing: 3) {
            Text(audience.name).font(.headline)
            HStack(spacing: 10) {
                if market.insights.contains(.sizes) {
                    Label(MarketFormat.peopleRange(market.reading(s.people, audience, field: 1)), systemImage: "person.3")
                }
                if market.insights.contains(.reach) {
                    Label(MarketFormat.peopleRange(market.reading(s.reachedPeople, audience, field: 2)), systemImage: "megaphone")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            if market.insights.contains(.goodwill) || market.insights.contains(.fatigue) {
                Text([market.insights.contains(.goodwill) ? Market.goodwillPhrase(s.goodwill) : nil,
                      market.insights.contains(.fatigue) ? Market.fatiguePhrase(s.fatigue) : nil]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// One audience in full: what the upgrades show, and what they would show.
struct AudienceDetailView: View {
    @Environment(GameStore.self) private var store
    let audience: Audience

    var body: some View {
        if let world = store.world {
            let market = world.market
            let s = market.state(audience)
            List {
                Section {
                    insightRow(.sizes, market, title: "People") {
                        MarketFormat.peopleRange(market.reading(s.people, audience, field: 1))
                    }
                    insightRow(.sizes, market, title: "Spend per person, per year") {
                        MarketFormat.dollarRange(market.reading(s.spend, audience, field: 3))
                    }
                    insightRow(.reach, market, title: "Know your studio") {
                        MarketFormat.peopleRange(market.reading(s.reachedPeople, audience, field: 2))
                    }
                    insightRow(.goodwill, market, title: "Feeling") { Market.goodwillPhrase(s.goodwill) }
                    insightRow(.fatigue, market, title: "Releases") { Market.fatiguePhrase(s.fatigue) }
                }
                Section {
                    LabeledContent("This month", value: seasonWord(market.season(audience, week: world.week)))
                } header: {
                    Text("Season")
                }
                Section {
                    if market.insights.contains(.rhythms) {
                        Text(AudienceProfile.of(audience).rhythm)
                    } else {
                        LockedRow(insight: .rhythms)
                    }
                } header: {
                    Text("Buying rhythm")
                } footer: {
                    Text("Each audience buys on its own rhythm over a set's life. The set's design decides which rhythms add up to its sales.")
                }
            }
            .navigationTitle(audience.name)
        }
    }

    @ViewBuilder
    private func insightRow(_ insight: MarketInsight, _ market: Market, title: String, value: () -> String) -> some View {
        if market.insights.contains(insight) {
            LabeledContent(title, value: value())
        } else {
            HStack(spacing: 6) {
                Text(title)
                Spacer(minLength: 8)
                Image(systemName: "lock.fill").font(.footnote)
                Text(insight.upgradeName)
            }
            .foregroundStyle(.secondary)
            .accessibilityElement(children: .combine)
        }
    }

    /// The season as a word, so the hidden multiplier stays hidden.
    private func seasonWord(_ multiplier: Double) -> String {
        switch multiplier {
        case ..<0.8: "A quiet time"
        case ..<1.15: "A normal time"
        case ..<2: "A busy time"
        default: "Their biggest time of year"
        }
    }
}

/// An upgrade that the studio does not have yet.
struct LockedRow: View {
    let insight: MarketInsight

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.fill").foregroundStyle(.secondary).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(insight.upgradeName).font(.subheadline.weight(.semibold))
                Text(insight.unlocks).font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Short numbers for the market screen: "2.1M to 2.9M", "$350 to $450".
enum MarketFormat {
    static func people(_ value: Double) -> String {
        switch value {
        case 1_000_000...: "\((value / 1_000_000).formatted(.number.precision(.fractionLength(0...1))))M"
        case 10_000...: "\(Int((value / 1_000).rounded()))K"
        default: Int(value.rounded()).formatted()
        }
    }

    static func peopleRange(_ range: ClosedRange<Double>) -> String {
        range.upperBound < 0.5 ? "None" : "\(people(range.lowerBound)) to \(people(range.upperBound))"
    }

    static func dollarRange(_ range: ClosedRange<Double>) -> String {
        "$\(Int(range.lowerBound.rounded()).formatted()) to $\(Int(range.upperBound.rounded()).formatted())"
    }
}
