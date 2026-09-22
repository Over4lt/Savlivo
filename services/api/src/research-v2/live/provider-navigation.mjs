import {priceEntries} from '../intelligence/price-entry-intent.mjs';
import {loginEntries} from '../intelligence/login-entry-intent.mjs';
import {managementInformation} from '../intelligence/management-targeting.mjs';
import {catalogObjective,capabilityDestination} from '../intelligence/login-manage.mjs';
// Navigation metadata only. No monetary interpretation, authority admission or network.
import {categoryIntent} from './research-planner.mjs';
import {sourceLinks} from './source-frontier-links.mjs';
import {normalizeFrontierUrl,semanticReasons} from './source-frontier.mjs';
const norm=s=>{try{s=decodeURIComponent(s);}catch{}return String(s).normalize('NFKD').replace(/\p{M}/gu,'').normalize('NFC').toLowerCase();};
const commercial=/(?:^|[^\p{L}\p{N}])(?:pricing|prices?|plans?|memberships?|subscribe|subscriptions?|premium|personal|individual|checkout|buy|join|packages?|tariffs?|pris|priser|abonnement(?:en|s)?|abonnemang|medlemskap|medlemskab|kjop|pakker|preise?|tarife?|mitgliedschaft|abo|pakete|prijzen|lidmaatschap|prix|tarifs?|offres|precios?|planes|suscripci[oó]n(?:es)?|membresia|precos?|planos|assinatura|subscricao|adesao|prezzi|piani|abbonament[oi]|iscriviti|cennik|cena|ceny|abonament|subskrypcja|pakiety|cenik|predplatne|clenstvi|tarify|fiyat(?:lar)?|uyelik|abonelik|paketler)(?:$|[^\p{L}\p{N}])|料金|価格|プラン|入会|月額|サブスクリプション|가격|요금|멤버십|구독|价格|定价|套餐|会员|订阅|開通|开通|ราคา|สมัครสมาชิก/iu;
export const reviewedNavigationHost=(t,url)=>t.authorities?.some(a=>a.hostname===new URL(url).hostname)??false;
export function navigationKey(url){return normalizeFrontierUrl(url).url??url;}
export function navigationRank(t,lead){
 const u=new URL(lead.url);if(!reviewedNavigationHost(t,u.href))return 100;
 const p=norm(u.pathname),label=norm(lead.label??(lead.navigationOnly?lead.title:'')??''),text=p+' '+label;
 if(catalogObjective(t)){const c=managementInformation(t,u.href,label,{loginContext:lead});return c.eligible?Math.max(0,20-c.value):100;}
 if([1,2].includes(t.smartResearch?.version)&&/login|signin|log in|sign in|my account|connexion|anmelden|logg inn|přihlášení|giriş|ログイン|로그인|เข้าสู่ระบบ|mein-konto|mon-compte|mi-cuenta|mijn-account/iu.test(text))return 60;
 if(/(?:^|[\/_-])(?:privacy|cookies?|careers|jobs|press|investors?|blog|news|logout|unsubscribe|cancel|cancellation|login|signin|account)(?:[\/_-]|$)/.test(p))return 60;
 if([1,2].includes(t.smartResearch?.version)&&(t.knownCommercialUrls??[]).some(url=>navigationKey(url)===navigationKey(lead.url)))return -2;
 if(lead.priceEntryIntent)return 0;
 if([1,2].includes(t.smartResearch?.version)&&categoryIntent(t).startsWith('MEMBERSHIP')&&/(?:clubs?|locations?|gyms?|studios?|standorte|klubber|salles|pobocky|pobočky|店舗|지점)/iu.test(text))return 10;
 if([1,2].includes(t.smartResearch?.version)&&/faq|support|help|hilfe|aide|よくある質問|자주/iu.test(text)&&commercial.test(label))return 15;
 if(/(?:^|[.\/_-])(?:help|support|faq|terms|legal)(?:[.\/_-]|$)/.test(u.hostname+' '+p))return 40;
 if(commercial.test(p)||commercial.test(label)&&!/(?:information|about|information about)/.test(label))return /(?:^|[\/_-])(?:business|enterprise|teams?|contact-sales)(?:[\/_-]|$)/.test(p)?15:[1,2].includes(t.smartResearch?.version)&&lead.navigationDepth>1?-1:0;
 return p==='/'?30:20;
}
export function navigationLocale(t,lead){
 const u=new URL(lead.url),locale=(typeof lead.locale==='string'?lead.locale:'').match(/^[a-z]{2,3}[-_]([a-z]{2})$/i)?.[1]?.toUpperCase(),region=u.pathname.match(/^\/[a-z]{2,3}-([a-z]{2})(?:\/|$)/i)?.[1]?.toUpperCase();
 // Language-only /de/ is not proof of a German market; keep unknown rather than guess.
 const hint=locale??region;return {region:hint??null,compatibility:hint?(hint===t.market?'TARGET':'FOREIGN'):'UNKNOWN'};
}
export function providerNavigation(t,body,base,{width=2,depth=0,maxBytes=2097152,maxLinks=2000}={}){
 const maxDepth=[1,2].includes(t.smartResearch?.version)?Math.min(3,Math.max(1,t.smartResearch.navigationDepth??3)):1;
 if(depth>=maxDepth||!reviewedNavigationHost(t,base))return {links:[],stops:[maxDepth===1?'ONE_HOP_OR_UNREVIEWED_PARENT':'BOUNDED_DEPTH_OR_UNREVIEWED_PARENT']};
 const scanBody=catalogObjective(t)?body:typeof body==='string'?body.replace(/<(template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,m=>' '.repeat(m.length)):body;
 const parsed=sourceLinks(scanBody,{maxBytes,maxLinks}),map=new Map();
 const prices=!catalogObjective(t)?priceEntries(body,{base,authorities:t.authorities,maxBytes,maxControls:maxLinks}):null;
 if(prices){const blocked=new Set(prices.rejected.filter(c=>!['NO_CORROBORATED_PRICE_INTENT'].includes(c.reason)).map(c=>c.reference.offset));parsed.links=parsed.links.filter(l=>l.mechanism!=='FORM_GET_READ_ONLY'&&!blocked.has(l.reference.offset));parsed.links.push(...prices.candidates.filter(c=>c.runnable).map(c=>({...c,priceEntryIntent:true})));parsed.stops.push(...prices.stops);}
 const entries=catalogObjective(t)?loginEntries(body,{base,serviceName:t.serviceName,authorities:t.authorities,maxBytes,maxControls:maxLinks}):null;
 if(entries){parsed.links.push(...entries.candidates.filter(c=>c.runnable).map(c=>({...c,label:c.label||c.accessibleName})));parsed.stops.push(...entries.stops);}
 for(const l of parsed.links){const n=normalizeFrontierUrl(l.url,base);if(!n.url||!reviewedNavigationHost(t,n.url))continue;const lead={...l,url:n.url,title:l.label},p=new URL(n.url).pathname;if(catalogObjective(t)?!capabilityDestination(n.url,l.label).eligible:semanticReasons(n.url,l.label,l.mechanism).reject)continue;
 if(/\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|mp3|css|js|zip)$/i.test(p)||/\/(?:logout|signout|delete|remove-account|unsubscribe)(?:\/|$)/i.test(p))continue;
 const locale=navigationLocale(t,lead);if(locale.compatibility==='FOREIGN')continue;
 const rank=navigationRank(t,lead),weakRelevant=rank===20&&/subscription|abonnement|billing/i.test(l.label)&&String(l.label).toLowerCase().includes(t.serviceName.toLowerCase()),context=l.mechanism==='PROVIDER_CANONICAL_OR_LOCALE';
 if(rank>15&&!weakRelevant&&!(context&&locale.compatibility==='TARGET')&&!(/(?:^|[\/_-])(?:products?|services?|offers?|packages?)(?:[\/_-]|$)/i.test(p)&&rank<40))continue;
 if(navigationKey(base)===n.url||(t.reads??[]).some(r=>[r.requestedUrl,r.url].filter(Boolean).some(url=>navigationKey(url)===n.url)))continue;
 const row={...lead,priority:rank,localeHint:locale,depth:depth+1,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false};
 const prev=map.get(n.url);if(!prev||rank<prev.priority||!catalogObjective(t)&&rank===prev.priority&&(row.score??0)>(prev.score??0))map.set(n.url,row);
 }
 const links=[...map.values()].sort((a,b)=>a.priority-b.priority||(!catalogObjective(t)?(b.score??0)-(a.score??0):0)||(a.localeHint.compatibility==='TARGET'?-1:0)-(b.localeHint.compatibility==='TARGET'?-1:0)||a.reference.offset-b.reference.offset||a.url.localeCompare(b.url));
 return {links:links.slice(0,Math.min(2,width)),considered:links.length,stops:parsed.stops,...(prices?{priceEntryCandidates:prices.candidates}:{}),...(entries?{loginEntryCandidates:entries.candidates.map(c=>({url:c.url,label:c.label,accessibleName:c.accessibleName,signals:c.signals,relationship:c.relationship,runnable:c.runnable,reason:c.reason,reference:c.reference,evidenceStatus:'DISCOVERY_LEAD_ONLY'}))}: {})};
}
