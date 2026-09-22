import {mapRequiredChunks} from './chunk-resources.mjs';
// Host stage boundary: called only with completed ordinary interpretation and
// explicit field assessments. Candidate outputs never enter the VERIFIED ledger.
import {linkProviderModules} from './demand-linker.mjs';
import {traceProviderCode} from './trace.mjs';
export function runFieldGapFallback({ordinaryAcquisitionComplete,interpretationComplete,fieldAssessment,blocker='',providerCodeRelevant,entries,modules,authorities,limits}) {
 const fields=Object.entries(fieldAssessment??{}).filter(([,assessment])=>assessment.status==='UNRESOLVED'&&typeof assessment.reason==='string'&&assessment.reason.length).map(([field])=>field);
 const result=traceProviderCode({gap:{ordinaryAcquisitionComplete,interpretationComplete,providerCodeRelevant,blocker,fields},entries:entries??[],modules:modules??[],authorities:authorities??[],limits});
 const linking=result.activation.active?linkProviderModules({fields,modules:modules??[],authorities:authorities??[],linkingLimits:{work:Math.max(0,(limits?.work??200000)-result.counts.work)}}):null;
 const mapping=linking?.complete?mapRequiredChunks({modules:modules??[],dependencies:linking.dependencies,authorities:authorities??[],limits:{work:Math.min(50000,Math.max(0,(limits?.work??200000)-result.counts.work-linking.counts.work))}}):null;
 const dependencyProofs=[...(linking?.dependencies??[]),...(mapping?.complete?mapping.mappings.filter(m=>m.status==='PROVEN').map(m=>({...m.dependency,url:m.url,reference:m.reference,mapping:m,acquisitionEligible:m.acquisitionEligible})):[])];
 // Independent link proofs do not repair incomplete ordinary traces or alter facts.
 const candidates=[...result.candidates];
 if(linking?.complete)for(const candidate of linking.candidates)if(!candidates.some(c=>c.url===candidate.url))candidates.push(candidate);
 return {...result,counts:{...result.counts,work:result.counts.work+(linking?.counts.work??0)+(mapping?.work??0)},candidates,linking,mapping,dependencyProofs,fieldAssessment,stage:'POST_INTERPRETATION_FIELD_GAP_FALLBACK',acquisitionPerformed:false,verificationModified:false,requiredNextStage:'SEPARATELY_AUTHORIZED_POLICY_AND_GEO_ACQUISITION_THEN_NORMAL_INTERPRETATION'};
}
