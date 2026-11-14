import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAgenda, keysDeep, startApi } from './harness.js';

/**
 * The optional "describe your interests" note — `/api/users/:id/interest-note`.
 * It is stored apart from `users`, so only this endpoint ever returns it.
 */

let api;
let close;

before(async () => { ({ api, close } = await startApi()); });
after(() => close());

const path = (id) => `/users/${id}/interest-note`;

describe('Interest note', () => {
  test('starts empty, saves, is replaced, and clears', async () => {
    const id = 1;
    assert.deepEqual((await api.get(path(id))).body, { text: '' });

    const saved = await api.put(path(id), { text: 'Edge AI and accessibility' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, { text: 'Edge AI and accessibility' });
    assert.deepEqual((await api.get(path(id))).body, { text: 'Edge AI and accessibility' });

    await api.put(path(id), { text: 'Just databases' });
    assert.deepEqual((await api.get(path(id))).body, { text: 'Just databases' });

    assert.deepEqual((await api.put(path(id), { text: '' })).body, { text: '' });
    assert.deepEqual((await api.get(path(id))).body, { text: '' });

    await api.put(path(id), { text: 'again' });
    await api.put(path(id), { text: '   ' });
    assert.deepEqual((await api.get(path(id))).body, { text: '' });
  });

  test('500 characters is accepted, 501 is rejected and changes nothing', async () => {
    const id = 2;
    await api.put(path(id), { text: 'kept' });
    assert.equal((await api.put(path(id), { text: 'x'.repeat(501) })).status, 400);
    assert.deepEqual((await api.get(path(id))).body, { text: 'kept' });
    assert.equal((await api.put(path(id), { text: 'x'.repeat(500) })).status, 200);
    assert.equal((await api.get(path(id))).body.text.length, 500);
    // an emoji counts as one character
    assert.equal((await api.put(path(id), { text: '😀'.repeat(500) })).status, 200);
    assert.equal((await api.put(path(id), { text: '😀'.repeat(501) })).status, 400);
  });

  test('a non-string text is a 400, an unknown attendee a 404', async () => {
    const id = 3;
    for (const text of [42, null, ['a'], undefined]) {
      assert.equal((await api.put(path(id), { text })).status, 400);
    }
    assert.equal((await api.get(path(99999))).status, 404);
    assert.equal((await api.put(path(99999), { text: 'hi' })).status, 404);
  });

  test('works for an attendee holding no seats', async () => {
    const id = 4;
    await clearAgenda(api, id);
    assert.equal((await api.get(path(id))).status, 200);
    assert.equal((await api.put(path(id), { text: 'no seats yet' })).status, 200);
    assert.equal((await api.get(path(id))).body.text, 'no seats yet');
  });

  test('is returned by no other endpoint', async () => {
    const id = 5;
    const marker = 'zq-unique-interest-marker';
    await api.put(path(id), { text: marker });
    for (const p of ['/users', `/users/${id}`, `/users/${id}/schedule`, `/users/${id}/today?day=2026-01-01&time=10:00`,
      `/users/${id}/agenda.ics`, '/bootstrap', '/sessions', '/speakers']) {
      const res = await api.get(p);
      assert.equal(res.status, 200, p);
      assert.ok(!res.text.includes(marker), `${p} leaks the note`);
      if (typeof res.body === 'object') {
        for (const key of keysDeep(res.body)) assert.ok(!/interest-?note|interestsText/i.test(key), `${p} has key ${key}`);
      }
    }
  });
});
