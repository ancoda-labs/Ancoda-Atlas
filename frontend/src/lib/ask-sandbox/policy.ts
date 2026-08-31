import type { AskIntent } from '@/lib/ask-sandbox/types';

const RESCUE_PERSON = /\b(is|was)\s+(my|our)\b.{0,40}\b(on the list|rescued|missing|found)\b|\b(brother|sister|mother|father|husband|wife|son|daughter|family)\b.{0,30}\b(list|register|rescued|missing)\b|\b(ram|sita|hari)\s+bahadur\b|\bnaama?\s+(khoj|list)|हराएको|उद्धार सूची|नाम छ कि/i;

const SAFETY = /\b(should we|shall we|do we)\b.{0,24}\b(leave|stay|evacuate|go back|return)\b|\bis (it|betrawati|rasuwa|the (bridge|road|village)) safe\b|\bwalk onto the bridge\b|छोड्ने|जानु हुन्छ|सुरक्षित छ/i;

const PREDICT = /\bwill (the )?(lake|glacial|glof|river|flood|dam)\b.{0,30}\b(burst|break|come|rise|happen|again)\b|\b(predict|forecast|tomorrow).{0,20}(flood|burst|glof)\b|फुट्छ|आउँछ कि/i;

const WORST = /\b(worst|hardest)[ -]hit|\bwhich districts\b|\bmost (deaths|dead|killed)\b|कुन जिल्ला/i;
const UNCONTACTED = /\buncontacted\b|\bstill missing\b|\bnot (been )?contacted\b|सम्पर्कविहीन/i;
const GAUGES = /\bgauge\b|\bwater level\b|\briver (level|height)\b|बेत्रावती|betrawati|\bphalakhu\b|नदी सतह/i;
const FUNDS = /\bdonat|\bgive (money|safely)\b|\bqr\b|\brelief fund\b|सहयोग|कोष/i;
const NEWS = /\b(news|headline|press|what are (they|outlets) saying)\b|समाचार/i;
const HELPLINES = /\b(who to call|helpline|phone number|1234)\b|फोन|हेल्पलाइन/i;
const FIGURES = /\bhow many (died|dead|deaths|killed|injured)\b|\bdeath toll\b|कति मृत्यु/i;
const DISTRICT = /\b(rasuwa|nuwakot|dhading|chitwan|gorkha|tanahun|nawalparasi|syaphrubesi|timure|galchhi|devghat|bidur)\b|रसुवा|नुवाकोट|धादिङ|चितवन|बेत्रावती/i;

export function classifyIntent(question: string): AskIntent {
  const q = question.trim();
  if (!q) return 'other';
  if (RESCUE_PERSON.test(q)) return 'rescue_person';
  if (SAFETY.test(q)) return 'safety_advice';
  if (PREDICT.test(q)) return 'prediction';
  if (WORST.test(q)) return 'worst_districts';
  if (UNCONTACTED.test(q)) return 'uncontacted';
  if (FUNDS.test(q)) return 'funds';
  if (GAUGES.test(q) && !FIGURES.test(q)) return 'gauges';
  if (HELPLINES.test(q)) return 'helplines';
  if (NEWS.test(q) && !FIGURES.test(q)) return 'news';
  if (FIGURES.test(q)) return 'figures';
  if (DISTRICT.test(q)) return 'district';
  return 'other';
}

export function isRefusal(intent: AskIntent): intent is 'rescue_person' | 'safety_advice' | 'prediction' {
  return intent === 'rescue_person' || intent === 'safety_advice' || intent === 'prediction';
}
