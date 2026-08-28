import { NextResponse } from 'next/server';
import { sweeper } from '@/lib/sweeper';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = sweeper.currentData || { meta: { sourcesOk: 0, sourcesQueried: 0, totalDurationMs: 0 } };
  return NextResponse.json(data);
}
