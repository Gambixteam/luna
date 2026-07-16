import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { featureDefaults } from '@/lib/ai/presets';
import { LunaAIError, runLunaAIRequest } from '@/lib/ai/service';

const requestSchema = z.object({
  organizationId: z.uuid(),
  siteId: z.uuid(),
  userId: z.uuid(),
  feature: z.enum(Object.keys(featureDefaults) as [keyof typeof featureDefaults, ...(keyof typeof featureDefaults)[]]),
  input: z.object({ purpose: z.string().min(1).max(200), data: z.unknown() }),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.parse(await request.json());
    const defaults = featureDefaults[parsed.feature];
    const result = await runLunaAIRequest({
      ...parsed,
      preset: defaults.preset,
      requestedModelTier: defaults.tier,
      maximumOutputTokens: defaults.maximumOutputTokens,
    });
    return NextResponse.json({ text: result.text, creditsCharged: result.creditsCharged, reservationId: result.reservationId });
  } catch (error) {
    if (error instanceof LunaAIError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: 'bad_request', message: 'Invalid AI request.' } }, { status: 400 });
  }
}
