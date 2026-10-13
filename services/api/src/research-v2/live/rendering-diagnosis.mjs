// Planning-only diagnosis for retained provider HTML that contains commercial
// values behind declarative visibility conditions. It grants no evidence,
// authority, market applicability, or browser transport by itself.
export function conditionalCommercialRenderingRequired(body){
 const text=String(body??''),conditions=text.match(/\b(?:x-show|v-if|ng-if|data-(?:show|visible|condition)|:[\w-]*(?:show|visible))\s*=/giu)??[];
 return conditions.length>0&&/(?:USD|EUR|GBP|NOK|SEK|DKK|CHF|CAD|AUD|JPY|\$|€|£)\s*\d|\d(?:[.,]\d{1,2})?\s*(?:USD|EUR|GBP|NOK|SEK|DKK|CHF|CAD|AUD|JPY|\$|€|£)/iu.test(text)&&/(?:\/\s*(?:month|mo\.?|monat|måned)|per\s+(?:month|monat|måned)|monthly|monatlich|månedsvis|\/\s*(?:year|yr\.?|jahr|år)|annual|yearly|jährlich)/iu.test(text);
}
