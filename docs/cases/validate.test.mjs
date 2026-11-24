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

test('Monteny & Moons 2020 dogs match Table 1 (breed group, sex, neuter, age at first visit)', () => {
  // Table 1, doi:10.3390/ani10010161 — A/B Labrador retriever 14 mo, C Malinois 7 mo,
  // D Border collie 64 mo (neutered), E Shiba Inu 10 mo.
  const want = {
    A: ['retriever', 'male', false, '1_to_under_2y'],
    B: ['retriever', 'male', false, '1_to_under_2y'],
    C: ['herding', 'female', false, 'under_1y'],
    D: ['herding', 'male', true, '2_to_under_7y'],
    E: ['spitz', 'male', false, 'under_1y'],
  };
  for (const [key, [breed, sex, neutered, age]] of Object.entries(want)) {
    const s = rows.find(r => r.case_id === `monteny2020-${key}`).signalment;
    assert.deepEqual([s.breed_group, s.sex, s.neutered, s.age_band], [breed, sex, neutered, age], key);
  }
});

test('missing location, invalid values and undeclared fields are rejected', () => {
  const row = rows[0];
  assert.ok(!validate({ ...row, source_location: '  ' }));
  assert.ok(!validate({ ...row, source_location: undefined }));
  assert.ok(!validate({ ...row, proposed_stress_score: 5 }));
  assert.ok(!validate({ ...row, signalment: { ...row.signalment, neutered: 'yes' } }));
});
