// Grouping and de-duplication of BIPAD district contacts for the desk.
//
// Run: node --experimental-strip-types --test test/contact-groups.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBipadContact,
  dedupeBipadContacts,
  normalizePhone,
  structureDistrict,
} from '../src/lib/contact-groups.ts';

function row(phone, name, position, drrFocal = false) {
  return { id: Math.random(), name, position, phone, email: null, drrFocal };
}

test('leading zero and country code collapse to the same number', () => {
  assert.equal(normalizePhone('09845051595'), '9845051595');
  assert.equal(normalizePhone('+977-985-285-1030'), '9852851030');
  assert.equal(normalizePhone('9852851030'), '9852851030');
});

test('the same officer listed five times is one row, keeping the focal flag', () => {
  const unique = dedupeBipadContacts([
    row('9852851030', 'अशोक कुमार चौधरी', 'कम्प्युटर अपरेटर', true),
    row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', true),
    row('9852851030', 'Ashok Kumar Chaudhary', 'CO', true),
    row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', false),
    row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', false),
  ]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].drrFocal, true);
  assert.equal(normalizePhone(unique[0].phone), '9852851030');
  assert.equal(unique[0].name, 'Ashok Kumar Chaudhary / अशोक कुमार चौधरी');
  assert.equal(unique[0].position, 'Computer Operator');
});

test('two people on one switchboard keep both names', () => {
  const unique = dedupeBipadContacts([
    row('9851295555', 'विपिन रेग्मी', 'प्रहरी उपरीक्षक'),
    row('9851295555', 'Someone Else', 'Duty officer'),
  ]);
  assert.equal(unique.length, 1);
  assert.match(unique[0].name, /विपिन रेग्मी/);
  assert.match(unique[0].name, /Someone Else/);
});

test('roles land on the shelf a caller would look for', () => {
  assert.equal(
    classifyBipadContact(row('1', 'Ashok', 'Computer Operator', true)),
    'focal',
  );
  assert.equal(
    classifyBipadContact(row('1', 'शम्भु प्रसाद रेग्मी', 'प्रमुख जिल्ला अधिकारी')),
    'dao',
  );
  assert.equal(
    classifyBipadContact(row('1', 'विपिन रेग्मी', 'प्रहरी उपरीक्षक')),
    'security',
  );
  assert.equal(
    classifyBipadContact(row('1', 'Raju Gurung', 'Mayor', true)),
    'focal',
  );
  assert.equal(
    classifyBipadContact(row('1', 'Ganesh Bahadur Gurung', 'Ward Chairman -1')),
    'ward',
  );
  assert.equal(classifyBipadContact(row('1', 'रोशनी बोट', 'स्वयंसेवक')), 'volunteer');
  assert.equal(classifyBipadContact(row('1', 'Bimal Dhakal', 'Member')), 'committee');
  assert.equal(
    classifyBipadContact(row('1', 'Surya Bahadur Tamang', 'Chief Administration Officer')),
    'municipal',
  );
});

test('a district directory leads with unique focals, not the raw dump', () => {
  const structured = structureDistrict({
    id: 23,
    name: 'Rasuwa',
    nameNe: 'रसुवा',
    contacts: [
      row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', true),
      row('9852851030', 'Ashok Kumar Chaudhary', 'CO', true),
      row('9803929080', 'Purna Bahadur Bulun', 'Officer', true),
      row('9851430233', 'Surya Bahadur Tamang', 'Chief Administration Officer'),
      row('9851110001', 'Ganesh', 'Ward Chairman -1'),
      row('9851110002', 'Maya', 'स्वयंसेवक'),
    ],
  });
  assert.equal(structured.slug, 'rasuwa');
  assert.equal(structured.unique, 5);
  assert.deepEqual(
    structured.groups.map(g => [g.bucket, g.contacts.length]),
    [
      ['focal', 2],
      ['municipal', 1],
      ['ward', 1],
      ['volunteer', 1],
    ],
  );
});
