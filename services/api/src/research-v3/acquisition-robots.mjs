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
  if(!m){if(/^(?:user-agent|allow|disallow|crawl-delay|request-rate)\b/i.test(line))throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'MALFORMED_POLICY_DIRECTIVE',line:i+1});note(i+1,'IGNORED_NON_POLICY_LINE');continue;}
  const key=m[1].toLowerCase(),value=m[2];
  if(key==='user-agent') {
   if(!value||value.length>256||/\s/.test(value))throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'INVALID_AGENT',line:i+1});
   if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}
   group.agents.push(value.toLowerCase());
  }else if(key==='allow'||key==='disallow') {
   if(!group)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'RULE_WITHOUT_GROUP',line:i+1});
   hasRules=true;
   if(value&&!value.startsWith('/')||/\s|%(?![\da-f]{2})/i.test(value))throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'INVALID_PATH',line:i+1});
   if(value)group.rules.push({directive:key,path:value,line:i+1});
  }else if(key==='crawl-delay'||key==='request-rate') {
   if(!group)throw fault('ROBOTS_PARSE_FAILED','ACQUISITION',{reason:'PACING_WITHOUT_GROUP',line:i+1});
   group.pacing=true;hasRules=true;
  }else note(i+1,'IGNORED_EXTENSION');
 }
 return {groups,diagnostics};
}
export function evaluateAcquisitionRobots(parsed,target,productToken=researchProductToken) {
 const token=productToken.toLowerCase();
 const specific=parsed.groups.flatMap(g=>g.agents.filter(a=>a!=='*'&&token.includes(a)).map(a=>({g,length:a.length})));
 const longest=Math.max(0,...specific.map(x=>x.length));
 const selected=longest?[...new Set(specific.filter(x=>x.length===longest).map(x=>x.g))]:parsed.groups.filter(g=>g.agents.includes('*'));
 return matchPolicy({groups:selected.map(g=>({...g,agents:[token]}))},target,productToken);
}
