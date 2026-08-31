// Loose matching for the rescued / missing-person registers.
//
// Run: node --experimental-strip-types --test test/person-search.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { foldName, matchScore, parseAgeField, parsePersonQuery } from '../src/lib/person-search.ts';

test('fold treats Bahadur and Bdr as the same stem', () => {
  assert.equal(foldName('Ram Bahadur'), foldName('Ram Bdr'));
});

test('Shrest matches Shrestha', () => {
  const q = parsePersonQuery('shrest');
  const hit = matchScore({
    foldedName: foldName('Sita Shrestha'),
    foldedHay: foldName('Sita Shrestha'),
    age: null,
    query: q,
  });
  assert.ok(hit > 0);
});

test('a two-word query needs both tokens', () => {
  const q = parsePersonQuery('ram timure');
  const hit = matchScore({
    foldedName: foldName('Ram Bahadur'),
    foldedHay: foldName('Ram Bahadur Timure Dhunche'),
    age: 40,
    query: q,
  });
  const miss = matchScore({
    foldedName: foldName('Ram Bahadur'),
    foldedHay: foldName('Ram Bahadur Kathmandu'),
    age: 40,
    query: q,
  });
  assert.ok(hit > 0);
  assert.equal(miss, 0);
});

test('name matches rank above place-only matches', () => {
  const q = parsePersonQuery('ram');
  const inName = matchScore({
    foldedName: foldName('Ram Bahadur'),
    foldedHay: foldName('Ram Bahadur Timure'),
    age: null,
    query: q,
  });
  const inPlace = matchScore({
    foldedName: foldName('Hari Magar'),
    foldedHay: foldName('Hari Magar Ramche'),
    age: null,
    query: q,
  });
  assert.ok(inName > inPlace);
  assert.ok(inPlace > 0);
});

test('intent words open a list without becoming search tokens', () => {
  const q = parsePersonQuery('missing ram');
  assert.equal(q.intent, 'missing');
  assert.deepEqual(q.tokens, [foldName('ram')]);
});

test('rescued and found intents are detected in both scripts', () => {
  assert.equal(parsePersonQuery('उद्धार राम').intent, 'rescued');
  assert.equal(parsePersonQuery('found hari').intent, 'found');
});

test('age in the query is a bonus, and age-only still matches', () => {
  const withName = parsePersonQuery('ram 40');
  assert.equal(withName.age, 40);
  const exact = matchScore({
    foldedName: foldName('Ram'),
    foldedHay: foldName('Ram Timure'),
    age: 40,
    query: withName,
  });
  const other = matchScore({
    foldedName: foldName('Ram'),
    foldedHay: foldName('Ram Timure'),
    age: 22,
    query: withName,
  });
  assert.ok(exact > other);

  const ageOnly = parsePersonQuery('40');
  assert.equal(ageOnly.tokens.length, 0);
  assert.equal(
    matchScore({ foldedName: 'x', foldedHay: 'x', age: 40, query: ageOnly }),
    30,
  );
  assert.equal(
    matchScore({ foldedName: 'x', foldedHay: 'x', age: 18, query: ageOnly }),
    0,
  );
});

test('Devanagari तामाङ matches latin Tamang', () => {
  const q = parsePersonQuery('tamang');
  const hit = matchScore({
    foldedName: foldName('रुबी तामाङ'),
    foldedHay: foldName('रुबी तामाङ कोलोनी'),
    age: 17,
    query: q,
  });
  assert.ok(hit > 0);
});

test('parseAgeField reads the portal’s string ages', () => {
  assert.equal(parseAgeField('30'), 30);
  assert.equal(parseAgeField('—'), null);
  assert.equal(parseAgeField(17), 17);
});
