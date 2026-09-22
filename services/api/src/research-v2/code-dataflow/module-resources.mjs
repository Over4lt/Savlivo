// Pure missing-resource proof generation. No provider code execution or network.
import ts from 'typescript';
import {createHash} from 'node:crypto';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export const resourceBounds=Object.freeze({rawBytes:2097152,logicalBytes:524288,tokens:500000,factories:2048,references:64});
export function normalizedResource(value,parent){const u=new URL(value,parent);if(u.protocol!=='https:'||u.username||u.password)throw Error('UNSAFE_RESOURCE_URL');u.hash='';return u.href;}
export function resourceAuthority(url,authorities){return authorities.find(a=>a.hostname===new URL(url).hostname&&a.validated===true&&a.reference)??null;}
export function references(source){
 const body=Buffer.from(source.code);if(sha256(body)!==source.sha256)return {references:[],stops:['PARENT_HASH_MISMATCH']};
 if(body.length>resourceBounds.rawBytes)return {references:[],stops:['RESOURCE_TOO_LARGE']};
 const rows=[];const add=(raw,start,end,kind)=>{try{const url=normalizedResource(raw,source.url);rows.push({url,parentUrl:source.url,parentHash:source.sha256,locator:{start,end,unit:'UTF16'},rawReference:raw,kind,depth:(source.depth??0)+1});}catch{}};
 if(source.kind==='HTML'){
  // Tokenize tags with quoted attributes; skip raw script/style text and comments.
  // A data-src attribute or string inside a script is not an executable reference.
  const tags=/<!--[\s\S]*?-->|<\/?[A-Za-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
  let match;
  while((match=tags.exec(source.code))){
   const tag=match[0];if(tag.startsWith('<!--'))continue;
   const name=tag.match(/^<([a-z][a-z0-9:-]*)\b/i)?.[1]?.toLowerCase();
   if(name==='script'){
    const attrs=[...tag.slice(7,-1).matchAll(/(?:^|\s)([^\s=<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)];
    const src=attrs.filter(a=>a[1].toLowerCase()==='src');
    if(src.length===1){const raw=src[0][2]??src[0][3]??src[0][4];if(raw&&!raw.includes('&'))add(raw,match.index,match.index+tag.length,'SCRIPT_SRC');}
   }
   if(['script','style','textarea','title','template','noscript'].includes(name)){
    const end=new RegExp('</'+name+'\\s*>','ig');end.lastIndex=tags.lastIndex;const close=end.exec(source.code);if(!close)break;tags.lastIndex=end.lastIndex;
   }
  }
 }else{
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,source.code);let tokens=0;
  while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)if(++tokens>resourceBounds.tokens)return {references:[],stops:['TOKEN_BOUND']};
  const ast=ts.createSourceFile(source.url,source.code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(ast.parseDiagnostics.length)return {references:[],stops:['MALFORMED_MODULE']};
  const visit=n=>{if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))add(n.moduleSpecifier.text,n.moduleSpecifier.getStart(ast),n.moduleSpecifier.end,'STATIC_IMPORT');ts.forEachChild(n,visit);};visit(ast);
 }
 if(rows.length>resourceBounds.references)return {references:[],stops:['REFERENCE_BOUND']};
 return {references:rows,stops:[]};
}
export function validateReference(ref,parent,authorities){
 if(!parent||parent.url!==ref.parentUrl||parent.sha256!==ref.parentHash||sha256(parent.code)!==ref.parentHash)return {eligible:false,reason:'PARENT_PROVENANCE_FAILURE'};
 const actual=references(parent);if(actual.stops.length)return {eligible:false,reason:actual.stops[0]};
 if(!actual.references.some(r=>r.url===ref.url&&r.kind===ref.kind&&r.rawReference===ref.rawReference&&r.locator.start===ref.locator.start&&r.locator.end===ref.locator.end))return {eligible:false,reason:'REFERENCE_NOT_PROVEN'};
 const authority=resourceAuthority(ref.url,authorities);if(!authority)return {eligible:false,reason:'OWNERSHIP_UNRESOLVED'};
 if(/analytics|tracker|captcha|\/akam\/|marketingtech|rocket-loader/i.test(ref.url))return {eligible:false,reason:'UNRELATED_OR_SECURITY_RESOURCE'};
 if(ref.depth>3)return {eligible:false,reason:'IMPORT_DEPTH'};
 return {eligible:true,reason:'PROVEN_REFERENCE_AND_AUTHORITY',authority};
}
// Index complete static factory boundaries, retaining closures rather than inventing
// standalone source. Indexing is not semantic linking and never yields endpoints.
export function indexBundle(source){
 if(sha256(source.code)!==source.sha256)return {factories:[],stops:['PARENT_HASH_MISMATCH']};
 if(Buffer.byteLength(source.code)>resourceBounds.rawBytes)return {factories:[],stops:['RESOURCE_TOO_LARGE']};
 const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,source.code);let tokens=0;
 while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)if(++tokens>resourceBounds.tokens)return {factories:[],stops:['TOKEN_BOUND']};
 const ast=ts.createSourceFile(source.url,source.code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(ast.parseDiagnostics.length)return {factories:[],stops:['MALFORMED_MODULE']};
 const factories=[];let bounded=false;
 const visit=n=>{if(bounded)return;
  // Recognize webpack chunk registration's literal module registry, not arbitrary objects.
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='push'&&/webpackChunk|webpackJsonp/.test(n.expression.expression.getText(ast))&&n.arguments.length===1&&ts.isArrayLiteralExpression(n.arguments[0])){
   const registry=n.arguments[0].elements[1];if(registry&&ts.isObjectLiteralExpression(registry))for(const p of registry.properties){
    if(!ts.isPropertyAssignment(p)||!(ts.isArrowFunction(p.initializer)||ts.isFunctionExpression(p.initializer))||!p.initializer.body)continue;
    if(factories.length>=resourceBounds.factories){bounded=true;break;}
    const fn=p.initializer,start=fn.getStart(ast),end=fn.end,bytes=Buffer.byteLength(source.code.slice(start,end));
    factories.push({moduleId:p.name.getText(ast),parentUrl:source.url,parentHash:source.sha256,start,end,byteStart:Buffer.byteLength(source.code.slice(0,start)),byteEnd:Buffer.byteLength(source.code.slice(0,end)),bytes,sha256:sha256(source.code.slice(start,end)),closure:{start:0,end:source.code.length,sha256:source.sha256},status:bytes>resourceBounds.logicalBytes?'LOGICAL_SIZE_BOUND':'FACTORY_INDEXED_CLOSURE_LINK_REQUIRED',analysisEligible:false});
   }
  }ts.forEachChild(n,visit);
 };visit(ast);return {factories,stops:bounded?['FACTORY_BOUND']:[],tokens,endpointProof:false};
}
