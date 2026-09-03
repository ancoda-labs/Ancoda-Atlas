'use client';

import React, { createContext, useContext } from 'react';

import type { ClimateContextPayload } from '@/types';

const ClimateSeed = createContext<ClimateContextPayload | null>(null);

export function ClimateSeedProvider({
  value,
  children,
}: {
  value: ClimateContextPayload | null;
  children: React.ReactNode;
}) {
  return <ClimateSeed.Provider value={value}>{children}</ClimateSeed.Provider>;
}

export function useClimateSeed(): ClimateContextPayload | null {
  return useContext(ClimateSeed);
}
