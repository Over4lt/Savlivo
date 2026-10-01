// Offline faithful text transformations, never candidate/proposition completions.
export const fixtures=[
 {language:'English',name:'Harbor',original:'Harbor personal subscription costs USD 14.99 per month for customers in US.',translated:'Harbor personal subscription costs USD 14.99 per month for customers in US.',market:'US'},
 {language:'Norwegian',name:'Fjord',original:'Fjord personlig abonnement koster NOK 149 per måned for kunder i Norge.',translated:'Fjord personal subscription costs NOK 149 per month for customers in Norway.',market:'NO'},
 {language:'German',name:'Leseraum',original:'Leseraum: persönliche Mitgliedschaft, EUR 12,90 pro Monat für Kunden in DE.',translated:'Leseraum: personal membership, EUR 12,90 per month for customers in DE.',market:'DE'},
 {language:'French',name:'Atelier',original:'Atelier : abonnement personnel, EUR 16,50 par mois pour les clients en FR.',translated:'Atelier: personal subscription, EUR 16,50 per month for customers in FR.',market:'FR'},
 {language:'Portuguese',name:'Leitura',original:'Leitura: assinatura pessoal, BRL 29,90 por mês para clientes em BR.',translated:'Leitura: personal subscription, BRL 29,90 per month for customers in BR.',market:'BR'},
 {language:'Japanese',name:'読書室',original:'読書室：個人向け定期購読、JPY 1,400、毎月。JPの顧客向け。',translated:'読書室: personal subscription, JPY 1,400 per month for customers in JP.',market:'JP'},
 {language:'Korean',name:'책마루',original:'책마루: 개인 정기 구독, KRW 9,900 매월. KR 고객용.',translated:'책마루: personal subscription, KRW 9,900 per month for customers in KR.',market:'KR'}
];
export const url='https://provider.example/plans';
export function config(f,{bounds={},geo=false}={}) {
 const wrapper=f.language==='German'?'section':f.language==='French'?'article':'p';
 const body=`<html lang="${f.language==='English'?'en':'und'}"><title>${f.name}</title><body><${wrapper}>${f.original}</${wrapper}></body></html>`;
 const objective={kind:'PRICE',serviceId:'unseen',serviceName:f.name,providerHosts:['provider.example'],markets:[f.market],seeds:[url]};
 const fixtures=[{url:'https://provider.example/robots.txt',transport:'DIRECT',contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DIRECT',body}];
 if(geo)fixtures.push({url:'https://provider.example/robots.txt',transport:'DECODO',country:f.market,contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DECODO',country:f.market,body});
 return {objective,provider:{reviewed:true,serviceId:'unseen',hosts:objective.providerHosts},permissions:{DIRECT:true,DECODO:geo},planning:{initialPerspective:'UNBOUND'},bounds,fixtures};
}
export function completion(r,f) {
 return {schema:r.schema,observationId:r.observation.id,observationSha256:r.observation.sha256,language:f.language,segments:r.material.segments.map(s=>({start:s.start,end:s.end,original:s.text,text:s.text===f.original?f.translated:s.text,status:'FAITHFUL'}))};
}
