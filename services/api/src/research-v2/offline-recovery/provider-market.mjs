// Only the compound page-state patterns demonstrated by the retained audit.
// No service/host/price lookup, task-market input, code execution, or acquisition.
import '../offline-replay/offline-guard.mjs';
import assert from 'node:assert/strict';
import {htmlTree,hash} from './extract.mjs';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const country=x=>typeof x==='string'&&/^[A-Z]{2}$/.test(x)?x:null;
const region=x=>{try{return new Intl.Locale(String(x).replaceAll('_','-')).region??null;}catch{return null;}};
const url=x=>{try{return new URL(x);}catch{return null;}};
const segment=u=>u?.pathname.split('/').filter(Boolean)[0]??null;
const samePage=(a,b)=>a&&b&&a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'');
const inside=(p,scope)=>p===scope||p?.startsWith(scope+'/');
// Non-executing lexical skip. Only an unquoted article: { JSON literal } is
// supported. Strings, comments and templates cannot manufacture a config key.
function articleLiterals(raw){const out=[];let i=0;while(i<raw.length){const c=raw[i];if(c==='"'||c==="'"||c==='`'){const q=c;for(i++;i<raw.length;i++){if(raw[i]==='\\'){i++;continue;}if(raw[i]===q){i++;break;}}continue;}if(raw.slice(i,i+2)==='//'){const n=raw.indexOf('\n',i+2);i=n<0?raw.length:n+1;continue;}if(raw.slice(i,i+2)==='/*'){const n=raw.indexOf('*/',i+2);i=n<0?raw.length:n+2;continue;}
 const m=/^article\s*:\s*\{/.exec(raw.slice(i,i+40));if(m&&!/[\w$]/.test(raw[i-1]??'')){const start=i+m[0].lastIndexOf('{');let depth=0,quoted=false,escaped=false,end=null;for(let j=start;j<raw.length;j++){const x=raw[j];if(quoted){if(escaped)escaped=false;else if(x==='\\')escaped=true;else if(x==='"')quoted=false;continue;}if(x==='"'){quoted=true;continue;}if(x==='{')depth++;if(x==='}'&&--depth===0){end=j+1;break;}}if(end){try{out.push({value:JSON.parse(raw.slice(start,end)),start,end});}catch{}i=end;continue;}}
 i++;}return out;}
export function inspectProviderMarket(body,{bodyHash,sourceOccurrences=[]}){
 assert.equal(hash(body),bodyHash,'Provider market evidence must use the intact retained body');
 const tree=htmlTree(body),records=[],diagnostics=[];
 const sources=sourceOccurrences.map(o=>({id:o.id,url:o.url,parsed:url(o.url)}));
 const field=(n,p,value)=>({path:pathOf(n)+p,value,containerSpan:{start:n.start,end:n.end,coordinate:'UTF16_RETAINED_BODY_NEW_ANALYSIS'}});
 const nodeField=(n,key,value)=>({path:pathOf(n)+'/attributes/'+key,value,raw:body.slice(n.start,n.openEnd),span:{start:n.start,end:n.openEnd,coordinate:'UTF16_RETAINED_BODY_NEW_ANALYSIS'}});
 const add=(r)=>records.push({version:1,bodyHash,...r,evidenceId:'provider-market:'+hash([bodyHash,r.pattern,r.scopePaths,r.fields,r.status])});
 const headNodes=tree.nodes.filter(n=>n.parent?.tag==='head');
 const metas=(key)=>headNodes.filter(n=>n.tag==='meta'&&(n.attrs.property??n.attrs.name)===key);
 const canonicals=headNodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');
 for(const n of tree.nodes.filter(n=>n.tag==='script')){
  let j;try{j=JSON.parse(n.raw);}catch{}
  const pp=j?.props?.pageProps,base=pp?.basePageProps,meta=pp?.metadata;
  if(n.attrs.id==='__NEXT_DATA__'&&country(base?.country)&&typeof base.market==='string'){
   const code=base.country,fields=[field(n,'/props/pageProps/basePageProps/country',code),field(n,'/props/pageProps/basePageProps/market',base.market)];
   // Provider market slugs are opaque (for example uk paired with country GB).
   // Their meaning comes from these co-owned fields, not an ISO-prefix guess.
   const issues=[];
   if(meta?.country!==undefined){fields.push(field(n,'/props/pageProps/metadata/country',meta.country));if(meta.country!==code)issues.push('METADATA_COUNTRY_CONFLICT');}
   if(meta?.market!==undefined){fields.push(field(n,'/props/pageProps/metadata/market',meta.market));if(meta.market!==base.market)issues.push('METADATA_ROUTE_CONFLICT');}
   if(meta?.locale!==undefined){fields.push(field(n,'/props/pageProps/metadata/locale',meta.locale));if(region(meta.locale)!==code)issues.push('METADATA_LOCALE_CONFLICT');}
   if(j.query?.market!==undefined){fields.push(field(n,'/query/market',j.query.market));if(j.query.market!==base.market)issues.push('PAGE_QUERY_MARKET_CONFLICT');}
   const routes=sources.filter(o=>segment(o.parsed)===base.market);
   const og=metas('og:locale');for(const m of og){fields.push(nodeField(m,'content',m.attrs.content));if(region(m.attrs.content)!==code)issues.push('DOCUMENT_LOCALE_CONFLICT');}
   const corroborated=meta?.country===code&&meta?.market===base.market;
   const status=issues.length?'CONFLICTING':routes.length&&corroborated?'ESTABLISHED':'UNRESOLVED';
   add({pattern:'PAGE_STATE_COUNTRY_AND_MARKET_ROUTE',country:code,scopePaths:['$'],fields,sourceOccurrences:routes.map(o=>({id:o.id,url:o.url})),status,reasons:issues.length?issues:status==='UNRESOLVED'?['PAGE_STATE_ROUTE_OR_METADATA_NOT_CORROBORATED']:[]});
  }
  for(const a of articleLiterals(n.raw??'')){
   const v=a.value;if(!country(v.selectedCountry)||!country(v.defaultCountry)||typeof v.nodeid!=='string'||v.nodeid!==v.tnid)continue;
   const canonical=canonicals.filter(m=>{const u=url(m.attrs.href);return u?.pathname.endsWith('/node/'+v.nodeid)&&sources.some(o=>samePage(u,o.parsed));});
   const fields=['tnid','nodeid','defaultCountry','selectedCountry'].map(k=>({...field(n,'/config/article/'+k,v[k]),literalSpan:{start:n.openEnd+a.start,end:n.openEnd+a.end,coordinate:'UTF16_RETAINED_BODY_NEW_ANALYSIS'}}));
   fields.push(...canonical.map(m=>nodeField(m,'href',m.attrs.href)));
   const sections=tree.nodes.filter(m=>m.tag==='section'&&typeof m.attrs['data-countries']==='string');
   for(const section of sections){const codes=section.attrs['data-countries'].split(',').map(x=>x.trim()).filter(Boolean);if(!codes.length||codes.some(c=>!country(c)))continue;
    const issues=[];if(v.selectedCountry!==v.defaultCountry)issues.push('ARTICLE_SELECTION_DEFAULT_CONFLICT');if(!codes.includes(v.selectedCountry))issues.push('ARTICLE_SECTION_COUNTRY_CONFLICT');
    const status=issues.length?'CONFLICTING':canonical.length?'ESTABLISHED':'UNRESOLVED';
    add({pattern:'ARTICLE_COUNTRY_SELECTION_AND_SECTION',country:v.selectedCountry,sectionCountries:codes,scopePaths:[pathOf(section)],fields:[...fields,nodeField(section,'data-countries',section.attrs['data-countries'])],sourceOccurrences:sources.filter(o=>canonical.some(m=>samePage(url(m.attrs.href),o.parsed))).map(o=>({id:o.id,url:o.url})),status,reasons:issues.length?issues:status==='UNRESOLVED'?['ARTICLE_NODE_SOURCE_IDENTITY_UNRESOLVED']:[]});
   }
   if(!sections.length)diagnostics.push('ARTICLE_WITHOUT_RETAINED_COUNTRY_SECTION');
  }
 }
 // A compound localized landing-page declaration. No single constituent is
 // enough: canonical route + og:url + regional locale + country name in both
 // description and rendered document. This is the audited Videoland shape.
 for(const m of metas('og:locale')){const code=region(m.attrs.content);if(!country(code))continue;
  let name;try{name=new Intl.DisplayNames([new Intl.Locale(m.attrs.content.replaceAll('_','-')).language],{type:'region'}).of(code);}catch{continue;}if(!name||name.length<4)continue;
  const hasName=t=>new RegExp('(?<![\\p{L}])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}])','iu').test(t??'');
  const description=metas('description').find(d=>hasName(d.attrs.content));const canonical=canonicals.find(c=>{const u=url(c.attrs.href);return u?.pathname.replace(/\/$/,'')==='/'+code.toLowerCase()&&sources.some(o=>samePage(u,o.parsed));});
  if(!description||!canonical||!hasName(tree.root.text))continue;
  const og=metas('og:url').find(o=>samePage(url(o.attrs.content),url(canonical.attrs.href)));if(!og)continue;
  const fields=[nodeField(canonical,'href',canonical.attrs.href),nodeField(m,'content',m.attrs.content),nodeField(og,'content',og.attrs.content),nodeField(description,'content',description.attrs.content)];
  const owner=tree.nodes.find(n=>n.tag!=='#text'&&n.tag!=='script'&&hasName(n.text)&&!n.children.some(c=>c.tag!=='#text'&&hasName(c.text)));
  if(!owner)continue;fields.push({path:pathOf(owner),raw:body.slice(owner.start,owner.end).slice(0,1500),span:{start:owner.start,end:owner.end,coordinate:'UTF16_RETAINED_BODY_NEW_ANALYSIS'},value:name});
  add({pattern:'LOCALIZED_CANONICAL_AND_COUNTRY_CONTENT',country:code,scopePaths:['$'],fields,sourceOccurrences:sources.filter(o=>samePage(o.parsed,url(canonical.attrs.href))).map(o=>({id:o.id,url:o.url})),status:'ESTABLISHED',reasons:[]});
 }
 // Provider-declared document locale plus the exact acquired canonical regional
 // route. Alternate/hreflang destinations are deliberately not current-page evidence.
 const html=tree.nodes.find(n=>n.tag==='html');
 const locales=[html?.attrs.lang,...metas('og:locale').map(n=>n.attrs.content)].filter(Boolean);
 const routeCountry=u=>{const first=segment(u),host=u?.hostname.split('.')[0],tld=u?.hostname.split('.').at(-1);
  const token=/^[a-z]{2}[-_][a-z]{2}$/i.test(first??'')?first.slice(-2):/^[a-z]{2}$/i.test(first??'')?first:/^[a-z]{2}$/i.test(host??'')?host:/^[a-z]{2}$/i.test(tld??'')?tld:null;
  const code=token?.toUpperCase();return code&&country(code)&&new Intl.DisplayNames(['en'],{type:'region',fallback:'none'}).of(code)?code:null;};
 for(const canonical of canonicals){const u=url(canonical.attrs.href),matching=sources.filter(o=>samePage(u,o.parsed)),code=routeCountry(u);if(!matching.length||!code)continue;
  const explicit=locales.map(region).filter(Boolean),conflict=explicit.some(c=>c!==code);
  // A language alone never establishes a market. Its default-region match is
  // only corroboration when the provider also writes that currency's ISO code.
  const shortLocale=locales.find(l=>!region(l)&&(()=>{try{return new Intl.Locale(l).maximize().region===code;}catch{return false;}})());
  const isoByRegion={NO:'NOK',SE:'SEK',DK:'DKK',PL:'PLN',CZ:'CZK',JP:'JPY',KR:'KRW',IN:'INR',BR:'BRL',CH:'CHF'};
  const iso=isoByRegion[code],currencyCorroborated=shortLocale&&iso&&new RegExp('\\b'+iso+'\\b').test(tree.root.text);
  if(!explicit.includes(code)&&!currencyCorroborated)continue;
  add({pattern:'CANONICAL_ROUTE_AND_DOCUMENT_LOCALE',country:code,scopePaths:['$'],fields:[nodeField(canonical,'href',canonical.attrs.href),...(html?.attrs.lang?[nodeField(html,'lang',html.attrs.lang)]:[]),...metas('og:locale').map(m=>nodeField(m,'content',m.attrs.content)),...(currencyCorroborated?[{path:'$/visible-document',value:iso,meaning:'EXPLICIT_ISO_CORROBORATION_NOT_CURRENCY_INFERENCE'}]:[])],sourceOccurrences:matching.map(o=>({id:o.id,url:o.url})),status:conflict?'CONFLICTING':'ESTABLISHED',reasons:conflict?['DOCUMENT_ROUTE_LOCALE_CONFLICT']:[]});
 }
 // An alternate that exactly identifies the acquired page is a self-declaration,
 // unlike a menu link to another country's page. Bind it to both canonical
 // country route and compatible current document language.
 for(const link of headNodes.filter(n=>n.tag==='link'&&n.attrs.rel==='alternate'&&n.attrs.hreflang)){
  const code=region(link.attrs.hreflang),u=url(link.attrs.href),matching=sources.filter(o=>o.parsed?.href===u?.href);
  if(!code||!u||!matching.length||segment(u)?.toUpperCase()!==code)continue;
  const canonical=canonicals.find(n=>{const v=url(n.attrs.href);return v?.origin===u.origin&&segment(v)?.toUpperCase()===code;});
  if(!canonical||!html?.attrs.lang)continue;
  // A short HTML language tag is not a country declaration. The exact
  // self-reference supplies the regional locale; an explicit contradictory
  // document region still fails closed below.
  const conflict=locales.map(region).filter(Boolean).some(c=>c!==code);
  add({pattern:'EXACT_SELF_ALTERNATE_AND_CANONICAL_COUNTRY_ROUTE',country:code,scopePaths:['$'],fields:[nodeField(link,'href',link.attrs.href),nodeField(link,'hreflang',link.attrs.hreflang),nodeField(canonical,'href',canonical.attrs.href),nodeField(html,'lang',html.attrs.lang)],sourceOccurrences:matching.map(o=>({id:o.id,url:o.url})),status:conflict?'CONFLICTING':'ESTABLISHED',reasons:conflict?['DOCUMENT_SELF_LOCALE_CONFLICT']:[]});
 }
 return {version:1,bodyHash,records,diagnostics};
}
export function providerEvidenceFor(candidate,analysis){return {records:analysis.records.filter(r=>r.scopePaths.some(p=>p==='$'||inside(candidate.structuredPath,p))),diagnostics:analysis.diagnostics};}
