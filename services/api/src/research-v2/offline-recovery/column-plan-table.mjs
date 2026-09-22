import {normalizeText,monetary} from './extract.mjs';
import {countryLabel} from './attribution.mjs';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const cells=n=>n.children.filter(c=>c.tag==='td'||c.tag==='th');
export function consumeColumnPlanTable(c,source){
 if(c.sourceType!=='HTML'||!c.authorityEstablished||c.qualifierAmbiguous||c.nonPriceNumericRisk)return false;
 let cell=source.nodes.get(c.structuredPath);while(cell&&cell.tag!=='td')cell=cell.parent;
 if(!cell||cell.parent.tag!=='tr')return false;
 const row=cell.parent;let table=row;while(table&&table.tag!=='table')table=table.parent;if(!table)return false;
 const rs=[];function visit(n){if(n!==table&&n.tag==='table')return;if(n.tag==='tr')rs.push(n);else n.children.forEach(visit);}visit(table);
 if(rs.length<2||rs.length>32)return false;const header=cells(rs[0]),current=cells(row),col=current.indexOf(cell);
 if(col<1||header.length!==current.length||rs.some(r=>cells(r).length!==header.length||cells(r).some(c=>c.attrs.rowspan||c.attrs.colspan)))return false;
 if(header.some(h=>h.tag!=='th'||h.attrs.scope!=='col')||current[0]?.tag!=='th'||current[0].attrs.scope!=='row')return false;
 const billing=/^Month-to-month\s+Price\s*\(([A-Z]{3})\)\s*\*?$/i.exec(current[0].text);if(!billing||!Intl.supportedValuesOf('currency').includes(billing[1]))return false;
 if(new Set(header.slice(1).map(h=>normalizeText(h.text))).size!==header.length-1)return false;
 if((c.verificationConflictPeerLocators??[]).some(p=>{const n=source.nodes.get(p.path);return !n||n.start<row.start||n.end>row.end;}))return false;
 const h=header[col],bold=[...source.nodes.values()].filter(n=>['b','strong'].includes(n.tag)&&n.start>=h.start&&n.end<=h.end);
 if(bold.length!==1)return false;const plan=normalizeText(bold[0].text);if(!plan||plan.length>100||monetary(plan).length||/annual|trial|intro|add-on|bundle|from|student/i.test(plan))return false;
 const price=monetary(cell.text);if(price.length!==1||normalizeText(cell.text)!==normalizeText(price[0].raw+'/month')||price[0].amount!==c.amountNormalized||!/^\s*[^\d]+\d+(?:[.,]\d+)?\s*\/month\s*$/i.test(cell.text))return false;
 if(c.currency&&c.currency!==billing[1])return false;
 const permitted=new Set(['CURRENCY_UNRESOLVED','MULTIPLE_CONFLICTING_FACTS','PRODUCT_UNRESOLVED','STRUCTURAL_OWNERSHIP_WEAK']);if(c.blockingReasons.some(r=>!permitted.has(r)))return false;
 const declarations=[...source.nodes.values()].filter(n=>n.attrs?.['data-current-locale-country']);
 const selected=[...new Set(declarations.map(n=>countryLabel(n.attrs['data-current-locale-country'])))];
 if(selected.length!==1||selected[0]!==c.market||!c.attribution?.marketApplicabilityEstablished||c.attribution.conflictingMarketEvidence.length)return false;
 const provider={country:selected[0],proof:declarations.map(n=>({path:pathOf(n),attributes:n.attrs})),marketEvidence:c.attribution};
 const proof={kind:'SCOPED_PLAN_COLUMN_MONTHLY_ROW',bodyHash:source.bodyHash,tablePath:pathOf(table),rowPath:pathOf(row),planPath:pathOf(bold[0]),billingPath:pathOf(current[0]),cellPath:pathOf(cell),plan,amount:c.amountNormalized,currency:billing[1],billing:current[0].text,price:cell.text,provider};
 c.columnPlanTable=proof;c.product=plan;c.plan=plan;c.productOwnerEvidence={raw:plan,path:proof.planPath,method:proof.kind};c.attribution={...c.attribution,productOwnershipEstablished:true,productOwnerEvidence:c.productOwnerEvidence};
 c.currency=billing[1];c.currencyAmbiguous=false;c.currencyResolution={kind:'EXPLICIT_TABLE_ROW_CURRENCY',...proof};c.ownershipAmbiguous=false;c.crossCardRisk=false;c.billingPeriod='MONTHLY';c.billingPeriodAmbiguous=false;c.promotionOrTrial=null;c.qualifier=[];c.qualifierAmbiguous=false;c.qualifierPreservation={version:1,recognized:['MONTH_TO_MONTH'],required:[],unresolved:[],ownerPath:proof.cellPath,localPath:c.structuredPath};
 c.blockingReasons=[];c.verificationLevel=3;c.verificationConflictPeerLocators=[];
 c.offerRole={role:'REGULAR_BASE',basis:proof};c.verificationPriceRole=c.offerRole;c.commercial=columnTableCommercial(c,source);return true;
}
export function columnTableCommercial(c,source){const p=c.columnPlanTable;if(!p||p.bodyHash!==source.bodyHash||source.nodes.get(p.cellPath)?.text!==p.price||source.nodes.get(p.billingPath)?.text!==p.billing||source.nodes.get(p.planPath)?.text!==p.plan||c.product!==p.plan||c.amountNormalized!==p.amount||c.currency!==p.currency)return null;return {version:1,type:'RECURRING_MONTHLY',ordinaryMonthly:true,strongRecurringMonthly:true,providerPlanId:null,productConditions:[],priceConditions:[],monthlyEquivalentDisplay:false,nonRenewing:false,prepaid:false,oneTimePayment:false,evidence:[{kind:p.kind,path:p.cellPath,bodyHash:p.bodyHash,raw:p.price,proof:p}],reasons:[],monthlyBlockers:[]};}
