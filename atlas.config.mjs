// Ancoda Atlas Configuration — all settings with env var overrides
// Scope: Nepal natural-hazard monitoring (earthquake, flood, landslide,
// wildfire, hazardous air, and the humanitarian response to them).

import "./apis/utils/env.mjs"; // Load .env first
import { NEPAL_BBOX, NEPAL_CENTER, NEPAL_ISO } from "./apis/utils/nepal.mjs";

export default {
  // Geographic focus. Every geo-scoped source resolves against
  // apis/utils/nepal.mjs — edit the bounding box, provinces and cities there
  // rather than here.
  focus: {
    country: NEPAL_ISO.name,
    iso2: NEPAL_ISO.alpha2,
    iso3: NEPAL_ISO.alpha3,
    bbox: NEPAL_BBOX,
    center: NEPAL_CENTER,
    timezone: 'Asia/Kathmandu',
  },

  port: parseInt(process.env.PORT) || 3117,
  publicUrl: process.env.PUBLIC_URL || null,
  refreshIntervalMinutes: parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 15,

  llm: {
    provider: process.env.LLM_PROVIDER || null, // anthropic | openai | gemini | codex | openrouter | minimax | mistral | ollama | grok
    apiKey: process.env.LLM_API_KEY || null,
    model: process.env.LLM_MODEL || null,
    baseUrl: process.env.OLLAMA_BASE_URL || null,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || null,
    chatId: process.env.TELEGRAM_CHAT_ID || null,
    botPollingInterval: parseInt(process.env.TELEGRAM_POLL_INTERVAL) || 5000,
    channels: process.env.TELEGRAM_CHANNELS || null, // Comma-separated extra channel IDs
  },

  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || null,
    channelId: process.env.DISCORD_CHANNEL_ID || null,
    guildId: process.env.DISCORD_GUILD_ID || null, // Server ID (for instant slash command registration)
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || null, // Fallback: webhook-only alerts (no bot needed)
  },

  // Delta engine thresholds — override defaults from lib/delta/engine.mjs
  // Set to null to use built-in defaults
  delta: {
    thresholds: {
      numeric: {
        // Example overrides (uncomment to customize):
        // max_magnitude: 5,   // more sensitive to changes in the largest quake
        // worst_aqi: 25,      // less sensitive to air quality swings
      },
      count: {
        // quakes_24h: 2,       // need ±2 earthquakes to flag
        // thermal_total: 500,  // need ±500 fire detections
      },
    },
  },
};
