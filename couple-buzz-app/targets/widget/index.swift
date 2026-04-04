import WidgetKit
import SwiftUI

struct CoupleEntry: TimelineEntry {
    let date: Date
    let partnerEmoji: String
    let partnerActionTime: String
    let streak: Int
    let partnerName: String
}

struct Provider: TimelineProvider {
    let defaults = UserDefaults(suiteName: "group.com.couplebuzz.app")

    func placeholder(in context: Context) -> CoupleEntry {
        CoupleEntry(date: Date(), partnerEmoji: "💕", partnerActionTime: "", streak: 0, partnerName: "ta")
    }

    func getSnapshot(in context: Context, completion: @escaping (CoupleEntry) -> ()) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CoupleEntry>) -> ()) {
        let entry = makeEntry()
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(900)))
        completion(timeline)
    }

    private func makeEntry() -> CoupleEntry {
        let emoji = defaults?.string(forKey: "partnerLastEmoji") ?? "💕"
        let time = defaults?.string(forKey: "partnerLastActionTime") ?? ""
        let streak = defaults?.integer(forKey: "streak") ?? 0
        let name = defaults?.string(forKey: "partnerName") ?? "ta"
        return CoupleEntry(date: Date(), partnerEmoji: emoji, partnerActionTime: time, streak: streak, partnerName: name)
    }
}

struct CoupleWidgetView: View {
    let entry: CoupleEntry

    var body: some View {
        VStack(spacing: 6) {
            Text(entry.partnerEmoji)
                .font(.system(size: 36))

            Text(entry.partnerName)
                .font(.caption)
                .foregroundColor(.secondary)

            if !entry.partnerActionTime.isEmpty {
                Text(entry.partnerActionTime)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            if entry.streak > 0 {
                Text("🔥 \(entry.streak)天")
                    .font(.caption)
                    .foregroundColor(.orange)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 1.0, green: 0.96, blue: 0.96))
    }
}

@main
struct CoupleWidget: Widget {
    let kind: String = "CoupleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CoupleWidgetView(entry: entry)
        }
        .configurationDisplayName("香宝聚集地")
        .description("查看 ta 的最新动态")
        .supportedFamilies([.systemSmall])
    }
}
