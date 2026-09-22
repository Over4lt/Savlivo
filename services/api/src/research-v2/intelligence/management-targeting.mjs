import {loginIntent} from './login-entry-intent.mjs';
// Routing interpretation only. Classes and priors never establish provider capabilities.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {capabilityDestination,eligibilityState} from './login-manage.mjs';
const normalize=s=>{try{s=decodeURIComponent(s);}catch{}return String(s??'').normalize('NFKD').replace(/\p{M}/gu,'').normalize('NFC').toLowerCase().replace(/[_/.-]+/g,' ');};
const concepts=[
 ['CANCELLATION',/\b(?:cancel(?:lation)?|kundig\w*|kuendig\w*|resili\w*|opzeg\w*|zrus\w*|iptal|avslut\w*|si opp|disdire|annull\w*)\b|解約|취소|ยกเลิก/u],
 ['PAUSE_FREEZE',/\b(?:pause|freeze|frys\w*|paus\w*|suspend\w*)\b/u],
 ['PLAN_MANAGEMENT',/\b(?:upgrade|downgrade|change plan|change membership|manage subscription|manage membership|plan management|endre medlemskap|hantera medlemskap|verwalten|abonnement beheren)\b|契約内容|구독 관리/u],
 ['BILLING',/\b(?:billing|facturation|rechnung\w*|faktur\w*|abbrechnung)\b/u],
 ['PAYMENT',/\b(?:payment|zahlung\w*|paiement|betal\w*|pago|platb\w*)\b/u],
 ['RENEWAL',/\b(?:renew\w*|renouvel\w*|forny\w*|verlang\w*)\b/u],
 ['SETTINGS',/\b(?:settings|instellingen|einstellungen|innstillinger|installningar|nastaveni)\b|設定|설정/u],
 ['HELP_SUPPORT',/\b(?:help|support|faq|hilfe|aide|ayuda|kundeservice|kundservice|pomoc|destek)\b|よくある質問|ヘルプ|고객센터/u],
 ['SUBSCRIPTION',/\b(?:subscription\w*|abonnement\w*|abonnemang\w*|suscripcion\w*|assinatura|abbonamento|predplatne|abonelik)\b|サブスクリプション|구독/u],
 ['MEMBERSHIP',/\b(?:membership\w*|medlems\w*|mitglied\w*|lidmaatschap|clenstvi|uyelik)\b|会員|멤버십/u],
 ['ACCOUNT',/\b(?:account|konto|compte|cuenta|conta|my page|min side|mina sidor)\b|マイページ|アカウント|계정/u]
];
export function managementDestination(url,label=''){
 let u;try{u=new URL(url);}catch{return {classes:[],managementRelevant:false,eligible:false,value:0};}
 const base=capabilityDestination(url,label),text=normalize(u.hostname+' '+u.pathname+' '+label),classes=concepts.filter(([,re])=>re.test(text)).map(([c])=>c);
 const authentication=/\b(?:login|log in|sign in|signin|connexion|anmelden)\b|ログイン|로그인/.test(text),marketing=/\b(?:pricing|prices|join|signup|sign up|bli medlem|buy|offers|offres|checkout|subscribe now|premium plans)\b/.test(text)&&!classes.includes('HELP_SUPPORT');
 const strong=classes.some(c=>['CANCELLATION','PAUSE_FREEZE','PLAN_MANAGEMENT','BILLING','PAYMENT','RENEWAL','SETTINGS'].includes(c));
 return {...base,classes,authentication,marketing,managementRelevant:base.eligible&&!marketing&&(strong||classes.includes('HELP_SUPPORT')),strongManagement:base.eligible&&!marketing&&strong,primaryClass:classes[0]??(marketing?'MARKETING':authentication?'LOGIN':'GENERAL')};
}
export function missingCatalogFields(t){
 const proofs=(t.catalogCapabilityProofs??[]).filter(p=>p.scope?.market===t.market),state=eligibilityState(t.service,proofs);
 if(state.status==='LOGIN_MANAGE_ESTABLISHED'||t.loginManageEstablished)return [];
 if(state.status==='LOGIN_ONLY_ESTABLISHED')return ['WEB_MANAGEMENT'];if(state.status==='MANAGE_ONLY_ESTABLISHED')return ['LOGIN'];
 // Persisted objective gaps guide routing only, never admission.
 return t.gaps?.length&&t.gaps.every(x=>['LOGIN','WEB_MANAGEMENT'].includes(x))?t.gaps:['LOGIN','WEB_MANAGEMENT'];
}
export function managementInformation(t,url,label='',{history=[],loginContext=null}={}){
 const d=managementDestination(url,label),missing=missingCatalogFields(t),managementOnly=missing.length===1&&missing[0]==='WEB_MANAGEMENT',loginOnly=missing.length===1&&missing[0]==='LOGIN';let value=d.value;
 if(!missing.length)return {...d,eligible:false,value:0,informationGain:0,reason:'CATALOG_FIELDS_SUFFICIENT',missing};
 if(d.eligible){if(managementOnly)value=d.strongManagement?14:d.classes.includes('HELP_SUPPORT')?10:d.classes.some(c=>['SUBSCRIPTION','MEMBERSHIP'].includes(c))&&!d.marketing?3:0;else if(loginOnly)value=d.classes.includes('ACCOUNT')||d.authentication?12:d.classes.includes('HELP_SUPPORT')?8:1;else value=d.strongManagement?12:d.classes.includes('HELP_SUPPORT')?9:d.classes.includes('ACCOUNT')?7:d.marketing?1:d.value;}
 // Login navigation is independent of capability admission. Preserve management-only routing.
 const entry=loginIntent({...((loginContext??(t.leads??[]).find(l=>l.url===url))??{}),url,label},{serviceName:t.serviceName,authorities:t.authorities});
 if(!managementOnly&&d.eligible){
  if(['UNSAFE_OR_NONCONSUMER_CONTROL','EXTERNAL_UNVERIFIED_IDENTITY'].includes(entry.reason))value=0;
  else if(entry.candidate&&entry.runnable)value=Math.max(value,entry.score);
  else if(loginOnly&&(d.authentication||d.classes.includes('ACCOUNT')))value=1;
 }
 const learned=history.some(a=>a.fieldsEstablished?.includes('WEB_MANAGEMENT')&&a.destinationClasses?.some(c=>d.classes.includes(c)));if(value>0&&learned)value+=1;
 const seen=(t.reads??[]).filter(r=>{try{return new URL(r.requestedUrl).href===new URL(url).href;}catch{return false;}}).length;
 return {...d,eligible:d.eligible&&value>0,value,informationGain:value,relativeCost:1,missing,reason:managementOnly?(value?'RESOLVE_MISSING_WEB_MANAGEMENT':'REDUNDANT_LOGIN_OR_LOW_VALUE_MARKETING'):loginOnly?'RESOLVE_MISSING_LOGIN':'RESOLVE_CATALOG_FIELDS',prior:{basis:'EXPLICIT_MANAGEMENT_CLASSES_BEFORE_GENERIC_ACCOUNT',class:d.primaryClass,validatedClassSuccessPrior:learned},previousReads:seen};
}
function intact(ref){try{const f=path.resolve(ref?.path??'');return f.startsWith(process.cwd()+path.sep)&&!fs.lstatSync(f).isSymbolicLink()&&createHash('sha256').update(fs.readFileSync(f)).digest('hex')===(ref.hash??ref.sha256);}catch{return false;}}
// Import an already-reviewed registry, not a subdomain-name heuristic. Retain exact binding proof.
export function enrichManagementTargets(t,{domains=[],leads=[],registryReference}={}){
 if(t.researchObjective!=='CATALOG_ONLY'||!intact(registryReference))return {...t,managementRegistryRejected:true};
 const valid=domains.filter(d=>d.service===t.service&&d.provider===t.serviceName&&d.validated===true&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(d.role)&&d.reference&&intact(d.reference));
 const imported=valid.flatMap(d=>{let data;try{data=JSON.parse(fs.readFileSync(d.reference.path));}catch{return [];}const original=(data.targets??[]).filter(x=>x.service===t.service&&(!d.reference.targetId||x.id===d.reference.targetId)).flatMap(x=>x.authorities??[]).find(a=>a.hostname===d.hostname&&a.provider===d.provider&&a.checkedAt&&a.sourceType===d.role);return original?[{...original,managementAuthorityReference:{registryReference,binding:d.reference}}]:[];});
 const authorities=[...new Map([...(t.authorities??[]),...imported].map(a=>[a.hostname,a])).values()];
 const combined=[...(t.leads??[]),...leads].filter(l=>{try{return authorities.some(a=>a.hostname===new URL(l.url).hostname);}catch{return false;}}),dedup=[...new Map(combined.map(l=>[l.url,l])).values()];
 return {...t,authorities,leads:dedup,urls:[...new Set([...(t.urls??[]),...dedup.map(l=>l.url)])],managementRegistryReference:registryReference};
}

export function catalogRouteOutcome(t,r){if(t.researchObjective!=='CATALOG_ONLY')return {};const d=managementDestination(r.url??r.requestedUrl);const p=(t.catalogCapabilityProofs??[]).filter(p=>p.sourceHash===r.bodyHash&&p.scope?.market===t.market);const state=eligibilityState(t.service,p),fieldsEstablished=[];if(['LOGIN_ONLY_ESTABLISHED','LOGIN_MANAGE_ESTABLISHED'].includes(state.status))fieldsEstablished.push('LOGIN');if(['MANAGE_ONLY_ESTABLISHED','LOGIN_MANAGE_ESTABLISHED'].includes(state.status))fieldsEstablished.push('WEB_MANAGEMENT');return {destinationClasses:d.classes,fieldsEstablished,meaning:'ROUTING_CLASS_HISTORY_NOT_CAPABILITY_ADMISSION'};}
