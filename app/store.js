// OpenPaw local store: one IndexedDB database shared by every app page
// (collar, tracking, patterns, field/glasses mode, body-language trainer).
// Everything is an OpenPaw v0.1 event (schema/openpaw-event.schema.json). Nothing leaves the device
// unless the owner exports it.
// SPDX-License-Identifier: GPL-3.0-only

export const DB_NAME = 'openpaw';
export const DB_VERSION = 2;

let dbp = null;
export function openDb() {
  if (dbp) return dbp;
  const p = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'event_id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('trackers')) db.createObjectStore('trackers', { keyPath: 'id' });
    };
    r.onsuccess = () => {
      const db = r.result;
      const drop = () => { if (dbp === p) dbp = null; };
      // Another tab opening a newer version (a new deploy) waits ('blocked') while this connection
      // stays open: close it and forget it, so that tab upgrades and our next call opens again.
      db.onversionchange = () => { db.close(); drop(); };
      db.onclose = drop; // closed by the browser (storage cleared, disk error): don't reuse it
      res(db);
    };
    r.onerror = () => { if (dbp === p) dbp = null; rej(r.error); }; // don't cache a failure: the next call retries
  });
  dbp = p;
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function store(name, mode = 'readonly') { return (await openDb()).transaction(name, mode).objectStore(name); }

export async function putEvents(events) {
  const db = await openDb();
  await new Promise((res, rej) => {
    const t = db.transaction('events', 'readwrite');
    events.forEach((e) => t.objectStore('events').put(e));
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
export async function allEvents() { return req((await store('events')).getAll()); }
export async function countEvents() { return req((await store('events')).count()); }
export async function clearEvents() { return req((await store('events', 'readwrite')).clear()); }
export async function getMeta(k) { return req((await store('meta')).get(k)); }
export async function setMeta(k, v) { return req((await store('meta', 'readwrite')).put(v, k)); }
export async function listTrackers() { return req((await store('trackers')).getAll()); }
export async function putTracker(t) { return req((await store('trackers', 'readwrite')).put(t)); }
export async function deleteTracker(id) { return req((await store('trackers', 'readwrite')).delete(id)); }

export async function dogId() { return (await getMeta('dogId')) || 'my-dog'; }

// Events deleted by the owner are hidden by an appended tombstone, never by mutating history.
export function liveEvents(events) {
  const dead = new Set(events.filter((e) => e.payload && e.payload.metric === 'owner.retract').map((e) => e.payload.value));
  return events.filter((e) => !dead.has(e.event_id) && !(e.payload && e.payload.metric === 'owner.retract'));
}

export function uid(prefix = 'ev') {
  const r = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${r}`;
}

// A person-entered (or person-confirmed) event.
// kind: measurement | observation | context | trigger | intervention
export function ownerEvent({ dog, kind = 'observation', metric, value, unit = null, note = null, timestamp = new Date().toISOString(),
  episodeId = null, origin = 'owner', sourceId = 'openpaw-app', extra = {}, confidence = null, evidence = [] }) {
  return {
    schema_version: '0.1',
    event_id: uid(),
    dog_id: dog,
    timestamp,
    episode_id: episodeId,
    event_type: kind,
    provenance: { origin, source_id: sourceId, algorithm_version: null, confidence, evidence_event_ids: evidence },
    payload: { metric, value, unit, note, ...extra },
  };
}

export function retractEvent(dog, eventId) {
  return ownerEvent({ dog, kind: 'observation', metric: 'owner.retract', value: eventId, note: 'owner deleted this entry' });
}

export function download(name, text, type = 'application/x-ndjson') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
