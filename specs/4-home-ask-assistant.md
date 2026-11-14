# Home: ask what to attend in natural language

## What this changes
Under the interests box, Home gains one question field ("What should I see about cloud costs on
Day 2?") and an Ask button. The answer appears beneath it as a short list of programme sessions,
each a link to its detail page. The server sends a model on OpenRouter only the question, the
attendee's saved interests text and the programme (id, title, track, day, start time), keeps the
model's answer to ids that exist, and stores nothing: not the question, not the answer. With no
key, or a model that fails or is rate-limited, the answer area reads "The assistant is not
available right now" and the rest of Home, including the interests box, works as before.

## Where
- `server/lib/assistant.js` (new) — `askAssistant({ question, interests, programme })`. Reads
  `OPENROUTER_API_KEY` at call time (loading `.env` once with `process.loadEnvFile`, ignored if
  absent), `OPENROUTER_MODEL` (default `nvidia/nemotron-3-ultra-550b-a55b:free`) and
  `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`, the seam tests point at a local
  stub). POSTs `/chat/completions` with a system prompt, then a user message of the question, the
  interests text and the programme as JSON lines; asks for `{"ids":[…]}`. Returns the parsed ids,
  or `null` for no key, a non-2xx, a timeout (AbortSignal, 20 s) or unparseable output.
  Keeps ids that are integers in the programme set, de-duplicated, first 5, in the model's order.
- `server/routes/users.js` — `POST /:id/ask` body `{ question }`: 404 unknown attendee, 400 if the
  question is not a non-blank string or is over 300 characters. Builds the programme from
  `SESSION_SELECT` (`id, title, trackName, day, startsAt` only), takes the interests text from the
  existing `getNote`, never reads the `users` row. Responds `200 { available: true, sessions }`
  (each `{ id, title, trackName, day, startsAt }`, possibly empty) or `200 { available: false }`.
  Unavailable is 200 so the browser logs no console error and smoke stays clean.
- `src/lib/api.js` — `askAssistant(userId, question)`, the only `fetch` caller.
- `src/pages/HomePage.jsx` — new `AskBox` after `InterestsBox` (testids `ask-box`, `ask-input`,
  `ask-submit`, `ask-results`, `ask-result` per link, `ask-empty`, `ask-unavailable`). Local state
  only; results link with `<Link to={`/schedule/${id}`}>` (confirm the detail route in `App.jsx`).
  Day and time rendered with `format.js`, never `new Date()`.
- Tests: API `tests/api/ask.test.js` using `startApi`, with a local `node:http` stub set as
  `OPENROUTER_BASE_URL` and `OPENROUTER_API_KEY=test-key` before `startApi`; spec
  `tests/home.spec.js` new `describe` using `visit`, `laneFor('home.ask', testInfo)` and
  `page.route('**/api/users/*/ask', …)` to stub the answer (the browser never reaches a model).
- `tests/helpers.js` `LANES` — `'home.ask'` with `agenda: false` (books nothing), pair checked free
  against every row: desktop `abraham` day 1, mobile `jonas` day 1 (`tests/unit/lanes.test.js`
  enforces it; pick another pair if it fails).
- Docs: `context/engineering-context/agenda.md` (new "Asking the assistant" part: route, what is
  sent, where the key lives, how tests stub it) and `ui.md` (`AskBox`, next to `InterestsBox`).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| A question returns linked sessions that exist | API: stub returns two real ids; POST returns those two sessions with `trackName`, `day`, `startsAt`. Spec: type, Ask, two `ask-result` links, click one, URL is its detail page | API + spec |
| A model answer naming a session that does not exist is dropped | API: stub returns `[realId, 999999, "x", realId]`; response holds `realId` once and nothing else | API |
| No key, or a failing model: unavailable state, rest of Home works | API: no key -> `{ available: false }` and the stub is never called; stub 500, 429 and garbage body -> same. Spec: stubbed `{ available: false }` shows `ask-unavailable` while `interests-box` and `quick-links` stay visible | API + spec |
| The request to the model has no attendee name or email | API: stub records the request body; assert it contains the question, the saved note and a programme title, and neither `user.name` nor `user.email` of the asking attendee | API |
| A spec covers asking and following a result | `home.spec.js` "ask the assistant and follow a result", both projects, lane `home.ask` | spec |

## Decisions
No Done-when criterion already holds on main (no route, function or field exists).
- Is a failing model a 200 `{ available: false }` rather than a 502 — OK?
- Is the question capped at 300 characters and the answer at 5 sessions — OK?
- Does the browser spec stub the answer at the browser (`page.route`) and leave the model call to
  the API test, rather than starting a stub model server for the dev API — OK?
- Is the Ask button usable with an empty interests box (the note is optional), sending an empty
  interests string — OK?
- Should a question with no matching sessions show "No matching sessions" instead of a blank area — OK?

## Out of scope
Streaming, conversation history, storing or rating answers, showing the answer anywhere but Home,
authentication, a live model in any test or in CI.
