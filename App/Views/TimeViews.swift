import SwiftUI
import SimCore

// The passing of time: the time bar on every tab, the week report, and the toast (T1 to T3).

/// The bar above the tab bar: the date, the cash, the next event, and the Next week button (T1).
struct TimeBar: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let world = store.world {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(Market.calendar(week: world.week)) · week \(world.week)")
                        .font(.subheadline.weight(.semibold))
                        .contentTransition(.numericText(value: Double(world.week)))
                    HStack(spacing: 6) {
                        Text(Money.text(world.business.cash))
                            .font(.caption.monospacedDigit().weight(.semibold))
                            .foregroundStyle(world.business.cash < 0 ? .red : .primary)
                            .contentTransition(.numericText(value: world.business.cash))
                        if let next = world.nextEvent {
                            let weeks = next.week - world.week
                            Text("· \(next.text) in \(weeks) \(weeks == 1 ? "week" : "weeks")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .animation(.snappy, value: world.week)
                .animation(.snappy, value: world.business.cash)
                Spacer(minLength: 4)
                NextWeekButton()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.bar)
            .overlay(alignment: .top) { Divider() }
            .overlay(alignment: .top) { WeekToast().offset(y: -52) }
            .accessibilityElement(children: .contain)
            .sensoryFeedback(.impact(weight: .light), trigger: store.ticks)
            .sensoryFeedback(.success, trigger: store.bigTicks)
        }
    }
}

/// A quiet week: a short toast that closes by itself (T2).
struct WeekToast: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let toast = store.toast {
            Text(toast.weeks == 1 ? "Week \(toast.toWeek): a quiet week" : "Weeks \(toast.fromWeek) to \(toast.toWeek): quiet weeks")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.thinMaterial, in: Capsule())
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task(id: toast.id) {
                    try? await Task.sleep(for: .seconds(1.4))
                    withAnimation { if store.toast?.id == toast.id { store.toast = nil } }
                }
        }
    }
}

/// The report card after a week with news or sales (T2).
struct WeekReportView: View {
    @Environment(GameStore.self) private var store
    let report: WeekReport

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(report.weeks == 1 ? "Week \(report.toWeek)" : "Weeks \(report.fromWeek) to \(report.toWeek)")
                    .font(.title2.bold())
                Spacer()
                Text(Market.calendar(week: report.toWeek)).font(.subheadline).foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                stat("Cash", Money.text(report.cash),
                     detail: (report.cashChange >= 0 ? "+" : "") + Money.text(report.cashChange),
                     color: report.cashChange >= 0 ? .green : .red)
                stat("Packs sold", Money.packs(report.packsSold), detail: report.weeks == 1 ? "this week" : "in \(report.weeks) weeks", color: .secondary)
            }
            if !report.news.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(report.news.suffix(3).reversed().enumerated()), id: \.offset) { _, line in
                        Label(line, systemImage: "newspaper.fill")
                            .font(.subheadline)
                            .labelStyle(.titleAndIcon)
                    }
                    if report.news.count > 3 {
                        Text("And \(report.news.count - 3) more in the Market tab's news.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer(minLength: 0)
            Button {
                store.report = nil
            } label: {
                Text("Continue").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(20)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private func stat(_ title: String, _ value: String, detail: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.monospacedDigit().weight(.semibold))
            Text(detail).font(.caption.monospacedDigit()).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

extension View {
    /// The time bar under the content of a tab (T1).
    func timeBar() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { TimeBar() }
    }
}
