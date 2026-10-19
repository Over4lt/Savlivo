import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadApplicableResearchLinks,loadServiceResearchLinkHints,validateResearchLink} from './research-links.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function researchLinkSnapshot({directory,serviceId,canonicalSlug,market,client}){
 const file=path.join(directory,'research-links-snapshot.json');
 if(fs.existsSync(file)){
  if(fs.statSync(file).size>128*1024)throw Error('RESEARCH_LINK_SNAPSHOT_INVALID');
  let saved;try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('RESEARCH_LINK_SNAPSHOT_INVALID');}
  const {sha256,...payload}=saved??{};
  if(saved?.version!==1||saved.serviceId!==serviceId||saved.market!==market||sha256!==digest(payload)||!Number.isSafeInteger(saved.persistedVerifiedCount)||saved.persistedVerifiedCount<0||!Array.isArray(saved.links)||saved.links.length>20||saved.patternLinks!==undefined&&(!Array.isArray(saved.patternLinks)||saved.patternLinks.length>20))throw Error('RESEARCH_LINK_SNAPSHOT_INVALID');
  for(const link of [...saved.links,...(saved.patternLinks??[])]){try{const fields={url:link.url,kind:link.kind,marketScope:link.marketScope,marketCode:link.marketCode,enabled:link.enabled};if(!uuid.test(link.id??'')||link.serviceId!==serviceId||link.truthAuthority!=='NONE'||JSON.stringify(validateResearchLink(fields))!==JSON.stringify(fields))throw Error();}catch{throw Error('RESEARCH_LINK_SNAPSHOT_INVALID');}}
  if((saved.patternLinks??[]).some(link=>link.marketScope!=='MARKET_SPECIFIC'||link.lastResult!=='VERIFIED'||link.serviceId!==serviceId))throw Error('RESEARCH_LINK_SNAPSHOT_INVALID');
  return {persistedVerifiedCount:saved.persistedVerifiedCount,links:saved.links,patternLinks:saved.patternLinks??[]};
 }
 const state=await loadApplicableResearchLinks({serviceId,canonicalSlug,market,client}),patternLinks=serviceId==='max'?await loadServiceResearchLinkHints({serviceId,client}):[],payload={version:1,serviceId,market,persistedVerifiedCount:state.persistedVerifiedCount,links:state.links,...(serviceId==='max'?{patternLinks}:{})};
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const pending=file+'.pending';fs.writeFileSync(pending,JSON.stringify({...payload,sha256:digest(payload)})+'\n',{mode:0o600});fs.renameSync(pending,file);
 return {...state,patternLinks};
}
