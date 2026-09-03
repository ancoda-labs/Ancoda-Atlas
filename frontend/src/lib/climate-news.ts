/**
 * Google RSS titles often already end with the outlet name. The climate news
 * panel prints source on its own line, so strip that suffix here.
 */

export function cleanNewsTitle(title: string, source?: string | null): string {
  const trimmed = title.replace(/\s+/g, ' ').trim();
  if (!source) return trimmed;
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed.replace(new RegExp(`(?:\\s*[-–—|]\\s*|\\s+)${escaped}\\s*$`, 'i'), '').trim();
}
