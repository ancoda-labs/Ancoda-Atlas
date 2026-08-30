import { TarkaProvider } from '@/lib/llm/tarka.mjs';
import { classifyIntent, isRefusal } from '@/lib/ask-sandbox/policy';
import { executeTools, toolsForIntent } from '@/lib/ask-sandbox/tools';
import { canSpend, maxOutputTokens, recordTurn, remainingFor } from '@/lib/ask-sandbox/rate-limit';
import {
  parseModelJson,
  refusalAnswer,
  systemPrompt,
  templateAnswer,
  viewForIntent,
  wrapToolData,
  citationsFromSnap,
} from '@/lib/ask-sandbox/compose';
import { validateView } from '@/lib/ask-sandbox/view';
import type { AskSnapshot, AskTurnResult } from '@/lib/ask-sandbox/types';

function tarka(): TarkaProvider | null {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'himalaya-gemma-4-bf16';
  const baseUrl = process.env.LLM_BASE_URL || null;
  if (!apiKey) return null;
  return new TarkaProvider({ apiKey, model, baseUrl });
}

export function sandboxStatus(clientKey: string) {
  const provider = tarka();
  return {
    sandbox: true,
    tarka: Boolean(provider?.isConfigured),
    model: provider?.isConfigured ? (process.env.LLM_MODEL || 'himalaya-gemma-4-bf16') : null,
    remaining: remainingFor(clientKey),
  };
}

export async function runAskTurn(opts: {
  question: string;
  lang: 'en' | 'ne';
  clientKey: string;
  snapshot: AskSnapshot;
  useModel?: boolean;
}): Promise<AskTurnResult> {
  const lang: 'en' | 'ne' = opts.lang === 'ne' ? 'ne' : 'en';
  const snap = opts.snapshot;
  const remaining = remainingFor(opts.clientKey);
  const intent = classifyIntent(opts.question);
  const tools = toolsForIntent(intent, opts.question);
  const view = viewForIntent(intent, snap, opts.question);

  const base = {
    lang,
    view,
    tools,
    citations: citationsFromSnap(snap),
    remaining,
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  if (isRefusal(intent)) {
    return {
      ...base,
      kind: 'ok',
      answer: refusalAnswer(intent, lang, snap),
      model: null,
      usedModel: false,
    };
  }

  const toolResults = executeTools(tools, snap);
  const fallback = templateAnswer(intent, snap, lang, opts.question);
  const wantModel = opts.useModel !== false;
  const provider = wantModel ? tarka() : null;

  if (!provider?.isConfigured) {
    return {
      ...base,
      kind: 'ok',
      answer: fallback,
      model: null,
      usedModel: false,
    };
  }

  if (!canSpend(opts.clientKey)) {
    return {
      ...base,
      kind: 'quota',
      answer:
        lang === 'ne'
          ? `${fallback}\n\n(टोकन सीमा — मोडेल यो घण्टा सकियो। चिप र तथ्यांक अझै काम गर्छन्।)`
          : `${fallback}\n\n(Token limit — the model is paused for this hour. Chips and desk figures still work.)`,
      model: null,
      usedModel: false,
    };
  }

  try {
    const user = [
      `Question (${lang}): ${opts.question.slice(0, 500)}`,
      wrapToolData(toolResults),
      `Suggested view (already validated): ${JSON.stringify(view)}`,
    ].join('\n\n');
    const result = await provider.complete(systemPrompt(), user, {
      json: true,
      maxTokens: maxOutputTokens(),
      timeout: 45000,
    });
    recordTurn(opts.clientKey, result.usage?.outputTokens || 0);
    const parsed = parseModelJson(result.text);
    const answer = parsed?.answer || fallback;
    const parsedView = parsed?.view != null ? validateView(parsed.view) : view;
    return {
      ...base,
      kind: 'ok',
      answer,
      view: parsedView || view,
      model: result.model || process.env.LLM_MODEL || 'tarka',
      usedModel: true,
      usage: result.usage || base.usage,
      remaining: remainingFor(opts.clientKey),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'model error';
    console.warn('[ask-sandbox] Tarka failed:', message);
    return {
      ...base,
      kind: 'ok',
      answer: `${fallback}\n\n(Model unavailable — showing the desk figures directly.)`,
      model: null,
      usedModel: false,
    };
  }
}
