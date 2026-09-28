# SPEC — Mandarin Practice App

## 1. Core idea
Everything the app shows or says is built from **words I already know in Anki**. Stories and conversations target
≥ 90–95% known words. New words become Anki cards in one tap. Pinyin fades word-by-word as words mature in Anki.

## 2. Anki integration
- Deck: `Mandarin Chinese — Ultimate Read & Speak` (and subdecks). Note type: `Mandarin Ultimate — Word/Phrase`.
  Fields: `Hanzi, Pinyin, English, Example, ExamplePinyin, ExampleEnglish, Notes, Len`. `Pinyin` contains HTML spans — strip tags.
- Sync (`anki.sync()`, run on the Mac with Anki open): via AnkiConnect `findNotes` / `notesInfo` / `findCards` / `cardsInfo`. Store per word:
  hanzi, pinyin (plain), english, anki_note_id, max interval of its cards, mastery. Sync replaces the whole table, so the
  sync time is stored once in `meta` (with the mastery counts) rather than per word.
- Mastery from Anki interval: `new` (not studied) · `learning` (< 1 day) · `young` (1–20 days) · `mature` (≥ 21 days).
- "Known" for content generation = young + mature. Pinyin hidden in Reader for `mature` words only (threshold configurable).
- Add card (`anki.add()`): note into subdeck `…::05 From the App`, same note type, pinyin coloured with spans `t1…t5`
  (same CSS classes as the deck). If Anki is unreachable (e.g. on the phone), queue in Firebase and flush on next sync from the Mac.
- Phone works without Anki: uses the last synced word table in Firebase.
- AnkiConnect must allow the app's origin: add `https://johnhodgson140-ai.github.io` to `webCorsOriginList` in the add-on config.

## 3. Chinese text pipeline (web/src/chinese)
- Segmentation: Claude returns each paragraph already split into words (it segments far better than `pinyin-pro` or
  `Intl.Segmenter`, which split 卖家/体育场/曼联 into characters); adjacent pieces that form an Anki word are merged.
- `pinyin(words)` → `pinyin-pro` tone marks, overridden by Anki pinyin when the word exists there.
- `sandhi(syllables)` → spoken tones: 3+3 → 2+3, 不 → bú before 4th, 一 → yí before 4th / yì before 1–3 (yī when counting/final), neutral tones kept.
  Returns both `written_tone` and `spoken_tone` per syllable. Grading always uses `spoken_tone`.
- `known_ratio(words)` → share of tokens (excluding punctuation, numbers, names) that are known.

## 4. Reader
- Story generation (`stories.generate()`): inputs level (1–6), topic, length (short 80–120 chars / medium 200–300 / long 400–600).
  Claude receives the known-word list (+ up to 8 target new words from Anki `learning` or recently added) and must return JSON
  `{title_zh, title_en, paragraphs: [[word]], new_words: [hanzi], names: [string], glossary: [{word, english}]}` via structured
  outputs. The app builds tokens, computes known ratio; regenerate once if < 90% (naming the out-of-list words), keep the better draft.
  Without a synced word list, stories use HSK vocabulary for the level and the ratio is not shown.
- Topics (my interests): football, archive fashion (Taobao/Xianyu listings, messaging sellers), anime, travel in China/Japan,
  daily life, business & finance. Level controls sentence length and grammar.
- Reader rendering: token list `{hanzi, pinyin, spoken_tones, mastery, gloss}`; `<ruby>` pinyin shown unless mature.
- Tap word → bottom sheet (desktop: right sidebar): hanzi, pinyin, meaning, TTS play, `+ Anki`. Meaning: Anki English, else the
  story glossary, else a one-off Haiku lookup saved into the story.
- TTS: Azure neural voice when an Azure key is set, otherwise the device's own zh-CN voice. Speed by level (0.8× → 1.1×).
- Long-press sentence → TTS. "Read aloud" button per paragraph → grading (section 5).
- Save stories (on the device, and in Firebase when signed in); mark as read; track read time (never shown while reading).

## 5. Speaking grading (shared by Reader read-aloud, Shadowing, Tone Dojo)
1. Frontend records 16 kHz mono WAV (AudioWorklet). Max 30 s per clip.
2. `azure.assess(audio, referenceText)` → Azure Pronunciation Assessment via the browser SDK (zh-CN, scripted, granularity=Phoneme),
   continuous recognition (Azure splits a paragraph at pauses). The app aligns all recognised words to the reference characters
   (longest common subsequence): unheard characters are omissions, extra words are ignored.
   Keep per syllable: accuracy score, error type, offset, duration. Keep totals: accuracy, fluency, completeness.
3. If the tone model is available: cut each syllable using Azure offsets, call tone adapter, compare predicted tone with `spoken_tone`.
4. Merge → per syllable status: `ok` · `minor` (accuracy 60–79 or low-confidence tone) · `wrong` (accuracy < 60 or wrong tone, confident).
5. Log every syllable result to `attempt_syllables` (feeds tone-pair heatmap + weak-spot selection).

## 6. Tone model interface (built in M4, runs in the browser)
```ts
// web/src/services/tone.ts
type SpeakerProfile = { minSemitone: number; maxSemitone: number }          // my pitch range
calibrate(samples: Float32Array[], sampleRate: number): SpeakerProfile
contour(audio: Float32Array, sampleRate: number, profile: SpeakerProfile): number[]   // ~30 points, semitones
predict(audio: Float32Array, sampleRate: number, profile: SpeakerProfile): { tone: 1 | 2 | 3 | 4 | 5; probs: number[] }
```
If it isn't available (or not calibrated yet), tone features degrade gracefully to Azure-only grading.
Native reference contours for the overlay come from TTS audio run through the same `contour()`.

## 7. Speak features
- **Tone Dojo:** 10–20 single words/tone pairs chosen from my weakest tone pairs + current Anki words. Hear → say → result with contour overlay (tap to view).
- **Shadowing:** sentence plays (normal or 0.8× speed), I repeat immediately, graded as section 5 plus speed ratio.
- **Missions:** scenario roleplays (restaurant, taxi, hotel, shopping, bargaining, asking directions, Xianyu seller chat, football chat).
  Each has a goal and success check. Turn loop: record → Azure STT → Claude (in character, level-limited vocab, max 2 sentences per turn)
  → Azure TTS. Hint button gives the English of what I could say. Toggle "hide text" (listening mode).
- **Free Talk:** same loop, open topic.
- **Retell:** listen to a 60–120 char story twice, retell it; Claude scores content coverage + grammar; Azure unscripted assessment for pronunciation.
- **Session report** (missions/free talk/retell): goal achieved?, 3 corrections max (my sentence → better sentence, with pinyin), pronunciation summary, new words (+Anki).

## 8. Levels & difficulty
Levels 1–6 (HSK-aligned). Level sets: known-word target, max new words per story, sentence length, TTS speed (0.8× at L1 → 1.1× at L6),
pinyin threshold (L1 show all unless mature; L4+ hide young words too), tutor correction style (L1–2 gentle recast; L3+ explicit).
Level-up = "boss" mission at next level passed with goal achieved + pronunciation accuracy ≥ 75.

## 9. Daily plan & gamification
- `plan.today()` builds a 30–45 min checklist: Anki due count (from AnkiConnect or last sync), Tone Dojo (5 min, weakest pairs),
  1 story, 1 mission, shadowing (5 min). One "Start" runs them in order.
- XP only for real work: minutes spoken, syllables graded ok, stories finished, missions completed. None for app opens/taps.
- Streak with 2 freezes per month. Level/XP shown only on Today header and session summaries.

## 10. Progress
Words known (young+mature), estimated HSK level, minutes spoken/week, tone-pair accuracy heatmap (5×5), monthly benchmark:
same fixed passage recorded on the 1st of each month, playable side by side.

## 11. Data model (Firebase, per signed-in user; recordings in IndexedDB on the device)
Realtime Database, everything under `/users/{uid}/`: `words/{noteId}`, `meta` (last sync + counts), `ankiQueue/{id}` so far.
Security rules (Firebase console → Realtime Database → Rules):
```json
{ "rules": { "users": { "$uid": {
  ".read": "auth != null && auth.uid === $uid",
  ".write": "auth != null && auth.uid === $uid"
} } } }
```
Planned tables:
`words`, `stories`, `story_reads`, `attempts` (type, ref_text, scores, created_at), `attempt_syllables` (hanzi, spoken_tone, predicted_tone,
accuracy, status, prev_tone), `missions`, `mission_turns`, `reports`, `xp_events`, `daily_plans`, `settings`, `speaker_profile`, `anki_queue`.

## 12. Services (web/src/services — no server of my own)
`anki` (sync, add, flush queue) · `azure` (assess, transcribe, tts) · `claude` (stories, mission turns, reports, glosses) ·
`firebase` (auth + data) · `tone` (calibrate, contour, predict). Keys for Azure and Claude come from Settings on the device.
Firebase Auth is only there to lock the data to me — still single-user, no account features.
