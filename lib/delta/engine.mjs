// Delta Engine — compares two synthesized sweep results and produces structured
// changes across Nepal's natural-hazard layers.

// ─── Default Thresholds ──────────────────────────────────────────────────────
// Override via config.delta.thresholds in atlas.config.mjs

const DEFAULT_NUMERIC_THRESHOLDS = {
  max_magnitude: 10,   // % change in the largest recorded quake
  worst_aqi: 15,       // % change in the peak AQI across monitored cities
  max_rain_5d: 20,     // % change in the wettest station's 5-day rainfall total
};

const DEFAULT_COUNT_THRESHOLDS = {
  quakes_24h: 1,           // any new earthquake matters in Nepal
  quakes_7d: 3,
  weather_alerts: 1,       // any new flood or landslide alert matters
  extreme_alerts: 1,       // an extreme-severity alert is never routine
  thermal_total: 200,      // ±200 detections — Nepal's fire counts run smaller
  night_fires: 20,         // overnight burning means fires are running unchecked
  active_disasters: 1,     // any new declared response matters
  hazard_news: 5,          // ±5 hazard headlines
  impact_reports: 3,       // ±3 headlines reporting casualties, missing or rescue
  sources_ok: 1,           // any source going down matters
};

// ─── Metric Definitions ──────────────────────────────────────────────────────

const NUMERIC_METRICS = [
  { key: 'max_magnitude', extract: d => d.seismic?.maxMagnitude, label: 'Max Magnitude' },
  { key: 'worst_aqi', extract: d => d.airQuality?.worst?.aqi ?? null, label: 'Peak AQI' },
  { key: 'max_rain_5d', extract: d => {
      const rains = (d.weather?.stations || []).map(s => s.rain5dMm || 0);
      return rains.length ? Math.max(...rains) : null;
    }, label: 'Peak 5-day Rainfall' },
];

const COUNT_METRICS = [
  { key: 'quakes_24h', extract: d => d.seismic?.events24h || 0, label: 'Earthquakes (24h)' },
  { key: 'quakes_7d', extract: d => d.seismic?.events7d || 0, label: 'Earthquakes (7d)' },
  { key: 'weather_alerts', extract: d => d.weather?.totalAlerts || 0, label: 'Weather Alerts' },
  { key: 'extreme_alerts', extract: d => (d.weather?.alerts || []).filter(a => a.severity === 'extreme').length, label: 'Extreme Weather Alerts' },
  { key: 'thermal_total', extract: d => d.fire?.totalDetections || 0, label: 'Fire Detections' },
  { key: 'night_fires', extract: d => d.fire?.nightDetections || 0, label: 'Overnight Fire Detections' },
  { key: 'active_disasters', extract: d => d.relief?.disasters?.length || 0, label: 'Active Declared Disasters' },
  { key: 'hazard_news', extract: d => (d.news?.length ?? d.news?.count) || 0, label: 'Hazard Headlines' },
  { key: 'impact_reports', extract: d => d.impact?.count || 0, label: 'Reported Impact Headlines' },
  { key: 'sources_ok', extract: d => d.meta?.sourcesOk || 0, label: 'Sources OK' },
];

// Risk-sensitive keys: used for determining overall direction.
// Every one of them is a natural-hazard exposure measure.
const RISK_KEYS = ['quakes_24h', 'weather_alerts', 'extreme_alerts', 'worst_aqi', 'max_rain_5d', 'active_disasters', 'impact_reports'];

// ─── Core Delta Computation ──────────────────────────────────────────────────

/**
 * @param {object} current - current sweep's synthesized data
 * @param {object|null} previous - previous sweep's synthesized data (null on first run)
 * @param {object} [thresholdOverrides] - optional: { numeric: {...}, count: {...} }
 */
export function computeDelta(current, previous, thresholdOverrides = {}) {
  if (!previous) return null;
  if (!current) return null;

  const numThresholds = { ...DEFAULT_NUMERIC_THRESHOLDS, ...(thresholdOverrides.numeric || {}) };
  const cntThresholds = { ...DEFAULT_COUNT_THRESHOLDS, ...(thresholdOverrides.count || {}) };

  const signals = { new: [], escalated: [], deescalated: [], unchanged: [] };
  let criticalChanges = 0;

  // ─── Numeric metrics: track % change ─────────────────────────────────

  for (const m of NUMERIC_METRICS) {
    const curr = m.extract(current);
    const prev = m.extract(previous);
    if (curr == null || prev == null) continue;

    const threshold = numThresholds[m.key] ?? 5;
    const pctChange = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    if (Math.abs(pctChange) > threshold) {
      const entry = {
        key: m.key, label: m.label, from: prev, to: curr,
        pctChange: parseFloat(pctChange.toFixed(2)),
        direction: pctChange > 0 ? 'up' : 'down',
        severity: Math.abs(pctChange) > threshold * 3 ? 'critical' : Math.abs(pctChange) > threshold * 2 ? 'high' : 'moderate',
      };
      if (pctChange > 0) signals.escalated.push(entry);
      else signals.deescalated.push(entry);
      if (Math.abs(pctChange) > 10) criticalChanges++;
    } else {
      signals.unchanged.push(m.key);
    }
  }

  // ─── Count metrics: track absolute change (with minimum thresholds) ──

  for (const m of COUNT_METRICS) {
    const curr = m.extract(current);
    const prev = m.extract(previous);
    const diff = curr - prev;
    const threshold = cntThresholds[m.key] ?? 1;

    if (Math.abs(diff) >= threshold) {
      const pctChange = prev > 0 ? ((diff / prev) * 100) : (diff > 0 ? 100 : 0);
      const entry = {
        key: m.key, label: m.label, from: prev, to: curr,
        change: diff, direction: diff > 0 ? 'up' : 'down',
        pctChange: parseFloat(pctChange.toFixed(1)),
        severity: Math.abs(diff) >= threshold * 5 ? 'critical' : Math.abs(diff) >= threshold * 2 ? 'high' : 'moderate',
      };
      if (diff > 0) signals.escalated.push(entry);
      else signals.deescalated.push(entry);
      // Count metrics only critical if the change is extreme
      if (entry.severity === 'critical') criticalChanges++;
    } else {
      signals.unchanged.push(m.key);
    }
  }

  // ─── Damaging-earthquake tripwire ────────────────────────────────────

  const currAnom = (current.seismic?.maxMagnitude || 0) >= 5.5;
  const prevAnom = (previous.seismic?.maxMagnitude || 0) >= 5.5;
  if (currAnom && !prevAnom) {
    signals.new.push({ key: 'seismic_event', reason: 'Significant earthquake detected (M5.5+)', severity: 'critical' });
    criticalChanges += 5;
  } else if (!currAnom && prevAnom) {
    signals.deescalated.push({ key: 'seismic_event', label: 'Significant Earthquake', direction: 'resolved', severity: 'high' });
  }

  // ─── Source health degradation ───────────────────────────────────────

  const currSourcesDown = current.health?.filter(s => s.err).length || 0;
  const prevSourcesDown = previous.health?.filter(s => s.err).length || 0;
  if (currSourcesDown > prevSourcesDown + 2) {
    signals.new.push({
      key: 'source_degradation',
      reason: `${currSourcesDown - prevSourcesDown} additional sources failing (${currSourcesDown} total down)`,
      severity: currSourcesDown > 5 ? 'critical' : 'moderate',
    });
  }

  // ─── Overall direction ───────────────────────────────────────────────

  let direction = 'mixed';
  const riskUp = signals.escalated.filter(s => RISK_KEYS.includes(s.key)).length;
  const riskDown = signals.deescalated.filter(s => RISK_KEYS.includes(s.key)).length;
  if (riskUp > riskDown + 1) direction = 'risk-off';
  else if (riskDown > riskUp + 1) direction = 'risk-on';

  return {
    timestamp: current.meta?.timestamp || new Date().toISOString(),
    previous: previous.meta?.timestamp || null,
    signals,
    summary: {
      totalChanges: signals.new.length + signals.escalated.length + signals.deescalated.length,
      criticalChanges,
      direction,
      signalBreakdown: {
        new: signals.new.length,
        escalated: signals.escalated.length,
        deescalated: signals.deescalated.length,
        unchanged: signals.unchanged.length,
      },
    },
  };
}

// Export thresholds for external config
export { DEFAULT_NUMERIC_THRESHOLDS, DEFAULT_COUNT_THRESHOLDS };
