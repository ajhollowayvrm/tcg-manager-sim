import Foundation

// Deterministic random numbers.
//
// Do not use the standard library's `random(in:using:)`, `shuffle(using:)`
// or `randomElement(using:)` in the simulation. Apple says that their
// algorithms can change in a future Swift version, and that change would
// change every saved world. Use the helpers below. A golden test pins them.

/// SplitMix64. Used to seed Xoshiro256** and to make stable per-item values.
public struct SplitMix64: RandomNumberGenerator, Codable, Sendable, Equatable {
    public private(set) var state: UInt64

    public init(seed: UInt64) {
        state = seed
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

/// Xoshiro256**. The main generator for each simulation stream.
public struct Xoshiro256: RandomNumberGenerator, Codable, Sendable, Equatable {
    private var s0: UInt64
    private var s1: UInt64
    private var s2: UInt64
    private var s3: UInt64

    public init(seed: UInt64) {
        var seeder = SplitMix64(seed: seed)
        s0 = seeder.next()
        s1 = seeder.next()
        s2 = seeder.next()
        s3 = seeder.next()
    }

    public mutating func next() -> UInt64 {
        let result = Self.rotl(s1 &* 5, 7) &* 9
        let t = s1 << 17
        s2 ^= s0
        s3 ^= s1
        s1 ^= s2
        s0 ^= s3
        s2 ^= t
        s3 = Self.rotl(s3, 45)
        return result
    }

    private static func rotl(_ x: UInt64, _ k: UInt64) -> UInt64 {
        (x << k) | (x >> (64 - k))
    }
}

extension RandomNumberGenerator {
    /// A Double in 0..<1. One draw.
    public mutating func unit() -> Double {
        Double(next() >> 11) * 0x1.0p-53
    }

    /// A Double in lo..<hi. One draw.
    public mutating func uniform(_ lo: Double, _ hi: Double) -> Double {
        lo + (hi - lo) * unit()
    }

    /// An Int in lo...hi. One draw.
    public mutating func int(_ lo: Int, _ hi: Int) -> Int {
        precondition(hi >= lo, "int(_:_:) needs hi >= lo")
        let span = UInt64(hi - lo) + 1
        return lo + Int(next() % span)
    }

    /// True with probability p. One draw.
    public mutating func chance(_ p: Double) -> Bool {
        unit() < p
    }

    /// A standard normal value (Box-Muller). Two draws.
    public mutating func gauss() -> Double {
        let u1 = max(unit(), 1e-12)
        let u2 = unit()
        return (-2 * log(u1)).squareRoot() * cos(2 * Double.pi * u2)
    }

    /// One element of a non-empty array. One draw.
    public mutating func pick<T>(_ items: [T]) -> T {
        precondition(!items.isEmpty, "pick(_:) needs a non-empty array")
        return items[int(0, items.count - 1)]
    }
}
