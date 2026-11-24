import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const rows = read('cases.jsonl').trimEnd().split('\n').map(line => JSON.parse(line));
const sources = new Map(read('sources.csv').trimEnd().split('\n').slice(1).map(line => {
  const [id, design, title, doi, pmc] = line.split(',');
  assert.ok(design && title && /^10\.\d+\/\S+$/.test(doi));
  assert.match(pmc, /^https:\/\/europepmc\.org\/articles\/PMC\d+$/);
  return [id, design];
}));
const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(read('schema.json')));

test('all published dogs conform to the schema', () => {
  for (const row of rows) assert.ok(validate(row), `${row.case_id}: ${JSON.stringify(validate.errors)}`);
});

test('stable unique case IDs and row-level source references', () => {
  const ids = new Set(), locations = new Set(), used = new Set();
  for (const row of rows) {
    const { case_id: id, source_id: source, source_location: location } = row;
    assert.ok(!ids.has(id) && id.startsWith(source + '-'), id);
    assert.ok(sources.has(source), id);
    assert.match(location, /Data!A\d+:BT\d+|Tables 1–2, dog [A-E]|§2, Case Presentation|PLOS S4 CSV record \d+/);
    const key = JSON.stringify([source, location]);
    assert.ok(!locations.has(key), key);
    ids.add(id);
    locations.add(key);
    used.add(source);
  }
  assert.deepEqual(used, new Set(sources.keys()));
  assert.equal(rows.length, 722);
  assert.equal(rows.filter(r => sources.get(r.source_id) === 'owner_survey').length, 639);
});

test('missing location, invalid values and undeclared fields are rejected', () => {
  const row = rows[0];
  assert.ok(!validate({ ...row, source_location: '  ' }));
  assert.ok(!validate({ ...row, source_location: undefined }));
  assert.ok(!validate({ ...row, proposed_stress_score: 5 }));
  assert.ok(!validate({ ...row, signalment: { ...row.signalment, neutered: 'yes' } }));
});
