export type SiteSignalFinding = {
  category: string;
  severity: 'critical'|'high'|'medium'|'low'|'info';
  title: string;
  description: string;
  affected_urls: string[];
  evidence: Record<string, unknown>;
};

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?)/i;

function publicBase(input: string) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['http:','https:'].includes(url.protocol) || PRIVATE_HOST.test(url.hostname)) throw new Error('Only public websites can be inspected.');
  return new URL(`${url.protocol}//${url.host}`);
}

async function fetchText(url: URL, timeout = 12000) {
  const response = await fetch(url, { headers: { 'User-Agent': 'LunaSEOAudit/1.0 (+https://gambix.io)', Accept: 'text/plain,text/xml,application/xml,text/html' }, redirect: 'follow', signal: AbortSignal.timeout(timeout), cache: 'no-store' });
  const text = await response.text();
  return { status: response.status, ok: response.ok, text: text.slice(0, 2_000_000), contentType: response.headers.get('content-type') ?? '' };
}

function finding(category: string, severity: SiteSignalFinding['severity'], title: string, description: string, url: string, evidence: Record<string, unknown> = {}): SiteSignalFinding {
  return { category, severity, title, description, affected_urls: [url], evidence };
}

export async function inspectSiteSignals(input: string) {
  const base = publicBase(input);
  const findings: SiteSignalFinding[] = [];
  const summary: Record<string, unknown> = { https: base.protocol === 'https:' };
  if (base.protocol !== 'https:') findings.push(finding('technical','critical','Website does not use HTTPS','Serve the entire website over HTTPS and redirect HTTP to HTTPS.',base.toString()));

  let robotsText = '';
  try {
    const robotsUrl = new URL('/robots.txt', base);
    const robots = await fetchText(robotsUrl);
    robotsText = robots.ok ? robots.text : '';
    summary.robotsStatus = robots.status;
    summary.robotsPresent = robots.ok && robots.text.trim().length > 0;
    if (!robots.ok || !robots.text.trim()) findings.push(finding('technical','medium','robots.txt is missing or unavailable','Publish a valid robots.txt file and reference the preferred XML sitemap.',robotsUrl.toString(),{ status: robots.status }));
    if (/disallow:\s*\//i.test(robots.text) && !/user-agent:\s*[^\r\n]+[\s\S]*?allow:/i.test(robots.text)) findings.push(finding('technical','critical','robots.txt may block the entire website','Review the Disallow rules before search engines are prevented from crawling the site.',robotsUrl.toString()));
  } catch (error) {
    findings.push(finding('technical','medium','robots.txt could not be retrieved',error instanceof Error ? error.message : 'The request failed.',new URL('/robots.txt',base).toString()));
  }

  const declared = [...robotsText.matchAll(/^sitemap:\s*(\S+)/gim)].map((match) => match[1]);
  const sitemapCandidates = [...new Set([...declared,new URL('/sitemap.xml',base).toString(),new URL('/sitemap_index.xml',base).toString()])];
  let sitemapUrl: string | null = null; let sitemapCount = 0; let sitemapStatus: number | null = null;
  for (const candidate of sitemapCandidates.slice(0,5)) {
    try {
      const result = await fetchText(new URL(candidate)); sitemapStatus = result.status;
      if (result.ok && /<\s*(urlset|sitemapindex)\b/i.test(result.text)) { sitemapUrl = candidate; sitemapCount = (result.text.match(/<loc>/gi) ?? []).length; break; }
    } catch {}
  }
  summary.sitemapUrl = sitemapUrl; summary.sitemapUrlCount = sitemapCount; summary.sitemapStatus = sitemapStatus;
  if (!sitemapUrl) findings.push(finding('technical','high','XML sitemap was not found','Publish an XML sitemap, reference it in robots.txt, and submit it in Search Console.',base.toString(),{ checked: sitemapCandidates }));
  else if (!declared.length) findings.push(finding('technical','low','Sitemap is not referenced in robots.txt','Add the sitemap URL to robots.txt to make discovery explicit.',new URL('/robots.txt',base).toString(),{ sitemapUrl }));
  if (sitemapUrl && sitemapCount === 0) findings.push(finding('technical','medium','Sitemap contains no discoverable URLs','Validate the sitemap output and confirm indexable pages are included.',sitemapUrl));

  try {
    const params = new URLSearchParams({ url: base.toString(), strategy: 'mobile', category: 'performance', locale: 'en' });
    if (process.env.PAGESPEED_API_KEY) params.set('key', process.env.PAGESPEED_API_KEY);
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: AbortSignal.timeout(45000), cache: 'no-store' });
    summary.pageSpeedStatus = response.status;
    if (response.ok) {
      const payload = await response.json() as Record<string, any>;
      const score = Math.round(Number(payload.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
      const audits = payload.lighthouseResult?.audits ?? {};
      const metrics = {
        performanceScore: score,
        firstContentfulPaint: audits['first-contentful-paint']?.numericValue ?? null,
        largestContentfulPaint: audits['largest-contentful-paint']?.numericValue ?? null,
        cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue ?? null,
        totalBlockingTime: audits['total-blocking-time']?.numericValue ?? null,
        speedIndex: audits['speed-index']?.numericValue ?? null,
      };
      summary.pageSpeed = metrics;
      if (score < 50) findings.push(finding('performance','high','Mobile performance is poor','Prioritize image delivery, JavaScript execution, server response and rendering improvements.',base.toString(),metrics));
      else if (score < 80) findings.push(finding('performance','medium','Mobile performance needs improvement','Review the PageSpeed opportunities before publishing additional heavy assets.',base.toString(),metrics));
      const field = payload.loadingExperience?.overall_category ?? payload.originLoadingExperience?.overall_category;
      summary.coreWebVitalsFieldCategory = field ?? null;
      if (field === 'SLOW') findings.push(finding('performance','high','Field Core Web Vitals are poor','Use real-user field data to prioritize the failing Core Web Vitals metrics.',base.toString(),{ fieldCategory: field }));
    } else {
      findings.push(finding('performance','low','PageSpeed data is temporarily unavailable','Retry the audit or configure a PageSpeed API key for reliable quota.',base.toString(),{ status: response.status }));
    }
  } catch (error) {
    findings.push(finding('performance','low','PageSpeed request failed',error instanceof Error ? error.message : 'The request timed out.',base.toString()));
  }

  return { summary, findings };
}
