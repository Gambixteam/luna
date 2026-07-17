import { NextResponse,type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest,assertEditor,requireSite } from '@/lib/supabase/request';

type RankChange={keyword:string|null;change:number;current:number;previous:number};

export async function POST(request:NextRequest){
 try{
  const context=await authenticateRequest(request);assertEditor(context.role);const body=z.object({siteId:z.string().uuid(),limit:z.number().int().min(1).max(200).default(100)}).parse(await request.json());const site=await requireSite(context,body.siteId);
  const snapshot=await context.supabase.from('analytics_snapshots').select('*').eq('site_id',site.id).eq('source','gsc').order('period_end',{ascending:false}).limit(1).maybeSingle();
  if(!snapshot.data) throw new Response('Sync Search Console before creating rank snapshots.',{status:409});
  const rows=((snapshot.data.dimensions as Record<string,any>)?.rows??[]) as Array<Record<string,any>>;
  if(!rows.length) throw new Response('The latest Search Console snapshot has no query rows.',{status:409});
  const profile=await context.supabase.from('business_profiles').select('primary_services,service_areas').eq('organization_id',context.organizationId).single();
  const services=(profile.data?.primary_services??[]) as string[];const locations=(profile.data?.service_areas??[]) as string[];
  const grouped=new Map<string,{query:string;page:string;clicks:number;impressions:number;weighted:number}>();
  for(const row of rows){const query=String(row.keys?.[0]??'').trim();const page=String(row.keys?.[1]??'').trim();if(!query)continue;const current=grouped.get(query)??{query,page,clicks:0,impressions:0,weighted:0};current.clicks+=Number(row.clicks??0);current.impressions+=Number(row.impressions??0);current.weighted+=Number(row.position??0)*Math.max(1,Number(row.impressions??0));if(!current.page)current.page=page;grouped.set(query,current)}
  const ranked=[...grouped.values()].sort((a,b)=>b.impressions-a.impressions).slice(0,body.limit);
  const targetRows=[] as Array<Record<string,any>>;
  for(const item of ranked){
   const lower=item.query.toLowerCase();const service=services.find((value)=>lower.includes(value.toLowerCase()))??null;const location=locations.find((value)=>lower.includes(value.toLowerCase()))??null;
   const existing=await context.supabase.from('keyword_targets').select('*').eq('site_id',site.id).ilike('keyword',item.query).limit(1).maybeSingle();
   let keyword=existing.data;
   if(!keyword){const inserted=await context.supabase.from('keyword_targets').insert({organization_id:context.organizationId,site_id:site.id,keyword:item.query,service,location,intent:location?'local':'existing visibility',target_url:item.page,priority:Math.max(30,Math.min(100,Math.round(Math.log10(item.impressions+1)*25))),source:'gsc'}).select('*').single();if(inserted.error)throw new Error(inserted.error.message);keyword=inserted.data}
   targetRows.push({organization_id:context.organizationId,site_id:site.id,keyword_id:keyword.id,location:keyword.location,organic_position:item.impressions?item.weighted/item.impressions:null,ranking_url:item.page,captured_on:snapshot.data.period_end,source:'gsc'});
  }
  await context.supabase.from('rank_snapshots').delete().eq('site_id',site.id).eq('source','gsc').eq('captured_on',snapshot.data.period_end);
  const saved=await context.supabase.from('rank_snapshots').insert(targetRows).select('*,keyword_targets(keyword)');if(saved.error)throw new Error(saved.error.message);
  const topGainers:RankChange[]=[];const topDecliners:RankChange[]=[];
  for(const current of saved.data??[]){const previous=await context.supabase.from('rank_snapshots').select('organic_position,captured_on').eq('keyword_id',current.keyword_id).lt('captured_on',current.captured_on).order('captured_on',{ascending:false}).limit(1).maybeSingle();if(previous.data?.organic_position&&current.organic_position){const change=Number(previous.data.organic_position)-Number(current.organic_position);const related=current.keyword_targets as {keyword?:string}|null;const entry:RankChange={keyword:related?.keyword??null,change,current:Number(current.organic_position),previous:Number(previous.data.organic_position)};if(change>0)topGainers.push(entry);if(change<0)topDecliners.push(entry)}}
  return NextResponse.json({capturedOn:snapshot.data.period_end,count:saved.data?.length??0,topGainers:topGainers.sort((a,b)=>b.change-a.change).slice(0,10),topDecliners:topDecliners.sort((a,b)=>a.change-b.change).slice(0,10)});
 }catch(error){if(error instanceof Response)return NextResponse.json({error:error.statusText||'Rank sync failed.'},{status:error.status});return NextResponse.json({error:error instanceof Error?error.message:'Rank sync failed.'},{status:400});}
}
