# CogniLab

A local, private study system built on how memory actually works. No account, no server, no tracking — it's a static site: open `index.html` in a browser and everything (cards, schedules, stats) lives in that browser's localStorage.

## The six levers, and where they live

| Technique | What it does in the app |
| --- | --- |
| **Retrieval practice** | Every study card is a question. You grade your recall (Failed / Hard / Good / Easy) — the testing effect does the work; recognition doesn't. |
| **Spaced practice** | SM-2-style scheduler. Intervals grow only after successful recall (1d then 3d and beyond), failed cards reset to today, hard cards grow slower. The due badge shows what's waiting. |
| **Rereading** | Deliberately paired with retrieval, because standalone rereading is the weakest study method (fluency without memory). Reread mode: read the explanation once, close it, recall from memory, then compare. Only the recall counts toward the schedule. |
| **Summarization** | Each card carries a *your one-line summary* field, written in your own words. Insights tracks what percentage of cards are actually summarised. |
| **Interleaving** | Toggle in Study. On: the session mixes topics round-robin (harder moment to moment, trains strategy selection). Off: blocked topic groups (better for first acquisition). Comparing the two is part of the method. |
| **Metacognition** | A confidence slider appears before every reveal; the session summary compares your predictions with actual recall and nudges when you are over- or under-confident. Insights shows a calibration chart (diagonal = perfect), Brier score, bias, a 14-day activity chart and your streak. |

The demo deck that ships (10 cards across the six topics) teaches the techniques with the app itself.

## Run it

```sh
# any static server, e.g.
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Or just open `index.html` directly — there are no build steps and no dependencies.

GitHub Pages works out of the box: point Pages at the repo root (main branch).

## Data

- Stored under one localStorage key (`cognilab.state.v1`), versioned JSON.
- **Export / import JSON** lives in the Library — that is also your backup.
- Corrupted or mismatched data falls back to a fresh demo seed rather than failing.

## Tests

Pure engine and storage logic (scheduling, queue building, calibration, persistence) is dependency-free and unit-tested with Node's built-in runner:

```sh
node --test
```

## Layout

```
index.html        single-page shell
css/style.css     all styling
js/engine.js      pure logic: SM-2-style scheduling, interleave queue, calibration, streaks
js/store.js       localStorage persistence, export/import, demo seed
js/charts.js      tiny SVG charts (calibration, activity) — no chart libraries
js/app.js         views and wiring (Study / Reread / Library / Insights)
tests/            node:test suites for engine + store
```

## Why these techniques

The app's design follows the same evidence the cards state: retrieval beats passive rereading for durable memory; spacing converts relearning into strength; interleaving trades smoothness for discrimination; summaries in your own words force integration; and metacognition — specifically knowing what you don't know — is what all the rest is for. The calibration chart is the honest mirror: it shows you the gap between "I think I know this" and "I can produce this".

MIT licensed.
