// RFC 9309-style tolerant records, conservative handling of broken policy rules.
// Reuses only the existing bounded path matcher; no transport or V2 state.
import {evaluateRobots as matchPolicy} from '../research-v1/robots-access.mjs';
import {researchProductToken} from '../research-v1/public-network.mjs';
import {fault,acquisitionCapacity} from './acquisition-contract.mjs';
export function parseAcquisitionRobots(body) {
 if(typeof body!=='string')throw fault('ROBOTS_PARSE_FAILED');
 if(Buffer.byteLength(body)>acquisitionCapacity.robotsBytes)throw fault('ROBOTS_BYTE_BOUND','CAPACITY');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|<\/?(?:html|head|body|!doctype)\b/i.test(body))throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'NON_POLICY_BODY'});
 const groups=[],diagnostics=[];let group=null,hasRules=false;
 const note=(line,reason)=>{if(diagnostics.length<16)diagnostics.push({line,reason});};
 for(const [i,raw] of body.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/).entries()) {
  const line=raw.split('#')[0].trim();if(!line)continue;
  if(line.length>16384)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'LINE_CAPACITY',line:i+1});
  const m=line.match(/^([a-z-]+)\s*:\s*(.*?)\s*$/i);
  if(!m){
   if(/^(?:allow|disallow|crawl-delay|request-rate)\b/i.test(line)){
    if(!group)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'MALFORMED_POLICY_DIRECTIVE',line:i+1});
    group.invalid??={reason:'MALFORMED_POLICY_DIRECTIVE',line:i+1};hasRules=true;note(i+1,'MALFORMED_RULE');
   }else if(/^user-agent\b/i.test(line)){
    if(!group||hasRules){group={agents:[],rules:[],unusableAgent:true};groups.push(group);hasRules=false;}
    note(i+1,'IGNORED_INVALID_AGENT_RECORD');
   }else note(i+1,'IGNORED_NON_POLICY_LINE');
   continue;
  }
  const key=m[1].toLowerCase(),value=m[2];
  if(key==='user-agent') {
   if(!value||value.length>256||/\s/.test(value)){
    // An invalid new group must not leak its Allow rules into the preceding
    // wildcard group. Consecutive invalid agent records do not erase valid ones.
    if(!group||hasRules){group={agents:[],rules:[],unusableAgent:true};groups.push(group);hasRules=false;}
    note(i+1,'IGNORED_INVALID_AGENT_RECORD');continue;
   }
   if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}
   group.agents.push(value.toLowerCase());
  }else if(key==='allow'||key==='disallow') {
   if(!group)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'RULE_WITHOUT_GROUP',line:i+1});
   hasRules=true;
   if(value&&!value.startsWith('/')&&!value.startsWith('*')||/\s|%(?![\da-f]{2})/i.test(value)){group.invalid??={reason:'INVALID_PATH',line:i+1};note(i+1,'MALFORMED_RULE');continue;}
   if(value)group.rules.push({directive:key,path:value,line:i+1});
  }else if(key==='crawl-delay'||key==='request-rate') {
   if(!group)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'PACING_WITHOUT_GROUP',line:i+1});
   group.pacing=true;hasRules=true;
  }else note(i+1,'IGNORED_EXTENSION');
 }
 const sitemaps=[];
 for(const m of body.matchAll(/^[ \t]*sitemap[ \t]*:[ \t]*([^\r\n#]+)/gim)) {
  if(sitemaps.length===16)break;
  sitemaps.push({url:m[1].trim(),start:m.index,end:m.index+m[0].length});
 }
 const parsed={groups,diagnostics,sitemaps};
 // Irrelevant groups cannot deny or invalidate this crawler's policy. Malformed
 // applicable restrictions remain unusable, never interpreted as permission.
 if(groups.length&&groups.every(g=>!g.agents.length)&&groups.some(g=>g.rules.length||g.invalid))throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'UNUSABLE_AGENT_GROUP'});
 const selected=applicableGroups(parsed,researchProductToken);
 const invalid=selected.find(g=>g.invalid)?.invalid;
 if(invalid)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',invalid);
 return parsed;
}
function applicableGroups(parsed,productToken) {
 const token=productToken.toLowerCase();
 const specific=parsed.groups.flatMap(g=>g.agents.filter(a=>a!=='*'&&token.includes(a)).map(a=>({g,length:a.length})));
 const longest=Math.max(0,...specific.map(x=>x.length));
 const selected=longest?[...new Set(specific.filter(x=>x.length===longest).map(x=>x.g))]:parsed.groups.filter(g=>g.agents.includes('*'));
 return selected;
}
export function evaluateAcquisitionRobots(parsed,target,productToken=researchProductToken) {
 const selected=applicableGroups(parsed,productToken);
 if(selected.some(g=>g.invalid))return {decision:'REVIEW_REQUIRED',reason:'MALFORMED_APPLICABLE_POLICY',groups:selected.map(g=>g.agents),rule:null};
 return matchPolicy({groups:selected.map(g=>({...g,agents:[productToken.toLowerCase()]}))},target,productToken);
}
