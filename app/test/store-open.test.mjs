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

// Another tab opening a newer DB_VERSION (a new deploy) fires 'versionchange' on this connection. If
// it stays open, that tab's upgrade is 'blocked' until this one is closed. The connection must close
// itself and leave the cache, so the next openDb() opens again instead of reusing a dead connection.
function closableIdb() {
  const calls = [];
  return {
    calls,
    open(name, version) {
      const db = { n: calls.length + 1, closed: false, onversionchange: null, onclose: null, close() { this.closed = true; } };
      calls.push(db);
      const r = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => { r.result = db; r.onsuccess && r.onsuccess(); }, 0);
      return r;
    },
  };
}

test('versionchange from another tab: the connection closes and the next openDb() opens again', async () => {
  const idb = closableIdb();
  globalThis.indexedDB = idb;
  const S = await fresh();
  const db = await S.openDb();
  assert.equal(typeof db.onversionchange, 'function');
  db.onversionchange({ oldVersion: S.DB_VERSION, newVersion: S.DB_VERSION + 1 });
  assert.equal(db.closed, true);
  const db2 = await S.openDb();
  assert.notEqual(db2, db);
  assert.equal(idb.calls.length, 2);
});

test('a connection the browser closes (onclose) is not reused', async () => {
  const idb = closableIdb();
  globalThis.indexedDB = idb;
  const S = await fresh();
  const db = await S.openDb();
  assert.equal(typeof db.onclose, 'function');
  db.onclose();
  const db2 = await S.openDb();
  assert.notEqual(db2, db);
  assert.equal(idb.calls.length, 2);
});

test('liveEvents hides retracted entries and the tombstones themselves', async () => {
  const S = await fresh();
  const a = S.ownerEvent({ dog: 'd', metric: 'behavior.calm', value: 1 });
  const b = S.ownerEvent({ dog: 'd', metric: 'behavior.reaction', value: 1 });
  const t = S.retractEvent('d', a.event_id);
  assert.deepEqual(S.liveEvents([a, b, t]).map((e) => e.event_id), [b.event_id]);
  assert.deepEqual(S.liveEvents([a, b]).map((e) => e.event_id), [a.event_id, b.event_id]);
});
