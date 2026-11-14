import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { startApi } from './harness.js';

/**
 * "Ask what to attend" — `POST /api/users/:id/ask`. The model is a local
 * `node:http` stub standing in for OpenRouter; nothing here reaches the network.
 */

let api;
let close;
let stub;
let received;
let reply; // (req body) => { status, body } the stub answers with

before(async () => {
  stub = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      received.push({ url: req.url, auth: req.headers.authorization, raw });
      const { status, body } = reply(raw);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });
  stub.listen(0, '127.0.0.1');
  await once(stub, 'listening');
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${stub.address().port}`;
  process.env.OPENROUTER_API_KEY = 'test-key';
  ({ api, close } = await startApi());
});
after(async () => {
  await close();
  await new Promise((done) => stub.close(done));
});
beforeEach(() => { received = []; reply = () => ({ status: 500, body: {} }); });

const completion = (content) => ({ choices: [{ message: { content } }] });
const answerIds = (ids) => () => ({ status: 200, body: completion(JSON.stringify({ ids })) });
const ask = (id, question) => api.post(`/users/${id}/ask`, { question });

async function realSessions() {
  const { body } = await api.get('/sessions');
  const list = Array.isArray(body) ? body : body.sessions;
  return list;
}

describe('Ask the assistant', () => {
  test('returns the programme sessions the model names, with their details', async () => {
    const all = await realSessions();
    const [a, b] = [all[3], all[10]];
    reply = answerIds([a.id, b.id]);
    const res = await ask(1, 'What should I see about cloud costs?');
    assert.equal(res.status, 200);
    assert.equal(res.body.available, true);
    assert.deepEqual(res.body.sessions, [a, b].map((s) => ({
      id: s.id, title: s.title, trackName: s.track.name, day: s.day, startsAt: s.startsAt,
    })));
    assert.equal(received[0].url, '/chat/completions');
    assert.equal(received[0].auth, 'Bearer test-key');
  });

  test('drops ids that are not in the programme, and repeats', async () => {
    const [a] = await realSessions();
    reply = answerIds([a.id, 999999, 'x', a.id, null, 1.5]);
    const res = await ask(1, 'anything');
    assert.deepEqual(res.body.sessions.map((s) => s.id), [a.id]);
  });

  test('keeps at most five, in the model order', async () => {
    const all = await realSessions();
    const ids = all.slice(0, 8).map((s) => s.id).reverse();
    reply = answerIds(ids);
    const res = await ask(1, 'everything');
    assert.deepEqual(res.body.sessions.map((s) => s.id), ids.slice(0, 5));
  });

  test('a model that names nothing real gives an empty, available answer', async () => {
    reply = answerIds([999999]);
    const res = await ask(1, 'nothing');
    assert.deepEqual(res.body, { available: true, sessions: [] });
  });

  test('a failing, rate-limited or garbled model is unavailable, with a 200', async () => {
    for (const r of [
      { status: 500, body: {} },
      { status: 429, body: { error: 'slow down' } },
      { status: 200, body: 'not json at all' },
      { status: 200, body: completion('sure! try the keynote') },
      { status: 200, body: completion('{"ids":"nope"}') },
    ]) {
      reply = () => r;
      const res = await ask(1, 'q');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { available: false });
    }
  });

  test('with no key the model is never called', async () => {
    const key = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    // loadEnvFile may have been used; an absent key must stay absent
    try {
      reply = answerIds([1]);
      const res = await ask(1, 'q');
      assert.deepEqual(res.body, { available: false });
      assert.equal(received.length, 0);
    } finally {
      process.env.OPENROUTER_API_KEY = key;
    }
  });

  test('the request to the model holds the question, the note and the programme, but no name or email', async () => {
    const id = 2;
    const user = (await api.get('/users')).body.find((u) => u.id === id);
    assert.ok(user.name && user.email, 'the attendee has a name and an email to leak');
    await api.put(`/users/${id}/interest-note`, { text: 'quantum gardening' });
    const [a] = await realSessions();
    reply = answerIds([a.id]);
    await ask(id, 'where is the cloud costs talk?');

    const sent = received[0].raw;
    assert.ok(sent.includes('where is the cloud costs talk?'));
    assert.ok(sent.includes('quantum gardening'));
    assert.ok(sent.includes(a.title));
    assert.ok(!sent.includes(user.name), 'no attendee name');
    assert.ok(!sent.includes(user.email), 'no attendee email');
    assert.ok(!sent.toLowerCase().includes(String(user.name).split(' ')[0].toLowerCase()), 'no first name');
  });

  test('nothing is stored: the interest note is unchanged by asking', async () => {
    await api.put('/users/3/interest-note', { text: 'kept as is' });
    reply = answerIds([]);
    await ask(3, 'a question that must not be saved');
    assert.deepEqual((await api.get('/users/3/interest-note')).body, { text: 'kept as is' });
  });

  test('an empty interests note is allowed', async () => {
    await api.put('/users/4/interest-note', { text: '' });
    reply = answerIds([]);
    assert.equal((await ask(4, 'hello')).body.available, true);
  });

  test('a blank, missing, non-string or over-long question is a 400; an unknown attendee a 404', async () => {
    reply = answerIds([]);
    for (const question of ['', '   ', 42, null, undefined, 'x'.repeat(301)]) {
      assert.equal((await ask(1, question)).status, 400);
    }
    assert.equal((await ask(1, 'x'.repeat(300))).status, 200);
    assert.equal((await ask(99999, 'hi')).status, 404);
    assert.equal(received.length, 1, 'only the valid question reached the model');
  });
});
