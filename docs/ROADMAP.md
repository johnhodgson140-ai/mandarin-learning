# ROADMAP — one milestone at a time, confirm before moving on

## M0 — Foundations + microphone proof (do first)
- Scaffold `web/` (Vite React TS + PWA manifest + tokens.css + 4-tab shell with empty screens).
- AudioWorklet recorder → 16 kHz mono WAV → report duration; play it back.
- Auto-deploy to GitHub Pages. **Done when:** I can install the PWA on my iPhone, record, and hear playback.

## M1 — Anki bridge
- Firebase setup (sign-in + security rules), Settings screen (API keys, last sync).
- AnkiConnect client, sync into a words table with mastery, add card with queue. Check first that the browser on my Mac
  can reach AnkiConnect from the GitHub Pages site.
- **Done when:** sync imports my deck with correct mastery counts and a test card appears in `05 From the App`.

## M2 — Chinese pipeline + Reader
- segmentation, pinyin, sandhi (with tests), known ratio. Story generation with validation. Reader with ruby pinyin fade,
  word sheet, TTS, + Anki. Library of saved stories.
- **Done when:** I can generate a football story at level 1 with ≥ 90% known words and read it comfortably for 15 minutes.

## M3 — Read-aloud grading  ← first real milestone
- Azure Pronunciation Assessment, results view with underlines, attempt logging.
- **Done when:** I read a paragraph and see per-syllable results within ~3 s.

## M4 — Tone model + Tone Dojo
- Tone model in `web/src/services/tone.ts` (see steps below), calibration screen, contour overlay,
  weakest-pair selection, heatmap data.
- Tone model steps, stopping as soon as accuracy on my own recordings is good enough:
  1. Pitch tracking in the browser (YIN / autocorrelation) → 30-point semitone contours, normalised to my calibrated pitch range.
  2. Rule-based tone detector (mean height, slope, position of the lowest point).
  3. Only if needed: download Tone Perfect, split by speaker, train a small classifier offline in `ml/`, export its weights as JSON for the app.
- Neutral tone (5) isn't in Tone Perfect: handle it with rules / low confidence rather than training.

## M5 — Missions + Free Talk + session reports

## M6 — Shadowing + Retell

## M7 — Levels, daily plan, XP, streaks, Progress screen, monthly benchmark

## M8 — Desktop layout polish
