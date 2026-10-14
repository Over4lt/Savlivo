const compactWhitespace=value=>String(value??'').replace(/\s+/g,' ').trim();

function compactBody(value){
  let text='',pendingSpace=false;const positions=[];
  for(let index=0;index<value.length;index++){
    if(/\s/.test(value[index])){pendingSpace=text.length>0;continue;}
    if(pendingSpace){text+=' ';positions.push(index);pendingSpace=false;}
    text+=value[index];positions.push(index);
  }
  return {text,positions};
}
function exactEvidenceSpan(body,evidence){
  const needle=compactWhitespace(evidence);if(!needle)return null;
  const compact=compactBody(body),start=compact.text.indexOf(needle);
  if(start<0||compact.text.indexOf(needle,start+1)>=0)return null;
  return {start:compact.positions[start],end:compact.positions[start+needle.length-1]+1};
}
function locatorSpan(candidate){
  const source=candidate?.sourceLocator?.source,script=candidate?.sourceLocator?.script;
  if(Number.isInteger(source?.start)&&Number.isInteger(source?.end))return {start:source.start,end:source.end};
  if(Number.isInteger(script?.start)&&Number.isInteger(script?.end))return {start:script.start,end:script.end};
  return null;
}

export function sourceBoundLineageBindings({handoff,observation,candidates}){
  const bindings=[],unresolved=[];
  for(const lead of handoff?.adaptiveTargetPatch?.researchCandidateLineage??[]){
    if(!lead.originSuggestedId||lead.sourceHash!==observation?.sha256||typeof lead.sourceEvidence!=='string'){unresolved.push({originSuggestedId:lead.originSuggestedId??null,reason:'NO_EXACT_SOURCE_LINEAGE'});continue;}
    const evidence=exactEvidenceSpan(observation.body,lead.sourceEvidence),matches=evidence?candidates.filter(candidate=>{const span=locatorSpan(candidate);return span&&span.start<=evidence.start&&span.end>=evidence.end;}):[];
    if(matches.length!==1){unresolved.push({originSuggestedId:lead.originSuggestedId,reason:matches.length?'AMBIGUOUS_SOURCE_LOCATOR':'SOURCE_LOCATOR_NOT_FOUND'});continue;}
    bindings.push({originSuggestedId:lead.originSuggestedId,observationId:observation.id,sourceHash:observation.sha256,sourceLocator:structuredClone(matches[0].sourceLocator),basis:'EXACT_SOURCE_HASH_AND_LOCATOR_OVERLAP'});
  }
  const byLocator=new Map();for(const binding of bindings){const key=JSON.stringify(binding.sourceLocator),rows=byLocator.get(key)??[];rows.push(binding);byLocator.set(key,rows);}
  return {bindings:bindings.filter(binding=>byLocator.get(JSON.stringify(binding.sourceLocator)).length===1),unresolved:[...unresolved,...[...byLocator.values()].filter(rows=>rows.length>1).flatMap(rows=>rows.map(row=>({originSuggestedId:row.originSuggestedId,reason:'AMBIGUOUS_ORIGIN_FOR_SOURCE_LOCATOR'})))]};
}
