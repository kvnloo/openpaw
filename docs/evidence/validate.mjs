import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const fields = ['doi', 'url', 'year', 'design', 'n_dogs', 'population', 'measures',
  'main_finding', 'effect_direction', 'limitations', 'evidence_level', 'open_access',
  'tags', 'openpaw_use'];
const designs = new Set(['RCT', 'cohort', 'cross-sectional', 'case series', 'review',
  'meta-analysis', 'expert consensus', 'controlled experiment', 'validation study']);
const uses = new Set(['field mode', 'patterns', 'learn lesson', 'reactivity model',
  'collar analytics', 'vet view']);
const doiPattern = /^10\.\d{4,9}\/\S+$/i;

export function parseCard(text) {
  // Deliberately support only a flat YAML mapping with JSON-formatted values.
  // This lets us detect duplicate keys and validate without a YAML dependency.
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!header) throw new Error('missing front matter');
  const card = Object.create(null);
  for (const line of header[1].split(/\r?\n/)) {
    const pair = /^([a-z_]+): (.+)$/.exec(line);
    if (!pair || !fields.includes(pair[1]) || Object.hasOwn(card, pair[1]))
      throw new Error(`invalid or duplicate field: ${line}`);
    card[pair[1]] = JSON.parse(pair[2]);
  }
  for (const key of fields) if (!Object.hasOwn(card, key)) throw new Error(`missing ${key}`);
  const nonempty = x => typeof x === 'string' && x.trim().length > 0;
  for (const key of ['population', 'measures', 'main_finding', 'effect_direction', 'limitations'])
    if (!nonempty(card[key])) throw new Error(`invalid ${key}`);
  if (card.doi !== null && (!nonempty(card.doi) || !doiPattern.test(card.doi)))
    throw new Error('invalid DOI');
  if (!nonempty(card.url) || new URL(card.url).protocol !== 'https:') throw new Error('invalid URL');
  if (!Number.isInteger(card.year) || card.year < 1800 || card.year > new Date().getUTCFullYear() + 1)
    throw new Error('invalid year');
  if (!designs.has(card.design)) throw new Error('invalid design');
  if (card.n_dogs !== null && (!Number.isInteger(card.n_dogs) || card.n_dogs < 0))
    throw new Error('invalid n_dogs');
  if (!['A', 'B', 'C', 'D'].includes(card.evidence_level)) throw new Error('invalid evidence level');
  if (!['y', 'n'].includes(card.open_access)) throw new Error('invalid open-access flag');
  for (const key of ['tags', 'openpaw_use']) {
    const values = card[key];
    if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length ||
      !values.every(x => key === 'tags' ? typeof x === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x) : uses.has(x)))
      throw new Error(`invalid ${key}`);
  }
  return card;
}

export function validate(root = new URL('./', import.meta.url)) {
  const mdFiles = dir => readdirSync(new URL(dir, root), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort();
  const cards = new Set();
  const dois = new Set();
  const topics = mdFiles('topics/');
  let citations = 0;
  for (const name of mdFiles('cards/')) {
    try {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name)) throw new Error('invalid filename');
      const card = parseCard(readFileSync(new URL('cards/' + name, root), 'utf8'));
      const doi = card.doi?.toLowerCase();
      if (doi && dois.has(doi)) throw new Error(`duplicate DOI: ${doi}`);
      if (doi) dois.add(doi);
      cards.add(name);
    } catch (error) { throw new Error(`${name}: ${error.message}`); }
  }
  if (!cards.size || !topics.length) throw new Error('expected both cards and topic pages');
  for (const topic of topics) {
    const content = readFileSync(new URL('topics/' + topic, root), 'utf8');
    const links = [...content.matchAll(/\]\(\.\.\/cards\/([^\s)]+)\)/g)];
    if (!links.length) throw new Error(`${topic}: no card citations`);
    for (const [, card] of links) {
      if (!cards.has(card)) throw new Error(`${topic}: missing card ${card}`);
      citations++;
    }
  }
  return { cards: cards.size, dois: dois.size, topics: topics.length, citations };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  console.log(JSON.stringify(validate()));
