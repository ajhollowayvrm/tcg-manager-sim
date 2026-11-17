// The passing of time: the next event and "skip to the next event" (decisions T1 to T3).

import Foundation

/// Something that happens in a later week, for the time bar.
public struct UpcomingEvent: Sendable, Equatable {
    public let week: Int
    /// FLAVOR. For example "Base Set art done".
    public let text: String
}

extension World {
    /// The events that the studio waits for: art done, releases, reprints, and crowdfund ends.
    public var upcomingEvents: [UpcomingEvent] {
        var events: [UpcomingEvent] = []
        for set in catalog.sets {
            switch set.status {
            case .draft:
                guard !catalog.cards(in: set.id).isEmpty else { continue }
                let art = setArtReadyWeek(set.id)
                if art > week { events.append(UpcomingEvent(week: art, text: "\(set.name) art done")) }
            case .scheduled:
                if let release = set.release, release.releaseWeek > week {
                    events.append(UpcomingEvent(week: release.releaseWeek, text: "\(set.name) releases"))
                }
            case .released:
                break
            }
            for reprint in set.release?.pendingReprints ?? [] where reprint.arrivalWeek > week {
                events.append(UpcomingEvent(week: reprint.arrivalWeek, text: "\(set.name) reprint arrives"))
            }
        }
        if let campaign = finance.campaign, let set = catalog.set(campaign.setID) {
            let end = campaign.startWeek + Crowdfund.weeks
            if end > week { events.append(UpcomingEvent(week: end, text: "\(set.name) crowdfund ends")) }
        }
        return events.sorted { ($0.week, $0.text) < ($1.week, $1.text) }
    }

    /// The first event that the studio waits for. Nil when it waits for nothing.
    public var nextEvent: UpcomingEvent? { upcomingEvents.first }

    /// Passes weeks until something happens: a news item, or the week of the next event.
    /// It stops after `maxWeeks` at most, and at once for a closed studio. Returns the weeks passed (T3).
    @discardableResult
    public mutating func advanceToNextEvent(maxWeeks: Int = 26) -> Int {
        let target = nextEvent?.week
        let newsBefore = business.news.count
        var passed = 0
        while passed < maxWeeks, !isClosed {
            advanceWeek()
            passed += 1
            if business.news.count > newsBefore { break }
            if let target, week >= target { break }
        }
        return passed
    }
}
