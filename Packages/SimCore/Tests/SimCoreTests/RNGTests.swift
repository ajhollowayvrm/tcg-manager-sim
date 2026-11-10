import Testing
@testable import SimCore

@Suite("Random numbers")
struct RNGTests {
    @Test("SplitMix64 matches the reference output for seed 0")
    func splitMixReference() {
        var rng = SplitMix64(seed: 0)
        #expect(rng.next() == 0xE220_A839_7B1D_CDAF)
        #expect(rng.next() == 0x6E78_9E6A_A1B9_65F4)
        #expect(rng.next() == 0x06C4_5D18_8009_454F)
    }

    @Test("Xoshiro256** output is pinned. A change here changes every saved world")
    func xoshiroGolden() {
        var rng = Xoshiro256(seed: 12345)
        let values = (0..<4).map { _ in rng.next() }
        #expect(values == XoshiroGolden.seed12345)
    }

    @Test("The helpers stay in range")
    func helperRanges() {
        var rng = Xoshiro256(seed: 7)
        for _ in 0..<10_000 {
            let u = rng.unit()
            #expect(u >= 0 && u < 1)
            let i = rng.int(-3, 4)
            #expect(i >= -3 && i <= 4)
        }
    }

    @Test("The same seed gives the same sequence")
    func determinism() {
        var a = Xoshiro256(seed: 99)
        var b = Xoshiro256(seed: 99)
        for _ in 0..<100 { #expect(a.next() == b.next()) }
    }
}

/// Recorded from the first run on 2026-11-10. Do not edit these values to make
/// a test pass: a change means old saves no longer reproduce.
enum XoshiroGolden {
    static let seed12345: [UInt64] = [
        0xBE6A_3637_4160_D49B,
        0x214A_AA06_37A6_88C6,
        0xF69D_16DE_9954_D388,
        0x0C60_048C_4E96_E033,
    ]
}
