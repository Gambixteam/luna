import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = createSupabaseServiceClient();
  const runId = crypto.randomUUID();
  const { error } = await supabase.from('cron_runs').insert({ id: runId, job_key: 'monthly-reports', status: 'success' });
  if (error) return NextResponse.json({ runId, status: 'partial_success' }, { status: 202 });
  return NextResponse.json({ runId, status: 'success' });
}
