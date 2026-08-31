// Shared fetch utility with timeout, retries, and error handling

/**
 * Fetch with a timeout, one retry, and no throwing.
 *
 * `as` decides what comes back. The default 'json' parses the body and, when
 * that fails, hands back a { rawText } stub of the first 500 characters — a
 * debugging aid for an endpoint that answered with something other than JSON.
 *
 * 'text' returns the body verbatim as a string. HTML scrapers need this: under
 * the JSON default an HTML page can never parse, so it always came back as the
 * truncated stub, and a caller checking `typeof body === 'string'` rejected
 * every response it was ever given.
 *
 * Either way a failed fetch resolves to { error, source } rather than throwing,
 * so a caller must check what it got before using it.
 */
export async function safeFetch(url, opts = {}) {
  const { timeout = 15000, retries = 1, headers = {}, as = 'json' } = opts;
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Atlas/1.0', ...headers },
      });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const text = await res.text();
      if (as === 'text') return text;
      try { return JSON.parse(text); } catch { return { rawText: text.slice(0, 500) }; }
    } catch (e) {
      lastError = e;
      // GDELT needs 5s between requests, others are fine with shorter delays
      if (i < retries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return { error: lastError?.message || 'Unknown error', source: url };
}

export function ago(hours) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
