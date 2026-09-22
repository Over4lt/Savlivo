import assert from 'node:assert/strict';
import {ResourceBudget} from './module-controller.mjs';
export const catalogModuleCaps=Object.freeze({
 perTarget:{module:{urls:2,executions:2,retries:0,requests:16,bytes:6291456},endpoint:{urls:1,executions:1,retries:0,requests:8,bytes:4194304},total:{urls:3,executions:3,retries:0,requests:24,bytes:10485760}},
 perRun:{module:{urls:64,executions:64,retries:0,requests:512,bytes:134217728},endpoint:{urls:24,executions:24,retries:0,requests:192,bytes:67108864},total:{urls:88,executions:88,retries:0,requests:704,bytes:201326592}},
 analysisPerTarget:200000,analysisPerRun:12800000
});
// Reserve a complete target analysis allowance before invoking tracing. No target
// borrows another target's request/byte allowance; all transport is counted twice
// (per target and aggregate), never dispatched twice.
export class CatalogModuleBudget {
 constructor(persist=()=>{}){this.persist=persist;this.analysisReserved=0;this.analysisActual=0;this.targets={};this.run=new ResourceBudget(()=>this.save(),catalogModuleCaps.perRun);this.save();}
 save(){this.persist({caps:catalogModuleCaps,analysisReserved:this.analysisReserved,analysisActual:this.analysisActual,targets:this.targets,aggregate:this.run?.state??null});}
 startTarget(id){assert(!Object.hasOwn(this.targets,id),'TARGET_ALREADY_SCHEDULED');if(this.run.state.stop||this.analysisReserved+catalogModuleCaps.analysisPerTarget>catalogModuleCaps.analysisPerRun)return null;this.analysisReserved+=catalogModuleCaps.analysisPerTarget;this.targets[id]={analysis:0,usage:null};const budget=new ResourceBudget(s=>{this.targets[id].usage=s;this.save();},catalogModuleCaps.perTarget,this.run);this.save();return budget;}
 finishTarget(id,work){assert(Number.isSafeInteger(work)&&work>=0&&work<=catalogModuleCaps.analysisPerTarget);this.targets[id].analysis=work;this.analysisActual+=work;this.save();}
}
