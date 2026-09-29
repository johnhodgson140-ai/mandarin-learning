# Shuō as an iPhone app (personal use, free Apple ID)

The iOS app is the same app as the website, wrapped in a native shell (Capacitor, `web/ios`). GitHub builds it on
every push to `main` and publishes a ready-to-open Xcode project. You install it from Xcode on your Mac with your
free Apple ID. Apple's free signing lasts **7 days**, so you re-run it from Xcode about once a week.

## One-time setup on the Mac
1. **Install Xcode 16** (my Mac runs macOS 15, and the App Store's newest Xcode needs a newer macOS): download the
   newest Xcode 16.x from https://developer.apple.com/download/all (sign in with any Apple ID), unpack the `.xip`,
   drag Xcode into Applications. Open it once, accept the licence, and when it asks which platforms to install,
   tick **iOS** only.
2. **Sign in:** Xcode → Settings → Accounts → **+** → Apple ID → sign in with your Apple ID.

## Install (and update) the app
1. **Download** the latest build on your Mac:
   https://github.com/johnhodgson140-ai/mandarin-learning/releases/download/ios-latest/Shuo-iOS.zip
   Double-click it to unzip (you get a folder with `ios` and `node_modules` in it: keep them together).
2. **Open** `ios/App/App.xcodeproj` (double-click). Wait until the top bar stops showing
   "Resolving package graph" / "Fetching" (the first time takes a minute).
3. **Signing:** in the left sidebar click **App** (blue icon) → under TARGETS click **App** → **Signing &
   Capabilities** → **Team**: choose your name (*Personal Team*). Then do the same for the second target,
   **ShuoWidgets** (the lock screen widget).
   If Xcode says the bundle identifier isn't available, change **Bundle Identifier** to something unique,
   e.g. `io.github.johnhodgson140.shuo.me` (the project already uses this one).
4. **Connect your iPhone** with a cable, unlock it and tap **Trust** if asked.
   The first time: on the iPhone go to Settings → Privacy & Security → **Developer Mode** → On (it restarts).
5. At the top of Xcode, choose **your iPhone** as the run destination, then press **▶ Run**.
6. The first time only: on the iPhone go to Settings → General → **VPN & Device Management** → your Apple ID →
   **Trust**. Then open Shuō.

## Every 7 days
The app stops opening after 7 days. Connect the iPhone, open the project in Xcode and press **▶ Run** again
(your data stays). Tip: with the phone connected once, Window → Devices and Simulators → tick **Connect via
network** so later re-runs work over Wi-Fi.

## Updates
Download the zip again and repeat steps 1–5 (the release notes on GitHub say when it was built).
Daily stories and missions update by themselves: the app fetches them from the website.

## Good to know
- The app keeps its own data, separate from the home-screen web app (calibration, voices, progress). Recalibrate
  once in the app. (Firebase sync, once set up, will share progress between them.)
- API keys are typed into Settings in the app and stay on the phone, as on the website.

## Widgets
Long-press the lock screen → **Customize** → Lock Screen → tap the widget area under the clock → **Shuō** →
**Chinese time** (characters + pinyin under the clock; the one-line version goes above the clock). On the home
screen: long-press → **+** → Shuō. iOS decides exactly when widgets refresh, so the time can lag by a minute now
and then.

## Notifications
Settings → Notifications (in the app): word of the day, practice reminder (with the cards due) and streak saver,
each at a time you choose. Tapping one opens your cards.
