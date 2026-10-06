// Unicode decimal normalization preserves the original occurrence and offsets.
// Decimal digit runs are defined by Unicode, independent of language or market.
export function normalizeSourceNumber(raw){
 return raw.normalize('NFKC').replace(/\p{Decimal_Number}/gu,c=>{
  const point=c.codePointAt(0);let zero=point;
  while(zero>0&&/\p{Decimal_Number}/u.test(String.fromCodePoint(zero-1)))zero--;
  return String((point-zero)%10);
 }).replaceAll('−','-').replaceAll('٫','.').replaceAll('٬',',').replace(/[\u00a0\u202f]/g,' ');
}
export function sourceNumberCandidates(raw){
 const signed=normalizeSourceNumber(raw),negative=signed.startsWith('-'),n=negative?signed.slice(1):signed,values=[];
 const add=x=>{const value=negative?-x:x;if(Number.isFinite(value)&&!values.includes(value))values.push(value);};
 if(/^\d+$/.test(n))add(Number(n));
 if(/^\d{1,3}([, .])\d{3}(?:\1\d{3})*$/.test(n))add(Number(n.replace(/[, .]/g,'')));
 if(/^\d+[.,]\d{1,6}$/.test(n))add(Number(n.replace(',','.')));
 if(/^\d{1,3}(?:,\d{3})+\.\d{1,6}$/.test(n))add(Number(n.replaceAll(',','')));
 if(/^\d{1,3}(?:\.\d{3})+,\d{1,6}$/.test(n))add(Number(n.replaceAll('.','').replace(',','.')));
 if(/^\d{1,3}(?: \d{3})+[.,]\d{1,6}$/.test(n))add(Number(n.replaceAll(' ','').replace(',','.')));
 return values;
}
