import 'server-only';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { featureDefaults } from './presets';
import { submitOpenRouterRequest } from './openrouter';
import type { LunaAIRequest, LunaAIResult } from './types';

const inputSchema = z.object({ purpose: z.string().min(1).max(200), data: z.unknown() });

export class LunaAIError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

export async function runLunaAIRequest(request: LunaAIRequest): Promise<LunaAIResult> {
  const defaults = featureDefaults[request.feature];
  if (!defaults) throw new LunaAIError('unknown_feature', 'Unsupported AI feature.', 400);
  if (request.preset !== defaults.preset) throw new LunaAIError('invalid_preset', 'Feature preset is not allowed.', 403);
  if (request.requestedModelTier !== defaults.tier) throw new LunaAIError('invalid_model_tier', 'Requested model tier is not allowed.', 403);
  if (request.maximumOutputTokens > defaults.maximumOutputTokens) throw new LunaAIError('output_limit_exceeded', 'Requested output is too large.', 413);
  inputSchema.parse(request.input);

  const supabase = createSupabaseServiceClient();
  const reservation = await supabase.rpc('reserve_ai_usage', {
    p_organization_id: request.organizationId,
    p_site_id: request.siteId,
    p_user_id: request.userId,
    p_feature_key: request.feature,
    p_preset_key: request.preset,
    p_requested_model_tier: request.requestedModelTier,
    p_luna_credits: defaults.credits,
    p_estimated_cost_usd: '0.050000',
    p_idempotency_key: request.idempotencyKey,
  });

  if (reservation.error) throw new LunaAIError('reservation_failed', 'AI request is temporarily unavailable.', 429);
  const reservationId = reservation.data as string;

  try {
    const result = await submitOpenRouterRequest(request);
    const usageEvent = await supabase.rpc('reconcile_ai_usage_success', {
      p_reservation_id: reservationId,
      p_actual_model: result.response.modelId ?? request.preset,
      p_actual_provider: null,
      p_input_tokens: result.usage.inputTokens ?? 0,
      p_output_tokens: result.usage.outputTokens ?? 0,
      p_actual_cost_usd: '0.000000',
      p_openrouter_generation_id: result.response.id ?? null,
    });
    if (usageEvent.error) throw usageEvent.error;
    return { reservationId, usageEventId: usageEvent.data as string, text: result.text, creditsCharged: defaults.credits };
  } catch (error) {
    await supabase.rpc('reconcile_ai_usage_failure', {
      p_reservation_id: reservationId,
      p_error_classification: classifyAIError(error),
    });
    throw new LunaAIError('ai_provider_failed', 'AI generation is temporarily unavailable.', 502);
  }
}

function classifyAIError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('402')) return 'openrouter_402';
  if (message.includes('403')) return 'openrouter_403';
  if (message.includes('429')) return 'openrouter_429';
  return 'upstream_provider_failure';
}
