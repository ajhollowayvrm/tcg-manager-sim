// Funding: bank loans, revenue-based financing, crowdfunds, and investors
// (docs/design/distribution-and-funding.md, part 2; decisions F1 to F4).

import Foundation

/// One bank loan (F1). The rate is fixed for the loan.
public struct BankLoan: Codable, Sendable, Equatable, Identifiable {
    public let id: Int
    public let principal: Double
    /// The yearly rate, for example 0.135.
    public let rate: Double
    public internal(set) var weeklyPayment: Double
    public internal(set) var balance: Double
    /// Payments left on the plan.
    public internal(set) var weeksLeft: Int
    /// Missed payments in a row (F1).
    public internal(set) var missed: Int
    public let startWeek: Int
}

/// One revenue-based advance (F2).
public struct RevenueAdvance: Codable, Sendable, Equatable {
    public let advance: Double
    /// The advance times the multiple.
    public let total: Double
    public internal(set) var owed: Double
    public let startWeek: Int
}

/// A running crowdfund campaign (F3).
public struct Crowdfund: Codable, Sendable, Equatable {
    public let setID: SetID
    public let goal: Double
    public let pledge: Double
    public let startWeek: Int
    public internal(set) var weeksRun: Int
    public internal(set) var backers: Double

    public static let weeks = 4
    public var pledged: Double { backers.rounded(.down) * pledge }
}

/// The backers of a funded set (F3).
public struct Backing: Codable, Sendable, Equatable {
    public let backers: Int
    public let endWeek: Int
    /// True after the set released and the backers got their packs.
    public internal(set) var served: Bool
    /// True after the backers got angry about the delay. It happens once.
    public internal(set) var angry: Bool
}

/// A bank loan offer for one amount and term.
public struct LoanQuote: Sendable, Equatable {
    public let amount: Double
    public let years: Int
    public let rate: Double
    public let weeklyPayment: Double
}

/// An RBF offer.
public struct AdvanceOffer: Sendable, Equatable {
    public let maxAdvance: Double
    /// The repayment total divided by the advance.
    public let multiple: Double
    public let feeRate: Double
}

/// The studio's loans, advances, campaigns, and investors.
public struct Finance: Codable, Sendable, Equatable {
    public internal(set) var loans: [BankLoan] = []
    var nextLoanID: Int = 1
    public internal(set) var advance: RevenueAdvance?
    public internal(set) var campaign: Crowdfund?
    public internal(set) var backed: [SetID: Backing] = [:]
    /// The total share of the weekly profit that investors own, 0 to 0.49.
    public internal(set) var investorShare: Double = 0

    public init() {}

    private enum Keys: String, CodingKey { case loans, nextLoanID, advance, campaign, backed, investorShare }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        loans = try c.decodeIfPresent([BankLoan].self, forKey: .loans) ?? []
        nextLoanID = try c.decodeIfPresent(Int.self, forKey: .nextLoanID) ?? 1
        advance = try c.decodeIfPresent(RevenueAdvance.self, forKey: .advance)
        campaign = try c.decodeIfPresent(Crowdfund.self, forKey: .campaign)
        backed = try c.decodeIfPresent([SetID: Backing].self, forKey: .backed) ?? [:]
        investorShare = try c.decodeIfPresent(Double.self, forKey: .investorShare) ?? 0
    }

    public var openBalance: Double { loans.reduce(0) { $0 + $1.balance } }

    public static let prime = 0.07
    public static let loanTerms = [1, 2, 3, 5]
    public static let minLoan = 1_000.0
    public static let latePenalty = 0.05
    public static let missesToCall = 3
    public static let advanceFee = 0.04
    public static let advanceShare = 0.12
    public static let platformFee = 0.08
    public static let maxInvestorShare = 0.49
    public static let investorStep = 0.1
    public static let goalRange = 5_000.0...500_000.0
    public static let pledgeRange = 30.0...150.0

    /// The yearly rate for a loan of this size (F1).
    public static func rate(for amount: Double) -> Double {
        prime + (amount < 50_000 ? 0.065 : amount < 250_000 ? 0.05 : 0.03)
    }

    /// The weekly payment of an amortized loan (F1).
    public static func payment(amount: Double, rate: Double, years: Int) -> Double {
        let r = rate / 52
        let n = Double(years * 52)
        return amount * r / (1 - pow(1 + r, -n))
    }

    /// The share of a crowdfund audience (F3). The campaign counts nobody it does not list.
    static func affinity(_ audience: Audience) -> Double {
        switch audience {
        case .chaseCollectors, .completionists: 1.0
        case .artCollectors: 0.8
        case .investors: 0.6
        case .competitivePlayers: 0.5
        case .teens, .nostalgiaAdults: 0.3
        case .casualPlayers: 0.2
        case .parents: 0.1
        case .kids, .resellers: 0
        }
    }
}

extension World {
    /// The funding state. A save from before funding starts with none.
    public var finance: Finance { financeState ?? Finance() }

    /// The packs that a funded set still owes its crowdfund backers (F3). Distribution reads it.
    /// It is 0 for a set with no campaign and for a set that already served its backers.
    public func backerPacks(_ setID: SetID) -> Int {
        guard let backing = finance.backed[setID], !backing.served,
              let set = catalog.set(setID) else { return 0 }
        return backing.backers * set.pack.boxSize
    }

    // MARK: - Offers

    /// The sales revenue of the last `weeks` weeks, this week included.
    func recentSales(weeks: Int) -> Double {
        business.salesRevenue(from: week - weeks + 1, to: week)
    }

    /// What the bank lends now (F1).
    public var bankLoanLimit: Double {
        max(0, 20_000 + 0.25 * recentSales(weeks: 52) - finance.openBalance)
    }

    /// The offer for one amount and term (F1).
    public func bankLoanQuote(amount: Double, years: Int) -> LoanQuote {
        let rate = Finance.rate(for: amount)
        return LoanQuote(amount: amount, years: years, rate: rate,
                         weeklyPayment: Finance.payment(amount: amount, rate: rate, years: years))
    }

    /// The RBF offer. Nil without sales in the last 13 weeks, or with an open advance (F2).
    public var advanceOffer: AdvanceOffer? {
        let recent = recentSales(weeks: 13)
        guard finance.advance == nil, recent > 0 else { return nil }
        let first = business.ledger.filter { $0.kind == .sales }.map(\.week).min() ?? week
        return AdvanceOffer(maxAdvance: (3 * recent).rounded(.down), multiple: week - first >= 52 ? 1.3 : 1.6,
                            feeRate: Finance.advanceFee)
    }

    /// The cash for each 10% share (F4).
    public var investorOffer: Double {
        max(25_000, 1.5 * recentSales(weeks: 52) + 2 * fanBase).rounded(.down)
    }

    /// True while another 10% share fits under the 49% limit (F4).
    public var investorRoom: Bool {
        finance.investorShare + Finance.investorStep <= Finance.maxInvestorShare + 1e-9
    }

    /// Backers each week for a pledge, at the present reach (F3).
    public func expectedBackersPerWeek(_ setID: SetID, pledge: Double) -> Double {
        let demand = setDemand(setID, packPrice: Pricing.defaultPackPrice)
        let products = [Audience.chaseCollectors, .completionists].map { a in demand.first { $0.audience == a }?.product ?? 1 }
        let appeal = min(3, max(0.3, products.reduce(0, +) / Double(products.count)))
        let reached = Audience.allCases.reduce(0) { $0 + market.state($1).reachedPeople * Finance.affinity($1) }
        return reached * 0.04 * appeal / pow(pledge / 60, 1.2)
    }

    // MARK: - Decisions

    public mutating func takeBankLoan(amount: Double, years: Int) throws(CardError) {
        guard Finance.loanTerms.contains(years) else { throw .badRelease("Pick a term of 1, 2, 3, or 5 years.") }
        guard amount >= Finance.minLoan else { throw .badRelease("The smallest loan is $1,000.") }
        guard amount <= bankLoanLimit else { throw .badRelease("The bank lends you $\(Int(bankLoanLimit).formatted()) at most.") }
        let quote = bankLoanQuote(amount: amount, years: years)
        var f = finance
        f.loans.append(BankLoan(id: f.nextLoanID, principal: amount, rate: quote.rate, weeklyPayment: quote.weeklyPayment,
                                balance: amount, weeksLeft: years * 52, missed: 0, startWeek: week))
        f.nextLoanID += 1
        var b = business
        b.record(week, amount, "Bank loan: $\(Int(amount).formatted()), \(years) \(years == 1 ? "year" : "years")", kind: .funding)
        businessState = b
        financeState = f
    }

    public mutating func payOffLoan(_ id: Int) throws(CardError) {
        var f = finance
        guard let i = f.loans.firstIndex(where: { $0.id == id }) else { throw .badRelease("That loan is closed already.") }
        let balance = f.loans[i].balance
        guard business.cash >= balance else { throw .badRelease("You need $\(Int(balance.rounded(.up)).formatted()) in cash to pay off this loan.") }
        var b = business
        b.record(week, -balance, "Loan payoff", kind: .funding)
        businessState = b
        f.loans.remove(at: i)
        financeState = f
    }

    public mutating func takeAdvance(amount: Double) throws(CardError) {
        guard let offer = advanceOffer else { throw .badRelease("No advance is on offer. You need sales in the last 13 weeks, and no open advance.") }
        guard amount >= min(1_000, offer.maxAdvance), amount <= offer.maxAdvance else {
            throw .badRelease("Take $\(Int(min(1_000, offer.maxAdvance)).formatted()) to $\(Int(offer.maxAdvance).formatted()).")
        }
        var f = finance
        f.advance = RevenueAdvance(advance: amount, total: amount * offer.multiple, owed: amount * offer.multiple, startWeek: week)
        var b = business
        b.record(week, amount, "Revenue advance", kind: .funding)
        b.record(week, -amount * offer.feeRate, "Revenue advance fee", kind: .funding)
        businessState = b
        financeState = f
    }

    public mutating func acceptInvestor() throws(CardError) {
        guard investorRoom else { throw .badRelease("Investors own 49% already. No more shares are for sale.") }
        let cash = investorOffer
        var f = finance
        f.investorShare += Finance.investorStep
        var b = business
        b.record(week, cash, "Investor: 10% of the weekly profit", kind: .funding)
        businessState = b
        financeState = f
    }

    public mutating func launchCrowdfund(_ setID: SetID, goal: Double, pledge: Double) throws(CardError) {
        guard let set = catalog.set(setID) else { throw .unknownSet(setID) }
        guard set.status == .draft else { throw .badRelease("Only a draft set can raise a crowdfund.") }
        guard !catalog.cards(in: setID).isEmpty else { throw .badRelease("Design at least one card first.") }
        guard finance.campaign == nil else { throw .badRelease("One campaign runs at a time.") }
        guard finance.backed[setID] == nil else { throw .badRelease("This set has backers already.") }
        guard Finance.goalRange.contains(goal) else { throw .badRelease("Set a goal from $5,000 to $500,000.") }
        guard Finance.pledgeRange.contains(pledge) else { throw .badRelease("Set a pledge from $30 to $150.") }
        var f = finance
        f.campaign = Crowdfund(setID: setID, goal: goal, pledge: pledge, startWeek: week, weeksRun: 0, backers: 0)
        financeState = f
    }

    // MARK: - The week

    /// The weekly funding step: payments, the RBF share, investor payouts, and campaigns.
    mutating func runFinance() {
        guard var f = financeState, business.closedWeek == nil else { return }
        var b = business
        var m = market
        var interestPaid = 0.0

        for i in f.loans.indices {
            var loan = f.loans[i]
            let interest = loan.balance * loan.rate / 52
            let payment = min(loan.weeklyPayment, loan.balance + interest)
            interestPaid += interest
            if b.cash >= payment {
                b.record(week, -payment, "Loan payment", kind: .funding)
                loan.balance = max(0, loan.balance + interest - payment)
                loan.weeksLeft = max(0, loan.weeksLeft - 1)
                loan.missed = 0
                if loan.balance < 0.005 { loan.balance = 0 }
            } else {
                let fee = loan.weeklyPayment * Finance.latePenalty
                loan.missed += 1
                loan.balance += interest + fee
                b.report(week, "You missed a loan payment of $\(Int(payment.rounded(.up)).formatted()). The bank added a late fee of $\(Int(fee.rounded(.up)).formatted()). Missed in a row: \(loan.missed).")
                if loan.missed >= Finance.missesToCall {
                    if b.cash >= loan.balance {
                        b.record(week, -loan.balance, "Loan called", kind: .funding)
                        b.report(week, "The bank called the loan. You paid $\(Int(loan.balance.rounded(.up)).formatted()).")
                        loan.balance = 0
                    } else {
                        b.closedWeek = week
                        b.report(week, "The bank called the loan. The studio closed.")
                        f.loans[i] = loan
                        businessState = b
                        financeState = f
                        return
                    }
                }
            }
            f.loans[i] = loan
        }
        f.loans.removeAll { $0.balance <= 0 }

        let revenue = b.salesRevenue(from: week, to: week)

        if var advance = f.advance {
            let pay = min(advance.owed, revenue * Finance.advanceShare)
            if pay > 0 {
                b.record(week, -pay, "Revenue share payment", kind: .funding)
                advance.owed -= pay
            }
            if advance.owed < 0.005 {
                f.advance = nil
                b.report(week, "You repaid the revenue advance.")
            } else {
                f.advance = advance
            }
        }

        if f.investorShare > 0 {
            let costs = b.ledger.reduce(0) { sum, e in
                e.week == week && e.amount < 0 && e.kind != .funding && e.note != "Developer cash" ? sum - e.amount : sum
            }
            let profit = revenue - costs - space.weeklyRent - market.insights.reduce(0) { $0 + $1.weeklySalary } - interestPaid
            if profit > 0 {
                b.record(week, -profit * f.investorShare, "Investor payout", kind: .funding)
            }
        }

        if var campaign = f.campaign {
            campaign.weeksRun += 1
            let added = expectedBackersPerWeek(campaign.setID, pledge: campaign.pledge)
            campaign.backers += added
            m.addReach(.chaseCollectors, people: added * 0.1)
            m.addReach(.completionists, people: added * 0.1)
            if campaign.weeksRun >= Crowdfund.weeks {
                f.campaign = nil
                let name = catalog.set(campaign.setID)?.name ?? "the set"
                if campaign.pledged >= campaign.goal {
                    b.record(week, campaign.pledged * (1 - Finance.platformFee), "Crowdfund: \(name)", kind: .funding)
                    f.backed[campaign.setID] = Backing(backers: Int(campaign.backers), endWeek: week, served: false, angry: false)
                    b.report(week, "The crowdfund for \(name) reached its goal with \(Int(campaign.backers).formatted()) backers.")
                } else {
                    m.changeGoodwill(.chaseCollectors, by: -8)
                    m.changeGoodwill(.completionists, by: -8)
                    b.report(week, "The crowdfund for \(name) missed its goal. You get no money. Collectors are unhappy.")
                }
            } else {
                f.campaign = campaign
            }
        }

        for (id, var backing) in f.backed where !backing.served {
            let status = catalog.set(id)?.status
            if status == .released {
                backing.served = true
                f.backed[id] = backing
            } else if !backing.angry, week >= backing.endWeek + 52 {
                backing.angry = true
                f.backed[id] = backing
                for a in [Audience.chaseCollectors, .completionists, .artCollectors] { m.changeGoodwill(a, by: -20) }
                b.report(week, "The backers of \(catalog.set(id)?.name ?? "a set") wait for their boxes. They are angry.")
            }
        }

        businessState = b
        marketState = m
        financeState = f
    }
}
