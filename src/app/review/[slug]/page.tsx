import { createClient } from '@supabase/supabase-js';
import { getPublicSupabaseConfig } from '@/lib/supabase/public-config';

export const dynamic = 'force-dynamic';

export default async function PublicReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = getPublicSupabaseConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await supabase.rpc('get_public_review_request', { org_slug: slug });
  const profile = result.data?.[0] as { business_name?: string; review_request_url?: string; support_email?: string } | undefined;
  if (!profile?.review_request_url) return <main className="public-review-page"><section className="public-review-card"><span className="app-brand-mark">L</span><h1>This review page is not active.</h1><p>Please contact the business directly for assistance.</p></section></main>;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://luna.gambix.io';
  const publicUrl = `${appUrl}/review/${encodeURIComponent(slug)}`;
  const qrUrl = `https://quickchart.io/qr?size=260&margin=2&text=${encodeURIComponent(publicUrl)}`;
  return <main className="public-review-page"><section className="public-review-card">
    <div className="review-brand"><span className="app-brand-mark">L</span><span>Review request <small>powered by Luna by Gambix</small></span></div>
    <span className="kicker">Your feedback matters</span><h1>How was your experience with {profile.business_name}?</h1><p>Share an honest review based on your real experience. Reviews are never required, compensated, filtered, or conditioned on a positive rating.</p>
    <a className="app-button review-primary" href={profile.review_request_url} target="_blank" rel="noreferrer">Leave an honest Google review</a>
    {profile.support_email && <a className="secondary-button review-secondary" href={`mailto:${profile.support_email}?subject=${encodeURIComponent(`Private feedback for ${profile.business_name}`)}`}>Contact the business privately</a>}
    <div className="review-qr"><img src={qrUrl} alt={`QR code for ${profile.business_name} review request page`} width="260" height="260" /><div><strong>Print this QR code</strong><p>Customers can scan it to return to this review request page.</p><code>{publicUrl}</code></div></div>
    <small className="review-policy">Please follow Google’s review policies. Do not include sensitive personal information.</small>
  </section></main>;
}
