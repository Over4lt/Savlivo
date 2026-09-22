// V2-only compatibility. Pure policy parsing; no I/O or acquisition at import.
import assert from 'node:assert/strict';
import {evaluateRobots as evaluateLegacy, createRobotsPublicAdapter} from '../../research-v1/robots-access.mjs';
import {researchProductToken} from '../../research-v1/public-network.mjs';
export function parseV2Robots(body) {
  assert.equal(typeof body,'string');
  const invalid=reason=>({invalid:reason,groups:[]});
  if(Buffer.byteLength(body)>512000)return invalid('OVERSIZED_POLICY');
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|<\/?(?:html|head|body|!doctype)\b/i.test(body))return invalid('INVALID_BODY');
  const lines=body.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/);
  if(lines.length>10000||lines.some(l=>l.length>2048))return invalid('POLICY_COMPLEXITY');
  const groups=[],globalIssues=[],prohibitions=[];let group=null,hasRules=false;
  const issue=(reason,line)=>{(group?group.issues:globalIssues).push({reason,line});hasRules=true;};
  for(let i=0;i<lines.length;i++) {
    // Explicit retained restrictions must not disappear when a syntax error is repaired.
    // This is a conservative review trigger, never a permission/exception interpreter.
    if(/^\s*#/.test(lines[i])&&/\b(?:web scraping|automated access|automated scraping)\b.{0,1200}\b(?:prohibited|forbidden)\b/i.test(lines[i]))prohibitions.push({line:i+1,text:lines[i].trim()});
    const line=lines[i].split('#')[0].trim();if(!line)continue;
    const m=line.match(/^([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if(!m){if(/^user[\s_-]*agent\b/i.test(line))globalIssues.push({reason:'AMBIGUOUS_GROUP_BOUNDARY',line:i+1});else issue('MALFORMED_LINE',i+1);continue;}
    const key=m[1].toLowerCase(),value=m[2];
    if(key==='user-agent') {
      if(!group||hasRules){group={agents:[],rules:[],issues:[],agentIssues:[]};groups.push(group);hasRules=false;}
      group.agents.push(value.toLowerCase());
      if(!/^(?:[a-z_-]+|\*)$/i.test(value))group.agentIssues.push({reason:'NONSTANDARD_AGENT',line:i+1,value:value.toLowerCase()});
      // Empty/ambiguous selectors cannot be proven non-applicable.
      if(value!=='*'&&(!value||!/[a-z]/i.test(value)||value.includes('*')&&!/^[a-z0-9_-]+\*$/i.test(value)))globalIssues.push({reason:'AMBIGUOUS_AGENT_SELECTOR',line:i+1});
    } else if(key==='allow'||key==='disallow') {
      if(!group){globalIssues.push({reason:'RULE_WITHOUT_GROUP',line:i+1});continue;}
      hasRules=true;
      if(value&&(!/^[/*]/.test(value)||/\s|%(?![\da-f]{2})/i.test(value)||/\$(?!$)/.test(value))){issue('INVALID_PATH',i+1);continue;}
      if(value)group.rules.push({directive:key,path:value,line:i+1});
    } else if(key==='crawl-delay'||key==='request-rate') {
      if(!group)globalIssues.push({reason:'PACING_WITHOUT_GROUP',line:i+1});else {group.pacing=true;hasRules=true;}
    }
  }
  return {groups,globalIssues,prohibitions};
}
export function evaluateV2Robots(parsed,target,productToken=researchProductToken) {
  const blocked=(reason,boundary,groups=[],issues=[])=>({decision:'ROBOTS_INVALID',reason,groups,rule:null,boundary,issues});
  if(parsed.invalid)return blocked(parsed.invalid,'APPLICABLE_PARSE_AMBIGUITY');
  if(parsed.prohibitions?.length)return {decision:'REVIEW_REQUIRED',reason:'EXPLICIT_PROVIDER_PROHIBITION',groups:[],rule:null,boundary:'PROVIDER_RESTRICTION',restrictions:parsed.prohibitions};
  if(parsed.globalIssues?.length)return blocked('AMBIGUOUS_POLICY_STRUCTURE','APPLICABLE_PARSE_AMBIGUITY',[],parsed.globalIssues);
  const token=productToken.toLowerCase();
  // Nonstandard selectors containing our token might apply: never silently discard them.
  const ambiguous=parsed.groups.flatMap(g=>g.agentIssues).filter(a=>a.value.includes(token)||token.startsWith(a.value.match(/^[a-z_-]+/i)?.[0]??'') );
  if(ambiguous.length)return blocked('AMBIGUOUS_APPLICABLE_AGENT','APPLICABLE_PARSE_AMBIGUITY',[],ambiguous);
  const specific=parsed.groups.filter(g=>g.agents.includes(token));
  const selected=specific.length?specific:parsed.groups.filter(g=>g.agents.includes('*'));
  const issues=selected.flatMap(g=>g.issues);
  if(issues.length)return blocked('APPLICABLE_PARSE_AMBIGUITY','APPLICABLE_PARSE_AMBIGUITY',selected.map(g=>g.agents),issues);
  const ignored=parsed.groups.filter(g=>!selected.includes(g)).flatMap(g=>[...g.issues,...g.agentIssues].map(i=>({...i,agents:g.agents})));
  const result=evaluateLegacy({groups:selected},target,productToken);
  return {...result,boundary:result.decision==='DISALLOWED'?'APPLICABLE_DISALLOW':result.decision==='ALLOWED'?'SAFE_TO_EVALUATE':'APPLICABLE_PARSE_AMBIGUITY',nonApplicableParseProblems:ignored,nonApplicableProblemClassification:ignored.length?'NON_APPLICABLE_PARSE_PROBLEM':null};
}
export const v2RobotsPolicy=Object.freeze({parse:parseV2Robots,evaluate:evaluateV2Robots});
export const createV2RobotsPublicAdapter=options=>createRobotsPublicAdapter({...options,policyImplementation:v2RobotsPolicy});
