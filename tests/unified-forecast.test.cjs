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
test('day/week/month share forecast, daily area sums, and actual TC is only Power BI',()=>{
 for(const end of ['2026-11-02','2026-11-08','2026-11-30']){
  const data=fixture('2026-11-02',end),v=M.build(data),days=F.dates(data.start,end).length;
  assert.equal(v.summary.forecast,24*days);assert.equal(v.summary.forecastHours,24*days/2.5);assert.equal(v.summary.tc,20*days);
  assert.equal(v.summary.fa,4*days);assert.equal(v.summary.nonfa,16*days);
  assert.equal(v.summary.tcAchievement,20/24);assert.equal(v.summary.forecast,[...v.days.values()].reduce((n,d)=>n+d.metrics.forecast,0));
 }
});
test('missing Power BI actuals never fall back to DMS; forecast does not depend on prior-year coverage',()=>{
 const data=fixture();data.history=[];data.powerbiData.history=data.powerbiData.history.filter(x=>x.record_date<data.start);
 data.batches=[{id:'order',report_date:data.start,report_type:'ByOrder',row_count:1}];
 data.rows=[{batch_id:'order',row_number:1,store_code:'001',restaurant_name:'測試甲',order_number:'fixture',payload:{D7:'Y',D25:'N'}}];
 const v=M.build(data);assert.equal(v.summary.tc,null);assert.equal(v.summary.forecast,24);assert.equal(v.summary.forecastHours,9.6);assert.equal(v.summary.sstg,null);
 assert.equal(v.summary.d7,1);assert.equal(v.summary.d25,0);assert.equal(v.summary.d7Y+v.summary.d7N,1);
});
test('DMS timing denominators remain unchanged when Power BI TC differs',()=>{
 const data=fixture();data.batches=[{id:'order',report_date:data.start,report_type:'ByOrder',row_count:2}];
 data.rows=['Y','N'].map((D7,i)=>({batch_id:'order',row_number:i,store_code:'001',restaurant_name:'測試甲',order_number:'fixture'+i,payload:{D7,D25:'Y'}}));
 const v=M.build(data);assert.equal(v.summary.tc,20);assert.equal(v.summary.d7,.5);assert.equal(v.summary.d25,1);assert.equal(v.summary.d7Y+v.summary.d7N,2);
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
test('excluded dates are omitted from both actual and forecast period totals',()=>{
 const data=fixture('2026-11-02','2026-11-03');data.reports=[{record_date:'2026-11-02',score_excluded:true}];const v=M.build(data);assert.equal(v.summary.tc,20);assert.equal(v.summary.forecast,24);
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
test('actual report export matches screen model and keeps DMS timing with missing Power BI actuals',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),S=require('../operations-summary.js');
 const data=fixture();data.mapping=[...mapping].map(([restaurant_name,area_code])=>({restaurant_name,area_code}));
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{remove(){}});return elements.get(id);};
 const sheets=new Map(),XLSX={utils:{json_to_sheet(rows){return {rows};},encode_cell(){return '';},book_append_sheet(wb,ws,name){sheets.set(name,ws.rows);}}};
 const window={OpsMetrics:M,OpsSummary:S,OpsForecast:F,OpsDateControl:{date:data.start,period:'day'}};
 const source=fs.readFileSync(path.join(__dirname,'../operations-report.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.__test={state,appendScores};})();');
 vm.runInNewContext(source,{window,document:{getElementById:get},opsEscape:s=>String(s),opsToday:()=>data.start,XLSX});
 window.__test.state.cache=data;window.__test.state.catalog=catalog;
 window.__test.appendScores({},data,{start:data.start,end:data.end});
 const day=sheets.get('每日成績')[0];assert.equal(day.預估單,24);assert.equal(day.預估工時,9.6);assert.equal(day.實際單,20);assert.equal(day.TC來源,'Power BI');
 assert.equal(sheets.get('預估樣本').reduce((n,x)=>n+x.預估TC,0),day.預估單);
 data.powerbiData.history=data.powerbiData.history.filter(x=>x.record_date<data.start);
 data.batches=[{id:'order',report_type:'ByOrder',report_date:data.start,row_count:1}];data.rows=[{batch_id:'order',store_code:'001',restaurant_name:'測試甲',order_number:'fixture',row_number:1,payload:{D7:'Y',D25:'N'}}];
 window.__test.appendScores({},data,{start:data.start,end:data.end});assert.equal(sheets.get('每日成績')[0].實際單,null);assert.equal(sheets.get('每日成績')[0].D7,1);assert.equal(sheets.get('每日成績')[0].D7有效單,1);
});
test('analysis store rankings and export use Power BI TC and the shared forecast even without DMS',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),S=require('../operations-summary.js');
 const data=fixture();data.mapping=[...mapping].map(([restaurant_name,area_code])=>({restaurant_name,area_code}));Object.assign(data,{delays:[],feedback:[],campaigns:[],weeklyNotes:[],monthReports:[]});
 const els=new Map(),get=id=>{if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){}},querySelectorAll(){return [];},addEventListener(){}});return els.get(id);};
 const sheets=new Map(),XLSX={utils:{book_new(){return {};},json_to_sheet(rows){return {rows};},book_append_sheet(wb,ws,name){sheets.set(name,ws.rows);}},writeFile(){}};
 const window={OpsMetrics:M,OpsSummary:S,OpsForecast:F,supabase:{createClient(){return {};}}};
 let source=fs.readFileSync(path.join(__dirname,'../analysis-dashboard.js'),'utf8');source=source.slice(0,source.indexOf("  document.querySelectorAll('[data-period]').forEach(b=>b.onclick="))+ 'window.__test={state,storeAnalytics,renderExport,workflowProblem};})();';
 vm.runInNewContext(source,{window,document:{getElementById:get},XLSX});window.__test.state.catalog=catalog;window.__test.state.date=data.start;window.__test.state.month=data.start.slice(0,7);
 const rows=window.__test.storeAnalytics(data,{start:data.start,end:data.end});assert.equal(rows.length,2);assert.equal(rows.reduce((n,x)=>n+x.tc,0),20);assert.equal(rows[0].d7,null);
 window.__test.renderExport(data,rows,{start:data.start,end:data.end});const summary=sheets.get('營運摘要')[0];assert.equal(summary.TC,20);assert.equal(summary.預估TC,24);assert.equal(summary.預估工時,9.6);assert.equal(summary.TC來源,'Power BI');
 data.powerbiData.history=data.powerbiData.history.filter(x=>x.record_date<data.start);const missingRows=window.__test.storeAnalytics(data,{start:data.start,end:data.end});const finding=window.__test.workflowProblem(missingRows,'sstg',{start:data.start,end:data.end},data);assert.match(finding.evidence,/Power BI實際TC尚缺或待核對/);assert.match(finding.evidence,/去年同期 20/);
});
test('Power BI positive TC requires complete area hours even without DMS; real zero does not invent hours',()=>{
 const data=fixture();data.reports=[{record_date:data.start,area_hours:{A:5}}];const v=M.build(data);assert.equal(v.summary.tc,20);assert.equal(v.summary.actualHours,null);assert.equal(v.summary.tplh,null);assert.equal(v.days.get(data.start).actualHours,null);assert.ok(v.missingHourDays.includes(data.start));assert.equal(v.areas.get('B').tplh,null);
});
