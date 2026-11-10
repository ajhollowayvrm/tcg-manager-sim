import SwiftUI
import SimCore

/// Draws a character from its parts and palette (decision R3).
/// A creature: the first palette color is the body. The second is the accent
/// (ears, tail, wings, pattern). The third is the detail (horns, cheeks).
/// A person (R14): the first color is the outfit. The second is the hair.
/// The third is the detail (trim and accessory).
struct CharacterDrawing: View {
    let palette: [PaletteColor]
    let parts: BodyParts
    /// Nil draws a creature.
    var person: PersonParts?

    init(palette: [PaletteColor], parts: BodyParts, person: PersonParts? = nil) {
        self.palette = palette
        self.parts = parts
        self.person = person
    }

    init(character: Character) {
        self.init(palette: character.palette, parts: character.body, person: character.person)
    }

    init(form: CharacterForm) {
        self.init(palette: form.palette, parts: form.body, person: form.person)
    }

    init(draft: CharacterDraft) {
        self.init(palette: draft.palette, parts: draft.body, person: draft.kind == .person ? draft.person : nil)
    }

    var body: some View {
        Canvas { context, size in
            let side = min(size.width, size.height)
            let scale = side / 100
            context.translateBy(x: (size.width - side) / 2, y: (size.height - side) / 2)
            context.scaleBy(x: scale, y: scale)
            // Leave room at the edges for tails and ears.
            context.translateBy(x: 6, y: 8)
            context.scaleBy(x: 0.88, y: 0.88)
            if let person {
                PersonRenderer(palette: palette, parts: person).draw(in: &context)
            } else {
                CreatureRenderer(palette: palette, parts: parts).draw(in: &context)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

private struct CreatureRenderer {
    let main: Color
    let accent: Color
    let detail: Color
    let parts: BodyParts
    let outline = Color(red: 0.12, green: 0.12, blue: 0.16).opacity(0.55)
    let ink = Color(red: 0.12, green: 0.12, blue: 0.16)

    init(palette: [PaletteColor], parts: BodyParts) {
        main = (palette.first ?? .slate).color
        accent = (palette.count > 1 ? palette[1] : palette.first ?? .slate).color
        detail = (palette.count > 2 ? palette[2] : .cream).color
        self.parts = parts
    }

    struct Geometry {
        var body: Path
        var top: CGFloat
        var bottom: CGFloat
        var eyeY: CGFloat
        var eyeSpacing: CGFloat
        var right: CGFloat
    }

    var geometry: Geometry {
        switch parts.shape {
        case .round:
            Geometry(body: Path(ellipseIn: CGRect(x: 20, y: 30, width: 60, height: 56)),
                     top: 30, bottom: 86, eyeY: 52, eyeSpacing: 11, right: 80)
        case .egg:
            Geometry(body: Path(ellipseIn: CGRect(x: 26, y: 22, width: 48, height: 66)),
                     top: 22, bottom: 88, eyeY: 44, eyeSpacing: 9, right: 74)
        case .wide:
            Geometry(body: Path(ellipseIn: CGRect(x: 12, y: 42, width: 76, height: 44)),
                     top: 42, bottom: 86, eyeY: 58, eyeSpacing: 13, right: 88)
        case .tall:
            Geometry(body: Path(roundedRect: CGRect(x: 30, y: 22, width: 40, height: 66), cornerRadius: 18),
                     top: 22, bottom: 88, eyeY: 40, eyeSpacing: 8, right: 70)
        case .bird:
            Geometry(body: Path(ellipseIn: CGRect(x: 24, y: 32, width: 52, height: 52)),
                     top: 32, bottom: 84, eyeY: 52, eyeSpacing: 10, right: 76)
        case .serpent:
            Geometry(body: Self.serpentPath, top: 20, bottom: 88, eyeY: 38, eyeSpacing: 8, right: 86)
        }
    }

    private static var serpentPath: Path {
        var path = Path(ellipseIn: CGRect(x: 14, y: 64, width: 72, height: 24))
        path.addPath(Path(ellipseIn: CGRect(x: 30, y: 20, width: 40, height: 40)))
        path.addPath(Path(roundedRect: CGRect(x: 38, y: 48, width: 24, height: 26), cornerRadius: 8))
        return path
    }

    func draw(in context: inout GraphicsContext) {
        let g = geometry
        drawTail(&context, g)
        if parts.shape == .bird { drawWings(&context, g) }
        drawHead(&context, g)

        context.fill(g.body, with: .color(main))
        var inner = context
        inner.clip(to: g.body)
        drawPattern(&inner, g)
        context.stroke(g.body, with: .color(outline), lineWidth: 1.6)

        if parts.shape != .serpent { drawFeet(&context, g) }
        drawFace(&context, g)
    }

    // MARK: Parts

    private func drawTail(_ context: inout GraphicsContext, _ g: Geometry) {
        let x = g.right - 4
        let y = g.bottom - 16
        var path = Path()
        switch parts.tail {
        case .none:
            return
        case .stub:
            path.addEllipse(in: CGRect(x: x - 2, y: y - 6, width: 14, height: 12))
        case .long:
            path.move(to: CGPoint(x: x - 2, y: y + 2))
            path.addQuadCurve(to: CGPoint(x: x + 12, y: y - 26), control: CGPoint(x: x + 20, y: y))
            context.stroke(path, with: .color(accent), style: StrokeStyle(lineWidth: 6, lineCap: .round))
            return
        case .flame:
            path.move(to: CGPoint(x: x - 2, y: y + 4))
            path.addQuadCurve(to: CGPoint(x: x + 10, y: y - 26), control: CGPoint(x: x + 18, y: y - 4))
            path.addQuadCurve(to: CGPoint(x: x + 4, y: y - 8), control: CGPoint(x: x + 2, y: y - 18))
            path.addQuadCurve(to: CGPoint(x: x - 2, y: y + 4), control: CGPoint(x: x - 4, y: y - 2))
        case .leaf:
            path.addEllipse(in: CGRect(x: x, y: y - 24, width: 12, height: 24))
        case .fin:
            path.move(to: CGPoint(x: x - 4, y: y - 6))
            path.addLine(to: CGPoint(x: x + 16, y: y - 18))
            path.addLine(to: CGPoint(x: x + 12, y: y + 8))
            path.closeSubpath()
        }
        context.fill(path, with: .color(accent))
        context.stroke(path, with: .color(outline), lineWidth: 1.2)
    }

    private func drawWings(_ context: inout GraphicsContext, _ g: Geometry) {
        for rect in [CGRect(x: 10, y: 48, width: 20, height: 28), CGRect(x: 70, y: 48, width: 20, height: 28)] {
            let wing = Path(ellipseIn: rect)
            context.fill(wing, with: .color(accent))
            context.stroke(wing, with: .color(outline), lineWidth: 1.2)
        }
    }

    private func drawHead(_ context: inout GraphicsContext, _ g: Geometry) {
        let t = g.top
        switch parts.head {
        case .none:
            return
        case .catEars:
            for mirror in [false, true] {
                var ear = Path()
                ear.move(to: point(36, t + 12, mirror))
                ear.addLine(to: point(32, t - 12, mirror))
                ear.addLine(to: point(48, t + 3, mirror))
                ear.closeSubpath()
                context.fill(ear, with: .color(accent))
                context.stroke(ear, with: .color(outline), lineWidth: 1.2)
            }
        case .longEars:
            for rect in [CGRect(x: 35, y: t - 26, width: 10, height: 34), CGRect(x: 55, y: t - 26, width: 10, height: 34)] {
                let ear = Path(ellipseIn: rect)
                context.fill(ear, with: .color(accent))
                context.stroke(ear, with: .color(outline), lineWidth: 1.2)
            }
        case .horns:
            for mirror in [false, true] {
                var horn = Path()
                horn.move(to: point(40, t + 6, mirror))
                horn.addQuadCurve(to: point(32, t - 14, mirror), control: point(30, t + 2, mirror))
                context.stroke(horn, with: .color(detail), style: StrokeStyle(lineWidth: 5, lineCap: .round))
            }
        case .antennae:
            for mirror in [false, true] {
                var stalk = Path()
                stalk.move(to: point(45, t + 4, mirror))
                stalk.addLine(to: point(38, t - 14, mirror))
                context.stroke(stalk, with: .color(ink), lineWidth: 1.6)
                let tip = point(38, t - 14, mirror)
                context.fill(Path(ellipseIn: CGRect(x: tip.x - 3.5, y: tip.y - 3.5, width: 7, height: 7)), with: .color(accent))
            }
        case .crest:
            var crest = Path()
            let xs: [CGFloat] = [38, 42, 46, 50, 54, 58, 62]
            let ys: [CGFloat] = [t + 6, t - 8, t + 2, t - 12, t + 2, t - 8, t + 6]
            crest.move(to: CGPoint(x: xs[0], y: ys[0]))
            for (x, y) in zip(xs.dropFirst(), ys.dropFirst()) { crest.addLine(to: CGPoint(x: x, y: y)) }
            crest.closeSubpath()
            context.fill(crest, with: .color(accent))
            context.stroke(crest, with: .color(outline), lineWidth: 1.2)
        case .sprout:
            var stem = Path()
            stem.move(to: CGPoint(x: 50, y: t + 2))
            stem.addLine(to: CGPoint(x: 50, y: t - 10))
            context.stroke(stem, with: .color(PaletteColor.forest.color), lineWidth: 2)
            let leaf = Path(ellipseIn: CGRect(x: 50, y: t - 18, width: 14, height: 8))
            context.fill(leaf, with: .color(accent))
            context.stroke(leaf, with: .color(outline), lineWidth: 1)
        }
    }

    private func drawPattern(_ context: inout GraphicsContext, _ g: Geometry) {
        switch parts.pattern {
        case .none:
            return
        case .spots:
            let spots: [(CGFloat, CGFloat, CGFloat)] = [(30, g.eyeY + 8, 6), (68, g.eyeY + 14, 5), (58, g.bottom - 10, 4), (36, g.bottom - 8, 5), (66, g.top + 10, 4)]
            for (x, y, r) in spots {
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(accent.opacity(0.75)))
            }
        case .stripes:
            for offset in [CGFloat(10), 20, 30] {
                let y = g.eyeY + offset
                context.fill(Path(CGRect(x: 0, y: y, width: 100, height: 4)), with: .color(accent.opacity(0.7)))
            }
        case .belly:
            let height = (g.bottom - g.eyeY) * 0.75
            context.fill(Path(ellipseIn: CGRect(x: 36, y: g.bottom - height - 2, width: 28, height: height)),
                         with: .color(.white.opacity(0.45)))
        case .mask:
            context.fill(Path(CGRect(x: 0, y: g.eyeY - 7, width: 100, height: 14)), with: .color(accent.opacity(0.75)))
        }
    }

    private func drawFeet(_ context: inout GraphicsContext, _ g: Geometry) {
        for x in [CGFloat(38), 62] {
            let foot = Path(ellipseIn: CGRect(x: x - 7, y: g.bottom - 5, width: 14, height: 8))
            context.fill(foot, with: .color(main))
            context.stroke(foot, with: .color(outline), lineWidth: 1.2)
        }
    }

    private func drawFace(_ context: inout GraphicsContext, _ g: Geometry) {
        let y = g.eyeY
        let s = g.eyeSpacing
        let eyeXs: [CGFloat] = parts.eyes == .single ? [50] : [50 - s, 50 + s]

        for x in eyeXs {
            switch parts.eyes {
            case .round:
                dot(&context, x, y, 4.5, ink)
                dot(&context, x + 1.4, y - 1.4, 1.5, .white)
            case .sparkle:
                dot(&context, x, y, 6, ink)
                dot(&context, x + 2, y - 2, 2.2, .white)
                dot(&context, x - 1.8, y + 2, 1, .white)
            case .sleepy:
                var lid = Path()
                lid.move(to: CGPoint(x: x - 5, y: y))
                lid.addQuadCurve(to: CGPoint(x: x + 5, y: y), control: CGPoint(x: x, y: y + 5))
                context.stroke(lid, with: .color(ink), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
            case .sharp:
                let inward: CGFloat = x < 50 ? 1 : -1
                var eye = Path()
                eye.move(to: CGPoint(x: x - 5 * inward, y: y - 1))
                eye.addLine(to: CGPoint(x: x + 5 * inward, y: y - 4))
                eye.addLine(to: CGPoint(x: x + 3 * inward, y: y + 3))
                eye.closeSubpath()
                context.fill(eye, with: .color(ink))
            case .big:
                dot(&context, x, y, 7.5, ink)
                dot(&context, x + 2.5, y - 2.5, 2.8, .white)
            case .single:
                dot(&context, x, y, 9, .white)
                dot(&context, x, y, 5.5, ink)
                dot(&context, x + 2, y - 2, 1.8, .white)
            }
        }

        // Cheeks
        for x in [50 - s - 8, 50 + s + 8] where parts.eyes != .single {
            dot(&context, x, y + 7, 3.5, detail.opacity(0.7))
        }

        // Mouth
        var mouth = Path()
        mouth.move(to: CGPoint(x: 46, y: y + 9))
        mouth.addQuadCurve(to: CGPoint(x: 54, y: y + 9), control: CGPoint(x: 50, y: y + 13))
        context.stroke(mouth, with: .color(ink), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
    }

    // MARK: Helpers

    private func point(_ x: CGFloat, _ y: CGFloat, _ mirror: Bool) -> CGPoint {
        CGPoint(x: mirror ? 100 - x : x, y: y)
    }

    private func dot(_ context: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: Color) {
        context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(color))
    }
}

// MARK: - Person (R14)

extension PersonParts.Skin {
    var color: Color {
        switch self {
        case .porcelain: Color(red: 1.00, green: 0.89, blue: 0.82)
        case .light: Color(red: 0.98, green: 0.80, blue: 0.67)
        case .tan: Color(red: 0.87, green: 0.66, blue: 0.48)
        case .olive: Color(red: 0.75, green: 0.57, blue: 0.39)
        case .brown: Color(red: 0.55, green: 0.37, blue: 0.25)
        case .deep: Color(red: 0.36, green: 0.24, blue: 0.17)
        }
    }
}

/// A person in a chibi style: a large head on a small body, on the same
/// 100 x 100 canvas as a creature.
private struct PersonRenderer {
    let outfit: Color
    let hair: Color
    let detail: Color
    let skin: Color
    let parts: PersonParts
    let outline = Color(red: 0.12, green: 0.12, blue: 0.16).opacity(0.55)
    let ink = Color(red: 0.12, green: 0.12, blue: 0.16)
    let trousers = Color(red: 0.22, green: 0.24, blue: 0.32)

    init(palette: [PaletteColor], parts: PersonParts) {
        outfit = (palette.first ?? .slate).color
        hair = (palette.count > 1 ? palette[1] : .charcoal).color
        detail = (palette.count > 2 ? palette[2] : .cream).color
        skin = parts.skin.color
        self.parts = parts
    }

    // The head and the body.
    let headRect = CGRect(x: 31, y: 15, width: 38, height: 38)
    var headPath: Path { Path(ellipseIn: headRect) }
    let eyeY: CGFloat = 37
    let eyeSpacing: CGFloat = 8
    /// The bottom of the torso. A dress and a coat are longer.
    var torsoBottom: CGFloat {
        switch parts.outfit {
        case .dress: 86
        case .coat: 90
        default: 82
        }
    }

    func draw(in context: inout GraphicsContext) {
        if parts.accessory == .cape { drawCape(&context) }
        drawBackHair(&context)
        if parts.outfit == .hoodie { fillStroke(&context, Path(ellipseIn: CGRect(x: 29, y: 40, width: 42, height: 20)), outfit) }
        drawLegs(&context)
        drawTorso(&context)
        drawArms(&context)
        fillStroke(&context, Path(CGRect(x: 45, y: 49, width: 10, height: 8)), skin, line: 0)
        if parts.accessory == .scarf { drawScarf(&context) }

        fillStroke(&context, headPath, skin)
        drawFace(&context)
        drawFrontHair(&context)
        drawFrontAccessory(&context)
    }

    // MARK: Body

    private func drawCape(_ context: inout GraphicsContext) {
        var cape = Path()
        cape.move(to: CGPoint(x: 36, y: 55))
        cape.addLine(to: CGPoint(x: 64, y: 55))
        cape.addLine(to: CGPoint(x: 78, y: 93))
        cape.addQuadCurve(to: CGPoint(x: 22, y: 93), control: CGPoint(x: 50, y: 97))
        cape.closeSubpath()
        fillStroke(&context, cape, detail)
    }

    private func drawLegs(_ context: inout GraphicsContext) {
        for x in [CGFloat(38), 52] {
            let leg = Path(roundedRect: CGRect(x: x, y: 78, width: 10, height: 16), cornerRadius: 3)
            fillStroke(&context, leg, trousers)
            let shoe = Path(ellipseIn: CGRect(x: x - 1.5, y: 91, width: 13, height: 6))
            fillStroke(&context, shoe, ink)
        }
    }

    private func drawTorso(_ context: inout GraphicsContext) {
        let bottom = torsoBottom
        let torso: Path
        if parts.outfit == .dress {
            var dress = Path()
            dress.move(to: CGPoint(x: 37, y: 55))
            dress.addLine(to: CGPoint(x: 63, y: 55))
            dress.addLine(to: CGPoint(x: 72, y: bottom))
            dress.addQuadCurve(to: CGPoint(x: 28, y: bottom), control: CGPoint(x: 50, y: bottom + 3))
            dress.closeSubpath()
            torso = dress
        } else {
            let width: CGFloat = parts.outfit == .coat ? 36 : 32
            torso = Path(roundedRect: CGRect(x: 50 - width / 2, y: 54, width: width, height: bottom - 54), cornerRadius: 9)
        }
        context.fill(torso, with: .color(outfit))

        var inner = context
        inner.clip(to: torso)
        switch parts.outfit {
        case .tee:
            dot(&inner, 50, 66, 3.5, detail)
        case .jacket:
            inner.fill(Path(CGRect(x: 45, y: 54, width: 10, height: 40)), with: .color(detail))
            var lapels = Path()
            lapels.move(to: CGPoint(x: 45, y: 54))
            lapels.addLine(to: CGPoint(x: 50, y: 64))
            lapels.addLine(to: CGPoint(x: 55, y: 54))
            inner.stroke(lapels, with: .color(outline), lineWidth: 1.2)
            inner.stroke(Path(CGRect(x: 45, y: 54, width: 10, height: 40)), with: .color(outline), lineWidth: 1)
        case .hoodie:
            inner.stroke(Path(roundedRect: CGRect(x: 40, y: 70, width: 20, height: 9), cornerRadius: 3), with: .color(outline), lineWidth: 1.2)
            for x in [CGFloat(46), 54] {
                var cord = Path()
                cord.move(to: CGPoint(x: x, y: 55))
                cord.addLine(to: CGPoint(x: x, y: 64))
                inner.stroke(cord, with: .color(detail), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
            }
        case .dress:
            inner.fill(Path(CGRect(x: 0, y: 65, width: 100, height: 4)), with: .color(detail))
        case .coat:
            var seam = Path()
            seam.move(to: CGPoint(x: 50, y: 54))
            seam.addLine(to: CGPoint(x: 50, y: bottom))
            inner.stroke(seam, with: .color(outline), lineWidth: 1)
            for y in [CGFloat(62), 70, 78] { dot(&inner, 46, y, 1.6, detail) }
        case .uniform:
            inner.fill(Path(CGRect(x: 0, y: 72, width: 100, height: 4)), with: .color(detail))
            for mirror in [false, true] {
                var collar = Path()
                collar.move(to: point(42, 54, mirror))
                collar.addLine(to: point(50, 54, mirror))
                collar.addLine(to: point(47, 61, mirror))
                collar.closeSubpath()
                inner.fill(collar, with: .color(detail))
            }
            dot(&inner, 58, 63, 2.6, detail)
        }
        context.stroke(torso, with: .color(outline), lineWidth: 1.6)
    }

    private func drawArms(_ context: inout GraphicsContext) {
        for mirror in [false, true] {
            let x: CGFloat = mirror ? 66 : 25
            let sleeve = Path(roundedRect: CGRect(x: x, y: 56, width: 9, height: 22), cornerRadius: 4.5)
            // A tee has short sleeves: the lower arm is skin.
            if parts.outfit == .tee {
                fillStroke(&context, sleeve, skin)
                fillStroke(&context, Path(roundedRect: CGRect(x: x, y: 56, width: 9, height: 10), cornerRadius: 4.5), outfit)
            } else {
                fillStroke(&context, sleeve, outfit)
            }
            fillStroke(&context, Path(ellipseIn: CGRect(x: x + 0.5, y: 75, width: 8, height: 8)), skin)
        }
    }

    private func drawScarf(_ context: inout GraphicsContext) {
        fillStroke(&context, Path(roundedRect: CGRect(x: 37, y: 51, width: 26, height: 7), cornerRadius: 3.5), detail)
        fillStroke(&context, Path(roundedRect: CGRect(x: 54, y: 55, width: 7, height: 15), cornerRadius: 2.5), detail)
    }

    // MARK: Hair

    /// The hair that is behind the head.
    private func drawBackHair(_ context: inout GraphicsContext) {
        let cap = Path(ellipseIn: CGRect(x: 29, y: 12, width: 42, height: 34))
        switch parts.hair {
        case .none:
            return
        case .short:
            fillStroke(&context, cap, hair)
        case .long:
            fillStroke(&context, Path(roundedRect: CGRect(x: 28, y: 14, width: 44, height: 50), cornerRadius: 16), hair)
        case .ponytail:
            fillStroke(&context, Path(ellipseIn: CGRect(x: 63, y: 18, width: 14, height: 32)), hair)
            fillStroke(&context, cap, hair)
        case .bun:
            fillStroke(&context, Path(ellipseIn: CGRect(x: 41, y: 5, width: 18, height: 16)), hair)
            fillStroke(&context, cap, hair)
        case .spiky:
            var spikes = Path()
            let points: [(CGFloat, CGFloat)] = [
                (30, 36), (25, 20), (34, 22), (35, 7), (43, 15), (50, 3),
                (57, 15), (65, 7), (66, 22), (75, 20), (70, 36),
            ]
            spikes.move(to: CGPoint(x: points[0].0, y: points[0].1))
            for (x, y) in points.dropFirst() { spikes.addLine(to: CGPoint(x: x, y: y)) }
            spikes.closeSubpath()
            fillStroke(&context, spikes, hair)
        }
    }

    /// The bangs, on the head.
    private func drawFrontHair(_ context: inout GraphicsContext) {
        guard parts.hair != .none else { return }
        var bangs = Path()
        let edge: [(CGFloat, CGFloat)] = parts.hair == .spiky
            ? [(72, 27), (65, 22), (59, 29), (52, 22), (45, 29), (38, 22), (28, 28)]
            : [(72, 30), (64, 25), (57, 30), (50, 25), (43, 30), (36, 25), (28, 30)]
        bangs.move(to: CGPoint(x: 28, y: 8))
        bangs.addLine(to: CGPoint(x: 72, y: 8))
        for (x, y) in edge { bangs.addLine(to: CGPoint(x: x, y: y)) }
        bangs.closeSubpath()

        var inner = context
        inner.clip(to: headPath)
        inner.fill(bangs, with: .color(hair))
        inner.stroke(bangs, with: .color(outline), lineWidth: 1.2)
        context.stroke(headPath, with: .color(outline), lineWidth: 1.6)

        if parts.hair == .long {
            for x in [CGFloat(29), 65] {
                fillStroke(&context, Path(roundedRect: CGRect(x: x, y: 24, width: 6, height: 26), cornerRadius: 3), hair, line: 1)
            }
        }
    }

    // MARK: Face and accessories

    private func drawFace(_ context: inout GraphicsContext) {
        let y = eyeY
        for x in [50 - eyeSpacing, 50 + eyeSpacing] {
            switch parts.eyes {
            case .round:
                dot(&context, x, y, 3.2, ink)
                dot(&context, x + 1, y - 1, 1.1, .white)
            case .sparkle:
                dot(&context, x, y, 4.2, ink)
                dot(&context, x + 1.4, y - 1.4, 1.6, .white)
                dot(&context, x - 1.3, y + 1.4, 0.8, .white)
            case .sleepy:
                var lid = Path()
                lid.move(to: CGPoint(x: x - 4, y: y))
                lid.addQuadCurve(to: CGPoint(x: x + 4, y: y), control: CGPoint(x: x, y: y + 4))
                context.stroke(lid, with: .color(ink), style: StrokeStyle(lineWidth: 2, lineCap: .round))
            case .sharp:
                let inward: CGFloat = x < 50 ? 1 : -1
                var eye = Path()
                eye.move(to: CGPoint(x: x - 4 * inward, y: y - 1))
                eye.addLine(to: CGPoint(x: x + 4 * inward, y: y - 3))
                eye.addLine(to: CGPoint(x: x + 2.5 * inward, y: y + 2.5))
                eye.closeSubpath()
                context.fill(eye, with: .color(ink))
            case .big:
                dot(&context, x, y, 5.5, ink)
                dot(&context, x + 1.8, y - 1.8, 2, .white)
            }
        }
        for x in [50 - eyeSpacing - 6, 50 + eyeSpacing + 6] {
            dot(&context, x, y + 7, 2.8, PaletteColor.rose.color.opacity(0.35))
        }
        var mouth = Path()
        mouth.move(to: CGPoint(x: 47, y: y + 9))
        mouth.addQuadCurve(to: CGPoint(x: 53, y: y + 9), control: CGPoint(x: 50, y: y + 12))
        context.stroke(mouth, with: .color(ink), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
    }

    private func drawFrontAccessory(_ context: inout GraphicsContext) {
        switch parts.accessory {
        case .none, .scarf, .cape:
            return
        case .glasses:
            for x in [50 - eyeSpacing, 50 + eyeSpacing] {
                context.stroke(Path(ellipseIn: CGRect(x: x - 6, y: eyeY - 5.5, width: 12, height: 11)), with: .color(ink), lineWidth: 1.4)
            }
            var bridge = Path()
            bridge.move(to: CGPoint(x: 48, y: eyeY - 1))
            bridge.addLine(to: CGPoint(x: 52, y: eyeY - 1))
            context.stroke(bridge, with: .color(ink), lineWidth: 1.4)
        case .headband:
            var inner = context
            inner.clip(to: Path(ellipseIn: headRect.insetBy(dx: -1, dy: -1)))
            inner.fill(Path(CGRect(x: 0, y: 23, width: 100, height: 4.5)), with: .color(detail))
        case .cap:
            var dome = Path()
            dome.addArc(center: CGPoint(x: 50, y: 27), radius: 20, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
            dome.closeSubpath()
            fillStroke(&context, dome, detail)
            fillStroke(&context, Path(ellipseIn: CGRect(x: 30, y: 24, width: 46, height: 7)), detail)
        }
    }

    // MARK: Helpers

    private func fillStroke(_ context: inout GraphicsContext, _ path: Path, _ color: Color, line: CGFloat = 1.2) {
        context.fill(path, with: .color(color))
        if line > 0 { context.stroke(path, with: .color(outline), lineWidth: line) }
    }

    private func point(_ x: CGFloat, _ y: CGFloat, _ mirror: Bool) -> CGPoint {
        CGPoint(x: mirror ? 100 - x : x, y: y)
    }

    private func dot(_ context: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: Color) {
        context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(color))
    }
}

#Preview {
    let world = World.sample()
    ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))]) {
            ForEach(world.characters) { c in
                CharacterDrawing(character: c)
                    .background(c.primaryType.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .padding()
    }
}
