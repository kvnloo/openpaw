import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { parseCard, validate } from '../../docs/evidence/validate.mjs';

const example = readFileSync(new URL(
  '../../docs/evidence/cards/beerda1998-behavioural-saliva-cortisol-and-heart-rate-responses-to.md',
  import.meta.url), 'utf8');

test('evidence cards have valid headers and topic citations resolve', () => {
  assert.ok(validate().citations > 0);
});

test('evidence card parser rejects missing, duplicate and invalid fields', () => {
  assert.throws(() => parseCard('# No header'), /missing front matter/);
  assert.throws(() => parseCard('---\nyear: 2023\nyear: 2024\n---'), /duplicate field/);
  assert.throws(() => parseCard('---\nyear: 2024\n---'), /missing doi/);
  assert.throws(() => parseCard(example.replace(/open_access: "n"/, 'open_access: true')), /open-access/);
  assert.throws(() => parseCard(example.replace(/n_dogs: 10/, 'n_dogs: -1')), /invalid n_dogs/);
});

test('evidence validator rejects broken citations and case-insensitive duplicate DOIs', t => {
  const dir = mkdtempSync(join(tmpdir(), 'openpaw-evidence-'));
  mkdirSync(join(dir, 'cards'));
  mkdirSync(join(dir, 'topics'));
  t.after(() => {
    for (const name of ['topics/example.md', 'cards/example.md', 'cards/duplicate.md'])
      rmSync(join(dir, name), { force: true });
    rmdirSync(join(dir, 'topics'));
    rmdirSync(join(dir, 'cards'));
    rmdirSync(dir);
  });
  const root = pathToFileURL(dir + '/');
  writeFileSync(new URL('cards/example.md', root), example);
  writeFileSync(new URL('topics/example.md', root), '[broken](../cards/missing.md)');
  assert.throws(() => validate(root), /missing card missing\.md/);
  writeFileSync(new URL('topics/example.md', root), '[source](../cards/example.md)');
  writeFileSync(new URL('cards/duplicate.md', root),
    example.replace(/^doi: (.*)$/m, (_, doi) => 'doi: ' + doi.toUpperCase()));
  assert.throws(() => validate(root), /duplicate DOI/);
});
