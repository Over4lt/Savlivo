import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest,openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {readOccurrence,statuses} from '../offline-replay/corpus.mjs';
import {readHistoricalReference} from './geo-evidence.mjs';
import {createEvidenceTrustContext,liveCampaignTrustRootKind,resolveTrustedReference} from './evidence-trust-root.mjs';

function fixture(t,id='campaign-a'){
 const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'evidence-trust-root-'))),root=path.join(parent,id);fs.mkdirSync(root);
 t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 const body='<html><p>USD 12/month</p></html>',page={url:'https://provider.example/pricing',rawSource:{text:body},sourceIntegrity:{sha256:digest(body)}};
 const store=openMarketRunStore(path.join(root,'journal')),record=store.append('FIXTURE',{value:'retained',page});store.close();
 const base={path:'journal/record-00000001.json',hash:record.hash,recordHash:record.hash,sequence:1,trustRoot:{kind:liveCampaignTrustRootKind,id}};
 const context=createEvidenceTrustContext({liveRoot:root,liveRootId:id,historicalRoot:process.cwd()});
 return {parent,root,body,page,record,base,context,file:path.join(root,base.path)};
}

test('explicit external campaign root reopens retained record and body',t=>{
 const f=fixture(t),ref={...f.base,pointer:'/value'},occurrence={record:{...f.base,pointer:'/page'}};
 assert.equal(readHistoricalReference(ref,f.context),'retained');
 const checked=readOccurrence(occurrence,f.context);assert.equal(checked.status,statuses.intact);assert.equal(checked.body,f.body);
});

test('unmarked historical reference keeps explicit repository-root semantics',t=>{
 const f=fixture(t),ref={path:f.base.path,hash:f.record.hash,pointer:'/value'};
 assert.equal(readHistoricalReference(ref,f.root),'retained');
});

test('relative traversal outside live root fails closed',t=>{
 const f=fixture(t),ref={...f.base,path:'../outside.json',pointer:'/value'};
 assert.throws(()=>readHistoricalReference(ref,f.context),/REFERENCE_OUTSIDE_TRUSTED_ROOT/);
});

test('absolute path outside live root fails closed',t=>{
 const f=fixture(t),ref={...f.base,path:path.join(f.parent,'outside.json'),pointer:'/value'};
 assert.throws(()=>readHistoricalReference(ref,f.context),/REFERENCE_OUTSIDE_TRUSTED_ROOT/);
});

test('campaign reference cannot be opened with another campaign context',t=>{
 const f=fixture(t),other=path.join(f.parent,'campaign-b');fs.mkdirSync(other);
 const wrong=createEvidenceTrustContext({liveRoot:other,liveRootId:'campaign-b',historicalRoot:process.cwd()});
 assert.throws(()=>readHistoricalReference({...f.base,pointer:'/value'},wrong),/LIVE_EVIDENCE_TRUST_ROOT_MISMATCH/);
});

test('tampered retained journal remains fail closed',t=>{
 const f=fixture(t),record=JSON.parse(fs.readFileSync(f.file));record.payload.value='tampered';fs.writeFileSync(f.file,JSON.stringify(record));
 assert.throws(()=>readHistoricalReference({...f.base,pointer:'/value'},f.context),/Journal record integrity/);
});

test('live reference without explicit trusted context never falls back to cwd',t=>{
 const f=fixture(t);
 assert.throws(()=>readHistoricalReference({...f.base,pointer:'/value'}),/LIVE_EVIDENCE_TRUST_CONTEXT_REQUIRED/);
});

test('symlink escape outside live root fails closed',t=>{
 const f=fixture(t),outside=path.join(f.parent,'outside-record.json');fs.copyFileSync(f.file,outside);fs.symlinkSync(outside,path.join(f.root,'escaped.json'));
 assert.throws(()=>resolveTrustedReference({...f.base,path:'escaped.json'},f.context),/REFERENCE_OUTSIDE_TRUSTED_ROOT/);
});
