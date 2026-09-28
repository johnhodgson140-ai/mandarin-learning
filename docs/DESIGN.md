# DESIGN — calm, book-like, built for 15+ minute sessions

## Principles
Nothing moves unless I touched it. Nothing competes with the Chinese text. Detail only on request (tap to expand).

## Tokens (web/src/styles/tokens.css)
```css
:root {
  --bg: #F7F4EE; --surface: #FFFDF9; --text: #2A2825; --text-muted: #7A746B; --line: #E6E0D6;
  --accent: #3E6B5A;             /* muted jade — buttons, progress, focus */
  --ok: #4F7F5F; --minor: #C8913A; --wrong: #B5523F;
  --t1: #C0564B; --t2: #C98A3D; --t3: #5E8C5A; --t4: #4A76A8; --t5: #9A948B;   /* soft tone colours, pinyin only */
  --radius: 12px; --space: 8px;
  --font-zh: "Noto Serif SC", "Songti SC", serif;
  --font-ui: -apple-system, "Segoe UI", Roboto, sans-serif;
  --fade: 180ms ease;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #1B1A18; --surface: #23221F; --text: #E4DED3; --text-muted: #9C958A; --line: #34322E; --accent: #7FA894;
}}
```
Never pure black or pure white. One accent colour only. Manual theme override in Settings (light / dark / auto).

## Typography
- Reader characters: `--font-zh`, 24px default (slider 18–32), line-height 1.9, paragraph gap 1.2em, max ~22 characters per line on phone, 34rem column on desktop.
- Pinyin: `<ruby><rt>` above characters, 0.45em, `--text-muted`. Tone colours off in Reader by default (toggle), on in Speak screens.
- UI text: `--font-ui`, 15–17px.

## Layout
- Bottom tab bar (phone) / left rail (desktop ≥ 900px): **Today · Read · Speak · Progress**. Settings via icon on Today.
- Word details: bottom sheet on phone, right sidebar on desktop.
- Tap targets ≥ 44px. One primary action per screen.

## Screens
- **Today:** greeting line with level + XP (one line), today's checklist, big Start button. Nothing else.
- **Reader:** full screen, thin progress line at top, no timers, no scores while reading. Read-aloud button at paragraph end.
- **Speak hub:** five plain rows (Tone Dojo, Shadowing, Missions, Free Talk, Retell) with a one-line description each.
- **Recording:** one large hold-to-talk button; subtle live level meter (a single bar, no waveform animation).
- **Results:** my sentence with syllables underlined `--minor` / `--wrong`; tap a syllable → pitch contour overlay (mine vs native) + replay both.
- **Mission:** message-style list, no bubbles — speaker label + text, generous spacing. "Hide text" and "Hint" in the header.
- **Progress:** 4 numbers at top, tone-pair heatmap, monthly benchmark recordings.

## Motion & feedback
Only opacity fades (180 ms) and sheet slide-ups. Correct/wrong = short haptic (`navigator.vibrate`) where supported. No confetti, particles,
bouncing, sounds effects, or streak pop-ups. Session summary is a calm static card.
