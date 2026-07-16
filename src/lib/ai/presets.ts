import type { LunaAIFeature, LunaModelTier } from './types';

export const featureDefaults: Record<LunaAIFeature, { preset: string; tier: LunaModelTier; credits: number; maximumOutputTokens: number }> = {
  website_audit_interpretation: { preset: 'luna-page-analysis', tier: 'economy', credits: 2, maximumOutputTokens: 1200 },
  local_seo_audit_interpretation: { preset: 'luna-page-analysis', tier: 'economy', credits: 2, maximumOutputTokens: 1200 },
  keyword_research: { preset: 'luna-keyword-research', tier: 'standard', credits: 5, maximumOutputTokens: 2000 },
  competitor_snapshot: { preset: 'luna-competitor-analysis', tier: 'standard', credits: 6, maximumOutputTokens: 2200 },
  draft_strategy: { preset: 'luna-strategy', tier: 'premium', credits: 12, maximumOutputTokens: 3200 },
  on_page_recommendations: { preset: 'luna-page-analysis', tier: 'standard', credits: 4, maximumOutputTokens: 1800 },
  content_brief: { preset: 'luna-content-brief', tier: 'standard', credits: 5, maximumOutputTokens: 2000 },
  content_draft: { preset: 'luna-content-draft', tier: 'standard', credits: 8, maximumOutputTokens: 3500 },
  gbp_post: { preset: 'luna-gbp-post', tier: 'standard', credits: 3, maximumOutputTokens: 900 },
  citation_recommendations: { preset: 'luna-fast-classification', tier: 'economy', credits: 2, maximumOutputTokens: 1000 },
  monthly_report_draft: { preset: 'luna-report', tier: 'premium', credits: 10, maximumOutputTokens: 3000 },
  client_safe_explanation: { preset: 'luna-fast-classification', tier: 'economy', credits: 1, maximumOutputTokens: 800 },
  approved_deliverable_revision: { preset: 'luna-quality-control', tier: 'standard', credits: 4, maximumOutputTokens: 1600 },
};
