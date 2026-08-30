// Overlay rules for the live Rasuwa flood bulletin sitrep.
//
// Run: node --experimental-strip-types --test test/sitrep-merge.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSitrep, shouldOverlay } from '../src/lib/sitrep-merge.ts';

const source = { label: 'Rasuwa flood bulletin (compilation)', url: 'https://nirajbhusal.github.io/rasuwa-flood-bulletin/' };

function deaths(total, items, extra = {}) {
  return {
    id: 'deaths',
    total,
    tone: 'critical',
    title_en: 'Deaths',
    title_ne: 'मृत्यु',
    items,
    ...extra,
  };
}

function reviewed() {
  return {
    as_of: '2026-08-30T15:00:00+05:45',
    as_of_label_en: '14 Bhadra, 15:00 (Nepal Police deaths; NDRRMA missing)',
    headline: [
      { id: 'deaths', value: 788, tone: 'critical', source: 'Nepal Police', label_en: 'Deaths', label_ne: 'मृत्यु' },
      { id: 'uncontacted', value: 2502, tone: 'critical', source: 'NDRRMA / MoHA', label_en: 'Uncontacted', label_ne: 'सम्पर्कविहीन' },
    ],
    breakdowns: [
      deaths(788, [
        { label_en: 'Chitwan', value: 264 },
        { label_en: 'Nawalparasi East', value: 194 },
        { label_en: 'Nawalparasi West', value: 120 },
        { label_en: 'Gorkha', value: 58 },
        { label_en: 'Nuwakot', value: 52 },
        { label_en: 'Dhading', value: 50 },
        { label_en: 'Tanahun', value: 37 },
        { label_en: 'Rasuwa', value: 13 },
      ]),
      {
        id: 'uncontacted',
        total: 2502,
        tone: 'critical',
        title_en: 'Uncontacted',
        title_ne: 'सम्पर्कविहीन',
        items: [{ label_en: 'Hydropower', value: 933 }, { label_en: 'Rest', value: 1569 }],
      },
    ],
    sources: [{ label: 'Nepal Police via Nepal News (14 Bhadra 15:00)', url: 'https://english.nepalnews.com/' }],
  };
}

test('a higher reconciling death toll replaces the reviewed one and the headline tile', () => {
  const live = {
    breakdowns: [
      deaths(800, [
        { label_en: 'Chitwan', value: 270 },
        { label_en: 'Nawalparasi East', value: 200 },
        { label_en: 'Nawalparasi West', value: 120 },
        { label_en: 'Gorkha', value: 58 },
        { label_en: 'Nuwakot', value: 52 },
        { label_en: 'Dhading', value: 50 },
        { label_en: 'Tanahun', value: 37 },
        { label_en: 'Rasuwa', value: 13 },
      ]),
    ],
    asOfLabelEn: '14 Bhadra',
    asOfLabelNe: '१४ भदौ',
    error: null,
    source,
    fetchedAt: '2026-08-30T16:00:00.000Z',
  };
  const merged = mergeSitrep(reviewed(), live);
  const deathsGroup = merged.breakdowns.find(b => b.id === 'deaths');
  assert.equal(deathsGroup.total, 800);
  assert.equal(merged.headline.find(h => h.id === 'deaths').value, 800);
  assert.equal(merged.discrepancies.length, 0);
  assert.ok(merged.sources.some(s => s.url === source.url));
});

test('a lower bulletin death toll does not overwrite Police 788', () => {
  const live = {
    breakdowns: [
      deaths(752, [
        { label_en: 'Chitwan', value: 259 },
        { label_en: 'Nawalparasi East', value: 184 },
        { label_en: 'Nawalparasi West', value: 100 },
        { label_en: 'Gorkha', value: 58 },
        { label_en: 'Nuwakot', value: 52 },
        { label_en: 'Dhading', value: 50 },
        { label_en: 'Tanahun', value: 36 },
        { label_en: 'Rasuwa', value: 13 },
      ]),
    ],
    asOfLabelEn: '14 Bhadra 13:00',
    asOfLabelNe: '१४ भदौ १३:००',
    error: null,
    source,
    fetchedAt: '2026-08-30T13:00:00.000Z',
  };
  const merged = mergeSitrep(reviewed(), live);
  assert.equal(merged.breakdowns.find(b => b.id === 'deaths').total, 788);
  assert.equal(merged.headline.find(h => h.id === 'deaths').value, 788);
  assert.equal(merged.as_of_label_en, reviewed().as_of_label_en);
});

test('a death panel whose districts do not add up is left as reviewed', () => {
  assert.equal(
    shouldOverlay(
      deaths(788, [{ label_en: 'Chitwan', value: 264 }]),
      deaths(810, [{ label_en: 'Chitwan', value: 264 }, { label_en: 'East', value: 194 }]),
    ),
    false,
  );
});

test('a failed scrape leaves the reviewed sitrep standing', () => {
  const merged = mergeSitrep(reviewed(), {
    breakdowns: [],
    asOfLabelEn: null,
    asOfLabelNe: null,
    error: 'could not read the bulletin',
    source,
    fetchedAt: '2026-08-30T16:00:00.000Z',
  });
  assert.equal(merged.headline.find(h => h.id === 'deaths').value, 788);
});
