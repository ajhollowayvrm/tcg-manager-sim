import Foundation
import Testing
@testable import SimCore

@Suite("RNG")
struct RNGTests {
    @Test("SplitMix64 gives the published first value for seed 0")
    func splitMixVector() {
        var rng = SplitMix64(seed: 0)
        #expect(rng.next() == 0xE220_A839_7B1D_CDAF)
    }

    @Test("The same seed gives the same sequence, and another seed does not")
    func seeds() {
        var a = Xoshiro256(seed: 7)
        var b = Xoshiro256(seed: 7)
        var c = Xoshiro256(seed: 8)
        let first = (0..<8).map { _ in a.next() }
        let second = (0..<8).map { _ in b.next() }
        let other = (0..<8).map { _ in c.next() }
        #expect(first == second)
        #expect(first != other)
    }

    @Test("Each helper draws the documented number of values")
    func drawCounts() {
        let base = Xoshiro256(seed: 11)
        var once = base
        _ = once.next()
        var twice = once
        _ = twice.next()

        var rng = base
        _ = rng.unit()
        #expect(rng == once)
        rng = base
        _ = rng.uniform(1, 2)
        #expect(rng == once)
        rng = base
        _ = rng.int(0, 9)
        #expect(rng == once)
        rng = base
        _ = rng.chance(0.5)
        #expect(rng == once)
        rng = base
        _ = rng.pick([1, 2, 3])
        #expect(rng == once)
        rng = base
        _ = rng.gauss()
        #expect(rng == twice)
    }

    @Test("Helpers stay in range, and int covers both ends")
    func ranges() {
        var rng = Xoshiro256(seed: 3)
        var seen: Set<Int> = []
        var inRange = true
        for _ in 0..<300 {
            let u = rng.unit()
            let x = rng.uniform(-5, 5)
            let n = rng.int(2, 4)
            seen.insert(n)
            if u < 0 || u >= 1 || x < -5 || x >= 5 || n < 2 || n > 4 { inRange = false }
        }
        #expect(inRange)
        #expect(seen == [2, 3, 4])
        #expect(rng.int(6, 6) == 6)
    }

    @Test("chance(0) never hits and chance(1) always hits")
    func chanceEdges() {
        var rng = Xoshiro256(seed: 5)
        var hitsAtZero = 0
        var hitsAtOne = 0
        for _ in 0..<50 {
            if rng.chance(0) { hitsAtZero += 1 }
            if rng.chance(1) { hitsAtOne += 1 }
        }
        #expect(hitsAtZero == 0)
        #expect(hitsAtOne == 50)
    }

    @Test("gauss has a mean near 0 and a spread near 1")
    func gaussShape() {
        var rng = Xoshiro256(seed: 9)
        let values = (0..<400).map { _ in rng.gauss() }
        let mean = values.reduce(0, +) / 400
        let spread = (values.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / 400).squareRoot()
        #expect(abs(mean) < 0.2)
        #expect(abs(spread - 1) < 0.2)
    }

    @Test("shuffle keeps the elements, repeats for a seed, and draws count minus one")
    func shuffleRules() {
        var rng = Xoshiro256(seed: 21)
        var items = Array(0..<10)
        rng.shuffle(&items)
        #expect(items.sorted() == Array(0..<10))

        var again = Xoshiro256(seed: 21)
        var items2 = Array(0..<10)
        again.shuffle(&items2)
        #expect(items == items2)
        #expect(rng == again)

        var expected = Xoshiro256(seed: 21)
        for _ in 0..<9 { _ = expected.next() }
        #expect(rng == expected)
    }

    @Test("shuffle draws nothing for zero or one element")
    func shuffleSmall() {
        var rng = Xoshiro256(seed: 2)
        let before = rng
        var empty: [Int] = []
        var one = [4]
        rng.shuffle(&empty)
        rng.shuffle(&one)
        #expect(rng == before)
        #expect(one == [4])
    }

    @Test("A saved generator continues with the same sequence")
    func codableState() throws {
        var rng = Xoshiro256(seed: 13)
        _ = rng.next()
        let data = try JSONEncoder().encode(rng)
        var loaded = try JSONDecoder().decode(Xoshiro256.self, from: data)
        #expect(loaded == rng)
        #expect(loaded.next() == rng.next())
    }

    @Test("Stream seeds differ for each stream and each world seed")
    func streamSeeds() {
        let a = World.streamSeed(1, stream: 1)
        let b = World.streamSeed(1, stream: 2)
        let c = World.streamSeed(2, stream: 1)
        #expect(a != b)
        #expect(a != c)
        #expect(a == World.streamSeed(1, stream: 1))
    }
}
