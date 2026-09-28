# CLAUDE.md — Mandarin Practice App ("Shuō")

Personal Mandarin speaking + reading app for one learner (me). Built mobile-first as a PWA, also used on my Mac.
Read `docs/SPEC.md`, `docs/DESIGN.md` and `docs/ROADMAP.md` before starting any milestone.

## Who I am / how to work with me
- Accounting & Finance student, intermediate-beginner Python learner. I know HTML/CSS/JS basics.
- Be direct. Flag tradeoffs honestly. No feature sprawl: build only what the current milestone asks for.
- Work **one milestone at a time** from `docs/ROADMAP.md`. At the end of each milestone: list what was built,
  how to run/test it, and anything I must do manually. Wait for my go-ahead before starting the next one.
- If a requirement is ambiguous, ask one short question rather than guessing.

## Tone model (Claude builds it, in M4)
- Built by Claude in M4 and runs in the browser (`web/src/services/tone.ts`) — I'm not writing it myself.
  Offline training scripts, if ever needed, go in `ml/` (data/models gitignored).
- Simplest thing first: pitch contours (needed for the overlay anyway) + a rule-based tone detector.
  Train on Tone Perfect only if the rules aren't accurate enough on my own recordings.
- The app uses it only through the interface in `docs/SPEC.md` → "Tone model interface".
  Until it exists, tone features fall back to Azure-only grading.

## Stack — no server of my own (same model as my Scholar Sanctum app)
Everything runs in the browser, hosted free on GitHub Pages, so the phone works without my Mac being on.
- **App:** `web/` — Vite + React + TypeScript, `vite-plugin-pwa`. Plain CSS with CSS variables (tokens in `web/src/styles/tokens.css`). No UI kits, no Tailwind, no animation libraries.
- **Hosting:** GitHub Pages at `https://johnhodgson140-ai.github.io/mandarin-learning/`, deployed by `.github/workflows/deploy.yml` on every push to `main`. Vite `base` must match the repo name.
- **Data:** Firebase (from M1) so phone and Mac share words/progress, locked to me by Firebase Auth + security rules. Recordings stay on the device (IndexedDB).
- **Chinese text:** `pinyin-pro` (segmentation + pinyin) + our own `web/src/chinese/sandhi.ts` (tone sandhi). **Never trust LLM-generated pinyin** — always regenerate it in the app.
- **Speech:** Azure Speech (zh-CN) via Microsoft's browser SDK — Pronunciation Assessment, speech-to-text, neural TTS (`zh-CN-XiaoxiaoNeural` default). Free tier F0.
- **LLM:** Anthropic API called directly from the browser. `claude-sonnet-5` for stories/missions/reports; `claude-haiku-4-5-20251001` for cheap tasks (word glosses, validation retries).
- **API keys:** typed into Settings on each device and stored only on that device. **Never in the code** — nothing secret goes in the repo or the build.
- **Anki:** AnkiConnect add-on on desktop Anki, `http://localhost:8765`. Sync runs from the app in a browser on my Mac while Anki is open; the phone uses the last synced words.

## Repo layout
```
web/                 React PWA (the whole app)
  src/screens/       Today, Reader, Speak/*, Progress
  src/components/    small, dumb components
  src/audio/         AudioWorklet recorder → 16 kHz mono WAV
  src/chinese/       segmentation, pinyin, sandhi, known-word ratio
  src/services/      azure.ts, claude.ts, anki.ts, firebase.ts, tone.ts
  src/prompts/       Claude prompt templates (*.md)
  src/styles/        tokens.css, base.css
ml/                  offline tone-model training, only if M4 needs it (data/models gitignored)
docs/                SPEC, DESIGN, ROADMAP
.github/workflows/   build + deploy to GitHub Pages
```

## Commands
- All development happens in Claude Code on the web; pushing to `main` publishes the app. I don't need a terminal.
- Local (optional): `cd web && npm install && npm run dev` · `npm run build` · `npm run lint`

## Conventions
- TypeScript `strict` on.
- Recordings: 16 kHz mono PCM WAV, kept on the device, delete after 30 days.
- Every Claude call: prompt templates live in `web/src/prompts/*.md`; request JSON output and validate its shape with a type guard; retry once on invalid JSON.
- Write tests for: pinyin/sandhi, known-word ratio, Anki sync mapping, grading merge logic.
- Keep dependencies minimal; ask before adding any new package.

## Design non-negotiables (full detail in docs/DESIGN.md)
- Calm, book-like UI. Warm paper palette, one accent colour. No particles, confetti, bouncing, or decorative animation — only 150–200 ms fades.
- Reader: Noto Serif SC, ~24px, line-height 1.9, pinyin as `<ruby>` above characters, tone colours OFF by default.
- Gamification never appears inside reading or speaking screens.
- Four tabs only: Today · Read · Speak · Progress.

## Out of scope (do not build unless I ask)
Handwriting, social/leaderboards, grammar lesson modules, real-time streaming voice calls, native app-store builds, user accounts/multi-user.
