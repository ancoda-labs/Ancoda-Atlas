// Grouping and de-duplication of BIPAD district contacts for the desk.
//
// Run: node --experimental-strip-types --test test/contact-groups.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBipadContact,
  classifyPortalContact,
  dedupeBipadContacts,
  dialKey,
  filterDirectory,
  filterPortalDirectory,
  flattenPortalContacts,
  normalizePhone,
  parseContactQuery,
  structureDistrict,
  structurePortalContacts,
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

test('a district name query keeps the whole directory', () => {
  const directory = [structureDistrict({
    id: 23,
    name: 'Rasuwa',
    nameNe: 'रसुवा',
    contacts: [
      row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', true),
      row('9851110001', 'Ganesh', 'Ward Chairman -1'),
    ],
  })];
  const byLatin = filterDirectory(directory, 'Rasuwa');
  assert.equal(byLatin.length, 1);
  assert.equal(byLatin[0].unique, 2);
  const byNe = filterDirectory(directory, 'रसुवा');
  assert.equal(byNe[0].unique, 2);
});

test('a person or number query keeps only the matching lines', () => {
  const directory = [structureDistrict({
    id: 23,
    name: 'Rasuwa',
    nameNe: 'रसुवा',
    contacts: [
      row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', true),
      row('9851110001', 'Ganesh', 'Ward Chairman -1'),
    ],
  })];
  const byName = filterDirectory(directory, 'ashok');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].unique, 1);
  assert.equal(byName[0].groups[0].contacts[0].name, 'Ashok Kumar Chaudhary');
  const byPhone = filterDirectory(directory, '985285');
  assert.equal(byPhone[0].unique, 1);
  assert.equal(normalizePhone(byPhone[0].groups[0].contacts[0].phone), '9852851030');
});

test('an unmatched query hides the district rather than leaving a heading', () => {
  const directory = [structureDistrict({
    id: 23,
    name: 'Rasuwa',
    nameNe: 'रसुवा',
    contacts: [row('9852851030', 'Ashok Kumar Chaudhary', 'Computer Operator', true)],
  })];
  assert.deepEqual(filterDirectory(directory, 'zzz'), []);
  assert.deepEqual(parseContactQuery('  '), []);
  assert.equal(filterDirectory(directory, '').length, 1);
});

function portal(partial) {
  return {
    id: partial.id || Math.random().toString(36).slice(2),
    name: partial.name || 'Line',
    nameNe: partial.nameNe || null,
    organization: partial.organization || null,
    category: partial.category || 'OTHER',
    phones: partial.phones || ['100'],
    email: null,
    description: null,
    descriptionNe: null,
    district: partial.district || null,
    isNationwide: partial.isNationwide ?? true,
    available24x7: partial.available24x7 ?? true,
  };
}

test('portal 100 sits with emergency, Rasuwa police stays local', () => {
  assert.equal(
    classifyPortalContact(portal({ category: 'POLICE', phones: ['100'], isNationwide: true })),
    'emergency',
  );
  assert.equal(
    classifyPortalContact(portal({
      name: 'NDRRMA Emergency Operation Centre',
      category: 'DISASTER_AUTHORITY',
      phones: ['1155'],
      isNationwide: true,
    })),
    'emergency',
  );
  assert.equal(
    classifyPortalContact(portal({
      name: 'Rasuwa District Police Office',
      category: 'POLICE',
      phones: ['010-540099'],
      district: 'Rasuwa',
      isNationwide: false,
    })),
    'local',
  );
  assert.equal(
    classifyPortalContact(portal({
      name: 'Nepal Red Cross Society Headquarters',
      category: 'RED_CROSS',
      phones: ['01-4270650'],
      isNationwide: true,
    })),
    'welfare',
  );
});

test('the portal dump is one row per number, grouped for a caller', () => {
  const structured = structurePortalContacts([
    portal({ name: 'Nepal Police Emergency', category: 'POLICE', phones: ['100'] }),
    portal({ name: 'Nepal Police Emergency', category: 'POLICE', phones: ['100'] }),
    portal({
      name: 'NDRRMA Emergency Operation Centre',
      category: 'DISASTER_AUTHORITY',
      phones: ['1155', '01-4211213'],
    }),
    portal({
      name: 'MOFA Emergency Control Room',
      category: 'DISASTER_AUTHORITY',
      phones: ['9744441227'],
    }),
    portal({
      name: 'Rasuwa District Police Office',
      category: 'POLICE',
      phones: ['010-540099'],
      district: 'Rasuwa',
      isNationwide: false,
    }),
    portal({
      name: 'Rasuwa District Hospital',
      category: 'HOSPITAL',
      phones: ['010-540006'],
      district: 'Rasuwa',
      isNationwide: false,
    }),
    portal({
      name: 'Bir Hospital Emergency Ward',
      category: 'HOSPITAL',
      phones: ['01-4221119'],
      district: 'Kathmandu',
      isNationwide: false,
    }),
  ]);
  assert.equal(structured.unique, 7);
  assert.deepEqual(
    structured.groups.map(g => [g.bucket, g.contacts.length]),
    [
      ['emergency', 2],
      ['authority', 2],
    ],
  );
  assert.deepEqual(
    structured.local.map(d => [d.name, d.contacts.length]),
    [
      ['Kathmandu', 1],
      ['Rasuwa', 2],
    ],
  );
});

test('a second listing of the same portal number is dropped', () => {
  const lines = flattenPortalContacts([
    portal({ name: 'Police', phones: ['100', '100'] }),
    portal({ name: 'Police again', phones: ['+977-100'] }),
  ]);
  assert.equal(lines.length, 1);
  assert.equal(dialKey(lines[0].phone), '100');
});

test('a portal district-name query keeps that district’s lines', () => {
  const portalDir = structurePortalContacts([
    portal({ name: 'Nepal Police Emergency', category: 'POLICE', phones: ['100'] }),
    portal({
      name: 'Rasuwa District Police Office',
      category: 'POLICE',
      phones: ['010-540099'],
      district: 'Rasuwa',
      isNationwide: false,
    }),
  ]);
  const byDistrict = filterPortalDirectory(portalDir, 'Rasuwa');
  assert.equal(byDistrict.unique, 1);
  assert.equal(byDistrict.local.length, 1);
  assert.equal(byDistrict.groups.length, 0);
  const byNumber = filterPortalDirectory(portalDir, '100');
  assert.equal(byNumber.unique, 1);
  assert.equal(byNumber.groups[0].bucket, 'emergency');
});
