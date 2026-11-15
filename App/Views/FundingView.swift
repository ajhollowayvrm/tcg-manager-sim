import SwiftUI
import SimCore

/// Business → Lenders and backers (F1 to F4).
struct FundingView: View {
    @Environment(GameStore.self) private var store
    @State private var loanAmount = 10_000.0
    @State private var loanYears = 2
    @State private var advanceAmount = 0.0
    @State private var crowdSet: SetID?
    @State private var goal = 20_000.0
    @State private var pledge = 60.0
    @State private var message: String?

    var body: some View {
        List {
            if let world = store.world {
                Section {
                    LabeledContent("Cash", value: Money.text(world.business.cash))
                    if let message { Text(message).foregroundStyle(.red) }
                }
                openSection(world)
                loanSection(world)
                advanceSection(world)
                investorSection(world)
                crowdfundSection(world)
            }
        }
        .navigationTitle("Lenders and backers")
    }

    private func show(_ result: String?) { message = result }

    // MARK: - Open money

    @ViewBuilder private func openSection(_ world: World) -> some View {
        let finance = world.finance
        if !finance.loans.isEmpty {
            Section("Your loans") {
                ForEach(finance.loans) { loan in
                    VStack(alignment: .leading, spacing: 4) {
                        LabeledContent("Balance", value: Money.text(loan.balance))
                        LabeledContent("Weekly payment", value: Money.text(loan.weeklyPayment))
                        LabeledContent("Rate", value: String(format: "%.1f%% a year", loan.rate * 100))
                        LabeledContent("Weeks left", value: loan.weeksLeft.formatted())
                        LabeledContent("Missed payments", value: loan.missed.formatted())
                        Button("Pay off for \(Money.text(loan.balance))") { show(store.payOffLoan(loan.id)) }
                            .disabled(world.business.cash < loan.balance)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        if let advance = finance.advance {
            Section("Your revenue advance") {
                LabeledContent("Still owed", value: Money.text(advance.owed))
                LabeledContent("Repayment total", value: Money.text(advance.total))
                Text("You pay 12% of each week's sales until you repay the total.").font(.caption).foregroundStyle(.secondary)
            }
        }
        if finance.investorShare > 0 {
            Section("Your investors") {
                LabeledContent("Share of the weekly profit", value: "\(Int((finance.investorShare * 100).rounded()))%")
            }
        }
    }

    // MARK: - Bank loan

    private func loanSection(_ world: World) -> some View {
        let limit = world.bankLoanLimit
        let top = max(Finance.minLoan, limit)
        let amount = min(max(loanAmount, Finance.minLoan), top)
        let quote = world.bankLoanQuote(amount: amount, years: loanYears)
        return Section {
            LabeledContent("The bank lends you", value: Money.text(limit))
            if limit >= Finance.minLoan {
                Stepper(value: Binding(get: { amount }, set: { loanAmount = $0 }), in: Finance.minLoan...top, step: 1_000) {
                    LabeledContent("Amount", value: Money.text(amount))
                }
                Picker("Term", selection: $loanYears) {
                    ForEach(Finance.loanTerms, id: \.self) { Text($0 == 1 ? "1 year" : "\($0) years").tag($0) }
                }
                LabeledContent("Rate", value: String(format: "%.1f%% a year", quote.rate * 100))
                LabeledContent("Weekly payment", value: Money.text(quote.weeklyPayment))
                Button("Take the loan") { show(store.takeBankLoan(amount: amount, years: loanYears)) }
            }
        } header: {
            Text("Bank loan")
        } footer: {
            Text("A missed payment adds a late fee. After 3 missed payments in a row, the bank calls the loan. If you cannot pay it, the studio closes.")
        }
    }

    // MARK: - Revenue advance

    @ViewBuilder private func advanceSection(_ world: World) -> some View {
        Section {
            if let offer = world.advanceOffer {
                let low = min(1_000, offer.maxAdvance)
                let amount = min(max(advanceAmount == 0 ? offer.maxAdvance : advanceAmount, low), offer.maxAdvance)
                Stepper(value: Binding(get: { amount }, set: { advanceAmount = $0 }), in: low...offer.maxAdvance, step: 1_000) {
                    LabeledContent("Advance", value: Money.text(amount))
                }
                LabeledContent("Fee (4%)", value: Money.text(amount * offer.feeRate))
                LabeledContent("You repay", value: Money.text(amount * offer.multiple))
                Button("Take the advance") { show(store.takeAdvance(amount: amount)) }
            } else if world.finance.advance == nil {
                Text("You need sales in the last 13 weeks.").foregroundStyle(.secondary)
            } else {
                Text("You have an open advance. Repay it first.").foregroundStyle(.secondary)
            }
        } header: {
            Text("Revenue advance")
        } footer: {
            Text("You pay 12% of each week's sales. A week with no sales costs nothing.")
        }
    }

    // MARK: - Investors

    private func investorSection(_ world: World) -> some View {
        Section {
            if world.investorRoom {
                LabeledContent("Cash for 10%", value: Money.text(world.investorOffer))
                Button("Accept the investor") { show(store.acceptInvestor()) }
            } else {
                Text("Investors own 49% already. No more shares are for sale.").foregroundStyle(.secondary)
            }
        } header: {
            Text("Investors")
        } footer: {
            Text("An investor takes 10% of each week's profit, forever. You cannot buy a share back.")
        }
    }

    // MARK: - Crowdfund

    @ViewBuilder private func crowdfundSection(_ world: World) -> some View {
        let finance = world.finance
        if let campaign = finance.campaign {
            Section("Crowdfund") {
                LabeledContent("Set", value: world.catalog.set(campaign.setID)?.name ?? "")
                LabeledContent("Week", value: "\(campaign.weeksRun) of \(Crowdfund.weeks)")
                LabeledContent("Backers", value: Int(campaign.backers).formatted())
                LabeledContent("Pledged", value: "\(Money.text(campaign.pledged)) of \(Money.text(campaign.goal))")
                ProgressView(value: min(1, campaign.pledged / campaign.goal))
            }
        } else {
            let drafts = world.catalog.sets.filter { $0.status == .draft && finance.backed[$0.id] == nil && !world.catalog.cards(in: $0.id).isEmpty }
            Section {
                if drafts.isEmpty {
                    Text("You need a draft set with at least one card.").foregroundStyle(.secondary)
                } else {
                    let chosen = drafts.first { $0.id == crowdSet } ?? drafts[0]
                    Picker("Set", selection: Binding(get: { chosen.id }, set: { crowdSet = $0 })) {
                        ForEach(drafts) { Text($0.name).tag($0.id) }
                    }
                    Stepper(value: $goal, in: Finance.goalRange, step: 5_000) {
                        LabeledContent("Goal", value: Money.text(goal))
                    }
                    Stepper(value: $pledge, in: Finance.pledgeRange, step: 10) {
                        LabeledContent("Pledge for each backer", value: Money.text(pledge))
                    }
                    let weekly = world.expectedBackersPerWeek(chosen.id, pledge: pledge)
                    LabeledContent("Expected backers a week", value: "about \(Int(weekly.rounded()).formatted())")
                    Button("Launch the crowdfund") { show(store.launchCrowdfund(chosen.id, goal: goal, pledge: pledge)) }
                }
            } header: {
                Text("Crowdfund")
            } footer: {
                Text("A campaign runs 4 weeks. If you reach the goal, you get the pledges minus an 8% fee, and you owe each backer one box when the set releases. If you miss, you get nothing.")
            }
        }
        let owed = finance.backed.filter { !$0.value.served }
        if !owed.isEmpty {
            Section("Backers waiting for boxes") {
                ForEach(owed.keys.sorted { $0.hashValue < $1.hashValue }, id: \.self) { id in
                    LabeledContent(world.catalog.set(id)?.name ?? "A set", value: "\(owed[id]?.backers.formatted() ?? "0") backers")
                }
            }
        }
    }
}

#Preview {
    NavigationStack { FundingView() }
        .environment(GameStore(preview: .sample()))
}
