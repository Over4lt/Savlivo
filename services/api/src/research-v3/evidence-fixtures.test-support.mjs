// Annotated OFFLINE understanding results. Values describe source semantics;
// only the production evaluator creates proposition states.
export const url='https://provider.example/plans';
const charge=(id,amount,amountText,currency,currencyText,unit,expression,extra={})=>({id,money:{amount,amountText,currency,currencyText},cadence:{unit,expression},role:'ORDINARY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false,...extra});
export const evidenceFixtures=[
 {key:'ordinary',language:'English',name:'Harbor',market:'US',html:'<article><h2>Reader</h2><p>For individuals: our subscription renews every month. We charge USD 14.99.</p></article>',plans:[{name:'Reader',anchor:'For individuals:',charges:[charge('recurring',14.99,'14.99','USD','USD','MONTHLY','every month')]}],expected:14.99},
 {key:'norwegian',language:'Norwegian',name:'Fjord',market:'NO',html:'<section><p>Privat abonnement: NOK 149 hver måned, ordinær pris.</p></section>',plans:[{name:'Privat',anchor:'Privat abonnement:',charges:[charge('recurring',149,'149','NOK','NOK','MONTHLY','hver måned')]}],expected:149},
 {key:'free-intro',language:'German',name:'Leseraum',market:'DE',html:'<section><h2>Lesen</h2><p>Für Privatkunden: Mitgliedschaft zunächst EUR 0 für 1 Monat, danach regulär EUR 12,90 monatlich bis zur Kündigung.</p></section>',plans:[{name:'Lesen',anchor:'Für Privatkunden:',charges:[charge('intro',0,'0','EUR','EUR','UNKNOWN',null,{role:'INTRODUCTORY',duration:'1 Monat'}),charge('recurring',12.9,'12,90','EUR','EUR','MONTHLY','monatlich')],transition:true}],expected:12.9},
 {key:'discount-intro',language:'French',name:'Atelier',market:'FR',html:'<article><p>Abonnement particulier : EUR 5,00 pendant 3 mois, puis EUR 16,50 chaque mois, tarif normal reconduit.</p></article>',plans:[{name:'Particulier',anchor:'Abonnement particulier',charges:[charge('intro',5,'5,00','EUR','EUR','MONTHLY','mois',{role:'INTRODUCTORY',duration:'3 mois'}),charge('recurring',16.5,'16,50','EUR','EUR','MONTHLY','chaque mois')],transition:true}],expected:16.5},
 {key:'benefit',language:'Portuguese',name:'Leitura',market:'BR',html:'<section><p>A assinatura pessoal mensal inclui um benefício de BRL 29,90 em créditos. Não é o preço da assinatura.</p></section>',plans:[{name:'Pessoal',anchor:'A assinatura pessoal',charges:[charge('credit',29.9,'29,90','BRL','BRL','MONTHLY','mensal',{role:'CREDIT'})]}]},
 {key:'installment',language:'Korean',name:'책마루',market:'KR',html:'<div><p>개인 구매 가격 KRW 120,000. 12회 할부로 매월 KRW 10,000, 구독이 아닙니다.</p></div>',plans:[{name:'개인 구매',anchor:'개인 구매 가격',relationship:'INSTALLMENT',charges:[charge('installment',10000,'10,000','KRW','KRW','MONTHLY','매월',{derivation:'ARITHMETIC',role:'OTHER'})]}]},
 {key:'annual',language:'Japanese',name:'音楽庫',market:'JP',html:'<article><p>個人向け年間定期購読。JPY 12,000、年額料金のみ。</p></article>',plans:[{name:'年間',anchor:'個人向け年間',charges:[charge('recurring',12000,'12,000','JPY','JPY','YEARLY','年額')]}]},
 {key:'annual-equivalent',language:'English',name:'Orchard',market:'AU',html:'<section><p>Personal subscription billed USD 120 per year; USD 10 equivalent per month calculated as 120 / 12.</p></section>',plans:[{name:'Annual',anchor:'Personal subscription billed',charges:[charge('annual',120,'120','USD','USD','YEARLY','per year'),charge('equivalent',10,'10','USD','USD','MONTHLY','per month',{derivation:'ARITHMETIC',role:'OTHER'})]}]},
 {key:'multiple-plans',language:'French',name:'Cinéma',market:'FR',html:'<section><h2>Essentiel</h2><p>Abonnement individuel Essentiel : EUR 7,00 par mois.</p></section><section><h2>Famille</h2><p>Abonnement familial Famille : EUR 13,00 par mois.</p></section>',plans:[{name:'Essentiel',anchor:'Abonnement individuel',charges:[charge('recurring',7,'7,00','EUR','EUR','MONTHLY','par mois')]},{name:'Famille',anchor:'Abonnement familial',charges:[charge('recurring',13,'13,00','EUR','EUR','MONTHLY','par mois')]}],expected:[7,13]},
 {key:'unrelated-money',language:'English',name:'Meadow',market:'GB',html:'<section><p>For individual subscribers, membership renews monthly at GBP 18. Our unrelated charity donation was GBP 300.</p></section>',plans:[{name:'Member',anchor:'For individual subscribers',charges:[charge('recurring',18,'18','GBP','GBP','MONTHLY','monthly'),charge('donation',300,'300','GBP','GBP','UNKNOWN',null,{role:'OTHER'})]}],expected:18},
 {key:'ambiguous',language:'German',name:'Archiv',market:'DE',html:'<div><p>Für Privatkunden: EUR 9,00 für die Mitgliedschaft, möglicherweise monatlich oder jährlich.</p></div>',plans:[{name:'Mitglied',anchor:'Für Privatkunden',charges:[charge('recurring',9,'9,00','EUR','EUR','UNKNOWN',null,{ambiguity:true})]}]},
 {key:'wrong-market',language:'Portuguese',name:'Escuta',market:'PT',html:'<article><p>Assinatura pessoal apenas para residentes no Brasil: BRL 19,90 por mês.</p></article>',plans:[{name:'Pessoal',anchor:'Assinatura pessoal apenas',market:'BR',charges:[charge('recurring',19.9,'19,90','BRL','BRL','MONTHLY','por mês')]}]},
 {key:'trial-only',language:'English',name:'Window',market:'CA',html:'<p>Consumer subscription trial costs CAD 0 for the first month. No recurring price is stated.</p>',plans:[{name:'Trial',anchor:'Consumer subscription trial',charges:[charge('intro',0,'0','CAD','CAD','MONTHLY','month',{role:'INTRODUCTORY',duration:'first month'})]}]},
 {key:'negated-subscription',language:'English',name:'Canvas',market:'NZ',html:'<p>For individuals: NZD 25 is a one-time purchase, not a subscription.</p>',plans:[{name:'Purchase',anchor:'For individuals:',relationship:'ONE_TIME',charges:[charge('purchase',25,'25','NZD','NZD','UNKNOWN',null,{role:'OTHER'})]}]},
 // Faithful presentation fixture from retained provider material: exact quoted
 // pricing strings and personal-account context; compacted markup, not a replay
 // of the full acquired page and never a production service exception.
 {key:'retained-oracle',language:'Japanese',name:'Spotify Premium',market:'JP',html:'<section><h2>Premium Standard</h2><p>1つのアカウント - お一人さま向け。</p><p>1ヶ月間￥0、その後は月額￥1,080。</p><p>キャンペーン期間終了後は月額￥1,080</p><p>いつでもキャンセル可能です。</p></section>',plans:[{name:'Premium Standard',anchor:'1つのアカウント',container:true,charges:[charge('intro',0,'0','JPY','￥','UNKNOWN',null,{role:'INTRODUCTORY',duration:'1ヶ月'}),charge('recurring',1080,'1,080','JPY','￥','MONTHLY','月額')],transition:true}],expected:1080}
];
export function fixtureInput(f,{country=true,bounds={},seeds=[url]}={}) {
 const body='<html><title>'+f.name+'</title><body>'+f.html+'</body></html>';
 const objective={kind:'PRICE',serviceId:'fixture-service',serviceName:f.name,providerHosts:['provider.example'],markets:[f.market],seeds};
 const fixtures=[{url:'https://provider.example/robots.txt',transport:'DIRECT',contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DIRECT',body}];
 if(country)fixtures.push({url:'https://provider.example/robots.txt',transport:'DECODO',country:f.market,contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DECODO',country:f.market,body});
 return {objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true,DECODO:country,TAVILY:false},bounds,planning:{initialPerspective:country?'COUNTRY':'UNBOUND'},fixtures};
}
const span=s=>({start:s.start,end:s.end,quote:s.text,translated:null});
export function evidenceCompletion(r,f) {
 const identity=r.material.segments.find(s=>s.text===f.name);
 return {schema:r.schema,observationId:r.observation.id,observationSha256:r.observation.sha256,language:f.language,translationArtifact:null,service:{name:f.name,ambiguity:false,support:[span(identity)],populations:[],account:[]},offers:f.plans.map(plan=>{
  const anchor=r.material.segments.find(s=>s.text.includes(plan.anchor));
  const enclosing=r.material.presentations.filter(p=>p.start<=anchor.start&&p.end>=anchor.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start));
  const p=plan.container?enclosing.at(-1):enclosing[0];
  const supports=r.material.segments.filter(s=>s.start>=p.start&&s.end<=p.end).map(span);
  return {presentation:p.id,name:plan.name,service:f.name,audience:'CONSUMER',relationship:plan.relationship??'SUBSCRIPTION',qualifiers:[],ambiguity:false,support:supports,market:{country:plan.market??null,basis:plan.market?'EXPLICIT':'UNKNOWN',ambiguity:false,support:plan.market?supports:[]},charges:plan.charges.map(c=>{
   const segment=supports.find(s=>s.quote.includes(c.money.amountText));const start=c.money.amountText===null?null:segment.start+segment.quote.indexOf(c.money.amountText);
   return {...structuredClone(c),money:{...c.money,amountSpan:start===null?null:{start,end:start+c.money.amountText.length,quote:c.money.amountText}},...(plan.transition&&c.id==='recurring'?{role:'SUBSEQUENT'}:{}),support:supports};
  }),transitions:plan.transition?[{from:'intro',to:'recurring',kind:'RECURS_AFTER_INTRO',ambiguity:false,support:supports}]:[]};
 })};
}
