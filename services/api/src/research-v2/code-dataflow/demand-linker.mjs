// Non-executing, demand-directed linkage of complete retained syntax. Outputs are
// discovery proofs, never commercial facts. Unknown runtime values stay unknown.
import ts from 'typescript';
import {sha256,indexBundle,references,resourceAuthority} from './module-resources.mjs';
export const linkingBounds=Object.freeze({factories:2048,factoryBytes:524288,modules:8,dependencyDepth:3,exportDepth:6,callDepth:6,symbols:2048,work:200000,bytes:4194304,chains:9});
const fieldNames={plan:['plan','planName'],amount:['price','amount'],currency:['currency','priceCurrency'],cadence:['billingPeriod','recurrence'],priceRole:['priceRole','promotion'],ownership:['product','offer'],market:['country','market']};
export function linkProviderModules(input){
 const limits={...linkingBounds,...input.linkingLimits},out={bounds:limits,factories:[],exportLinks:[],dependencies:[],candidates:[],stops:[],counts:{work:0,symbols:0,bytes:0,modules:0},complete:true};
 const units=new Map(),registry=new Map(),sources=new Map(),active=new Set(),loaded=new Set(),roots=[],seenRequests=new Set();
 const stop=(reason,detail)=>out.stops.push({reason,detail});
 const tick=(key='work')=>{if(++out.counts[key]>limits[key])throw Error('BOUND_'+key);};
 const loc=(u,n,kind='SYNTAX')=>({status:'PROVEN',kind,module:u.source.url,sha256:u.source.sha256,start:n.getStart(u.ast),end:n.end});
 const key=n=>ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n)?n.text:null;
 const literal=n=>n&&(ts.isStringLiteral(n)||ts.isNumericLiteral(n))?n.text:null;
 let invocationDepth=0;
 const unknown=null;
 const val=(v,proof=[])=>({v,proof});
 function visit(n,fn){tick();if(fn(n)===false)return;ts.forEachChild(n,c=>visit(c,fn));}
 function unit(source,ast,body,id,fn=null){return {source,ast,body,id,fn,bindings:new Map(),exports:new Map(),imports:[],mutated:new Set(),shadowed:new Set(fn?.parameters.map(p=>p.name.text)??[]),require:fn?.parameters[2]?.name?.text,module:fn?.parameters[0]?.name?.text,exp:fn?.parameters[1]?.name?.text};}
 function dep(u,id,name,chain,url=null){const existing=out.dependencies.find(d=>d.parent===u.id&&d.moduleId===id&&d.export===name);if(existing)return;
  const ref=url?references(u.source).references.find(r=>r.url===url):null;
  out.dependencies.push({parent:u.id,registry:u.registry??null,moduleId:id,export:name,state:'REQUIRED_PROVEN',reason:'Backward field-consumer dependency',url,reference:ref,proofChain:chain,acquisitionEligible:!!ref&&!!resourceAuthority(url,input.authorities??[]),remainingBlocker:ref?null:'RESOURCE_URL_MAPPING_UNRESOLVED'});
 }
 function bindPattern(u,name,node){if(ts.isIdentifier(name))u.bindings.set(name.text,{node});else if(ts.isObjectBindingPattern(name))for(const el of name.elements){if(el.dotDotDotToken||el.initializer||!ts.isIdentifier(el.name))continue;u.bindings.set(el.name.text,{node,property:el.propertyName?.text??el.name.text});}}
 function initialize(u){
  if(u.initialized)return;u.initialized=true;
  const statements=u.body.statements??[];
  visit(u.body,n=>{if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){let l=n.left;while(ts.isPropertyAccessExpression(l)||ts.isElementAccessExpression(l))l=l.expression;if(ts.isIdentifier(l)&&![u.module,u.exp].includes(l.text))u.mutated.add(l.text);if(ts.isIdentifier(l)&&[u.module,u.exp].includes(l.text)){let a=n.parent;while(a&&a!==u.body){if(ts.isIfStatement(a)||ts.isConditionalExpression(a)||ts.isIterationStatement(a,false)||ts.isFunctionLike(a))u.opaqueExports=true;a=a.parent;}}}if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator)&&ts.isIdentifier(n.operand))u.mutated.add(n.operand.text);});
  function expression(n){
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.CommaToken){expression(n.left);expression(n.right);return;}
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken){const l=n.left;
    if(ts.isPropertyAccessExpression(l)&&ts.isIdentifier(l.expression)&&l.expression.text===u.exp)u.exports.set(l.name.text,{node:n.right,locator:loc(u,n,'EXPORT_ASSIGNMENT')});
    if(ts.isPropertyAccessExpression(l)&&l.expression.getText(u.ast)===u.module&&l.name.text==='exports')stop('COMMONJS_EXPORT_SHAPE_UNRESOLVED',loc(u,n));
   }
   if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(u.ast)===u.require&&n.expression.name.text==='d'&&n.arguments.length===2&&n.arguments[0].getText(u.ast)===u.exp&&ts.isObjectLiteralExpression(n.arguments[1])){
    for(const p of n.arguments[1].properties){if(!ts.isPropertyAssignment(p)||!key(p.name))continue;const fn=p.initializer;if(!(ts.isArrowFunction(fn)||ts.isFunctionExpression(fn))||fn.parameters.length)continue;const body=ts.isBlock(fn.body)?fn.body.statements.length===1&&ts.isReturnStatement(fn.body.statements[0])?fn.body.statements[0].expression:null:fn.body;
     if(body)u.exports.set(key(p.name),{node:body,locator:loc(u,p,'WEBPACK_EXPORT_GETTER')});
    }
   }
  }
  for(const st of statements){
   if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations){bindPattern(u,d.name,d.initializer);if(st.modifiers?.some(x=>x.kind===ts.SyntaxKind.ExportKeyword)&&ts.isIdentifier(d.name))u.exports.set(d.name.text,{binding:d.name.text,locator:loc(u,d,'EXPORT')});}
   if(ts.isFunctionDeclaration(st)&&st.name){u.bindings.set(st.name.text,{node:st});if(st.modifiers?.some(x=>x.kind===ts.SyntaxKind.ExportKeyword))u.exports.set(st.name.text,{binding:st.name.text,locator:loc(u,st,'EXPORT')});}
   if(ts.isImportDeclaration(st)&&ts.isStringLiteral(st.moduleSpecifier)){const url=new URL(st.moduleSpecifier.text,u.source.url).href,cl=st.importClause;u.imports.push({url,node:st});if(cl?.name)u.bindings.set(cl.name.text,{url,export:'default',node:st});if(cl?.namedBindings){if(ts.isNamespaceImport(cl.namedBindings))u.bindings.set(cl.namedBindings.name.text,{url,namespace:true,node:st});else for(const el of cl.namedBindings.elements)u.bindings.set(el.name.text,{url,export:el.propertyName?.text??el.name.text,node:el});}}
   if(ts.isExportAssignment(st))u.exports.set('default',{node:st.expression,locator:loc(u,st,'DEFAULT_EXPORT')});
   if(ts.isExportDeclaration(st)&&st.exportClause&&ts.isNamedExports(st.exportClause))for(const el of st.exportClause.elements)u.exports.set(el.name.text,{binding:el.propertyName?.text??el.name.text,url:st.moduleSpecifier?new URL(st.moduleSpecifier.text,u.source.url).href:null,locator:loc(u,el,'REEXPORT')});
   if(ts.isExpressionStatement(st))expression(st.expression);
  }
 }
 function load(u,depth){if(depth>limits.dependencyDepth)throw Error('BOUND_dependencyDepth');if(!loaded.has(u.id)){if(++out.counts.modules>limits.modules)throw Error('BOUND_modules');const bytes=Buffer.byteLength(u.source.code.slice(u.body.getStart(u.ast),u.body.end));if(bytes>limits.factoryBytes)throw Error('BOUND_factoryBytes');out.counts.bytes+=bytes;if(out.counts.bytes>limits.bytes)throw Error('BOUND_bytes');loaded.add(u.id);}return u;}
 function exported(id,name,chain,depth,ed=0){tick('symbols');if(ed>limits.exportDepth)throw Error('BOUND_exportDepth');const u=units.get(id);if(!u)return null;load(u,depth);initialize(u);if(u.opaqueExports){stop('CONDITIONAL_EXPORT_MUTATION',id);return null;}const x=u.exports.get(name);if(!x)return null;const tag=id+'#'+name;if(active.has(tag)){stop('CYCLIC_EXPORT',tag);return null;}active.add(tag);const next=[...chain,x.locator];out.exportLinks.push({module:id,name,locator:x.locator,status:'PROVEN'});let result;
  try{if(x.url){if(!units.has(x.url)){dep(u,x.url,x.binding,next,x.url);return null;}result=exported(x.url,x.binding,next,depth+1,ed+1);}else result=x.binding?binding(u,x.binding,new Map(),next,depth,ed+1):ev(x.node,u,new Map(),next,depth,ed+1);}finally{active.delete(tag);}return result;
 }
 function binding(u,name,env,chain,depth,ed){tick('symbols');initialize(u);if(env.has(name))return env.get(name);if(u.mutated.has(name))return null;const b=u.bindings.get(name);if(!b)return null;const tag=u.id+':'+name;if(active.has(tag)){stop('CYCLIC_BINDING',tag);return null;}active.add(tag);try{const next=[...chain,loc(u,b.node,'BINDING')];if(b.url){if(!units.has(b.url)){dep(u,b.url,b.export??'*',next,b.url);return null;}return b.namespace?val({namespace:b.url},next):exported(b.url,b.export,next,depth+1,ed);}const r=ev(b.node,u,env,next,depth,ed);return b.property?property(r,b.property,next,depth,ed):r;}finally{active.delete(tag);}}
 function property(o,k,chain,depth,ed){if(!o)return null;if(o.v?.namespace)return exported(o.v.namespace,k,[...chain,...o.proof],depth+1,ed+1);return o.v&&Object.hasOwn(o.v,k)?o.v[k]:null;}
 function ev(n,u,env,chain,depth,ed=0,call=0){tick();if(!n)return null;if(call>limits.callDepth)throw Error('BOUND_callDepth');const next=[...chain,loc(u,n)];
  if(ts.isParenthesizedExpression(n)||ts.isAwaitExpression(n))return ev(n.expression,u,env,next,depth,ed,call);
  if(ts.isIdentifier(n))return binding(u,n.text,env,next,depth,ed);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return val(n.text,next);if(ts.isNumericLiteral(n))return val(Number(n.text),next);
  if(ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isFunctionDeclaration(n))return val({fn:n,u,env:new Map(env)},next);
  if(ts.isObjectLiteralExpression(n)){const obj=Object.create(null);for(const p of n.properties){if(!ts.isPropertyAssignment(p)&&!ts.isShorthandPropertyAssignment(p))return null;const k=key(p.name);if(k===null)return null;obj[k]=ev(ts.isShorthandPropertyAssignment(p)?p.name:p.initializer,u,env,next,depth,ed,call);}return val(obj,next);}
  if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n)){const k=ts.isPropertyAccessExpression(n)?n.name.text:literal(n.argumentExpression);return k===null?null:property(ev(n.expression,u,env,next,depth,ed,call),k,next,depth,ed);}
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.CommaToken)return ev(n.right,u,env,next,depth,ed,call);
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken){const a=ev(n.left,u,env,next,depth,ed,call),b=ev(n.right,u,env,next,depth,ed,call);return a&&b&&['number','string'].includes(typeof a.v)&&['number','string'].includes(typeof b.v)?val(a.v+b.v,[...a.proof,...b.proof]):null;}
  if(ts.isTemplateExpression(n)){let s=n.head.text,p=[...next];for(const sp of n.templateSpans){const v=ev(sp.expression,u,env,next,depth,ed,call);if(!v||!['number','string'].includes(typeof v.v))return null;s+=v.v+sp.literal.text;p.push(...v.proof);}return val(s,p);}
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&!u.bindings.has(n.expression.text)&&!u.shadowed.has(n.expression.text)&&!u.mutated.has(n.expression.text)&&!env.has(n.expression.text)){
   if(n.expression.text==='URLSearchParams'&&n.arguments?.length===1){const obj=ev(n.arguments[0],u,env,next,depth,ed,call);if(!obj||typeof obj.v!=='object')return null;const pairs=[],proof=[...next];for(const [k,v]of Object.entries(obj.v)){if(!v||!['string','number'].includes(typeof v.v))return null;pairs.push([k,String(v.v)]);proof.push(...v.proof);}return val({queryString:new URLSearchParams(pairs).toString()},proof);}
  }
  if(ts.isCallExpression(n)){
   // webpack's explicit async chunk → bound module relationship. The filename
   // is resolved separately from retained runtime/manifest evidence.
   if(ts.isAwaitExpression(n.parent)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='then'&&n.arguments.length===1){const load=n.expression.expression,bind=n.arguments[0];
    if(ts.isCallExpression(load)&&ts.isPropertyAccessExpression(load.expression)&&load.expression.expression.getText(u.ast)===u.require&&load.expression.name.text==='e'&&load.arguments.length===1&&ts.isCallExpression(bind)&&ts.isPropertyAccessExpression(bind.expression)&&bind.expression.expression.getText(u.ast)===u.require&&bind.expression.name.text==='bind'&&bind.arguments.length===2&&bind.arguments[0].getText(u.ast)===u.require&&!u.mutated.has(u.require)){
     const cid=literal(load.arguments[0]),mid=literal(bind.arguments[1]);if(cid!==null&&mid!==null){const dest=registry.get(u.registry+'#'+mid);if(dest)return val({namespace:dest},next);if(registry.has(u.registry+'#'+mid)){stop('AMBIGUOUS_REQUIRED_FACTORY',mid);return null;}dep(u,mid,'*',next);const d=out.dependencies.find(d=>d.parent===u.id&&d.moduleId===mid);if(d){d.registry=u.registry;d.chunkIds=[...new Set([...(d.chunkIds??[]),cid])];d.chunkArguments=[...(d.chunkArguments??[]),{id:cid,value:ts.isNumericLiteral(load.arguments[0])?Number(cid):cid,proof:loc(u,load.arguments[0],'EXPLICIT_CHUNK_ARGUMENT')}];}return null;}
    }
   }
   if(ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='toString'&&!n.arguments.length){const q=ev(n.expression.expression,u,env,next,depth,ed,call);return typeof q?.v?.queryString==='string'?val(q.v.queryString,q.proof):null;}
   if(ts.isIdentifier(n.expression)&&n.expression.text===u.require&&!u.mutated.has(u.require)&&!u.bindings.has(u.require)&&n.arguments.length===1){const id=literal(n.arguments[0]);if(id===null){stop('DYNAMIC_MODULE_ID',loc(u,n));out.dependencies.push({parent:u.id,moduleId:null,state:'UNRESOLVED',reason:'DYNAMIC_MODULE_ID',acquisitionEligible:false,proofChain:next});return null;}const registryKey=u.registry+'#'+id,dest=registry.get(registryKey);if(registry.has(registryKey)&&dest===null){stop('AMBIGUOUS_REQUIRED_FACTORY',registryKey);return null;}if(!dest){dep(u,id,'*',next);return null;}return val({namespace:dest},next);}
   if(ts.isIdentifier(n.expression)&&n.expression.text==='fetch'&&!u.bindings.has('fetch')&&!env.has('fetch')&&!u.mutated.has('fetch')&&!u.shadowed.has('fetch')&&n.arguments.length===1){const v=ev(n.arguments[0],u,env,next,depth,ed,call);if(typeof v?.v!=='string')return null;let url;try{url=new URL(v.v,u.source.url);if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/token|secret|password|auth|session|key/i.test(k)))return null;}catch{return null;}const authority=resourceAuthority(url.href,input.authorities??[]);if(!seenRequests.has(url.href)){if(out.candidates.length>=limits.chains)throw Error('BOUND_chains');seenRequests.add(url.href);out.candidates.push({url:url.href,method:'GET',status:'PROVEN',acquisitionEligible:!!authority,authority,ownership:authority?'PROVIDER_CONTROLLED':'UNRESOLVED',proofChain:[...next,...v.proof],parameters:[...url.searchParams].map(([name,value])=>({name,value,proof:v.proof})),evidenceStatus:'DISCOVERY_ONLY',verificationEligible:false});}return null;}
   const f=ev(n.expression,u,env,next,depth,ed,call);if(!f?.v?.fn)return null;if(++invocationDepth>limits.callDepth)throw Error('BOUND_callDepth');try{const {fn,u:fu,env:fe}=f.v,e=new Map(fe);for(let i=0;i<fn.parameters.length;i++){if(!ts.isIdentifier(fn.parameters[i].name)||fn.parameters[i].dotDotDotToken)return null;e.set(fn.parameters[i].name.text,ev(n.arguments[i],u,env,next,depth,ed,call));}
   if(!ts.isBlock(fn.body))return ev(fn.body,fu,e,[...next,...f.proof],depth,ed,call+1);
   for(const st of fn.body.statements){if(ts.isVariableStatement(st)){for(const d of st.declarationList.declarations){if(!ts.isIdentifier(d.name))return null;e.set(d.name.text,ev(d.initializer,fu,e,next,depth,ed,call+1));}}else if(ts.isReturnStatement(st))return ev(st.expression,fu,e,next,depth,ed,call+1);else return null;}return null;}finally{invocationDepth--;}
  }return unknown;
 }
 try{
  if(Object.entries(input.linkingLimits??{}).some(([k,v])=>!Object.hasOwn(linkingBounds,k)||!Number.isSafeInteger(v)||v<0||v>linkingBounds[k]))throw Error('INVALID_BOUNDS');
  for(const source of [...input.modules].sort((a,b)=>a.url.localeCompare(b.url,'en'))){if(!source.providerControlled||!source.parentEvidence||sha256(source.code)!==source.sha256){stop('PROVENANCE_UNRESOLVED',source.url);continue;}if(Buffer.byteLength(source.code)>2097152){stop('RESOURCE_SIZE_BOUND',source.url);continue;}if(sources.has(source.url)){if(sources.get(source.url).sha256!==source.sha256)throw Error('CONFLICTING_MODULE_BODY');continue;}sources.set(source.url,source);const index=indexBundle(source);if(index.stops.length){for(const reason of index.stops)stop(reason,source.url);continue;}const ast=ts.createSourceFile(source.url,source.code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(ast.parseDiagnostics.length){stop('MALFORMED_MODULE',source.url);continue;}
   if(!index.factories.length){if(Buffer.byteLength(source.code)>limits.factoryBytes){stop('FACTORY_INDEX_REQUIRED',source.url);continue;}const u=unit(source,ast,ast,source.url);units.set(u.id,u);roots.push(u);}
   else{visit(ast,n=>{if(!ts.isCallExpression(n)||!ts.isPropertyAccessExpression(n.expression)||n.expression.name.text!=='push'||!ts.isArrayLiteralExpression(n.arguments[0]))return;const receiver=n.expression.expression.getText(ast),regName=receiver.match(/(?:webpackChunk|webpackJsonp)[\w$]*/)?.[0];const map=n.arguments[0].elements[1];if(!regName||!map||!ts.isObjectLiteralExpression(map))return;for(const p of map.properties){if(!ts.isPropertyAssignment(p)||!(ts.isFunctionExpression(p.initializer)||ts.isArrowFunction(p.initializer)))continue;const id=key(p.name),fn=p.initializer;if(id===null||fn.parameters.length!==3||fn.parameters.some(p=>!ts.isIdentifier(p.name)))continue;if(out.factories.length>=limits.factories)throw Error('BOUND_factories');const scope=new URL(source.url).origin+'#'+regName,rkey=scope+'#'+id;let ambiguous=registry.has(rkey);if(ambiguous){const prior=units.get(registry.get(rkey));if(prior&&sha256(prior.fn.getText(prior.ast))===sha256(fn.getText(ast)))continue;stop('AMBIGUOUS_FACTORY_ID',rkey);}const uid=source.url+'#'+id,u=unit(source,ast,fn.body,uid,fn);u.registry=scope;registry.set(rkey,ambiguous?null:uid);units.set(uid,u);roots.push(u);out.factories.push({id,parentUrl:source.url,parentHash:source.sha256,locator:loc(u,fn,'FACTORY'),bytes:Buffer.byteLength(fn.getText(ast)),registry:scope});}return false;});}
  }
  const demandRoots=roots.filter(u=>!u.registry||registry.get(u.registry+'#'+u.id.slice(u.id.lastIndexOf('#')+1))===u.id).filter(u=>/\.\s*(?:plan|planName|price|amount|currency|priceCurrency|billingPeriod|recurrence|priceRole|promotion|product|offer|country|market)\b/.test(u.source.code.slice(u.body.getStart(u.ast),u.body.end)));
  for(const u of demandRoots)initialize(u);
  const consumers=[...demandRoots];
  for(const outer of demandRoots)visit(outer.body,n=>{if(!ts.isFunctionLike(n)||!n.body||!ts.isBlock(n.body))return;const local={...outer,bindings:new Map(outer.bindings),exports:new Map(),imports:[],mutated:new Set(outer.mutated),body:n.body,initialized:false,shadowed:new Set([...outer.shadowed,...n.parameters.filter(p=>ts.isIdentifier(p.name)).map(p=>p.name.text)])};for(const p of n.parameters)if(ts.isIdentifier(p.name))local.bindings.delete(p.name.text);initialize(local);consumers.push(local);});
  const fields=input.fields??[];
  for(const u of consumers){visit(u.body,n=>{if(!ts.isPropertyAccessExpression(n))return;let ancestor=n.parent;while(ancestor&&ancestor!==u.body){if(ts.isFunctionLike(ancestor))return;ancestor=ancestor.parent;}const field=fields.find(f=>fieldNames[f]?.includes(n.name.text));if(!field)return;
    // Only a concrete receiver binding is a demand root. Parameter-only renderers
    // do not establish a request relation and cannot authorize module acquisition.
    let receiver=n.expression;while(ts.isPropertyAccessExpression(receiver))receiver=receiver.expression;
    if(!ts.isIdentifier(receiver)||!u.bindings.has(receiver.text))return;
    load(u,0);ev(n.expression,u,new Map(),[loc(u,n,'FIELD_CONSUMER_'+field)],0);
   });}
  for(const u of roots){if(!u.fn)initialize(u);}for(const u of roots)for(const i of u.imports)if(!units.has(i.url)&&!out.dependencies.some(d=>d.url===i.url)){const names=[...u.bindings].filter(([,b])=>b.url===i.url).map(([name])=>name);let used=false;visit(u.body,n=>{if(ts.isIdentifier(n)&&names.includes(n.text)&&(n.getStart(u.ast)<i.node.getStart(u.ast)||n.end>i.node.end))used=true;});out.dependencies.push({parent:u.id,moduleId:i.url,url:i.url,state:used?'RELEVANT_POSSIBLE':'UNRELATED',reason:used?'Static import without proven field-consumer demand':'No binding use in retained module',acquisitionEligible:false,proofChain:[loc(u,i.node,'IMPORT')]});}
 }catch(e){out.complete=false;stop(e.message);for(const d of out.dependencies)d.acquisitionEligible=false;for(const c of out.candidates)c.acquisitionEligible=false;}
 return out;
}
