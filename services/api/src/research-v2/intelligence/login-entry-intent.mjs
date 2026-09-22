import {unreviewedRedirectParameter} from '../live/navigation-redirect-policy.mjs';
// Navigation intent only. Never imports an evidence verifier, transport, or authority mutator.
import {decodeEntities} from '../live/source-frontier-links.mjs';
export const normalizeLoginText=s=>decodeEntities(String(s??'')).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[‐‑–—_-]/g,' ').replace(/\s+/g,' ').trim();
const families={
 LOGIN:['login','log in','sign in','signin','se connecter','connexion','logg inn','logga in','log ind','anmelden','einloggen','iniciar sesión','entrar','iniciar sessão','accedi','inloggen','zaloguj się','přihlásit se','přihlášení','giriş yap','autentificare','σύνδεση','ログイン','로그인','登录','登入','เข้าสู่ระบบ','đăng nhập','masuk','log masuk','kirjaudu sisään','تسجيل الدخول','התחברות','लॉग इन','mag sign in'],
 PERSONAL_ACCOUNT:['my account','your account','customer account','subscriber account','user account','mon compte','espace membre','espace client','min side','min konto','mitt konto','mina sidor','mein konto','mi cuenta','área de clientes','minha conta','área de cliente','il mio account','area clienti','mijn account','mijn omgeving','moje konto','můj účet','hesabım','contul meu','ο λογαριασμός μου','マイページ','アカウント','내 계정','我的账户','我的帳戶','บัญชีของฉัน','tài khoản của tôi','akun saya','akaun saya','oma tili','حسابي','החשבון שלי','मेरा खाता','aking account'],
 MEMBER:['member login','member account','member area','members area','member zone','my membership','your membership','mitt medlemskap','mit medlemskab','mitgliederbereich','会員ログイン','회원 로그인','會員登入'],
 SELF_SERVICE:['customer portal','member portal','subscriber portal','self service','customer centre','customer center','service centre','service center']
};
const entries=Object.entries(families).flatMap(([family,terms])=>terms.map(s=>({family,text:normalizeLoginText(s)})));
const weak=/^(?:account|profile|dashboard|portal|member|members|membership|subscription|subscriptions|billing|plan|plans|medlem|会員|회원)$/u;
const excluded=/(?:^|[^\p{L}\p{N}])(?:admin(?:istrator)?|staff|employee|partner|merchant|vendor|developer|affiliate|press|career\w*|franchise|business|enterprise|reseller|cms|wordpress|wp login|support agent|blog author|cookie\w*|privacy|newsletter|advertis\w*|email preferences|logout|log out|signout|sign out|unsubscribe|delete|reset password|password reset|forgot password|forgot login|espace pro|professionnel|entreprise|mitarbeiter|geschaftskunden|zakelijk|empresas|oauth|authorize|callback)(?:$|[^\p{L}\p{N}])/u;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const phraseCache=new Map();
const phrase=(text,term)=>{let re=phraseCache.get(term);if(!re){re=new RegExp('(?:^|[^\\p{L}\\p{N}])'+escape(term)+'(?:$|[^\\p{L}\\p{N}])','u');if(phraseCache.size<4096)phraseCache.set(term,re);}return re.test(text);};
const attributes=s=>Object.fromEntries([...s.matchAll(/([\w:-]{1,128})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decodeEntities(m[2]??m[3]??m[4])]));
const plain=s=>decodeEntities(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();

export function loginIntent(lead,{base=null,serviceName='',authorities=[]}={}){
 let u;try{u=lead.url?new URL(lead.url,base??undefined):null;}catch{return {candidate:false,reason:'INVALID_URL',score:0};}
 let pathname='';try{pathname=decodeURIComponent(u?.pathname??'');}catch{return {candidate:false,reason:'INVALID_PATH',score:0};}
 const label=normalizeLoginText(lead.label),metadata=normalizeLoginText(lead.accessibleName),text=[label,metadata].filter(Boolean).join(' '),context=normalizeLoginText(lead.context),urlText=normalizeLoginText((u?.hostname??'')+' '+pathname+' '+(u?.search??'')).replace(/[/.?=&]+/g,' ');
 const reject=reason=>({candidate:false,reason,score:0,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false});
 if(u&&(u.protocol!=='https:'||u.username||u.password||u.port)||lead.inForm||excluded.test(text+' '+urlText+' '+context))return reject('UNSAFE_OR_NONCONSUMER_CONTROL');
 if(/(?:vpn|proxy|serveur|server|wi fi|wifi|bluetooth)/.test(text)&&!/(?:account|compte|konto)/.test(text))return reject('NETWORK_CONNECTION_NOT_ACCOUNT_ENTRY');
 if(/[?？]/.test((lead.label??'')+' '+(lead.accessibleName??'')))return reject('QUESTION_NOT_ENTRY_CONTROL');
 if(u&&unreviewedRedirectParameter(u.href,authorities.filter(a=>a.provider===serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType)).map(a=>'https://'+a.hostname)))return reject('UNREVIEWED_REDIRECT_DESTINATION');
 if(u&&/\.(?:js|css|png|jpe?g|svg|pdf|zip|mp4)$/i.test(pathname))return reject('ASSET');
 let parent;try{parent=base?new URL(base):null;}catch{}
 const reviewed=!!u&&authorities.some(a=>a.hostname===u.hostname&&a.provider===serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType));
 const parentReviewed=!!parent&&authorities.some(a=>a.hostname===parent.hostname&&a.provider===serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType));
 const root=parent?.hostname.replace(/^www\./,'');
 // Suffix relation is only a retained relationship hint, never a new authority.
 const related=parentReviewed&&!!u&&(u.hostname===root||u.hostname.endsWith('.'+root));
 if(u&&!reviewed&&!related)return reject('EXTERNAL_UNVERIFIED_IDENTITY');
 if(/(?:^|\/)(?:checkout|register|registration|onboarding|purchase)(?:\/|$)/i.test(pathname))return reject('NON_ENTRY_ACCOUNT_WORKFLOW');
 const signals=[],matched=entries.find(e=>phrase(text,e.text));if(matched)signals.push(matched.family);
 const brand=normalizeLoginText(serviceName);
 if(brand.length>=2&&[label,metadata].some(x=>['my '+brand,'my '+brand+' account',brand+' account',brand+' login',brand+' member',brand+' membership'].includes(x)))signals.push('PERSONAL_BRAND_COMPOSITION');
 const entryLeaf=/(?:^|\/)(?:log-?in|sign-?in|my-?account|accounts?|members?|customer|subscriber|portal|profile|dashboard|auth|authentication|identity|sso)\/?$/i.test(pathname);
 const pathSignal=entryLeaf||/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:my-?account|accounts?)\/(?:settings|overview|profile|subscriptions?)\/?$/i.test(pathname),hostSignal=/^(?:login|accounts?|auth|identity|id|my|members?)\./i.test(u?.hostname??'')&&(/^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/i.test(pathname)||entryLeaf||!!matched);
 if((!matched&&(/(?:^|[ /])(?:signup|sign up|register|registration|onboarding|checkout|buy|join|offers?)(?:$|[ /])/.test(normalizeLoginText(pathname+' '+text).replace(/\//g,' '))))||matched?.family!=='LOGIN'&&/cancel|pause|renew|upgrade|downgrade/.test(text))return reject('NON_ENTRY_ACCOUNT_WORKFLOW');
 const navigationContext=/header|nav|account|utility|menu/.test(context);
 if(pathSignal)signals.push('URL_INTENT');if(hostSignal)signals.push('HOST_INTENT');
 if(weak.test(text)&&navigationContext)signals.push('ACCOUNT_CONTROL_CONTEXT');
 if(!signals.length)return reject(weak.test(text)?'AMBIGUOUS_WITHOUT_CONTEXT':'NO_LOGIN_INTENT');
 const transportBlocked=!!u&&/(?:^|\/)(?:login|signin|servicelogin|oauth|authorize)(?:\/|$)/i.test(pathname);
 const genericLabel=[label,metadata].every(x=>!x||/^(?:open|menu|account|profile|dashboard|portal|user|person|go|click here)$/.test(x));
 const concise=text.split(/\s+/).length<=12;
 const contextualPath=!/(?:^|\/)(?:features?|news|blog|articles?|artikler|cancel-membership)(?:\/|$)/i.test(pathname);
 const strong=concise&&contextualPath&&(!!matched||signals.includes('PERSONAL_BRAND_COMPOSITION')||(pathSignal||hostSignal)&&genericLabel);
 const samePage=!!parent&&!!u&&u.origin===parent.origin&&u.pathname===parent.pathname&&u.search===parent.search;
 const reason=!strong?'AMBIGUOUS_ACCOUNT_CONTEXT_REQUIRES_CORROBORATION':samePage?'SAME_PAGE_CONTROL':!u?'CONTROL_WITHOUT_DESTINATION':!reviewed?'PROVIDER_LINKED_HOST_REQUIRES_AUTHORITY_REVIEW':transportBlocked?'EXISTING_AUTHENTICATION_TRANSPORT_POLICY':'REVIEWED_PUBLIC_NAVIGATION';
 return {candidate:true,strength:strong?'STRONG':'SUPPORTING',signals,score:(matched||signals.includes('PERSONAL_BRAND_COMPOSITION')?18:14)+(navigationContext?1:0),label:lead.label??'',accessibleName:lead.accessibleName??'',url:u?.href??null,relationship:reviewed?'EXACT_REVIEWED':related?'PROVIDER_LINKED_SUBDOMAIN':'NO_DESTINATION',runnable:strong&&!!u&&reviewed&&!transportBlocked&&!samePage,reason,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false};
}

export function loginEntries(body,{base,serviceName,authorities=[],maxBytes=2097152,maxControls=2000}={}){
 if(typeof body!=='string'||Buffer.byteLength(body)>maxBytes)return {candidates:[],rejected:[],stops:['SOURCE_SCAN_BYTE_LIMIT']};
 // Bound source scanning; preserve original UTF-16 locators. No JS execution or visual inference.
 const visible=body.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,m=>' '.repeat(m.length));
 const ids=new Map();for(const m of visible.matchAll(/<([\w:-]+)\b([^>]{0,3000})>([^<]{1,300})<\/\1\s*>/gi)){const a=attributes(m[2]);if(a.id&&!ids.has(a.id))ids.set(a.id,plain(m[3]));if(ids.size>=2000)break;}
 const candidates=[],rejected=[],stack=[];let controls=0;
 const tags=/<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
 for(const m of visible.matchAll(tags)){
  const tag=m[1].toLowerCase(),closing=m[0].startsWith('</');
  if(['header','nav','footer','form'].includes(tag)){if(closing){const i=stack.lastIndexOf(tag);if(i>=0)stack.splice(i);}else stack.push(tag);continue;}
  if(closing||!['a','button'].includes(tag))continue;if(++controls>maxControls)return {candidates,rejected,stops:['CONTROL_SCAN_LIMIT']};
  const a=attributes(m[0]),tail=visible.slice(m.index+m[0].length,m.index+6000),end=new RegExp('</'+tag+'\\s*>','i').exec(tail),inner=end?tail.slice(0,end.index):'',label=plain(inner).slice(0,300);
  const nested=[...inner.matchAll(/<(?:img|svg|button)\b[^>]*>/gi)].map(x=>attributes(x[0])).flatMap(a=>[a['aria-label'],a.alt,a.title]).filter(Boolean);
  const svgTitle=[...inner.matchAll(/<title\b[^>]*>([^<]{1,300})<\/title\s*>/gi)].map(x=>x[1]);
  const accessibleName=[a['aria-label'],...(a['aria-labelledby']??'').split(/\s+/).map(id=>ids.get(id)),a.title,...nested,...svgTitle].filter(Boolean).join(' ').slice(0,600);
  // Buttons are discoverable controls, never clicked; only anchors with href yield destinations.
  const lead={url:tag==='a'?a.href:null,label,accessibleName,context:stack.join(' '),inForm:stack.includes('form'),mechanism:'LOGIN_NAVIGATION',reference:{offset:m.index,length:m[0].length,coordinate:'UTF16_CODE_UNITS'}};
  const intent=loginIntent(lead,{base,serviceName,authorities});const row={...lead,...intent};if(intent.candidate)candidates.push(row);else rejected.push({reference:lead.reference,label,reason:intent.reason});
 }
 const dedup=new Map();for(const c of candidates){const key=c.url??'control:'+c.reference.offset,old=dedup.get(key);if(!old||c.score>old.score)dedup.set(key,c);}
 return {candidates:[...dedup.values()].sort((a,b)=>b.score-a.score||a.reference.offset-b.reference.offset),rejected,stops:[]};
}
