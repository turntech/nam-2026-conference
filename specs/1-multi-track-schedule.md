# Select several tracks on the schedule
## What this changes
On `/schedule` the track pills toggle independently: any number can be on, each with `aria-pressed`, and the list shows sessions from any selected track (union). **All** clears the selection; turning off the last pill returns to All. The URL carries one `track` key, comma-separated; `?track=<one slug>` links behave as before. Any selection still forces the list view and disables Grid with the "a track filter" notice, once.
## Where
- `server/routes/sessions.js` — the `trackSlug` branch of `GET /`: split on commas (trim, drop empties) and emit `t.slug IN (?, ?)`; one value is the same query as today. Test in `tests/api/endpoints.test.js` (harness in `tests/api/harness.js`).
- `src/pages/SchedulePage.jsx` — `filters.track` stays the raw comma string (so `qs()`, `activeKeys` and `BLOCKERS` keep working, one blocker); derive `selectedTracks = filters.track === ALL ? [] : filters.track.split(',')`. Pill `onClick` toggles its slug in that list and calls `set('track', list.join(',') || ALL)`; All calls `set('track', ALL)`. Add `aria-pressed` to every track pill (All pressed when none selected). Test in `tests/schedule.spec.js`, read-only so no lane or booking; use `visit`, `waitForResults`, `conferenceDays()`.
- `context/engineering-context/schedule.md` — update the `trackSlug` row (line 32) and the track-pills/URL-key text (lines ~55-72).
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| API accepts `trackSlug=a,b` as a union | `trackSlug=a,b` returns the sessions of a plus b, count above either alone | API (`endpoints.test.js`) |
| Single `?track=<slug>` and existing endpoint tests unchanged | existing tests stay green; one-slug result equals today's | API |
| Two pills on with `aria-pressed="true"`; `result-count` equals API count for `a,b`; deselect one shrinks to the other; All clears; deselecting last shows all; Grid disabled with track notice | one spec: click a, click b, assert pressed and `result-count` vs API; click a off, assert count equals b's; click b off, assert All count; click a, b, All | UI spec (`schedule.spec.js`) |
## Decisions
- Is the seed's per-day track counts enough that two chosen tracks give a union larger than either alone (the spec picks a day where both have sessions)? OK?
## Out of scope
Multi-select for venue, level, format and topic.
