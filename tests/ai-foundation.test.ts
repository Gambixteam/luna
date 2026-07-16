import { describe, expect, it } from 'vitest';
import { featureDefaults } from '../src/lib/ai/presets';
import { redactSecret } from '../src/lib/env';

const requiredPresets = [
  'luna-fast-classification', 'luna-page-analysis', 'luna-keyword-research', 'luna-competitor-analysis',
  'luna-strategy', 'luna-content-brief', 'luna-content-draft', 'luna-gbp-post', 'luna-report', 'luna-quality-control',
];

describe('AI foundation configuration', () => {
  it('maps every MVP AI feature to a bounded preset, tier, credits, and output limit', () => {
    expect(Object.keys(featureDefaults)).toHaveLength(13);
    for (const defaults of Object.values(featureDefaults)) {
      expect(requiredPresets).toContain(defaults.preset);
      expect(['economy', 'standard', 'premium']).toContain(defaults.tier);
      expect(defaults.credits).toBeGreaterThan(0);
      expect(defaults.maximumOutputTokens).toBeGreaterThan(0);
    }
  });

  it('keeps premium use limited to premium-approved workflow types', () => {
    const premiumFeatures = Object.entries(featureDefaults).filter(([, defaults]) => defaults.tier === 'premium').map(([feature]) => feature);
    expect(premiumFeatures).toEqual(['draft_strategy', 'monthly_report_draft']);
  });

  it('redacts secrets without returning the full value', () => {
    const secret = 'sk-or-v1-production-secret';
    const redacted = redactSecret(secret);
    expect(redacted).not.toContain('production-secret');
    expect(redacted).not.toEqual(secret);
  });
});
