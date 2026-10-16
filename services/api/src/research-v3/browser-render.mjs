// Playwright is injected so normal V3 imports and offline tests never launch a browser.
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {publicAddress,researchUserAgent} from '../research-v1/public-network.mjs';
import {digest,normalizeUrl,providerBound} from './model.mjs';
import {parseAcquisitionRobots,evaluateAcquisitionRobots} from './acquisition-robots.mjs';
import {safeRenderedControl} from './rendered-interactions.mjs';
import {chooseProviderMarketOption,exactMarketOption,marketCodeMatches} from './provider-market-evidence.mjs';
export {safeRenderedControl} from './rendered-interactions.mjs';

// A hydrated app shell and one market navigation can exceed 256 requests;
// keep the full browser session bounded while admitting its final article read.
export const browserRenderLimits=Object.freeze({requests:384,bodyBytes:4*1024*1024,imageBytes:16*1024*1024,domElements:512,documentHeight:12000,timeoutMs:60000});

// Some provider pages load public article content through JSON POST RPCs.
// Admit only same-origin, page-initiated read operations; never forms,
// navigations, telemetry, or actions that could change an account or order.
export function providerReadOnlyPost(request,origin){
 if(request.method()!=='POST'||!['fetch','xhr'].includes(request.resourceType()))return false;
 let url;try{url=new URL(request.url());}catch{return false;}
 if(url.origin!==origin||/(?:checkout|purchase|payment|billing|order)(?:\/|$)/i.test(url.pathname))return false;
 const type=request.headers?.()['content-type']??request.headers?.()['Content-Type']??'';
 if(!/^application\/json(?:\s*;|$)/i.test(type))return false;
 const body=request.postData?.();if(typeof body!=='string'||Buffer.byteLength(body)>16384)return false;
 let data;try{data=JSON.parse(body);}catch{return false;}
 const read=row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))return false;
  const operation=row.method??row.methodName??row.operationName;
  if(typeof operation==='string')return /^(?:get|load|list|read|fetch|search|query|is|has)[A-Z_]/.test(operation)&&!/(?:create|update|delete|submit|purchase|save|cancel|set|mutation)/i.test(operation);
  return typeof row.query==='string'&&/^\s*(?:query\b|\{)/.test(row.query)&&!/\bmutation\b/i.test(row.query);
 };
 return Array.isArray(data)?data.length>0&&data.length<=8&&data.every(read):read(data);
}

function marketContentState(){
 const candidates=[...document.querySelectorAll('*')].filter(element=>/article/i.test(element.tagName)||element.matches('article,[itemprop="articleBody"],main,[role="main"]'));
 const content=candidates.find(element=>/article/i.test(element.tagName)||element.matches('article,[itemprop="articleBody"]'))??candidates.find(element=>element.matches('main,[role="main"]'));
 const text=String(content?.innerText??document.body?.innerText??'').replace(/\s+/g,' ').trim().slice(0,20000);
 return {text,semantic:!!content,ready:document.readyState==='complete',busy:!!document.querySelector('[aria-busy="true"]')};
}
function providerDocumentLanguage(){return document.documentElement.lang||null;}

async function waitForMarketContent(page,before,{timeoutMs=8000,quietMs=400}={}){
 const until=Date.now()+timeoutMs;let last=null,unchangedSince=0;
 while(Date.now()<until){
  let current;try{current=await page.evaluate(marketContentState);}catch{await new Promise(resolve=>setTimeout(resolve,100));continue;}
  const text=current?.text??'';
  // A changed app shell or error page is not a hydrated provider article.
  const changed=current.semantic&&text!==before?.text;
  const meaningful=text.length>=80;
  if(current.ready&&current.busy!==true&&changed&&meaningful){
   if(text!==last){last=text;unchangedSince=Date.now();}
   if(Date.now()-unchangedSince>=quietMs)return current;
  }else{last=null;unchangedSince=0;}
  await new Promise(resolve=>setTimeout(resolve,Math.min(100,Math.max(1,until-Date.now()))));
 }
 throw Error('PROVIDER_MARKET_CONTENT_UNRESOLVED');
}

function consentDialogNames(){
 const visible=element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;};
 return [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible).map(element=>element.getAttribute('aria-label')||document.getElementById(element.getAttribute('aria-labelledby'))?.innerText||'').filter(Boolean).slice(0,8);
}

async function consentBlockingState(page,{timeoutMs=1200}={}){
 const until=Date.now()+timeoutMs;
 do{
  const dialogs=await page.evaluate(consentDialogNames);
  const selector=await providerMarketSelector(page);
  let selectorInteractable=null;
  if(selector){try{await selector.locator.click({trial:true,timeout:Math.min(350,Math.max(100,until-Date.now()))});selectorInteractable=true;}catch{selectorInteractable=false;}}
  if(selectorInteractable===true||selectorInteractable===null&&dialogs.length===0)return {blocking:false,dialogs,selectorInteractable};
  if(Date.now()>=until)return {blocking:true,dialogs,selectorInteractable};
  await new Promise(resolve=>setTimeout(resolve,Math.min(100,Math.max(1,until-Date.now()))));
 }while(true);
}

const controlLabel=text=>String(text??'').normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim();

async function sourceBoundLocator(page,source,selectedPeer) {
    const live=await page.evaluate(visibleDom);
    const same=row=>row.role===source.role&&controlLabel(row.text)===controlLabel(source.text)&&row.disabled===false&&row.selected===source.selected&&row.groupId===source.groupId&&row.bboxPx.every((value,index)=>Math.abs(value-source.bboxPx[index])<=3);
    if(live.filter(same).length!==1)throw Error('RENDERED_INTERACTION_UNSAFE');
    if(selectedPeer&&!live.some(row=>row.role===selectedPeer.role&&controlLabel(row.text)===controlLabel(selectedPeer.text)&&row.selected===true&&row.disabled===false&&row.groupId===source.groupId&&row.bboxPx.every((value,index)=>Math.abs(value-selectedPeer.bboxPx[index])<=3)))throw Error('RENDERED_INTERACTION_UNSAFE');
    const selector=source.role==='button'?'button,[role="button"]':source.role==='tab'?'[role="tab"]':'[role="radio"]';
    const candidates=page.locator(selector);
    const matches=await candidates.evaluateAll((elements,expected)=>elements.flatMap((element,index)=>{
        const rect=element.getBoundingClientRect(),box=[Math.floor(rect.x+scrollX),Math.floor(rect.y+scrollY),Math.ceil(rect.width),Math.ceil(rect.height)];
        const label=String(element.innerText||element.value||element.getAttribute('aria-label')||'').normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim();
        return label===expected.text&&box.every((value,i)=>Math.abs(value-expected.box[i])<=3)?[index]:[];
    }),{text:controlLabel(source.text),box:source.bboxPx});
    if(matches.length!==1)throw Error('RENDERED_INTERACTION_UNSAFE');
    if(typeof page.getByRole==='function'){
        const named=page.getByRole(source.role,{name:controlLabel(source.ariaLabel||source.text),exact:true});
        if(await named.count()===1){
            const box=await named.boundingBox();
            if(box&&[Math.floor(box.x+await page.evaluate(()=>scrollX)),Math.floor(box.y+await page.evaluate(()=>scrollY)),Math.ceil(box.width),Math.ceil(box.height)].every((value,index)=>Math.abs(value-source.bboxPx[index])<=3))return named;
        }
        throw Error('RENDERED_INTERACTION_UNSAFE');
    }
    return candidates.nth(matches[0]);
}

export const visibleDom=()=>{
    if(!document.body)return [];
    const rows=[],seen=new Set();
    const add=(element,text,rect,role)=>{
        if(rows.length>=512||!text||!rect||rect.width<1||rect.height<1)return;
        const style=getComputedStyle(element);
        if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return;
        const x=Math.max(0,Math.floor(rect.x+scrollX)),y=Math.max(0,Math.floor(rect.y+scrollY)),width=Math.ceil(rect.width),height=Math.ceil(rect.height);
        const key=[text,x,y,width,height].join('|');if(seen.has(key))return;seen.add(key);
        let contextText=null;
        const dialog=element.closest('[role="dialog"],[aria-modal="true"]');
        const consentDialogName=dialog&&(dialog.getAttribute('aria-label')||document.getElementById(dialog.getAttribute('aria-labelledby'))?.innerText||'')||null;
        if(element.matches('button,input,[role="button"],[role="tab"],[role="radio"],[role="switch"]')){
            let ancestor=element.parentElement;
            for(let depth=0;ancestor&&depth<6;ancestor=ancestor.parentElement,depth++){
                const candidate=ancestor.innerText?.replace(/\s+/g,' ').trim()??'';
                if(candidate.length>=12&&candidate.length<=2048&&/\b(?:cookies?|consent|privacy)\b/i.test(candidate)){contextText=candidate.slice(0,1024);break;}
            }
        }
        const selectedClass=node=>[...node.classList].some(token=>/(?:^|[-_])(?:selected|active|checked)$/.test(token));
        const explicit=[element.getAttribute('aria-selected'),element.getAttribute('aria-checked'),element.getAttribute('aria-pressed'),element.getAttribute('data-state')];
        const siblingSelected=element.matches('button,[role="tab"],[role="radio"]')&&[...element.parentElement?.children??[]].some(peer=>peer!==element&&peer.tagName===element.tagName&&selectedClass(peer));
        const selected=explicit.some(value=>['true','checked','active','selected'].includes(value))||element.checked===true||selectedClass(element)?true:explicit.some(value=>['false','unchecked','inactive','unselected'].includes(value))||element.checked===false||siblingSelected?false:null;
        const styledDisabled=style.pointerEvents==='none'||style.cursor==='not-allowed'||[...element.classList].some(token=>/(?:^|[-_])disabled$/.test(token));
        const disabled=element.matches(':disabled')||element.getAttribute('aria-disabled')==='true'||styledDisabled?true:element.matches('button,input,select,[role="button"],[role="tab"],[role="radio"],[role="switch"],a[href]')?false:null;
        const ancestry=[];for(let parent=element.parentElement;parent&&ancestry.length<8;parent=parent.parentElement)ancestry.push(parent.tagName.toLowerCase()+':'+[...parent.parentElement?.children??[]].indexOf(parent));
        const groupId=ancestry.length?ancestry.reverse().join('/')+':children':null;
        rows.push({text:text.slice(0,2048),role:role??element.getAttribute('role')??element.tagName.toLowerCase(),ariaLabel:element.getAttribute('aria-label'),contextText,consentDialogName,groupId,selected,disabled,bboxPx:[x,y,width,height]});
    };
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()&&rows.length<440){const node=walker.currentNode,text=node.textContent?.replace(/\s+/g,' ').trim();if(!text)continue;const parent=node.parentElement;if(!parent)continue;
        // A text range inside a button is not the clickable button rectangle.
        // Only a real interactive ancestor may supply that control below.
        let ancestor=parent,interactive=false;
        for(let depth=0;ancestor&&depth<4;ancestor=ancestor.parentElement,depth++)if(ancestor.matches('button,[role="button"],[role="tab"],[role="radio"],[role="switch"]')){interactive=true;break;}
        if(interactive)continue;
        const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();add(parent,text,rect);}
    for(const element of document.querySelectorAll('button,[role="button"],[role="tab"],[role="radio"],[role="switch"],input,a')){
        if(rows.length>=512)break;const text=(element.innerText||element.value||element.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();add(element,text,element.getBoundingClientRect(),element.getAttribute('role')??element.tagName.toLowerCase());
    }
    return rows;
};

async function publicHost(host,cache) {
    if(cache.has(host))return cache.get(host);
    if(isIP(host))return false;
    let addresses;
    try{addresses=await lookup(host,{all:true,verbatim:true});}catch{return false;}
    const safe=addresses.length>0&&addresses.every(row=>publicAddress(row.address)&&isIP(row.address)===row.family);
    cache.set(host,safe);return safe;
}

async function boundedRequest(context,url,{maxBytes=512000,record=null,resourceType='auxiliary'}={}) {
    record?.({url,method:'GET',resourceType,channel:'CONTEXT_REQUEST'});
    const response=await context.request.get(url,{timeout:15000,maxRedirects:0});
    const body=await response.body();
    if(body.length>maxBytes)throw Error('RENDERED_AUXILIARY_BOUND');
    return {status:response.status(),text:body.toString('utf8'),headers:response.headers()};
}

async function boundedRobots(context,origin,record) {
    let url=origin+'/robots.txt';
    for(let hop=0;hop<=3;hop++){
        const response=await boundedRequest(context,url,{record,resourceType:'robots'});
        if(![301,302,303,307,308].includes(response.status))return response;
        const location=response.headers?.location,next=location&&normalizeUrl(new URL(location,url).href);
        if(!next||new URL(next).origin!==origin||hop===3)throw Error('RENDERED_ROBOTS_REDIRECT_INVALID');
        url=next;
    }
    throw Error('RENDERED_ROBOTS_REDIRECT_INVALID');
}

async function providerMarketSelector(page){
 if(typeof page.locator!=='function')return null;
 const candidates=page.locator('button[aria-haspopup="listbox"]');
 if(typeof candidates.count!=='function')return null;
 const count=await candidates.count();if(count>16)return null;
 const matches=[];
 for(let i=0;i<count;i++){
  const locator=candidates.nth(i);
  if(!await locator.isVisible())continue;
  const label=await locator.getAttribute('aria-label');
  if(!label||!/(?:country|region)/iu.test(label))continue;
  const state=/\bcurrent\s+(?:country|region)\s+([A-Z]{2})\b/iu.exec(label);
  if(state)matches.push({locator,label,code:state[1]});
 }
 return matches.length===1?matches[0]:null;
}

export function createPlaywrightRenderedCapability({browserType,chromium,launchOptions={headless:true,args:['--disable-background-networking','--disable-sync']},proxyFor=()=>null,clock=()=>new Date().toISOString(),viewportCss={width:1440,height:900},locale='en-US',timezoneId='UTC',limits=browserRenderLimits,hostAllowed=publicHost}={}) {
    const configuredBrowserType=browserType??chromium;
    if(!configuredBrowserType?.launch)throw Error('RENDERED_BROWSER_CONFIGURATION_REQUIRED');
    const sessions=new Map(),imageHash=bytes=>createHash('sha256').update(bytes).digest('hex');
    let sharedBrowser=null;
    const capability=async(action,{parent,objective,maxRenderMs=limits.timeoutMs}={})=>{
        if(!parent||parent.id!==action.observation||!providerBound(objective,action.url)||action.url!==parent.url)throw Error('RENDERED_PARENT_INVALID');
        if(action.mode==='MARKET'){
            const session=sessions.get(parent.id),target=action.targetMarket;
            if(!session||session.country||!/^[A-Z]{2}$/.test(target??'')||session.receipt.body!==parent.body)throw Error('PROVIDER_MARKET_SESSION_INVALID');
            const {page,browser,context,receipt,ledger,sessionBinding}=session,initialUrl=receipt.requestedUrl,preHash=digest(parent.body);
            try{
                const selector=await providerMarketSelector(page);
                if(!selector)throw Error('PROVIDER_MARKET_SELECTOR_UNRESOLVED');
                if((await consentBlockingState(page,{timeoutMs:limits.consentSettleTimeoutMs??1200})).blocking)throw Error('PROVIDER_MARKET_SELECTOR_BLOCKED');
                const alreadySelected=marketCodeMatches(target,selector.code),preContent=alreadySelected?{text:''}:await page.evaluate(marketContentState);
                let selectedOption=null;
                if(!alreadySelected){
                    await selector.locator.click({timeout:Math.min(10000,maxRenderMs)});
                    const options=page.getByRole('option'),count=await options.count();
                    if(count<1||count>256)throw Error('PROVIDER_MARKET_OPTIONS_BOUND');
                    const matches=[];
                    for(let i=0;i<count;i++){
                        const option=options.nth(i);if(!await option.isVisible()||!await option.isEnabled())continue;
                        const label=(await option.innerText()).replace(/\s+/gu,' ').trim();
                        if(exactMarketOption(target,label))matches.push({option,label});
                    }
                    let choice=matches.length===1?{index:0}:null;
                    if(matches.length>1){
                        const selected=page.locator('[role="option"][aria-selected="true"]'),selectedCount=await selected.count(),selectedOptions=[];
                        if(selectedCount>256)throw Error('PROVIDER_MARKET_OPTIONS_BOUND');
                        for(let i=0;i<selectedCount;i++){
                            const option=selected.nth(i);if(await option.isVisible()&&await option.isEnabled())selectedOptions.push((await option.innerText()).replace(/\s+/gu,' ').trim());
                        }
                        choice=chooseProviderMarketOption({target,currentCode:selector.code,candidates:matches.map(row=>row.label),selectedOptions,documentLang:await page.evaluate(providerDocumentLanguage)});
                    }
                    if(!choice)throw Error('PROVIDER_MARKET_OPTION_UNRESOLVED');
                    await matches[choice.index].option.click({timeout:Math.min(10000,maxRenderMs)});
                    selectedOption=matches[choice.index].label;
                    await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});
                }
                const finalUrl=normalizeUrl(page.url());
                if(!finalUrl||new URL(finalUrl).origin!==new URL(parent.url).origin||!providerBound(objective,finalUrl))throw Error('PROVIDER_MARKET_NAVIGATION_UNSAFE');
                const post=await providerMarketSelector(page);
                if(!post||!marketCodeMatches(target,post.code)||!alreadySelected&&post.code===selector.code)throw Error('PROVIDER_MARKET_STATE_UNCHANGED');
                await waitForMarketContent(page,preContent,{timeoutMs:Math.min(maxRenderMs,limits.marketContentTimeoutMs??8000),quietMs:limits.marketContentQuietMs??400});
                const extent=await page.evaluate(() => ({width:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0),height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight??0)}));
                if(extent.height>limits.documentHeight||extent.width>32768||extent.width*extent.height>50_000_000)throw Error('RENDERED_PAGE_BOUND');
                const pngBytes=await page.screenshot({type:'png',fullPage:true,animations:'disabled',timeout:Math.min(maxRenderMs,limits.timeoutMs)});
                if(pngBytes.length>limits.imageBytes)throw Error('RENDERED_IMAGE_BOUND');
                await waitForMarketContent(page,preContent,{timeoutMs:Math.min(maxRenderMs,limits.marketContentTimeoutMs??8000),quietMs:limits.marketContentQuietMs??400});
                const retainedUrl=normalizeUrl(page.url()),retainedSelector=await providerMarketSelector(page);
                if(!retainedUrl||new URL(retainedUrl).origin!==new URL(parent.url).origin||!providerBound(objective,retainedUrl)||!retainedSelector||!marketCodeMatches(target,retainedSelector.code)||retainedSelector.code!==post.code||(await consentBlockingState(page,{timeoutMs:350})).blocking)throw Error('PROVIDER_MARKET_FINAL_STATE_INVALID');
                const dom=await page.evaluate(visibleDom);
                const renderedBody=await page.content(),bodyHash=digest(renderedBody);
                if(!alreadySelected&&bodyHash===preHash||Buffer.byteLength(renderedBody)>limits.bodyBytes)throw Error('PROVIDER_MARKET_SOURCE_INVALID');
                const acquiredAt=clock(),marketSelection={kind:'PROVIDER_SELECTED_MARKET',selectionMode:alreadySelected?'ALREADY_SELECTED':'SELECTED_OPTION',observationId:action.id,targetMarket:target,transport:'DIRECT_BROWSER',initialUrl,finalUrl:retainedUrl,providerHost:new URL(retainedUrl).hostname,preSourceSha256:preHash,finalSourceSha256:bodyHash,preSelectedCode:selector.code,selectedCode:retainedSelector.code,selectedOption,selectorLabel:retainedSelector.label};
                const stateReceipt={...structuredClone(receipt),url:retainedUrl,body:renderedBody,acquiredAt,responseMetadata:{...receipt.responseMetadata,renderedDomSha256:bodyHash,requestCount:ledger.length,requestOrigins:[...new Set(ledger.map(row=>row.origin))].slice(0,64)}};
                const networkSession={kind:'V3_BROWSER_NETWORK_SESSION_V1',transport:'DIRECT',requestedCountry:null,scope:'PLAYWRIGHT_BROWSER_CONTEXT',proxyApplied:false,sessionBinding,requestCount:ledger.length,ledgerSha256:digest(ledger)};
                session.receipt=stateReceipt;session.imageSha256=imageHash(pngBytes);sessions.delete(parent.id);sessions.set(action.id,session);
                return {page:stateReceipt,finalUrl:retainedUrl,pngBytes,capture:{capturedAt:acquiredAt,browserBuild:browser.version(),captureRevision:'playwright-market-v1',viewportCss,deviceScaleFactor:1,zoom:1,locale,timezone:timezoneId,fullPage:true,documentExtent:extent,coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:extent.height>viewportCss.height?'STITCHED':'NONE',completeness:'COMPLETE',stability:'UNKNOWN',obstructionStatus:'UNKNOWN'},journey:{id:'render-'+digest([action.id,acquiredAt]).slice(0,24),parentRenderId:null,stateFingerprint:digest([retainedUrl,dom.map(row=>row.text).slice(0,128)]),interactions:[]},dom,browserLedger:structuredClone(ledger),networkSession,marketSelection,marketSelector:{kind:'PROVIDER_MARKET_SELECTOR',label:retainedSelector.label,code:retainedSelector.code}};
            }catch(error){sessions.delete(parent.id);await context.close().catch(()=>{});throw error;}
        }
        if(action.mode==='STATE'){
            const session=sessions.get(parent.id),source=parent.domSnapshot?.find(row=>row.id===action.interaction?.controlId),selectedPeer=parent.domSnapshot?.find(row=>row.id===action.interaction?.selectedControlId),prior=parent.renderedArtifacts?.find(row=>row.id===action.interaction?.sourceRenderId);
            const control=parent.renderedControlRegions?.find(row=>row.renderId===prior?.id&&row.imageSha256===prior?.image.sha256)?.regions?.find(row=>row.id===action.interaction?.sourceRegionId);
            if(!session||!source||!prior||!control||JSON.stringify(control.bboxPx)!==JSON.stringify(source.bboxPx)||session.imageSha256!==prior.image.sha256||action.interaction.sourceRegionId!=='control-'+source.id||!safeRenderedControl(source,action.interaction.kind,selectedPeer))throw Error('RENDERED_INTERACTION_UNSAFE');
            const {page,browser,context,receipt,geo,ledger,sessionBinding,country}=session;
            try{
                const locator=await sourceBoundLocator(page,source,selectedPeer);
                if(await locator.count()!==1||!(await locator.isEnabled()))throw Error('RENDERED_INTERACTION_UNSAFE');
                if(action.interaction.kind==='PRESENTATION_SELECT'&&source.role!=='button'){
                    const selected=await locator.getAttribute('aria-selected'),checked=await locator.getAttribute('aria-checked');
                    if(selected!=='false'&&checked!=='false')throw Error('RENDERED_INTERACTION_UNSAFE');
                }
                const before=geo?await geo():null;
                if(geo&&receipt.transport.exitAddressHash!==digest(before))throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');
                await locator.click({timeout:Math.min(10000,maxRenderMs)});
                await page.waitForLoadState('networkidle',{timeout:4000}).catch(()=>{});
                if(normalizeUrl(page.url())!==parent.url)throw Error('RENDERED_INTERACTION_NAVIGATION_UNSUPPORTED');
                const consentState=action.interaction.kind.startsWith('COOKIE_')?await consentBlockingState(page,{timeoutMs:limits.consentSettleTimeoutMs??1200}):null;
                const extent=await page.evaluate(()=>({width:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0),height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight??0)}));
                if(extent.height>limits.documentHeight||extent.width>32768||extent.width*extent.height>50_000_000)throw Error('RENDERED_PAGE_BOUND');
                const dom=await page.evaluate(visibleDom),pngBytes=await page.screenshot({type:'png',fullPage:true,animations:'disabled',timeout:Math.min(maxRenderMs,limits.timeoutMs)});
                if(pngBytes.length>limits.imageBytes||geo&&before!==await geo())throw Error('RENDERED_STATE_INVALID');
                const renderedBody=await page.content();
                if(Buffer.byteLength(renderedBody)>limits.bodyBytes)throw Error('RENDERED_BODY_BOUND');
                session.imageSha256=imageHash(pngBytes);
                const executedAt=clock();
                const stateReceipt={...structuredClone(receipt),body:renderedBody,acquiredAt:executedAt,responseMetadata:{...receipt.responseMetadata,renderedDomSha256:digest(renderedBody),requestCount:ledger.length,requestOrigins:[...new Set(ledger.map(row=>row.origin))].slice(0,64)}};
                const networkSession={kind:'V3_BROWSER_NETWORK_SESSION_V1',transport:country?'DECODO':'DIRECT',requestedCountry:country,scope:'PLAYWRIGHT_BROWSER_CONTEXT',proxyApplied:!!country,sessionBinding,requestCount:ledger.length,ledgerSha256:digest(ledger)};
                session.receipt=stateReceipt;sessions.delete(parent.id);sessions.set(action.id,session);
                return {page:stateReceipt,finalUrl:parent.url,pngBytes,capture:{capturedAt:executedAt,browserBuild:browser.version(),captureRevision:'playwright-state-v1',viewportCss,deviceScaleFactor:1,zoom:1,locale,timezone:timezoneId,fullPage:true,documentExtent:extent,coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:extent.height>viewportCss.height?'STITCHED':'NONE',completeness:'COMPLETE',stability:'UNKNOWN',obstructionStatus:'UNKNOWN'},journey:{id:'render-'+digest([action.id,executedAt]).slice(0,24),parentRenderId:prior.id,stateFingerprint:digest([parent.url,dom.map(row=>[row.text,row.selected,row.disabled]).slice(0,128)]),interactions:[{actionId:action.id,kind:action.interaction.kind,parentRenderId:prior.id,sourceControlRef:{kind:'IMAGE_REGION',renderId:prior.id,imageSha256:prior.image.sha256,regionId:action.interaction.sourceRegionId},intendedPresentationVariant:source.text.slice(0,256),policyDecisionRef:digest(['SAFE_RENDERED_CONTROL',action.interaction.kind,source.id,source.text,selectedPeer?.id??null,selectedPeer?.text??null]),executedAt,executionOutcome:'COMPLETED',resultingRenderId:'',observedStateRefs:[],navigationReceiptRef:null}]},dom,browserLedger:structuredClone(ledger),networkSession,consentState,marketSelector:await providerMarketSelector(page).then(value=>value?{kind:'PROVIDER_MARKET_SELECTOR',label:value.label,code:value.code}:null)};
            } catch(error){sessions.delete(parent.id);await context.close().catch(()=>{});throw error;}
        }
        const started=performance.now(),country=parent.context.transport==='DECODO'?parent.context.networkGeography:null,proxy=country?proxyFor(parent.context):null;
        if(country&&!proxy?.server)throw Error('RENDERED_COUNTRY_PROXY_REQUIRED');
        const browser=sharedBrowser??=await configuredBrowserType.launch(launchOptions);
        let context,keep=false;
        try {
            context=await browser.newContext({viewport:viewportCss,deviceScaleFactor:1,locale,timezoneId,serviceWorkers:'block',acceptDownloads:false,permissions:[],userAgent:researchUserAgent,...(proxy?{proxy}:{})});
            const origin=new URL(action.url).origin,dns=new Map(),ledger=[];
            const sessionBinding=digest(['PLAYWRIGHT_BROWSER_CONTEXT',action.id,origin,country??'UNBOUND']);
            const record=({url,method,resourceType,channel})=>{
                if(ledger.length>=limits.requests)throw Error('RENDERED_REQUEST_BOUND');
                const parsed=new URL(url);
                ledger.push({urlHash:digest(url),origin:parsed.origin,method,resourceType,channel,transport:country?'DECODO':'DIRECT',requestedCountry:country,sessionBinding});
            };
            if(!(await hostAllowed(new URL(origin).hostname,dns)))throw Error('RENDERED_PUBLIC_HOST_REQUIRED');
            const robots=await boundedRobots(context,origin,record);
            const policy=[404,410].includes(robots.status)?{decision:'ALLOWED',reason:'ROBOTS_ABSENT'}:robots.status===200?evaluateAcquisitionRobots(parseAcquisitionRobots(robots.text),action.url):{decision:'REVIEW_REQUIRED'};
            if(policy.decision!=='ALLOWED')throw Error('RENDERED_ROBOTS_NOT_ALLOWED');
            const access=[{destinationOrigin:origin,destinationHash:digest(action.url),status:robots.status,decision:policy.decision,reason:policy.reason??null}];
            const geo=async()=>{
                const result=await boundedRequest(context,'https://ipwho.is/?fields=success,ip,country_code',{maxBytes:8192,record,resourceType:'geography'});
                if(result.status!==200)throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');
                let parsed;try{parsed=JSON.parse(result.text);}catch{throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');}
                if(parsed.success!==true||parsed.country_code!==country||typeof parsed.ip!=='string')throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');
                return parsed.ip;
            };
            const before=country?await geo():null;
            await context.route('**/*',async route=>{
                const request=route.request(),url=request.url(),method=request.method();
                let parsed;try{parsed=new URL(url);}catch{return route.abort();}
                const readPost=providerReadOnlyPost(request,origin),robotsNeeded=request.resourceType()==='document'||readPost;
                if(!['GET','HEAD'].includes(method)&&!readPost||!normalizeUrl(url)||robotsNeeded&&(parsed.origin!==origin||!providerBound(objective,url)||([404,410].includes(robots.status)?false:robots.status!==200||evaluateAcquisitionRobots(parseAcquisitionRobots(robots.text),url).decision!=='ALLOWED'))||ledger.length>=limits.requests||!(await hostAllowed(parsed.hostname,dns)))return route.abort();
                record({url,method,resourceType:request.resourceType(),channel:'PAGE'});
                return route.continue();
            });
            const page=await context.newPage();
            page.on('dialog',dialog=>dialog.dismiss().catch(()=>{}));
            page.on('popup',popup=>popup.close().catch(()=>{}));
            let response=await page.goto(action.url,{waitUntil:'domcontentloaded',timeout:Math.min(maxRenderMs,limits.timeoutMs)});
            if(!response||response.status()!==200||!providerBound(objective,page.url()))throw Error('RENDERED_PAGE_INVALID');
            await page.waitForLoadState('networkidle',{timeout:4000}).catch(()=>{});
            if(action.navigationUrl){
                const destination=normalizeUrl(action.navigationUrl);
                if(!destination||new URL(destination).origin!==origin||!providerBound(objective,destination))throw Error('RENDERED_NAVIGATION_UNSAFE');
                const nextPolicy=[404,410].includes(robots.status)?{decision:'ALLOWED',reason:'ROBOTS_ABSENT'}:robots.status===200?evaluateAcquisitionRobots(parseAcquisitionRobots(robots.text),destination):{decision:'REVIEW_REQUIRED'};
                if(nextPolicy.decision!=='ALLOWED')throw Error('RENDERED_ROBOTS_NOT_ALLOWED');
                access.push({destinationOrigin:origin,destinationHash:digest(destination),status:robots.status,decision:nextPolicy.decision,reason:nextPolicy.reason??null});
                response=await page.goto(destination,{waitUntil:'domcontentloaded',timeout:Math.min(maxRenderMs,limits.timeoutMs)});
                if(!response||response.status()!==200||!providerBound(objective,page.url()))throw Error('RENDERED_NAVIGATION_FAILED');
                await page.waitForLoadState('networkidle',{timeout:4000}).catch(()=>{});
            }
            const finalUrl=normalizeUrl(page.url()),networkBody=await response.body(),renderedBody=await page.content();
            if(networkBody.length>limits.bodyBytes||Buffer.byteLength(renderedBody)>limits.bodyBytes)throw Error('RENDERED_BODY_BOUND');
            const extent=await page.evaluate(()=>({width:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0),height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight??0)}));
            if(extent.height>limits.documentHeight||extent.width>32768||extent.width*extent.height>50_000_000)throw Error('RENDERED_PAGE_BOUND');
            const dom=await page.evaluate(visibleDom),pngBytes=await page.screenshot({type:'png',fullPage:true,animations:'disabled',timeout:Math.min(maxRenderMs,limits.timeoutMs)});
            if(pngBytes.length>limits.imageBytes)throw Error('RENDERED_IMAGE_BOUND');
            const after=country?await geo():null;
            if(country&&before!==after)throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');
            const transport=country?{kind:'DECODO',requestedCountry:country,verifiedCountry:country,verification:'BRACKET_VERIFIED',exitAddressHash:digest(before)}:{kind:'DIRECT',verification:'UNBOUND'};
            const acquiredAt=clock();
            const networkSession={kind:'V3_BROWSER_NETWORK_SESSION_V1',transport:country?'DECODO':'DIRECT',requestedCountry:country,scope:'PLAYWRIGHT_BROWSER_CONTEXT',proxyApplied:!!country,sessionBinding,requestCount:ledger.length,ledgerSha256:digest(ledger)};
            const receipt={url:finalUrl,requestedUrl:action.navigationUrl??action.url,body:renderedBody,httpStatus:200,contentType:response.headers()['content-type']??'text/html',completeness:'COMPLETE',acquiredAt,transport,access,redirects:[],responseMetadata:{browser:'PLAYWRIGHT',mainDocumentSha256:digest(networkBody.toString('utf8')),renderedDomSha256:digest(renderedBody),requestCount:ledger.length,requestOrigins:[...new Set(ledger.map(row=>row.origin))].slice(0,64),networkSessionBinding:sessionBinding},acquisitionTiming:{elapsedMs:Math.round(performance.now()-started)}};
            sessions.set(action.id,{browser,context,page,receipt,geo:country?geo:null,ledger,sessionBinding,country,imageSha256:imageHash(pngBytes)});keep=true;
            return {page:receipt,finalUrl,pngBytes,capture:{capturedAt:clock(),browserBuild:browser.version(),captureRevision:'playwright-fullpage-v1',viewportCss,deviceScaleFactor:1,zoom:1,locale,timezone:timezoneId,fullPage:true,documentExtent:extent,coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:extent.height>viewportCss.height?'STITCHED':'NONE',completeness:'COMPLETE',stability:'UNKNOWN',obstructionStatus:'UNKNOWN'},journey:{id:'render-'+digest([action.id,acquiredAt]).slice(0,24),parentRenderId:null,stateFingerprint:digest([finalUrl,dom.map(row=>row.text).slice(0,128)]),interactions:[]},dom,browserLedger:ledger,networkSession,marketSelector:await providerMarketSelector(page).then(value=>value?{kind:'PROVIDER_MARKET_SELECTOR',label:value.label,code:value.code}:null)};
        } finally {if(!keep)await context?.close().catch(()=>{});}
    };
    capability.close=async()=>{for(const session of sessions.values())await session.context.close().catch(()=>{});sessions.clear();await sharedBrowser?.close().catch(()=>{});sharedBrowser=null;};
    return capability;
}
