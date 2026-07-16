import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  return NextResponse.json({ supabaseUrl, supabaseAnonKey }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
