// Pack presets and each set's own pack (docs/design/sets.md, section 5; S2, S6).

extension World {
    /// A new pack preset that copies an existing one.
    @discardableResult
    public mutating func createPackPreset(copying packID: PackID, name: String) throws(CardError) -> PackID {
        guard let source = catalog.packPreset(packID) else { throw .unknownPack(packID) }
        let trimmed = try validPackName(name, editing: nil)
        let id = catalog.takeID()
        catalog.packPresets.append(PackLayout(
            id: id, name: trimmed, ladderID: source.ladderID, boxSize: source.boxSize, slots: source.slots
        ))
        return id
    }

    public mutating func updatePackPreset(_ pack: PackLayout) throws(CardError) {
        guard pack.id != Catalog.defaultPackID else { throw .defaultPackLocked }
        guard let i = catalog.packPresets.firstIndex(where: { $0.id == pack.id }) else { throw .unknownPack(pack.id) }
        var copy = try validPack(pack)
        copy.name = try validPackName(pack.name, editing: pack.id)
        if catalog.preset(copy.ladderID) == nil { throw .unknownPreset(copy.ladderID) }
        catalog.packPresets[i] = copy
    }

    /// A set keeps its own copy, so deleting a preset does not change any set (C10).
    public mutating func deletePackPreset(_ id: PackID) throws(CardError) {
        guard id != Catalog.defaultPackID else { throw .defaultPackLocked }
        guard catalog.packPreset(id) != nil else { throw .unknownPack(id) }
        catalog.packPresets.removeAll { $0.id == id }
    }

    /// Changes a set's own pack. The set's pack keeps its ID and name.
    public mutating func updateSetPack(_ setID: SetID, _ pack: PackLayout) throws(CardError) {
        guard let i = catalog.sets.firstIndex(where: { $0.id == setID }) else { throw .unknownSet(setID) }
        let valid = try validPack(pack)
        catalog.sets[i].pack.slots = valid.slots
        catalog.sets[i].pack.boxSize = valid.boxSize
    }

    /// The warnings for a set's pack (sets.md, section 5.4). A read.
    public func packWarnings(_ setID: SetID) -> [PackWarning] {
        guard let set = catalog.set(setID) else { return [] }
        return set.pack.warnings(ladder: set.ladder, cards: catalog.allCards(in: setID), subsets: set.subsets)
    }

    /// The pull rates of a set's pack (sets.md, section 5.3). A read.
    public func packStats(_ setID: SetID) -> PackStats? {
        guard let set = catalog.set(setID) else { return nil }
        return PackStats(pack: set.pack, ladder: set.ladder, cards: catalog.allCards(in: setID), subsets: set.subsets)
    }

    // MARK: - Validation

    /// The rules for any pack. The odds in each slot must add up to 100%.
    func validPack(_ pack: PackLayout) throws(CardError) -> PackLayout {
        guard PackLayout.cardRange.contains(pack.cardCount), pack.slots.allSatisfy({ $0.count >= 1 }) else { throw .packCardCount }
        guard PackLayout.boxRange.contains(pack.boxSize) else { throw .badBoxSize }
        for (index, slot) in pack.slots.enumerated() {
            let number = index + 1
            if slot.outcomes.isEmpty { throw .emptySlot(number) }
            if slot.outcomes.contains(where: { $0.odds < 0 || $0.odds > 100 }) { throw .badOdds(number) }
            if Set(slot.outcomes.map(\.kind)).count != slot.outcomes.count { throw .duplicateOutcome(number) }
            let sum = slot.oddsSum
            if abs(sum - 100) > 0.001 { throw .slotOddsSum(slot: number, sum: sum) }
        }
        return pack
    }

    func validPackName(_ name: String, editing: PackID?) throws(CardError) -> String {
        let trimmed = try validName(name, limit: PackLayout.nameLimit)
        if catalog.packPresets.contains(where: { $0.id != editing && $0.name.lowercased() == trimmed.lowercased() }) {
            throw .duplicatePackName(trimmed)
        }
        return trimmed
    }
}
