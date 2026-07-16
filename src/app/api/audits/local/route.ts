import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor, requireSite } from '@/lib/supabase/request';

type Finding = { category:string; severity:'critical'|'high'|'medium'|'low'|'info'; title:string; description:string; affected_urls:string[]; evidence:Record<string,unknown> };
const add = (items:Finding[], severity:Finding['severity'], title:string, description:string, affected:string[], evidence:Record<string,unknown>={}) => items.push({category:'local SEO',severity,title,description,affected_urls:affected,evidence});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({siteId:z.string().uuid()}).parse(await request.json());
    const site = await requireSite(context,body.siteId);
    const run = await context.supabase.from('audit_runs').insert({organization_id:context.organizationId,site_id:site.id,requested_by:context.user.id,audit_type:'local',status:'running',started_at:new Date().toISOString()}).select('*').single();
    if(run.error) throw new Error(run.error.message);

    const [profileResult,integrationsResult,citationsResult,reviewsResult,keywordsResult,pagesResult,competitorsResult] = await Promise.all([
      context.supabase.from('business_profiles').select('*').eq('organization_id',context.organizationId).single(),
      context.supabase.from('integrations').select('*').eq('site_id',site.id),
      context.supabase.from('citations').select('*').eq('site_id',site.id),
      context.supabase.from('reputation_reviews').select('*').eq('site_id',site.id),
      context.supabase.from('keyword_targets').select('*').eq('site_id',site.id),
      context.supabase.from('audit_pages').select('*').in('audit_run_id',(await context.supabase.from('audit_runs').select('id').eq('site_id',site.id).eq('status','completed').order('created_at',{ascending:false}).limit(5)).data?.map((item)=>item.id) ?? []),
      context.supabase.from('competitors').select('*').eq('site_id',site.id),
    ]);
    const profile = profileResult.data ?? {};
    const integrations = integrationsResult.data ?? [];
    const citations = citationsResult.data ?? [];
    const reviews = reviewsResult.data ?? [];
    const keywords = keywordsResult.data ?? [];
    const pages = pagesResult.data ?? [];
    const competitors = competitorsResult.data ?? [];
    const findings:Finding[]=[];
    const profileUrl=[site.domain];

    const gbp = integrations.find((item)=>item.provider==='google_business_profile');
    const metadata = (gbp?.metadata ?? {}) as Record<string,any>;
    const locations = (metadata.locations ?? []) as Array<Record<string,any>>;
    const selected = locations.find((item)=>item.name===metadata.selectedLocation) ?? (locations.length===1?locations[0]:null);
    if(!gbp || gbp.status!=='connected') add(findings,'critical','Google Business Profile is not connected','Connect the correct Google account so Luna can verify categories, services, reviews, hours and profile performance.',profileUrl);
    else if(!selected) add(findings,'high','GBP location selection is incomplete','Choose the correct business location before profile recommendations or publishing.',profileUrl,{locationsFound:locations.length});
    if(selected){
      const categories=selected.categories ?? {};
      if(!categories.primaryCategory) add(findings,'high','Primary GBP category is missing','Choose the category that most accurately represents the primary revenue-generating service.',profileUrl);
      if(!(categories.additionalCategories?.length)) add(findings,'low','Secondary GBP categories need review','Add only accurate secondary categories that represent meaningful services.',profileUrl,{primaryCategory:categories.primaryCategory});
      if(!selected.profile?.description) add(findings,'medium','GBP business description is incomplete','Add a clear factual description of services, customers and service area without unsupported claims.',profileUrl);
      if(!selected.websiteUri) add(findings,'high','GBP website link is missing','Link the profile to the most relevant, trackable website destination.',profileUrl);
      if(!selected.phoneNumbers?.primaryPhone) add(findings,'high','GBP primary phone number is missing','Add the primary tracked business phone number.',profileUrl);
      if(!selected.regularHours?.periods?.length) add(findings,'medium','GBP regular hours are incomplete','Publish accurate regular and holiday hours.',profileUrl);
      if(!selected.serviceArea && !selected.storefrontAddress) add(findings,'high','GBP location or service area is incomplete','Configure an accurate storefront address or service-area definition.',profileUrl);
      const siteHost=new URL(site.domain).hostname.replace(/^www\./,'');
      if(selected.websiteUri && !String(selected.websiteUri).includes(siteHost)) add(findings,'medium','GBP website does not align with the Luna site','Confirm the profile points to the intended website and campaign URL.',profileUrl,{gbpWebsite:selected.websiteUri,site:site.domain});
      const phone=String(profile.phone ?? '').replace(/\D/g,'');
      const gbpPhone=String(selected.phoneNumbers?.primaryPhone ?? '').replace(/\D/g,'');
      if(phone && gbpPhone && phone.slice(-10)!==gbpPhone.slice(-10)) add(findings,'high','Business phone differs between Luna and GBP','Resolve the phone inconsistency before citation cleanup and call tracking.',profileUrl,{businessPhone:profile.phone,gbpPhone:selected.phoneNumbers?.primaryPhone});
    }

    const missingCitations=citations.filter((item)=>['missing','incorrect','duplicate'].includes(item.status));
    if(!citations.length) add(findings,'medium','Citation audit has not started','Create a priority directory list and verify name, address, phone and website consistency.',profileUrl);
    if(missingCitations.length) add(findings,'medium','Citation inconsistencies require cleanup','Correct missing, inaccurate or duplicate listings, starting with high-authority local directories.',profileUrl,{count:missingCitations.length,directories:missingCitations.slice(0,20).map((item)=>item.directory_name)});
    const inconsistent=citations.filter((item)=>item.nap_consistent===false);
    if(inconsistent.length) add(findings,'high','NAP inconsistencies were recorded','Standardize the approved business name, address/service area, phone and website across listings.',profileUrl,{count:inconsistent.length});

    const ratingValues:Record<string,number>={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
    const ratingNumbers=reviews.map((item)=>ratingValues[String(item.star_rating)]).filter(Boolean);
    const average=ratingNumbers.length?ratingNumbers.reduce((a,b)=>a+b,0)/ratingNumbers.length:null;
    const replied=reviews.filter((item)=>item.review_reply).length;
    if(!reviews.length) add(findings,'medium','Google review data is unavailable','Connect and sync the profile, then establish a compliant review-request process.',profileUrl);
    else {
      if(average!==null && average<4) add(findings,'high','Review rating needs attention','Analyze recurring issues and improve the customer experience before increasing review-request volume.',profileUrl,{averageRating:average,reviewCount:reviews.length});
      if(replied/reviews.length<0.6) add(findings,'medium','Review response coverage is low','Respond professionally to recent positive and negative reviews using the approval workflow.',profileUrl,{replyRate:replied/reviews.length});
      const recent=reviews.filter((item)=>item.create_time && new Date(item.create_time).getTime()>Date.now()-90*86400000).length;
      if(recent<3) add(findings,'medium','Recent review velocity is weak','Implement a policy-compliant review request process after completed customer experiences.',profileUrl,{reviewsLast90Days:recent});
    }

    const locations=(profile.service_areas ?? []) as string[];
    const pageText=pages.map((item)=>`${item.url} ${item.title ?? ''} ${item.h1 ?? ''}`.toLowerCase());
    const uncovered=locations.filter((location)=>!pageText.some((text)=>text.includes(location.toLowerCase())));
    if(locations.length && uncovered.length) add(findings,'medium','Target locations lack clear landing-page coverage','Create useful, differentiated location content only where the business can genuinely serve customers.',profileUrl,{uncoveredLocations:uncovered});
    const localKeywords=keywords.filter((item)=>item.location || item.intent==='local');
    if(!localKeywords.length) add(findings,'medium','Local keyword map is incomplete','Map priority services to cities, neighborhoods and urgent-intent queries.',profileUrl);
    if(!competitors.length) add(findings,'low','Local competitor set is not defined','Add search-result and map competitors so Luna can compare categories, offers, reviews and coverage.',profileUrl);

    const weight={critical:18,high:10,medium:5,low:2,info:0} as const;
    const summary={score:Math.max(0,100-findings.reduce((total,item)=>total+weight[item.severity],0)),gbpConnected:gbp?.status==='connected',gbpLocations:locations.length,citations:citations.length,citationIssues:missingCitations.length,reviews:reviews.length,averageRating:average,reviewReplyRate:reviews.length?replied/reviews.length:null,localKeywords:localKeywords.length,uncoveredLocations:uncovered,competitors:competitors.length};
    if(findings.length) await context.supabase.from('audit_findings').insert(findings.map((item)=>({...item,organization_id:context.organizationId,site_id:site.id,audit_run_id:run.data.id})));
    await context.supabase.from('audit_runs').update({status:'completed',summary,completed_at:new Date().toISOString()}).eq('id',run.data.id);
    if(findings.length) await context.supabase.from('recommendations').insert(findings.map((item,index)=>({organization_id:context.organizationId,site_id:site.id,source_type:'local_audit',source_id:run.data.id,category:'local SEO',problem:item.title,recommended_action:item.description,expected_business_value:'Improve local relevance, trust, map visibility or lead conversion.',priority:Math.max(45,100-index*3),effort:item.severity==='critical'?'high':'medium',responsible_party:'Gambix',approval_required:true,status:'pending_review'})));
    return NextResponse.json({runId:run.data.id,summary,findings});
  } catch(error){
    if(error instanceof Response) return NextResponse.json({error:error.statusText||'Local SEO audit failed.'},{status:error.status});
    return NextResponse.json({error:error instanceof Error?error.message:'Local SEO audit failed.'},{status:400});
  }
}
