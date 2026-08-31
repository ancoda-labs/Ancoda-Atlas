import { sweeper } from '@/lib/sweeper';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // A subscriber is by definition waiting for sweep results, so make sure
  // something is producing them.
  sweeper.ensureStarted();

  const stream = new ReadableStream({
    start(controller) {
      const client = {
        write(data: string) {
          controller.enqueue(new TextEncoder().encode(data));
        }
      };

      sweeper.sseClients.add(client);

      // Send initial connect success event
      client.write('data: {"type":"connected"}\n\n');

      // Keep connection alive with a 15s ping interval
      const pingInterval = setInterval(() => {
        try {
          client.write(':ping\n\n');
        } catch {
          clearInterval(pingInterval);
          sweeper.sseClients.delete(client);
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        sweeper.sseClients.delete(client);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
