/** PM fund cash vs RDNA recovery need — mirrors backend/app/domains/flood/funding_gap.py */

export const NPR_PER_CRORE = 10_000_000;

export const FUNDING_GAP_CAVEAT = {
  en:
    'Atlas arithmetic — not an official MoF or NPC shortfall. PM Disaster Relief Fund bank stock versus NPC–NDRRMA preliminary RDNA recovery need. Scopes differ; PhonePe, foreign pledges and in-kind are not in the cash bar.',
  ne:
    'एट्लसको अंकगणित — आधिकारिक MoF वा NPC अभाव होइन। प्रधानमन्त्री दैवी प्रकोप उद्धार कोषको बैंक मौज्दात विरुद्ध NPC–NDRRMA प्रारम्भिक RDNA पुनर्प्राप्ति आवश्यकता। क्षेत्र फरक; फोनपे, वैदेशिक घोषणा र जिन्सी यो नगद बारमा छैनन्।',
} as const;

export interface FundingGapBar {
  id: 'received' | 'recovery' | 'gap';
  label_en: string;
  label_ne: string;
  value_cr: number;
}

export interface FundingGap {
  unit: 'npr_cr';
  received_cr: number;
  recovery_cr: number;
  effects_cr: number | null;
  gap_cr: number;
  received_as_of: string | null;
  received_as_of_ne: string | null;
  rdna_as_of: string | null;
  rdna_as_of_ne: string | null;
  bars: FundingGapBar[];
  caveat_en: string;
  caveat_ne: string;
}

export function nprToCrore(npr: number | null | undefined): number | null {
  if (npr == null) return null;
  return Math.round((npr / NPR_PER_CRORE) * 100) / 100;
}

export function computeFundingGap(input: {
  reliefReceived?: {
    as_of?: string;
    as_of_label_en?: string;
    as_of_label_ne?: string;
    headline?: Array<{ id?: string; value?: number | null }>;
  } | null;
  damage?: {
    as_of_label_en?: string;
    as_of_label_ne?: string;
    rdna?: {
      as_of_label_en?: string;
      as_of_label_ne?: string;
      headline?: Array<{ id?: string; value_cr?: number | null }>;
      rows?: Array<{
        id?: string;
        effects_cr?: number | null;
        recovery_cr?: number | null;
      }>;
    };
  } | null;
}): FundingGap | null {
  const received = input.reliefReceived;
  const rdna = input.damage?.rdna;
  const pm = (received?.headline || []).find(h => h.id === 'pm-fund');
  const receivedCr = nprToCrore(pm?.value ?? null);

  const recoveryHeadline = (rdna?.headline || []).find(h => h.id === 'recovery');
  const effectsHeadline = (rdna?.headline || []).find(h => h.id === 'effects');
  const total = (rdna?.rows || []).find(r => r.id === 'total');
  const recoveryCr =
    recoveryHeadline?.value_cr != null
      ? Number(recoveryHeadline.value_cr)
      : total?.recovery_cr != null
        ? Number(total.recovery_cr)
        : null;
  const effectsCr =
    effectsHeadline?.value_cr != null
      ? Number(effectsHeadline.value_cr)
      : total?.effects_cr != null
        ? Number(total.effects_cr)
        : null;

  if (receivedCr == null || recoveryCr == null) return null;

  const gapCr = Math.round((recoveryCr - receivedCr) * 100) / 100;
  return {
    unit: 'npr_cr',
    received_cr: receivedCr,
    recovery_cr: recoveryCr,
    effects_cr: effectsCr,
    gap_cr: gapCr,
    received_as_of: received?.as_of_label_en || received?.as_of || null,
    received_as_of_ne: received?.as_of_label_ne || received?.as_of_label_en || null,
    rdna_as_of: rdna?.as_of_label_en || input.damage?.as_of_label_en || null,
    rdna_as_of_ne:
      rdna?.as_of_label_ne || rdna?.as_of_label_en || input.damage?.as_of_label_ne || null,
    caveat_en: FUNDING_GAP_CAVEAT.en,
    caveat_ne: FUNDING_GAP_CAVEAT.ne,
    bars: [
      {
        id: 'received',
        label_en: 'PM fund cash',
        label_ne: 'प्रधानमन्त्री कोष नगद',
        value_cr: receivedCr,
      },
      {
        id: 'recovery',
        label_en: 'RDNA recovery need',
        label_ne: 'RDNA पुनर्प्राप्ति आवश्यकता',
        value_cr: recoveryCr,
      },
      {
        id: 'gap',
        label_en: 'Difference',
        label_ne: 'अन्तर',
        value_cr: gapCr,
      },
    ],
  };
}

export function formatCrore(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
