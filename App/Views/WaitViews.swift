import SwiftUI
import SimCore

// Things to do while a set waits: spoiler season and studio actions (W2, W3).

/// The set screen's spoiler season: reveal one finished card each week (W2).
struct SpoilerSection: View {
    @Environment(GameStore.self) private var store
    let world: World
    let set: CardSet
    @State private var error: String?

    var body: some View {
        let cards = world.catalog.cards(in: set.id)
        VStack(alignment: .leading, spacing: 10) {
            Label("Spoiler season", systemImage: "eye.fill").font(.title2.bold())
            Text("Reveal one finished card each week. A reveal gives the card's character hype and brings collectors. Hype fades, so pick the time: a rare card makes the most noise.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            ForEach(cards) { card in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.name).font(.subheadline.weight(.semibold))
                        Text(stateText(world.revealState(card.id))).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if world.revealState(card.id) == .ready {
                        Button("Reveal") { error = store.revealCard(card.id) }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func stateText(_ state: RevealState) -> String {
        switch state {
        case .ready: "Ready to reveal"
        case .revealed(let week): "Revealed in week \(week)"
        case .artNotDone(let week): week == Int.max ? "Waits for a lead artist" : "Art done \(Market.calendar(week: week))"
        case .oneAWeek: "Next week: one reveal for each week"
        case .notInSeason: "Out already"
        }
    }
}

/// The Studio screen's actions: things to do while a set waits (W3).
struct StudioActionsSection: View {
    @Environment(GameStore.self) private var store
    let world: World
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Things to do").font(.title3.bold())
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            ForEach(StudioAction.allCases) { action in
                let ready = world.actionReadyWeek(action)
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(action.name).font(.subheadline.weight(.semibold))
                        Text(action.detail).font(.caption).foregroundStyle(.secondary)
                        Text(ready > world.week ? "Again in \(ready - world.week) \(ready - world.week == 1 ? "week" : "weeks")"
                                                : "Every \(action.cooldown) weeks at most")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(Money.text(action.cost)) { error = store.runAction(action) }
                        .buttonStyle(.bordered)
                        .disabled(ready > world.week)
                        .accessibilityLabel("\(action.name), \(Money.text(action.cost))")
                }
                .padding(12)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}
