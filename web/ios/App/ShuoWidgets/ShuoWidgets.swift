import SwiftUI
import WidgetKit

/// One entry per minute: the time in characters and pinyin.
struct TimeEntry: TimelineEntry {
    let date: Date
}

struct TimeProvider: TimelineProvider {
    func placeholder(in context: Context) -> TimeEntry { TimeEntry(date: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (TimeEntry) -> Void) {
        completion(TimeEntry(date: Date()))
    }

    /// The next 3 hours, minute by minute (iOS then asks for more).
    func getTimeline(in context: Context, completion: @escaping (Timeline<TimeEntry>) -> Void) {
        let calendar = Calendar.current
        let now = Date()
        let startOfMinute = calendar.date(bySetting: .second, value: 0, of: now) ?? now
        let start = startOfMinute > now ? calendar.date(byAdding: .minute, value: -1, to: startOfMinute)! : startOfMinute
        let entries = (0..<180).compactMap { calendar.date(byAdding: .minute, value: $0, to: start) }.map(TimeEntry.init)
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

/// Calm paper palette, as in the app.
private let paper = Color(red: 0.969, green: 0.957, blue: 0.933)
private let ink = Color(red: 0.165, green: 0.157, blue: 0.145)
private let jade = Color(red: 0.243, green: 0.420, blue: 0.353)

struct ChineseTimeView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TimeEntry

    var body: some View {
        let said = ChineseTime.say(entry.date)
        switch family {
        case .accessoryInline:
            Text(said.hanzi)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(said.hanzi)
                    .font(.system(size: 20, weight: .semibold, design: .serif))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(said.pinyin)
                    .font(.system(size: 13))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .opacity(0.85)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 6) {
                Text("说").font(.system(size: 13, weight: .semibold, design: .serif)).foregroundColor(jade)
                Spacer(minLength: 0)
                Text(said.hanzi)
                    .font(.system(size: 26, weight: .semibold, design: .serif))
                    .foregroundColor(ink)
                    .minimumScaleFactor(0.5)
                    .lineLimit(2)
                Text(said.pinyin)
                    .font(.system(size: 12))
                    .foregroundColor(ink.opacity(0.65))
                    .minimumScaleFactor(0.6)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(2)
        }
    }
}

struct ChineseTimeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ChineseTime", provider: TimeProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                ChineseTimeView(entry: entry).containerBackground(for: .widget) { paper }
            } else {
                ChineseTimeView(entry: entry).padding().background(paper)
            }
        }
        .configurationDisplayName("Chinese time")
        .description("The time in characters and pinyin: 下午三点二十 · xiàwǔ sān diǎn èrshí.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .systemSmall])
    }
}

@main
struct ShuoWidgets: WidgetBundle {
    var body: some Widget {
        ChineseTimeWidget()
    }
}
