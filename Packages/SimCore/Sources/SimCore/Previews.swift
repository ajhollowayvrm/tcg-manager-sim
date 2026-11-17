// Things to do while the first set waits for its art: spoiler season and studio
// actions (decisions W1 to W3).

import Foundation

/// Why a card can or cannot be revealed now (W2).
public enum RevealState: Sendable, Equatable {
    case ready
    case revealed(week: Int)
    /// The art is done in this week.
    case artNotDone(week: Int)
    /// The set has a reveal this week already.
    case oneAWeek
    /// A released set, or a filler card: no spoiler.
    case notInSeason
}

/// An action that the studio can buy while it waits (W3).
public enum StudioAction: String, CaseIterable, Codable, Sendable, Identifiable {
    case convention, demoDay, playtest

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .convention: "Convention booth"
        case .demoDay: "Demo day at hobby stores"
        case .playtest: "Playtest"
        }
    }

    public var detail: String {
        switch self {
        case .convention: "Collectors and players meet your studio: about 500 new people."
        case .demoDay: "Hobby stores trust you more before their first orders, and players try your game."
        case .playtest: "Players try your draft cards: the appeal readings of their characters narrow."
        }
    }

    public var cost: Double {
        switch self {
        case .convention: 3_000
        case .demoDay: 1_500
        case .playtest: 1_000
        }
    }

    /// Weeks before the studio can do the action again.
    public var cooldown: Int {
        switch self {
        case .convention: 8
        case .demoDay, .playtest: 4
        }
    }
}

extension World {
    // MARK: - Spoiler season (W2)

    /// The week when a designed card's art is done. Nil when the card waits for a lead that the set does not have.
    public func cardArtDoneWeek(_ card: Card) -> Int? {
        if card.artistID != nil { return card.artReadyWeek ?? week }
        guard let setID = card.setID else { return nil }
        return leadReadyWeek(setID)
    }

    public func revealState(_ cardID: CardID) -> RevealState {
        guard let card = catalog.card(cardID), !card.filler, let setID = card.setID,
              let set = catalog.set(setID), set.status != .released else { return .notInSeason }
        if let revealed = card.revealedWeek { return .revealed(week: revealed) }
        guard let done = cardArtDoneWeek(card) else { return .artNotDone(week: Int.max) }
        if done > week { return .artNotDone(week: done) }
        if catalog.cards(in: setID).contains(where: { $0.revealedWeek == week }) { return .oneAWeek }
        return .ready
    }

    /// The hype and reach of a reveal. A rarer-feeling card makes more noise.
    func revealStrength(_ card: Card) -> (hype: Double, people: Double) {
        let feel = card.setID.flatMap { catalog.set($0)?.ladder.tier(card.rarity) }.map(RarityFeel.score) ?? 0
        return (min(40, 10 + Double(feel)), 30 * (1 + Double(feel) / 8) * marketingReach)
    }

    /// Reveals a finished card of a draft or scheduled set (W2). The card's character
    /// gains hype, and collectors hear of the set. One reveal for each set each week.
    public mutating func revealCard(_ cardID: CardID) throws(CardError) {
        switch revealState(cardID) {
        case .ready: break
        case .revealed: throw .badRelease("That card is revealed already.")
        case .artNotDone: throw .badRelease("The art of that card is not done yet.")
        case .oneAWeek: throw .badRelease("This set had a reveal this week. Reveal the next card next week.")
        case .notInSeason: throw .badRelease("Only a designed card of a set that is not out yet can be revealed.")
        }
        guard let i = catalog.cards.firstIndex(where: { $0.id == cardID }) else { throw .unknownCard(cardID) }
        let card = catalog.cards[i]
        catalog.cards[i].revealedWeek = week
        let strength = revealStrength(card)
        if let c = index(of: card.characterID) {
            characters[c].buzz = min(100, characters[c].buzz + strength.hype)
        }
        var m = market
        for (a, share) in [(Audience.chaseCollectors, 0.4), (.completionists, 0.2), (.teens, 0.2), (.artCollectors, 0.2)] {
            m.addReach(a, people: strength.people * share)
        }
        marketState = m
        var b = business
        b.report(week, "You revealed \(card.name). Collectors talk about it.")
        businessState = b
    }

    // MARK: - Studio actions (W3)

    /// The first week when the studio can do the action again.
    public func actionReadyWeek(_ action: StudioAction) -> Int {
        guard let last = actionState?[action.rawValue] else { return week }
        return max(week, last + action.cooldown)
    }

    public mutating func runAction(_ action: StudioAction) throws(CardError) {
        guard actionReadyWeek(action) <= week else {
            throw .badRelease("\(action.name) is possible again in week \(actionReadyWeek(action)).")
        }
        var state = actionState ?? [:]
        state[action.rawValue] = week
        actionState = state
        var b = business
        b.record(week, -action.cost, action.name)
        businessState = b
        switch action {
        case .convention:
            var m = market
            for (a, share) in [(Audience.chaseCollectors, 0.3), (.artCollectors, 0.25), (.completionists, 0.2),
                               (.competitivePlayers, 0.15), (.teens, 0.1)] {
                m.addReach(a, people: 500 * share * marketingReach)
            }
            marketState = m
        case .demoDay:
            var c = channels
            c.changeTrust(.hobby, by: 0.1)
            channelState = c
            var m = market
            m.addReach(.competitivePlayers, people: 100 * marketingReach)
            m.addReach(.casualPlayers, people: 80 * marketingReach)
            m.addReach(.teens, people: 40 * marketingReach)
            marketState = m
        case .playtest:
            let ids = Set(catalog.sets.filter { $0.status != .released }.flatMap { catalog.cards(in: $0.id) }.map(\.characterID))
            for i in characters.indices where ids.contains(characters[i].id) {
                for a in Audience.allCases where !a.isDerived {
                    characters[i].knowledge[a] = min(Self.focusKnowledgeCap, characters[i].knowledge[a] + 0.1)
                }
            }
        }
    }
}
