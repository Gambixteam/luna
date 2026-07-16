import type { SupabaseClient, User } from '@supabase/supabase-js';

const CREDIT_COSTS: Record<string, number> = {
  keyword_research: 5,
  competitor_snapshot: 6,
  draft_strategy: 12,
  content_brief: 5,
  content_draft: 8,
  gbp_post: 3,
  monthly_report: 10,
};

type GenerateOptions = {
  supabase: SupabaseClient;
  user: User;
  organizationId: string;
  siteId: string;
  feature: keyof typeof CREDIT_COSTS;
  system: string;
  prompt: string;
  fallback: Record<string, unknown>;
  idempotencyKey: string;
  maxTokens?: number;
};

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { return { raw: text }; }
}

export async function generateLunaJson(options: GenerateOptions) {
  const org = await options.supabase.from('organizations').select('plan_key').eq('id', options.organizationId).single();
  const plan = org.data?.plan_key ? await options.supabase.from('plans').select('entitlements').eq('key', org.data.plan_key).single() : null;
  const monthlyLimit = Number((plan?.data?.entitlements as Record<string, unknown> | undefined)?.ai_credits ?? 50);
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const usage = await options.supabase.from('ai_usage_events').select('luna_credits').eq('organization_id', options.organizationId).gte('created_at', start.toISOString());
  const used = (usage.data ?? []).reduce((total, row) => total + Number(row.luna_credits ?? 0), 0);
  const cost = CREDIT_COSTS[options.feature];
  if (used + cost > monthlyLimit) throw new Response('This organization has reached its monthly Luna Credits limit.', { status: 429 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    await options.supabase.from('ai_usage_events').insert({ organization_id: options.organizationId, site_id: options.siteId, user_id: options.user.id, feature_key: options.feature, model: 'rules-fallback', luna_credits: 0, status: 'fallback', idempotency_key: options.idempotencyKey });
    return options.fallback;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://luna.gambix.io', 'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Luna by Gambix' },
    body: JSON.stringify({
      model: process.env.OPENROUTER_DEFAULT_MODEL ?? 'openrouter/auto',
      messages: [
        { role: 'system', content: `${options.system}\nReturn valid JSON only. Never invent business facts, credentials, metrics, reviews, prices or outcomes.` },
        { role: 'user', content: options.prompt },
      ],
      temperature: 0.25,
      max_tokens: Math.min(options.maxTokens ?? 3000, 4000),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Response('Luna AI is temporarily unavailable.', { status: response.status === 429 ? 429 : 502 });
  const payload = await response.json() as { id?: string; model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
  const result = parseJson(payload.choices?.[0]?.message?.content ?? '');
  await options.supabase.from('ai_usage_events').insert({ organization_id: options.organizationId, site_id: options.siteId, user_id: options.user.id, feature_key: options.feature, model: payload.model ?? 'openrouter/auto', input_tokens: payload.usage?.prompt_tokens ?? 0, output_tokens: payload.usage?.completion_tokens ?? 0, actual_cost_usd: payload.usage?.cost ?? 0, luna_credits: cost, status: 'succeeded', idempotency_key: options.idempotencyKey });
  return result;
}
