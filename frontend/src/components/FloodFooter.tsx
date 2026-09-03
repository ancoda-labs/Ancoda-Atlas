'use client';

import React from 'react';
import Link from 'next/link';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { useHydrated } from '@/hooks/use-hydrated';
import AtlasMark from '@/components/AtlasMark';
import { useSite } from '@/hooks/useFlood';

const T = {
  disclaimer: {
    en: 'Atlas is a monitoring aid, not a warning system. Confirm with DHM, NDRRMA or the Police before acting.',
    ne: 'एट्लस निगरानी उपकरण हो, चेतावनी प्रणाली होइन। कदम चाल्नुअघि डीएचएम, एनडीआरआरएमए वा प्रहरीको आधिकारिक सूचना पुष्टि गर्नुहोस्।',
  },
  somethingWrong: {
    en: 'Something wrong? ',
    ne: 'केही कुरा गलत छ? ',
  },
  reportDataLink: {
    en: 'Report wrong hazard data on GitHub',
    ne: 'GitHub',
  },
  or: {
    en: ' or ',
    ne: ' वा ',
  },
  discord: {
    en: 'Discord',
    ne: 'Discord',
  },
  period: {
    en: '.',
    ne: '।',
  },
  elseIntro: {
    en: ' For other queries, email ',
    ne: ' अन्य जिज्ञासाका लागि ',
  },
  emailSuffix: {
    en: '',
    ne: ' मा इमेल गर्नुहोस्',
  },
  contributeText: {
    en: 'Help verify relief funds or review translations: read our ',
    ne: 'राहत कोष प्रमाणित गर्न वा अनुवाद पुनरावलोकन गर्न सहयोग गर्नुहोस्: हाम्रो ',
  },
  contributeLink: {
    en: 'contributing guide',
    ne: 'योगदान निर्देशिका',
  },
  brandLine: {
    en: 'Open-source hazard intelligence for Nepal, built by Ancoda Labs.',
    ne: 'नेपालका लागि खुला स्रोत प्रकोप जानकारी, Ancoda Labs द्वारा निर्मित।',
  },
  follow: {
    en: 'Follow our work',
    ne: 'हाम्रो काम पछ्याउनुहोस्',
  },
  climate: { en: 'Climate', ne: 'TODO' },
};

// Icon-only 18px links in the corner of a footer are, in practice, invisible.
// These accounts are how a reader checks who publishes these figures, so the
// row is named and each link carries its platform. The cost is markup: the
// inline SVG was already here, and the wordmark is one 3.8KB WebP.
const SOCIALS: Array<{ id: string; label: string; href: string; icon: React.ReactNode }> = [
  {
    id: 'github',
    label: 'GitHub',
    href: 'https://github.com/ancoda-labs/Ancoda-Atlas',
    icon: (
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    ),
  },
  {
    id: 'x',
    label: 'X',
    href: 'https://twitter.com/ancodalabs',
    icon: (
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    ),
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/ancodalabs',
    icon: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/ancodalab/',
    icon: (
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.784 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    ),
  },
  {
    id: 'discord',
    label: 'Discord',
    href: 'https://discord.gg/g9wZXVxTcx',
    icon: (
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z" />
    ),
  },
];

export default function FloodFooter() {
  const [lang] = useFloodLang();
  const hydrated = useHydrated();
  const { data } = useSite();
  const reportEmail = data?.site?.report_contact_email || '';
  // useSite is not snapshotted into the HTML. Rendering the mailto on the
  // server and omitting it on the first client paint is a hydration error.
  const hasEmail = hydrated && reportEmail.trim().length > 0;

  return (
    <footer className="fl-foot shared-footer">
      <p className="footer-disclaimer">
        {T.disclaimer[lang]}
      </p>

      <p className="footer-report">
        {T.somethingWrong[lang]}
        <a
          href="https://github.com/ancoda-labs/Ancoda-Atlas/issues/new?template=data_accuracy.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {T.reportDataLink[lang]}
        </a>
        {T.or[lang]}
        <a href="https://discord.gg/g9wZXVxTcx" target="_blank" rel="noopener noreferrer">
          {T.discord[lang]}
        </a>
        {lang === 'ne' && ' मा रिपोर्ट गर्नुहोस्'}
        {hasEmail && (
          <>
            {T.period[lang]}
            {T.elseIntro[lang]}
            <a href={`mailto:${reportEmail}`}>
              {reportEmail}
            </a>
            {T.emailSuffix[lang]}
          </>
        )}
        {T.period[lang]}
      </p>

      <div className="footer-bottom">
        <div className="footer-brand">
          <AtlasMark className="footer-mark" />
          <p className="footer-brand-line">{T.brandLine[lang]}</p>
          <p className="footer-contribute">
            <Link href={lang === 'ne' ? '/ne/climate' : '/climate'}>{T.climate[lang] === 'TODO' ? T.climate.en : T.climate[lang]}</Link>
            {' · '}
            {T.contributeText[lang]}
            <a
              href="https://github.com/ancoda-labs/Ancoda-Atlas/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              {T.contributeLink[lang]}
            </a>
            {T.period[lang]}
          </p>
        </div>

        <div className="footer-follow">
          <p className="footer-follow-label">{T.follow[lang]}</p>
          <div className="footer-socials">
            {SOCIALS.map(social => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="social-link"
              >
                <svg className="social-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {social.icon}
                </svg>
                <span>{social.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
