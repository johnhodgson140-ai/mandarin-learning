# Daily content: instructions for the scheduled Claude session

Every morning a scheduled Claude Code session writes today's learning content into
`web/public/daily/latest.json`. The app loads it with **no API key**: Today's plan, new stories in the library,
and guided missions (scripted conversations scored by the free scorer). Live missions/explanations still use
the optional Claude API key.

## What to do (the session follows these steps exactly)

1. Work in the repo `johnhodgson140-ai/mandarin-learning` on `main`. Pull the latest `main` first.
2. Read `content/config.json` (level, topics, how many stories/missions) and `content/words.json`
   (`{ "known": [...], "learning": [...], "deck": [...] }`: words the learner knows, is learning, and everything in
   their Anki deck; made by `scripts/import_deck.py`).
3. Read the current `web/public/daily/latest.json` so today's topics and scenarios differ from yesterday's.
4. Write a new `web/public/daily/latest.json` for today's date (Europe/London), following the types in
   `web/src/daily/schema.ts` and the example already in that file:
   - `plan`: a one-line `focus_en` (e.g. a tone or a grammar point the stories use) and 4 `items`, in this order:
     `cards` ("Say your cards"), `dojo` ("Tone Dojo (5 minutes)"), one `story` and one `mission` (with `ref` = their ids).
   - `stories` (`stories_per_day`, default 2): ids `YYYY-MM-DD-s1`, `-s2`… Different topics from `config.topics`.
     Level from `config.level`: level 1 ≈ 80–120 characters, sentences under 10 characters, at most 3 new words.
     At least 90% of words must come from `known`; if `known` is empty (deck not studied yet), from `deck` instead.
     Use a few `learning` words on purpose. Missions' answers should use deck words and phrases too
     (e.g. 买单, 打包, 太贵了, 我要这个 are in the deck).
   - `missions` (`missions_per_day`, default 2): ids `YYYY-MM-DD-m1`…, a realistic scene (restaurant, taxi, hotel,
     shopping, bargaining, directions, Xianyu seller, football chat, travel, work…), `role` in Chinese (e.g. 服务员),
     an English `goal`, 3–6 `steps` each with `partner_zh`, `partner_en`, `prompt_en` (what the learner should say,
     in English) and 2–3 short, natural `answers_zh`, then `closing_zh` / `closing_en`.
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
Edit `content/config.json` (level, topics, counts), or add `content/words.json` with my Anki words.
This repo is public, so everything here (including `words.json`) is publicly readable.
