import Capacitor
import Foundation
import Speech

/// Checks which sounds I made: Apple's Mandarin speech recogniser run on my finished recording (on the device
/// when the iPhone supports it). Working on the saved file, not the live microphone, means it never competes
/// with the app's own recording.
@objc(SpeechCheckPlugin)
public class SpeechCheckPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechCheckPlugin"
    public let jsName = "SpeechCheck"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognise", returnType: CAPPluginReturnPromise),
    ]

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private var tasks: [SFSpeechRecognitionTask] = []

    @objc func available(_ call: CAPPluginCall) {
        call.resolve([
            "available": recognizer?.isAvailable ?? false,
            "onDevice": recognizer?.supportsOnDeviceRecognition ?? false,
        ])
    }

    /// `wav`: base64 16 kHz WAV. Resolves `alternatives` (best first) and the best guess's timed `segments`.
    @objc func recognise(_ call: CAPPluginCall) {
        guard let b64 = call.getString("wav"), let data = Data(base64Encoded: b64) else {
            call.reject("No audio to check.")
            return
        }
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async { self.run(call, data: data, authorised: status == .authorized) }
        }
    }

    private func run(_ call: CAPPluginCall, data: Data, authorised: Bool) {
        guard authorised else {
            call.reject("Speech recognition isn't allowed: iPhone Settings → Shuō → Speech Recognition.")
            return
        }
        guard let recognizer = recognizer, recognizer.isAvailable else {
            call.reject("Mandarin speech recognition isn't available right now.")
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("shuo-\(UUID().uuidString).wav")
        do { try data.write(to: url) } catch {
            call.reject("Couldn't save the recording.")
            return
        }
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

        var finished = false
        var task: SFSpeechRecognitionTask?
        task = recognizer.recognitionTask(with: request) { result, error in
            if finished { return }
            if let result = result, !result.isFinal { return }
            finished = true
            try? FileManager.default.removeItem(at: url)
            if let t = task { self.tasks.removeAll { $0 === t } }
            guard let result = result else {
                // No speech found (or on-device recognition unavailable): an empty answer, not an error.
                call.resolve(["alternatives": [], "segments": [], "error": error?.localizedDescription ?? ""])
                return
            }
            let alternatives = result.transcriptions.map { $0.formattedString }
            let segments = result.bestTranscription.segments.map {
                ["text": $0.substring, "start": $0.timestamp, "duration": $0.duration, "confidence": $0.confidence] as [String: Any]
            }
            call.resolve(["alternatives": alternatives, "segments": segments])
        }
        if let t = task { tasks.append(t) }
    }
}
