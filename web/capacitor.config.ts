import type { CapacitorConfig } from '@capacitor/cli'

// The iOS app (personal use, installed from Xcode with a free Apple ID): the same web app, bundled.
// Built with `npm run build:ios` (base '/', no service worker) into dist-native, then copied into ios/.
// Safe areas are handled in CSS (env(safe-area-inset-*)), so the web view isn't inset.
const config: CapacitorConfig = {
  appId: 'io.github.johnhodgson140.shuo.me', // matches the id registered with my Apple ID
  appName: 'Shuō',
  webDir: 'dist-native',
  ios: { contentInset: 'never' },
}

export default config
