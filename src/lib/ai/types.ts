export type LunaAIFeature =
  | 'website_audit_interpretation'
  | 'local_seo_audit_interpretation'
  | 'keyword_research'
  | 'competitor_snapshot'
  | 'draft_strategy'
  | 'on_page_recommendations'
  | 'content_brief'
  | 'content_draft'
  | 'gbp_post'
  | 'citation_recommendations'
  | 'monthly_report_draft'
  | 'client_safe_explanation'
  | 'approved_deliverable_revision';

export type LunaModelTier = 'economy' | 'standard' | 'premium';

export interface LunaAIRequest {
  organizationId: string;
  siteId: string;
  userId: string;
  feature: LunaAIFeature;
  preset: string;
  requestedModelTier: LunaModelTier;
  input: unknown;
  maximumOutputTokens: number;
  idempotencyKey: string;
}

export interface LunaAIResult {
  reservationId: string;
  usageEventId: string;
  text: string;
  creditsCharged: number;
}
