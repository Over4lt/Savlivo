// One provider-grounded offer model, two exposure thresholds. Never changes HIGH.
import {createHash} from 'node:crypto';
import {deriveEvidence} from '../verification/gate.mjs';
import {prepareCommercialSource} from '../offline-recovery/commercial.mjs';
import {adjudicateProviderPrice,reconcilePriceObservations} from './provider-price-adjudication.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
// Concept segmentation assists review/routing; these tokens NEVER establish a price/cadence by themselves.
export const commercialConcepts={
 subscription:/subscription|membership|Abonnement|Mitgliedschaft|předplatné|členství|abonelik|üyelik|สมัครสมาชิก|การสมัครสมาชิก|구독|멤버십|会員|サブスクリプション/giu,
 monthly:/per month|monthly|im Monat|pro Monat|měsíčně|měsíc|aylık|รายเดือน|ต่อเดือน|월간|월정액|매월|月額|毎月/giu,
 weekly:/weekly|per week|wöchentlich|týdně|haftalık|รายสัปดาห์|매주|毎週/giu,
 annual:/annually|per year|jährlich|ročně|yıllık|รายปี|연간|매년|年額|毎年/giu,
 commitment:/minimum term|minimum commitment|Mindestlaufzeit|závazek|taahhüt|ระยะเวลาขั้นต่ำ|약정|最低利用期間/giu,
 trial:/free trial|kostenlos testen|zkušební|ücretsiz deneme|ทดลองใช้ฟรี|무료 체험|無料体験/giu,
 joiningFee:/joining fee|activation fee|Anmeldegebühr|zápisné|kayıt ücreti|ค่าธรรมเนียมแรกเข้า|가입비|入会金/giu,
 addon:/optional add.on|Zusatzoption|doplněk|ek paket|บริการเสริม|추가 요금|追加オプション/giu,
 renewal:/renews|renewal|verlängert|obnovuje|yenilenir|ต่ออายุ|갱신|自動更新/giu
};
export function segmentCommercialConcepts(text,{path,sourceHash}){return Object.entries(commercialConcepts).flatMap(([concept,re])=>[...text.matchAll(new RegExp(re.source,re.flags))].map(m=>({concept,raw:m[0],start:m.index,end:m.index+m[0].length,path,sourceHash,coordinate:'NORMALIZED_OWNER_TEXT',evidenceStatus:'LEXICAL_CONTEXT_NOT_PRICE_FACT'})));}
const tolerated=new Set(['PRODUCT_UNRESOLVED','PLAN_UNRESOLVED','OFFER_OWNERSHIP_UNRESOLVED','STRUCTURAL_OWNERSHIP_WEAK','MARKET_APPLICABILITY_UNRESOLVED','MARKET_ATTRIBUTION_UNRESOLVED','MARKET_SCOPE_UNRESOLVED','COMMITMENT_NOT_STRUCTURALLY_RESOLVED']);
export function classifyOfferConfidence(o,{boundedPrincipal=false}={}){
 if(o.source?.kind!=='ORIGINAL_PROVIDER')return {confidence:'LOW',reason:'ORIGINAL_PROVIDER_REQUIRED'};
 if(o.trustworthy)return {confidence:'HIGH',reason:'UNCHANGED_PROVIDER_PRICE_ADJUDICATOR'};
 if(o.marketApplicability?.status==='TARGET_MISMATCH')return {confidence:'LOW',reason:'INCOMPATIBLE_TARGET_MARKET'};
 const required=['service','amount','currency','provenance','ordinaryPriceRole'];
 if(required.some(k=>o.fields?.[k]?.status!=='ESTABLISHED')||!o.billingInterval?.recurringPresentation||!(o.offerOwnership?.established||boundedPrincipal))return {confidence:'LOW',reason:'REQUIRED_PRICE_FACT_UNRESOLVED'};
 if(!['RECURRING_MONTHLY','ANNUAL_RECURRING','ORDINARY_RECURRING'].includes(o.commercialRole)||(o.blockers??[]).some(b=>!tolerated.has(b)))return {confidence:'LOW',reason:'UNSAFE_OR_UNRESOLVED_COMMERCIAL_ROLE'};
 return {confidence:'MEDIUM',reason:'EXACT_PROVIDER_PRICE_WITH_EXPLICIT_UNCERTAINTY'};
}
export function reconstructOfferIntelligence({body,context,receipt,sourceUrl}){
 if(sha(body)!==context.bodyHash||receipt.bodyHash!==context.bodyHash||!receipt.intact)throw Error('ORIGINAL_PROVIDER_HASH_REQUIRED');
 const derived=deriveEvidence(body,context),source=prepareCommercialSource(body,context.bodyHash),observations=reconcilePriceObservations(derived.rows.map(c=>adjudicateProviderPrice(c,derived,receipt,{body,sourceUrl,source})));
 return enrichOfferObservations(observations,source,context.bodyHash);
}
export function enrichOfferObservations(observations,source,sourceHash){
 const offers=observations.map(o=>{const container=o.offerObject?.container,node=source.nodes.get(container),concepts=node?segmentCommercialConcepts(node.text,{path:container,sourceHash}):[];
 // A bounded principal without named plan is only usable when existing role verification succeeded.
 const inOwner=observations.filter(x=>container&&x.offerObject?.container===container),boundedPrincipal=!!node&&node.text.length<=3000&&inOwner.filter(x=>x.offerObject?.monetaryRole.role==='PRINCIPAL_RECURRING_PRICE').length===1;
 const confidence=classifyOfferConfidence(o,{boundedPrincipal});const fields=Object.fromEntries(Object.entries(o.fields).map(([key,v])=>[key,{...v,fieldId:sha([o.source.hash,o.source.path,key].join('|')),sourceHash:o.source.hash}]));
 const accessibleReferences=[];for(const attr of ['aria-labelledby','aria-describedby'])for(const id of (node?.attrs?.[attr]??'').split(/\s+/).filter(Boolean)){const matches=[...source.nodes.entries()].filter(([p,n])=>n.attrs?.id===id&&p.startsWith(container+'/'));if(matches.length===1)accessibleReferences.push({attribute:attr,id,path:matches[0][0],raw:matches[0][1].text,sourceHash:o.source.hash,meaning:'SAME_OWNER_ACCESSIBLE_CONTEXT_ONLY'});}
 return {...o,...confidence,fieldEvidence:fields,commercialConcepts:concepts,accessibleReferences,unknownFields:Object.entries(fields).filter(([,v])=>v.status!=='ESTABLISHED').map(([k])=>k),suggestion:{optional:true,editable:true,nationalDefault:false,market:o.exposure.marketTargeting?o.market:null},modelEvidence:false};});
 return {version:1,sourceHash,offers,high:offers.filter(o=>o.confidence==='HIGH').length,medium:offers.filter(o=>o.confidence==='MEDIUM').length,low:offers.filter(o=>o.confidence==='LOW').length,networkRequired:false};
}
// Optional model contract: select existing established fields, never supply new values or override exclusions.
export function validateInterpretationProposals(offers,proposals){if(!Array.isArray(proposals)||proposals.length>32)throw Error('MODEL_PROPOSAL_BOUND');return proposals.map(p=>{const offer=offers.find(o=>o.offerObject?.objectId===p.offerId),field=offer?.fieldEvidence?.[p.field];const accepted=!!offer&&offer.source?.kind==='ORIGINAL_PROVIDER'&&field?.status==='ESTABLISHED'&&p.fieldId===field.fieldId&&p.sourceHash===offer.source.hash&&!('value' in p);return {...p,accepted,reason:accepted?'EXISTING_PROVIDER_FIELD_REFERENCE_ONLY':'UNSUPPORTED_OR_UNSAFE_MODEL_PROPOSAL',canChangeAdmission:false,requiresDeterministicReverification:true,modelIsEvidence:false};});}
