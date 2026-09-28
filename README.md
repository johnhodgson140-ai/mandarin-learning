# Shuō 说 — Mandarin practice

Personal Mandarin speaking + reading app. A mobile-first PWA that runs entirely in the browser — no server of my own,
so the phone works without my Mac being on. Hosted on GitHub Pages.

**App:** https://johnhodgson140-ai.github.io/mandarin-learning/

Project docs: [`CLAUDE.md`](CLAUDE.md), [`docs/SPEC.md`](docs/SPEC.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Status:** M0 — foundations + microphone proof.

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

## API keys
Azure and Claude keys (from M1 onwards) are typed into the app's Settings on each device and stay on that device.
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
