// Shared deterministic sufficiency/persistence. Callers own semantic validation;
// this layer cannot turn an invalid proposition or weak hint into evidence.
import {createHash} from 'node:crypto';
export const evidencePolicyVersion='CORROBORATED_PROPOSITION_PERSISTENCE_V1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function independentGroups(observations){
 const groups=[];
 for(const observation of observations){
  const roots=new Set(observation.dependencies),overlap=groups.filter(g=>g.roots.some(r=>roots.has(r)));
  for(const group of overlap){for(const r of group.roots)roots.add(r);groups.splice(groups.indexOf(group),1);}
  groups.push({roots:[...roots].sort(),observations:[...overlap.flatMap(g=>g.observations),observation.id]});
 }
 return groups;
}
function proof(observations,threshold){
 const direct=observations.filter(o=>o.strength==='DIRECT'),strong=observations.filter(o=>['DIRECT','STRONG'].includes(o.strength)),groups=independentGroups(strong);
 return {established:direct.length>0||groups.length>=threshold,rule:direct.length?'DIRECT_TYPED_PROOF':groups.length>=threshold?'INDEPENDENT_STRONG_CORROBORATION':null,independentGroups:groups};
}
export function adjudicateProposition({proposition,contractHash,observations=[],prior=[],validate,threshold=3}){
 if(typeof validate!=='function'||threshold!==3)throw Error('EVIDENCE_POLICY_VALIDATOR_REQUIRED');
 const usable=o=>o?.proposition===proposition&&['POSITIVE','NEGATIVE'].includes(o.polarity)&&['DIRECT','STRONG','SUPPORTING'].includes(o.strength)&&Array.isArray(o.dependencies)&&o.dependencies.length>0&&o.dependencies.every(d=>typeof d==='string'&&d)&&validate(o);
 const retained=[];
 for(const receipt of prior){
  if(!receipt)continue;
  const {digest:recorded,...payload}=receipt;
  if(payload.version!==evidencePolicyVersion||payload.contractHash!==contractHash||payload.proposition!==proposition||recorded!==digest(payload)||!Array.isArray(payload.observations)||!payload.observations.every(usable))continue;
  // Only an actually established positive/negative proof can persist. Old
  // unresolved hints do not acquire strength just by being in retained state.
  if(proof(payload.observations.filter(o=>o.polarity==='POSITIVE'),threshold).established||proof(payload.observations.filter(o=>o.polarity==='NEGATIVE'),threshold).established)retained.push(...payload.observations);
 }
 const all=[...new Map([...retained,...observations.filter(usable)].map(o=>[o.id,o])).values()];
 const positive=proof(all.filter(o=>o.polarity==='POSITIVE'),threshold),negative=proof(all.filter(o=>o.polarity==='NEGATIVE'),threshold);
 const status=negative.established?(positive.established?'UNRESOLVED':'DISQUALIFIED'):positive.established?'ESTABLISHED':'UNRESOLVED';
 const payload={version:evidencePolicyVersion,contractHash,proposition,observations:all};
 return {status,reason:negative.established?(positive.established?'ESTABLISHED_CONTRADICTORY_EVIDENCE':'ESTABLISHED_NEGATIVE_PROOF'):positive.rule??'INSUFFICIENT_POSITIVE_EVIDENCE',positive,negative,retainedObservationIds:retained.map(o=>o.id),receipt:positive.established||negative.established?{...payload,digest:digest(payload)}:null};
}
