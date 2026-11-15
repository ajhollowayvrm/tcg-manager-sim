import SwiftUI
import SimCore

// Artists and the talent board (docs/design/costs.md, section 4).

extension Artist {
    /// A phrase for the hidden popularity. Shown only when the player knows it.
    var popularityPhrase: String {
        switch popularity {
        case ..<25: "Unknown to fans"
        case ..<50: "Some fans follow them"
        case ..<75: "Popular"
        default: "A star"
        }
    }
}

/// One artist: style, fee, speed, the week when new art is done, fame when known, and legend status.
struct ArtistRow: View {
    @AppStorage(HiddenNumbers.key) private var showHidden = true
    let world: World
    let artist: Artist

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(artist.name).font(.headline)
                if artist.isLegend {
                    Label("Legend", systemImage: "star.circle.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.accent)
                }
                if world.isHot(artist) {
                    Label("Hot", systemImage: "flame.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.orange)
                } else if world.isRisingSeen(artist) {
                    Label("Rising", systemImage: "binoculars.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.teal)
                }
                Spacer()
                Text(artist.isFounder ? "Free" : Money.text(artist.fee)).font(.subheadline.monospacedDigit().weight(.semibold))
            }
            if artist.isFounder {
                Text("Your own art. Free and done at once. Collectors see it as amateur.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Draws \(artist.style?.rawValue ?? "any") characters · \(artist.weeks) weeks a card · done \(Market.calendar(week: world.artReadyWeek(for: artist)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let wave = artist.breakout, world.isHot(artist) {
                Text("Hot until about \(Market.calendar(week: wave.endWeek)). A card by this artist lifts the whole set.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let wave = artist.breakout, world.isRisingSeen(artist) {
                Text("Your scouts see the art rising. The news breaks \(Market.calendar(week: wave.newsWeek)). Book them before the queue fills."
                     + (world.scoutLead >= 6 ? (wave.lasts ? " The fame looks set to last." : " The fame looks set to fade.") : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if artist.isLegend {
                Text("Fans remember the art of \(world.setsDrawn(by: artist.id).first?.name ?? "your first set"). A return is big news.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if showHidden {
                Text("Popularity \(Int(artist.popularity.rounded())) of 100 · legacy \(Int(artist.legacy.rounded())) of 100"
                     + (artist.heat(at: world.week) > 0 ? " · heat \(Int(artist.heat(at: world.week).rounded())) of 100" : "")
                     + (artist.isFounder ? "" : " · \(artist.outsideQueue) \(artist.outsideQueue == 1 ? "card" : "cards") booked elsewhere"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if world.isKnown(artist.id) {
                Text(artist.popularityPhrase).font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Studio → Product → Talent board (K1, K8, K10).
struct TalentBoardView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        List {
            if let world = store.world {
                Section {
                    ArtistRow(world: world, artist: world.talent.founder)
                } header: {
                    Text("Founder")
                }
                Section {
                    ForEach(world.talent.artists) { ArtistRow(world: world, artist: $0) }
                } header: {
                    Text("Talent board")
                } footer: {
                    Text("Each set needs a lead artist, picked on the set screen. The lead draws the filler and each card with no own artist. Fame does not set the fee, so a cheap artist can be a hidden star. You learn an artist's fame when their cards release. Now and then an artist breaks out: a Talent scout in Studio → Upgrades sees it before the news.")
                }
                Section {
                    if world.talent.alumni.isEmpty {
                        Text("No alumni yet.").foregroundStyle(.secondary)
                    }
                    ForEach(world.talent.alumni) { ArtistRow(world: world, artist: $0) }
                } header: {
                    Text("Alumni")
                } footer: {
                    Text("Artists who drew for you and then left the board. You can still hire them. As the game grows, the artists of your early sets become legends, and their fee rises.")
                }
            }
        }
        .navigationTitle("Talent board")
    }
}

/// A list of every artist that the studio can hire: the founder, the board, and the alumni.
struct ArtistChoices: View {
    let world: World
    let selected: ArtistID?
    let pick: (ArtistID) -> Void

    var body: some View {
        let talent = world.talent
        ArtistChoice(selected: selected == talent.founder.id, label: "The founder") { pick(talent.founder.id) } content: {
            ArtistRow(world: world, artist: talent.founder)
        }
        ForEach(talent.artists + talent.alumni) { artist in
            ArtistChoice(selected: selected == artist.id, label: "Artist \(artist.name)") { pick(artist.id) } content: {
                VStack(alignment: .leading, spacing: 2) {
                    if talent.alumni.contains(where: { $0.id == artist.id }) {
                        Text("Alumni").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                    }
                    ArtistRow(world: world, artist: artist)
                }
            }
        }
    }
}

/// The card designer's artist choice: the set's lead artist, or an own artist (K1, K2, K7).
struct ArtistPicker: View {
    let world: World
    let setID: SetID
    @Binding var artistID: ArtistID?
    /// The artist that a saved card already has. A change is a new commission.
    let savedArtistID: ArtistID?
    /// How many cards this design adds or changes. Each one is a commission.
    let cards: Int

    var body: some View {
        let lead = world.catalog.set(setID)?.leadArt.flatMap { world.talent.artist($0.artistID) }
        VStack(alignment: .leading, spacing: 8) {
            Text("Artist").font(.headline)
            ArtistChoice(selected: artistID == nil, label: "The set's lead artist") {
                artistID = nil
            } content: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lead.map { "The set's lead artist: \($0.name)" } ?? "The set's lead artist").font(.subheadline.weight(.semibold))
                    Text(lead == nil ? "Pick the lead artist on the set screen. The lead is paid with the print run."
                                     : "Paid with the print run. Each card adds 1 week to the lead's work.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            ArtistChoices(world: world, selected: artistID) { artistID = $0 }
            if let id = artistID, id != savedArtistID, let artist = world.talent.artist(id), !artist.isFounder {
                Text(cards > 1
                     ? "This design commissions \(cards) cards: \(Money.text(artist.fee * Double(cards))). The art is done \(Market.calendar(week: world.artReadyWeek(for: artist))) or later."
                     : "The commission costs \(Money.text(artist.fee)), paid when you save. The art is done \(Market.calendar(week: world.artReadyWeek(for: artist))).")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// The set screen's lead artist (K7). Every print run needs one.
struct LeadArtistSection: View {
    let world: World
    let set: CardSet
    let onPick: () -> Void

    var body: some View {
        let lead = set.leadArt.flatMap { world.talent.artist($0.artistID) }
        VStack(alignment: .leading, spacing: 10) {
            Label("Lead artist", systemImage: "paintbrush.pointed.fill").font(.title2.bold())
            if let lead, let leadArt = set.leadArt {
                ArtistRow(world: world, artist: lead)
                    .padding(10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                let filler = world.plannedFiller(set.id)
                let designed = world.leadDesigned(set.id)
                Text(lead.isFounder
                     ? "You draw \(filler) filler cards and \(designed) designed cards yourself, for free."
                     : "Draws \(filler) filler cards at \(Money.text(leadArt.fillerFee)) each and \(designed) designed cards at \(Money.text(leadArt.cardFee)) each: \(Money.text(world.leadArtCost(set.id))), paid with the print run.")
                    .font(.subheadline)
                if set.status == .draft, let ready = world.leadReadyWeek(set.id) {
                    Text("The lead's art is done \(Market.calendar(week: ready)).")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Every print run needs an artist. Pick one artist to draw the whole set, or pick a lead and give some cards their own artist.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if set.status == .draft {
                Button(action: onPick) {
                    Label(lead == nil ? "Pick the lead artist" : "Change the lead artist", systemImage: "person.crop.rectangle.stack")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
    }
}

/// The sheet that picks a set's lead artist. A new lead starts the work again.
struct LeadArtistPicker: View {
    @Environment(GameStore.self) private var store
    let setID: SetID
    let onDone: () -> Void
    @State private var error: String?

    var body: some View {
        ScrollView {
            if let world = store.world {
                VStack(alignment: .leading, spacing: 8) {
                    Text("The lead draws the filler at 10% of their card fee, 10 cards a week, and each designed card with no own artist at the full fee. The studio pays the lead with the print run. A new lead starts the work again.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                    ArtistChoices(world: world, selected: world.catalog.set(setID)?.leadArt?.artistID) { id in
                        error = store.setLeadArtist(setID, id)
                        if error == nil { onDone() }
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle("Lead artist")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) }
        }
    }
}

/// One selectable artist card.
struct ArtistChoice<Content: View>: View {
    let selected: Bool
    let label: String
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top) {
                content()
                Spacer(minLength: 8)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Theme.accent : .secondary)
            }
            .padding(10)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
