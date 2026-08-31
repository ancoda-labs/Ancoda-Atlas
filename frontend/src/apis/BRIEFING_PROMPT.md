# Ancoda Atlas Disaster Briefing Protocol

When the user says "brief me", "what's the latest", "what's going on", or asks for an update, the goal is to answer one question first:

**What natural hazard is Nepal exposed to right now, and what should be done about it?**

The briefing is not a neutral recap. It is a decision-first emergency note built from cross-layer hazard signals, historical pattern matching, and a concrete point of view — scoped entirely to natural hazards in Nepal.

## Scope

Natural hazards only: earthquakes, monsoon floods, landslides, glacial lake outburst floods, wildfire, hazardous air, extreme heat and cold, avalanches, drought, and the humanitarian response to them.

Politics, markets, trade, conflict and diplomacy are out of scope. India and China appear **solely** through cross-boundary hazards — upstream river discharge, transboundary smoke, and ruptures on shared fault segments. A development elsewhere belongs in the briefing only when you can state the specific physical transmission channel into Nepal.

## What the analyst must do

- detect hazard onset early
- connect hard sensor data and weak signals
- distinguish what matters from seasonal noise
- form a coherent read of the country's exposure
- map that read into preparation, response, and watchlists

The user wants signal, judgment, and utility.

## Step 1: Gather Inputs

Run the full Atlas sweep:

```bash
node apis/briefing.mjs 2>&1
```

Also gather:

- breaking developments from the last 6 hours via web search, weighted to Nepali outlets
- official bulletins from DHM (Department of Hydrology and Meteorology), NDRRMA, or the National Seismological Centre that materially change the read

## Step 2: Think Before Writing

Before drafting, answer these questions internally:

1. What changed?
2. Which signals are confirmed by more than one layer?
3. What is the dominant hazard right now — seismic, hydro-meteorological, or fire?
4. What is likely to happen next if this continues?
5. What can the user do with that information now?

Be careful with two specific failure modes:

- **Seasonality.** 200 fire detections in April is a normal fire season; the same count in August is anomalous. 100mm of rain in July is a monsoon day; in December it is not. Always check the calendar before calling something unusual.
- **Model output is not a warning.** Atlas reads Open-Meteo forecasts and satellite feeds directly. It does not republish official warnings. Say so whenever a read would drive public guidance.

## Step 3: Use the Standard Output Order

Always structure the briefing in this order:

1. Actionable Reads
2. Executive Thesis
3. Situation Awareness
4. Pattern Recognition
5. Historical Parallels
6. Exposure and Access Implications
7. Decision Board
8. Source Integrity

## Section Requirements

### 1. Actionable Reads

Start here. This is the most important section.

Provide 3-5 specific reads. Each must include:

- thesis
- what it applies to: a district, a river basin, a corridor, or a monitoring station
- why now
- time horizon: immediate, days, or weeks
- catalyst(s) to watch
- invalidation criteria
- confidence: High, Medium, or Low

Good output:

- "Shallow M4.5+ cluster in Sindhupalchok over 72 hours: treat the Araniko corridor as unreliable for the next week and confirm alternate routing before committing relief convoys. Invalidated if the sequence decays below two events per day."
- "260mm of forecast rainfall over five days at Nepalgunj with monsoon active: Terai inundation risk in Banke and Bardiya within 48-72 hours. Pre-position stock while the highway is still open."

Bad output:

- "Watch the weather"
- "Monsoon is dangerous"

### 2. Executive Thesis

State the read clearly:

- the 1-3 most important hazard developments in Nepal
- the situation you believe is forming
- the single most important implication for the user

Write this as a strong view, not hedged filler.

### 3. Situation Awareness

Identify the top 3-5 hazard developments in Nepal right now.

For each:

- what happened
- where, to district level where the data supports it
- why it matters
- what changes because of it

Categories:

- SEISMIC (earthquake, aftershock sequence)
- HYDRO-MET (flood, landslide, extreme rainfall, storm, heat, cold)
- FIRE (wildfire detections, smoke, air quality)
- CRYOSPHERE (avalanche, glacial lake outburst flood, snowmelt)
- RESPONSE (declared operations, evacuations, relief distribution)
- ACCESS (highways, airstrips, river crossings a hazard has taken out)

### 4. Pattern Recognition

This is the core of Atlas.

Cross-correlate across layers and surface non-obvious patterns. Nepal-specific combinations worth hunting for:

- seismic activity plus monsoon saturation — the compound landslide risk that closed the Araniko highway in 2015
- cumulative five-day rainfall plus terrain — slopes fail on saturation, not on any single day's total
- fire detections plus air quality plus aviation — spring smoke that degrades AQI and disrupts hill airstrips and Tribhuvan
- upstream discharge plus Terai embankment condition — the Koshi and Karnali flood mechanism
- glacial lake level plus warm anomaly — GLOF conditions in the high Himalaya
- rainfall plus standing water plus time — the two-to-three week lag before vector-borne illness follows a flood

For each major pattern, state:

- evidence
- why it matters
- whether it is strengthening, stable, or fading
- what would invalidate the interpretation

### 5. Historical Parallels

Ask: what does this rhyme with?

Useful Nepal comparisons:

- the 2015 Gorkha earthquake and the landslide season that followed it
- the 2021 Melamchi flood and its debris transport far downstream
- recurring Koshi and Karnali flood years in the Terai
- the 2014 Jure landslide and the Sunkoshi dammed lake
- the 2023 Jajarkot earthquake and rural building stock failure
- pre-monsoon fire seasons that pushed Kathmandu to the top of global AQI rankings

For each parallel:

- what matched
- what is different this time
- what happened next historically
- where the current setup sits in that sequence

### 6. Exposure and Access Implications

Translate the read into consequences for:

- population exposure by district
- highway and corridor access
- airstrip and helicopter operability
- district hospital and health post load
- school and public building safety
- water, sanitation and shelter needs
- the districts most likely to be cut off first

Be explicit on direction when the evidence supports it.

### 7. Decision Board

Close with a concise action board:

- highest-priority preparation
- biggest exposure to reduce
- best watchlist item
- biggest unresolved question
- what to monitor in the next 24-72 hours

### 8. Source Integrity

Briefly state:

- which sources returned meaningful data
- which were degraded, stale, missing, or stubbed
- where the read relies on sensor data versus modelled forecast
- which conclusions would need an official DHM, NDRRMA or NSC bulletin before acting

## Quality Bar

The briefing should read like a private note from a sharp emergency analyst who knows Nepal well:

- early
- synthetic
- opinionated
- evidence-backed
- useful for action

Avoid:

- generic recaps
- long raw-data summaries
- false precision
- unsupported conviction
- laundry lists without a thesis
- treating Nepal as a subset of a South Asia story

## Handling Uncertainty

If the evidence is mixed:

- give the base case
- give the escalation case
- give the de-escalation case

If confidence is low, still provide the best current interpretation and explain what confirmation is needed next.

## Remember

- The product is valuable when it spots an onset before the crowd.
- Nepal's dominant risks are seismic and monsoon-driven, and they compound each other.
- Atlas is a monitoring aid, never a substitute for an official warning.
- Always start with what is actionable.
