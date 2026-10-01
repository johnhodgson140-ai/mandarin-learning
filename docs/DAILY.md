# Daily content: instructions for the scheduled Claude session

Every morning a scheduled Claude Code session writes today's learning content into
`web/public/daily/latest.json`. The app loads it with **no API key**: Today's plan, new stories in the library,
and guided missions (scripted conversations scored by the free scorer). Live missions/explanations still use
the optional Claude API key.

## What to do (the session follows these steps exactly)

1. Work in the repo `johnhodgson140-ai/mandarin-learning` on `main`. Pull the latest `main` first.
2. Run `cd web && node scripts/daily-vocab.ts` and read its output. The learner works through the app's built-in word
   list (`web/public/daily-words.json`: HSK 1 → 6, most common first) a few words a day; the script estimates how far
   they've got and prints `level`, `known` (the words to write with) and `new` (the next words on their list, with
   meanings). Also read `content/config.json` (topics, how many stories/missions).
3. Read the current `web/public/daily/latest.json` so today's topics and scenarios differ from yesterday's.
4. Write a new `web/public/daily/latest.json` for today's date (Europe/London), following the types in
   `web/src/daily/schema.ts` and the example already in that file:
   - `plan`: a one-line `focus_en` (e.g. a tone or a grammar point the stories use) and 4 `items`, in this order:
     `cards` ("Say your cards"), `dojo` ("Tone Dojo (5 minutes)"), one `story` and one `mission` (with `ref` = their ids).
   - `stories` (`stories_per_day`, default 2): ids `YYYY-MM-DD-s1`, `-s2`… Different topics from `config.topics`.
     Level from the script's `level`: level 1 ≈ 80–120 characters, sentences under 10 characters.
     At least 90% of the words must come from `known` (names and numbers don't count). Bring in at most 3 new words per
     story at level 1–2 (5 at level 3+), taken from the script's `new` list, used so their meaning is clear in context.
     `translations`: natural English for each paragraph (one string per paragraph, same order).
   - `missions` (`missions_per_day`, default 2): ids `YYYY-MM-DD-m1`…, a realistic scene (restaurant, taxi, hotel,
     shopping, bargaining, directions, Xianyu seller, football chat, travel, work…), `role` in Chinese (e.g. 服务员),
     an English `goal`, 3–6 `steps` each with `partner_zh`, `partner_en`, `prompt_en` (what the learner should say,
     in English), 2–3 short, natural `answers_zh` and their English in `answers_en` (same order), then `closing_zh` / `closing_en`.
     Lines and answers use mainly `known` words; each mission brings in 2–3 words from `new`, listed in `new_words`
     (`[{ "word", "english" }]`): the app shows them before the mission and adds them to the learner's words after.
5. Rules for all Chinese text:
   - Natural, idiomatic Mandarin a native speaker would say. Simplified characters, full-width punctuation.
   - **Never write pinyin** (the app generates it). No Latin letters inside paragraphs.
   - Story paragraphs are arrays of words split as a dictionary would ("我" "喜欢" "看" "足球" "比赛" "。");
     punctuation marks are their own items; no spaces inside items.
   - `names`: people, clubs, brands, places. `new_words`: words used that aren't in the known list.
     `glossary`: short English for every new word and name.
6. Validate: `cd web && npm ci && npm test` must pass (it checks `latest.json` with `validateDaily`).
   Fix any error it reports; never push a failing file.
7. Commit only `web/public/daily/latest.json` with the message `Daily content YYYY-MM-DD` and push it straight to
   `main` (the owner has authorised this for daily content). Pushing to `main` publishes it to the app.

## Changing what it writes
Edit `content/config.json`: topics, counts, and `curriculum` (`start`, `per_day` new words a day, `basics` = how many
of the most common words count as known from the start). If the stories feel too easy or too hard, nudge `basics`.

## The ready-made pack (separate from daily content)
`content/pack/` holds stories (levels 1–6 × six topics × short/medium/long) and guided missions written ahead of
time. `cd web && npm run pack` splits the stories into words, picks up to 8 new words each and glosses them from
`hsk.json`, then writes `web/public/pack/`. The app shows them under Read → More stories and Speak → Missions,
filtered by the level, topic and length I pick. The daily session doesn't touch the pack.
