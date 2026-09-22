// Bounded navigation hypotheses only. No price interpretation, authority grants or executable JS.
import {decodeEntities} from '../live/source-frontier-links.mjs';
import {normalizeFrontierUrl} from '../live/source-frontier.mjs';
import {unreviewedRedirectParameter} from '../live/navigation-redirect-policy.mjs';
export const normalizePriceIntent=s=>decodeEntities(String(s??'')).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[_\-/]+/g,' ').replace(/\s+/g,' ').trim();
const terms=['price','prices','pricing','rates','fees','plans','plan','packages','tiers','membership','memberships','subscription','subscriptions','subscribe','pris','priser','abonnement','abonnements','abonnemang','medlemskap','medlemskab','preis','preise','tarife','mitgliedschaft','abo','prix','tarifs','adhésion','precio','precios','planes','suscripción','membresía','prezzo','prezzi','piani','abbonamento','abbonamenti','preço','preços','planos','assinatura','prijs','prijzen','lidmaatschap','cennik','abonament','ceník','předplatné','fiyat','üyelik','abonelik','preturi','abonamente','hinnat','tilaus','τιμές','συνδρομές','harga','langganan','pelan','presyo','料金','価格','プラン','会員','요금','구독','멤버십','价格','定价','套餐','會員','会员','订阅','ราคา','สมัครสมาชิก','bảng giá','gói','اشتراك','الأسعار','מחירים','מנוי','कीमत','सदस्यता'].map(normalizePriceIntent);
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const words=terms.map(t=>new RegExp(/[\u3040-\u30ff\u3400-\u9fff\u0e00-\u0e7f]/u.test(t)?escape(t):'(?:^|[^\\p{L}\\p{N}])'+escape(t)+'(?:$|[^\\p{L}\\p{N}])','u'));
const has=s=>{const n=normalizePriceIntent(s);return words.some((re,i)=>terms[i]==='goi'?/^(?:goi|cac goi|goi dang ky)$/.test(n):re.test(n));};
const negative=/(?:^|[^\p{L}\p{N}])(?:account|settings|register|registration|signup|verification|artikler|nyheter|newsletter|privacy|cookies?|legal|terms|blog|news|press|investors?|careers?|jobs|compensation|business|enterprise|teams|advertising|advertiser|partner|merchant|developer|api|affiliate|commission|shipping|roaming|hardware|gift(?:s|card)?|merchandise|cancel(?:lation)?|refund|price change|historical|announcement|promotion article|oauth|authorize|logout|signin|login|reset|delete)(?:$|[^\p{L}\p{N}])/u;
export function priceIntent(lead,{base,authorities=[]}={}){
 const n=normalizeFrontierUrl(lead.url,base),no=reason=>({candidate:false,reason});if(!n.url)return no(n.reason);
 let decoded;try{decoded=decodeURIComponent(new URL(n.url).pathname);}catch{return no('INVALID_ENCODING');}
 const u=new URL(n.url),text=normalizePriceIntent([lead.label,lead.accessibleName].filter(Boolean).join(' ')),p=normalizePriceIntent(decoded),context=normalizePriceIntent(lead.context);
 if(/(?:^|\/)(?:account|billing|download|downloads|watch|episodes?|videos?|genres?|guidance)(?:\/|$)/i.test(u.pathname)||negative.test(text+' '+p+' '+context+' '+normalizePriceIntent(u.search))||/\.(?:pdf|js|css|png|svg|zip|mp4)$/i.test(u.pathname)||lead.inForm||lead.hidden)return no('NONCONSUMER_EDITORIAL_ACTION_OR_INERT');
 if(unreviewedRedirectParameter(u.href,authorities.map(a=>'https://'+a.hostname)))return no('UNREVIEWED_REDIRECT');
 const path=decoded.split('/').some(segment=>terms.includes(normalizePriceIntent(segment))),label=has(text),host=/^(?:pricing|plans|membership|subscriptions)\./i.test(u.hostname),weak=/^(?:join(?: now)?|get started|see options|compare options|choose|start now|become a member)$/i.test(text),ctx=has(context);
 if(/\b(?:how|why|when)\b|[?？]/u.test(text))return no('QUESTION_NOT_PLAN_ENTRY');
 if(/(?:^|[.\/_-])(?:help|helpx|support|faq|articles?|hc)(?:[.\/_-]|$)/i.test(u.hostname+u.pathname))return no('NO_CORROBORATED_PRICE_INTENT');
 if(!path&&!label&&!host&&!(weak&&ctx))return no(weak?'UNCORROBORATED_PURCHASE_CTA':'NO_CORROBORATED_PRICE_INTENT');
 if(!path&&/information|about/.test(text))return no('NO_CORROBORATED_PRICE_INTENT');
 if(/\b(?:how|why|when)\b|[?？]/u.test(text))return no('QUESTION_NOT_PLAN_ENTRY');
 const same=new URL(base);if(u.href===same.href||u.origin===same.origin&&u.pathname===same.pathname&&u.search===same.search)return no('SAME_PAGE');
 const reviewed=authorities.some(a=>a.hostname===u.hostname),signals=[...(label?['TEXT_INTENT']:[]),...(path?['PATH_INTENT']:[]),...(host?['HOST_INTENT']:[]),...(weak&&ctx?['CONTEXTUAL_SELECTION']:[]),...(lead.accessibleName?['ACCESSIBLE_NAME']:[])];
 return {candidate:true,url:n.url,signals,score:(label?20:0)+(path?16:0)+(host?8:0)+(weak&&ctx?15:0)+(/header|nav|menu/.test(context)?2:0),runnable:reviewed,relationship:reviewed?'EXACT_REVIEWED':u.hostname.endsWith('.'+same.hostname.replace(/^www\./,''))?'PROVIDER_LINKED_SUBDOMAIN_UNREVIEWED':'EXTERNAL_UNREVIEWED',reason:reviewed?'REVIEWED_NAVIGATION':'DESTINATION_AUTHORITY_REVIEW_REQUIRED',evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false};
}
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m=>[m[1].toLowerCase(),decodeEntities(m[2]??m[3]??m[4]??'')]));
const plain=s=>decodeEntities(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function priceEntries(body,{base,authorities=[],maxBytes=2097152,maxControls=2000}={}){
 if(typeof body!=='string'||Buffer.byteLength(body)>maxBytes)return {candidates:[],rejected:[],stops:['SOURCE_SCAN_BYTE_LIMIT']};
 const html=body.replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,m=>' '.repeat(m.length)),stack=[],nodes=[],voids=new Set(['input','img','br','hr','meta','link','source','wbr']);let tokens=0,last=0;
 for(const m of html.matchAll(/<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)){
  if(++tokens>50000)return {candidates:[],rejected:[],stops:['TAG_SCAN_LIMIT']};if(stack.length)stack.at(-1).text+=html.slice(last,m.index);last=m.index+m[0].length;const tag=m[1].toLowerCase();
  if(m[0].startsWith('</')){const i=stack.findLastIndex(n=>n.tag===tag);if(i>=0)while(stack.length>i){const n=stack.pop();n.closed=true;if(stack.length)stack.at(-1).text+=' '+n.text;}continue;}
  const a=attrs(m[0].slice(tag.length+1,-1)),parent=stack.at(-1),n={tag,a,text:'',parent,offset:m.index,length:m[0].length,hidden:parent?.hidden||'hidden'in a||'inert'in a||a['aria-hidden']==='true'||/display\s*:\s*none/.test(a.style??''),inForm:tag==='form'||parent?.inForm};nodes.push(n);if(!voids.has(tag)&&!m[0].endsWith('/>'))stack.push(n);
 }
 const headings=new Map();for(const h of nodes)if(/^h[1-6]$/.test(h.tag)){const a=headings.get(h.parent)??[];a.push(plain(h.text).slice(0,120));headings.set(h.parent,a);}
 const ids=new Map(nodes.filter(n=>n.a.id&&!n.hidden).map(n=>[n.a.id,plain(n.text)])),candidates=[],rejected=[];let scanned=0;
 for(const n of nodes){const a=n.a;if(!['a','button'].includes(n.tag)&&!['link','button'].includes(a.role)&&!a.routerlink&&!a['router-link'])continue;if(++scanned>maxControls)break;
  let url=a.href??a.routerlink??a['router-link']??a['data-href']??a['data-url'];if(!url&&a.onclick)url=a.onclick.match(/^\s*(?:window\.)?location(?:\.href)?\s*=\s*(['"])([^'"<>]+)\1\s*;?\s*$/)?.[2];if(!url||!n.closed)continue;
  let ancestors=[];for(let p=n.parent;p&&ancestors.length<3;p=p.parent)ancestors.push(p);
  const context=ancestors.map(p=>[p.tag,p.a['aria-label'],p.a.class,p.a.id,...(headings.get(p)??[])].filter(Boolean).join(' ')).join(' ');
  const accessibleName=[a['aria-label'],a.title,...(a['aria-labelledby']??'').split(/\s+/).map(id=>ids.get(id))].filter(Boolean).join(' ');
  const lead={url,label:plain(n.text).slice(0,300),accessibleName,context,inForm:!!n.inForm,hidden:!!n.hidden,mechanism:'PRICE_NAVIGATION',reference:{offset:n.offset,length:n.length,coordinate:'UTF16_CODE_UNITS'}};
  let intent;try{intent=priceIntent(lead,{base,authorities});}catch{intent={candidate:false,reason:'INVALID_ENCODING'};}
  if(intent.candidate)candidates.push({...lead,...intent});else rejected.push({...lead,...intent});
 }
 const unique=new Map();for(const c of candidates)if(!unique.has(c.url)||unique.get(c.url).score<c.score)unique.set(c.url,c);
 return {candidates:[...unique.values()].sort((a,b)=>b.score-a.score||a.reference.offset-b.reference.offset),rejected,stops:scanned>maxControls?['CONTROL_SCAN_LIMIT']:[]};
}
