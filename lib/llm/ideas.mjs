// LLM-Powered Actionable Reads — generates Nepal hazard reads from sweep data + delta context

/**
 * Generate LLM-enhanced actionable reads from sweep data.
 * @param {LLMProvider} provider - configured LLM provider
 * @param {object} sweepData - synthesized dashboard data
 * @param {object|null} delta - delta from last sweep
 * @param {Array} previousIdeas - ideas from previous runs (for dedup)
 * @returns {Promise<Array>} - array of idea objects
 */
export async function generateLLMIdeas(provider, sweepData, delta, previousIdeas = []) {
  if (!provider?.isConfigured) return null;

  let context;
  try {
    context = compactSweepForLLM(sweepData, delta, previousIdeas);
  } catch (err) {
    console.error('[LLM Ideas] Failed to compact sweep data:', err.message);
    return null;
  }

  const systemPrompt = `You are an emergency management analyst covering natural disasters in Nepal. You receive structured hazard data from five Nepal-scoped sources — USGS seismic, Open-Meteo weather, NASA FIRMS fire detection, Open-Meteo air quality, and ReliefWeb — and produce 5-8 actionable reads.

Scope: natural hazards in Nepal only. Earthquakes, monsoon floods, landslides, glacial lake outburst floods, wildfire, hazardous air, extreme heat and cold, avalanches, and the humanitarian response to them. Politics, markets, trade, conflict and diplomacy are out of scope — never write a read whose subject is any of those. India and China are relevant solely through cross-boundary hazards such as upstream river discharge and transboundary smoke.

What matters in Nepal, in rough priority order:
- Earthquakes on the Main Himalayan Thrust — depth matters as much as magnitude
- Monsoon floods in the Terai and landslides in the hill districts, June through September
- Compound hazard: slopes loosened by shaking failing under later rainfall
- Glacial lake outburst floods in the high Himalaya
- Pre-monsoon forest fire season, March through May, and the smoke it pushes into the Kathmandu valley
- Terai heat waves in May and June, and cold waves in December and January
- Access: which highways, airstrips and river crossings a hazard takes out

Rules:
- Each read must cite specific data points from the input
- Include rationale, risk factors, and time horizon
- Cross-correlate across hazard layers — the strongest reads combine two independent signals
- Be specific: name districts, river basins, corridors and stations, not vague generalities
- Respect seasonality: fire detections in April and rainfall in July are normal; the same values off-season are not
- Atlas reads model output and satellite feeds, not official warnings — say so when a read would drive a public advisory
- If delta shows significant changes, lead with those
- Do NOT repeat reads from the "previous ideas" list unless conditions have materially changed
- Rate confidence: HIGH (multiple confirming signals), MEDIUM (thesis supported), LOW (speculative)

Output ONLY valid JSON array. Each object:
{
  "title": "Short title (max 10 words)",
  "type": "PREPARE|RESPOND|WATCH|STAND-DOWN",
  "ticker": "Primary subject: district, river basin, corridor, or monitoring station",
  "confidence": "HIGH|MEDIUM|LOW",
  "rationale": "2-3 sentence explanation citing specific data",
  "risk": "Key risk factor",
  "horizon": "Immediate|Days|Weeks|Months",
  "signals": ["signal1", "signal2"]
}`;

  try {
    const result = await provider.complete(systemPrompt, context, { maxTokens: 8192, timeout: 90000 });
    const ideas = parseIdeasResponse(result.text);
    if (ideas && ideas.length > 0) {
      return ideas;
    }
    console.warn('[LLM Ideas] No valid ideas parsed from response. Raw length:', result.text?.length, 'First 1000 chars:', JSON.stringify(result.text?.slice(0, 1000)));
    return null;
  } catch (err) {
    console.error('[LLM Ideas] Generation failed:', err.message);
    return null;
  }
}

/**
 * Compact sweep data to ~8KB for token efficiency.
 */
function compactSweepForLLM(data, delta, previousIdeas) {
  const sections = [];

  // Seismic — the highest-consequence feed for Nepal, so it leads
  if (data.seismic?.totalEvents != null) {
    const sq = data.seismic;
    let line = `SEISMIC: ${sq.events24h} in 24h, ${sq.events7d} in 7d, max M${sq.maxMagnitude ?? 'n/a'}`;
    if (sq.strongest) line += ` (${sq.strongest.place}, depth ${sq.strongest.depthKm ?? '?'}km)`;
    sections.push(line);
    const shallow = (sq.significant || []).filter(q => q.depthKm != null && q.depthKm < 35);
    if (shallow.length) {
      sections.push(`SHALLOW_RUPTURES (<35km): ${shallow.slice(0, 5).map(q => `M${q.mag} ${q.place}`).join('; ')}`);
    }
  }

  // Weather and monsoon hazard
  if (data.weather) {
    const alerts = (data.weather.alerts || []).slice(0, 6).map(a => `${a.event} [${a.severity}] — ${a.headline || '?'}`);
    sections.push(`WEATHER: ${data.weather.totalAlerts || 0} alerts, monsoon=${data.weather.monsoonSeason ? 'ACTIVE' : 'off-season'}${alerts.length ? `\n  ${alerts.join('\n  ')}` : ''}`);

    const wettest = [...(data.weather.stations || [])]
      .sort((a, b) => (b.rain5dMm || 0) - (a.rain5dMm || 0))
      .slice(0, 4)
      .filter(st => st.rain5dMm > 0);
    if (wettest.length) {
      sections.push(`RAINFALL_5D: ${wettest.map(st => `${st.city}=${st.rain5dMm}mm (peak day ${st.maxDailyRainMm}mm)`).join(', ')}`);
    }

    const hot = (data.weather.stations || []).filter(st => st.temperature != null && st.temperature >= 38);
    if (hot.length) {
      sections.push(`HEAT: ${hot.map(st => `${st.city}=${st.temperature}°C`).join(', ')}`);
    }
  }

  // Fire detections
  if (data.fire?.totalDetections) {
    const hotRegions = (data.fire.regions || []).filter(t => t.det > 10).map(t => `${t.region}: ${t.det} detections (${t.hc} high-conf, ${t.night} night)`);
    sections.push(`FIRE: ${data.fire.totalDetections} detections nationwide, season=${data.fire.fireSeason ? 'ACTIVE' : 'off'}${hotRegions.length ? ` — ${hotRegions.join(', ')}` : ''}`);
  }

  // Air quality
  if (data.airQuality?.stations?.length) {
    const top = [...data.airQuality.stations].sort((a, b) => (b.aqi || 0) - (a.aqi || 0)).slice(0, 4);
    sections.push(`AIR_QUALITY: ${top.map(s => `${s.location}=${s.aqi ?? 'n/a'} (${s.band || '?'})`).join(', ')}`);
  }

  // Humanitarian
  if (data.relief?.disasters?.length) {
    sections.push(`RELIEFWEB_ACTIVE: ${data.relief.disasters.slice(0, 5).map(d => `${d.name || d.title}${d.type?.length ? ` [${d.type.join('/')}]` : ''}`).join('; ')}`);
  }

  // Reported impact — the only layer that sees an event already under way
  if (data.impact?.count) {
    const where = (data.impact.topRegions || []).map(r => `${r.region}=${r.count}`).join(', ');
    sections.push(`REPORTED_IMPACT: ${data.impact.count} of ${data.news?.length || 0} hazard headlines report casualties, missing persons, displacement or active rescue${where ? ` — concentrated in ${where}` : ''}`);
  }

  // Hazard headlines from Nepali outlets
  if (data.news?.length) {
    sections.push(`HAZARD_HEADLINES:\n${data.news.slice(0, 8).map(n => `- [${n.region}] ${n.title}`).join('\n')}`);
  }

  // Source coverage — a read should not lean on a layer that is down
  if (data.health?.length) {
    const down = data.health.filter(h => h.err).map(h => h.n);
    if (down.length) sections.push(`SOURCES_DOWN: ${down.join(', ')}`);
  }

  // Delta context
  if (delta?.summary) {
    sections.push(`\nDELTA_SINCE_LAST_SWEEP: direction=${delta.summary.direction}, changes=${delta.summary.totalChanges}, critical=${delta.summary.criticalChanges}`);
    if (delta.signals?.escalated?.length) {
      sections.push(`ESCALATED: ${delta.signals.escalated.map(s => `${s.label}: ${s.previous}→${s.current} (${(s.changePct||0) > 0 ? '+' : ''}${(s.changePct||0).toFixed(1)}%)`).join(', ')}`);
    }
    if (delta.signals?.new?.length) {
      sections.push(`NEW_SIGNALS: ${delta.signals.new.map(s => s.label || s.text?.substring(0, 60)).join('; ')}`);
    }
  }

  // Previous ideas (for dedup)
  if (previousIdeas.length) {
    sections.push(`\nPREVIOUS_IDEAS (avoid repeating):\n${previousIdeas.map(i => `- ${i.title} [${i.type}]`).join('\n')}`);
  }

  return sections.join('\n');
}

/**
 * Parse LLM response into ideas array. Handles markdown code blocks.
 */
function parseIdeasResponse(text) {
  if (!text) return null;

  // Strip markdown code block wrappers (handles trailing whitespace, thinking tags, etc.)
  let cleaned = text.trim();
  // Extract content from code blocks anywhere in the response
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
  }
  // Strip any leading/trailing non-JSON text (find the array)
  const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    cleaned = arrayMatch[1];
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;

    // Validate each idea has required fields
    return parsed.filter(idea =>
      idea.title && idea.type && idea.confidence
    ).map(idea => ({
      title: idea.title,
      type: idea.type,
      ticker: idea.ticker || '',
      confidence: idea.confidence,
      rationale: idea.rationale || '',
      risk: idea.risk || '',
      horizon: idea.horizon || '',
      signals: idea.signals || [],
      source: 'llm',
    }));
  } catch {
    // Try to extract JSON array from mixed text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        return arr.filter(i => i.title && i.type).map(idea => ({
          ...idea,
          source: 'llm',
        }));
      } catch { /* give up */ }
    }
    return null;
  }
}
