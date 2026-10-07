// Research clues are never evidence. No truth/projection module imports this file.
import {digest} from './model.mjs';
export const strategistCapacity=Object.freeze({vocabulary:64,clues:64,searchResults:64,queries:12,phraseCharacters:160,sourceScanCharacters:262144});
const plain=s=>String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function researchState(k) {
 const vocabulary=[],clues=[],seen=new Set();
 const add=(text,provenance,language=null)=>{text=plain(text).slice(0,strategistCapacity.phraseCharacters);if(text.length<3||seen.has(text)||vocabulary.length>=strategistCapacity.vocabulary)return;seen.add(text);vocabulary.push({text,language,provenance,truthAuthority:'NONE'});};
 for(const row of (k.researchResults??[]).slice(-strategistCapacity.searchResults))add(row.title,{kind:'SEARCH_CLUE',action:row.action,url:row.url},row.language);
 for(const o of k.observations.filter(o=>o.outcome==='OK'&&typeof o.body==='string').slice(-32)) {
  const body=o.body.slice(0,strategistCapacity.sourceScanCharacters),language=body.match(/<html\b[^>]*\blang=["']([^"']+)/i)?.[1]??null;
  let count=0;for(const m of body.matchAll(/<(title|h[1-3])\b[^>]*>([^]*?)<\/\1\s*>/gi)){if(++count>16)break;add(m[2],{kind:'PROVIDER_VOCABULARY',observation:o.id,bodySha256:o.sha256,start:m.index,end:m.index+m[0].length},language);}
  const structured=/(?:__NEXT_DATA__|__NUXT__|application\/(?:ld\+)?json)/.test(body),placeholder=/(?:\{\{[^}]+\}\}|\{(?:price|amount)\}|loading)/i.test(body);
  if(clues.length<strategistCapacity.clues)clues.push({observation:o.id,bodySha256:o.sha256,structured,clientShell:placeholder&&!(o.candidates??[]).some(c=>c.kind==='OFFER'),understandingUnavailable:!!o.interpretation&&/UNAVAILABLE|FAILED/.test(o.interpretation.kind??''),truthAuthority:'NONE'});
 }
 return {version:1,truthAuthority:'NONE',vocabulary,clues,searchResults:(k.researchResults??[]).slice(-strategistCapacity.searchResults),unprocessed:clues.filter(c=>c.understandingUnavailable),capacity:strategistCapacity};
}
export function adaptiveQueries(objective,market,needs,k) {
 if(!k)return [];
 const state=researchState(k),scope=[...new Set(objective.providerHosts)].map(h=>'site:'+h).join(' OR ');
 const payment=needs.some(n=>n.endsWith('MONTHLY_SUBSCRIPTION')),question=payment?'subscription payment options help':needs.some(n=>n.endsWith('PRICE_AMOUNT'))?'ordinary subscription price':'official service information';
 const consumed=new Set(k.attempts.filter(a=>a.action.kind==='DISCOVER').map(a=>a.action.query));
 // Wording and identities depend on source observations, not an indexed template.
 const useful=state.vocabulary.filter(v=>!objective.serviceName.toLowerCase().includes(v.text.toLowerCase())).sort((a,b)=>Number(!!b.language&&b.language!=='en')-Number(!!a.language&&a.language!=='en'));
 return useful.slice(0,strategistCapacity.queries).map(v=>{
  const query=[objective.serviceName,market,'"'+v.text.replaceAll('"','')+'"',question,'('+scope+')'].join(' ').slice(0,1000);
  return {kind:'DISCOVER',market,needs,family:'learned-'+digest([market,v.text,question]).slice(0,24),query,reason:'Source-derived terminology for unresolved '+(payment?'monthly payment':'objective')+'; research-only clue',value:3,strategist:{question,vocabulary:v.text,provenance:v.provenance,language:v.language,truthAuthority:'NONE'}};
 }).filter(a=>!consumed.has(a.query));
}
export function exhaustionDiagnosis(k) {
 const state=researchState(k);
 if(state.unprocessed.length)return {kind:'UNDERSTANDING_UNAVAILABLE',remainingMaterial:state.unprocessed.map(x=>x.observation)};
 if(state.clues.some(x=>x.clientShell))return {kind:'CHANNEL_CAPABILITY_EXHAUSTED',unsupported:['RENDERED_STATE'],scope:'PERMITTED_SOURCE_CHANNELS'};
 if(k.policyBlocks.length)return {kind:'POLICY_OR_AUTHORITY_BLOCKED',scope:'PERMITTED_REVIEWED_SOURCES'};
 if(k.attempts.some(a=>a.status==='FAILED'))return {kind:'TOOL_UNAVAILABLE',scope:'ATTEMPTED_PERMITTED_ACTIONS'};
 return {kind:k.attempts.some(a=>a.action.kind==='DISCOVER')?'SEARCH_STRATEGY_EXHAUSTED':'SCOPED_RESEARCH_EXHAUSTED',scope:'CURRENT_JUSTIFIED_PERMITTED_STRATEGIES',universalWebExhaustion:false};
}
