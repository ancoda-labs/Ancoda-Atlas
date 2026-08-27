'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type Lang = 'en' | 'ne';

// Entry point to the flood response desk. The desk itself lives at its own
// route so it can be shared, linked and opened directly by someone who has
// never seen the Atlas dashboard.
export default function BhotekoshiFloodButton() {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const saved = localStorage.getItem('atlas_language');
    if (saved === 'ne' || saved === 'en') setLang(saved);
  }, []);

  return (
    <Link className="flood-cta" href="/bhotekoshi-flood">
      <span className="flood-cta-dot" />
      <span className="flood-cta-text">
        <strong>{lang === 'ne' ? 'भोटेकोशी बाढी' : 'Bhotekoshi Flood'}</strong>
        <em>{lang === 'ne' ? 'सहयोग, सुरक्षा र दान' : 'Response desk · help, safety, donations'}</em>
      </span>
      <span className="flood-cta-arrow">&rarr;</span>
    </Link>
  );
}
