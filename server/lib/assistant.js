/**
 * "Ask what to attend" — one call to a model on OpenRouter.
 *
 * The model gets the question, the attendee's own interests text and the
 * programme (id, title, track, day, start time). Never a name, an email or a
 * seat. Whatever it answers is reduced to ids that exist in the programme, so
 * a made-up session cannot reach the page. Nothing is stored.
 */

const MAX_RESULTS = 5;
const TIMEOUT_MS = 20_000;

let envLoaded = false;
function loadEnvOnce() {
  if (envLoaded) return;
  envLoaded = true;
  try { process.loadEnvFile(); } catch { /* no .env is fine */ }
}

const SYSTEM = `You recommend conference sessions. You are given a question, optionally the attendee's own
description of their interests, and the programme as JSON lines (id, title, track, day, start).
Answer with JSON only, in the form {"ids":[...]}: up to ${MAX_RESULTS} session ids from the programme,
best match first. Use only ids that appear in the programme.`;

/** Keep ids that are integers in the programme, de-duplicated, first MAX_RESULTS, model order. */
export function keepKnownIds(ids, programme) {
  if (!Array.isArray(ids)) return null;
  const known = new Set(programme.map((p) => p.id));
  const kept = [];
  for (const id of ids) {
    if (Number.isInteger(id) && known.has(id) && !kept.includes(id)) kept.push(id);
    if (kept.length === MAX_RESULTS) break;
  }
  return kept;
}

function parseIds(content) {
  if (typeof content !== 'string') return null;
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0])?.ids; } catch { return null; }
}

/**
 * @param {{ question: string, interests: string, programme: {id:number,title:string,trackName:string,day:string,startsAt:string}[] }} input
 * @returns {Promise<number[] | null>} programme ids, or null when the assistant is unavailable
 */
export async function askAssistant({ question, interests, programme }) {
  loadEnvOnce();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const base = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

  const lines = programme.map((p) =>
    JSON.stringify({ id: p.id, title: p.title, track: p.trackName, day: p.day, start: p.startsAt }));
  const user = `Question: ${question}\nInterests: ${interests || '(none given)'}\nProgramme:\n${lines.join('\n')}`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return keepKnownIds(parseIds(data?.choices?.[0]?.message?.content), programme);
  } catch {
    return null;
  }
}
