import Testing
import Foundation
@testable import SimCore

/// Funding (F1 to F4). Each test sets the state directly and runs few weeks.
struct FinanceTests {
    /// A new world with sales of `perWeek` dollars in each of the last `weeks` weeks.
    func studio(week: Int = 60, perWeek: Double = 0, weeks: Int = 52) throws -> World {
        var w = try Fixture.world().world
        w.week = week
        guard perWeek > 0 else { return w }
        var b = w.business
        for k in 0..<weeks { b.record(week - k, perWeek, "Shipment", kind: .sales) }
        w.businessState = b
        return w
    }

    func fails(_ body: () throws -> Void) -> Bool {
        do { try body(); return false } catch { return error is CardError }
    }

    func draftWithCard() throws -> (world: World, set: SetID) {
        var (w, set, mascot) = try Fixture.studio()
        try w.createCard(in: set, CardDraft(name: "Aryla, Star", characterID: mascot, rarity: 3))
        return (w, set)
    }

    @Test func limitIsBaseWithNoSales() throws {
        let w = try studio()
        #expect(w.bankLoanLimit == 20_000)
    }

    @Test func limitAddsSalesOfLast52Weeks() throws {
        let w = try studio(perWeek: 1_000)
        #expect(w.bankLoanLimit == 20_000 + 0.25 * 52_000)
    }

    @Test func limitIgnoresOldSalesAndFundingLines() throws {
        var w = try studio()
        var b = w.business
        b.record(1, 99_000, "Old shipment", kind: .sales)
        b.record(w.week, 99_000, "Cash in", kind: .funding)
        w.businessState = b
        #expect(w.bankLoanLimit == 20_000)
    }

    @Test func rateFollowsTheAmount() {
        #expect(abs(Finance.rate(for: 10_000) - 0.135) < 1e-9)
        #expect(abs(Finance.rate(for: 100_000) - 0.12) < 1e-9)
        #expect(abs(Finance.rate(for: 300_000) - 0.10) < 1e-9)
    }

    @Test func paymentAmortizesToZero() {
        let rate = 0.135
        let pay = Finance.payment(amount: 10_000, rate: rate, years: 1)
        var balance = 10_000.0
        for _ in 0..<52 { balance = balance * (1 + rate / 52) - pay }
        #expect(abs(balance) < 0.01)
    }

    @Test func takeLoanAddsCashAndALine() throws {
        var w = try studio()
        let cash = w.business.cash
        try w.takeBankLoan(amount: 10_000, years: 2)
        #expect(w.business.cash == cash + 10_000)
        #expect(w.business.ledger.last?.kind == .funding)
        #expect(w.finance.loans.count == 1)
        #expect(w.bankLoanLimit == 10_000)
    }

    @Test func loanChecksAmountAndTerm() throws {
        var w = try studio()
        #expect(fails { try w.takeBankLoan(amount: 20_001, years: 1) })
        #expect(fails { try w.takeBankLoan(amount: 500, years: 1) })
        #expect(fails { try w.takeBankLoan(amount: 5_000, years: 4) })
    }

    @Test func weeklyPaymentReducesTheBalance() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 10_000, years: 1)
        let loan = w.finance.loans[0]
        w.runFinance()
        let after = w.finance.loans[0]
        let expected = 10_000 * (1 + loan.rate / 52) - loan.weeklyPayment
        #expect(abs(after.balance - expected) < 0.001)
        #expect(after.weeksLeft == 51)
        #expect(after.missed == 0)
    }

    @Test func loanEndsAfterTheTerm() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 5_000, years: 1)
        var b = w.business
        b.record(w.week, 100_000, "Cash")
        w.businessState = b
        for _ in 0..<52 { w.runFinance() }
        #expect(w.finance.loans.isEmpty)
    }

    @Test func missedPaymentAddsAFee() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 10_000, years: 1)
        var b = w.business
        b.record(w.week, -b.cash, "Spend")
        w.businessState = b
        w.runFinance()
        let loan = w.finance.loans[0]
        #expect(loan.missed == 1)
        #expect(loan.balance > 10_000)
        #expect(w.business.news.count == 1)
    }

    @Test func paidWeekResetsMisses() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 10_000, years: 1)
        var f = w.finance
        f.loans[0].missed = 2
        w.financeState = f
        w.runFinance()
        #expect(w.finance.loans[0].missed == 0)
    }

    @Test func thirdMissCallsTheLoanAndClosesTheStudio() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 10_000, years: 1)
        var b = w.business
        b.record(w.week, -b.cash, "Spend")
        w.businessState = b
        var f = w.finance
        f.loans[0].missed = 2
        w.financeState = f
        w.runFinance()
        #expect(w.business.closedWeek == w.week)
    }

    @Test func thirdMissWithCashPaysTheBalance() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 10_000, years: 1)
        var f = w.finance
        f.loans[0].missed = 2
        f.loans[0].weeklyPayment = 1_000_000
        w.financeState = f
        w.runFinance()
        #expect(w.business.closedWeek == nil)
        #expect(w.finance.loans.isEmpty)
    }

    @Test func payOffNeedsCash() throws {
        var w = try studio()
        try w.takeBankLoan(amount: 20_000, years: 1)
        var b = w.business
        b.record(w.week, -(b.cash - 100), "Spend")
        w.businessState = b
        #expect(fails { try w.payOffLoan(1) })
        b.record(w.week, 50_000, "Cash")
        w.businessState = b
        try w.payOffLoan(1)
        #expect(w.finance.loans.isEmpty)
    }

    @Test func advanceNeedsRecentSales() throws {
        let w = try studio()
        #expect(w.advanceOffer == nil)
        let old = try studio(perWeek: 1_000, weeks: 5)
        #expect(old.advanceOffer?.maxAdvance == 15_000)
    }

    @Test func advanceMultipleDependsOnHistory() throws {
        let young = try studio(perWeek: 1_000, weeks: 20)
        let old = try studio(perWeek: 1_000, weeks: 53)
        #expect(young.advanceOffer?.multiple == 1.6)
        #expect(old.advanceOffer?.multiple == 1.3)
        #expect(old.advanceOffer?.maxAdvance == 39_000)
    }

    @Test func advancePaysTheFeeAndTakesAShare() throws {
        var w = try studio(perWeek: 1_000, weeks: 53)
        let cash = w.business.cash
        try w.takeAdvance(amount: 10_000)
        #expect(w.business.cash == cash + 10_000 * 0.96)
        #expect(w.finance.advance?.total == 13_000)
        #expect(w.advanceOffer == nil)
        let before = w.business.cash
        w.runFinance()
        #expect(abs(w.business.cash - (before - 120)) < 1e-9)
        #expect(abs((w.finance.advance?.owed ?? 0) - 12_880) < 1e-9)
    }

    @Test func advanceEndsWhenRepaid() throws {
        var w = try studio(perWeek: 1_000, weeks: 53)
        try w.takeAdvance(amount: 1_000)
        var f = w.finance
        f.advance?.owed = 50
        w.financeState = f
        w.runFinance()
        #expect(w.finance.advance == nil)
    }

    @Test func noSalesWeekCostsNothingForAdvance() throws {
        var w = try studio(perWeek: 1_000, weeks: 53)
        try w.takeAdvance(amount: 1_000)
        w.week += 1
        let cash = w.business.cash
        w.runFinance()
        #expect(w.business.cash == cash)
    }

    @Test func investorOfferHasAFloor() throws {
        let w = try studio()
        #expect(w.investorOffer == max(25_000, (2 * w.fanBase).rounded(.down)))
    }

    @Test func investorOfferGrowsWithSales() throws {
        let w = try studio(perWeek: 100_000)
        #expect(w.investorOffer >= 1.5 * 5_200_000)
    }

    @Test func investorsStopAt49Percent() throws {
        var w = try studio()
        for _ in 0..<4 { try w.acceptInvestor() }
        #expect(abs(w.finance.investorShare - 0.4) < 1e-9)
        #expect(!w.investorRoom)
        #expect(fails { try w.acceptInvestor() })
    }

    @Test func investorsGetAShareOfProfit() throws {
        var w = try studio()
        try w.acceptInvestor()
        var b = w.business
        b.record(w.week, 10_000, "Shipment", kind: .sales)
        b.record(w.week, -2_000, "Marketing")
        w.businessState = b
        let cash = w.business.cash
        w.runFinance()
        let rent = w.space.weeklyRent
        let expected = (10_000 - 2_000 - rent) * 0.1
        #expect(abs(w.business.cash - (cash - expected)) < 1e-6)
        #expect(w.business.ledger.last?.note == "Investor payout")
    }

    @Test func investorsGetNothingFromALoss() throws {
        var w = try studio()
        try w.acceptInvestor()
        var b = w.business
        b.record(w.week, -500, "Marketing")
        w.businessState = b
        let cash = w.business.cash
        w.runFinance()
        #expect(w.business.cash == cash)
    }

    @Test func fundingLinesAndDeveloperCashAreNotCosts() throws {
        var w = try studio()
        try w.acceptInvestor()
        var b = w.business
        b.record(w.week, 5_000, "Shipment", kind: .sales)
        b.record(w.week, -3_000, "Loan payment", kind: .funding)
        w.businessState = b
        let cash = w.business.cash
        w.runFinance()
        #expect(abs(w.business.cash - (cash - (5_000 - w.space.weeklyRent) * 0.1)) < 1e-6)
    }

    @Test func crowdfundNeedsADraftWithACard() throws {
        var (w, set, _) = try Fixture.studio()
        #expect(fails { try w.launchCrowdfund(set, goal: 5_000, pledge: 60) })
        var (w2, set2) = try draftWithCard()
        #expect(fails { try w2.launchCrowdfund(set2, goal: 1_000, pledge: 60) })
        #expect(fails { try w2.launchCrowdfund(set2, goal: 5_000, pledge: 200) })
        try w2.launchCrowdfund(set2, goal: 5_000, pledge: 60)
        #expect(fails { try w2.launchCrowdfund(set2, goal: 5_000, pledge: 60) })
    }

    @Test func crowdfundReachesItsGoal() throws {
        var (w, set) = try draftWithCard()
        var m = w.market
        for a in Audience.allCases { m.addReach(a, people: 1e9) }
        w.marketState = m
        try w.launchCrowdfund(set, goal: 5_000, pledge: 60)
        let cash = w.business.cash
        for _ in 0..<3 { w.runFinance() }
        #expect(w.finance.campaign?.weeksRun == 3)
        #expect(w.business.cash == cash)
        w.runFinance()
        let backers = w.finance.backed[set]?.backers ?? 0
        #expect(backers > 0)
        #expect(w.finance.campaign == nil)
        #expect(abs(w.business.cash - (cash + Double(backers) * 60 * 0.92)) < 1e-6)
        let boxSize = w.catalog.set(set)?.pack.boxSize ?? 0
        #expect(w.backerPacks(set) == backers * boxSize)
    }

    @Test func crowdfundMissCostsGoodwill() throws {
        var (w, set) = try draftWithCard()
        try w.launchCrowdfund(set, goal: 500_000, pledge: 60)
        let cash = w.business.cash
        let goodwill = w.market.state(.chaseCollectors).goodwill
        for _ in 0..<4 { w.runFinance() }
        #expect(w.business.cash == cash)
        #expect(w.finance.backed[set] == nil)
        #expect(w.market.state(.chaseCollectors).goodwill == goodwill - 8)
        #expect(w.backerPacks(set) == 0)
    }

    @Test func backersWaitingTooLongGetAngryOnce() throws {
        var (w, set) = try draftWithCard()
        var f = Finance()
        f.backed[set] = Backing(backers: 100, endWeek: 10, served: false, angry: false)
        w.financeState = f
        w.week = 61
        let goodwill = w.market.state(.artCollectors).goodwill
        w.runFinance()
        #expect(w.market.state(.artCollectors).goodwill == goodwill)
        w.week = 62
        w.runFinance()
        #expect(w.market.state(.artCollectors).goodwill == goodwill - 20)
        w.runFinance()
        #expect(w.market.state(.artCollectors).goodwill == goodwill - 20)
    }

    @Test func releaseServesTheBackers() throws {
        var (w, set) = try draftWithCard()
        var f = Finance()
        f.backed[set] = Backing(backers: 100, endWeek: 10, served: false, angry: false)
        w.financeState = f
        #expect(w.backerPacks(set) > 0)
        let i = w.catalog.sets.firstIndex { $0.id == set }!
        w.catalog.sets[i].status = .released
        w.runFinance()
        #expect(w.finance.backed[set]?.served == true)
        #expect(w.backerPacks(set) == 0)
    }

    @Test func aClosedStudioPaysNothing() throws {
        var w = try studio()
        try w.acceptInvestor()
        var b = w.business
        b.closedWeek = w.week
        b.record(w.week, 10_000, "Shipment", kind: .sales)
        w.businessState = b
        let cash = w.business.cash
        w.runFinance()
        #expect(w.business.cash == cash)
    }

    @Test func oldSavesDecode() throws {
        let f = try JSONDecoder().decode(Finance.self, from: Data("{}".utf8))
        #expect(f == Finance())
        let w = try studio()
        #expect(w.finance == Finance())
        #expect(w.backerPacks(SetID()) == 0)
    }

    @Test func aWorldWithNoFundingStaysUntouched() throws {
        var w = try studio()
        w.runFinance()
        #expect(w.financeState == nil)
    }

    @Test func stateRoundTrips() throws {
        var w = try studio(perWeek: 1_000, weeks: 53)
        try w.takeBankLoan(amount: 5_000, years: 1)
        try w.takeAdvance(amount: 2_000)
        try w.acceptInvestor()
        let data = try JSONEncoder().encode(w.finance)
        #expect(try JSONDecoder().decode(Finance.self, from: data) == w.finance)
    }
}
