// Receipt for tools/collar_derive.py: build a JSONL export with the app's own code
// (recordToEvents + ownerEvent + toJsonl), 30 min of quiet epochs, a Field episode
// (trigger -> reaction -> calm), then write it to argv[2]. All data is simulated.
//   node tools/derive-receipt.mjs out.jsonl && python3 tools/collar_derive.py out.jsonl
// SPDX-License-Identifier: GPL-3.0-only
import { writeFileSync } from 'node:fs';
import { recordToEvents, makeClock, toJsonl } from '../app/openpaw-ble.js';
import { ownerEvent } from '../app/store.js';

const wall0 = Date.parse('2026-01-01T07:30:00Z');
const clock = makeClock(wall0, 0);
const opts = { dogId: 'synthetic-dog', deviceId: 'sim-collar', clock, origin: 'simulated' };
const quiet = [40, 55, 60, 45, 70, 50, 65, 80, 35, 50];
const burst = [600, 750, 900, 700, 500, 300, 200, 150];
const mg = [...Array.from({ length: 360 }, (_, i) => quiet[i % quiet.length]), ...burst, ...Array(60).fill(50)];
const events = [];
mg.forEach((v, seq) => events.push(...recordToEvents({
  seq, uptime_s: seq * 5, vedba_mean_mg: v, vedba_max_mg: v + 40, active_frac: v > 120 ? 0.8 : 0.1,
  pitch_deg: 2, roll_deg: -4, bursts: v > 500 ? 1 : 0, hr_bpm: 0, battery_pct: 255, clipped: false, gap: false, low_rate: false,
}, opts)));
const at = (s) => new Date(wall0 + (1800 + s) * 1000).toISOString();
const ep = 'ep:sim-1';
events.push(ownerEvent({ dog: 'synthetic-dog', kind: 'trigger', metric: 'trigger.seen', value: '10-20', timestamp: at(0), episodeId: ep, origin: 'simulated', sourceId: 'openpaw-field' }));
events.push(ownerEvent({ dog: 'synthetic-dog', kind: 'observation', metric: 'behavior.reacted', value: true, timestamp: at(8), episodeId: ep, origin: 'simulated', sourceId: 'openpaw-field' }));
events.push(ownerEvent({ dog: 'synthetic-dog', kind: 'observation', metric: 'behavior.calm', value: true, timestamp: at(90), episodeId: ep, origin: 'simulated', sourceId: 'openpaw-field' }));
writeFileSync(process.argv[2], toJsonl(events));
console.log(`wrote ${events.length} events to ${process.argv[2]}`);
