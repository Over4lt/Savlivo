// Original-source semantic objects. No provider dispatch, market inference or
// changes to the complete canonical gate. Unknown dimensions never split conflicts.
import {hash,monetary,normalizeText} from '../offline-recovery/extract.mjs';
const cache=new WeakMap(),norm=s=>normalizeText(s??'').normalize('NFKC').toLowerCase();
const secondary=/\bper\s+(?:extra|additional)\s+(?:profile|member|user|seat)\b|\bavailable as (?:an? )?extra\b|\boptional add.on\b/iu;
function monetaryRole(c,source){
 const co=c.commercial??{};
 if((c.qualifier??[]).some(x=>/REFERENCE_PRICE/.test(x)))return {role:'COMPARISON_PRICE',proof:c.qualifierEvidence};
 if(co.nonPrincipalRole)return {role:co.nonPrincipalRole,proof:co.evidence};
 if(['TRIAL','INTRO_PROMOTION','PREPAID_FIXED_DURATION','ONE_TIME_NON_RENEWING'].includes(co.type))return {role:co.type,proof:co.evidence};
 const node=source.nodes.get(c.structuredPath),text=node?.text??co.evidence?.find(e=>e.kind==='MONETARY_CLAUSE')?.raw??'',ms=monetary(text),own=ms.filter(m=>m.amount===c.amountNormalized&&m.currencyRaw===c.currencyRaw);
 if(own.length){const proofs=own.map(m=>{const next=ms.find(x=>x.start>=m.end),tail=text.slice(m.start,next?.start??text.length);return {raw:tail,path:c.structuredPath,sourceHash:c.bodyHash,start:m.start,end:next?.start??text.length,secondary:secondary.test(tail)};});if(proofs.every(p=>p.secondary))return {role:'OPTIONAL_ADDON',proof:proofs};}
 const local=co.evidence?.find(e=>e.kind==='MONETARY_CLAUSE')?.raw??'';
 if(/\b(?:joining|registration|activation|setup|admin(?:istration)?|deposit|pause|freeze)\s+fee\b/iu.test(local))return {role:'SECONDARY_FEE',proof:co.evidence};
 return {role:['RECURRING_MONTHLY','ANNUAL_RECURRING'].includes(co.type)&&!co.monthlyEquivalentDisplay?'PRINCIPAL_RECURRING_PRICE':'UNRESOLVED',proof:co.evidence??[]};
}
function dimensions(c,source){const node=source.nodes.get(c.productOwnerEvidence?.path),out={};const add=(k,value,raw,path)=>out[k]={value,raw,path,sourceHash:c.bodyHash};
 if(c.commercial?.billingInterval?.recurringPresentation)add('billingInterval',c.commercial.billingInterval.normalized,c.commercial.billingInterval.originalWording,c.structuredPath);
 if(!node||node.text.length>3000)return out;
 // Only explicit provider attributes on this owner, not guessed location strings.
 for(const k of ['location','channel','eligibility','activity','configuration'])if(node.attrs?.['data-'+k])add(k,node.attrs['data-'+k],node.attrs['data-'+k],c.productOwnerEvidence.path+'/@data-'+k);
 const text=node.text,terms=[...text.matchAll(/\b(\d+)\s*(?:Monate?\s+Mindestlaufzeit|months?\s+minimum\s+(?:term|commitment)|måneder\s+binding)\b|\b(?:minimum (?:term|commitment)|commitment)\s*(?:of\s*)?(\d+)\s*months?\b/giu)];
 const no=/\b(?:no commitment|without commitment|uten binding|ohne Vertragsbindung)\b/iu.exec(text);
 if(terms.length===1&&!no)add('commitment','MONTH:'+Number(terms[0][1]??terms[0][2]),terms[0][0],c.productOwnerEvidence.path);
 else if(no&&!terms.length)add('commitment','NONE',no[0],c.productOwnerEvidence.path);
 return out;
}
export function materializeOfferObjects(derived,source){if(cache.has(derived))return cache.get(derived);
 const objects=derived.rows.map(c=>{const owned=!!c.productOwnerEvidence?.path&&!c.ownershipAmbiguous&&!c.crossCardRisk&&c.attribution?.productOwnershipEstablished===true,role=monetaryRole(c,source),dims=owned?dimensions(c,source):{};if(dims.commitment&&c.commercial?.billingInterval?.recurringPresentation&&c.commercial.type==='UNRESOLVED'&&c.commercial.reasons?.length&&c.commercial.reasons.every(r=>r==='COMMITMENT_REQUIRES_REVIEW'))role.role='PRINCIPAL_RECURRING_PRICE';return {version:1,candidateId:c.candidateId,service:c.service,requestedMarket:c.market,sourceHash:c.bodyHash,pricePath:c.structuredPath,container:owned?c.productOwnerEvidence.path:null,offerOwned:owned,planLabel:c.product??null,amount:c.amountNormalized,currency:c.currency,exactInterval:c.commercial?.billingInterval??null,monetaryRole:role,dimensions:dims,variantKey:Object.entries(dims).map(([k,v])=>[k,v.value]).sort(),originalBlockers:[...(c.blockingReasons??[])],resolvedConflict:false,conflictRelationships:[],offerPresentation:c.offerPresentation??null,sourceEvidence:c.rawEvidenceSnippet};});
 const locate=new Map();for(const o of objects){const k=JSON.stringify([o.pricePath,o.amount,o.currency]);if(!locate.has(k))locate.set(k,[]);locate.get(k).push(o);}
 for(let i=0;i<objects.length;i++){const o=objects[i],c=derived.rows[i];for(const p of c.verificationConflictPeerLocators??[]){const matches=locate.get(JSON.stringify([p.path,p.amount,p.currency]))??[];const decisions=matches.map(peer=>{let reason='UNRESOLVED_OR_TRUE_CONFLICT';if(o.offerOwned){if(peer.pricePath.startsWith(o.container+'/')&&o.monetaryRole.role==='PRINCIPAL_RECURRING_PRICE'&&['OPTIONAL_ADDON','SECONDARY_FEE','COMPARISON_PRICE','TRIAL','INTRO_PROMOTION'].includes(peer.monetaryRole.role))reason='SEPARATE_MONETARY_ROLE';else if(peer.offerOwned&&(o.monetaryRole.role==='PRINCIPAL_RECURRING_PRICE'&&peer.monetaryRole.role==='PRINCIPAL_RECURRING_PRICE'&&Object.keys(o.dimensions).some(k=>peer.dimensions[k]&&JSON.stringify(o.dimensions[k].value)!==JSON.stringify(peer.dimensions[k].value))))reason='PROVEN_VARIANT_DIMENSION';}return {peerPath:peer.pricePath,peerContainer:peer.container,peerAmount:peer.amount,reason};});o.conflictRelationships.push(...(decisions.length?decisions:[{peerPath:p.path,reason:'MISSING_PEER_PROOF'}]));}
 o.resolvedConflict=o.originalBlockers.includes('MULTIPLE_CONFLICTING_FACTS')&&o.conflictRelationships.length>0&&o.conflictRelationships.every(p=>['SEPARATE_MONETARY_ROLE','PROVEN_VARIANT_DIMENSION'].includes(p.reason));
 o.semanticKey=hash([o.service,o.requestedMarket,o.sourceHash,o.planLabel,o.currency,o.monetaryRole.role,o.variantKey]);o.equivalenceKey=hash([o.semanticKey,o.container??o.pricePath,o.amount]);o.objectId='offer:'+hash([o.sourceHash,o.container,o.pricePath,o.amount]);
 }
 const result={objects,byCandidate:new Map(objects.map(o=>[o.candidateId,o])),equivalenceGroups:Object.values(Object.groupBy(objects,o=>o.equivalenceKey)).map(xs=>({key:xs[0].equivalenceKey,representations:xs.map(x=>x.objectId),amount:xs[0].amount,sourceHash:xs[0].sourceHash}))};cache.set(derived,result);return result;
}
