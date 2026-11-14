# Home: describe your interests in your own words (optional)

## What this changes
Home gains an optional box, "Describe your interests in your own words", for whoever is
selected in the header, with or without any seats. Typing and pressing Save stores the text
(at most 500 characters) for that attendee; a live "N left" count shows under the box. It is
still there after a reload, can be edited, and can be cleared (Save with an empty box, or a
Clear button). The text is stored on its own and is returned only by one per-attendee
endpoint, so no other page, payload or `.ics` carries it; My Agenda is untouched.

## Where
- `server/db.js` — add `interest_notes (user_id PK REFERENCES users ON DELETE CASCADE, body TEXT NOT NULL, updated_at TEXT)` to `SCHEMA`, and `DROP TABLE IF EXISTS interest_notes` first in `dropAll()`. A new table, not a column on `users`: `toUser` is used for `/users` and `/users/:id`, and `users.interests` already means the seeded comma-separated tags.
- `server/routes/users.js` — module-scope statements next to `follow`/`unfollow`; `GET /:id/interest-note` → `{ text }` (`''` if none, 404 unknown attendee), `PUT /:id/interest-note` body `{ text }` → 400 if `text` is not a string or longer than 500 characters (counted with `Array.from(text).length`), a blank string deletes the row, otherwise upserts; returns `{ text }`. Nothing is added to `GET /:id`, `schedule`, `today`, `agenda.ics` or `/bootstrap`.
- `src/lib/api.js` — `getInterestNote(userId)` and `saveInterestNote(userId, text)`; the only `fetch` caller.
- `src/pages/HomePage.jsx` — new `InterestsBox` (testids `interests-box`, `interests-input`, `interests-remaining`, `interests-save`, `interests-clear`) in `HomePage` after `QuickLinks`; loads with `useFetch(() => api.getInterestNote(currentUserId), [currentUserId])` from `useConference()`, 500 limit as a const, toast on failure via existing store toast. It reads nothing about seats.
- API test `tests/api/interest-note.test.js` using `startApi`, `clearAgenda`, `keysDeep` from `tests/api/harness.js`; each test uses its own attendee (one `clearAgenda`d to hold zero seats).
- Spec `tests/home.spec.js` — new `describe` using `visit`, `laneFor('home.interests', testInfo)`.
- `tests/helpers.js` `LANES` — add `'home.interests': { desktop: { user: kenji, day: 1, agenda: false }, mobile: { user: marcus, day: 2, agenda: false } }` (books nothing, so `agenda: false`; pairs checked free against every row, `tests/unit/lanes.test.js` enforces it).
- `context/engineering-context/ui.md` (HomePage part) and `seats.md`'s routes note or `architecture.md` — document the box and the endpoint.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Saves, survives reload, editable, clearable | spec: type, Save, `page.reload()`, box holds text; edit and Save, reload; Clear, reload, box empty. API: PUT then GET returns it, PUT again replaces, PUT `''` then GET `''` | spec + API |
| Over 500 rejected; UI shows remaining count | API: 500 chars -> 200, 501 -> 400 and stored text unchanged, non-string -> 400. Spec: `interests-remaining` reads "500 left" empty, "488 left" after 12 characters, and Save is disabled past the limit | API + spec |
| Shows for an attendee with zero seats | API: after `clearAgenda`, GET and PUT succeed (no seat gate). Spec: box is visible on Home for the lane attendee | API + spec |
| Appears in no other page or shared endpoint | API: after saving a unique marker, `/users`, `/users/:id`, `/schedule`, `/today`, `agenda.ics`, `/bootstrap`, `/sessions`, `/speakers` contain no marker and `interests-text` key. Spec: `/my-agenda` body text lacks the marker | API + spec |
| API test and spec, each with own lane | `interest-note.test.js` (own attendee per test, throwaway DB); `home.interests` lane | API + spec |

## Decisions
No Done-when criterion already holds on main (no box, endpoint or table exists).
- The text lives in its own table behind `GET`/`PUT /api/users/:id/interest-note`, not in `users.interests` (existing seeded tags, already in every `/users` payload).
- The 500 limit counts characters (Array.from), so an emoji is one.
- A blank or whitespace-only save clears the text.
- "Zero seats" is proved at the API (`clearAgenda`) plus the box rendering with no seat read, not by emptying a seeded attendee's whole plan in the browser.

## Out of scope
Using the text anywhere (My Agenda, suggestions, Home), tag-style `users.interests`, authentication.
