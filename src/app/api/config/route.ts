import { NextResponse } from 'next/server';
import { getPublicSupabaseConfig } from '@/lib/supabase/public-config';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getPublicSupabaseConfig(), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
