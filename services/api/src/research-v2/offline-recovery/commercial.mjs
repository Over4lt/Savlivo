import {foreignOfferForTarget} from './market-isolation.mjs';
import {namedPriceProse} from './named-price-prose.mjs';
import {priceContextGuards} from './price-context-guards.mjs';
import {billingCadence} from './cadence-family.mjs';
import {namedOfferCommercial} from './named-offer-details.mjs';
import {columnTableCommercial} from './column-plan-table.mjs';
import {faqCommercial} from './subscription-faq.mjs';
// Offline product-domain interpretation. No provider/service dispatch or acquisition.
import '../offline-replay/offline-guard.mjs';
import {closedRenewalCommercial} from './closed-renewal.mjs';
import {materializeStructured} from './structured-materialization.mjs';
import {htmlTree,hash,normalizeText,monetary,amount} from './extract.mjs';
export const commercialTypes=['RECURRING_MONTHLY','ANNUAL_RECURRING','PREPAID_FIXED_DURATION','ONE_TIME_NON_RENEWING','INTRO_PROMOTION','TRIAL','OTHER_MONETARY_OFFER','UNRESOLVED'];
const norm=x=>normalizeText(x??'').normalize('NFKC').toLowerCase();
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const month=/\/\s*(?:month|mo\b|mês|mes|monat|maand)|per month|monthly|par mois|per maand|pro monat|\bim monat\b|mensuel|mensual|mensal|måned|månaden|månad|μήνα|tháng|\/月|月額|شهري/iu;
const year=/billed (?:annually|yearly)|annual billing|annual only|annually|\/year|per year|yearly|jährlich|pro jahr|par an\b|per jaar|anual|factur[ée] annuellement/iu;
const noRenew=/does not auto.?renew|no auto(?:matic)?[ -]?renew|non.?renew|sem renova[çc][ãa]o autom[áa]tica|sans renouvellement|keine automatische verlängerung|không tự động gia hạn/iu;
const prepaid=/plată în avans|plata în avans|prepaid|pre.?paid|pré.?pago|prépaye|pay once in advance|pague uma vez adiantado|thanh toán trước|trả trước/iu;
const once=/one[ -]time payment|pay once|pagamento [úu]nico|pague uma vez|einmalzahlung|thanh toán[^.]{0,20}một lần/iu;
const fixed=/(?:for|por|für|pendant|για|cho)\s+(?:\d+|one|two|three|six|um|uma|dois|duas|três)\s*(?:months?|mês|meses|monate?|mois|μήν|tháng|days?|dias?)/iu;
const equivalent=/equivalent|équivalent|equivalente|tương đương|entspricht|omgerekend/iu;
const intro=/przez pierwsze\s+\d+\s+miesi|promoțional|promoție|first\s+(?:\d+|one|two|three|six)|introduct|promotion|promotional|primeros|primeiros|premiers|discounted|SalePrice/iu;
const restrictedOffer=/\bspecial\s+offer\b|\blimited[ -]time(?:\s+offer)?\b|\bfor a limited time\b|\bcampaign price\b/iu;
const trial=/free trial|\btrial\b|free for|gratis|grátis|gratuit|kostenlos|d[ωο]ρεάν/iu;
const after=/\bthen\b|thereafter|\bafter\b|depois|ensuite|danach|στη συνέχεια|sau đó/iu;
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const fieldKeys=['billingPeriod','billingInterval','billingDuration','unitText','recurring','autoRenew','isRecurringProduct','priceType','duration','duration_type'];
export function prepareCommercialSource(body,bodyHash){if(hash(body)!==bodyHash)throw Error('COMMERCIAL_BODY_HASH_MISMATCH');const tree=htmlTree(body),nodes=new Map(tree.nodes.map(n=>[pathOf(n),n])),objects=new Map(),products=[];let visited=0;
 function walk(v,p,anc=[]){if(!v||typeof v!=='object')return;if(++visited>300000)throw Error('COMMERCIAL_STRUCTURE_BOUND');objects.set(p,{value:v,ancestors:anc});if(!Array.isArray(v)){const names=['shortPlanName','name','planName','productName'].map(k=>v[k]).filter(x=>typeof x==='string');if(names.length)products.push({value:v,path:p,names});}for(const[k,x]of Object.entries(v))walk(x,p+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),[...anc,{value:v,path:p}]);}
 try{walk(JSON.parse(body),'$');}catch(e){if(e.message==='COMMERCIAL_STRUCTURE_BOUND')throw e;}
 for(const n of tree.nodes.filter(n=>n.tag==='script'))try{walk(JSON.parse(n.raw),pathOf(n));}catch(e){if(e.message==='COMMERCIAL_STRUCTURE_BOUND')throw e;}
 const materialization=materializeStructured(tree,bodyHash);for(const p of materialization.payloads)walk(p.value,p.path);
 return {bodyHash,nodes,objects,products,materialization,annualControls:selectedAnnualControls(tree,body)};
}
// Only an explicitly selected annual radio option in a bounded pricing section
// can disqualify its monthly display. This never establishes monthly billing.
function selectedAnnualControls(tree,body){
 const within=(n,p)=>n.start>=p.start&&n.end<=p.end;
 const controls=[];
 for(const field of tree.nodes.filter(n=>n.tag==='fieldset')){
  const radios=tree.nodes.filter(n=>n.tag==='input'&&n.attrs.type==='radio'&&within(n,field));
  const labels=tree.nodes.filter(n=>n.tag==='label'&&within(n,field));
  const label=r=>labels.find(l=>l.attrs.for===r.attrs.id)?.text??'';
  const selected=radios.filter(r=>/\schecked(?:\s|=|\/?>)/.test(body.slice(r.start,r.openEnd)));
  if(selected.length!==1||! /^(?:year|yearly|annual|annually)$/i.test(selected[0].attrs.value??'')||! /\b(?:pay yearly|billed annually|annual billing|pay annually)\b/i.test(label(selected[0])))continue;
  if(!radios.some(r=>/^(?:month|monthly)$/i.test(r.attrs.value??'')&&/\b(?:pay monthly|billed monthly|monthly billing)\b/i.test(label(r))))continue;
  let scope=field.parent;while(scope&&!['section','article'].includes(scope.tag))scope=scope.parent;
  if(!scope)continue;
  // Multiple independent billing controls in one section are not a safe join.
  if(tree.nodes.filter(n=>n.tag==='fieldset'&&within(n,scope)&&tree.nodes.some(r=>r.tag==='input'&&r.attrs.type==='radio'&&within(r,n))).length!==1)continue;
  controls.push({scopePath:pathOf(scope),scopeSpan:[scope.start,scope.end],controlPath:pathOf(field),raw:field.text,selectedValue:selected[0].attrs.value,basis:'EXPLICIT_SELECTED_ANNUAL_BILLING_CONTROL'});
 }return controls;
}
function productConditions(text,path){const out=[];for(const m of text.matchAll(/(?:up to |até |jusqu'à )?\d+\s+(?:Premium\s+)?(?:accounts?|members?|people|contas?|membros?|kontoer)|(?:same (?:address|household)|moram juntos|resid(?:e|ing) at the same address)|(?:eligible students|student eligibility|estudantes[^.]{0,100})/giu))out.push({raw:m[0],path});return out;}
// A local monetary clause, never a neighbouring offer. Multiple indistinguishable
// amounts in one clause stay ambiguous instead of choosing a convenient occurrence.
function clauseFor(c,text){const matches=monetary(text),own=matches.filter(m=>m.amount===c.amountNormalized);
 // A free introductory duration and its explicitly subsequent paid branch are
 // different intervals. Keep original text in the candidate; classify only the
 // single owned paid branch, never a neighbouring card or a priced promotion.
 if(c.structuralContainer==='EXPLICIT_SEMANTIC_PLAN_CARD'&&matches.length===1&&own.length===1){
  const transition=/^(?:Start \d+ days free trial|Probeer \d+ dagen gratis|\d+ Tage kostenlos testen|Disfruta \d+ días gratis|Prøv gratis i \d+ dag(?:er|e))\s+(Then|Daarna|Dann|Después|Deretter|Derefter)\s+(.+)$/iu.exec(text);
  if(transition&&monetary(transition[2]).length===1){
   if(/\b(?:introductory|promotional|promo|first|trial|discount|limited|eerste|zuerst|primer|første)\b/iu.test(transition[2]))return {text,ambiguous:true};
   return {text:transition[2],ambiguous:false,postTrial:true,original:text};
  }
 }
if(matches.length<=1)return {text,ambiguous:false};if(own.length!==1)return {text,ambiguous:true};const i=matches.indexOf(own[0]),start=i?own[0].start:0,end=matches[i+1]?.start??text.length;let value=text.slice(start,end);const prefix=text.slice(i?matches[i-1].end:0,own[0].start);if(after.test(prefix))value='then '+value;return {text:value,ambiguous:false};}
// Re-read the exact retained text; an extractor-assigned label/phase alone is
// not a commercial proof. The verifier invokes this on independently derived rows.
function checkedProse(c,source){
 const p=c.prosePriceRelationship;if(!p||p.bodyHash!==source?.bodyHash||p.path!==c.structuredPath)return null;
 let text=source.nodes.get(p.path)?.text;
 if(c.sourceType==='JSON'){const key=p.path.split('/').at(-1).replaceAll('~1','/').replaceAll('~0','~');text=source.objects.get(p.path.replace(/\/[^/]+$/,''))?.value?.[key];}
 if(typeof text!=='string')return null;
 return namedPriceProse(normalizeText(text),{monetary}).find(r=>JSON.stringify(r)===JSON.stringify(p.relationship)&&r.plan===c.product&&r.amount===c.amountNormalized&&r.currencyRaw===c.currencyRaw)??null;
}
function classifyCommercialCore(c,source){const details=namedOfferCommercial(c,source);if(details)return details;const table=columnTableCommercial(c,source);if(table)return table;const faq=faqCommercial(c,source);if(faq)return faq;const renewal=closedRenewalCommercial(c,source);if(renewal)return renewal;const evidence=[],reasons=[];let local=normalizeText(c.normalizedEvidenceSnippet??''),owner=local,fields=c.structuredContext??{},providerPlanId=c.componentOwnership?.providerProductId??null,conditions=[];
 if(c.structuredPlanBinding)evidence.push({kind:'RENDERED_STRUCTURED_PLAN_PRICE_BINDING',...c.structuredPlanBinding});
 const node=source?.nodes.get(c.structuredPath),owned=source?.nodes.get(c.qualifierPreservation?.ownerPath);if(owned){owner=owned.text;evidence.push({kind:'OWNING_STRUCTURE',path:pathOf(owned),span:[owned.start,owned.end],raw:owner.slice(0,6000)});conditions.push(...productConditions(owner,pathOf(owned)));}
 const json=source?.objects.get(c.structuredPath?.replace(/\/[^/]+$/,''));if(c.sourceType==='JSON'&&json){const v=json.value;fields={...fields,...pick(v,fieldKeys)};local=normalizeText([v.description,v.billingPeriod,v.billingInterval,v.billingDuration,v.unitText,v.priceType].filter(x=>typeof x==='string').join(' '));owner=local;const specs=Array.isArray(v.priceSpecification)?v.priceSpecification:v.priceSpecification?[v.priceSpecification]:[];const matching=specs.filter(s=>amount(s.price)===c.amountNormalized&&(!s.priceCurrency||s.priceCurrency===c.currency));if(matching.length===1){fields={...fields,...pick(matching[0],fieldKeys)};evidence.push({kind:'MATCHING_PRICE_SPECIFICATION',path:c.structuredPath.replace(/\/[^/]+$/,'')+'/priceSpecification',fields:pick(matching[0],['price','priceCurrency',...fieldKeys])});}else if(matching.length>1)reasons.push('MULTIPLE_BILLING_SPECIFICATIONS');evidence.push({kind:'OWNED_STRUCTURED_FIELDS',path:c.structuredPath,fields});}
 // Exact named product + exact primary price representation may link metadata.
 // Never use it to create/repair plan ownership. Child prepaid clauses do not inherit
 // the primary recurring flag: their own explicit renewal mode takes precedence.
 const linked=(source?.products??[]).filter(p=>c.product&&p.names.some(n=>norm(n)===norm(c.product))&&typeof p.value.primaryPriceDescription==='string'&&monetary(p.value.primaryPriceDescription).some(m=>m.amount===c.amountNormalized&&m.currencyRaw===c.currencyRaw));
 if(linked.length===1){const p=linked[0],v=p.value;conditions.push(...productConditions(normalizeText(JSON.stringify([v.benefits,v.legalDisclaimer])),p.path));providerPlanId??=v.planId??v.productId??null;const primary=norm(local)===norm(v.primaryPriceDescription);if(primary)fields={...fields,...pick(v,fieldKeys)};evidence.push({kind:'EXPLICIT_NAMED_PRODUCT_AND_PRICE',path:p.path,fields:pick(v,['shortPlanName','name','planName','planId','productId','primaryPriceDescription','isRecurringProduct']),relationship:primary?'PRIMARY_OFFER':'PRODUCT_METADATA_ONLY'});}
 if(!providerPlanId&&c.sourceType==='JSON'&&json){const own=[{value:json.value},...json.ancestors.slice().reverse()].find(p=>p.value?.name&&norm(p.value.name)===norm(c.product));if(own)providerPlanId=own.value.productId??own.value.sku??null;}
 const prose=checkedProse(c,source);if(prose){local=prose.raw;owner=prose.raw;evidence.push({kind:'NAMED_PRICE_PROSE',...c.prosePriceRelationship});}
 const annualControl=source?.annualControls?.find(a=>node&&node.start>=a.scopeSpan[0]&&node.end<=a.scopeSpan[1]);
 if(annualControl)evidence.push({kind:'SELECTED_ANNUAL_BILLING_CONTROL',...annualControl});
 const clause=clauseFor(c,local);local=clause.text;const q=c.qualifier??[],ownerSame=!!owned&&!c.ownershipAmbiguous&&!c.crossCardRisk;const nonrenew=noRenew.test(local)||(ownerSame&&noRenew.test(owner))||fields.recurring===false||fields.recurring===0||fields.autoRenew===false;const paid=prepaid.test(local)||(ownerSame&&prepaid.test(owner));const one=once.test(local)||(ownerSame&&once.test(owner));const annual=!!annualControl||year.test(local)||q.includes('BILLED_ANNUALLY')||['YEAR','YEARLY','ANNUAL','P1Y','P12M'].includes(String(fields.billingPeriod??fields.billingInterval??fields.billingDuration).toUpperCase());const intervalEvidence=billingCadence(local,fields,{path:c.structuredPath,bodyHash:c.bodyHash});const familyRecurring=intervalEvidence.interval?.cadenceFamily==='MONTHLY_FAMILY';const monthly=familyRecurring||(!intervalEvidence.interval&&!intervalEvidence.ambiguous&&(month.test(local)||c.subscriptionDeclaration?.basis==='EXPLICIT_NAMED_MONTHLY_SUBSCRIPTION_FEE_DECLARATION'||['MONTH','MONTHLY','P1M'].includes(String(fields.billingPeriod??fields.billingInterval??fields.billingDuration??fields.unitText).toUpperCase())));const displayEquivalent=equivalent.test(local)||q.includes('MONTHLY_EQUIVALENT');const duration=(!familyRecurring&&fixed.test(local))||q.some(x=>/^(FIXED_DURATION|INTRO_DURATION|TRIAL_DURATION):/.test(x))||!!fields.duration;const ordinaryAfter=(prose?.phase==='RENEWAL'||clause.postTrial||after.test(local)||/\bpuis\b/iu.test(local))&&monthly&&!clause.ambiguous;const reference=c.offerRole?.role!=='REGULAR_BASE'&&(c.promotionOrTrial==='REFERENCE_PRICE'||q.includes('REFERENCE_PRICE'));const pauseFee=/\bpause\s+(?:(?:a|the|your)\s+)?(?:monthly\s+)?membership\s+for\b/iu.test(local);const quantity=local.match(/\b([2-9]|[1-9]\d+)\s*[x×]\s*monthly\b/iu);const explicitAddon=/\badd (?:it|this) (?:as an extra|to (?:any |the |your )?(?:other )?plan)\b/iu.test(local);const excluded=pauseFee||!!quantity||explicitAddon||q.some(x=>['MONTHLY_EQUIVALENT','EXTRA_MEMBER_ADD_ON','SAVINGS_AMOUNT_NOT_CHARGE','FROM','DERIVED_DISPLAY_FIELD_UNRESOLVED'].includes(x));let type='UNRESOLVED';
 // An explicit restriction belongs to the monetary clause, or to its sole
 // monetary owner. Never inherit it across different prices/branches or cards.
 // A separately grounded post-intro amount retains its existing precedence.
 const ownerMonies=monetary(owner);
 const restrictionLocal=restrictedOffer.test(local)&&!ordinaryAfter;
 const restrictionOwner=ownerSame&&!ordinaryAfter&&c.offerRole?.role!=='POST_INTRO_REGULAR'&&c.offerRole?.role!=='REGULAR_BASE'&&ownerMonies.length===1&&ownerMonies[0].amount===c.amountNormalized&&ownerMonies[0].currencyRaw===c.currencyRaw&&restrictedOffer.test(owner);
 const promotionalRestriction=restrictionLocal||restrictionOwner;
 if(pauseFee)evidence.push({kind:'EXPLICIT_PAUSE_FEE',path:c.structuredPath,raw:local});if(quantity)evidence.push({kind:'COUNTED_MONTHLY_PRODUCT',path:c.structuredPath,raw:quantity[0],count:Number(quantity[1])});
 if(explicitAddon)evidence.push({kind:'EXPLICIT_OPTIONAL_ADDON',path:c.structuredPath,raw:local});
 if(promotionalRestriction)evidence.push({kind:'BOUND_PROMOTIONAL_RESTRICTION',path:restrictionLocal?c.structuredPath:c.qualifierPreservation.ownerPath,raw:restrictionLocal?local:owner,scope:restrictionLocal?'MONETARY_CLAUSE':'SINGLE_MONETARY_OWNER'});
 if(/^(?:promotion|promo|promocja|cena promocyjna)$/iu.test(norm(c.product))){reasons.push('CAMPAIGN_LABEL_NOT_PLAN_IDENTITY');evidence.push({kind:'CAMPAIGN_LABEL_NOT_PLAN_IDENTITY',path:c.productOwnerEvidence?.path,raw:c.product});}
 if(c.amountNormalized===null)reasons.push('NO_MONETARY_EXPRESSION');
 else if(clause.ambiguous||reasons.length)reasons.push('COMMERCIAL_CLAUSE_AMBIGUOUS');
 else if(displayEquivalent&&!annual)type='OTHER_MONETARY_OFFER';
 else if(nonrenew||paid||one)type=duration?'PREPAID_FIXED_DURATION':'ONE_TIME_NON_RENEWING';
 else if(pauseFee||quantity||explicitAddon||reference||q.includes('SAVINGS_AMOUNT_NOT_CHARGE')||q.includes('EXTRA_MEMBER_ADD_ON')||q.includes('DERIVED_DISPLAY_FIELD_UNRESOLVED'))type='OTHER_MONETARY_OFFER';
 else if(promotionalRestriction)type='INTRO_PROMOTION';
 else if(c.offerRole?.role==='TRIAL'||!ordinaryAfter&&(trial.test(local)||(c.amountNormalized==='0'&&duration)))type='TRIAL';
 else if(c.offerRole?.role==='SALE'||c.offerRole?.role==='INTRODUCTORY'||!ordinaryAfter&&(intro.test(local)||duration&&c.promotionOrTrial==='PROMOTION_OR_TRIAL'))type='INTRO_PROMOTION';
 else if(annual)type='ANNUAL_RECURRING';
 else if(familyRecurring&&/(?:minimum\s+(?:term|commitment)|engagement|minimumduur|minimumlooptijd|Mindestlaufzeit)\s*(?:of|de|van|:)?\s*\d+|\d+[- ](?:month|year|mois|maand|jaar)[^.!?]{0,25}minimum\s+(?:term|commitment)/iu.test(local+' '+(ownerSame?owner:'')))reasons.push('COMMITMENT_REQUIRES_REVIEW');
 else if(intervalEvidence.ambiguous)reasons.push('BILLING_INTERVAL_CONFLICT');
 else if(monthly&&!duration||ordinaryAfter)type='RECURRING_MONTHLY';
 else if(duration)reasons.push('DURATION_WITHOUT_BILLING_MODE');
 else reasons.push('BILLING_MODE_NOT_ESTABLISHED');
 if(type==='RECURRING_MONTHLY'&&(fields.recurring===false||fields.isRecurringProduct===false)) {type='UNRESOLVED';reasons.push('CONFLICTING_RENEWAL_SEMANTICS');}
 const priceConditions=q.filter(x=>!/^MEMBER_COUNT:/.test(x)&&!['STUDENT'].includes(x));const blockers=[...new Set([...(c.blockingReasons??[]),...reasons])];if(type!=='RECURRING_MONTHLY')blockers.push('NOT_ORDINARY_RECURRING_MONTHLY');if(excluded)blockers.push('NOT_PRINCIPAL_MONTHLY_CHARGE');
 const strong=type==='RECURRING_MONTHLY'&&!excluded&&reasons.length===0&&c.verificationLevel>=3&&!!c.product&&!c.ownershipAmbiguous&&!c.crossCardRisk&&!c.currencyAmbiguous&&!!c.currency&&c.authorityEstablished&&c.attribution?.marketApplicabilityEstablished&&['PROVIDER_DECLARED','GEO_OBSERVED','PROVIDER_AND_GEO'].includes(c.attribution.marketEvidenceType)&&!c.qualifierAmbiguous&&!c.sourceMappingAmbiguous;
 evidence.push({kind:'MONETARY_CLAUSE',path:c.structuredPath,raw:local.slice(0,6000),fields});
 const feeCalendar=pauseFee&&monthly&&!annual&&!displayEquivalent?{value:1,unit:'MONTH',normalized:'P1M',originalWording:local,path:c.structuredPath,bodyHash:c.bodyHash,recurringPresentation:true}:null;
 return {version:1,nonPrincipalRole:pauseFee?'PAUSE_FEE':explicitAddon?'OPTIONAL_ADDON':quantity?'COUNTED_MONTHLY_PRODUCT':null,quantityBasis:quantity?{count:Number(quantity[1]),unit:'MONTH',raw:quantity[0],path:c.structuredPath,bodyHash:c.bodyHash}:null,billingInterval:feeCalendar??intervalEvidence.interval??(intervalEvidence.intervals.length===1?intervalEvidence.intervals[0]:null),cadenceIntervals:intervalEvidence.intervals,cadenceFamily:feeCalendar?'MONTHLY_FAMILY':intervalEvidence.intervals.length&&intervalEvidence.intervals.every(i=>i.cadenceFamily==='MONTHLY_FAMILY')?'MONTHLY_FAMILY':null,type,ordinaryMonthly:type==='RECURRING_MONTHLY',strongRecurringMonthly:!!strong,providerPlanId,productConditions:conditions,priceConditions,monthlyEquivalentDisplay:displayEquivalent,nonRenewing:nonrenew,prepaid:paid,oneTimePayment:one,evidence:evidence.map(e=>({...e,bodyHash:c.bodyHash})),reasons:[...new Set(reasons)],monthlyBlockers:[...new Set(blockers)],recurringEvidenceMeaning:type==='RECURRING_MONTHLY'?'Explicit ordinary monthly billing presentation, absent conflicting billing semantics; not proof of customer consent':null};
}
export function classifyCommercial(c,source){const out=classifyCommercialCore(c,source);const guards=priceContextGuards(c,source);if(guards.some(g=>g.code==='ANNUAL_LABEL_MONTHLY_BASIS_UNRESOLVED')&&out.type==='RECURRING_MONTHLY'){out.type='UNRESOLVED';out.ordinaryMonthly=false;out.billingInterval=null;out.cadenceFamily=null;}if(guards.some(g=>g.code==='COMMITMENT_REQUIRES_REVIEW')){out.commitmentEvidence=guards.filter(g=>g.code==='COMMITMENT_REQUIRES_REVIEW');if(out.type==='RECURRING_MONTHLY'&&!out.billingInterval){out.billingInterval={value:1,unit:'MONTH',normalized:'P1M',originalWording:c.normalizedEvidenceSnippet,path:c.structuredPath,bodyHash:c.bodyHash,recurringPresentation:true,basis:'EXPLICIT_CALENDAR_MONTH_WITH_SEPARATE_UNRESOLVED_TERM'};out.cadenceFamily='MONTHLY_FAMILY';}}if(guards.some(g=>['COMMITMENT_REQUIRES_REVIEW','JOINING_FEE_NOT_RECURRING','FIXED_CARD_FEE_NOT_RECURRING'].includes(g.code))){out.type='UNRESOLVED';out.ordinaryMonthly=false;}if(guards.length){out.strongRecurringMonthly=false;out.reasons=[...new Set([...out.reasons,...guards.map(g=>g.code)])];out.monthlyBlockers=[...new Set([...out.monthlyBlockers,...guards.map(g=>g.code)])];out.evidence.push(...guards.map(g=>({kind:'PRICE_CONTEXT_GUARD',...g})));}if(!out.billingInterval&&out.type==='RECURRING_MONTHLY')out.billingInterval={value:1,unit:'MONTH',normalized:'P1M',originalWording:c.normalizedEvidenceSnippet??c.rawEvidenceSnippet??null,path:c.structuredPath,bodyHash:c.bodyHash,recurringPresentation:true,basis:'EXISTING_EXPLICIT_CALENDAR_MONTH_CLASSIFICATION'};if(out.billingInterval?.unit==='MONTH')out.cadenceFamily='MONTHLY_FAMILY';return out;}
export function commercialIdentity(c){return hash([c.service,c.market,c.commercial.providerPlanId?['PROVIDER_ID',c.commercial.providerPlanId]:['LABEL',norm(c.product)],c.amountNormalized,c.currency,c.commercial.type,c.commercial.priceConditions,...(c.commercial.billingInterval&&c.commercial.billingInterval.unit!=='MONTH'?[c.commercial.billingInterval.normalized]:[])]);}
export function selectMonthlyPlans(candidates){const groups=new Map();for(const c of candidates.filter(c=>c.product&&c.commercial.type==='RECURRING_MONTHLY'&&!foreignOfferForTarget(c))){const identity=c.commercial.providerPlanId?['PROVIDER_ID',c.commercial.providerPlanId]:['LABEL',norm(c.product)],key=JSON.stringify([c.service,c.market,identity]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,cs])=>{const amounts=[...new Set(cs.map(c=>JSON.stringify([c.amountNormalized,c.currency])))].sort(),terms=[...new Set(cs.map(c=>JSON.stringify([...c.commercial.priceConditions.filter(q=>/TAX_|PER_PERSON|PER_MEMBER/.test(q)),...(c.commercial.billingInterval&&c.commercial.billingInterval.unit!=='MONTH'?['BILLING_INTERVAL:'+c.commercial.billingInterval.normalized]:[])].sort())))],strong=cs.filter(c=>c.commercial.strongRecurringMonthly);return {billingInterval:cs[0].commercial.billingInterval??null,cadenceFamily:cs[0].commercial.cadenceFamily??null,billingIntervalEvidence:cs.map(c=>c.commercial.billingInterval).filter(Boolean),monthlyPlanId:'monthly-plan:'+hash(key),service:cs[0].service,market:cs[0].market,plan:cs[0].product,providerPlanId:cs[0].commercial.providerPlanId,representations:[...new Set(cs.map(c=>c.product))].sort(),amounts:amounts.map(x=>JSON.parse(x)),status:!cs[0].product?'PLAN_UNRESOLVED':amounts.length>1?'CONFLICTING_MONTHLY_AMOUNTS':terms.length>1?'CONFLICTING_MONTHLY_TERMS':strong.length?'STRONG_RECURRING_MONTHLY':'UNRESOLVED_MONTHLY_CANDIDATE',strongRecurringMonthly:!!cs[0].product&&amounts.length===1&&terms.length===1&&strong.length>0,candidateIds:cs.map(c=>c.candidateId).sort(),factIds:[...new Set(cs.map(c=>c.factId))].sort(),evidenceLevels:[...new Set(cs.map(c=>c.verificationLevel))].sort(),marketEvidenceTypes:[...new Set(cs.map(c=>c.attribution?.marketEvidenceType??'UNRESOLVED'))].sort(),productionVerified:false};});}
