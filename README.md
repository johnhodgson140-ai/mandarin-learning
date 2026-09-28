# Shuō 说 — Mandarin practice

Personal Mandarin speaking + reading app. A mobile-first PWA that runs entirely in the browser — no server of my own,
so the phone works without my Mac being on. Hosted on GitHub Pages.

**App:** https://johnhodgson140-ai.github.io/mandarin-learning/

Project docs: [`CLAUDE.md`](CLAUDE.md), [`docs/SPEC.md`](docs/SPEC.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Status:** M5 + free scorer and Say your cards. (M1's Anki sync is built; its one-time setup below is still to do.)

## Install on the iPhone
1. Open the app link above in **Safari**.
2. Share button → **Add to Home Screen** → Add.
3. Open **Shuō** from the home screen → **Speak** → hold the button → allow the microphone.
4. Hold again, say something, release: you should hear your recording.

Updates publish automatically. If the home-screen app shows an old version, close it fully and reopen it.

## How publishing works
Every push runs `.github/workflows/deploy.yml`: lint + type-check + build. Pushes to `main` are also published to
GitHub Pages. One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The Vite `base` in `web/vite.config.ts` is `/mandarin-learning/` — it must match the repo name. If the repo is renamed,
change it too (and re-add the app to the home screen, since the link changes).

## One-time setup for sync (M1)

### 1. Firebase (stores words and progress so the phone and Mac share them)
1. Go to https://console.firebase.google.com → **Add project** → name it `shuo` → turn Google Analytics off → Create.
2. **Build → Realtime Database → Create database** → location **Belgium (europe-west1)** → **Start in locked mode** → Enable.
3. In the database's **Rules** tab, replace everything with the rules in [`docs/SPEC.md` §11](docs/SPEC.md) → **Publish**.
4. **Build → Authentication → Get started → Email/Password** → Enable → Save.
   Then **Users → Add user** with your email and a password (this is the only account; the app has no sign-up).
5. Optional but recommended: **Authentication → Settings → User actions** → untick **Enable create (sign-up)**.
6. **Project settings** (gear icon) → **Your apps** → the web icon `</>` → register an app called `shuo` (no Hosting).
   Copy `apiKey` and `databaseURL` from the config it shows into `web/src/services/firebase-config.ts`.
   These are public identifiers, not secrets — the rules above are what protect the data.

### 2. AnkiConnect (lets the app read your Anki deck on the Mac)
1. In Anki on the Mac: **Tools → Add-ons → Get Add-ons…** → code `2055492159` → OK → restart Anki.
2. **Tools → Add-ons** → select **AnkiConnect** → **Config**, and add the app's site to `webCorsOriginList`:
   ```json
   "webCorsOriginList": ["http://localhost", "https://johnhodgson140-ai.github.io"]
   ```
   OK → restart Anki.
3. Open the app in **Chrome** on the Mac (Safari blocks sites from talking to apps on your own computer)
   → Settings (gear on Today) → sign in → **Sync from Anki**. If Chrome asks to let the site access apps or devices
   on this computer, allow it.

The phone uses whatever was last synced; cards added on the phone are queued and sent to Anki on the next sync.

### 3. Azure Speech (pronunciation grading, from M3)
1. Go to https://portal.azure.com (your student account gets free credit; the Speech free tier costs nothing anyway).
2. **Create a resource** → search **Speech** → **Speech service** → Create.
3. Resource group: new, `shuo` · Region: **UK South** · Name: e.g. `shuo-speech` · Pricing tier: **Free F0** → Review + create → Create.
4. **Go to resource → Keys and Endpoint**: copy **KEY 1** and the **Location/Region** (`uksouth`).
5. In the app: Settings → paste the key into **Azure Speech key**, check the region says `uksouth`. Do this on each device.

## API keys
Azure and Claude keys are typed into the app's Settings on each device and stay on that device.
They are never put in this repo or the published site.

## Local development (optional)
```bash
cd web
npm install
npm run dev      # http://localhost:5173/mandarin-learning/
npm run build    # type-check + production build
npm run lint
```

## Layout
```
web/                 React + TypeScript PWA (Vite) — the whole app
ml/                  offline tone-model training, only if M4 needs it
docs/                SPEC, DESIGN, ROADMAP
.github/workflows/   build + deploy to GitHub Pages
```
