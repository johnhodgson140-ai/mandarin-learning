import Foundation

/// The time said the way it's said in Mandarin: 下午三点二十 · xiàwǔ sān diǎn èrshí.
/// Mirrors web/src/chinese/clock.ts (which has the tests): keep them in step.
enum ChineseTime {
    private static let digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
    private static let digitsPinyin = ["líng", "yī", "èr", "sān", "sì", "wǔ", "liù", "qī", "bā", "jiǔ"]

    static func number(_ n: Int) -> (hanzi: String, pinyin: String) {
        if n < 10 { return (digits[n], digitsPinyin[n]) }
        let tens = n / 10, ones = n % 10
        let hanzi = (tens > 1 ? digits[tens] : "") + "十" + (ones > 0 ? digits[ones] : "")
        let pinyin = (tens > 1 ? digitsPinyin[tens] : "") + "shí" + (ones > 0 ? (ones == 2 ? "'" : "") + digitsPinyin[ones] : "")
        return (hanzi, pinyin)
    }

    private static func period(_ hour: Int) -> (hanzi: String, pinyin: String) {
        switch hour {
        case ..<5: return ("凌晨", "língchén")
        case ..<9: return ("早上", "zǎoshang")
        case ..<12: return ("上午", "shàngwǔ")
        case ..<13: return ("中午", "zhōngwǔ")
        case ..<18: return ("下午", "xiàwǔ")
        default: return ("晚上", "wǎnshang")
        }
    }

    static func say(hour: Int, minute: Int) -> (hanzi: String, pinyin: String) {
        let p = period(hour)
        let h12 = hour % 12 == 0 ? 12 : hour % 12
        let h = h12 == 2 ? (hanzi: "两", pinyin: "liǎng") : number(h12)
        var m = (hanzi: "", pinyin: "")
        if minute == 30 {
            m = ("半", " bàn")
        } else if minute > 0 && minute < 10 {
            m = ("零\(digits[minute])分", " líng \(digitsPinyin[minute]) fēn")
        } else if minute >= 10 {
            let n = number(minute)
            m = (n.hanzi, " " + n.pinyin)
        }
        return ("\(p.hanzi)\(h.hanzi)点\(m.hanzi)", "\(p.pinyin) \(h.pinyin) diǎn\(m.pinyin)")
    }

    static func say(_ date: Date) -> (hanzi: String, pinyin: String) {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return say(hour: c.hour ?? 0, minute: c.minute ?? 0)
    }
}
