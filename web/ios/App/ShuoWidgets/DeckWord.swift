import Foundation

/// A word from my exported Anki deck, read from the app's own bundle (public/deck.json): the widget lives inside
/// the app (App.app/PlugIns/ShuoWidgets.appex), so it can read the app's files without any shared container.
struct DeckWord: Decodable {
    let hanzi: String
    let pinyin: String
    let english: String
    let example: String?

    /// Words (not sentences) with a meaning, in deck order: the same list and order as the app's word-of-the-day
    /// notification (web/src/native/notifications.ts), so both show the same word each day.
    static func all() -> [DeckWord] {
        let app = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        guard let data = try? Data(contentsOf: app.appendingPathComponent("public/deck.json")),
              let deck = try? JSONDecoder().decode(Deck.self, from: data) else { return [] }
        var seen = Set<String>()
        return deck.words.filter { w in
            let isSentence = w.hanzi.rangeOfCharacter(from: CharacterSet(charactersIn: "，。？！,.?!…")) != nil
            guard !isSentence, !w.english.isEmpty, w.hanzi.count <= 4, !seen.contains(w.hanzi) else { return false }
            seen.insert(w.hanzi)
            return true
        }
    }

    /// Same word all day, a different one each day (the formula in web/src/notify/plan.ts: wordFor).
    static func of(_ date: Date, in words: [DeckWord]) -> DeckWord? {
        guard !words.isEmpty else { return nil }
        let day = Int(floor(Calendar.current.startOfDay(for: date).timeIntervalSince1970 / 86_400))
        return words[((day * 7919) % words.count + words.count) % words.count]
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

    /// Today's words began on 1 October 2026 with the first words of the deck.
    private static let dailyStart = utcDay(year: 2026, month: 10, day: 1)

    /// Today's words: the next `count` words of the deck in order, a new set each day, round and round the deck.
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

    private struct Deck: Decodable { let words: [DeckWord] }
}
