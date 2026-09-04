import api from '@/config/axios';

/**
 * The ask sandbox. An experiment, and labelled as one.
 *
 * It can only restate what is already on the desk. It will not search for a
 * person, advise anyone to stay or leave, or predict — and those refusals are
 * decided server-side before a model is consulted.
 */

export interface AskHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface RetranslatedItem {
  text: string;
  lang: string | null;
  translated: boolean;
  fellBackFrom?: string | null;
}

export async function askService(
  message: string,
  lang: string = 'en',
  history?: AskHistoryTurn[],
) {
  // The field is `message`, which is the contract the desk already used.
  const { data } = await api.post('/sandbox/ask', {
    message,
    lang,
    ...(history && history.length > 0 ? { history } : {}),
  });
  return data;
}

export async function retranslateService(
  texts: string[],
  lang: string,
  sourceLangs?: string[],
) {
  const { data } = await api.post('/sandbox/ask/translate', {
    texts,
    lang,
    ...(sourceLangs && sourceLangs.length > 0 ? { sourceLangs } : {}),
  });
  return data as {
    kind: 'ok' | 'quota';
    items: RetranslatedItem[];
    remaining?: { hour: number; globalHour: number };
  };
}

export async function fetchSandboxStatusService() {
  const { data } = await api.get('/sandbox/ask');
  return data;
}
