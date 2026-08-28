export async function register() {
  // Only execute server-side in node environment
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { sweeper } = await import('./lib/sweeper');
    sweeper.start().catch(err => {
      console.error('[Instrumentation] Failed to start sweeper:', err.message);
    });

    // The flood desk refreshes on its own, faster schedule than the national
    // hazard sweep: river gauges, the rescue registers and the wire all move on
    // ten-minute timescales during a live response.
    const { startFloodCron } = await import('./lib/flood-cron');
    try {
      startFloodCron();
    } catch (err) {
      console.error('[Instrumentation] Failed to start flood refresh:', err instanceof Error ? err.message : err);
    }
  }
}
