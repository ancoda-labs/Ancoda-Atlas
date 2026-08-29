'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from '@/components/FloodShell';
import FloodRiverGauges from '@/app/bhotekoshi-flood/situation/_components/FloodRiverGauges';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type {
  BipadAlert,
  BipadIncident,
  CorridorIncidents,
  FloodDeskPayload,
  FloodOfficialFeed,
  HelpRequest,
  PersonMapPoint,
  PortalActivity,
} from '@/types';

// The corridor's incident register, from BIPAD.
//
// The hardest thing on this page is a number that is not there. BIPAD logs an
// incident as soon as it is reported and the damage figures are entered later —
// sometimes days later — and an unfilled record is stored as a row of zeros.
// So a naive total would tell a reader that eighteen villages reported no
// casualties, when what actually happened is that nobody has counted yet.
//
// Every figure here is therefore labelled as a tally of what has been entered,
// the count still awaiting figures is given equal billing, and incidents with
// no figures are marked in the table rather than shown as zeros.

interface Payload {
  corridor: CorridorIncidents;
  alerts: BipadAlert[];
  helpRequests: FloodOfficialFeed<HelpRequest> | null;
  personPoints: FloodOfficialFeed<PersonMapPoint> | null;
  latest: PortalActivity | null;
  generatedAt: string;
}

const T = {
  kicker: { en: 'Incident register', ne: 'घटना अभिलेख' },
  title: { en: 'What has been reported', ne: 'के-के जनाइएको छ' },
  standfirst: {
    en: 'Flood and landslide incidents logged in the Government of Nepal BIPAD Portal for the Trishuli corridor.',
    ne: 'त्रिशूली करिडोरका बाढी र पहिरो घटनाहरू, नेपाल सरकारको बिपद् पोर्टलमा दर्ता भएअनुसार।',
  },
  caveatTitle: { en: 'Read these figures carefully', ne: 'यी तथ्यांक ध्यानपूर्वक पढ्नुहोस्' },
  caveat: {
    en: 'These are the damage figures entered into BIPAD so far, not the national toll. An incident is logged as soon as it is reported and counted later, so a low number here usually means counting is not finished — not that nothing happened. The official toll is published by NDRRMA and the Nepal Police.',
    ne: 'यी अहिलेसम्म बिपद् पोर्टलमा प्रविष्ट भएका क्षतिका तथ्यांक हुन्, राष्ट्रिय जनधनको क्षति होइन। घटना जनाइनासाथ दर्ता हुन्छ र गणना पछि गरिन्छ — त्यसैले यहाँको कम संख्याले प्रायः गणना नसकिएको जनाउँछ, केही भएन भन्ने होइन। आधिकारिक तथ्यांक एनडीआरआरएमए र नेपाल प्रहरीले प्रकाशित गर्छन्।',
  },
  incidents: { en: 'Incidents logged', ne: 'दर्ता घटना' },
  withFigures: { en: 'With damage figures', ne: 'क्षति तथ्यांक भएका' },
  awaiting: { en: 'Still awaiting figures', ne: 'तथ्यांक कुर्दै' },
  deaths: { en: 'Deaths recorded', ne: 'मृत्यु दर्ता' },
  missing: { en: 'Missing recorded', ne: 'बेपत्ता दर्ता' },
  injured: { en: 'Injured recorded', ne: 'घाइते दर्ता' },
  evacuated: { en: 'Families evacuated', ne: 'स्थानान्तरित परिवार' },
  houses: { en: 'Houses destroyed', ne: 'भत्किएका घर' },
  bridges: { en: 'Bridges destroyed', ne: 'भत्किएका पुल' },
  alertsTitle: { en: 'Live alerts', ne: 'प्रत्यक्ष चेतावनी' },
  alertsHint: {
    en: 'Warnings currently published by the Department of Hydrology and Meteorology through BIPAD.',
    ne: 'जल तथा मौसम विज्ञान विभागले बिपद् पोर्टलमार्फत हाल प्रकाशित गरेका चेतावनी।',
  },
  noAlerts: { en: 'No alerts are currently published.', ne: 'हाल कुनै चेतावनी प्रकाशित छैन।' },
  listTitle: { en: 'Every incident logged', ne: 'दर्ता भएका सबै घटना' },
  place: { en: 'Place', ne: 'स्थान' },
  when: { en: 'When', ne: 'कहिले' },
  reportedBy: { en: 'Reported by', ne: 'जनाउने' },
  damage: { en: 'Damage recorded', ne: 'दर्ता क्षति' },
  notCounted: { en: 'not counted yet', ne: 'अझै गणना भएको छैन' },
  none: { en: 'none recorded', ne: 'केही दर्ता छैन' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  unavailable: { en: 'BIPAD cannot be reached right now.', ne: 'बिपद् पोर्टलमा अहिले पहुँच भएन।' },
  updated: { en: 'Read', ne: 'पढिएको' },
  tilesCaveat: {
    en: 'What has been entered into the register so far, not the national toll.',
    ne: 'अहिलेसम्म अभिलेखमा प्रविष्ट भएको मात्र, राष्ट्रिय क्षति होइन।',
  },
  nationalTitle: { en: 'The national picture — past 24 hours', ne: 'राष्ट्रिय अवस्था — विगत २४ घण्टा' },
  nationalHint: {
    en: 'NDRRMA’s Daily Disaster Bulletin, in the authority’s own words. It covers the whole country over the last 24 hours, while the figures above are this corridor since the flood began — read them side by side, never added together.',
    ne: 'एनडीआरआरएमएको दैनिक विपद् बुलेटिन, प्राधिकरणकै शब्दमा। यसले विगत २४ घण्टाको सिंगो देश समेट्छ, माथिका तथ्यांक भने बाढी सुरु भएयताको यही करिडोरका हुन् — छेउछाउ राखेर पढ्नुहोस्, जोड्नुहोस् नहोस्।',
  },
  openBulletin: { en: 'Open the full bulletin (PDF)', ne: 'पूरा बुलेटिन खोल्नुहोस् (PDF)' },
  askedTitle: { en: 'What is being asked for', ne: 'के-कस्तो सहयोग मागिँदैछ' },
  askedHint: {
    en: 'The newest filings on the Office of the Prime Minister’s rescue portal. These count filings, not people: one person in trouble can be the subject of several, and a family rarely comes back to close a report. Read them as demand, never as a toll.',
    ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलमा भर्खरै दर्ता भएका निवेदन। यी निवेदनको गणना हो, व्यक्तिको होइन — एउटै व्यक्तिका लागि थुप्रै निवेदन पर्न सक्छन्, र समस्या हल भएपछि प्रायः कसैले फिर्ता लिँदैन। यसलाई मागको सूचक मान्नुहोस्, क्षतिको होइन।',
  },
  askedFor: { en: 'Requests for help', ne: 'सहयोगका निवेदन' },
  offered: { en: 'Offers of help', ne: 'सहयोग दिने प्रस्ताव' },
  onMap: { en: 'geolocated requests on the portal map', ne: 'पोर्टलको नक्सामा स्थान तोकिएका निवेदन' },
  onMapPersons: { en: 'missing-and-found reports with a location', ne: 'स्थान तोकिएका हराएका/भेटिएका विवरण' },
  anonymous: {
    en: 'Names and telephone numbers of the people who filed these are not reproduced here.',
    ne: 'निवेदन दिनेको नाम र फोन नम्बर यहाँ राखिएको छैन।',
  },
  noFilings: { en: 'The portal has published no recent filings.', ne: 'पोर्टलमा हालैका निवेदन प्रकाशित छैनन्।' },
  police: { en: 'Nepal Police', ne: 'नेपाल प्रहरी' },
  dhm: { en: 'DHM', ne: 'डीएचएम' },
  other: { en: 'Other', ne: 'अन्य' },
};

/** A one-line summary of a loss record, or a clear statement that there isn't one. */
function damageLine(incident: BipadIncident, lang: 'en' | 'ne'): { text: string; counted: boolean } {
  const loss = incident.loss;
  if (!loss || !loss.reported) return { text: T.notCounted[lang], counted: false };
  const parts: string[] = [];
  const add = (n: number, en: string, ne: string) => {
    if (n > 0) parts.push(`${n} ${lang === 'ne' ? ne : en}`);
  };
  add(loss.deaths, 'dead', 'मृत्यु');
  add(loss.missing, 'missing', 'बेपत्ता');
  add(loss.injured, 'injured', 'घाइते');
  add(loss.housesDestroyed, 'houses destroyed', 'घर भत्किएको');
  add(loss.housesAffected, 'houses damaged', 'घर प्रभावित');
  add(loss.bridgesDestroyed, 'bridges lost', 'पुल भत्किएको');
  add(loss.familiesEvacuated, 'families evacuated', 'परिवार स्थानान्तरित');
  add(loss.livestockLost, 'livestock lost', 'पशुधन नोक्सान');
  return { text: parts.length ? parts.join(' · ') : T.none[lang], counted: true };
}

function sourceLabel(source: string | null, lang: 'en' | 'ne'): string {
  if (source === 'nepal_police') return T.police[lang];
  if (source === 'dhm') return T.dhm[lang];
  return T.other[lang];
}

export default function FloodSituationView() {
  const [lang, setLang] = useFloodLang();
  const [data, setData] = useState<Payload | null>(null);
  const [desk, setDesk] = useState<FloodDeskPayload | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/flood/situation')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && d) setData(d);
        })
        .catch(() => {});
    load();
    // The gauge panel comes from the main desk payload, which is cached separately.
    const loadDesk = () =>
      fetch('/api/flood')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && d) setDesk(d);
        })
        .catch(() => {});
    loadDesk();
    const id = setInterval(() => {
      load();
      loadDesk();
    }, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const totals = data?.corridor?.totals;
  const incidents = data?.corridor?.incidents || [];
  const alerts = (data?.alerts || []).filter(a => a.public);
  const latestRequests = data?.latest?.requests || [];
  const latestOffers = data?.latest?.offers || [];
  const geolocatedRequests = data?.helpRequests?.items.length || 0;
  const geolocatedPersons = data?.personPoints?.items.length || 0;
  const dailyBulletin = desk?.dailyBulletin?.items?.[0] || null;

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      {/* The caveat comes before the numbers, because it changes how to read them. */}
      <aside className="fl-standfirst" role="note">
        <span>{t('caveatTitle')}</span>
        <p>{t('caveat')}</p>
      </aside>

      {totals && (
        <div className="fl-tiles">
          <div><dd>{totals.incidentCount}</dd><dt>{t('incidents')}</dt></div>
          <div><dd>{totals.incidentsWithFigures}</dd><dt>{t('withFigures')}</dt></div>
          <div className="t-warning"><dd>{totals.incidentsAwaitingFigures}</dd><dt>{t('awaiting')}</dt></div>
          <div className="t-critical"><dd>{totals.deaths}</dd><dt>{t('deaths')}</dt></div>
          <div className="t-critical"><dd>{totals.missing}</dd><dt>{t('missing')}</dt></div>
          <div className="t-warning"><dd>{totals.injured}</dd><dt>{t('injured')}</dt></div>
          <div><dd>{totals.familiesEvacuated}</dd><dt>{t('evacuated')}</dt></div>
          <div><dd>{totals.housesDestroyed}</dd><dt>{t('houses')}</dt></div>
          <div><dd>{totals.bridgesDestroyed}</dd><dt>{t('bridges')}</dt></div>
        </div>
      )}

      {/* The tiles above are the one set of figures on this desk that is
          genuinely live end to end — BIPAD is re-read every ten minutes — so
          they carry their own read time rather than borrowing the one at the
          bottom of the incident table. */}
      {totals && (
        <p className="fl-note">
          {t('updated')} {ageFrom(data?.corridor?.fetchedAt, lang)}
          {' · '}
          <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
            {lang === 'ne' ? 'बिपद् पोर्टल' : 'BIPAD Portal'} &#8599;
          </a>
          {' · '}
          <span className="fl-blank">{t('tilesCaveat')}</span>
        </p>
      )}

      <FloodRiverGauges river={desk?.river} lang={lang} />

      {/* NDRRMA's national bulletin, beside the corridor figures rather than
          folded into them: a nationwide 24-hour count and a cumulative corridor
          count are different things and must never be added. */}
      {dailyBulletin && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'सरकारी' : 'Official'}</span>
            <h2>{t('nationalTitle')}</h2>
          </div>
          <p className="fl-note">{t('nationalHint')}</p>
          <div className="fl-place-note">
            <h3>
              {(lang === 'ne'
                ? dailyBulletin.titleNe || dailyBulletin.title
                : dailyBulletin.title || dailyBulletin.titleNe) || dailyBulletin.date}
            </h3>
            <p>
              {(lang === 'ne'
                ? dailyBulletin.summaryNe || dailyBulletin.summary
                : dailyBulletin.summary || dailyBulletin.summaryNe) || ''}
            </p>
            {dailyBulletin.pdfUrl && (
              <p className="fl-note">
                <a href={dailyBulletin.pdfUrl} target="_blank" rel="noopener noreferrer">
                  {t('openBulletin')} &#8599;
                </a>
              </p>
            )}
          </div>
          {desk?.dailyBulletin && (
            <p className="fl-note">
              {t('updated')} {ageFrom(desk.dailyBulletin.fetchedAt, lang)}
              {' · '}
              <a href={desk.dailyBulletin.source.url} target="_blank" rel="noopener noreferrer">
                {desk.dailyBulletin.source.label} &#8599;
              </a>
            </p>
          )}
        </section>
      )}

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'चेतावनी' : 'Alerts'}</span>
          <h2>{t('alertsTitle')}</h2>
          {alerts.length > 0 && <em className="warn">{alerts.length}</em>}
        </div>
        <p className="fl-note">{t('alertsHint')}</p>
        {!data ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : alerts.length === 0 ? (
          <p className="fl-empty">{t('noAlerts')}</p>
        ) : (
          // Every alert, not the first twelve — the pane scrolls, so there is
          // nothing gained by truncating a list a reader is scanning for the
          // warning that applies to them.
          <div className="fl-scroll-pane">
            <ul className="fl-alerts">
              {alerts.map(a => (
                <li key={a.id}>
                  <h3>{lang === 'ne' ? a.titleNe || a.title : a.title}</h3>
                  {a.description && <p>{a.description}</p>}
                  <span className="fl-report-meta">
                    <b>{sourceLabel(a.source, lang)}</b>
                    <time>{ageFrom(a.startedOn, lang)}</time>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="fl-note">
          {t('updated')} {ageFrom(data?.corridor?.fetchedAt, lang)}
          {' · '}
          <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
            {lang === 'ne' ? 'जल तथा मौसम विज्ञान विभाग · बिपद् पोर्टल' : 'DHM · BIPAD Portal'} &#8599;
          </a>
        </p>
      </section>

      {/* The public's side of the same event: what people are asking the
          government for, and what is being offered back. Kept clearly apart
          from the incident figures above — a filing is not a casualty. */}
      {(latestRequests.length > 0 || latestOffers.length > 0) && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'पोर्टल' : 'Portal'}</span>
            <h2>{t('askedTitle')}</h2>
          </div>
          <p className="fl-note">{t('askedHint')}</p>

          {(geolocatedRequests > 0 || geolocatedPersons > 0) && (
            <div className="fl-tiles">
              {geolocatedRequests > 0 && (
                <div>
                  <dd>{geolocatedRequests}</dd>
                  <dt>{t('onMap')}</dt>
                </div>
              )}
              {geolocatedPersons > 0 && (
                <div>
                  <dd>{geolocatedPersons}</dd>
                  <dt>{t('onMapPersons')}</dt>
                </div>
              )}
            </div>
          )}

          {/* Asked for and offered, side by side. They are two halves of one
              picture — demand against supply — and reading them as a stacked
              pair made that impossible to see at a glance. Each column scrolls
              on its own so a long request description cannot drag the other
              side down with it. */}
          <div className="fl-split fl-asked-pair">
            {latestRequests.length > 0 && (
              <div className="fl-asked-col">
                <h4 className="fl-minor">
                  {t('askedFor')} <em>{latestRequests.length}</em>
                </h4>
                <div className="fl-scroll-pane">
                  <ul className="fl-filings">
                    {latestRequests.map(r => (
                      <li key={r.id} className={r.urgency ? `u-${r.urgency.toLowerCase()}` : undefined}>
                        <div className="fl-filing-head">
                          <h3>{r.title || r.problemType || r.ref || '—'}</h3>
                          {r.urgency && <span className="fl-filing-tag">{r.urgency}</span>}
                        </div>
                        {r.description && <p>{r.description}</p>}
                        <span className="fl-report-meta">
                          {r.helpTypes.length > 0 && <b>{r.helpTypes.join(' · ')}</b>}
                          {r.place && <i>{r.place}</i>}
                          <time>{ageFrom(r.createdAt, lang)}</time>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {latestOffers.length > 0 && (
              <div className="fl-asked-col">
                <h4 className="fl-minor">
                  {t('offered')} <em>{latestOffers.length}</em>
                </h4>
                <div className="fl-scroll-pane">
                  <ul className="fl-filings fl-filings-offer">
                    {latestOffers.map(o => (
                      <li key={o.id}>
                        <div className="fl-filing-head">
                          <h3>{o.title || o.providerName || o.resourceTypes.join(' · ') || o.ref || '—'}</h3>
                          {o.status && <span className="fl-filing-tag ok">{o.status}</span>}
                        </div>
                        {o.description && <p>{o.description}</p>}
                        <span className="fl-report-meta">
                          {o.resourceTypes.length > 0 && <b>{o.resourceTypes.join(' · ')}</b>}
                          {o.place && <i>{o.place}</i>}
                          <time>{ageFrom(o.createdAt, lang)}</time>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <p className="fl-note">
            {t('anonymous')}
            {data?.latest && (
              <>
                {' '}
                {t('updated')} {ageFrom(data.latest.fetchedAt, lang)}
                {' · '}
                <a href={data.latest.source.url} target="_blank" rel="noopener noreferrer">
                  {data.latest.source.label} &#8599;
                </a>
              </>
            )}
          </p>
        </section>
      )}

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'घटना' : 'Incidents'}</span>
          <h2>{t('listTitle')}</h2>
          {incidents.length > 0 && <em>{incidents.length}</em>}
        </div>

        {!data ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : data.corridor.error ? (
          <p className="fl-empty">{t('unavailable')}</p>
        ) : (
          <div className="fl-table-scroll fl-table-tall">
            <table className="fl-register">
              <thead>
                <tr>
                  <th>{t('place')}</th>
                  <th className="num">{t('when')}</th>
                  <th>{t('reportedBy')}</th>
                  <th>{t('damage')}</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(i => {
                  const damage = damageLine(i, lang);
                  return (
                    <tr key={i.id} className={damage.counted ? undefined : 'fl-uncounted'}>
                      <th scope="row">{lang === 'ne' ? i.titleNe || i.title : i.title}</th>
                      <td className="num">{i.incidentOn ? i.incidentOn.slice(0, 10) : '—'}</td>
                      <td>{sourceLabel(i.source, lang)}</td>
                      <td>{damage.counted ? damage.text : <span className="fl-blank">{damage.text}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="fl-note">
          {t('updated')} {data ? ageFrom(data.corridor.fetchedAt, lang) : '—'} ·{' '}
          <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
            {lang === 'ne' ? 'बिपद् पोर्टल' : 'BIPAD Portal'} &#8599;
          </a>
        </p>
      </section>
    </FloodShell>
  );
}
