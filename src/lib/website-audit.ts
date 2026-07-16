export type AuditedPage = {
  url: string;
  status_code: number;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  word_count: number;
  canonical: string | null;
  indexable: boolean;
  internal_links: number;
  external_links: number;
  images: number;
  images_missing_alt: number;
  structured_data: unknown[];
  raw_metrics: Record<string, unknown>;
};

export type AuditFinding = {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  affected_urls: string[];
  evidence: Record<string, unknown>;
};

const USER_AGENT = 'LunaSEOAudit/1.0 (+https://gambix.io)';
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?)/i;

function normalizeUrl(value: string) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || PRIVATE_HOST.test(url.hostname)) {
    throw new Error('Only public HTTP or HTTPS websites can be audited.');
  }
  url.hash = '';
  return url;
}

function textContent(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function firstMatch(html: string, pattern: RegExp) {
  const value = pattern.exec(html)?.[1];
  return value ? textContent(value).slice(0, 500) : null;
}

function attribute(tag: string, name: string) {
  const quoted = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  if (quoted !== undefined) return quoted;
  return new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag)?.[1] ?? null;
}

async function fetchPage(url: URL): Promise<{ response: Response; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: controller.signal, cache: 'no-store' });
    const contentType = response.headers.get('content-type') ?? '';
    const html = contentType.includes('text/html') ? await response.text() : '';
    return { response, html: html.slice(0, 2_000_000) };
  } finally { clearTimeout(timeout); }
}

function parsePage(requestedUrl: URL, response: Response, html: string): AuditedPage {
  const effectiveUrl = new URL(response.url || requestedUrl.toString());
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)].map((match) => { try { return new URL(match[1], effectiveUrl); } catch { return null; } }).filter((value): value is URL => Boolean(value));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const structuredData = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => { try { return JSON.parse(match[1]); } catch { return { invalid: true }; } });
  const robots = html.match(/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*>/i)?.[0] ?? '';
  const canonicalTag = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0] ?? '';
  const words = textContent(html).split(/\s+/).filter(Boolean);
  return {
    url: effectiveUrl.toString(), status_code: response.status,
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    meta_description: attribute(html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i)?.[0] ?? '', 'content'),
    h1: firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i), word_count: words.length,
    canonical: attribute(canonicalTag, 'href'), indexable: !/noindex/i.test(attribute(robots, 'content') ?? ''),
    internal_links: links.filter((link) => link.hostname === effectiveUrl.hostname).length,
    external_links: links.filter((link) => link.hostname !== effectiveUrl.hostname).length,
    images: images.length, images_missing_alt: images.filter((tag) => !attribute(tag, 'alt')?.trim()).length,
    structured_data: structuredData,
    raw_metrics: { responseTimeHint: response.headers.get('server-timing'), contentLength: Number(response.headers.get('content-length') ?? html.length), hasViewport: /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html), hasPhoneLink: /href\s*=\s*["']tel:/i.test(html), hasForm: /<form\b/i.test(html), hasMap: /google\.com\/maps|maps\.google|openstreetmap/i.test(html), hasFaq: /frequently asked|faq/i.test(textContent(html)), hasReviews: /testimonial|review/i.test(textContent(html)) },
  };
}

function pageFindings(page: AuditedPage): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const add = (category: string, severity: AuditFinding['severity'], title: string, description: string, evidence: Record<string, unknown> = {}) => findings.push({ category, severity, title, description, affected_urls: [page.url], evidence });
  if (page.status_code >= 400) add('technical', 'critical', `Page returns ${page.status_code}`, 'The page cannot reliably serve visitors or search engines.', { status: page.status_code });
  if (!page.title) add('on-page', 'high', 'Missing page title', 'Add a unique title that describes the service and location.');
  else if (page.title.length < 25 || page.title.length > 65) add('on-page', 'medium', 'Page title length needs review', 'Keep the title concise while preserving service and local relevance.', { length: page.title.length });
  if (!page.meta_description) add('on-page', 'medium', 'Missing meta description', 'Write a clear benefit-led description to improve search-result click-through rate.');
  if (!page.h1) add('content', 'high', 'Missing H1', 'Add one clear primary heading aligned with the page intent.');
  if (page.word_count < 250) add('content', 'medium', 'Thin page content', 'Expand the page with useful service, process, trust, location and FAQ information.', { wordCount: page.word_count });
  if (!page.indexable) add('technical', 'high', 'Page is marked noindex', 'Confirm this page should be excluded from search before leaving the directive in place.');
  if (!page.canonical) add('technical', 'low', 'Canonical tag missing', 'Add a self-referencing canonical where appropriate.');
  if (page.images_missing_alt > 0) add('accessibility', 'medium', 'Images are missing alternative text', 'Add concise descriptive alt text to meaningful images.', { count: page.images_missing_alt });
  if (!page.structured_data.length) add('schema', 'low', 'No structured data detected', 'Review LocalBusiness, Service, FAQ and Breadcrumb schema opportunities.');
  if (!(page.raw_metrics.hasViewport as boolean)) add('technical', 'high', 'Mobile viewport tag missing', 'Add a viewport tag so the page renders correctly on mobile devices.');
  if (!(page.raw_metrics.hasPhoneLink as boolean)) add('conversion', 'medium', 'No mobile tap-to-call link detected', 'Make the primary phone number clickable on mobile.');
  if (!(page.raw_metrics.hasForm as boolean)) add('conversion', 'low', 'No lead form detected', 'Confirm visitors have a low-friction way to request service.');
  if (!(page.raw_metrics.hasReviews as boolean)) add('trust', 'low', 'Review or testimonial signals are weak', 'Add verified customer proof near key conversion points.');
  return findings;
}

export async function auditWebsite(input: string, maxPages = 12) {
  const start = normalizeUrl(input); const queue: URL[] = [start]; const seen = new Set<string>(); const pages: AuditedPage[] = []; const findings: AuditFinding[] = [];
  while (queue.length && pages.length < Math.max(1, Math.min(maxPages, 25))) {
    const next = queue.shift()!; const key = `${next.origin}${next.pathname.replace(/\/$/, '') || '/'}`; if (seen.has(key)) continue; seen.add(key);
    try {
      const { response, html } = await fetchPage(next); const page = parsePage(next, response, html); pages.push(page); findings.push(...pageFindings(page));
      if (html) for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) { try { const link = new URL(match[1], page.url); link.hash = ''; if (link.hostname === start.hostname && /^https?:$/.test(link.protocol) && !/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip)$/i.test(link.pathname)) queue.push(link); } catch {} }
    } catch (error) { findings.push({ category: 'technical', severity: 'critical', title: 'Page could not be fetched', description: error instanceof Error ? error.message : 'The page request failed.', affected_urls: [next.toString()], evidence: {} }); }
  }
  return { pages, findings, summary: { pagesCrawled: pages.length, critical: findings.filter((item) => item.severity === 'critical').length, high: findings.filter((item) => item.severity === 'high').length, medium: findings.filter((item) => item.severity === 'medium').length, low: findings.filter((item) => item.severity === 'low').length, score: Math.max(0, 100 - findings.reduce((score, item) => score + ({ critical: 18, high: 10, medium: 5, low: 2, info: 0 }[item.severity]), 0)) } };
}
