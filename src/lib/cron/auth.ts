import { NextRequest } from 'next/server';
import { getServerEnv } from '@/lib/env';

export function verifyCronSecret(request: NextRequest): boolean {
  const header = request.headers.get('authorization');
  const token = header?.replace(/^Bearer\s+/i, '');
  return token === getServerEnv().CRON_SECRET;
}
