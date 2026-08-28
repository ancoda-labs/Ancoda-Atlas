import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type {
  AlerterLike,
  AtlasConfig,
  BroadcastMessage,
  HazardSnapshot,
  LLMProviderLike,
  MemoryManagerLike,
  SseClient,
} from '@/types';
import { errorMessage } from '@/types';

// Global state container key for hot-reloads in Next.js dev mode
const GLOBAL_SWEEPER_KEY = Symbol.for('atlas.sweeper');

class SweeperManager {
  public currentData: HazardSnapshot | null = null;
  public lastSweepTime: string | null = null;
  public sweepStartedAt: string | null = null;
  public sweepInProgress = false;
  public startTime = Date.now();
  public sseClients = new Set<SseClient>();
  private intervalId: NodeJS.Timeout | null = null;
  private memory: MemoryManagerLike | null = null;
  private config: AtlasConfig | null = null;
  private llmProvider: LLMProviderLike | null = null;
  private telegramAlerter: AlerterLike | null = null;
  private discordAlerter: AlerterLike | null = null;

  constructor() {
    this.initPaths();
    this.loadInitialData();
  }

  private initPaths() {
    const runsDir = join(process.cwd(), 'runs');
    const memoryDir = join(runsDir, 'memory');
    for (const dir of [runsDir, memoryDir, join(memoryDir, 'cold')]) {
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.warn(`[Sweeper] Failed to ensure directory exists: ${dir} (filesystem might be read-only)`, err instanceof Error ? err.message : err);
      }
    }
  }

  private loadInitialData() {
    const runsDir = join(process.cwd(), 'runs');
    // dashboard.json holds the synthesized payload the UI renders.
    // latest.json holds the raw sweep and is for the CLI and LLM layers.
    const dashboardPath = join(runsDir, 'dashboard.json');
    if (existsSync(dashboardPath)) {
      try {
        this.currentData = JSON.parse(readFileSync(dashboardPath, 'utf8'));
        console.log('[Sweeper] Loaded existing data from runs/dashboard.json');
      } catch (err) {
        console.warn('[Sweeper] Failed to read runs/dashboard.json:', errorMessage(err));
      }
    }
  }

  public async start() {
    if (this.intervalId) return; // already running

    console.log('[Sweeper] Initializing background sweeping engine...');
    
    // Dynamically import modules on start to avoid build-time issues with commonjs/esm in Next.js
    const configModule = await import('@/atlas.config.mjs');
    const config = configModule.default;
    this.config = config;

    const { MemoryManager } = await import('@/lib/delta/index.mjs');
    const { createLLMProvider } = await import('@/lib/llm/index.mjs');
    const { TelegramAlerter } = await import('@/lib/alerts/telegram.mjs');
    const { DiscordAlerter } = await import('@/lib/alerts/discord.mjs');

    this.memory = new MemoryManager(join(process.cwd(), 'runs'));
    this.llmProvider = createLLMProvider(config.llm);
    this.telegramAlerter = new TelegramAlerter(config.telegram);
    this.discordAlerter = new DiscordAlerter(config.discord ?? {});

    // Run initial sweep
    this.runSweepCycle().catch(err => console.error('[Sweeper] Initial sweep failed:', errorMessage(err)));

    // Start interval loop
    const minutes = config.refreshIntervalMinutes || 15;
    this.intervalId = setInterval(() => this.runSweepCycle(), minutes * 60 * 1000);
  }

  public async runSweepCycle() {
    if (this.sweepInProgress) {
      console.log('[Sweeper] Sweep already in progress, skipping');
      return;
    }

    this.sweepInProgress = true;
    this.sweepStartedAt = new Date().toISOString();
    this.broadcast({ type: 'sweep_start', timestamp: this.sweepStartedAt });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Sweeper] Starting sweep at ${new Date().toLocaleTimeString()}`);
    console.log(`${'='.repeat(60)}`);

    const memory = this.memory;
    if (!memory) {
      console.warn('[Sweeper] runSweepCycle called before start(); skipping');
      this.sweepInProgress = false;
      return;
    }

    try {
      const { fullBriefing } = await import('@/apis/briefing.mjs');
      const { synthesize, generateIdeas } = await import('@/lib/synthesize.mjs');
      const { generateLLMIdeas } = await import('@/lib/llm/ideas.mjs');

      // 1. Run full briefing sweep
      const rawData = await fullBriefing();

      // 2. Save to runs/latest.json
      const runsDir = join(process.cwd(), 'runs');
      writeFileSync(join(runsDir, 'latest.json'), JSON.stringify(rawData, null, 2));
      this.lastSweepTime = new Date().toISOString();

      // 3. Synthesize into dashboard format
      console.log('[Sweeper] Synthesizing dashboard data...');
      const synthesized = await synthesize(rawData);

      // 4. Delta computation
      const delta = memory.addRun(synthesized);
      synthesized.delta = delta;

      // 5. LLM-powered actionable reads
      const llm = this.llmProvider;
      if (llm?.isConfigured) {
        try {
          console.log('[Sweeper] Generating LLM actionable reads...');
          const previousIdeas = memory.getLastRun()?.ideas ?? [];
          const llmIdeas = await generateLLMIdeas(llm, synthesized, delta, previousIdeas);
          if (llmIdeas) {
            synthesized.ideas = llmIdeas;
            synthesized.ideasSource = 'llm';
            console.log(`[Sweeper] LLM generated ${llmIdeas.length} ideas`);
          } else {
            synthesized.ideas = [];
            synthesized.ideasSource = 'llm-failed';
          }
        } catch (llmErr) {
          console.error('[Sweeper] LLM ideas failed (non-fatal):', errorMessage(llmErr));
          synthesized.ideas = [];
          synthesized.ideasSource = 'llm-failed';
        }
      } else {
        synthesized.ideas = generateIdeas(synthesized);
        synthesized.ideasSource = synthesized.ideas.length ? 'rules' : 'disabled';
      }

      // 6. Alert evaluation
      if ((delta?.summary.totalChanges ?? 0) > 0) {
        for (const [name, alerter] of [
          ['Telegram', this.telegramAlerter],
          ['Discord', this.discordAlerter],
        ] as const) {
          if (!alerter?.isConfigured) continue;
          alerter.evaluateAndAlert(llm, delta, memory).catch((err: unknown) => {
            console.error(`[Sweeper] ${name} alert error:`, errorMessage(err));
          });
        }
      }

      // 7. Post actionable reads
      const discord = this.discordAlerter;
      if (discord?.isConfigured && discord.sendActionableIdeas && synthesized.ideas.length > 0) {
        discord.sendActionableIdeas(synthesized.ideas).catch((err: unknown) => {
          console.error('[Sweeper] Discord idea alert error:', errorMessage(err));
        });
      }

      // Prune old alerted signals
      memory.pruneAlertedSignals();

      this.currentData = synthesized;
      writeFileSync(join(runsDir, 'dashboard.json'), JSON.stringify(synthesized, null, 2));
      this.broadcast({ type: 'update', data: this.currentData });
    } catch (err) {
      console.error('[Sweeper] Sweep cycle failed:', errorMessage(err));
    } finally {
      this.sweepInProgress = false;
      console.log('[Sweeper] Sweep cycle completed.');
    }
  }

  public broadcast(message: BroadcastMessage) {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }
}

// Retrieve or initialize the singleton
let sweeper: SweeperManager;
if (process.env.NODE_ENV === 'production') {
  sweeper = new SweeperManager();
} else {
  // Next.js dev mode re-evaluates modules on hot reload; the sweeper must not
  // restart its interval each time, so it is pinned to a global.
  const globalStore = globalThis as typeof globalThis & Record<symbol, SweeperManager>;
  if (!globalStore[GLOBAL_SWEEPER_KEY]) {
    globalStore[GLOBAL_SWEEPER_KEY] = new SweeperManager();
  }
  sweeper = globalStore[GLOBAL_SWEEPER_KEY];
}

export { sweeper };
export default sweeper;
