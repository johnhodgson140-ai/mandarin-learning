import Capacitor
import Foundation
import WidgetKit

/// Hands my real Today's words to the widgets: the app writes them to the shared App Group and asks WidgetKit to
/// redraw. The widgets read the same group (ShuoWidgets/DeckWord.swift: DeckWord.shared), falling back to the
/// built-in list by date if nothing's there (e.g. the App Group isn't set up).
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setWords", returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.io.github.johnhodgson140.shuo.me"

    /// `days`: { "<day number>": [{ "h": hanzi, "p": pinyin, "e": english }, …] } for today and the next few days.
    @objc func setWords(_ call: CAPPluginCall) {
        guard let days = call.getObject("days"),
              let data = try? JSONSerialization.data(withJSONObject: days) else {
            call.reject("No words to share.")
            return
        }
        // Only a real App Group container counts: without the entitlement the widget can't read it.
        let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) != nil
        UserDefaults(suiteName: Self.group)?.set(data, forKey: "days")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["shared": shared])
    }
}
