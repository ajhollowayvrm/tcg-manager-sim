import SwiftUI
import SimCore

/// What a card shows (cards.md, section 7.4). The game draws no new art (C5):
/// the art window shows the character drawing.
struct CardFace {
    var name: String
    var palette: [PaletteColor]
    var body: BodyParts
    var person: PersonParts?
    var tint: Color
    var tier: RarityTier?
    var look: CardLook
    var frame: FrameStyle
    var featured: [Character]
    /// The name on a signature stamp.
    var signer: String

    /// The face of a saved card, in one of its versions (C16).
    init?(world: World, card: Card, version: VersionKey = .base) {
        guard let ladder = card.setID.flatMap({ world.catalog.set($0)?.ladder }) else { return nil }
        self.init(world: world, draft: CardDraft(from: card), ladder: ladder, version: version)
    }

    /// The live face in the card designer, in one of its versions (C16).
    init(world: World, draft: CardDraft, ladder: RarityLadder, version: VersionKey = .base) {
        name = draft.trimmedName.isEmpty ? "Unnamed card" : draft.trimmedName
        tier = draft.rarity.flatMap(ladder.tier)
        let shown = tier?.versions(excluding: [], own: draft.ownVersions).first { $0.key == version }?.version ?? tier?.baseVersion
        look = shown?.look ?? .plain
        frame = shown?.frameStyle ?? .solid
        featured = draft.featured.compactMap(world.character)
        let character = draft.characterID.flatMap(world.character)
        signer = character?.name ?? "Studio"
        if let character, let form = draft.formID.flatMap(character.form) {
            palette = form.palette
            body = form.body
            person = form.person
            tint = form.primaryType.tint
        } else if let character {
            palette = character.palette
            body = character.body
            person = character.person
            tint = character.primaryType.tint
        } else {
            palette = [.slate, .snow]
            body = BodyParts()
            person = nil
            tint = .secondary
        }
    }

    /// A face for the preview of a tier, with no world.
    init(name: String, tier: RarityTier) {
        self.init(name: name, tier: tier, version: tier.baseVersion)
    }

    /// A face for the preview of one version, with no world.
    init(name: String, tier: RarityTier?, version: CardVersion) {
        self.name = name
        self.tier = tier
        look = version.look
        frame = version.frameStyle
        palette = [.sunflower, .ember, .cream]
        body = BodyParts(shape: .round, head: .longEars, eyes: .sparkle, tail: .flame, pattern: .belly)
        person = nil
        tint = ElementType.storm.tint
        featured = []
        signer = "Pipkit"
    }
}

/// A card in a 5:7 frame (C14). The rarity tier sets the frame style, the layout,
/// the foil, the texture, and the stamp (C15).
struct CardView: View {
    let face: CardFace
    /// A large card moves its foil. Small tiles in a grid keep it still.
    var animated = false

    private var look: CardLook { face.look }
    private var frameStyle: FrameStyle { face.frame }
    private var tierColor: Color { (face.tier?.color ?? .slate).color }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let shape = RoundedRectangle(cornerRadius: w * 0.06, style: .continuous)
            ZStack {
                frameBackground(w)
                layout(w)
                wholeCardFoil
                if look.textured {
                    TexturePattern().opacity(0.2).allowsHitTesting(false)
                }
            }
            .clipShape(shape)
            .overlay(shape.strokeBorder(borderStyle, lineWidth: borderWidth(w)))
            .shadow(color: .black.opacity(0.18), radius: w * 0.03, y: w * 0.015)
        }
        .aspectRatio(5.0 / 7.0, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Card \(face.name), \(face.tier?.name ?? "no rarity")")
    }

    // MARK: Layouts

    @ViewBuilder
    private func layout(_ w: CGFloat) -> some View {
        switch look.layout {
        case .standard, .showcase, .frameBreak:
            VStack(spacing: w * 0.035) {
                nameBar(w)
                artWindow(w, cornerRadius: w * 0.035)
                    .overlay(alignment: .bottomLeading) { featuredRow(w).padding(w * 0.03) }
                    .zIndex(1)
                bottomRow(w)
            }
            .padding(w * 0.055)
            .overlay {
                if look.layout == .showcase { ShowcaseOrnaments(color: ornamentColor).allowsHitTesting(false) }
            }
        case .extendedArt:
            VStack(spacing: w * 0.035) {
                nameBar(w).padding(.horizontal, w * 0.055)
                artWindow(w, cornerRadius: w * 0.01)
                    .overlay(alignment: .bottomLeading) { featuredRow(w).padding(w * 0.03) }
                    .padding(.horizontal, w * 0.012)
                bottomRow(w).padding(.horizontal, w * 0.055)
            }
            .padding(.vertical, w * 0.055)
        case .fullArt, .borderless:
            ZStack {
                artWindow(w, cornerRadius: look.layout == .borderless ? 0 : w * 0.045)
                    .padding(look.layout == .borderless ? 0 : w * 0.025)
                VStack {
                    nameBar(w)
                    Spacer()
                    HStack(alignment: .bottom) {
                        featuredRow(w)
                        Spacer()
                    }
                    bottomRow(w)
                }
                .padding(w * 0.055)
            }
        }
    }

    // MARK: The frame

    @ViewBuilder
    private func frameBackground(_ w: CGFloat) -> some View {
        ZStack {
            FrameFill(style: frameStyle, color: tierColor)
            switch look.foil {
            case .reverseHolo:
                FoilShimmer(animated: animated)
            case .patternReverse:
                SymbolPattern(symbol: face.tier?.symbol ?? .circle).opacity(0.35)
                FoilShimmer(animated: animated)
            case .etched:
                EtchedLines().opacity(0.45)
                FoilShimmer(animated: animated, colors: [.white.opacity(0.6), .gray.opacity(0.3), .white.opacity(0.6)])
            default:
                EmptyView()
            }
        }
    }

    private var ornamentColor: Color {
        switch frameStyle {
        case .solid: .white.opacity(0.8)
        case .gold: Color(red: 1, green: 0.95, blue: 0.75)
        case .black: PaletteColor.gold.color
        case .silver, .rainbow: .white
        }
    }

    private var borderStyle: AnyShapeStyle {
        switch frameStyle {
        case .solid: AnyShapeStyle(Color.black.opacity(0.25))
        case .rainbow: AnyShapeStyle(AngularGradient(colors: FrameFill.hues + [FrameFill.hues[0]], center: .center))
        case .gold: AnyShapeStyle(LinearGradient(colors: FrameFill.goldColors, startPoint: .top, endPoint: .bottom))
        case .silver: AnyShapeStyle(LinearGradient(colors: FrameFill.silverColors, startPoint: .top, endPoint: .bottom))
        case .black: AnyShapeStyle(Color.white.opacity(0.35))
        }
    }

    private func borderWidth(_ w: CGFloat) -> CGFloat {
        frameStyle == .solid || frameStyle == .black ? w * 0.012 : w * 0.022
    }

    // MARK: Parts

    private func nameBar(_ w: CGFloat) -> some View {
        Text(face.name)
            .font(.system(size: w * 0.07, weight: .bold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .foregroundStyle(.black.opacity(0.85))
            .padding(.horizontal, w * 0.04)
            .padding(.vertical, w * 0.02)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.88), in: RoundedRectangle(cornerRadius: w * 0.03))
    }

    private func artWindow(_ w: CGFloat, cornerRadius: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        let breaksFrame = look.layout == .frameBreak
        return ZStack {
            artBackground
            if !breaksFrame { drawing(w) }
            switch look.foil {
            case .holo: FoilShimmer(animated: animated)
            case .cosmos: FoilShimmer(animated: animated); CosmosDots()
            case .crackedIce: FoilShimmer(animated: animated); IceShards().opacity(0.5)
            default: EmptyView()
            }
            if look.stamp == .eventStamp {
                EventStamp(size: w * 0.16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(w * 0.025)
            }
            if look.stamp == .signature {
                Text(face.signer)
                    .font(.custom("SnellRoundhand-Bold", size: w * 0.1))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 1)
                    .rotationEffect(.degrees(-10))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(w * 0.04)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.black.opacity(look.layout == .borderless ? 0 : 0.25), lineWidth: max(1, w * 0.006)))
        // A frame break draws the character after the clip, so it comes out over the frame.
        .overlay {
            if breaksFrame {
                drawing(w)
                    .scaleEffect(1.6, anchor: .bottom)
                    .offset(y: -w * 0.03)
                    .shadow(color: .black.opacity(0.35), radius: w * 0.015, y: w * 0.01)
                    .allowsHitTesting(false)
            }
        }
    }

    private func drawing(_ w: CGFloat) -> some View {
        let fills = look.layout == .fullArt || look.layout == .borderless
        return CharacterDrawing(palette: face.palette, parts: face.body, person: face.person)
            .padding(fills ? w * 0.12 : w * 0.06)
    }

    @ViewBuilder
    private var artBackground: some View {
        if look.layout == .borderless {
            LinearGradient(colors: face.palette.map(\.color).reversed() + [face.tint.opacity(0.6)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        } else {
            LinearGradient(colors: [face.tint.opacity(0.18), face.tint.opacity(0.42)], startPoint: .top, endPoint: .bottom)
                .background(.white)
        }
    }

    @ViewBuilder
    private var wholeCardFoil: some View {
        switch look.foil {
        case .galaxy:
            GalaxyStars().allowsHitTesting(false)
            FoilShimmer(animated: animated, colors: [.purple.opacity(0.35), .blue.opacity(0.35), .pink.opacity(0.35)])
        case .rainbow:
            LinearGradient(colors: FrameFill.hues.map { $0.opacity(0.35) }, startPoint: .topLeading, endPoint: .bottomTrailing)
                .blendMode(.overlay)
                .allowsHitTesting(false)
            FoilShimmer(animated: animated)
        case .gold:
            LinearGradient(colors: FrameFill.goldColors.map { $0.opacity(0.4) }, startPoint: .top, endPoint: .bottom)
                .blendMode(.overlay)
                .allowsHitTesting(false)
            GalaxyStars(color: Color(red: 1, green: 0.9, blue: 0.5)).allowsHitTesting(false)
            FoilShimmer(animated: animated, colors: [.white.opacity(0.5), .yellow.opacity(0.5), .white.opacity(0.5)])
        default:
            EmptyView()
        }
    }

    private func featuredRow(_ w: CGFloat) -> some View {
        HStack(spacing: w * 0.02) {
            ForEach(face.featured) { other in
                CharacterDrawing(character: other)
                    .padding(w * 0.012)
                    .frame(width: w * 0.2, height: w * 0.2)
                    .background(.white.opacity(0.85), in: Circle())
                    .overlay(Circle().strokeBorder(.black.opacity(0.2), lineWidth: 1))
            }
        }
    }

    private func bottomRow(_ w: CGFloat) -> some View {
        HStack(spacing: w * 0.02) {
            if look.stamp == .serialized {
                Text("001/250")
                    .font(.system(size: w * 0.045, weight: .heavy, design: .monospaced))
                    .padding(.horizontal, w * 0.025)
                    .padding(.vertical, w * 0.008)
                    .background(.black.opacity(0.75), in: Capsule())
                    .foregroundStyle(PaletteColor.gold.color)
            }
            Spacer(minLength: 0)
            if let tier = face.tier {
                RaritySymbolView(symbol: tier.symbol, size: w * 0.05)
                Text(tier.code)
                    .font(.system(size: w * 0.055, weight: .heavy, design: .rounded))
            }
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.5), radius: 1)
        .padding(.horizontal, w * 0.02)
    }
}

// MARK: - Frame fills

/// The fill of a card frame for each frame style (C14).
struct FrameFill: View {
    let style: FrameStyle
    let color: Color

    static let hues: [Color] = [
        Color(red: 0.95, green: 0.3, blue: 0.35), Color(red: 0.98, green: 0.6, blue: 0.2),
        Color(red: 0.98, green: 0.88, blue: 0.3), Color(red: 0.4, green: 0.85, blue: 0.45),
        Color(red: 0.3, green: 0.75, blue: 0.95), Color(red: 0.45, green: 0.45, blue: 0.95),
        Color(red: 0.8, green: 0.45, blue: 0.9),
    ]
    static let goldColors: [Color] = [
        Color(red: 0.99, green: 0.88, blue: 0.5), Color(red: 0.85, green: 0.65, blue: 0.13),
        Color(red: 0.98, green: 0.84, blue: 0.45), Color(red: 0.6, green: 0.43, blue: 0.08),
    ]
    static let silverColors: [Color] = [
        Color(white: 0.95), Color(white: 0.7), Color(white: 0.9), Color(white: 0.6),
    ]

    var body: some View {
        switch style {
        case .solid:
            LinearGradient(colors: [color.opacity(0.75), color], startPoint: .top, endPoint: .bottom)
        case .rainbow:
            LinearGradient(colors: Self.hues, startPoint: .topLeading, endPoint: .bottomTrailing)
                .overlay(Color.white.opacity(0.12))
        case .gold:
            LinearGradient(colors: Self.goldColors, startPoint: .topLeading, endPoint: .bottomTrailing)
        case .silver:
            LinearGradient(colors: Self.silverColors, startPoint: .topLeading, endPoint: .bottomTrailing)
        case .black:
            LinearGradient(colors: [Color(white: 0.22), Color(white: 0.06)], startPoint: .top, endPoint: .bottom)
        }
    }
}

// MARK: - Names

/// The rarity symbol: one, two, or three shapes.
struct RaritySymbolView: View {
    let symbol: RaritySymbol
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: size * 0.1) {
            ForEach(0..<symbol.count, id: \.self) { _ in
                Image(systemName: symbol.systemImage)
                    .font(.system(size: size, weight: .bold))
            }
        }
    }
}

extension RaritySymbol {
    var systemImage: String {
        switch self {
        case .circle: "circle.fill"
        case .diamond: "diamond.fill"
        case .star, .doubleStar, .tripleStar: "star.fill"
        case .sparkle: "sparkle"
        case .crown: "crown.fill"
        case .heart: "heart.fill"
        case .hexagon: "hexagon.fill"
        case .flame: "flame.fill"
        }
    }

    var count: Int {
        switch self {
        case .doubleStar: 2
        case .tripleStar: 3
        default: 1
        }
    }

    var name: String {
        switch self {
        case .doubleStar: "Two stars"
        case .tripleStar: "Three stars"
        default: rawValue.capitalized
        }
    }
}

extension FrameStyle {
    var name: String { rawValue.capitalized }
}

extension CardLayout {
    var name: String {
        switch self {
        case .standard: "Standard"
        case .extendedArt: "Extended art"
        case .fullArt: "Full art"
        case .borderless: "Borderless"
        case .frameBreak: "Frame break"
        case .showcase: "Showcase frame"
        }
    }

    var hint: String {
        switch self {
        case .standard: "The art is in a box inside the frame."
        case .extendedArt: "The art reaches the left and right edges."
        case .fullArt: "The art fills the card inside a thin frame."
        case .borderless: "No frame. The art reaches every edge."
        case .frameBreak: "The character comes out of the art box."
        case .showcase: "A decorated frame with corner ornaments."
        }
    }
}

extension FoilPattern {
    var name: String {
        switch self {
        case .none: "None"
        case .holo: "Holo"
        case .reverseHolo: "Reverse holo"
        case .patternReverse: "Pattern reverse"
        case .cosmos: "Cosmos"
        case .crackedIce: "Cracked ice"
        case .galaxy: "Galaxy"
        case .etched: "Etched"
        case .rainbow: "Rainbow"
        case .gold: "Gold"
        }
    }
}

extension CardStamp {
    var name: String {
        switch self {
        case .none: "None"
        case .serialized: "Serial number"
        case .signature: "Signature"
        case .eventStamp: "Event stamp"
        }
    }
}

extension CardLook {
    /// For example "Full art · Gold · Textured".
    var summary: String {
        var parts: [String] = []
        if layout != .standard { parts.append(layout.name) }
        if foil != .none { parts.append(foil.name) }
        if textured { parts.append("Textured") }
        if stamp != .none { parts.append(stamp.name) }
        return parts.isEmpty ? "Plain" : parts.joined(separator: " · ")
    }
}

// MARK: - Effects

/// A rainbow band that moves across the foil.
private struct FoilShimmer: View {
    let animated: Bool
    var colors: [Color] = [.pink.opacity(0.5), .yellow.opacity(0.5), .mint.opacity(0.5), .cyan.opacity(0.5), .purple.opacity(0.5)]

    var body: some View {
        if animated {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                band(phase: context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4) / 4)
            }
        } else {
            band(phase: 0.3)
        }
    }

    private func band(phase: Double) -> some View {
        let p = CGFloat(phase) * 2 - 0.5
        return LinearGradient(
            colors: [.clear] + colors + [.clear],
            startPoint: UnitPoint(x: p - 0.6, y: p - 0.6),
            endPoint: UnitPoint(x: p + 0.6, y: p + 0.6)
        )
        .blendMode(.overlay)
        .allowsHitTesting(false)
    }
}

/// Dots and circles for the cosmos foil.
private struct CosmosDots: View {
    var body: some View {
        Canvas { context, size in
            var rng = SplitMix64(seed: 7)
            for i in 0..<40 {
                let x = CGFloat(rng.unit()) * size.width
                let y = CGFloat(rng.unit()) * size.height
                let r = CGFloat(rng.uniform(0.6, 2.2)) * size.width / 160
                let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
                if i % 4 == 0 {
                    context.stroke(Path(ellipseIn: rect.insetBy(dx: -r, dy: -r)), with: .color(.white.opacity(0.7)), lineWidth: 0.8)
                } else {
                    context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(0.8)))
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// Sharp shards for the cracked ice foil.
private struct IceShards: View {
    var body: some View {
        Canvas { context, size in
            var rng = SplitMix64(seed: 13)
            for _ in 0..<26 {
                var path = Path()
                let start = CGPoint(x: CGFloat(rng.unit()) * size.width, y: CGFloat(rng.unit()) * size.height)
                path.move(to: start)
                for _ in 0..<3 {
                    path.addLine(to: CGPoint(
                        x: start.x + CGFloat(rng.uniform(-0.3, 0.3)) * size.width,
                        y: start.y + CGFloat(rng.uniform(-0.3, 0.3)) * size.height
                    ))
                }
                path.closeSubpath()
                context.stroke(path, with: .color(.white), lineWidth: 0.8)
                context.fill(path, with: .color(.white.opacity(0.08)))
            }
        }
        .allowsHitTesting(false)
    }
}

/// Small stars over the whole card, for galaxy and gold foils.
private struct GalaxyStars: View {
    var color: Color = .white

    var body: some View {
        Canvas { context, size in
            var rng = SplitMix64(seed: 21)
            for _ in 0..<90 {
                let x = CGFloat(rng.unit()) * size.width
                let y = CGFloat(rng.unit()) * size.height
                let r = CGFloat(rng.uniform(0.3, 1.4)) * size.width / 160
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                             with: .color(color.opacity(rng.uniform(0.4, 0.95))))
            }
        }
    }
}

/// A repeating symbol on the frame, for the pattern reverse foil.
private struct SymbolPattern: View {
    let symbol: RaritySymbol

    var body: some View {
        GeometryReader { geo in
            let step = max(10, geo.size.width / 7)
            let columns = Int(geo.size.width / step) + 2
            let rows = Int(geo.size.height / step) + 2
            ZStack(alignment: .topLeading) {
                ForEach(0..<rows, id: \.self) { row in
                    ForEach(0..<columns, id: \.self) { column in
                        Image(systemName: symbol.systemImage)
                            .font(.system(size: step * 0.45))
                            .foregroundStyle(.white)
                            .position(x: CGFloat(column) * step + (row.isMultiple(of: 2) ? 0 : step / 2), y: CGFloat(row) * step)
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// Fine metallic lines on the frame, for the etched foil.
private struct EtchedLines: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            let step: CGFloat = max(2, size.width / 70)
            var y: CGFloat = 0
            while y < size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += step
            }
            context.stroke(path, with: .color(.white), lineWidth: 0.5)
        }
        .allowsHitTesting(false)
    }
}

/// Diagonal lines for the textured surface.
private struct TexturePattern: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            let step: CGFloat = max(3, size.width / 40)
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += step
            }
            context.stroke(path, with: .color(.white), lineWidth: 0.8)
        }
    }
}

/// Corner ornaments and an inner line for the showcase frame.
private struct ShowcaseOrnaments: View {
    let color: Color

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let inset = w * 0.025
            ZStack {
                RoundedRectangle(cornerRadius: w * 0.045)
                    .strokeBorder(color, lineWidth: max(1, w * 0.008))
                    .padding(inset)
                ForEach(0..<4, id: \.self) { corner in
                    Image(systemName: "suit.diamond.fill")
                        .font(.system(size: w * 0.07))
                        .foregroundStyle(color)
                        .position(
                            x: corner % 2 == 0 ? inset * 1.6 : geo.size.width - inset * 1.6,
                            y: corner < 2 ? inset * 1.6 : geo.size.height - inset * 1.6
                        )
                }
            }
        }
    }
}

/// A round stamp, for example for an event.
private struct EventStamp: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(PaletteColor.gold.color.opacity(0.85))
            Circle().strokeBorder(.white, lineWidth: size * 0.06).padding(size * 0.06)
            Image(systemName: "star.fill").font(.system(size: size * 0.42)).foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.3), radius: 1)
    }
}

#Preview("Sample set") {
    let world = World.sample()
    ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150))], spacing: 16) {
            ForEach(world.catalog.cards) { card in
                if let face = CardFace(world: world, card: card) {
                    CardView(face: face, animated: true)
                }
            }
        }
        .padding()
    }
}

#Preview("Every default tier") {
    ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], spacing: 16) {
            ForEach(RarityLadder.defaultLadder(id: 1).tiers) { tier in
                CardView(face: CardFace(name: tier.name, tier: tier))
            }
        }
        .padding()
    }
}
