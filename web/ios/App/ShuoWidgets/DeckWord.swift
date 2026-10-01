import Foundation

/// A word for the widgets: my real Today's words as the app shared them (App Group), else the built-in list
/// (public/daily-words.json) read from the app's own bundle: the widget lives inside the app
/// (App.app/PlugIns/ShuoWidgets.appex), so it can read the app's files without any shared container.
struct DeckWord {
    let hanzi: String
    let pinyin: String
    let english: String
    let example: String?

    /// The built-in Today's words list (public/daily-words.json: HSK 1 → 6, most common first, with the app's pinyin),
    /// read from the app's bundle: the same list the app uses (web/src/services/curriculum.ts).
    static func dailyList() -> [DeckWord] {
        let app = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        guard let data = try? Data(contentsOf: app.appendingPathComponent("public/daily-words.json")),
              let list = try? JSONDecoder().decode(DailyList.self, from: data) else { return [] }
        return list.words.compactMap { row in
            row.count == 3 ? DeckWord(hanzi: row[0], pinyin: row[1], english: row[2], example: nil) : nil
        }
    }

    private struct DailyList: Decodable { let words: [[String]] }

    /// My real words for a day, as the app shared them through the App Group (WidgetBridgePlugin), or nil.
    static func shared(_ date: Date) -> [DeckWord]? {
        guard let data = UserDefaults(suiteName: "group.io.github.johnhodgson140.shuo.me")?.data(forKey: "days"),
              let days = try? JSONDecoder().decode([String: [[String: String]]].self, from: data),
              let day = days[String(dayNumber(date))], !day.isEmpty else { return nil }
        return day.map { DeckWord(hanzi: $0["h"] ?? "", pinyin: $0["p"] ?? "", english: $0["e"] ?? "", example: nil) }
    }

    /// Today's words: what the app shared, else the built-in list by date (`count` a day).
    static func today(_ date: Date, count: Int) -> [DeckWord] {
        shared(date) ?? daily(date, in: dailyList(), count: count)
    }

    /// Calendar day number of a local date (days since 1970-01-01): the same as dayNumber in web/src/notify/plan.ts.
    static func dayNumber(_ date: Date) -> Int {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return utcDay(year: c.year ?? 1970, month: c.month ?? 1, day: c.day ?? 1)
    }

    private static func utcDay(year: Int, month: Int, day: Int) -> Int {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .current
        let d = utc.date(from: DateComponents(year: year, month: month, day: day)) ?? Date(timeIntervalSince1970: 0)
        return Int((d.timeIntervalSince1970 / 86_400).rounded())
    }

    /// The date-based fallback began on 1 October 2026 with the first words of the list.
    private static let dailyStart = utcDay(year: 2026, month: 10, day: 1)

    /// Fallback when the app hasn't shared my words: the next `count` words of the list each day, round the list.
    /// Mirrors dailyWords in web/src/notify/plan.ts (which has the tests): keep them in step.
    static func daily(_ date: Date, in words: [DeckWord], count: Int) -> [DeckWord] {
        let n = min(count, words.count)
        guard n > 0 else { return [] }
        let start = (((dayNumber(date) - dailyStart) * count) % words.count + words.count) % words.count
        return (0..<n).map { words[(start + $0) % words.count] }
    }

    /// The first meaning only ("to listen; to hear" → "to listen").
    var meaning: String {
        english.split(whereSeparator: { $0 == ";" || $0 == "," }).first.map { $0.trimmingCharacters(in: .whitespaces) } ?? english
    }
}
