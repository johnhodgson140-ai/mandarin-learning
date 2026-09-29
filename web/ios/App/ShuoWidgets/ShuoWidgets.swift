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

// ---- Date and word of the day: one entry per day ----

struct DayEntry: TimelineEntry {
    let date: Date
}

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) { completion(DayEntry(date: Date())) }

    /// Today, then the next midnight (iOS asks again after that).
    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let calendar = Calendar.current
        let tomorrow = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: Date())!)
        completion(Timeline(entries: [DayEntry(date: Date()), DayEntry(date: tomorrow)], policy: .atEnd))
    }
}

struct ChineseDateView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DayEntry

    var body: some View {
        let d = ChineseTime.date(entry.date)
        switch family {
        case .accessoryInline:
            Text("\(d.date) \(d.weekday)")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("\(d.date) \(d.weekday)")
                    .font(.system(size: 20, weight: .semibold, design: .serif))
                    .minimumScaleFactor(0.6).lineLimit(1)
                Text(d.pinyin).font(.system(size: 13)).minimumScaleFactor(0.6).lineLimit(1).opacity(0.85)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 4) {
                Text(d.weekday).font(.system(size: 15, weight: .semibold, design: .serif)).foregroundColor(jade)
                Spacer(minLength: 0)
                Text(d.date).font(.system(size: 28, weight: .semibold, design: .serif)).foregroundColor(ink)
                    .minimumScaleFactor(0.5).lineLimit(1)
                Text(d.pinyin).font(.system(size: 11)).foregroundColor(ink.opacity(0.65)).minimumScaleFactor(0.6).lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(2)
        }
    }
}

struct ChineseDateWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ChineseDate", provider: DayProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                ChineseDateView(entry: entry).containerBackground(for: .widget) { paper }
            } else {
                ChineseDateView(entry: entry).padding().background(paper)
            }
        }
        .configurationDisplayName("Chinese date")
        .description("Today's date in characters and pinyin: 九月二十九日 星期二.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .systemSmall])
    }
}

struct WordOfDayView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DayEntry
    private let words = DeckWord.all()

    var body: some View {
        if let w = DeckWord.of(entry.date, in: words) {
            switch family {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(w.hanzi).font(.system(size: 20, weight: .semibold, design: .serif)).lineLimit(1)
                        Text(w.pinyin).font(.system(size: 13)).lineLimit(1).opacity(0.85)
                    }
                    Text(w.meaning).font(.system(size: 13)).lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case .systemMedium:
                HStack(alignment: .center, spacing: 14) {
                    Text(w.hanzi).font(.system(size: 44, weight: .semibold, design: .serif)).foregroundColor(ink)
                        .minimumScaleFactor(0.5).lineLimit(1)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(w.pinyin).font(.system(size: 16, weight: .medium)).foregroundColor(jade)
                        Text(w.meaning).font(.system(size: 14)).foregroundColor(ink.opacity(0.8)).lineLimit(2)
                        if let ex = w.example, !ex.isEmpty {
                            Text(ex).font(.system(size: 14, design: .serif)).foregroundColor(ink.opacity(0.65)).lineLimit(2)
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            default:
                VStack(alignment: .leading, spacing: 4) {
                    Text("今天的词").font(.system(size: 11, weight: .semibold, design: .serif)).foregroundColor(jade)
                    Spacer(minLength: 0)
                    Text(w.hanzi).font(.system(size: 34, weight: .semibold, design: .serif)).foregroundColor(ink)
                        .minimumScaleFactor(0.5).lineLimit(1)
                    Text(w.pinyin).font(.system(size: 13, weight: .medium)).foregroundColor(jade).lineLimit(1)
                    Text(w.meaning).font(.system(size: 12)).foregroundColor(ink.opacity(0.7)).lineLimit(2)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .padding(2)
            }
        } else {
            Text("Open Shuō once to load your words.").font(.system(size: 12)).foregroundColor(ink)
        }
    }
}

struct WordOfDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WordOfDay", provider: DayProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                WordOfDayView(entry: entry).containerBackground(for: .widget) { paper }
            } else {
                WordOfDayView(entry: entry).padding().background(paper)
            }
        }
        .configurationDisplayName("Word of the day")
        .description("A word from your deck with pinyin and meaning. Changes at midnight.")
        .supportedFamilies([.accessoryRectangular, .systemSmall, .systemMedium])
    }
}

@main
struct ShuoWidgets: WidgetBundle {
    var body: some Widget {
        ChineseTimeWidget()
        ChineseDateWidget()
        WordOfDayWidget()
    }
}
