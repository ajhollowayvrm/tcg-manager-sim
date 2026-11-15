// Artists, the talent board, lead artists, legends, and breakouts (docs/design/costs.md,
// section 4; decisions K1, K2, and K7 to K12).

import Foundation

public typealias ArtistID = Int

/// One artist: the founder, an artist on the talent board, or an alumni artist.
public struct Artist: Codable, Sendable, Equatable, Identifiable {
    public let id: ArtistID
    /// FLAVOR.
    public let name: String
    /// The personality that the artist draws best. Reader: the style fit (D3). The founder has no style.
    public let style: Archetype?
    /// Dollars for each card before legacy, $400 to $2,500 (research.md, section 5). Fame does not set it.
    public let baseFee: Double
    /// Weeks for each card, 2 to 8. The founder takes 0 weeks.
    public let weeks: Int
    /// Hidden, 0 to 100. Reader: the "Artists" demand factor.
    public internal(set) var popularity: Double
    /// Cards that other studios have booked. Each one adds a week to a commission.
    public internal(set) var outsideQueue: Int
    /// Hidden, 0 to 100. It grows as the game grows after the artist's sets, and it
    /// never falls (K9). Readers: the fee, the "Artists" factor, and a return (K10).
    public internal(set) var legacy: Double
    /// A wave of sudden fame (K11). Nil when the artist is not in a wave.
    public internal(set) var breakout: Breakout?

    /// Dollars for each card. Legacy raises it: legacy 100 triples the fee (K10).
    public var fee: Double { (baseFee * (1 + legacy / 50) / 50).rounded() * 50 }
    /// The fame that the "Artists" factor reads: popularity or legacy, whichever is higher.
    public var fame: Double { max(popularity, legacy) }
    public var isFounder: Bool { id == Self.founderID }
    /// An artist with this legacy is a legend of the game.
    public var isLegend: Bool { legacy >= Self.legendLegacy }

    public static let founderID: ArtistID = 0
    public static let legendLegacy = 30.0

    init(id: ArtistID, name: String, style: Archetype?, fee: Double, weeks: Int, popularity: Double,
         outsideQueue: Int, legacy: Double = 0, breakout: Breakout? = nil) {
        self.id = id
        self.name = name
        self.style = style
        baseFee = fee
        self.weeks = weeks
        self.popularity = popularity
        self.outsideQueue = outsideQueue
        self.legacy = legacy
        self.breakout = breakout
    }

    /// The artist's heat in a week, 0 to 100 (K11).
    public func heat(at week: Int) -> Double { breakout?.heat(at: week) ?? 0 }

    /// The founder draws for free and at once, but collectors see the art as amateur (K8).
    static let founder = Artist(id: founderID, name: "The founder", style: nil, fee: 0, weeks: 0,
                                popularity: World.founderPopularity, outsideQueue: 0)

    enum CodingKeys: String, CodingKey {
        case id, name, style, baseFee = "fee", weeks, popularity, outsideQueue, legacy, breakout
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ArtistID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        style = try c.decodeIfPresent(Archetype.self, forKey: .style)
        baseFee = try c.decode(Double.self, forKey: .baseFee)
        weeks = try c.decode(Int.self, forKey: .weeks)
        popularity = try c.decode(Double.self, forKey: .popularity)
        outsideQueue = try c.decode(Int.self, forKey: .outsideQueue)
        legacy = try c.decodeIfPresent(Double.self, forKey: .legacy) ?? 0
        breakout = try c.decodeIfPresent(Breakout.self, forKey: .breakout)
    }
}

/// A wave of sudden fame (K11). The heat rises quietly, the news breaks, then the
/// heat cools. The artist keeps part of the fame as popularity.
public struct Breakout: Codable, Sendable, Equatable {
    /// The first week of the quiet rise.
    public let riseWeek: Int
    /// The week when the news breaks and the heat peaks.
    public let newsWeek: Int
    /// The heat at the news, 60 to 100.
    public let peak: Double
    /// Weeks from the news until the heat is gone, 8 to 20.
    public let weeks: Int
    /// The popularity that the artist keeps after the wave.
    public let keep: Double

    /// Weeks of the quiet rise before the news.
    public static let riseWeeks = 6
    /// The chance each week that one artist on the board breaks out.
    static let weeklyChance = 0.1
    /// The share of the rise heat before the news: only insiders notice.
    static let riseShare = 0.3

    /// The heat in a week, 0 to 100.
    public func heat(at week: Int) -> Double {
        if week < riseWeek { return 0 }
        if week < newsWeek {
            return peak * Self.riseShare * Double(week - riseWeek + 1) / Double(max(1, newsWeek - riseWeek))
        }
        let since = Double(week - newsWeek)
        return since >= Double(weeks) ? 0 : peak * (1 - since / Double(weeks))
    }

    /// True after the news broke.
    public func isPublic(at week: Int) -> Bool { week >= newsWeek }
    /// True when the artist keeps most of the fame: a new star.
    public var lasts: Bool { keep >= 35 }
    /// The last week of the wave.
    public var endWeek: Int { newsWeek + weeks }
}

/// The pool of artists that the studio can commission (K1), the founder (K8), and
/// the alumni: artists who drew for the studio and then left the board (K10).
public struct TalentBoard: Codable, Sendable, Equatable {
    public internal(set) var artists: [Artist]
    var nextID: ArtistID
    /// Stream: new artists and the weekly changes.
    var rng: Xoshiro256
    /// Nil in a save from before the founder became an artist.
    var founderState: Artist?
    /// Nil in a save from before alumni.
    var alumniState: [Artist]?

    public static let size = 12
    /// About one artist leaves each month.
    static let leaveChance = 1.0 / 4

    init(seed: UInt64) {
        rng = Xoshiro256(seed: seed)
        artists = []
        nextID = 1
        for _ in 0..<Self.size { artists.append(makeArtist()) }
        founderState = .founder
        alumniState = []
    }

    public var founder: Artist { founderState ?? .founder }
    /// Artists who drew for the studio and left the board. The studio can still hire them.
    public var alumni: [Artist] { alumniState ?? [] }
    /// Every artist that the studio can commission: the founder, the board, and the alumni.
    public var everyone: [Artist] { [founder] + artists + alumni }

    public func artist(_ id: ArtistID?) -> Artist? { id.flatMap { id in everyone.first { $0.id == id } } }

    /// Changes one artist, wherever the artist is.
    mutating func change(_ id: ArtistID, _ edit: (inout Artist) -> Void) {
        if id == Artist.founderID {
            var f = founder
            edit(&f)
            founderState = f
        } else if let i = artists.firstIndex(where: { $0.id == id }) {
            edit(&artists[i])
        } else if var list = alumniState, let i = list.firstIndex(where: { $0.id == id }) {
            edit(&list[i])
            alumniState = list
        }
    }

    mutating func makeArtist() -> Artist {
        let first = ["Mira", "Kenji", "Lena", "Tomas", "Ayo", "Sora", "Ines", "Felix", "Noor", "Rafa", "Yuki", "Odile",
                     "Pax", "Hana", "Juno", "Kai", "Lior", "Mae", "Nico", "Tal"]
        let last = ["Okafor", "Lindqvist", "Moreau", "Tanaka", "Reyes", "Haddad", "Kowalski", "Brennan", "Sato", "Varga",
                    "Achebe", "Ruiz", "Nakamura", "Fischer", "Osei", "Duarte", "Ishikawa", "Novak", "Quinn", "Abara"]
        var name = ""
        for _ in 0..<20 {
            name = rng.pick(first) + " " + rng.pick(last)
            if !everyone.contains(where: { $0.name == name }) { break }
        }
        // Most artists are little known, and a few are stars. The fee does not follow fame.
        let popularity = min(100, max(0, 15 + 25 * exp(rng.gauss() * 0.6) - 10))
        let artist = Artist(id: nextID, name: name, style: rng.pick(Archetype.allCases),
                            fee: (rng.uniform(400, 2_500) / 50).rounded() * 50, weeks: rng.int(2, 8),
                            popularity: popularity, outsideQueue: Int((popularity / 30).rounded()))
        nextID += 1
        return artist
    }
}

/// A set's lead artist (K7). The lead draws every filler card and each designed
/// card with no own artist. The studio pays the lead with the print run.
public struct LeadArt: Codable, Sendable, Equatable {
    public let artistID: ArtistID
    /// The week of the commission. The work starts then.
    public let startWeek: Int
    /// The artist's weeks, outside queue, and cards in progress at the start.
    public let delay: Int
    /// Dollars for each designed card that the lead draws. Fixed at the commission.
    public let cardFee: Double
    /// The lead's heat while the art was made (K12). Nil in a save from before breakouts.
    public var heat: Double? = nil

    /// The lead draws filler at this share of the card fee (K7).
    public static let fillerShare = 0.1
    /// The lead draws this many filler cards in one week (K7).
    public static let fillerPerWeek = 10

    public var fillerFee: Double { cardFee * Self.fillerShare }
}

extension World {
    /// The talent board. A save from before artists starts with the board from the world seed.
    public var talent: TalentBoard { talentState ?? TalentBoard(seed: Self.streamSeed(seed, stream: 9)) }

    /// Founder art counts as this popularity: amateur, but free and done at once (costs.md, section 4.2).
    public static let founderPopularity = 20.0
    /// Legacy that a set gives its artist for each doubling of the fan base after the release (K9).
    static let legacyPerDoubling = 15.0

    // MARK: - Reads

    /// The artist who draws a card: the card's own artist, else the set's lead artist.
    /// A card in a set with no lead (an old save) counts as founder art.
    public func artistID(of card: Card) -> ArtistID {
        if let own = card.artistID { return own }
        if let lead = card.setID.flatMap({ catalog.set($0)?.leadArt }) { return lead.artistID }
        return Artist.founderID
    }

    /// The designed cards of a set that the lead artist draws: the cards with no own artist.
    public func leadDesigned(_ setID: SetID) -> Int {
        catalog.cards(in: setID).filter { $0.artistID == nil }.count
    }

    /// The filler cards that the set will have.
    public func plannedFiller(_ setID: SetID) -> Int {
        catalog.set(setID)?.fillerCount(designed: catalog.cards(in: setID).count) ?? 0
    }

    /// The week when the lead artist finishes the set's art (K7).
    public func leadReadyWeek(_ setID: SetID) -> Int? {
        guard let lead = catalog.set(setID)?.leadArt else { return nil }
        if lead.artistID == Artist.founderID { return lead.startWeek }
        let filler = plannedFiller(setID)
        let fillerWeeks = (filler + LeadArt.fillerPerWeek - 1) / LeadArt.fillerPerWeek
        return lead.startWeek + lead.delay + fillerWeeks + leadDesigned(setID)
    }

    /// The lead artist's pay, due with the first print run (K7).
    public func leadArtCost(_ setID: SetID) -> Double {
        guard let lead = catalog.set(setID)?.leadArt else { return 0 }
        return lead.cardFee * Double(leadDesigned(setID)) + lead.fillerFee * Double(plannedFiller(setID))
    }

    /// Cards of this studio that an artist is still drawing. A lead counts its
    /// designed cards and one card for each week of filler.
    public func cardsInProgress(_ artist: ArtistID) -> Int {
        let own = catalog.cards.filter { $0.artistID == artist && ($0.artReadyWeek ?? 0) > week }.count
        let lead = catalog.sets.filter { $0.leadArt?.artistID == artist && $0.status != .released }
            .filter { (leadReadyWeek($0.id) ?? 0) > week }
            .reduce(0) { $0 + leadDesigned($1.id) + (plannedFiller($1.id) + LeadArt.fillerPerWeek - 1) / LeadArt.fillerPerWeek }
        return own + lead
    }

    /// The week when a new commission from this artist is done (K2). The founder is done at once.
    public func artReadyWeek(for artist: Artist) -> Int {
        artist.isFounder ? week : week + artist.weeks + artist.outsideQueue + cardsInProgress(artist.id)
    }

    /// The first week when all the cards of a set have their art (K2, K7).
    public func setArtReadyWeek(_ setID: SetID) -> Int {
        (catalog.cards(in: setID).compactMap(\.artReadyWeek) + [leadReadyWeek(setID)].compactMap { $0 }).max() ?? week
    }

    /// True when the player has seen the artist's work in a released set. Then
    /// the talent board shows a popularity phrase.
    public func isKnown(_ artist: ArtistID) -> Bool {
        !setsDrawn(by: artist).isEmpty
    }

    /// The released sets in release order: the first release first.
    public var releasedSets: [CardSet] {
        catalog.sets.filter { $0.status == .released }
            .sorted { ($0.release?.releaseWeek ?? 0, $0.id) < ($1.release?.releaseWeek ?? 0, $1.id) }
    }

    /// The released sets with art by this artist, in release order.
    public func setsDrawn(by artist: ArtistID) -> [CardSet] {
        releasedSets.filter { artShare(artist, in: $0.id) > 0 }
    }

    /// The artist's share of a set's art, 0 to 1. A designed card counts 3 times a filler card (K9).
    public func artShare(_ artist: ArtistID, in setID: SetID) -> Double {
        artShares(in: setID)[artist] ?? 0
    }

    /// Each artist's share of a set's art, in one pass over the set's cards.
    func artShares(in setID: SetID) -> [ArtistID: Double] {
        guard let set = catalog.set(setID) else { return [:] }
        let designed = catalog.cards(in: setID)
        let filler = set.fillerCount(designed: designed.count)
        let total = 3 * Double(designed.count) + Double(filler)
        guard total > 0 else { return [:] }
        let lead = set.leadArt?.artistID ?? Artist.founderID
        var shares: [ArtistID: Double] = [:]
        for card in designed { shares[card.artistID ?? lead, default: 0] += 3 / total }
        if filler > 0 { shares[lead, default: 0] += Double(filler) / total }
        return shares
    }

    /// The studio's fan base: the people that the studio reached in all audiences.
    public var fanBase: Double {
        Audience.allCases.filter { $0 != .resellers }.reduce(0) { $0 + market.state($1).reachedPeople }
    }

    /// The legends in a set who come back after a gap: they have art in the set, and
    /// no art in the studio's last released set before it (K10). Highest legacy first.
    public func returningLegends(_ setID: SetID) -> [Artist] {
        let earlier = releasedSets.filter { $0.id != setID }
        let previous: [CardSet]
        if let mine = catalog.set(setID)?.release?.releaseWeek {
            previous = earlier.filter { ($0.release?.releaseWeek ?? 0) <= mine }
        } else {
            previous = earlier
        }
        guard let last = previous.last else { return [] }
        let before = artShares(in: last.id)
        return artShares(in: setID).keys.compactMap { talent.artist($0) }
            .filter { $0.isLegend && before[$0.id] == nil }
            .sorted { $0.legacy > $1.legacy }
    }

    /// The heat of the art while the artist makes it: the higher of the heat at the
    /// commission and the heat when the art is done (K12).
    func workHeat(_ artist: Artist, ready: Int) -> Double {
        max(artist.heat(at: week), artist.heat(at: ready))
    }

    /// The weeks before the news that the studio's scouts see a rising artist (K11).
    public var scoutLead: Int {
        market.insights.contains(.scoutNetwork) ? 6 : market.insights.contains(.scout) ? 3 : 0
    }

    /// True when the artist is hot and everyone knows it.
    public func isHot(_ artist: Artist) -> Bool {
        artist.breakout.map { $0.isPublic(at: week) && week < $0.endWeek } ?? false
    }

    /// True when a scout sees the artist rise before the news.
    public func isRisingSeen(_ artist: Artist) -> Bool {
        guard let b = artist.breakout, !b.isPublic(at: week) else { return false }
        return week >= b.newsWeek - scoutLead
    }

    /// The heat of a card for the "Hot artist" factor, 0 to 100 (K12): half the heat
    /// while the art was made, and half the artist's heat now.
    public func cardHeat(_ card: Card) -> Double {
        let id = artistID(of: card)
        guard let artist = talent.artist(id) else { return 0 }
        let made = card.artistID != nil ? card.heatAtCommission
            : card.setID.flatMap { catalog.set($0)?.leadArt?.heat }
        return 0.5 * (made ?? 0) + 0.5 * artist.heat(at: week)
    }

    // MARK: - Decisions

    /// Pays an artist for a card and sets the week when its art is done. No artist
    /// means the set's lead artist draws the card.
    mutating func commission(_ cardID: CardID, artist id: ArtistID?) throws(CardError) {
        guard let i = catalog.cards.firstIndex(where: { $0.id == cardID }) else { throw .unknownCard(cardID) }
        guard let id else {
            catalog.cards[i].artistID = nil
            catalog.cards[i].artReadyWeek = nil
            return
        }
        guard let artist = talent.artist(id) else { throw .unknownArtist }
        let ready = artReadyWeek(for: artist)
        catalog.cards[i].artistID = id
        catalog.cards[i].artReadyWeek = ready
        catalog.cards[i].heatAtCommission = workHeat(artist, ready: ready)
        if artist.fee > 0 {
            var b = business
            b.record(week, -artist.fee, "Art: \(catalog.cards[i].name) by \(artist.name)")
            businessState = b
        }
    }

    /// The player picks a set's lead artist (K7). A new lead is a new commission:
    /// the work starts again. The studio pays the lead with the print run.
    public mutating func setLeadArtist(_ setID: SetID, _ id: ArtistID?) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        try requireDraft(setID)
        guard let id else {
            catalog.sets[i].leadArt = nil
            return
        }
        if catalog.sets[i].leadArt?.artistID == id { return }
        guard let artist = talent.artist(id) else { throw .unknownArtist }
        catalog.sets[i].leadArt = nil
        let delay = artist.isFounder ? 0 : artist.weeks + artist.outsideQueue + cardsInProgress(id)
        catalog.sets[i].leadArt = LeadArt(artistID: id, startWeek: week, delay: delay, cardFee: artist.fee,
                                          heat: workHeat(artist, ready: week + delay))
    }

    /// The board changes: an artist can leave and a new one joins, and the queues
    /// follow the popularity (K1). An artist who drew for the studio joins the alumni (K10).
    mutating func advanceTalent() {
        var t = talent
        if t.rng.chance(TalentBoard.leaveChance / 4.33) {
            let free = t.artists.indices.filter { cardsInProgress(t.artists[$0].id) == 0 && t.artists[$0].breakout == nil }
            if let gone = free.isEmpty ? nil : t.rng.pick(free) {
                let artist = t.artists[gone]
                t.artists.remove(at: gone)
                let worked = catalog.cards.contains { $0.artistID == artist.id }
                    || catalog.sets.contains { $0.leadArt?.artistID == artist.id }
                if worked { t.alumniState = t.alumni + [artist] }
                var b = business
                b.report(week, worked ? "\(artist.name) left the talent board. You can still hire them from your alumni."
                                      : "\(artist.name) left the talent board.")
                businessState = b
            }
        }
        while t.artists.count < TalentBoard.size { t.artists.append(t.makeArtist()) }
        // A breakout starts (K11): a quiet rise, then the news.
        if t.rng.chance(Breakout.weeklyChance) {
            let calm = t.artists.indices.filter { t.artists[$0].breakout == nil }
            if let i = calm.isEmpty ? nil : t.rng.pick(calm) {
                let star = t.rng.chance(0.3)
                t.artists[i].breakout = Breakout(riseWeek: week, newsWeek: week + Breakout.riseWeeks,
                                                 peak: t.rng.uniform(60, 100), weeks: t.rng.int(8, 20),
                                                 keep: star ? t.rng.uniform(40, 60) : t.rng.uniform(8, 20))
            }
        }
        var b = business
        for i in t.artists.indices {
            guard let wave = t.artists[i].breakout else { continue }
            let name = t.artists[i].name
            if scoutLead > 0, week == wave.newsWeek - scoutLead {
                b.report(week, "Your scouts see \(name)'s art rising. The news breaks in \(scoutLead) weeks."
                    + (scoutLead >= 6 ? (wave.lasts ? " The fame looks set to last." : " The fame looks set to fade.") : ""))
            }
            if week == wave.newsWeek {
                b.report(week, "\(name)'s art went viral. Studios rush to book them.")
            }
            if week >= wave.endWeek {
                t.artists[i].popularity = min(100, t.artists[i].popularity + wave.keep)
                t.artists[i].breakout = nil
                b.report(week, wave.lasts ? "The wave around \(name) is over. They stay a star."
                                          : "The wave around \(name) is over. Most of the fame faded.")
            }
        }
        businessState = b
        // Other studios book a popular or hot artist, so the queue grows (K11).
        for i in t.artists.indices {
            let a = t.artists[i]
            let publicHeat = (a.breakout?.isPublic(at: week) ?? false) ? a.heat(at: week) : 0
            t.artists[i].outsideQueue = max(0, Int(((a.popularity + publicHeat) / 30).rounded()) + t.rng.int(-1, 1))
        }
        // Alumni stay busy elsewhere too. No random draw, so the board's stream does not move.
        if var alumni = t.alumniState {
            for i in alumni.indices { alumni[i].outsideQueue = Int((alumni[i].popularity / 30).rounded()) }
            t.alumniState = alumni
        }
        talentState = t
        growLegacy()
    }

    /// Legacy follows the growth of the game after each set (K9). Each released set
    /// gives its artists their share × legacyPerDoubling for each doubling of the
    /// fan base since the release. The nth set gives 1/n, so the first set counts most.
    /// Legacy never falls.
    mutating func growLegacy() {
        let sets = releasedSets
        guard !sets.isEmpty else { return }
        let fans = fanBase
        var target: [ArtistID: Double] = [:]
        for (n, set) in sets.enumerated() {
            guard let start = set.release?.fansAtRelease, start > 0, fans > start else { continue }
            let growth = log2(fans / start) * Self.legacyPerDoubling / Double(n + 1)
            for (id, share) in artShares(in: set.id) { target[id, default: 0] += share * growth }
        }
        var t = talent
        var b = business
        for (id, value) in target {
            guard let before = t.artist(id) else { continue }
            let legacy = min(100, value)
            guard legacy > before.legacy else { continue }
            t.change(id) { $0.legacy = legacy }
            if !before.isLegend, legacy >= Artist.legendLegacy {
                let first = setsDrawn(by: id).first?.name ?? "your first set"
                b.report(week, "\(before.name) is now a legend. Fans remember the art of \(first).")
            }
        }
        talentState = t
        businessState = b
    }

    /// The artists of a set gain popularity when it does well, and lose some when it does badly.
    mutating func reviewArtists(of setID: SetID, quality: Double) {
        var t = talent
        let ids = Set(catalog.allCards(in: setID).map { artistID(of: $0) })
        for id in ids {
            t.change(id) { $0.popularity = min(100, max(0, $0.popularity + 3 + max(-5, (quality - 1) * 15))) }
        }
        talentState = t
    }
}
