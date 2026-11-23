// OpenPaw collar protocol: decode BLE records and turn them into OpenPaw events.
// Shared by the browser app (app/index.html) and node tests (app/test/).
// Wire format is defined in firmware/openpaw-collar/openpaw_core.h (openpaw_encode).
// SPDX-License-Identifier: GPL-3.0-only

export const RECORD_SIZE = 20;
const uuid = (n) => `c0de000${n}-0be4-4f3a-9c1e-6f70656e7061`;
export const UUIDS = {
  service: uuid(1),
  live: uuid(2),
  log: uuid(3),
  control: uuid(4),
  status: uuid(5),
};
export const FLAGS = { HR_VALID: 1, CHARGING: 2, CLIPPED: 4, GAP: 8 };
export const BOARDS = { 1: 'xiao-nrf52840-sense', 2: 't1000-e' };
export const ALGORITHM_VERSION = 'openpaw-collar-core/1';

function view(bytes) {
  if (bytes instanceof DataView) return bytes;
  if (bytes instanceof ArrayBuffer) return new DataView(bytes);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// One 20-byte record -> object, or null for the end-of-dump marker (version 0xFF).
export function decodeRecord(bytes, offset = 0) {
  const v = view(bytes);
  const version = v.getUint8(offset);
  if (version === 0xff) return null;
  if (version !== 1) throw new Error(`unsupported record version ${version}`);
  const flags = v.getUint8(offset + 1);
  return {
    version,
    flags,
    seq: v.getUint32(offset + 2, true),
    uptime_s: v.getUint32(offset + 6, true),
    vedba_mean_mg: v.getUint16(offset + 10, true),
    vedba_max_mg: v.getUint16(offset + 12, true),
    active_frac: v.getUint8(offset + 14),
    pitch_deg: v.getInt8(offset + 15),
    roll_deg: v.getInt8(offset + 16) * 2,
    bursts: v.getUint8(offset + 17),
    hr_bpm: v.getUint8(offset + 18),
    battery_pct: v.getUint8(offset + 19),
    clipped: Boolean(flags & FLAGS.CLIPPED),
    gap: Boolean(flags & FLAGS.GAP),
  };
}

// A log notification carries N whole records. Returns {records, done}.
export function decodeChunk(bytes) {
  const v = view(bytes);
  if (v.byteLength % RECORD_SIZE !== 0) throw new Error(`chunk length ${v.byteLength} is not a multiple of ${RECORD_SIZE}`);
  const records = [];
  let done = false;
  for (let o = 0; o < v.byteLength; o += RECORD_SIZE) {
    const r = decodeRecord(v, o);
    if (r === null) { done = true; break; }
    records.push(r);
  }
  return { records, done };
}

export function decodeStatus(bytes) {
  const v = view(bytes);
  return {
    proto: v.getUint8(0),
    board: BOARDS[v.getUint8(1)] || `unknown-${v.getUint8(1)}`,
    epoch_s: v.getUint16(2, true),
    next_seq: v.getUint32(4, true),
    uptime_s: v.getUint32(8, true),
    stored: v.getUint32(12, true),
  };
}

export function encodeDumpFrom(fromSeq) {
  const b = new Uint8Array(5);
  b[0] = 0x01;
  new DataView(b.buffer).setUint32(1, fromSeq >>> 0, true);
  return b;
}
export const CMD_STOP = Uint8Array.of(0x02);
export const CMD_FIND_ME = Uint8Array.of(0x10);

// Standard BLE Heart Rate Measurement (0x2A37), e.g. a Polar H10 chest strap.
// Returns bpm, RR intervals in ms (for HRV), and whether skin contact is detected.
export function parseHeartRate(bytes) {
  const v = view(bytes);
  const flags = v.getUint8(0);
  let o = 1;
  const bpm = flags & 0x01 ? v.getUint16(o, true) : v.getUint8(o);
  o += flags & 0x01 ? 2 : 1;
  const contactSupported = Boolean(flags & 0x04);
  const contact = contactSupported ? Boolean(flags & 0x02) : null;
  if (flags & 0x08) o += 2;  // energy expended
  const rr_ms = [];
  if (flags & 0x10) for (; o + 1 < v.byteLength; o += 2) rr_ms.push(Math.round((v.getUint16(o, true) / 1024) * 1000));
  return { bpm, rr_ms, contact };
}

// Map device uptime to wall-clock time. The collar has no clock; the app records
// (wall time, device uptime) when it reads the status characteristic.
export function makeClock(anchorWallMs, anchorUptimeS) {
  return (uptime_s) => new Date(anchorWallMs + (uptime_s - anchorUptimeS) * 1000).toISOString();
}

// One collar record -> OpenPaw v0.1 measurement events (schema/openpaw-event.schema.json).
export function recordToEvents(rec, { dogId, deviceId, clock, epochS = 5, origin = 'sensor' }) {
  const ts = clock(rec.uptime_s);
  const base = (metric, value, unit, extra = {}) => ({
    schema_version: '0.1',
    event_id: `${deviceId}:${rec.seq}:${metric}`,
    dog_id: dogId,
    timestamp: ts,
    episode_id: null,
    event_type: 'measurement',
    provenance: {
      origin,
      source_id: deviceId,
      algorithm_version: ALGORITHM_VERSION,
      confidence: null,
      device_seq: rec.seq,
      device_uptime_s: rec.uptime_s,
      quality: { clipped: rec.clipped, gap: rec.gap },
    },
    payload: { metric, value, unit, window_s: epochS, method: extra.method || null, ...extra.payload },
  });
  const ev = [
    base('movement.vedba_mean', rec.vedba_mean_mg, 'mg', { method: 'vectorial dynamic body acceleration, EMA gravity tau 2 s' }),
    base('movement.vedba_max', rec.vedba_max_mg, 'mg'),
    base('movement.active_fraction', Math.round((rec.active_frac / 255) * 1000) / 1000, 'ratio', { payload: { threshold_mg: 120 } }),
    base('movement.bursts', rec.bursts, 'count', { payload: { threshold_mg: 1500 } }),
    base('posture.pitch', rec.pitch_deg, 'deg'),
    base('posture.roll', rec.roll_deg, 'deg'),
  ];
  if (rec.hr_bpm) ev.push(base('physiology.heart_rate', rec.hr_bpm, 'bpm'));
  if (rec.battery_pct !== 255) ev.push(base('device.battery', rec.battery_pct, 'percent'));
  return ev;
}

export function heartRateToEvents(hr, { dogId, deviceId, timestamp, seq }) {
  const ev = [{
    schema_version: '0.1',
    event_id: `${deviceId}:hr:${seq}`,
    dog_id: dogId,
    timestamp,
    episode_id: null,
    event_type: 'measurement',
    provenance: { origin: 'sensor', source_id: deviceId, algorithm_version: null, confidence: null, skin_contact: hr.contact },
    payload: { metric: 'physiology.heart_rate', value: hr.bpm, unit: 'bpm', window_s: 1, method: 'BLE Heart Rate Service (chest strap)' },
  }];
  if (hr.rr_ms.length) {
    ev.push({ ...ev[0], event_id: `${deviceId}:rr:${seq}`, payload: { metric: 'physiology.rr_intervals', value: hr.rr_ms, unit: 'ms', window_s: 1, method: 'beat-to-beat RR from chest strap' } });
  }
  return ev;
}

export function toJsonl(events) {
  return events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
}
