import {createHash} from 'node:crypto';

const stable=value=>JSON.stringify(value,Object.keys(value??{}).sort());
const hash=value=>createHash('sha256').update(stable(value)).digest('hex');

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
}

export function createV4SuggestedSnapshot({provider,market,suggested=[]}){
  if(!provider||!market||!Array.isArray(suggested))throw Error('V4_SNAPSHOT_INPUT_INVALID');
  const plans=suggested.filter(row=>Number.isFinite(row.suggestedAmount??row.amount)).map(row=>{
    const plan={...structuredClone(row),provider,market,plan:String(row.plan),amount:Number(row.suggestedAmount??row.amount),currency:String(row.suggestedCurrency??row.currency),paymentCadence:row.suggestedPaymentCadence??row.paymentCadence??null,commitment:row.suggestedCommitment??row.commitment??null,sourceUrl:row.suggestedSourceUrl??row.sourceUrl??null,citations:[...new Set([...(row.citations??[]),...(row.googleAiSourceReferences??[]),row.suggestedSourceUrl,row.sourceUrl].filter(Boolean))],warnings:[...(row.warnings??[])],researchedAt:row.researchedAt??null,provenance:'GOOGLE_AI_V4'};
    return {suggestedId:'v4:'+hash(plan),...plan};
  });
  return deepFreeze({schemaVersion:1,kind:'V4SuggestedSnapshot',provider,market,suggested:plans});
}

export function createV3Handoff(snapshot,{researchCandidates=[],unresolvedGaps=[]}={}){
  if(snapshot?.kind!=='V4SuggestedSnapshot')throw Error('V4_SNAPSHOT_REQUIRED');
  const fields=row=>({plan:String(row.plan),amount:row.amount??row.suggestedAmount??null,currency:row.currency??row.suggestedCurrency??null,paymentCadence:row.paymentCadence??row.suggestedPaymentCadence??null,commitment:row.commitment??row.suggestedCommitment??null,sourceUrl:row.sourceUrl??row.suggestedSourceUrl??null,sourceHash:row.sourceHash??null,sourceEvidence:row.sourceEvidence??null,warnings:[...(row.warnings??[])]});
  const snapshots=snapshot.suggested.map(row=>({suggestedId:row.suggestedId,...fields(row),truthAuthority:'NONE'})),byValue=new Map(snapshots.map(row=>[hash(fields(row)),row.suggestedId]));
  const candidates=researchCandidates.map(row=>{const value=fields(row),suggestedId=row.suggestedId??byValue.get(hash(value))??'v4-lead:'+hash(value);return {suggestedId,...value,truthAuthority:'NONE'};});
  const candidatePlans=[...new Map([...snapshots,...candidates].map(row=>[row.suggestedId,row])).values()];
  const urls=[...new Set(candidatePlans.flatMap(row=>[row.sourceUrl]).concat(snapshot.suggested.flatMap(row=>row.citations)).filter(Boolean))];
  const researchCandidateLineage=candidatePlans.map(row=>({originSuggestedId:row.suggestedId,plan:row.plan,sourceUrl:row.sourceUrl,sourceHash:row.sourceHash,sourceEvidence:row.sourceEvidence,truthAuthority:'NONE'}));
  return {schemaVersion:1,kind:'V4_TO_V3_RESEARCH_HANDOFF',provider:snapshot.provider,targetMarket:snapshot.market,researchLeads:{candidatePlans,candidateUrls:urls,citations:urls,unresolvedGaps:[...new Set(unresolvedGaps)],truthAuthority:'NONE'},adaptiveTargetPatch:{serviceName:snapshot.provider,market:snapshot.market,researchObjective:'SERVICE_COVERAGE',urls,researchCandidateLineage,leads:urls.map(url=>({url,originSuggestedIds:researchCandidateLineage.filter(row=>row.sourceUrl===url).map(row=>row.originSuggestedId),truthAuthority:'NONE',authoritative:false,origin:'GOOGLE_AI_V4'}))}};
}
