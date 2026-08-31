// Copernicus EMSR927 scrape + overlay for the Rasuwa flood bulletin damage page.
//
// Run: node --experimental-strip-types --test test/bulletin-damage.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDamageFigure, parseCopernicusTable, parseCopernicusKpis, classifyCopernicusMap, parseBulletinFigures, collectCopernicusMaps, parseAoiPhotos } from '../src/apis/sources/bulletin-damage.mjs';
import { buildingsClose, mergeDamage } from '../src/lib/damage-merge.ts';

const TABLE = `
<table class="plants">
  <thead><tr><th>class</th><th>dest</th><th>dam</th><th>poss</th><th>aff</th><th>aoi</th><th>share</th></tr></thead>
  <tbody>
    <tr><td data-i18n="ems_r_slide">पहिरो</td><td class="mw"><span class="num">१११.१</span> हे</td><td class="mw">—</td><td class="mw">—</td><td class="mw"><span class="num">१११.१</span> हे</td><td class="mw">—</td><td class="mw">—</td></tr>
    <tr><td data-i18n="ems_r_pop">जनसंख्या</td><td class="mw">—</td><td class="mw">—</td><td class="mw">—</td><td class="mw">~<span class="num">४५०</span></td><td class="mw">~<span class="num">७५०</span></td><td class="mw">६०%</td></tr>
    <tr><td data-i18n="ems_r_res">आवासीय भवन</td><td class="mw"><span class="num">२८३</span></td><td class="mw"><span class="num">३१</span></td><td class="mw"><span class="num">७८</span></td><td class="mw"><span class="num">३९२</span></td><td class="mw"><span class="num">५१७</span></td><td class="mw">७५.८%</td></tr>
    <tr><td data-i18n="ems_r_inst">संस्थागत</td><td class="mw"><span class="num">१</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">१</span></td><td class="mw"><span class="num">१</span></td><td class="mw">१००%</td></tr>
    <tr><td data-i18n="ems_r_school">विद्यालय</td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">१</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">१</span></td><td class="mw"><span class="num">१</span></td><td class="mw">१००%</td></tr>
    <tr><td data-i18n="ems_r_otherb">अन्य</td><td class="mw"><span class="num">३७</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">३७</span></td><td class="mw"><span class="num">३८</span></td><td class="mw">९७.४%</td></tr>
    <tr><td data-i18n="ems_r_rel">धार्मिक</td><td class="mw"><span class="num">२</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">०</span></td><td class="mw"><span class="num">२</span></td><td class="mw"><span class="num">२</span></td><td class="mw">१००%</td></tr>
    <tr><td data-i18n="ems_r_allb">सबै भवन</td><td class="mw"><span class="num">३२३</span></td><td class="mw"><span class="num">३२</span></td><td class="mw"><span class="num">७८</span></td><td class="mw"><span class="num">४३३</span></td><td class="mw"><span class="num">५५९</span></td><td class="mw">७७.५%</td></tr>
  </tbody>
</table>
<section id="power"><table class="plants"><tr><td>not Copernicus</td></tr></table></section>
`;

const KPIS = `
<div class="ems-kpis8">
  <div class="ems-kpi"><span class="kpi-k" data-i18n="ems_k_slide">पहिरो</span><strong class="num">१११.१</strong></div>
  <div class="ems-kpi"><span class="kpi-k" data-i18n="ems_k_pop">जनसंख्या</span><strong class="num">~४५०</strong></div>
  <div class="ems-kpi"><span class="kpi-k" data-i18n="ems_k_built">भवन</span><strong class="num">४३३</strong></div>
  <div class="ems-kpi"><span class="kpi-k" data-i18n="ems_k_res">आवासीय</span><strong class="num">३९२</strong></div>
  <div class="ems-kpi"><span class="kpi-k" data-i18n="ems_k_road">सडक</span><strong class="num">७.६</strong></div>
  <div class="ems-kpi"><span class="kpi-k" data-i18n="ems_k_br">पुल</span><strong class="num">५/५</strong></div>
</div>
`;

const source = {
  label: 'Rasuwa flood bulletin (compilation)',
  url: 'https://nirajbhusal.github.io/rasuwa-flood-bulletin/damage.html',
};

function reviewed() {
  return {
    as_of: '2026-08-27T05:05:00Z',
    power: { listed_mw: 431.1, affected_mw: 276, plants: [{ id: 'rasuwagadhi', mw: 111, hit: true }] },
    copernicus: {
      headline: [
        { id: 'buildings', value: 400, tone: 'critical', source: 'EMSR927', label_en: 'Buildings affected', label_ne: 'प्रभावित भवन' },
        { id: 'residential', value: 350, tone: 'critical', source: 'EMSR927', label_en: 'Residential', label_ne: 'आवासीय' },
      ],
      rows: [
        { id: 'residential', group: 'buildings', destroyed: 250, damaged: 20, possible: 80, affected: 350, aoi: 517, share: '67.7%' },
        { id: 'institutional', group: 'buildings', destroyed: 1, damaged: 0, possible: 0, affected: 1, aoi: 1, share: '100%' },
        { id: 'school', group: 'buildings', destroyed: 0, damaged: 1, possible: 0, affected: 1, aoi: 1, share: '100%' },
        { id: 'other-nonres', group: 'buildings', destroyed: 37, damaged: 0, possible: 0, affected: 37, aoi: 38, share: '97.4%' },
        { id: 'religious', group: 'buildings', destroyed: 2, damaged: 0, possible: 0, affected: 2, aoi: 2, share: '100%' },
        { id: 'all-buildings', group: 'buildings', destroyed: 290, damaged: 21, possible: 80, affected: 391, aoi: 559, share: '70%' },
      ],
    },
  };
}

test('Devanagari, tildes, ratios and dashes parse as Copernicus prints them', () => {
  assert.deepEqual(parseDamageFigure('१११.१'), { value: 111.1, suffix: undefined, approximate: undefined });
  assert.deepEqual(parseDamageFigure('~४५०'), { value: 450, suffix: undefined, approximate: true });
  assert.deepEqual(parseDamageFigure('५/५'), { value: 5, suffix: undefined, approximate: undefined });
  assert.deepEqual(parseDamageFigure('१३३+'), { value: 133, suffix: '+', approximate: undefined });
  assert.equal(parseDamageFigure('—'), null);
  assert.equal(parseDamageFigure('अलग'), null);
});

test('the Copernicus table is the first plants table, not the NEA list', () => {
  const rows = parseCopernicusTable(TABLE);
  assert.equal(rows.length, 8);
  const all = rows.find(r => r.id === 'all-buildings');
  assert.equal(all.affected, 433);
  assert.equal(all.destroyed, 323);
  assert.equal(all.share, '77.5%');
  const pop = rows.find(r => r.id === 'population');
  assert.equal(pop.affected, 450);
  assert.equal(pop.aoi, 750);
  assert.equal(pop.approximate, true);
  assert.equal(pop.destroyed, null);
  const slide = rows.find(r => r.id === 'landslide');
  assert.equal(slide.destroyed, 111.1);
});

test('KPI strip reads 5/5 as 5 and ~450 as approximate', () => {
  const headline = parseCopernicusKpis(KPIS);
  assert.equal(headline.find(h => h.id === 'bridges').value, 5);
  assert.equal(headline.find(h => h.id === 'population').approximate, true);
  assert.equal(headline.find(h => h.id === 'buildings').value, 433);
  assert.equal(headline.find(h => h.id === 'road').value, 7.6);
});

test('building arithmetic closes on the published EMSR927 figures', () => {
  assert.equal(buildingsClose(parseCopernicusTable(TABLE)), true);
});

test('a scrape whose classes do not sum to all-buildings is refused', () => {
  const rows = parseCopernicusTable(TABLE).map(r =>
    r.id === 'residential' ? { ...r, affected: 400, destroyed: 300, damaged: 22, possible: 78 } : r,
  );
  assert.equal(buildingsClose(rows), false);
});

test('a closing scrape overlays Copernicus numbers and leaves the NEA notice alone', () => {
  const liveRows = parseCopernicusTable(TABLE);
  const liveHeadline = parseCopernicusKpis(KPIS);
  const merged = mergeDamage(reviewed(), {
    rows: liveRows,
    headline: liveHeadline,
    error: null,
    source,
    fetchedAt: '2026-08-30T12:00:00Z',
    asOfLabelEn: '27 August 2026',
    asOfLabelNe: '२७ अगस्ट २०२६',
  });
  const all = merged.copernicus.rows.find(r => r.id === 'all-buildings');
  assert.equal(all.affected, 433);
  assert.equal(all.destroyed, 323);
  assert.equal(merged.copernicus.headline.find(h => h.id === 'buildings').value, 433);
  assert.equal(merged.power.affected_mw, 276);
  assert.equal(merged.as_of, '2026-08-30T12:00:00Z');
});

test('a failed scrape leaves the reviewed floor standing', () => {
  const floor = reviewed();
  assert.equal(mergeDamage(floor, { rows: [], headline: [], error: 'timeout', source, fetchedAt: '', asOfLabelEn: null, asOfLabelNe: null }), floor);
  const broken = parseCopernicusTable(TABLE).map(r =>
    r.id === 'all-buildings' ? { ...r, affected: 999 } : r,
  );
  const kept = mergeDamage(floor, {
    rows: broken,
    headline: [],
    error: null,
    source,
    fetchedAt: '2026-08-30T12:00:00Z',
    asOfLabelEn: null,
    asOfLabelNe: null,
  });
  assert.equal(kept.copernicus.rows.find(r => r.id === 'all-buildings').affected, 391);
});

const FIGURES = `
<section id="ems927">
  <figure class="photo">
    <a href="img/today-2026-08-27-copernicus-ems927-overview.jpg"><img src="img/today-2026-08-27-copernicus-ems927-overview.jpg" alt="overview"></a>
    <figcaption><strong>ग्रेडिङ अवलोकन</strong>EMSR927 overview</figcaption>
  </figure>
  <figure class="photo">
    <a href="img/today-2026-08-27-copernicus-ems927-table-sm.jpg"><img src="img/today-2026-08-27-copernicus-ems927-table-sm.jpg" alt="table"></a>
  </figure>
</section>
`;

const PHOTOS = `
<figure class="photo">
  <a href="img/today-2026-08-26-ok-syafrubesi-valley.jpg"><img src="img/today-2026-08-26-ok-syafrubesi-valley.jpg" alt="स्याफ्रुबेसी उपत्यकामा बाढी, अनलाइनखबर"></a>
  <figcaption><strong>स्याफ्रुबेसी उपत्यका</strong>Onlinekhabar</figcaption>
</figure>
<figure class="photo">
  <a href="img/today-2026-08-29-nepal-police-0700.jpg"><img src="img/today-2026-08-29-nepal-police-0700.jpg" alt="नेपाल प्रहरी रसुवा भोटेकोशी बाढी अपडेट, शव ६१६"></a>
  <figcaption><strong>प्रहरी</strong>bodies 616</figcaption>
</figure>
<figure class="photo">
  <a href="img/today-2026-08-26-ratopati-timure-surge.jpg"><img src="img/today-2026-08-26-ratopati-timure-surge.jpg" alt="टिमुरे बाढी"></a>
  <figcaption><strong>टिमुरे बाढीको बहाव</strong>Ratopati</figcaption>
</figure>
`;

test('Copernicus map filenames skip thumbnails, the table shot, and PDFs', () => {
  assert.equal(classifyCopernicusMap('img/today-2026-08-27-copernicus-ems927-overview.jpg'), 'overview');
  assert.equal(classifyCopernicusMap('img/today-2026-08-27-copernicus-ems927-detail02.jpg'), 'detail');
  assert.equal(classifyCopernicusMap('img/today-2026-08-27-copernicus-ems927-infographic-p1.jpg'), 'infographic');
  assert.equal(classifyCopernicusMap('img/today-2026-08-27-copernicus-ems927-overview-sm.jpg'), null);
  assert.equal(classifyCopernicusMap('img/today-2026-08-27-copernicus-ems927-table.jpg'), null);
  assert.equal(classifyCopernicusMap('img/today-2026-08-27-copernicus-ems927.pdf'), null);
});

test('figure.photo yields bilingual captions and skips the table thumbnail', () => {
  const figs = parseBulletinFigures(FIGURES);
  assert.equal(figs.length, 2);
  assert.equal(figs[0].caption_ne, 'ग्रेडिङ अवलोकन');
  assert.equal(figs[0].caption_en, 'EMSR927 overview');
  const maps = collectCopernicusMaps(FIGURES, '', [
    'https://nirajbhusal.github.io/rasuwa-flood-bulletin/img/today-2026-08-27-copernicus-ems927-detail02.jpg',
  ]);
  assert.equal(maps.some(m => m.kind === 'overview'), true);
  assert.equal(maps.some(m => m.kind === 'detail'), true);
  assert.equal(maps.some(m => /table/.test(m.src)), false);
  assert.equal(maps[0].kind, 'overview');
});

test('AOI photographs keep Syabrubesi and Timure and drop casualty infographics', () => {
  const photos = parseAoiPhotos(PHOTOS);
  assert.equal(photos.length, 2);
  assert.equal(photos.some(p => p.place_id === 'syaphrubesi'), true);
  assert.equal(photos.some(p => p.place_id === 'timure'), true);
  assert.equal(photos.some(p => /nepal-police/.test(p.src)), false);
  assert.equal(photos.find(p => p.place_id === 'timure').lat, 28.207);
});

test('maps overlay even when building arithmetic fails; empty scrape keeps reviewed maps', () => {
  const floor = reviewed();
  floor.copernicus.maps = [{ id: 'reviewed-overview', kind: 'overview', src: 'https://example.test/overview.jpg' }];
  const broken = parseCopernicusTable(TABLE).map(r =>
    r.id === 'all-buildings' ? { ...r, affected: 999 } : r,
  );
  const withMaps = mergeDamage(floor, {
    rows: broken,
    headline: [],
    maps: [{ id: 'live-overview', kind: 'overview', src: 'https://nirajbhusal.github.io/rasuwa-flood-bulletin/img/today-2026-08-27-copernicus-ems927-overview.jpg' }],
    photos: [],
    error: null,
    source,
    fetchedAt: '2026-08-30T12:00:00Z',
    asOfLabelEn: null,
    asOfLabelNe: null,
  });
  assert.equal(withMaps.copernicus.rows.find(r => r.id === 'all-buildings').affected, 391);
  assert.equal(withMaps.copernicus.maps[0].id, 'live-overview');

  const kept = mergeDamage(floor, {
    rows: parseCopernicusTable(TABLE),
    headline: [],
    maps: [],
    photos: [],
    error: null,
    source,
    fetchedAt: '2026-08-30T12:00:00Z',
    asOfLabelEn: null,
    asOfLabelNe: null,
  });
  assert.equal(kept.copernicus.maps[0].id, 'reviewed-overview');
});

