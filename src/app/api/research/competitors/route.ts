import { NextResponse,type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest,assertEditor,requireSite } from '@/lib/supabase/request';
import { auditWebsite } from '@/lib/website-audit';
import { generateLunaJson } from '@/lib/luna-ai';

const inputSchema=z.object({siteId:z.string().uuid(),competitors:z.array(z.object({name:z.string().min(2).max(160),domain:z.string().min(3).max(500)})).min(1).max(5)});

export const runtime='nodejs';
export const maxDuration=60;

export async function POST(request:NextRequest){
 try{
  const context=await authenticateRequest(request);assertEditor(context.role);const body=inputSchema.parse(await request.json());const site=await requireSite(context,body.siteId);
  const profile=await context.supabase.from('business_profiles').select('*').eq('organization_id',context.organizationId).single();
  const ownAudit=await auditWebsite(site.domain,3);
  const own={domain:site.domain,pages:ownAudit.pages.map((page)=>({url:page.url,title:page.title,h1:page.h1,wordCount:page.word_count,internalLinks:page.internal_links,hasForm:page.raw_metrics.hasForm,hasReviews:page.raw_metrics.hasReviews,hasPhone:page.raw_metrics.hasPhoneLink}))};
  const snapshots=[] as Array<Record<string,unknown>>;
  for(const competitor of body.competitors){
   try{
    const audit=await auditWebsite(competitor.domain,5);
    snapshots.push({name:competitor.name,domain:competitor.domain,status:'completed',pages:audit.pages.map((page)=>({url:page.url,title:page.title,h1:page.h1,wordCount:page.word_count,internalLinks:page.internal_links,hasForm:page.raw_metrics.hasForm,hasReviews:page.raw_metrics.hasReviews,hasPhone:page.raw_metrics.hasPhoneLink,hasFaq:page.raw_metrics.hasFaq})),findings:audit.findings.slice(0,15),summary:audit.summary});
   }catch(error){snapshots.push({name:competitor.name,domain:competitor.domain,status:'failed',error:error instanceof Error?error.message:'Research failed'});}
  }
  const fallback={competitiveSummary:'Luna compared public on-page, content, trust and conversion signals. Human review is required before acting on inferred competitor strengths.',competitors:snapshots.map((item)=>({name:item.name,domain:item.domain,strengths:['Review the strongest service and conversion patterns manually'],weaknesses:['Look for missing depth, local relevance, trust and clear calls to action']})),contentGaps:[],offerGaps:[],ctaGaps:[],trustGaps:[],recommendedActions:['Strengthen primary service-page clarity','Improve local proof and conversion paths','Publish differentiated content that answers customer decisions']};
  const analysis=await generateLunaJson({supabase:context.supabase,user:context.user,organizationId:context.organizationId!,siteId:site.id,feature:'competitor_snapshot',idempotencyKey:`competitors-${site.id}-${Date.now()}`,system:'Compare public competitor website evidence for a local service business. Identify strengths, weaknesses, content gaps, offer differences, CTAs and trust signals. Do not infer private revenue, traffic or results.',prompt:JSON.stringify({business:profile.data,own,snapshots,requiredShape:fallback}),fallback,maxTokens:2800});
  const analysisRows=Array.isArray(analysis.competitors)?analysis.competitors:[];
  for(const snapshot of snapshots){
   const interpreted=(analysisRows as Array<Record<string,unknown>>).find((item)=>String(item.domain)===String(snapshot.domain)||String(item.name)===String(snapshot.name));
   const existing=await context.supabase.from('competitors').select('id').eq('site_id',site.id).eq('domain',String(snapshot.domain)).maybeSingle();
   const payload={organization_id:context.organizationId,site_id:site.id,name:String(snapshot.name),domain:String(snapshot.domain),source:'luna_research',strengths:Array.isArray(interpreted?.strengths)?interpreted.strengths:[],weaknesses:Array.isArray(interpreted?.weaknesses)?interpreted.weaknesses:[],snapshot:{...snapshot,analysis:interpreted??null,portfolioAnalysis:analysis},updated_at:new Date().toISOString()};
   if(existing.data?.id) await context.supabase.from('competitors').update(payload).eq('id',existing.data.id); else await context.supabase.from('competitors').insert(payload);
  }
  const actions=Array.isArray(analysis.recommendedActions)?analysis.recommendedActions:[];
  if(actions.length) await context.supabase.from('recommendations').insert(actions.slice(0,15).map((action,index)=>({organization_id:context.organizationId,site_id:site.id,source_type:'competitor_snapshot',category:'competitive',problem:'Competitive visibility gap',recommended_action:String(action),expected_business_value:'Improve differentiation, relevance, trust or conversion performance.',priority:Math.max(50,90-index*3),effort:'medium',responsible_party:'Gambix',approval_required:true,status:'pending_review'})));
  return NextResponse.json({snapshots,analysis});
 }catch(error){if(error instanceof Response)return NextResponse.json({error:error.statusText||'Competitor research failed.'},{status:error.status});return NextResponse.json({error:error instanceof Error?error.message:'Competitor research failed.'},{status:400});}
}
