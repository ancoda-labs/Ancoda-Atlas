'use client';

import React from 'react';
import Link from 'next/link';

// Entry point to the flood response desk. The desk itself lives at its own
// route so it can be shared, linked and opened directly by someone who has
// never seen the Atlas dashboard.
export default function BhotekoshiFloodButton() {
  return (
    <Link className="flood-cta" href="/bhotekoshi-flood">
      <span className="flood-cta-dot" />
      <span className="flood-cta-text">
        <strong>Bhotekoshi Flood</strong>
        <em>Response desk · help, safety, donations</em>
      </span>
      <span className="flood-cta-arrow">&rarr;</span>
    </Link>
  );
}
