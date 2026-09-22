// Static request mapping only. No provider code is executed. No filename guessing.
import ts from 'typescript';
import {sha256,resourceAuthority} from './module-resources.mjs';
export const chunkBounds=Object.freeze({registries:8,entries:4096,moduleIds:8,chunkIds:8,candidatesPerDependency:1,depth:6,work:50000,resourceBytes:2097152,tokens:500000});
export function mapRequiredChunks({modules=[],dependencies=[],authorities=[],limits={}}){
 const caps={...chunkBounds,...limits},out={bounds:caps,mappings:[],conflicts:[],stops:[],work:0,entries:0,complete:true};const runtimes=[],manifests=[];
 const tick=()=>{if(++out.work>caps.work)throw Error('MAPPING_WORK_BOUND');};
 const loc=(s,n,kind)=>({status:'PROVEN',kind,module:s.url,sha256:s.sha256,start:n.getStart(s.ast),end:n.end});
 const lit=n=>n&&(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))?n.text:null;
 const addEntry=()=>{if(++out.entries>caps.entries)throw Error('MAPPING_ENTRIES_BOUND');};
 function evaluate(n,s,env=new Map(),depth=0,seen=new Set()){
  tick();if(!n)return null;if(depth>caps.depth)throw Error('MAPPING_DEPTH_BOUND');
  const p=[loc(s,n,'STATIC_MAPPING_VALUE')],v=(value,proof=p)=>({value,proof});
  if(ts.isParenthesizedExpression(n))return evaluate(n.expression,s,env,depth+1,seen);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return v(n.text);if(ts.isNumericLiteral(n))return v(Number(n.text));
  if(ts.isIdentifier(n)){if(env.has(n.text))return env.get(n.text);if(seen.has(n.text)||s.mutable.has(n.text))return null;const b=s.constants.get(n.text);if(!b)return null;return evaluate(b,s,env,depth+1,new Set([...seen,n.text]));}
  if(ts.isObjectLiteralExpression(n)){const obj=Object.create(null);for(const e of n.properties){if(!ts.isPropertyAssignment(e)||!e.name||!(ts.isIdentifier(e.name)||ts.isStringLiteral(e.name)||ts.isNumericLiteral(e.name)))return null;addEntry();const k=e.name.text;if(Object.hasOwn(obj,k))return null;obj[k]=evaluate(e.initializer,s,env,depth+1,seen);if(!obj[k])return null;}return v(obj);}
  if(ts.isElementAccessExpression(n)||ts.isPropertyAccessExpression(n)){const obj=evaluate(n.expression,s,env,depth+1,seen),k=ts.isPropertyAccessExpression(n)?v(n.name.text):evaluate(n.argumentExpression,s,env,depth+1,seen);if(!obj||!k||typeof obj.value!=='object'||!Object.hasOwn(obj.value,String(k.value)))return null;const r=obj.value[String(k.value)];return v(r.value,[...p,...obj.proof,...k.proof,...r.proof]);}
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken){const a=evaluate(n.left,s,env,depth+1,seen),b=evaluate(n.right,s,env,depth+1,seen);if(!a||!b||!['number','string'].includes(typeof a.value)||!['number','string'].includes(typeof b.value))return null;return v(a.value+b.value,[...p,...a.proof,...b.proof]);}
  if(ts.isTemplateExpression(n)){let result=n.head.text,proof=[...p];for(const part of n.templateSpans){const x=evaluate(part.expression,s,env,depth+1,seen);if(!x||!['number','string'].includes(typeof x.value))return null;result+=x.value+part.literal.text;proof.push(...x.proof);}return v(result,proof);}
  if(ts.isConditionalExpression(n)&&ts.isBinaryExpression(n.condition)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken].includes(n.condition.operatorToken.kind)){const a=evaluate(n.condition.left,s,env,depth+1,seen),b=evaluate(n.condition.right,s,env,depth+1,seen);if(!a||!b||typeof a.value!==typeof b.value)return null;const r=evaluate(a.value===b.value?n.whenTrue:n.whenFalse,s,env,depth+1,seen);return r?v(r.value,[...p,...a.proof,...b.proof,...r.proof]):null;}
  return null;
 }
 function contexts(s){return s.rootContext?.sha256??s.parentEvidence?.reference?.parentHash??s.parentEvidence?.parentHash??s.parentEvidence?.pageHash??null;}
 try{
  if(Object.entries(limits).some(([k,v])=>!Object.hasOwn(chunkBounds,k)||!Number.isSafeInteger(v)||v<0||v>chunkBounds[k]))throw Error('INVALID_MAPPING_BOUNDS');
  const required=dependencies.filter(d=>d.state==='REQUIRED_PROVEN'&&d.moduleId!==null&&!d.url);
  if(required.length>caps.moduleIds)throw Error('MODULE_ID_BOUND');
  if(!required.length)return out;
  const sorted=[...modules].sort((a,b)=>a.url.localeCompare(b.url,'en'));
  if(sorted.length>caps.registries)throw Error('REGISTRY_COUNT_BOUND');
  for(const src of sorted){
   if(!src.providerControlled||!src.parentEvidence||sha256(src.code)!==src.sha256){out.stops.push({reason:'REGISTRY_PROVENANCE_UNRESOLVED',url:src.url});continue;}
   if(Buffer.byteLength(src.code)>caps.resourceBytes){out.stops.push({reason:'REGISTRY_SIZE_BOUND',url:src.url});continue;}
   if(src.kind==='JSON'||/^\s*\{/.test(src.code)){
    let j;try{j=JSON.parse(src.code);}catch{j=null;}
    // Explicit module/chunk manifest; route file lists alone do not prove module membership.
    if(j&&typeof j.publicPath==='string'&&j.modules&&j.chunks){const parsed=ts.parseJsonText(src.url,src.code);let duplicate=false;const check=n=>{tick();if(ts.isObjectLiteralExpression(n)){const seen=new Set();for(const p of n.properties){const k=p.name?.text;if(seen.has(k))duplicate=true;seen.add(k);}}ts.forEachChild(n,check);};check(parsed);if(duplicate){out.conflicts.push({state:'UNRESOLVED_CONFLICT',url:src.url,reason:'DUPLICATE_MANIFEST_KEYS'});continue;}const entries=Object.keys(j.modules).length+Object.keys(j.chunks).length;if(out.entries+entries>caps.entries)throw Error('MAPPING_ENTRIES_BOUND');out.entries+=entries;manifests.push({source:src,j});continue;}
   }
   const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,src.code);let tokens=0;while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)if(++tokens>caps.tokens)throw Error('MAPPING_TOKEN_BOUND');
   const s={...src,ast:ts.createSourceFile(src.url,src.code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),constants:new Map(),mutable:new Set(),assignments:new Map(),groups:new Set()};if(s.ast.parseDiagnostics.length){out.stops.push({reason:'MALFORMED_RUNTIME',url:s.url});continue;}
   // Inspect one lexical scope at a time; never merge same-named runtime variables
   // across functions. Constants are restricted to that exact lexical body.
   const scopes=[s.ast];const walk=n=>{tick();if(ts.isFunctionLike(n)&&n.body&&ts.isBlock(n.body))scopes.push(n.body);ts.forEachChild(n,walk);};walk(s.ast);
   for(const scope of scopes){const r={...s,constants:new Map(),mutable:new Set(),assignments:new Map(),groups:new Set(),locals:new Set(scope.parent&&ts.isFunctionLike(scope.parent)?scope.parent.parameters.filter(p=>ts.isIdentifier(p.name)).map(p=>p.name.text):[])};
    const scan=n=>{tick();if(ts.isFunctionDeclaration(n)&&n.name)r.locals.add(n.name.text);if(n!==scope&&ts.isFunctionLike(n)){const nested=x=>{tick();if(ts.isBinaryExpression(x)&&x.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&x.operatorToken.kind<=ts.SyntaxKind.LastAssignment){const l=x.left,property=ts.isPropertyAccessExpression(l)?l.name.text:ts.isElementAccessExpression(l)?lit(l.argumentExpression):null;if((ts.isPropertyAccessExpression(l)||ts.isElementAccessExpression(l))&&ts.isIdentifier(l.expression)&&['u','p'].includes(property)){const name=l.expression.text,record=r.assignments.get(name)??{u:[],p:[]};record[property].push({node:x.right,assignment:x,conditional:true});r.assignments.set(name,record);}}ts.forEachChild(x,nested);};nested(n);return;}

     if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){r.locals.add(n.name.text);if(r.constants.has(n.name.text))r.mutable.add(n.name.text);r.constants.set(n.name.text,n.initializer);}
     if(ts.isPropertyAccessExpression(n)&&/^webpackChunk|^webpackJsonp/.test(n.name.text))r.groups.add(n.name.text);
     if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){let root=n.left;while(ts.isPropertyAccessExpression(root)||ts.isElementAccessExpression(root))root=root.expression;if(ts.isIdentifier(root))r.mutable.add(root.text);
      const property=ts.isPropertyAccessExpression(n.left)?n.left.name.text:ts.isElementAccessExpression(n.left)?lit(n.left.argumentExpression):null;
      if((ts.isPropertyAccessExpression(n.left)||ts.isElementAccessExpression(n.left))&&ts.isIdentifier(n.left.expression)&&['u','p'].includes(property)){const name=n.left.expression.text,record=r.assignments.get(name)??{u:[],p:[]};let a=n.parent,conditional=false;while(a&&a!==scope){if(ts.isIfStatement(a)||ts.isConditionalExpression(a)||ts.isIterationStatement(a,false))conditional=true;a=a.parent;}record[property].push({node:n.right,assignment:n,conditional:conditional||n.operatorToken.kind!==ts.SyntaxKind.EqualsToken});r.assignments.set(name,record);}
     }ts.forEachChild(n,scan);
    };scan(scope);for(const [name,parts]of r.assignments)if(r.locals.has(name)&&(parts.u.length||parts.p.length))runtimes.push({source:r,name,parts});
   }
  }
  for(const dep of required){const proposals=[],parent=modules.find(s=>dep.proofChain?.some(h=>h.module===s.url&&h.sha256===s.sha256)),chunkIds=dep.chunkIds??[];if(chunkIds.length>caps.chunkIds)throw Error('CHUNK_ID_BOUND');
   for(const {source,j}of manifests){if(!parent||!contexts(parent)||contexts(parent)!==contexts(source))continue;const ids=j.modules[String(dep.moduleId)]?.chunks;if(!Array.isArray(ids)||!ids.length||ids.some(x=>!['number','string'].includes(typeof x)))continue;if(ids.length>caps.chunkIds)throw Error('CHUNK_ID_BOUND');for(const id of ids){const file=j.chunks[String(id)]?.file;if(typeof file!=='string')continue;proposals.push({base:j.publicPath,file,chunkId:String(id),source,proof:[...dep.proofChain,{status:'PROVEN',kind:'MODULE_CHUNK_MANIFEST',module:source.url,sha256:source.sha256,path:'/modules/'+dep.moduleId+'/chunks'},{status:'PROVEN',kind:'CHUNK_FILE',module:source.url,sha256:source.sha256,path:'/chunks/'+id+'/file'},{status:'PROVEN',kind:'PUBLIC_PATH',module:source.url,sha256:source.sha256,path:'/publicPath'}]});}}
   for(const runtime of runtimes){const {source:s,parts}=runtime;if(!parent||!contexts(parent)||contexts(parent)!==contexts(s))continue;if(dep.registry&&!s.groups.has(dep.registry.split('#').at(-1)))continue;
    if(parts.u.length!==1||parts.p.length!==1||parts.u[0].conditional||parts.p[0].conditional){out.conflicts.push({dependency:dep.moduleId,url:s.url,state:'UNRESOLVED_CONFLICT',reason:'RUNTIME_MAPPING_ASSIGNMENT_AMBIGUITY'});continue;}
    const fn=parts.u[0].node;if(!(ts.isArrowFunction(fn)||ts.isFunctionExpression(fn))||fn.parameters.length!==1||!ts.isIdentifier(fn.parameters[0].name))continue;
    const body=ts.isBlock(fn.body)?fn.body.statements.length===1&&ts.isReturnStatement(fn.body.statements[0])?fn.body.statements[0].expression:null:fn.body;if(!body)continue;
    const base=evaluate(parts.p[0].node,s);if(typeof base?.value!=='string')continue;
    for(const id of chunkIds){const file=evaluate(body,s,new Map([[fn.parameters[0].name.text,{value:dep.chunkArguments?.find(a=>a.id===id)?.value??id,proof:dep.proofChain}]]));if(typeof file?.value!=='string')continue;proposals.push({base:base.value,file:file.value,chunkId:String(id),source:s,proof:[...dep.proofChain,loc(s,parts.u[0].assignment,'CHUNK_FILENAME_FUNCTION'),...file.proof,...base.proof]});}
   }
   const resolved=[];for(const p of proposals){try{if(!p.base||p.base==='auto')continue;const page=p.source.rootContext?.url??p.source.parentEvidence?.reference?.parentUrl??p.source.parentEvidence?.parentUrl??p.source.parentEvidence?.page;if(!/^https:\/\//.test(p.base)&&!page)continue;const url=new URL(p.base+p.file,page??p.source.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||[...url.searchParams.keys()].some(k=>/token|secret|password|auth|session|key/i.test(k))||/analytics|captcha|tracker/i.test(url.href))continue;resolved.push({...p,url:url.href});}catch{}}
   const unique=[...new Set(resolved.map(p=>p.url))];const conflict=out.conflicts.some(c=>c.dependency===dep.moduleId||c.reason==='DUPLICATE_MANIFEST_KEYS')||unique.length>caps.candidatesPerDependency;
   if(conflict){out.conflicts.push({dependency:dep.moduleId,state:'UNRESOLVED_CONFLICT',resources:unique,reason:'MULTIPLE_OR_AMBIGUOUS_RESOURCES'});out.mappings.push({moduleId:dep.moduleId,status:'UNRESOLVED_CONFLICT',acquisitionEligible:false,proofChain:dep.proofChain});continue;}
   if(!unique.length){out.mappings.push({moduleId:dep.moduleId,status:'UNRESOLVED',reason:'NO_PROVEN_MODULE_CHUNK_RESOURCE_CHAIN',acquisitionEligible:false,proofChain:dep.proofChain});continue;}
   const p=resolved[0],authority=resourceAuthority(p.url,authorities),reference={url:p.url,parentUrl:p.source.url,parentHash:p.source.sha256,kind:'PROVEN_CHUNK_MAPPING',depth:(parent.depth??0)+1,moduleId:dep.moduleId,proofChain:p.proof};
   out.mappings.push({moduleId:dep.moduleId,chunkId:p.chunkId,url:p.url,status:'PROVEN',ownership:authority?(authority.ownership==='PROVIDER_OWNED'?'PROVIDER_OWNED':'PROVIDER_CONTROLLED'):authorities.some(a=>a.hostname===new URL(p.url).hostname&&a.ownership==='THIRD_PARTY')?'THIRD_PARTY':'UNRESOLVED',authority,acquisitionEligible:!!authority&&reference.depth<=3,reference,proofChain:p.proof,dependency:dep,alreadyRetained:modules.some(m=>m.url===p.url&&sha256(m.code)===m.sha256),verificationEligible:false});
  }
 }catch(e){out.complete=false;out.stops.push({reason:e.message});for(const m of out.mappings)m.acquisitionEligible=false;}
 return out;
}
