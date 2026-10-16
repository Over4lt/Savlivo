import fs from 'node:fs';
import path from 'node:path';
import {canonical} from '../../research-v3/model.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {classifyAcquiredSource} from './source-classification.mjs';

const name='routing-only-source-classification.json';

export function writeRoutingOnlySourceProof(directory,target,classification){
 if(classification?.status!=='PROVIDER_SOURCE'||!classification.binding||!classification.sourceHash)throw Error('ROUTING_ONLY_SOURCE_NOT_ADMITTED');
 const value={version:1,target:target.id,status:classification.status,reason:classification.reason,requestedUrl:classification.requestedUrl,finalUrl:classification.finalUrl,sourceHash:classification.sourceHash,observationId:classification.observationId,binding:classification.binding};
 const file=path.join(directory,name);fs.writeFileSync(file+'.pending',JSON.stringify(value)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);
}

export function requireRoutingOnlySourceProof(directory,manifest){
 const scoped=manifest.inventory.filter(target=>target.authorities?.some(row=>row.routingOnly===true));
 if(!scoped.length)return;
 if(scoped.length!==1)throw Error('ROUTING_ONLY_SOURCE_SCOPE_INVALID');
 let proof;try{proof=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));}catch{throw Error('ROUTING_ONLY_SOURCE_PROOF_REQUIRED');}
 const target=scoped[0],attempts=[...iterateMarketRunRecords(path.join(directory,'journal'),{owned:true})].filter(row=>row.type==='V2_ACQUISITION_RESULT'&&row.payload.target?.id===target.id).flatMap(row=>row.payload.result?.attempts??[]).filter(attempt=>attempt.outcome==='OBSERVED');
 const attempt=attempts.find(row=>row.page?.url===proof.finalUrl&&(row.requestedUrl??row.page?.requestedUrl)===proof.requestedUrl&&row.page?.sourceIntegrity?.sha256===proof.sourceHash),page=attempt?.page;
 if(proof.version!==1||proof.target!==target.id||proof.status!=='PROVIDER_SOURCE'||!page)throw Error('ROUTING_ONLY_SOURCE_PROOF_INVALID');
 const classified=classifyAcquiredSource({target,page:{...page,requestedUrl:attempt.requestedUrl??page.requestedUrl,bodyHash:page.sourceIntegrity.sha256},body:page.rawSource?.text,observationId:proof.observationId});
 if(classified.status!=='PROVIDER_SOURCE'||classified.sourceHash!==proof.sourceHash||canonical(classified.binding)!==canonical(proof.binding))throw Error('ROUTING_ONLY_SOURCE_PROOF_INVALID');
}
