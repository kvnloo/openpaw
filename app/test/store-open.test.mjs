// node --test app/test/
// app/store.js is the one IndexedDB store every app page shares. openDb() caches its promise so the
// pages share one connection. It also cached a FAILED open: one transient error (another tab holding
// an older version open, a storage hiccup, private-mode quota) left the page unable to save or read
// anything until a reload, with every tap rejecting the same old error. A failed open must be retried.
// IndexedDB is not in Node, so these tests use a minimal stand-in that only implements open().
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';

let n = 0;
const fresh = () => import(`../store.js?case=${++n}`); // new module instance = empty openDb cache

function fakeIdb(outcomes) {
  const calls = [];
  return {
    calls,
    open(name, version) {
      const ok = outcomes[Math.min(calls.length, outcomes.length - 1)];
      calls.push({ name, version });
      const r = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        if (ok) { r.result = { fake: 'db', n: calls.length }; r.onsuccess && r.onsuccess(); }
        else { r.error = new Error('open failed'); r.onerror && r.onerror(); }
      }, 0);
      return r;
    },
  };
}

test('a failed open is not cached: the next call opens again and succeeds', async () => {
  const idb = fakeIdb([false, true]);
  globalThis.indexedDB = idb;
  const S = await fresh();
  await assert.rejects(S.openDb(), /open failed/);
  const db = await S.openDb();
  assert.equal(idb.calls.length, 2);
  assert.equal(db.fake, 'db');
});

test('a successful open is shared: two calls, one connection', async () => {
  const idb = fakeIdb([true]);
  globalThis.indexedDB = idb;
  const S = await fresh();
  const [a, b] = await Promise.all([S.openDb(), S.openDb()]);
  assert.equal(a, b);
  assert.equal(await S.openDb(), a);
  assert.equal(idb.calls.length, 1);
  assert.deepEqual(idb.calls[0], { name: S.DB_NAME, version: S.DB_VERSION });
});

test('liveEvents hides retracted entries and the tombstones themselves', async () => {
  const S = await fresh();
  const a = S.ownerEvent({ dog: 'd', metric: 'behavior.calm', value: 1 });
  const b = S.ownerEvent({ dog: 'd', metric: 'behavior.reaction', value: 1 });
  const t = S.retractEvent('d', a.event_id);
  assert.deepEqual(S.liveEvents([a, b, t]).map((e) => e.event_id), [b.event_id]);
  assert.deepEqual(S.liveEvents([a, b]).map((e) => e.event_id), [a.event_id, b.event_id]);
});
