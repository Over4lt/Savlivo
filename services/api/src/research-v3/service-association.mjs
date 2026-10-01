import {digest,providerBound} from './model.mjs';
import {projectWebSource,semanticMaterial} from './source.mjs';
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en');
export function observationService(o,objective) {
 if(o.kind!=='PROVIDER'||o.outcome!=='OK'||o.truncated||o.httpStatus!==200||digest(o.body)!==o.sha256||!providerBound(objective,o.url))return null;
 const native=projectWebSource(o,objective),b=native.bindings['/serviceId'];
 const identityNode=semanticMaterial(o).presentations.find(p=>p.start===b?.start&&p.end===b?.end);
 if(!identityNode||!['title','h1'].includes(identityNode.tag)||identityNode.ancestry.some(a=>['nav','footer','aside'].includes(a.tag)))return null;
 if(native.source.serviceId!==objective.serviceId||!b||digest(o.body.slice(b.start,b.end))!==b.sha256)return null;
 return {reference:'service-'+digest([o.id,o.sha256,objective.serviceId,b]).slice(0,24),name:objective.serviceName,observation:o.id,sha256:o.sha256,identity:b};
}
export function associateService(o,objective,p,semantic) {
 const known=observationService(o,objective),all=semanticMaterial(o),original=all.presentations.find(x=>x.id===p?.id),ancestry=original?[...original.ancestry,original]:[];
 const blocked=ancestry.some(a=>['nav','footer','aside','header'].includes(a.tag)||['navigation','contentinfo','complementary','banner'].includes(a.role)||['isRelatedTo','isAccessoryOrSparePartFor','isSimilarTo','hasPart'].includes(a.itemProp));
 const primary=ancestry.some(a=>a.tag==='main'||a.role==='main');
 const identities=all.presentations.filter(x=>x.itemProp==='name'&&x.ancestry.some(a=>/(?:^|\/)(?:Product|Service|SoftwareApplication)$/.test(a.itemType??''))).map(x=>({presentation:x.id,start:x.start,end:x.end,name:all.segments.filter(s=>s.start>=x.start&&s.end<=x.end).map(s=>s.text).join(' ').trim()}));
 const typed=ancestry.filter(a=>/(?:^|\/)(?:Product|Service|SoftwareApplication)$/.test(a.itemType??''));
 const scoped=typed.length?identities.filter(n=>{const node=all.presentations.find(x=>x.id===n.presentation);return node.ancestry.some(a=>a.start===typed.at(-1).start);}):identities;
 const competing=scoped.filter(n=>normalize(n.name)!==normalize(objective.serviceName));
 const structuredMatch=typed.length>0&&scoped.some(n=>normalize(n.name)===normalize(objective.serviceName));
 const predicates={establishedObservationIdentity:!!known,sameObservation:!!known&&(semantic?.reference===known.reference||semantic?.reference==null),sourceBoundPresentation:!!original,primaryStructure:primary||structuredMatch,notPeripheral:!blocked,noCompetingIdentity:competing.length===0,compatibleLocalRelationship:semantic?.relationship==null||['PRIMARY_SERVICE','UNKNOWN'].includes(semantic.relationship)};
 const reason=!known?'OBSERVATION_SERVICE_UNESTABLISHED':!predicates.sameObservation?'SERVICE_REFERENCE_INVALID':!original?'PRESENTATION_UNBOUND':blocked?'PERIPHERAL_PRESENTATION':competing.length?'COMPETING_SERVICE_IDENTITY':!predicates.primaryStructure?'PRIMARY_STRUCTURE_UNSUPPORTED':!predicates.compatibleLocalRelationship?'LOCAL_SERVICE_RELATIONSHIP_UNSUPPORTED':'PRIMARY_SERVICE_ASSOCIATION';
 return {eligible:Object.values(predicates).every(Boolean),reason,observation:o.id,knownService:known?.reference??null,identitySource:known?.identity??null,presentation:p?.id??null,localReference:semantic?.reference??null,relationship:semantic?.relationship??null,ancestry:ancestry.map(a=>({id:'container-'+a.start,tag:a.tag,role:a.role?.slice(0,128)??null,itemType:a.itemType?.slice(0,256)??null,itemProp:a.itemProp?.slice(0,128)??null})).slice(-16),competingIdentities:competing.slice(0,8).map(n=>({...n,name:n.name.slice(0,256)})),predicates};
}
