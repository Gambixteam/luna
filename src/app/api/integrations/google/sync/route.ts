import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, requireSite } from '@/lib/supabase/request';
import { getGoogleAccessToken, googleJson, serviceClient } from '@/lib/integrations/google';

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function sumMetricSeries(payload: Record<string, any>) {
  const totals: Record<string, number> = {};
  for (const group of payload.multiDailyMetricTimeSeries ?? []) for (const series of group.dailyMetricTimeSeries ?? []) {
    totals[series.dailyMetric] = (series.timeSeries?.datedValues ?? []).reduce((sum: number, item: { value?: string }) => sum + Number(item.value ?? 0), 0);
  }
  return totals;
}

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const body = z.object({ siteId: z.string().uuid() }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const accessToken = await getGoogleAccessToken(context.organizationId!, site.id);
    const admin = serviceClient();
    const end = new Date(); const start = new Date(); start.setUTCDate(end.getUTCDate() - 27);
    const periodStart = isoDate(start); const periodEnd = isoDate(end);
    const result: Record<string, unknown> = {};

    // Search Console: discover accessible properties and automatically query the best domain match.
    try {
      const sites = await googleJson('https://www.googleapis.com/webmasters/v3/sites', accessToken);
      const entries = (sites.siteEntry ?? []) as Array<{ siteUrl: string; permissionLevel: string }>;
      const hostname = new URL(site.domain).hostname.replace(/^www\./, '');
      const selected = entries.find((item) => item.siteUrl === site.domain || item.siteUrl.includes(hostname)) ?? (entries.length === 1 ? entries[0] : null);
      let queryData: Record<string, any> | null = null;
      if (selected) {
        queryData = await googleJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(selected.siteUrl)}/searchAnalytics/query`, accessToken, { method: 'POST', body: JSON.stringify({ startDate: periodStart, endDate: periodEnd, dimensions: ['query','page'], rowLimit: 1000, dataState: 'final' }) });
        const rows = (queryData.rows ?? []) as Array<Record<string, any>>;
        const metrics = rows.reduce((total, row) => ({ clicks: total.clicks + Number(row.clicks ?? 0), impressions: total.impressions + Number(row.impressions ?? 0), weightedPosition: total.weightedPosition + Number(row.position ?? 0) * Number(row.impressions ?? 0) }), { clicks: 0, impressions: 0, weightedPosition: 0 });
        await admin.from('analytics_snapshots').insert({ organization_id: context.organizationId, site_id: site.id, source: 'gsc', period_start: periodStart, period_end: periodEnd, metrics: { clicks: metrics.clicks, impressions: metrics.impressions, ctr: metrics.impressions ? metrics.clicks / metrics.impressions : 0, averagePosition: metrics.impressions ? metrics.weightedPosition / metrics.impressions : null }, dimensions: { rows: rows.slice(0, 250), property: selected.siteUrl } });
      }
      await admin.from('integrations').update({ status: selected ? 'connected' : 'needs_attention', last_successful_sync: new Date().toISOString(), data_through_date: periodEnd, metadata: { properties: entries, selectedProperty: selected?.siteUrl ?? null } }).eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_search_console');
      result.searchConsole = { properties: entries.length, synced: Boolean(selected), rows: queryData?.rows?.length ?? 0 };
    } catch (error) {
      await admin.from('integrations').update({ status: 'needs_attention', last_failed_sync: new Date().toISOString(), metadata: { error: error instanceof Error ? error.message : 'Search Console sync failed' } }).eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_search_console');
      result.searchConsole = { error: error instanceof Error ? error.message : 'Sync failed' };
    }

    // GA4: discover properties. Auto-sync only when the selection is unambiguous.
    try {
      const summaries = await googleJson('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', accessToken);
      const properties = ((summaries.accountSummaries ?? []) as Array<Record<string, any>>).flatMap((account) => ((account.propertySummaries ?? []) as Array<Record<string, any>>).map((property) => ({ ...property, account: account.account, accountDisplayName: account.displayName })));
      const integration = await admin.from('integrations').select('metadata').eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_analytics_4').maybeSingle();
      const savedProperty = (integration.data?.metadata as Record<string, any> | undefined)?.selectedProperty;
      const selected = properties.find((item) => item.property === savedProperty) ?? (properties.length === 1 ? properties[0] : null);
      let report: Record<string, any> | null = null;
      if (selected?.property) {
        report = await googleJson(`https://analyticsdata.googleapis.com/v1beta/${selected.property}:runReport`, accessToken, { method: 'POST', body: JSON.stringify({ dateRanges: [{ startDate: periodStart, endDate: periodEnd }], dimensions: [{ name: 'landingPagePlusQueryString' }], metrics: [{ name: 'sessions' },{ name: 'activeUsers' },{ name: 'engagedSessions' },{ name: 'keyEvents' }], dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search', matchType: 'EXACT' } } }, limit: 250 }) });
        const totals = (report.totals?.[0]?.metricValues ?? []).map((item: { value: string }) => Number(item.value ?? 0));
        await admin.from('analytics_snapshots').insert({ organization_id: context.organizationId, site_id: site.id, source: 'ga4', period_start: periodStart, period_end: periodEnd, metrics: { organicSessions: totals[0] ?? 0, activeUsers: totals[1] ?? 0, engagedSessions: totals[2] ?? 0, keyEvents: totals[3] ?? 0 }, dimensions: { rows: report.rows ?? [], property: selected.property, propertyName: selected.displayName } });
      }
      await admin.from('integrations').update({ status: selected ? 'connected' : 'needs_attention', last_successful_sync: new Date().toISOString(), data_through_date: periodEnd, metadata: { properties, selectedProperty: selected?.property ?? savedProperty ?? null, selectionRequired: properties.length > 1 && !selected } }).eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_analytics_4');
      result.ga4 = { properties: properties.length, synced: Boolean(selected), rows: report?.rows?.length ?? 0 };
    } catch (error) {
      await admin.from('integrations').update({ status: 'needs_attention', last_failed_sync: new Date().toISOString(), metadata: { error: error instanceof Error ? error.message : 'GA4 sync failed' } }).eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_analytics_4');
      result.ga4 = { error: error instanceof Error ? error.message : 'Sync failed' };
    }

    // Google Business Profile: discover accounts and locations, then pull current profile and performance data when unambiguous.
    try {
      const accountsPayload = await googleJson('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', accessToken);
      const accounts = (accountsPayload.accounts ?? []) as Array<Record<string, any>>;
      const locationsPayload = await googleJson('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations?readMask=name,title,storefrontAddress,phoneNumbers,regularHours,serviceArea,categories,websiteUri,profile&pageSize=100', accessToken);
      const locations = (locationsPayload.locations ?? []) as Array<Record<string, any>>;
      const hostname = new URL(site.domain).hostname.replace(/^www\./, '');
      const selected = locations.find((item) => String(item.websiteUri ?? '').includes(hostname)) ?? (locations.length === 1 ? locations[0] : null);
      let performance: Record<string, any> | null = null;
      if (selected?.name) {
        const locationName = String(selected.name).replace(/^accounts\/[^/]+\//, '');
        const params = new URLSearchParams();
        for (const metric of ['WEBSITE_CLICKS','CALL_CLICKS','BUSINESS_DIRECTION_REQUESTS','BUSINESS_IMPRESSIONS_DESKTOP_MAPS','BUSINESS_IMPRESSIONS_DESKTOP_SEARCH','BUSINESS_IMPRESSIONS_MOBILE_MAPS','BUSINESS_IMPRESSIONS_MOBILE_SEARCH']) params.append('dailyMetrics', metric);
        const startParts = periodStart.split('-'); const endParts = periodEnd.split('-');
        params.set('dailyRange.startDate.year', startParts[0]); params.set('dailyRange.startDate.month', String(Number(startParts[1]))); params.set('dailyRange.startDate.day', String(Number(startParts[2])));
        params.set('dailyRange.endDate.year', endParts[0]); params.set('dailyRange.endDate.month', String(Number(endParts[1]))); params.set('dailyRange.endDate.day', String(Number(endParts[2])));
        performance = await googleJson(`https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params}`, accessToken);
        await admin.from('analytics_snapshots').insert({ organization_id: context.organizationId, site_id: site.id, source: 'gbp', period_start: periodStart, period_end: periodEnd, metrics: sumMetricSeries(performance), dimensions: { location: selected } });
      }
      await admin.from('integrations').update({ status: selected ? 'connected' : 'needs_attention', last_successful_sync: new Date().toISOString(), data_through_date: periodEnd, metadata: { accounts, locations, selectedLocation: selected?.name ?? null, selectionRequired: locations.length > 1 && !selected } }).eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_business_profile');
      result.googleBusinessProfile = { accounts: accounts.length, locations: locations.length, synced: Boolean(selected), metrics: performance ? sumMetricSeries(performance) : null };
    } catch (error) {
      await admin.from('integrations').update({ status: 'needs_attention', last_failed_sync: new Date().toISOString(), metadata: { error: error instanceof Error ? error.message : 'GBP sync failed' } }).eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_business_profile');
      result.googleBusinessProfile = { error: error instanceof Error ? error.message : 'Sync failed' };
    }

    return NextResponse.json({ periodStart, periodEnd, result });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Google sync failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Google sync failed.' }, { status: 400 });
  }
}
