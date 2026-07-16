import { describe, expect, it } from 'vitest';
import { auditWebsite } from '../src/lib/website-audit';
import { getPublicSupabaseConfig, DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from '../src/lib/supabase/public-config';
import { POST as retiredAiPost } from '../src/app/api/ai/actions/route';


describe('Luna runtime configuration', () => {
  it('has a safe public Supabase fallback protected by RLS', () => {
    const config = getPublicSupabaseConfig();
    expect(config.supabaseUrl).toBeTruthy();
    expect(config.supabaseAnonKey).toBeTruthy();
    expect(DEFAULT_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(DEFAULT_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
  });

  it('retires the prototype endpoint that trusted tenant IDs from the request body', async () => {
    const response = retiredAiPost();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'endpoint_retired' } });
  });
});

describe('Website audit safety', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://192.168.1.10',
    'http://169.254.169.254',
  ])('blocks obvious private or local targets: %s', async (url) => {
    await expect(auditWebsite(url, 1)).rejects.toThrow('Only public HTTP or HTTPS websites can be audited.');
  });
});
