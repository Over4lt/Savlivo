// Standards-oriented current tender/recognized co-circulation compatibility.
// ISO 4217 currency codes / ISO 3166-1 territories. Unknown territories fail closed.
// Explicit snapshot, 2026-10-01; see docs/research-v3-service-currency-context.md.
// This is a narrowing constraint, never a source of market truth or money.
const groups={
 EUR:'AD AT AX BE BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM TF VA YT',
 USD:'AS BQ EC FM GU IO MH MP PR PW SV TC TL UM US VG VI',
 XCD:'AG AI DM GD KN LC MS VC',XOF:'BF BJ CI GW ML NE SN TG',XAF:'CF CG CM GA GQ TD',XPF:'NC PF WF',
 AED:'AE',AFN:'AF',ALL:'AL',AMD:'AM',AOA:'AO',ARS:'AR',AUD:'AU CC CX HM KI NF NR TV',AZN:'AZ',BAM:'BA',BBD:'BB',BDT:'BD',BHD:'BH',BIF:'BI',BMD:'BM',BND:'BN',BOB:'BO',BRL:'BR',BSD:'BS',BWP:'BW',BYN:'BY',BZD:'BZ',CAD:'CA',CDF:'CD',CHF:'CH LI',CLP:'CL',CNY:'CN',COP:'CO',CRC:'CR',CUP:'CU',CVE:'CV',CZK:'CZ',DJF:'DJ',DKK:'DK FO GL',DOP:'DO',DZD:'DZ',EGP:'EG',ERN:'ER',ETB:'ET',FJD:'FJ',FKP:'FK',GBP:'GB GG GS IM JE',GEL:'GE',GHS:'GH',GIP:'GI',GMD:'GM',GNF:'GN',GTQ:'GT',GYD:'GY',HKD:'HK',HNL:'HN',HTG:'HT',HUF:'HU',IDR:'ID',ILS:'IL',INR:'IN',IQD:'IQ',IRR:'IR',ISK:'IS',JMD:'JM',JOD:'JO',JPY:'JP',KES:'KE',KGS:'KG',KHR:'KH',KMF:'KM',KPW:'KP',KRW:'KR',KWD:'KW',KYD:'KY',KZT:'KZ',LAK:'LA',LBP:'LB',LKR:'LK',LYD:'LY',MAD:'MA EH',MDL:'MD',MGA:'MG',MKD:'MK',MMK:'MM',MNT:'MN',MOP:'MO',MRU:'MR',MUR:'MU',MVR:'MV',MWK:'MW',MXN:'MX',MYR:'MY',MZN:'MZ',NGN:'NG',NIO:'NI',NOK:'NO BV SJ',NPR:'NP',NZD:'NZ CK NU PN TK',OMR:'OM',PEN:'PE',PGK:'PG',PHP:'PH',PKR:'PK',PLN:'PL',PYG:'PY',QAR:'QA',RON:'RO',RSD:'RS',RUB:'RU',RWF:'RW',SAR:'SA',SBD:'SB',SCR:'SC',SDG:'SD',SEK:'SE',SGD:'SG',SHP:'SH',SLE:'SL',SOS:'SO',SRD:'SR',SSP:'SS',STN:'ST',SYP:'SY',THB:'TH',TJS:'TJ',TMT:'TM',TND:'TN',TOP:'TO',TRY:'TR',TTD:'TT',TWD:'TW',TZS:'TZ',UAH:'UA',UGX:'UG',UYU:'UY',UZS:'UZ',VES:'VE',VND:'VN',VUV:'VU',WST:'WS',YER:'YE',ZAR:'ZA',ZMW:'ZM'
};
const multiple={BN:['BND','SGD'],SG:['SGD','BND'],BT:['BTN','INR'],LS:['LSL','ZAR'],NA:['NAD','ZAR'],SZ:['SZL','ZAR'],PA:['PAB','USD'],PS:['ILS','JOD'],LR:['LRD','USD'],ZW:['USD','ZWG','ZAR'],CW:['XCG'],SX:['XCG']};
const map=new Map();for(const [currency,regions] of Object.entries(groups))for(const region of regions.split(' '))map.set(region,[currency]);
for(const [region,currencies] of Object.entries(multiple))map.set(region,currencies);
export const marketCurrencyMetadata=Object.freeze({version:1,asOf:'2026-10-01',basis:'ISO_4217_TERRITORY_COMPATIBILITY',unknown:'NO_NARROWING'});
export const compatibleCurrencies=country=>[...(map.get(country)??[])];
