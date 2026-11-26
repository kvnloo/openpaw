// node --test app/test/
// When another tab opens the 'openpaw' DB at a newer DB_VERSION (a new deploy), this tab's connection
// closes itself (store-open.test) and its next open rejects with VersionError: this page's code is
// older than the data. Until now the owner only learned that when a tap failed to save. The store
// must mark the tab stale and show one reload notice as soon as that happens, and only then: an
// ordinary open failure (storage hiccup) is retried, not reported as "out of date".
// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';

let n = 0;
const fresh = () => import(`../store.js?stale=${++n}`); // new module instance = empty cache + state

// Minimal DOM stand-in: only what a notice needs (create, find by id, put at the top of body).
function fakeDoc() {
  const byId = new Map();
  const mk = (tag) => {
    const el = { tagName: tag.toUpperCase(), children: [], attrs: {}, textContent: '', className: '', listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      append(...c) { this.children.push(...c); c.forEach(reg); }, addEventListener(t, f) { this.listeners[t] = f; } };
    Object.defineProperty(el, 'id', { get() { return this._id; }, set(v) { this._id = v; } });
    return el;
  };
  const reg = (el) => { if (el && el.id) byId.set(el.id, el); (el && el.children || []).forEach(reg); };
  const body = mk('body');
  body.prepend = (...c) => { body.children.unshift(...c); c.forEach(reg); };
  return { body, createElement: mk, getElementById: (id) => byId.get(id) || null };
}
const text = (el) => [el.textContent, ...el.children.map(text)].join(' ');
const notices = (doc) => doc.body.children.filter((c) => c.id === 'op-stale');

function idb({ fail = null } = {}) {
  const dbs = [];
  return {
    dbs,
    open() {
      const r = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        if (fail) { r.error = Object.assign(new Error(fail), { name: fail }); r.onerror && r.onerror(); return; }
        const db = { closed: false, onversionchange: null, onclose: null, close() { this.closed = true; } };
        dbs.push(db); r.result = db; r.onsuccess && r.onsuccess();
      }, 0);
      return r;
    },
  };
}

test('versionchange from a newer tab marks this tab stale and shows one reload notice', async () => {
  globalThis.indexedDB = idb();
  globalThis.document = fakeDoc();
  const S = await fresh();
  const db = await S.openDb();
  assert.equal(S.staleReason(), null);
  db.onversionchange({ oldVersion: S.DB_VERSION, newVersion: S.DB_VERSION + 1 });
  assert.equal(S.staleReason(), 'versionchange');
  const [box, ...more] = notices(document);
  assert.ok(box, 'notice inserted at the top of body');
  assert.equal(more.length, 0);
  assert.equal(box.getAttribute('role'), 'alert');
  assert.match(text(box), /another tab/i);
  assert.match(text(box), /reload/i);
  const btn = box.children.find((c) => c.tagName === 'BUTTON');
  assert.ok(btn && typeof btn.listeners.click === 'function', 'a Reload button');
  db.onversionchange({ oldVersion: S.DB_VERSION, newVersion: S.DB_VERSION + 1 });
  assert.equal(notices(document).length, 1, 'shown once, not stacked');
});

test('an open rejected with VersionError marks the tab stale and shows the notice', async () => {
  globalThis.indexedDB = idb({ fail: 'VersionError' });
  globalThis.document = fakeDoc();
  const S = await fresh();
  await assert.rejects(S.openDb(), (e) => e.name === 'VersionError');
  assert.equal(S.staleReason(), 'VersionError');
  assert.equal(notices(document).length, 1);
});

test('any other open failure is not reported as out of date (negative control)', async () => {
  globalThis.indexedDB = idb({ fail: 'UnknownError' });
  globalThis.document = fakeDoc();
  const S = await fresh();
  await assert.rejects(S.openDb());
  assert.equal(S.staleReason(), null);
  assert.equal(notices(document).length, 0);
});

test('without a document (worker, Node) going stale does not throw', async () => {
  globalThis.indexedDB = idb();
  delete globalThis.document;
  const S = await fresh();
  const db = await S.openDb();
  assert.doesNotThrow(() => db.onversionchange({}));
  assert.equal(S.staleReason(), 'versionchange');
});
