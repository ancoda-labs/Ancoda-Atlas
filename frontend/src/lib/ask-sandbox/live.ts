import { loadFloodContent } from '../flood';
import { mergeSitrep } from '../sitrep-merge';
import { getFloodStore } from '../flood-cron';
import { buildSnapshot } from '@/lib/ask-sandbox/tools';
import type { AskSnapshot } from '@/lib/ask-sandbox/types';

export function liveSnapshot(): AskSnapshot {
  const content = loadFloodContent();
  const store = getFloodStore();
  const sitrep = mergeSitrep(content.sitrep, store.sitrep);
  return buildSnapshot(
    content,
    sitrep,
    store.river?.gauges || [],
    store.river?.fetchedAt || null,
    store.news || [],
    store.lastRunAt,
  );
}
