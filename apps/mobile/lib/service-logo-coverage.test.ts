import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {URL} from "node:url";
import ts from "typescript";
import {serviceCatalog} from "../../../packages/contracts/src/catalog";

const source=readFileSync(new URL("../app/index.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("index.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let mapping:ts.ObjectLiteralExpression;
function visit(n:ts.Node){
  if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==="serviceLogoAssets")mapping=n.initializer as ts.ObjectLiteralExpression;
  ts.forEachChild(n,visit);
}
visit(ast);
const entries=mapping!.properties.map(p=>{
  assert.ok(ts.isPropertyAssignment(p));
  const name=p.name;const slug=ts.isStringLiteral(name)?name.text:name.getText(ast);
  assert.ok(ts.isCallExpression(p.initializer));
  assert.equal(p.initializer.expression.getText(ast),"require");
  const path=p.initializer.arguments[0];assert.ok(ts.isStringLiteral(path));
  return {slug,path:path.text};
});
const report=JSON.parse(readFileSync(new URL("../../../docs/catalog/global-47/service-logo-coverage.json",import.meta.url),"utf8"));

test("every canonical service has a valid explicit logo or a documented exception",()=>{
  assert.equal(new Set(entries.map(r=>r.slug)).size,entries.length,"duplicate slug mapping");
  assert.deepEqual(report.services.map((r:any)=>r.slug).sort(),serviceCatalog.map(s=>s.slug).sort());
  for(const service of serviceCatalog){
    const entry=entries.find(r=>r.slug===service.slug);
    const audit=report.services.find((r:any)=>r.slug===service.slug);
    if(!entry){assert.equal(audit.status,"documented-exception");assert.ok(audit.reason.length>30);continue;}
    assert.equal(audit.status,"local-logo");
    assert.equal(entry.path,"../assets/service-logos/"+audit.path.split("/").pop());
    const bytes=readFileSync(new URL(entry.path,new URL("../app/index.tsx",import.meta.url)));
    assert.ok(bytes.length>100);
    assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(0,3).equals(Buffer.from([255,216,255])),"PNG/JPEG bytes required");
    assert.equal(createHash("sha256").update(bytes).digest("hex"),audit.sha256);
  }
  assert.equal(entries.length,74);
  assert.equal(report.services.filter((r:any)=>r.status==="documented-exception").length,4);
  for(const entry of entries)assert.ok(serviceCatalog.some(s=>s.slug===entry.slug));
});

test("new artwork has official source provenance while existing assets remain unchanged",()=>{
  const old=report.services.filter((r:any)=>r.before==="local-logo");assert.equal(old.length,39);
  const added=report.services.filter((r:any)=>r.before!=="local-logo"&&r.status==="local-logo");assert.equal(added.length,35);
  for(const row of added){assert.match(row.url,/^https:\/\//);assert.match(row.page,/^https:\/\//);if(row.kind.includes("App Store"))assert.ok(row.seller);}
  assert.match(source,/const logoSource =\s*serviceLogoAssets\[serviceSlug\]/);
  assert.match(source,/resizeMode="contain"/);
  assert.match(source,/serviceName\s*\.slice\(0, 2\)/);
});
