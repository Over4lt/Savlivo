// Discovery-only enrichment of the existing ownership-review worklist.
// Never consumed by provider-authority-bootstrap or execution as an approval.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeAuthorityEvidence} from './native-authority-evidence.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const host=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.hostname:null;}catch{return null;}};
export const reviewCategories=['REVIEWED_READY','CANDIDATE_READY_FOR_EXPLICIT_REVIEW','PROVIDER_CONFIRMED_PRODUCT_REVIEW','REGIONAL_ROOT_REVIEW','PRODUCT_FAMILY_PRODUCT_IDENTITY_REVIEW','AMBIGUOUS_IDENTITY','UNRESOLVED_IDENTITY','CONFLICT'];
export function reconcileProviderInput({input,corrections={},findings={},cohort,rows,document,root}) {
 const ids=cohort.manifest.serviceIds;
 if(input.rows.length!==188||new Set(input.rows.map(r=>r.service_id)).size!==188||input.rows.some(r=>!ids.includes(r.service_id)))throw Error('HANDOFF_WORKBOOK_COHORT_MISMATCH');
 if(Object.keys(corrections).some(id=>!ids.includes(id)))throw Error('HANDOFF_CORRECTION_OUTSIDE_COHORT');
 if(Object.entries(findings).some(([id,f])=>!ids.includes(id)||!['PRODUCT_FAMILY_PRODUCT_IDENTITY_REVIEW','REGIONAL_ROOT_REVIEW','AMBIGUOUS_IDENTITY','UNRESOLVED_IDENTITY'].includes(f.status)||!f.reason))throw Error('HANDOFF_PENDING_FINDING_SCHEMA');
 const counts=Object.fromEntries(reviewCategories.map(k=>[k,0]));let improved=0,potentialPages=0;
 const results=rows.map(row=>{
  const raw=input.rows.find(r=>r.service_id===row.service),c=cohort.candidates.find(c=>c.slug===row.service),fix=corrections[row.service];
  if(fix&&!c.references.some(r=>r.reference===fix.entryUrl))throw Error('HANDOFF_CORRECTION_WITHOUT_PROJECT_REFERENCE');
  const url=fix?.entryUrl??raw.official_homepage_candidate,h=host(url),qa=fix?'PROJECT_IDENTITY_RECONCILED':raw.qa_status;
  const reviewed=document.bindings.filter(b=>b.service===row.service);
  // www equivalence is only a discovery consistency check, never sibling authority.
  // A completed, independently validated review may explicitly reconcile a discovery
  // homepage with a different exact evidence host. This metadata grants no authority:
  // prepareAuthorityUniverse has already validated each reviewed binding separately.
  const consistent=reviewed.every(b=>b.hostname===h||b.hostname.replace(/^www\./,'')===h?.replace(/^www\./,'')||
   (b.review?.candidateReconciliation?.sourceUrl===url&&typeof b.review.candidateReconciliation.reason==='string'&&b.review.candidateReconciliation.reason.trim().length>0));
  let category=reviewed.length?(consistent?'REVIEWED_READY':'CONFLICT'):!h||qa==='UNRESOLVED_IDENTITY'?'UNRESOLVED_IDENTITY':qa==='AMBIGUOUS_IDENTITY'?'AMBIGUOUS_IDENTITY':qa==='CONFIRMED_ROOT_REVIEW_REGIONAL'?'REGIONAL_ROOT_REVIEW':qa==='PROVIDER_CONFIRMED_PRODUCT_REVIEW'?'PROVIDER_CONFIRMED_PRODUCT_REVIEW':['PRODUCT_FAMILY_REVIEW','PRODUCT_IDENTITY_REVIEW','REVIEW_REQUIRED'].includes(qa)?'PRODUCT_FAMILY_PRODUCT_IDENTITY_REVIEW':'CANDIDATE_READY_FOR_EXPLICIT_REVIEW';
  if(!reviewed.length&&findings[row.service])category=findings[row.service].status;
  const known=['','OFFICIAL_CONFIRMED','PROJECT_IDENTITY_RECONCILED','UNRESOLVED_IDENTITY','AMBIGUOUS_IDENTITY','CONFIRMED_ROOT_REVIEW_REGIONAL','PROVIDER_CONFIRMED_PRODUCT_REVIEW','PRODUCT_FAMILY_REVIEW','PRODUCT_IDENTITY_REVIEW','REVIEW_REQUIRED'];
  if(!known.includes(qa))throw Error('HANDOFF_UNKNOWN_WORKBOOK_QA_STATUS');
  const usable=!['UNRESOLVED_IDENTITY','AMBIGUOUS_IDENTITY','CONFLICT'].includes(category);
  const relative='.savlivo/research-v2/universe-expansion/runs/v15-new-services-full-v2-20260921/services/'+row.service+'/pages.json';
  const file=path.join(root,relative),bytes=fs.readFileSync(file),pages=JSON.parse(bytes);
  const evidenceCues=[],materials=pages.map((p,pageIndex)=>{
   const exact=host(p.url)===h,domain=fix?h:raw.provider_domain,related=domain&&(host(p.url)===domain||host(p.url)?.endsWith('.'+domain));
   let status=p.outcome!=='OK'?'UNUSABLE_ACQUISITION':exact||related?'POTENTIALLY_RELEVANT_REQUIRES_REVIEW':'UNRELATED_REJECTED';let reason=exact?'EXACT_CANDIDATE_HOST_NOT_OWNERSHIP_PROOF':related?'SUBDOMAIN_REQUIRES_SEPARATE_EXACT_HOST_REVIEW':'NO_DOCUMENTED_CANDIDATE_HOST_RELATIONSHIP';
   if(p.outcome==='OK'&&(exact||related)&&p.bodyFile){
    const evidence={format:'NATIVE_PUBLIC_PAGE_V1',path:relative,sha256:hash(bytes),pageIndex,sourceUrl:p.url};
    try{
     if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(p.bodyFile))throw Error('BODY_PATH');
     const body=fs.readFileSync(path.join(path.dirname(file),p.bodyFile),'utf8');
     // Mechanical native evidence eligibility only; no ownership excerpt is selected for the reviewer.
     nativeAuthorityEvidence({root,file,saved:pages,evidence:{...evidence,locator:{offset:0},excerpt:body.slice(0,Math.min(128,body.length))}});
     if(usable){status='REUSABLE_AFTER_REVIEWED_BINDING';potentialPages++;reason=exact?'EXACT_HOST_REVIEW_AND_RELEVANCE_VALIDATION_REQUIRED':'SEPARATE_EXACT_HOST_REVIEW_AND_RELEVANCE_VALIDATION_REQUIRED';}
     evidenceCues.push({...evidence,locator:null,excerpt:null,bodyFile:path.join(path.dirname(relative),p.bodyFile),requires:'Human must select exact ownership/product proof, not merely arbitrary text.'});
    }catch(e){reason=e.message;status='UNUSABLE_ACQUISITION';}
   }
   return {pageIndex,url:p.url,status,reason,bodyHash:p.bodyHash??null};
  });
  const oldHosts=[...new Set(row.candidates.map(p=>p.host))];
  const identityImproved=usable&&!reviewed.length&&(fix||!oldHosts.includes(h)||['UNRESOLVED','AMBIGUOUS_REVIEW_REQUIRED'].includes(row.status));
  if(identityImproved)improved++;
  counts[category]++;
  const draft=usable&&!reviewed.length?{service:row.service,serviceName:row.name,hostname:h,entryUrl:url,bindingType:'DIRECT_PROVIDER',sourceType:'OFFICIAL_PROVIDER',basis:'OFFICIAL_SERVICE_SITE',marketScope:null,authorityScope:'DOMAIN_IDENTITY_ONLY_NOT_PRICE_OR_MARKET',review:{status:'REVIEW_REQUIRED',checkedAt:null,reason:null},evidence:[]}:null;
  return {...row,offlineReviewFinding:findings[row.service]??null,previousStatus:row.status,previousReason:row.reason,previousMaterials:row.materials,materials,reason:reviewed.length?'EXPLICIT_INDIVIDUAL_REVIEW':'WORKBOOK_REVIEW_GUIDANCE_ONLY',previousCandidateHosts:oldHosts,status:category,
   // Only the current input is an actionable candidate. Historical alternatives remain diagnostic.
   candidates:usable?[{url,host:h,meaning:'REVIEW_CANDIDATE_NOT_AUTHORITY',evidenceCues}]:[],
   providerReview:{workbook:{...raw},correction:fix??null,selectedCandidate:usable?{url,hostname:h}:null,existingReviewedBindings:reviewed,agreement:reviewed.length?(consistent?'REVIEWED_HOST_AGREES':'REVIEWED_BINDING_CONFLICT'):oldHosts.includes(h)?'EXISTING_CANDIDATE_AGREES':'WORKBOOK_REPLACES_OR_ADDS_UNREVIEWED_LEAD',identityImproved:!!identityImproved,draftBinding:draft,evidenceCues,materials,retainedDisposition:materials.some(p=>p.status==='REUSABLE_AFTER_REVIEWED_BINDING')?'REUSABLE_AFTER_REVIEWED_BINDING':materials.some(p=>p.status==='POTENTIALLY_RELEVANT_REQUIRES_REVIEW')?'POTENTIALLY_RELEVANT_REQUIRES_REVIEW':'NO_RETAINED_USEFUL_EVIDENCE',requiredReview:category}};
 });
 return {rows:results,summary:{counts,materiallyImproved:improved,withoutUsableCandidate:counts.AMBIGUOUS_IDENTITY+counts.UNRESOLVED_IDENTITY+counts.CONFLICT,productResolution:counts.PROVIDER_CONFIRMED_PRODUCT_REVIEW+counts.PRODUCT_FAMILY_PRODUCT_IDENTITY_REVIEW,regionalResolution:counts.REGIONAL_ROOT_REVIEW,potentiallyReusablePages:potentialPages,networkCalls:0,automaticApprovals:0,liveReady:false}};
}

export function writeProviderReviewBatch(directory,report){
 if(!report.summary.providerInput)return;
 const drafts={schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings:report.rows.map(r=>r.providerReview.draftBinding).filter(Boolean)};
 fs.writeFileSync(path.join(directory,'provider-binding-drafts.json'),JSON.stringify(drafts,null,2)+'\n');
 const clean=s=>String(s??'').replaceAll('|','\\|').replaceAll('\n',' ');
 const lines=['# Provider-binding review batch','','Discovery guidance only. No binding in this packet is approved. The mature schema permits multiple explicitly reviewed bindings in one document; it does not support approving a blanket identity claim without individual proof.','','Review each service/product, exact host, regional scope and retained ownership excerpt. Add only explicitly approved bindings to `reviewed-provider-bindings.json`; never replace that file with the drafts. Draft review status and empty evidence deliberately fail the mature validator. Workbook source URLs are references, not acquired provider evidence. Missing retained proof is a remaining prerequisite, not permission to approve.','','`provider-binding-drafts.json` uses the mature binding shape. `review-worklist.json` contains full notes, prior candidates, existing reviews, immutable source hashes/page indices and body paths. Alternate/root/subdomain evidence requires its own exact-host review; no sibling authority inheritance.','','| Service / canonical name | Candidate URL | QA / disposition | Identity / QA notes | Comparison | Retained cues |','|---|---|---|---|---|---|'];
 for(const r of report.rows){const p=r.providerReview;lines.push('| '+[r.service+' / '+r.name,p.selectedCandidate?.url??'No usable selected candidate',p.workbook.qa_status+' / '+r.status,[p.workbook.identity_note,p.workbook.qa_note,p.correction?.reason].filter(Boolean).join(' '),p.agreement,p.evidenceCues.length+'; '+p.retainedDisposition].map(clean).join(' | ')+' |');}
 fs.writeFileSync(path.join(directory,'PROVIDER-REVIEW-BATCH.md'),lines.join('\n')+'\n');
}
