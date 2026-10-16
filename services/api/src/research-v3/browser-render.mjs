// Playwright is injected so normal V3 imports and offline tests never launch a browser.
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {publicAddress,researchUserAgent} from '../research-v1/public-network.mjs';
import {digest,normalizeUrl,providerBound} from './model.mjs';
import {parseAcquisitionRobots,evaluateAcquisitionRobots} from './acquisition-robots.mjs';
import {safeRenderedControl} from './rendered-interactions.mjs';
export {safeRenderedControl} from './rendered-interactions.mjs';

export const browserRenderLimits=Object.freeze({requests:256,bodyBytes:4*1024*1024,imageBytes:16*1024*1024,domElements:512,documentHeight:12000,timeoutMs:60000});

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
    return candidates.nth(matches[0]);
}

const visibleDom=()=>{
    const rows=[],seen=new Set();
    const add=(element,text,rect,role)=>{
        if(rows.length>=512||!text||!rect||rect.width<1||rect.height<1)return;
        const style=getComputedStyle(element);
        if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return;
        const x=Math.max(0,Math.floor(rect.x+scrollX)),y=Math.max(0,Math.floor(rect.y+scrollY)),width=Math.ceil(rect.width),height=Math.ceil(rect.height);
        const key=[text,x,y,width,height].join('|');if(seen.has(key))return;seen.add(key);
        let contextText=null;
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
        rows.push({text:text.slice(0,2048),role:role??element.getAttribute('role')??element.tagName.toLowerCase(),ariaLabel:element.getAttribute('aria-label'),contextText,groupId,selected,disabled,bboxPx:[x,y,width,height]});
    };
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()&&rows.length<440){const node=walker.currentNode,text=node.textContent?.replace(/\s+/g,' ').trim();if(!text)continue;const parent=node.parentElement;if(!parent)continue;const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();add(parent,text,rect);}
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

export function createPlaywrightRenderedCapability({browserType,chromium,launchOptions={headless:true,args:['--disable-background-networking','--disable-sync']},proxyFor=()=>null,clock=()=>new Date().toISOString(),viewportCss={width:1440,height:900},locale='en-US',timezoneId='UTC',limits=browserRenderLimits,hostAllowed=publicHost}={}) {
    const configuredBrowserType=browserType??chromium;
    if(!configuredBrowserType?.launch)throw Error('RENDERED_BROWSER_CONFIGURATION_REQUIRED');
    const sessions=new Map(),imageHash=bytes=>createHash('sha256').update(bytes).digest('hex');
    let sharedBrowser=null;
    const capability=async(action,{parent,objective,maxRenderMs=limits.timeoutMs}={})=>{
        if(!parent||parent.id!==action.observation||!providerBound(objective,action.url)||action.url!==parent.url)throw Error('RENDERED_PARENT_INVALID');
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
                return {page:stateReceipt,finalUrl:parent.url,pngBytes,capture:{capturedAt:executedAt,browserBuild:browser.version(),captureRevision:'playwright-state-v1',viewportCss,deviceScaleFactor:1,zoom:1,locale,timezone:timezoneId,fullPage:true,documentExtent:extent,coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:extent.height>viewportCss.height?'STITCHED':'NONE',completeness:'COMPLETE',stability:'UNKNOWN',obstructionStatus:'UNKNOWN'},journey:{id:'render-'+digest([action.id,executedAt]).slice(0,24),parentRenderId:prior.id,stateFingerprint:digest([parent.url,dom.map(row=>[row.text,row.selected,row.disabled]).slice(0,128)]),interactions:[{actionId:action.id,kind:action.interaction.kind,parentRenderId:prior.id,sourceControlRef:{kind:'IMAGE_REGION',renderId:prior.id,imageSha256:prior.image.sha256,regionId:action.interaction.sourceRegionId},intendedPresentationVariant:source.text.slice(0,256),policyDecisionRef:digest(['SAFE_RENDERED_CONTROL',action.interaction.kind,source.id,source.text,selectedPeer?.id??null,selectedPeer?.text??null]),executedAt,executionOutcome:'COMPLETED',resultingRenderId:'',observedStateRefs:[],navigationReceiptRef:null}]},dom,browserLedger:structuredClone(ledger),networkSession};
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
                if(!['GET','HEAD'].includes(method)||!normalizeUrl(url)||request.resourceType()==='document'&&!providerBound(objective,url)||ledger.length>=limits.requests||!(await hostAllowed(parsed.hostname,dns)))return route.abort();
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
            return {page:receipt,finalUrl,pngBytes,capture:{capturedAt:clock(),browserBuild:browser.version(),captureRevision:'playwright-fullpage-v1',viewportCss,deviceScaleFactor:1,zoom:1,locale,timezone:timezoneId,fullPage:true,documentExtent:extent,coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:extent.height>viewportCss.height?'STITCHED':'NONE',completeness:'COMPLETE',stability:'UNKNOWN',obstructionStatus:'UNKNOWN'},journey:{id:'render-'+digest([action.id,acquiredAt]).slice(0,24),parentRenderId:null,stateFingerprint:digest([finalUrl,dom.map(row=>row.text).slice(0,128)]),interactions:[]},dom,browserLedger:ledger,networkSession};
        } finally {if(!keep)await context?.close().catch(()=>{});}
    };
    capability.close=async()=>{for(const session of sessions.values())await session.context.close().catch(()=>{});sessions.clear();await sharedBrowser?.close().catch(()=>{});sharedBrowser=null;};
    return capability;
}
