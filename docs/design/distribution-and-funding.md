# Distribution and funding

Status: designed on 2026-11-15. Decisions N1 to N4 and F1 to F4 in `docs/decisions.md`.

AJ's words: "Let's build the distributors retailers and loans." AJ chose: stock reaches the stores by orders, and the studio can also hold stock back for its own web store ("Both"). All four channels: hobby stores, big-box retail, a web store, and a distributor. All four funding tools: bank loans, revenue-based financing, crowdfunds, and investors. A missed loan payment gives late fees, then a default.

The numbers are first values. AJ tunes them later. Research facts: `docs/research.md`, section 5.

## Part 1. Distribution (N1 to N4)

### 1.1 Channels

| Channel | Who shops there (weight by audience) | The studio gets | Notes |
|---|---|---|---|
| Hobby stores | Competitive 1.0, completionists 1.0, chase 0.8, art 0.8, investors 0.5, teens 0.5, casual 0.4, kids 0.1, parents 0.1 | 38% of the pack price with a distributor, 45% direct | Small orders, loyal. Without a distributor, the studio reaches only 40% of the hobby demand |
| Big-box retail | Kids 1.0, parents 1.0, casual 0.9, teens 0.7, chase 0.4, investors 0.4, completionists 0.3, competitive 0.2, art 0.2 | 38% | Only with a distributor. Scalpers hit it. It drops the studio after a weak set |
| Web store | Every audience 0.15, chase and investors 0.3 | 70% | Sells from the studio's warehouse. Only people who know the studio. Bots hit hot drops |

- For each audience, the channel shares are the weights above, normalized to 1. With no distributor, big-box has no share, and the hobby share is × 0.4. The rest of that audience's demand is lost, except the part that goes to the web store (see 1.4).
- Resellers buy from big-box and the web store, not from hobby stores.

### 1.2 The distributor (N2)

- A contract on the Distributors and retailers screen: "Sign with a distributor" and "End the contract". Signing and ending are free. The contract changes future orders, not stock that is already shipped.
- With a distributor: hobby and big-box both order, and the studio gets 38%.
- Without a distributor (the start): the studio sells direct to hobby stores at 45%, but it reaches only 40% of hobby demand. Big-box does not order.

### 1.3 Orders and shipment (N1)

- **Hold back.** The release plan has a new control: "Hold back for the web store", 0% to 50% of the print run, in steps of 5%. Held-back packs stay in the warehouse.
- **Orders.** When the player schedules a release, each store channel orders packs:
  - Expected packs for the channel = Σ over audiences of (the audience's demand in the set's first 8 weeks ÷ the pack price × the channel's share of that audience).
  - The first-8-weeks demand of an audience = its `lifetimeDollars` from `setDemand` × the sum of `Rhythm.weight(audience, week:)` for weeks 0 to 7.
  - Order = expected packs × the channel's trust, rounded down to whole boxes.
  - The orders cannot be more than the print run minus the held-back packs minus the backer packs (F3). When they are more, each channel gets the same share of what is there (an allocation). The news reports the shortage.
- **Shipment.** In the release week, the orders go to the channels. The studio is paid then: shipped packs × the pack price × the channel's share. The ledger line is "Shipment: <set>, <channel>", with the kind `sales`.
- **No returns.** Unsold packs stay in the channel's stores and keep selling.
- **Reorders.** Each week after the release, when a channel's stock is below its demand of the next 4 weeks, it reorders from the warehouse, up to that demand × trust. The studio is paid at once.
- **The warehouse.** Packs that no channel ordered, held-back packs, and reprints stay in the warehouse. Storage costs $20 for each pallet (3,600 packs) each month, paid each week: "Storage".

### 1.4 Sales each week

- Each audience's demand in packs (the present engine) splits into the channels by the shares in 1.1.
- Each channel sells from its own stock. Demand that a store channel cannot fill goes to the web store at 30%, if the warehouse has stock and the web store is open. The rest is missed.
- The web store is paid at sale: sold packs × the pack price × 70%. Ledger: "Web store: <set>", kind `sales`.
- Store channels do not pay at sale: they paid at shipment.
- `WeekSales.sold` stays the fans' packs across all channels, so the fan wallet, word of mouth, and awareness stay as they are. `WeekSales.revenue` is the studio's money of the week from this set: shipments, reorders, and the web store.
- Shelf reach comes from the packs in the hobby and big-box stores, not from the warehouse.
- `SetRelease.stockPacks` stays the total of unsold packs: stores plus the warehouse. So singles (`packsInWorld`) still work.

### 1.5 Trust (N3)

- Each store channel has a trust, 0.2 to 1.5. Start: hobby 0.6, big-box 0.4.
- In week 12 of a set's life, each channel looks at its sell-through: sold ÷ received.
  - At least 85%: trust + 0.15. News: "<channel> sold out of <set> and will order more next time."
  - Below 50%: trust − 0.15. Big-box below 40%: trust − 0.3, and the news says that big-box cut the studio.
- A channel with trust below 0.25 orders nothing.

### 1.6 Store limits (N4)

- When resellers take 25% or more of a big-box drop (B7), big-box sets store limits for the set: the reseller share in big-box is half as large for the rest of the set's life. News: "Big-box stores limit <set> to 2 packs a person."

### 1.7 Screens

- Business → Distributors and retailers: the distributor contract, each channel's trust as a phrase (with the hidden number under "Show the hidden numbers"), the share that the studio gets, and the warehouse packs of each set.
- The release plan: "Hold back for the web store", the expected orders for each channel, and the money from the shipment.
- The set's sales screen: sold and stock for each channel, and the warehouse.

## Part 2. Funding (F1 to F4)

All funding lives in `Finance.swift`, in `World.financeState`. The weekly step `runFinance()` runs after sales and before the weekly costs.

### 2.1 Bank loans (F1)

- **Limit.** $20,000 + 25% of the studio's sales revenue of the last 52 weeks (the ledger lines of kind `sales`), minus the balance of open bank loans.
- **Rate.** Prime 7% + a spread: 6.5% under $50,000, 5% under $250,000, 3% above. Fixed for the loan.
- **Term.** 1, 2, 3, or 5 years.
- **Payment.** Weekly, amortized: payment = P × r ÷ (1 − (1 + r)^−n), with r = the rate ÷ 52 and n = years × 52.
- **Early payoff.** The player can pay the rest at any time, with no fee.

### 2.2 Revenue-based financing (F2)

- **Offer.** Only with sales in the last 13 weeks. The advance is up to 3 × the sales revenue of the last 13 weeks.
- **Cost.** A 4% fee from the advance. The repayment total is the advance × a multiple: 1.3 with 52 or more weeks of sales history, 1.6 with less.
- **Payment.** 12% of each week's sales revenue, until the total is repaid. A week with no sales costs nothing.
- One RBF advance at a time.

### 2.3 Crowdfunds (F3)

- **Launch.** For a draft set with at least one designed card. The player picks the goal ($5,000 to $500,000) and the pledge for each backer ($30 to $150). The campaign runs 4 weeks. One campaign at a time.
- **Backers.** Each week: Σ over audiences of reached people × the audience's crowdfund affinity × 0.04 × an appeal factor ÷ (pledge ÷ 60)^1.2.
  - Affinity: chase 1.0, completionists 1.0, art 0.8, investors 0.6, competitive 0.5, teens 0.3, casual 0.2, kids 0, parents 0.1, resellers 0.
  - Appeal factor: the average of the set's demand factor products for chase collectors and completionists, at the default pack price (the `setDemand` product, between 0.3 and 3).
  - The campaign also adds reach: 20% of the week's backers as new people, as chase collectors and completionists.
- **The end (week 4).** If the pledges reach the goal: the studio gets the pledges minus a 8% platform fee. Ledger: "Crowdfund: <set>", kind `funding`. The set now owes each backer one box (the set's box size in packs).
  - At the release, the backer packs leave the print run before the orders. They count as packs that fans opened, with no money (the backers paid already).
  - The release plan cannot schedule a print run smaller than the backer packs.
  - If the set does not release within 52 weeks after the campaign, the backers are angry: goodwill −20 for chase collectors, completionists, and art collectors, once.
- **A miss.** If the pledges do not reach the goal, the studio gets nothing. Goodwill −8 for chase collectors and completionists. News.
- `backerPacks(setID)` returns the packs that the set owes its backers. Distribution reads it.

### 2.4 Investors (F4)

- **Offer.** An investor offers cash for a share of the weekly profit, forever. Offer for each 10% share: max($25,000, 1.5 × the sales revenue of the last 52 weeks + $2 × the fan base). The total investor share cannot go above 49%.
- **Payout.** Each week, the investors get their share × the week's profit, when the profit is above zero. Profit = the week's sales revenue − the week's costs (rent, salaries, storage, marketing, art, print, loan interest). Ledger: "Investor payout".
- **Buyback.** None. A share is forever.

### 2.5 Missed payments (F1)

- When the cash is below a bank loan's weekly payment, the payment is missed. A late fee of 5% of the payment goes on the balance. News warning.
- After 3 missed payments in a row, the bank calls the loan: the whole balance is due at once. If the cash covers it, the studio pays it. If not, the studio closes (`closedWeek`), with the news "The bank called the loan. The studio closed."
- A paid week sets the count back to 0.
- RBF and investors never miss: they take a share of what comes in.

### 2.6 Screens

- Business → Lenders and backers: the open loans (balance, weekly payment, rate, weeks left, missed payments), and the offers: a bank loan (amount within the limit, term, rate, weekly payment, then "Take the loan"), the RBF offer, the investor offer, and a crowdfund launcher for a draft set with the live progress of a running campaign.
- The developer tool "Add $50,000" stays under Settings → Developer tools.
