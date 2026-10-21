import test from "node:test";
import assert from "node:assert/strict";
import {parsePriceAnalyticsFilters,periodStart,projectPriceAnalytics} from "./price-analytics.js";

const now=new Date("2026-10-19T12:00:00.000Z");
const id=(digit:string)=>`vh:${digit.repeat(64)}`;
const filters={service:"disney-plus",market:null,plan:null,period:"3M" as const};
type Current=Parameters<typeof projectPriceAnalytics>[0][number];
type Event=Parameters<typeof projectPriceAnalytics>[1][number];
const current=(series:string,market="NO",currency="NOK",amount=10900):Current=>({
  service_slug:"disney-plus",plan_slug:"standard",plan_name:"Disney+ Standard",history_series_id:series,
  country_code:market,currency,monthly_price_minor:amount,verified_at:"2026-10-01T00:00:00Z",last_checked_at:"2026-10-18T00:00:00Z",
  source:"v3-truth",verification:"authoritative-provider",source_count:1,verified_by_agreement:false
});
const event=(series:string,kind:Event["history_event_kind"],amount:number,date:string,other:Partial<Event>={}):Event=>({
  history_series_id:series,history_event_kind:kind,plan_identity:"catalog:disney-plus:no:standard:direct:nok",
  plan_name:"Standard",service_slug:"disney-plus",country_code:"NO",currency:"NOK",
  billing_interval:"MONTHLY_RECURRING",monthly_price_minor:amount,provider_verified_at:date,
  observed_at:"2026-10-19T00:00:00Z",provider_effective_at:null,source_url:"https://disneyplus.example/prices",...other
});

test("Price Analytics filters reject arbitrary and duplicate dimensions",()=>{
  assert.deepEqual(parsePriceAnalyticsFilters(new URLSearchParams("service=disney-plus&market=NO&period=3M")),{...filters,market:"NO"});
  for(const query of ["email=a","service=a&service=b","service=A","service=disney-plus&market=RU",
    "service=disney-plus&period=2Y","service=disney-plus&plan=bad","market=NO","plan="+id("a")])
    assert.throws(()=>parsePriceAnalyticsFilters(new URLSearchParams(query)),/INVALID_FILTER/,query);
  assert.equal(periodStart("3M",now)?.toISOString(),"2026-07-19T12:00:00.000Z");
  assert.equal(periodStart("6M",now)?.toISOString(),"2026-04-19T12:00:00.000Z");
  assert.equal(periodStart("1Y",now)?.toISOString(),"2025-10-19T12:00:00.000Z");
  assert.equal(periodStart("All",now),null);
});

test("semantic alias names share one series and real changes make period-aware steps",()=>{
  const a=id("a"),rows=[event(a,"BASELINE",8990,"2026-05-01T00:00:00Z"),
    event(a,"PRICE_CHANGE",10990,"2026-08-01T00:00:00Z",{plan_name:"Disney+ Standard"}),
    event(a,"PRICE_CHANGE",8990,"2026-10-01T00:00:00Z",{plan_name:"Disney+ Standard"})];
  const model=projectPriceAnalytics([current(a)],rows,filters,now);
  assert.equal(model.series.length,1);assert.equal(model.series[0].planName,"Disney+ Standard");
  assert.deepEqual(model.series[0].points.map(point=>point.kind),["CARRIED_BASELINE","PRICE_CHANGE","PRICE_CHANGE"]);
  assert.equal(model.series[0].points[0].at,"2026-07-19T12:00:00.000Z");
  assert.equal(model.series[0].points[0].verifiedAt,"2026-05-01T00:00:00.000Z");
  assert.ok(Math.abs(model.series[0].points[1].percent!-22.2469)<0.001);
  assert.ok(Math.abs(model.series[0].points[1].index!-122.2469)<0.001);
  assert.equal(model.series[0].points[2].percent,0);
  assert.deepEqual(model.changes.map(change=>change.absoluteMinor),[-2000,2000]);
  assert.equal(model.summary.priceChanges30d,1);
  assert.equal(model.summary.increases.length,0);assert.equal(model.summary.decreases.length,1);
  assert.equal(model.heatmap[0].percent,0,"a genuine A→B→A sequence is comparable to its baseline");
});

test("distinct plans, markets and currencies stay separate, including native amounts",()=>{
  const a=id("a"),b=id("b"),c=id("c");
  const model=projectPriceAnalytics([current(a),current(b,"SE","SEK",12900),current(c,"NO","NOK",19900)],
    [event(a,"BASELINE",8990,"2026-05-01T00:00:00Z"),
      event(b,"BASELINE",11900,"2026-05-01T00:00:00Z",{country_code:"SE",currency:"SEK",plan_name:"Standard"}),
      event(c,"BASELINE",19900,"2026-05-01T00:00:00Z",{plan_name:"Premium"})],filters,now);
  assert.equal(model.summary.markets,2);assert.equal(model.summary.plans,3);
  assert.equal(model.series.length,3);assert.equal(new Set(model.series.map(row=>row.seriesId)).size,3);
  assert.deepEqual(new Set(model.series.map(row=>row.currency)),new Set(["NOK","SEK"]));
  assert.ok(model.heatmap.every(row=>row.percent===null),"one baseline is not a zero-percent change");
});

test("bootstrap and absent history remain explicit; no fabricated percentage or price change",()=>{
  const a=id("a"),b=id("b");
  const model=projectPriceAnalytics([current(a),current(b)],
    [event(a,"BOOTSTRAP_BASELINE",9990,"2026-08-01T00:00:00Z"),
      event(b,"PRICE_CHANGE",10990,"2026-08-01T00:00:00Z")],filters,now);
  assert.equal(model.summary.priceChanges30d,0);assert.equal(model.changes.length,0);
  assert.equal(model.series.find(row=>row.seriesId===a)?.olderHistoryUnavailable,true);
  assert.equal(model.series.find(row=>row.seriesId===b)?.points[0].percent,null);
  assert.equal(model.heatmap.find(row=>row.seriesId===b)?.percent,null);
  const empty=projectPriceAnalytics([current(a)],[],filters,now);
  assert.equal(empty.summary.plans,1);assert.equal(empty.chartState,"EMPTY");
});

test("an as-of bootstrap uses recording time while retaining original verification provenance",()=>{
  const a=id("a"),bootstrap=event(a,"BOOTSTRAP_BASELINE",9990,"2026-08-30T00:00:00Z",{
    observed_at:"2026-10-19T00:00:00Z"});
  const before=projectPriceAnalytics([current(a)],[bootstrap],filters,new Date("2026-10-18T23:59:59Z"));
  assert.equal(before.series.length,0);
  const after=projectPriceAnalytics([current(a)],[bootstrap],filters,now);
  assert.equal(after.series[0].points[0].at,"2026-10-19T00:00:00.000Z");
  assert.equal(after.series[0].points[0].verifiedAt,"2026-08-30T00:00:00.000Z");
  assert.equal(after.series[0].points[0].providerEffectiveAt,null);
  assert.equal(after.series[0].points[0].percent,0);
  assert.equal(after.summary.priceChanges30d,0);
  const next=event(a,"PRICE_CHANGE",10990,"2026-10-20T00:00:00Z",{observed_at:"2026-10-20T00:00:00Z"});
  const changed=projectPriceAnalytics([current(a,"NO","NOK",10990)],[next,bootstrap],filters,new Date("2026-10-21T00:00:00Z"));
  assert.deepEqual(changed.series[0].points.map(point=>point.at),[
    "2026-10-19T00:00:00.000Z","2026-10-20T00:00:00.000Z"]);
  assert.equal(changed.changes.length,1);
  assert.ok(Math.abs(changed.changes[0].percent-10.01001)<0.001);
});

test("name-only current updates keep the series and inconsistent current amounts are not extended",()=>{
  const a=id("a"),base=event(a,"BASELINE",8990,"2026-08-01T00:00:00Z",{plan_name:"Standard"});
  const renamed=projectPriceAnalytics([current(a,"NO","NOK",8990)],[base],filters,now);
  assert.equal(renamed.series[0].planName,"Disney+ Standard");
  assert.equal(renamed.series[0].current,true);
  assert.equal(renamed.changes.length,0);
  const mismatch=projectPriceAnalytics([current(a,"NO","NOK",9990)],[base],filters,now);
  assert.equal(mismatch.series[0].current,false);
});

test("a genuine prior price-change observation establishes the visible-window baseline",()=>{
  const a=id("a"),prior=event(a,"PRICE_CHANGE",9990,"2026-06-01T00:00:00Z"),
    later=event(a,"PRICE_CHANGE",10990,"2026-09-01T00:00:00Z");
  const model=projectPriceAnalytics([current(a,"NO","NOK",10990)],[prior,later],filters,now);
  assert.equal(model.series[0].points[0].kind,"CARRIED_BASELINE");
  assert.equal(model.series[0].points[0].index,100);
  assert.ok(Math.abs(model.series[0].points[1].percent!-10.01001)<0.001);
  assert.equal(model.changes.length,1);
});

test("period, plan, and market inputs constrain changes and summary consistently",()=>{
  const a=id("a"),b=id("b"),rows=[event(a,"BASELINE",8990,"2026-05-01T00:00:00Z"),
    event(a,"PRICE_CHANGE",9990,"2026-08-01T00:00:00Z"),
    event(b,"BASELINE",12900,"2026-08-01T00:00:00Z",{country_code:"SE",currency:"SEK"})];
  const currentRows=[current(a),current(b,"SE","SEK",12900)];
  const all=projectPriceAnalytics(currentRows,rows,{...filters,period:"All"},now);
  assert.equal(all.changes.length,1);
  const selected=projectPriceAnalytics(currentRows,rows,{...filters,plan:b,market:"SE"},now);
  assert.equal(selected.summary.plans,1);assert.equal(selected.summary.markets,1);assert.equal(selected.changes.length,0);
  const marketOnly=projectPriceAnalytics(currentRows,rows,{...filters,market:"SE"},now);
  assert.equal(marketOnly.series.length,1);assert.equal(marketOnly.summary.plans,1);
  const recent=projectPriceAnalytics(currentRows,rows,{...filters,period:"3M"},new Date("2027-01-19T12:00:00Z"));
  assert.equal(recent.changes.length,0);
});
