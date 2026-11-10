import SwiftUI
import SimCore

struct TypeBadge: View {
    let type: ElementType

    var body: some View {
        Label(type.name, systemImage: type.symbol)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(type.tint.opacity(0.18), in: Capsule())
            .foregroundStyle(type.tint)
    }
}

struct Chip: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(.secondarySystemBackground), in: Capsule())
    }
}

struct PaletteSwatches: View {
    let palette: [PaletteColor]
    var size: CGFloat = 22

    var body: some View {
        HStack(spacing: 6) {
            ForEach(palette) { color in
                Circle()
                    .fill(color.color)
                    .frame(width: size, height: size)
                    .overlay(Circle().stroke(.primary.opacity(0.15), lineWidth: 1))
                    .accessibilityLabel(color.name)
            }
        }
    }
}

/// A character's drawing on a tinted tile.
struct CharacterPortrait: View {
    let character: Character
    var cornerRadius: CGFloat = 16
    var padding: CGFloat = 8

    var body: some View {
        CharacterDrawing(character: character)
            .padding(padding)
            .background(character.primaryType.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: cornerRadius))
    }
}

/// The reading for one audience, drawn as a range on a -50 to 100 scale.
struct AudienceRangeBar: View {
    let audience: Audience
    let reading: Reading
    let awareness: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(audience.name).font(.subheadline.weight(.medium))
                Spacer()
                Text(awarenessText).font(.caption).foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                let width = geo.size.width
                let low = position(reading.low, width)
                let high = position(reading.high, width)
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.tertiarySystemFill)).frame(height: 8)
                    Rectangle()
                        .fill(.secondary)
                        .frame(width: 1.5, height: 14)
                        .offset(x: position(0, width))
                    Capsule()
                        .fill(Theme.appealColor(reading.mid))
                        .frame(width: max(8, high - low), height: 8)
                        .offset(x: low)
                }
                .frame(height: 14)
            }
            .frame(height: 14)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(audience.name): appeal between \(Int(reading.low)) and \(Int(reading.high)). \(awarenessText).")
    }

    private var awarenessText: String {
        awareness <= 0.0005 ? "Unknown to them" : "\(Int((awareness * 100).rounded()))% know it"
    }

    private func position(_ value: Double, _ width: CGFloat) -> CGFloat {
        let range = Character.appealRange
        return CGFloat((value - range.lowerBound) / (range.upperBound - range.lowerBound)) * width
    }
}

/// A large selectable option for the creator. Sized for one thumb.
struct OptionButton: View {
    let title: String
    var subtitle: String?
    var symbol: String?
    var tint: Color = Theme.accent
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                if let symbol {
                    Image(systemName: symbol).font(.title2).foregroundStyle(tint)
                }
                Text(title).font(.subheadline.weight(.semibold))
                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 60)
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selected ? tint.opacity(0.18) : Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(selected ? tint : .clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct SectionHeader: View {
    let title: String
    var caption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.title3.bold())
            if let caption {
                Text(caption).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}
