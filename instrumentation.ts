export async function register() {
  // Only execute server-side in node environment
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { sweeper } = await import('./lib/sweeper');
    sweeper.start().catch(err => {
      console.error('[Instrumentation] Failed to start sweeper:', err.message);
    });
  }
}
