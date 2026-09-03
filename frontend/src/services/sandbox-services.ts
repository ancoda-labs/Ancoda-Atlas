import api from '@/config/axios';

/**
 * The ask sandbox. An experiment, and labelled as one.
 *
 * It can only restate what is already on the desk. It will not search for a
 * person, advise anyone to stay or leave, or predict — and those refusals are
 * decided server-side before a model is consulted.
 */
export async function askService(message: string, lang: string = 'en') {
  // The field is `message`, which is the contract the desk already used.
  const { data } = await api.post('/sandbox/ask', { message, lang });
  return data;
}

export async function fetchSandboxStatusService() {
  const { data } = await api.get('/sandbox/ask');
  return data;
}
