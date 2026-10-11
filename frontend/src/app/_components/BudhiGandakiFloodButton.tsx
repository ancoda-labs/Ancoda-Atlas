'use client';

import React from 'react';
import Link from 'next/link';
import { useFloodLang } from '@/hooks/use-flood-lang';

// Entry point to the Budhi Gandaki flood desk, beside the Bhotekoshi one.
export default function BudhiGandakiFloodButton() {
  const [lang] = useFloodLang();

  return (
    <Link className="flood-cta" href="/budhi-gandaki-flood">
      <span className="flood-cta-dot" />
      <span className="flood-cta-text">
        <strong>{lang === 'ne' ? 'बूढीगण्डकी बाढी · गोरखा' : 'Budhi Gandaki Flood · Gorkha'}</strong>
        <em>{lang === 'ne' ? 'सुरक्षा, आपतकालीन नम्बर र पहिलो दिनका विवरण' : 'Response desk · safety, numbers, first-day reports'}</em>
      </span>
      <span className="flood-cta-arrow">&rarr;</span>
    </Link>
  );
}
