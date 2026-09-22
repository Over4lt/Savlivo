// Bounded static DOM-field evidence. Never executes code or changes canonical claims.
import ts from 'typescript';
import {htmlTree,hash} from '../offline-recovery/extract.mjs';
export const currencyFormatterBounds=Object.freeze({scriptBytes:65536,documentBytes:2000000,nodes:30000,elements:128,functions:64});
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const text=n=>n?.getText().replace(/\s+/g,'')??'';
const literal=n=>n&&ts.isStringLiteral(n)?n.text:null;
function attr(n){if(!n||!ts.isCallExpression(n)||!ts.isPropertyAccessExpression(n.expression)||n.expression.name.text!=='getAttribute'||n.arguments.length!==1)return null;const a=n.expression.expression;if(!ts.isCallExpression(a)||text(a.expression)!=='document.getElementById'||a.arguments.length!==1)return null;return {id:literal(a.arguments[0]),attribute:literal(n.arguments[0])};}
function normalized(node,names){const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,node.getText());let out='';for(let k=scanner.scan();k!==ts.SyntaxKind.EndOfFileToken;k=scanner.scan()){const t=scanner.getTokenText();if(k===ts.SyntaxKind.SemicolonToken)continue;out+=k===ts.SyntaxKind.Identifier?(names[t]??t):k===ts.SyntaxKind.StringLiteral?JSON.stringify(scanner.getTokenValue()):t;}return out;}
function syntax(ast){
 const fs=ast.statements.filter(ts.isFunctionDeclaration);if(fs.length>currencyFormatterBounds.functions)return [];
 const found=[];
 for(const f of fs){const ss=f.body?.statements;if(!ss||ss.length!==6||!f.name||f.parameters.length)continue;
 const decl=ss.slice(0,4).map(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.length===1?s.declarationList.declarations[0]:null);if(decl.some(d=>!d||!ts.isIdentifier(d.name)))continue;
 const [elements,currency,locale,regex]=decl,select=elements.initializer;if(!select||!ts.isCallExpression(select)||text(select.expression)!=='document.getElementsByClassName'||select.arguments.length!==1)continue;
 const className=literal(select.arguments[0]),cur=attr(currency.initializer),loc=attr(locale.initializer);if(!className||!cur?.id||!cur.attribute||loc?.id!==cur.id||!loc.attribute)continue;
 if(!/^[A-Za-z][\w-]*$/.test(className)||!/^data-[\w-]+$/.test(cur.attribute)||!/^data-[\w-]+$/.test(loc.attribute))continue;
 const branch=ss[4];if(!ts.isIfStatement(branch)||branch.elseStatement||!ts.isBinaryExpression(branch.expression)||![ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.EqualsEqualsEqualsToken].includes(branch.expression.operatorToken.kind)||text(branch.expression.left)!==locale.name.text||literal(branch.expression.right)===null)continue;
 const inner=ts.isBlock(branch.thenStatement)?branch.thenStatement.statements:[branch.thenStatement];if(inner.length!==1||!ts.isExpressionStatement(inner[0])||!ts.isBinaryExpression(inner[0].expression)||text(inner[0].expression.left)!==regex.name.text||inner[0].expression.operatorToken.kind!==ts.SyntaxKind.EqualsToken)continue;
 const patterns=[text(regex.initializer),text(inner[0].expression.right)];if(patterns.some(p=>!['/[^\\d.-]/g','/[^\\d-]/g'].includes(p)))continue;
 const loop=ss[5];if(!ts.isForStatement(loop)||!ts.isVariableDeclarationList(loop.initializer)||loop.initializer.declarations.length!==1||!ts.isBlock(loop.statement))continue;
 const counter=loop.initializer.declarations[0].name.getText(),ls=loop.statement.statements;if(ls.length!==3||!ts.isVariableStatement(ls[0])||!ts.isExpressionStatement(ls[1])||!ts.isBinaryExpression(ls[1].expression)||!ts.isIfStatement(ls[2]))continue;
 const element=ls[0].declarationList.declarations[0]?.name.getText(),flag=ls[1].expression.left.getText();const body=ls[2].thenStatement;if(!ts.isBlock(body)||!ts.isVariableStatement(body.statements[0]))continue;const number=body.statements[0].declarationList.declarations[0]?.name.getText();const nested=body.statements[1];if(!nested||!ts.isIfStatement(nested)||!ts.isBlock(nested.thenStatement)||!ts.isVariableStatement(nested.thenStatement.statements[0]))continue;const price=nested.thenStatement.statements[0].declarationList.declarations[0]?.name.getText();
 const names={[elements.name.text]:'E',[currency.name.text]:'C',[locale.name.text]:'L',[regex.name.text]:'R',[counter]:'I',[element]:'N',[flag]:'F',[number]:'V',[price]:'P'};
 if(Object.keys(names).length!==9)continue;
 const guards=[];const checkGuard=n=>{if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)return checkGuard(n.left)&&checkGuard(n.right);if(!ts.isPrefixUnaryExpression(n)||n.operator!==ts.SyntaxKind.ExclamationToken||!ts.isCallExpression(n.operand)||text(n.operand.expression)!==element+'.textContent.includes'||n.operand.arguments.length!==1)return false;const v=literal(n.operand.arguments[0]);if(v===null||v.length>8||guards.length>=16)return false;guards.push(v);return true;};if(!checkGuard(ls[1].expression.right))continue;
 const guardText=guards.map(v=>'!N.textContent.includes('+JSON.stringify(v)+')').join('&&');
 const expected='for(let I=0;I<E.length;I++){let N=E[I];F='+guardText+';if(F){const V=N.textContent.replace(R,"");if(V!=""){const P=parseFloat(V);N.textContent=new Intl.NumberFormat(L,{style:"currency",currency:C}).format(P)}}}';
 // Compare token structure, preserving literals and operators. Variable renaming is irrelevant.
 const template=ts.createSourceFile('fixture.js',expected,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(normalized(loop,names)!==normalized(template.statements[0],{}))continue;
 const listener=ast.statements.some(s=>ts.isExpressionStatement(s)&&ts.isCallExpression(s.expression)&&text(s.expression.expression)==='document.addEventListener'&&literal(s.expression.arguments[0])==='DOMContentLoaded'&&text(s.expression.arguments[1])===f.name.text&&s.expression.arguments.length===2);
 if(!listener)continue;
 // Reject reassignment/shadowing of the function or relevant browser intrinsics outside the recognized body.
 const outside=ast.text.slice(0,f.getStart())+ast.text.slice(f.end);if(new RegExp('(?:\\b(?:let|const|var|function)\\s+(?:Intl|document|parseFloat)\\b|\\b'+f.name.text+'\\s*=|(?:Intl|document)\\.[\\w.]+\\s*=)').test(outside))continue;
 found.push({guards,className,configId:cur.id,currencyAttribute:cur.attribute,localeAttribute:loc.attribute,branchValue:literal(branch.expression.right),patterns,start:f.getStart(),end:f.end});
 }return found;
}
export function bindCurrencyFormatter({document,resource,offers=[]}){
 const reject=reason=>({status:'UNRESOLVED',reason,bindings:[],relationships:[]});
 for(const d of [document,resource]){if(!d||hash(d.body)!==d.sha256||d.receipt?.bodyHash!==d.sha256||!d.receipt.intact)return reject('BODY_INTEGRITY');if(!d.receipt.serviceEstablished)return reject('OWNERSHIP_UNRESOLVED');if(d.receipt.geo?.classification!=='G1')return reject('GEO_UNRESOLVED');}
 if(document.receipt.service!==resource.receipt.service||document.receipt.geo.targetCountry!==resource.receipt.geo.targetCountry)return reject('RESOURCE_SCOPE_MISMATCH');
 if(Buffer.byteLength(document.body)>currencyFormatterBounds.documentBytes||Buffer.byteLength(resource.body)>currencyFormatterBounds.scriptBytes)return reject('BYTE_BOUND');
 const tree=htmlTree(document.body);if(tree.nodes.length>currencyFormatterBounds.nodes)return reject('NODE_BOUND');
 const links=tree.nodes.filter(n=>n.tag==='script'&&n.attrs.src&&resolve(n.attrs.src,document.url)===resource.url);if(links.length!==1)return reject('EXACT_RESOURCE_LINK_REQUIRED');
 const ast=ts.createSourceFile(resource.url,resource.body,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(ast.parseDiagnostics.length)return reject('SCRIPT_SYNTAX');const formats=syntax(ast);if(formats.length!==1)return reject('FORMATTER_UNRESOLVED_OR_CONFLICTING');const f=formats[0];
 const configs=tree.nodes.filter(n=>n.attrs?.id===f.configId);if(configs.length!==1)return reject('CONFIG_MISSING_OR_CONFLICTING');const config=configs[0],currency=config.attrs[f.currencyAttribute],locale=config.attrs[f.localeAttribute];if([config,...ancestors(config)].some(n=>Object.keys(n.attrs??{}).some(k=>/^[:@]|^v-/.test(k))))return reject('DYNAMIC_CONFIG');if(!/^[A-Z]{3}$/.test(currency??'')||!locale)return reject('EXPLICIT_CURRENCY_REQUIRED');
 const nodes=tree.nodes.filter(n=>(n.attrs?.class??'').split(/\s+/).includes(f.className));if(nodes.length>currencyFormatterBounds.elements)return reject('ELEMENT_BOUND');const relationships=[],bindings=[],rejectedElements=[];
 for(const n of nodes){const path=pathOf(n),raw=n.text.trim();if(n.children.some(c=>c.tag!=='#text')||!/^\d{1,12}$/.test(raw)){rejectedElements.push({path,reason:'NON_LITERAL_OR_UNSUPPORTED_AMOUNT'});continue;}if([n,...ancestors(n)].some(p=>p.attrs?.hidden!==undefined||/display\s*:\s*none/i.test(p.attrs?.style??''))){rejectedElements.push({path,reason:'HIDDEN_PRICE_ELEMENT'});continue;}
 if(locale===f.branchValue&&f.patterns[1]==='/[^\\d-]/g'&&raw.includes('.'))continue;
 if(f.guards.some(v=>raw.includes(v))){rejectedElements.push({path,reason:'FORMATTER_BRANCH_NOT_APPLICABLE'});continue;}
 const offer=offers.find(o=>o.path===path&&o.amount===raw);const proof={price:{bodyHash:document.sha256,path,span:[n.start,n.end],raw},config:{bodyHash:document.sha256,path:pathOf(config),attribute:f.currencyAttribute,value:currency},resource:{url:resource.url,bodyHash:resource.sha256,parentHash:document.sha256,referenceSpan:[links[0].start,links[0].openEnd]},formatter:{span:[f.start,f.end],selectorClass:f.className,operation:'Intl.NumberFormat',currencyArgument:'EXPLICIT_DOM_ATTRIBUTE'},provenance:{document:document.receipt,resource:resource.receipt}};
 const dynamicElement=[n,...ancestors(n)].some(p=>Object.keys(p.attrs??{}).some(k=>/^[:@]|^v-/.test(k)));
 const ready=!dynamicElement&&offer?.ownershipEstablished===true&&offer?.ordinaryMonthly===true&&offer?.marketEstablished===true&&offer?.conflictClear===true;
 const row={currency,amount:raw,path,proof,status:ready?'FIELD_BINDING_SUPPORTED':'RELATIONSHIP_PROVEN_OFFER_FIELDS_UNRESOLVED',verificationEligible:false,...(dynamicElement?{remainingBlocker:'DYNAMIC_PRICE_COMPONENT'}:{})};relationships.push(row);if(ready){if(offer.currency&&offer.currency!==currency)return reject('INLINE_CURRENCY_CONFLICT');bindings.push(row);}
 }
 return {rejectedElements,formatterRelationship:{documentHash:document.sha256,resourceHash:resource.sha256,configPath:pathOf(config),currency,selectorClass:f.className,span:[f.start,f.end]},status:bindings.length?'FIELD_BINDINGS_SUPPORTED':relationships.length?'RELATIONSHIPS_ONLY':'UNRESOLVED',reason:bindings.length?null:relationships.length?'OFFER_FIELDS_NOT_INDEPENDENTLY_ESTABLISHED':'NO_EXACT_NUMERIC_PRICE_ELEMENT',relationships,bindings};
}
function* ancestors(n){for(let p=n.parent;p;p=p.parent)yield p;}

function resolve(value,parent){try{const u=new URL(value,parent);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
