'use client';

import type { Lang } from '@/hooks/use-flood-lang';
import type { ReliefWarehouse } from '@/types';

// Drop-off numbers from NDRRMA SitRep #06. Same list on Donate and Contacts —
// the numbers are not invented here, and Atlas has not rung them.

const T = {
  tapToCall: { en: 'Tap to call', ne: 'फोन गर्न थिच्नुहोस्' },
};

function PhoneIcon() {
  return (
    <svg className="fl-phone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z"
        fill="currentColor"
      />
    </svg>
  );
}

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return `tel:+977${digits}`;
  return `tel:${digits || phone}`;
}

function pick(lang: Lang, en?: string, ne?: string): string {
  return (lang === 'ne' ? ne || en : en) || '';
}

export default function FloodWarehouses({
  warehouses,
  lang,
}: {
  warehouses: ReliefWarehouse[];
  lang: Lang;
}) {
  if (!warehouses.length) return null;
  return (
    <div className="fl-wh-grid">
      {warehouses.map(wh => (
        <article key={wh.id} className="fl-wh">
          <h3>{pick(lang, wh.name_en, wh.name_ne)}</h3>
          <div className="fl-wh-calls">
            {wh.contacts.map(c => (
              <a key={c.phone} href={telHref(c.phone)}>
                <PhoneIcon />
                <b>{c.phone}</b>
                <span>{pick(lang, c.name_en, c.name_ne)}</span>
                <em>{T.tapToCall[lang]}</em>
              </a>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
