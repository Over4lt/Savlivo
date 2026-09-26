import {evaluateServiceAdmission} from './service-admission.mjs';
// Shadow catalog contracts. Capabilities are provider facts; price strategy is a product decision.
import {createHash} from 'node:crypto';
import {sourceLinks,decodeEntities} from '../live/source-frontier-links.mjs';
const login=/^(?:log\s?in|sign\s?in|my account|member login|member area|logg inn|logga in|min side|mina sidor|mein konto|anmelden|connexion|mon compte|iniciar sesi[oó]n|mi cuenta|minha conta|accedi|mijn account|přihlášení|giriş yap|ログイン|マイページ|로그인|เข้าสู่ระบบ)$/iu;
const management=/(?:manage (?:your |my )?(?:subscription|membership|billing)|change (?:your |my )?(?:plan|membership)|subscription settings|billing settings|administrer (?:ditt |dit )?abonnement|hantera (?:din |ditt )?(?:prenumeration|abonnemang|medlemskap)|abonnement verwalten|mitgliedschaft verwalten|gérer (?:votre |mon )?abonnement|gestionar (?:tu |mi )?suscripci[oó]n|gestisci (?:il tuo )?abbonamento|abonnement beheren|předplatné spravovat|aboneliğinizi yönetin|サブスクリプションを管理|契約内容の確認|구독 관리|จัดการการสมัครสมาชิก)/iu;
const account=/\b(?:account|online|website|web site|log in|sign in|konto|min side|mina sidor|compte|cuenta|conta)\b|マイページ|アカウント|계정/iu;
const unsafe=/\b(?:cannot|can't|not available|unable|not possible|business|employee|staff|administrators?|admins?|organization|enterprise|partner portal|email us|call us|contact support|mobile app|in the app|app only|app store|google play|in-app|apple account)\b/iu;
export function capabilityTextAllowed(text,{anchor=false}={}){return !unsafe.test(text)&&!/[?？]/.test(text)&&(!anchor||(text.length<=100&&!/^how to\b/i.test(text.trim())));}
export function inspectCatalogCapabilities({body,sourceHash,url,service,authorityEstablished=false}){
 const result={service,login:[],management:[],sourceHash,url,priceRequired:false};
 if(!authorityEstablished||typeof body!=='string'||createHash('sha256').update(body).digest('hex')!==sourceHash)return {...result,status:'UNRESOLVED',reason:'UNBOUND_PROVIDER_SOURCE'};
 for(const l of sourceLinks(body).links){if(l.mechanism!=='ANCHOR'||unsafe.test(l.label))continue;let dest;try{dest=new URL(l.url,url);if(dest.protocol!=='https:')continue;}catch{continue;}
 const proof={sourceHash,url,locator:l.reference,providerText:l.label,destination:dest.href,meaning:'PROVIDER_PUBLISHED_CAPABILITY_LINK_NOT_DESTINATION_AUTHORITY'};
 if(login.test(l.label.trim()))result.login.push(proof);
 // An explicit management link is a capability, not proof that the linked domain is provider-owned.
 if(management.test(l.label)&&capabilityTextAllowed(l.label,{anchor:true}))result.management.push(proof);
 }
 // Preserve offsets in the original body; never use scripts, comments or JSON strings as visible claims.
 const visible=body.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,m=>' '.repeat(m.length));
 for(const m of visible.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)){
 const text=decodeEntities(m[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
 if(text.length>650||!capabilityTextAllowed(text)||!management.test(text)||!account.test(text))continue;
 result.management.push({sourceHash,url,locator:{offset:m.index,length:m[0].length,coordinate:'UTF16_CODE_UNITS'},providerText:text,meaning:'EXPLICIT_ONLINE_ACCOUNT_MANAGEMENT_STATEMENT'});
 }
 return {...result,status:result.login.length&&result.management.length?'ESTABLISHED':'UNRESOLVED'};
}
export function catalogProductPolicy(service,{capabilities=[],confidence='NONE',variablePrice=false,admissionEvidence=[],admissionOptions={}}={}){
 const bound=capabilities.filter(c=>c.service===service.slug),login=bound.flatMap(c=>c.login??[]),management=bound.flatMap(c=>c.management??[]),established=login.length>0&&management.length>0;
 const serviceAdmission=evaluateServiceAdmission(service.slug,admissionEvidence,admissionOptions),eligible=serviceAdmission.status==='ESTABLISHED'&&service.disposition!=='EXCLUDE';
 return {service:service.slug,catalogEligible:eligible,serviceAdmission,researchEligible:service.disposition!=='EXCLUDE',catalogBasis:eligible?'FOUR_DIMENSION_SERVICE_ADMISSION':'SERVICE_ADMISSION_EVIDENCE_PENDING',loginManageStatus:established?'ESTABLISHED':'UNRESOLVED',readyForNewCatalogPublication:eligible,pricingExposure:eligible?'ADMITTED_SERVICE_PRICING':'RESEARCH_HYPOTHESIS_ONLY',loginEvidence:login,managementEvidence:management,priceStrategy:variablePrice?'USER_PRICE_PREFERRED':['HIGH','MEDIUM'].includes(confidence)?'SUGGESTED_PRICE':'MANUAL_ONLY',priceConfidence:confidence,providerPriceRequired:false,manualActualPriceAllowed:true,userPriceAuthoritative:true,automaticUserPriceReplacement:false,nationalDefaultFromScopedPrice:false,productionPromoted:false};
}
// Reuse the repository's already-reviewed web capability register. Cancellation is not required.
export function reviewedWebCapabilities(row,{registerPath,registerHash}){
 const base={service:row.serviceSlug,login:[],management:[],status:'UNRESOLVED',sourceKind:'REVIEWED_CAPABILITY_REGISTER'};
 if(!registerPath||!registerHash||!row.verifiedAt||row.manageWeb?.status!=='VERIFIED'||!row.manageWeb.evidenceUrl)return base;
 const proof={registerPath,registerHash,locator:row.serviceSlug,reviewedAt:row.verifiedAt,evidenceUrl:row.manageWeb.evidenceUrl,url:row.manageWeb.url,reviewedPath:row.manageWeb.path??null,markets:row.markets,scope:row.scope};
 // An existing reviewed web signup plus management flow, or an explicit account-management path,
 // supports a personal web account. Do not use cancelWeb status or provider-price presence.
 const personal=row.startWeb?.status==='VERIFIED'||/account|sign in|log in|profile/i.test(row.manageWeb.path??'');
 return {...base,login:personal?[{...proof,meaning:'REVIEWED_WEB_ACCOUNT_FLOW'}]:[],management:[{...proof,meaning:'REVIEWED_WEB_MANAGEMENT_FLOW'}],status:personal?'ESTABLISHED':'UNRESOLVED'};
}
