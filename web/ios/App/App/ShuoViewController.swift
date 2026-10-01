import Capacitor
import UIKit

/// The app's web view, with Shuō's own native plugins registered.
class ShuoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpeechCheckPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
