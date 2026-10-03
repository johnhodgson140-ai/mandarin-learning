import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from GitHub Pages at https://johnhodgson140-ai.github.io/mandarin-learning/ — must match the repo name.
// `--mode native` builds the iOS app (Capacitor serves it from the root, and it needs no service worker).
export default defineConfig(({ mode }) => ({
  base: mode === 'native' ? '/' : '/mandarin-learning/',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'native',
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Shuō — Mandarin practice',
        short_name: 'Shuō',
        description: 'Speak and read Mandarin with the words you already know.',
        lang: 'en',
        display: 'standalone',
        start_url: '/mandarin-learning/',
        scope: '/mandarin-learning/',
        background_color: '#F7F4EE',
        theme_color: '#F7F4EE',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Keep the reader font available offline once it has been seen.
        runtimeCaching: [
          {
            // HSK word list, example sentences and the ready-made pack: fetched on first use, then available offline (refreshed in the background).
            urlPattern: ({ url }) => /\/(hsk|daily-words|sentences|pack\/stories|pack\/missions)\.json$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'hsk' },
          },
          {
            // Tone ears' recorded voices: kept once heard.
            urlPattern: ({ url }) => url.pathname.includes('/voices/'),
            handler: 'CacheFirst',
            options: { cacheName: 'voices', expiration: { maxEntries: 2500 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  // The Read chunk is ~500 kB, almost all pinyin-pro's dictionary; it's lazy-loaded and precached, so that's fine.
  build: { chunkSizeWarningLimit: 700 },
  server: { port: 5173, strictPort: true },
}))
