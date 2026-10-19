import {privateDataPool as pool} from "./private-data-db.js";
import {countryCurrencyData} from "../../../packages/contracts/src/markets.js";
import {serviceCatalog} from "../../../packages/contracts/src/catalog.js";

export type PriceAnalyticsFilters={service:string|null;market:string|null;plan:string|null;period:"3M"|"6M"|"1Y"|"All"};
type Current={service_slug:string;plan_slug:string;plan_name:string;history_series_id:string|null;country_code:string;
  currency:string;monthly_price_minor:number;verified_at:string|Date;last_checked_at:string|Date};
type Event={history_series_id:string;history_event_kind:"BASELINE"|"BOOTSTRAP_BASELINE"|"PRICE_CHANGE";
  plan_identity:string;plan_name:string;service_slug:string;country_code:string;currency:string;billing_interval:string;
  monthly_price_minor:number;provider_verified_at:string|Date;observed_at:string|Date;provider_effective_at:string|Date|null;
  source_url:string};
const periods=["3M","6M","1Y","All"] as const;
const isStrong="(verification='authoritative-provider' OR (verification='multi-source' AND source_count>=2 AND verified_by_agreement))";
const stamp=(value:string|Date)=>new Date(value).toISOString();
const eventTime=(row:Event)=>stamp(row.history_event_kind==="BOOTSTRAP_BASELINE"?row.observed_at:row.provider_verified_at);
const sqlEventTime="(CASE WHEN h.history_event_kind='BOOTSTRAP_BASELINE' THEN h.observed_at ELSE h.provider_verified_at END)";
const nameOf=(slug:string)=>serviceCatalog.find(service=>service.slug===slug)?.name??slug;
const marketOf=(code:string)=>countryCurrencyData.find(([id])=>id===code)?.[1]??code;

export function parsePriceAnalyticsFilters(params:URLSearchParams):PriceAnalyticsFilters {
  if([...params.keys()].some(key=>!["service","market","plan","period"].includes(key)) ||
    [...params.keys()].some(key=>params.getAll(key).length!==1))throw new Error("INVALID_FILTER");
  const service=params.get("service")||null,market=params.get("market")||null,plan=params.get("plan")||null;
  const period=params.get("period")||"3M";
  if(service&&!/^[a-z0-9][a-z0-9-]{0,79}$/.test(service) ||
    market&&!countryCurrencyData.some(([code])=>code===market) ||
    plan&&!/^vh:[0-9a-f]{64}$/.test(plan) ||
    !periods.includes(period as typeof periods[number]) ||
    (market||plan)&&!service)throw new Error("INVALID_FILTER");
  return {service,market,plan,period:period as PriceAnalyticsFilters["period"]};
}

export function periodStart(period:PriceAnalyticsFilters["period"],now:Date):Date|null {
  if(period==="All")return null;
  const months=period==="3M"?3:period==="6M"?6:12;
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months,1,
    now.getUTCHours(),now.getUTCMinutes(),now.getUTCSeconds(),now.getUTCMilliseconds()));
  const lastDay=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  start.setUTCDate(Math.min(now.getUTCDate(),lastDay));
  return start;
}

export function projectPriceAnalytics(current:Current[],events:Event[],filters:PriceAnalyticsFilters,now=new Date()) {
  const start=periodStart(filters.period,now)?.getTime()??-Infinity,ending=now.getTime();
  const active=current.filter(row=>row.service_slug===filters.service&&
    (!filters.market||row.country_code===filters.market)&&(!filters.plan||row.history_series_id===filters.plan));
  const seriesMap=new Map<string,Event[]>();
  for(const row of events) {
    if(row.service_slug!==filters.service || filters.market&&row.country_code!==filters.market ||
      filters.plan&&row.history_series_id!==filters.plan)continue;
    if(!["BASELINE","BOOTSTRAP_BASELINE","PRICE_CHANGE"].includes(row.history_event_kind) ||
      row.billing_interval!=="MONTHLY_RECURRING" || !Number.isSafeInteger(row.monthly_price_minor) || row.monthly_price_minor<=0)continue;
    const rows=seriesMap.get(row.history_series_id)??[];rows.push(row);seriesMap.set(row.history_series_id,rows);
  }
  const changes:ReturnType<typeof change>[]=[];
  const series=[];
  const heatmap=[];
  for(const [id,rows] of seriesMap) {
    rows.sort((a,b)=>Date.parse(eventTime(a))-Date.parse(eventTime(b)));
    const eligible=rows.filter(row=>Date.parse(eventTime(row))<=ending);
    if(!eligible.length)continue;
    const prior=eligible.filter(row=>Date.parse(eventTime(row))<start).at(-1);
    const within=eligible.filter(row=>Date.parse(eventTime(row))>=start);
    if(!within.length&&!prior)continue;
    const first=within[0]??prior!;
    const baseline=prior??(first.history_event_kind!=="PRICE_CHANGE"?first:null);
    const timeline=prior?[prior,...within]:within;
    const points=timeline.map((row,index)=>{
      const at=index===0&&prior&&Number.isFinite(start)?new Date(start).toISOString():eventTime(row);
      const base=baseline?.monthly_price_minor;
      return {at,verifiedAt:stamp(row.provider_verified_at),recordedAt:stamp(row.observed_at),
        providerEffectiveAt:row.provider_effective_at?stamp(row.provider_effective_at):null,
        amountMinor:row.monthly_price_minor,percent:base?((row.monthly_price_minor/base)-1)*100:null,
        index:base?row.monthly_price_minor/base*100:null,kind:index===0&&prior&&Number.isFinite(start)?"CARRIED_BASELINE":row.history_event_kind,
        sourceUrl:row.source_url};
    });
    const last=timeline.at(-1)!;
    const currentMatch=active.find(row=>row.history_series_id===id);
    const identity={seriesId:id,serviceSlug:first.service_slug,serviceName:nameOf(first.service_slug),
      market:first.country_code,marketName:marketOf(first.country_code),currency:first.currency,
      planName:currentMatch?.plan_name??last.plan_name,billingInterval:first.billing_interval};
    series.push({...identity,points,baselineKind:baseline?.history_event_kind??null,
      olderHistoryUnavailable:baseline?.history_event_kind==="BOOTSTRAP_BASELINE",
      current:!!currentMatch&&currentMatch.monthly_price_minor===last.monthly_price_minor});
    for(let i=0;i<eligible.length;i++){
      const row=eligible[i],previous=eligible[i-1];
      if(row.history_event_kind!=="PRICE_CHANGE" || !previous ||
        row.monthly_price_minor===previous.monthly_price_minor || Date.parse(eventTime(row))<start)continue;
      changes.push(change(identity,previous,row));
    }
    if(baseline&&timeline.some(row=>row.history_event_kind==="PRICE_CHANGE")&&last.monthly_price_minor!==undefined) {
      heatmap.push({...identity,baselineMinor:baseline.monthly_price_minor,lastMinor:last.monthly_price_minor,
        percent:(last.monthly_price_minor/baseline.monthly_price_minor-1)*100});
    } else heatmap.push({...identity,baselineMinor:baseline?.monthly_price_minor??null,lastMinor:last.monthly_price_minor,percent:null});
  }
  changes.sort((a,b)=>b.verifiedAt.localeCompare(a.verifiedAt)||a.seriesId.localeCompare(b.seriesId));
  series.sort((a,b)=>a.market.localeCompare(b.market)||a.planName.localeCompare(b.planName)||a.seriesId.localeCompare(b.seriesId));
  heatmap.sort((a,b)=>a.market.localeCompare(b.market)||a.planName.localeCompare(b.planName));
  const recent=active.slice().sort((a,b)=>stamp(b.verified_at).localeCompare(stamp(a.verified_at))).slice(0,5)
    .map(row=>({serviceSlug:row.service_slug,market:row.country_code,planName:row.plan_name,
      verifiedAt:stamp(row.verified_at),lastCheckedAt:stamp(row.last_checked_at)}));
  const recentCutoff=ending-30*24*60*60*1000;
  const recentChanges=changes.filter(row=>Date.parse(row.verifiedAt)>=recentCutoff);
  const increases=recentChanges.filter(row=>row.percent>0).sort((a,b)=>b.percent-a.percent).slice(0,5);
  const decreases=recentChanges.filter(row=>row.percent<0).sort((a,b)=>a.percent-b.percent).slice(0,5);
  return {summary:{markets:new Set(active.map(row=>row.country_code)).size,plans:active.length,
    priceChanges30d:recentChanges.length,increases,decreases,recentVerifications:recent},
    series,changes:changes.slice(0,200),changesTruncated:changes.length>200,heatmap:heatmap.slice(0,300),
    heatmapTruncated:heatmap.length>300,chartState:series.length>16?"NARROW_FILTERS":series.length?"AVAILABLE":"EMPTY"};
}

function change(identity:{seriesId:string;serviceSlug:string;serviceName:string;market:string;marketName:string;currency:string;planName:string},previous:Event,row:Event) {
  return {...identity,previousMinor:previous.monthly_price_minor,newMinor:row.monthly_price_minor,
    absoluteMinor:row.monthly_price_minor-previous.monthly_price_minor,
    percent:(row.monthly_price_minor/previous.monthly_price_minor-1)*100,
    verifiedAt:stamp(row.provider_verified_at),recordedAt:stamp(row.observed_at),
    providerEffectiveAt:row.provider_effective_at?stamp(row.provider_effective_at):null,sourceUrl:row.source_url};
}

export async function priceAnalyticsReport(filters:PriceAnalyticsFilters) {
  const activeServices=await pool.query<{service_slug:string}>(`SELECT service_slug FROM verified_provider_prices
    WHERE ${isStrong} GROUP BY service_slug ORDER BY count(*) DESC,service_slug LIMIT 501`);
  const serviceSlugs=[...new Set([...activeServices.rows.map(row=>row.service_slug),...serviceCatalog.map(row=>row.slug)])];
  const availableServices=serviceSlugs.slice(0,500).map(slug=>({slug,name:nameOf(slug)}));
  const servicesTruncated=serviceSlugs.length>500;
  const markets=countryCurrencyData.map(([code,name])=>({code,name}));
  if(!filters.service)return {state:"SELECT_SERVICE" as const,services:availableServices,servicesTruncated,markets,filters};
  const plans=await pool.query<{history_series_id:string;plan_name:string;country_code:string;currency:string}>(
    `SELECT DISTINCT ON (history_series_id) history_series_id,plan_name,country_code::text,currency::text
      FROM verified_price_observations WHERE service_slug=$1 AND ($2::text IS NULL OR country_code=$2)
        AND history_series_id IS NOT NULL AND ${isStrong}
      ORDER BY history_series_id,(CASE WHEN history_event_kind='BOOTSTRAP_BASELINE' THEN observed_at ELSE provider_verified_at END) DESC LIMIT 301`,[filters.service,filters.market]);
  const planOptions=plans.rows.slice(0,300).map(row=>({seriesId:row.history_series_id,
    name:row.plan_name,market:row.country_code,currency:row.currency}));
  if(plans.rows.length>300&&!filters.plan)return {state:"NARROW_FILTERS" as const,services:availableServices,markets,planOptions,filters};
  const current=await pool.query<Current>(`SELECT service_slug,plan_slug,plan_name,history_series_id,
      country_code::text,currency::text,monthly_price_minor,verified_at,last_checked_at
    FROM verified_provider_prices WHERE service_slug=$1 AND ($2::text IS NULL OR country_code=$2)
      AND ($3::text IS NULL OR history_series_id=$3) AND ${isStrong}
    ORDER BY country_code,plan_slug,billing_provider_slug LIMIT 2001`,[filters.service,filters.market,filters.plan]);
  if(current.rows.length>2000)return {state:"NARROW_FILTERS" as const,services:availableServices,markets,planOptions,filters};
  const columns=`h.history_series_id,h.history_event_kind,h.plan_identity,h.plan_name,h.service_slug,
    h.country_code::text,h.currency::text,h.billing_interval,h.monthly_price_minor,h.provider_verified_at,
    h.observed_at,h.provider_effective_at,h.source_url`;
  const now=new Date(),start=periodStart(filters.period,now);
  let historyRows:Event[];
  if(start){
    // One indexed predecessor per selected semantic series establishes the
    // visible-window value without loading every older observation.
    const ids=filters.plan?[filters.plan]:plans.rows.map(row=>row.history_series_id);
    const prior=ids.length?await pool.query<Event>(`SELECT ${columns} FROM unnest($3::text[]) target(series_id)
      JOIN LATERAL (SELECT * FROM verified_price_observations h WHERE h.history_series_id=target.series_id
        AND h.service_slug=$1 AND ($2::text IS NULL OR h.country_code=$2)
        AND ${sqlEventTime}<$4::timestamptz
        AND h.history_event_kind IN ('BASELINE','BOOTSTRAP_BASELINE','PRICE_CHANGE') AND ${isStrong}
        ORDER BY ${sqlEventTime} DESC,h.id DESC LIMIT 1) h ON true`,
      [filters.service,filters.market,ids,start]):{rows:[] as Event[]};
    const window=await pool.query<Event>(`SELECT ${columns} FROM verified_price_observations h
      WHERE h.service_slug=$1 AND ($2::text IS NULL OR h.country_code=$2)
        AND ($3::text IS NULL OR h.history_series_id=$3) AND h.history_series_id IS NOT NULL
        AND ${sqlEventTime}>=$4::timestamptz AND ${sqlEventTime}<=$5::timestamptz
        AND h.history_event_kind IN ('BASELINE','BOOTSTRAP_BASELINE','PRICE_CHANGE') AND ${isStrong}
      ORDER BY h.history_series_id,${sqlEventTime},h.id LIMIT 4001`,
    [filters.service,filters.market,filters.plan,start,now]);
    if(window.rows.length>4000)return {state:"NARROW_FILTERS" as const,services:availableServices,markets,planOptions,filters};
    historyRows=[...prior.rows,...window.rows];
  }else{
    const history=await pool.query<Event>(`SELECT ${columns} FROM verified_price_observations h
      WHERE h.service_slug=$1 AND ($2::text IS NULL OR h.country_code=$2)
        AND ($3::text IS NULL OR h.history_series_id=$3) AND h.history_series_id IS NOT NULL
        AND h.history_event_kind IN ('BASELINE','BOOTSTRAP_BASELINE','PRICE_CHANGE') AND ${isStrong}
      ORDER BY h.history_series_id,${sqlEventTime},h.id LIMIT 4001`,[filters.service,filters.market,filters.plan]);
    if(history.rows.length>4000)return {state:"NARROW_FILTERS" as const,services:availableServices,markets,planOptions,filters};
    historyRows=history.rows;
  }
  const model=projectPriceAnalytics(current.rows,historyRows,filters,now);
  return {state:"AVAILABLE" as const,services:availableServices,servicesTruncated,
    markets,filters,planOptions,planOptionsTruncated:plans.rows.length>300,...model};
}
