const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../operations-forecast.js'),M=require('../operations-metrics.js');
const mapping=new Map([['測試甲','A'],['測試乙','B']]);
const catalog=new Map([['001',{store_code:'001',restaurant_name:'測試甲'}],['002',{store_code:'002',restaurant_name:'測試乙'}]]);
const h=(date,name,tc,self=tc)=>({record_date:date,restaurant_name:name,period_code:'full_day',total_tc:tc,tc_ex_third_party:self,prior_year_tc:10});
function fixture(start='2026-11-02',end=start){
 const history=[];for(const date of F.dates(F.sampleStart(start),end))for(const name of mapping.keys())history.push(h(date,name,10,8));
 return {rows:[],batches:[],history:history.filter(x=>x.record_date>=start),powerbiData:{history,batches:[]},mapping,catalog,reports:[],start,end,today:'2026-12-31'};
}
test('same weekday/week anchor, area ceiling before summing, and target TPLH 2.5',()=>{
 const data=fixture();data.powerbiData.history.forEach(x=>x.total_tc=10.1);
 const f=F.prepare({...data.powerbiData,mapping,catalog}).forecast(data.start);
 assert.equal(f.length,2);assert.equal(f[0].historyWeeks,8);assert.equal(f[0].totalTc,13);assert.equal(f[0].recommended,5.2);
 assert.ok(f[0].samples.every(x=>new Date(x.date+'T12:00Z').getUTCDay()===1));
 assert.ok(f[0].samples.every(x=>x.date<'2026-11-02'));
});
test('real zero is valid, blank/missing stores are not; all-zero vs positive DMS is flagged without changing source',()=>{
 const data=fixture();const zeroDate='2026-10-26';for(const x of data.powerbiData.history)if(x.record_date===zeroDate){x.total_tc=0;x.tc_ex_third_party=0;}
 let p=F.prepare({...data.powerbiData,mapping,catalog});assert.equal(p.forecast(data.start)[0].historyWeeks,8);assert.equal(p.actual('測試甲',zeroDate).tc,0);
 data.powerbiData.batches=[{report_type:'ByOrder',report_date:zeroDate,row_count:10}];
 const snapshot=JSON.stringify(data.powerbiData.history);p=F.prepare({...data.powerbiData,mapping,catalog});assert.equal(p.actual('測試甲',zeroDate),null);assert.equal(p.forecast(data.start)[0].historyWeeks,7);assert.ok(p.suspectDates.has(zeroDate));assert.equal(JSON.stringify(data.powerbiData.history),snapshot);
 const empty=fixture();empty.powerbiData.history.forEach(x=>{if(x.record_date<empty.start)x.total_tc=null;});assert.equal(F.prepare({...empty.powerbiData,mapping,catalog}).forecast(empty.start)[0].totalTc,null);
});
test('cohort follows target date; removed stores do not contaminate current eight-week samples',()=>{
 const map=new Map([['測試甲','A'],['苗栗中正','K']]),hist=[];
 for(const date of F.dates('2026-09-01','2026-11-02')){hist.push(h(date,'測試甲',10),h(date,'苗栗中正',100));}
 const p=F.prepare({history:hist,mapping:map,inScope:M.storeInScope});
 assert.ok(p.forecast('2026-10-31').some(x=>x.area==='K'));assert.ok(!p.forecast('2026-11-01').some(x=>x.area==='K'));assert.equal(p.forecast('2026-11-02')[0].totalTc,12);
});
test('duplicate equal rows do not double count, conflicting duplicates are incomplete',()=>{
 const data=fixture();data.powerbiData.history.push({...data.powerbiData.history[0]});const p=F.prepare({...data.powerbiData,mapping,catalog});assert.equal(p.forecast(data.start)[0].totalTc,12);
 data.powerbiData.history.push({...data.powerbiData.history[0],total_tc:40});const conflict=F.prepare({...data.powerbiData,mapping,catalog});assert.equal(conflict.conflicts.size,1);assert.equal(conflict.forecast(data.start)[0].historyWeeks,7);
});
test('staffing renderer and report model use identical weekly forecasts without direct history access',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const data=fixture('2026-11-02','2026-11-08');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 const source=html.slice(html.indexOf('async function t995RenderStaffingRecommendation('),html.indexOf('function t995RenderStaffingDay()'));
 const ctx={db:{},window:{OpsForecast:{...F,load:async()=>data.powerbiData},OpsMetrics:M},t995AreaMapLoaded:true,t995AreaMap:mapping,t995DateAdd:F.addDays,t995StaffingDayOffset:0,t995RenderStaffingDay(){}};
 for(const name of ['Summary','WeekGap','ForecastDataWarning','DayTabs','List'])ctx['t995Staffing'+name]={};
 vm.createContext(ctx);vm.runInContext(source,ctx);await ctx.t995RenderStaffingRecommendation('2026-11-02',[]);
 const total=ctx.t995StaffingForecastData.flatMap(x=>x.days).reduce((n,d)=>n+d.totalTc,0);
 assert.equal(total,M.build(data).summary.forecast);assert.match(ctx.t995StaffingSummary.innerHTML,/預估需求工時（÷2.5）/);
});
test('reference loader uses existing admin RPC for all eight-week months, never locked history table',async()=>{
 const calls=[],q={select(){return this;},gte(){return this;},lte(){return this;},eq(){return this;},order(){return this;},async range(){return {data:[]};}};
 const db={async rpc(name,args){calls.push([name,args.p_month]);return {data:{history:[]}};},from(name){assert.equal(name,'t995_score_import_batches');return q;}};
 await F.load(db,'2026-11-03','2026-11-03');assert.deepEqual(calls.map(x=>x[1]),['2026-09-01','2026-10-01','2026-11-01']);assert.ok(calls.every(x=>x[0]==='t995_get_operations_reference'));
});
