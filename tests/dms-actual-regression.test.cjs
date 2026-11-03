const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const M=require('../operations-metrics.js'),F=require('../operations-forecast.js'),S=require('../operations-summary.js');
const oldModule={exports:{}};vm.runInNewContext(cp.execFileSync('git',['show','bfb5115:operations-metrics.js'],{encoding:'utf8'}),{module:oldModule});const old=oldModule.exports;
function fixture(start,end){
 const mapping=new Map([['測試甲','A'],['測試乙','B']]),catalog=new Map([['001',{store_code:'001',restaurant_name:'測試甲'}],['002',{store_code:'002',restaurant_name:'測試乙'}]]),history=[],rows=[],batches=[],reports=[];
 for(const d of F.dates(F.sampleStart(start),end))for(const name of mapping.keys())history.push({record_date:d,restaurant_name:name,period_code:'full_day',total_tc:100,tc_ex_third_party:80,prior_year_tc:10});
 for(const d of F.dates(F.addDays(start,-364),F.addDays(end,-364)))for(const name of mapping.keys())history.push({record_date:d,restaurant_name:name,period_code:'full_day',total_tc:100});
 for(const d of F.dates(start,end)){
  for(const type of ['ByOrder','ByDate'])batches.push({id:d+type,report_date:d,report_type:type,row_count:3});
  for(let i=0;i<3;i++)rows.push({batch_id:d+'ByOrder',row_number:i+1,store_code:i===2?'002':'001',restaurant_name:i===2?'測試乙':'測試甲',order_number:d+'-'+i,payload:{'自動/手動':i===2?'第三方':'自動',D7:i?'N':'Y',D25:'Y'}});
  rows.push({batch_id:d+'ByDate',row_number:1,store_code:'001',restaurant_name:'測試甲',payload:{QT:4,'留店時間':'00:02:00','外送達成時間（D30)':'00:20:00'}});
  reports.push({record_date:d,area_hours:{A:2,B:1},transfer_out_hours:.5,transfer_in_hours:.25});
 }
 return {start,end,rows,batches,reports,history,mapping,catalog,powerbiData:{history,batches}};
}
const actualKeys=['tc','fa','nonfa','d7','d25','qt','d7Avg','d25Avg','actualHours','totalHours','tplh'];
for(const [label,start,end] of [['day','2026-11-02','2026-11-02'],['week','2026-10-26','2026-11-01'],['month','2026-10-01','2026-10-31']])test(label+' actuals exactly match pre-change DMS, aligned baselines and forecasts sum daily Power BI',()=>{
 const d=fixture(start,end),before=old.build(d),after=M.build(d);for(const key of actualKeys)assert.equal(after.summary[key],before.summary[key],key);
 for(const [area,value] of before.areas)for(const key of actualKeys.filter(k=>!['actualHours','totalHours','tplh'].includes(k)))assert.equal(after.areas.get(area)[key],value[key],area+key);
 assert.equal(after.summary.prior,200*F.dates(start,end).length);assert.equal(after.summary.sstg,after.summary.tc/after.summary.prior-1);
 assert.equal(after.summary.forecast,[...after.days.values()].reduce((n,x)=>n+x.metrics.forecast,0));assert.equal(after.summary.forecastHours,after.summary.forecast/2.5);
 const snapshot=JSON.stringify(d);d.powerbiData={history:d.history.filter(x=>x.record_date<start),batches:[]};const missing=M.build(d);assert.equal(missing.summary.tc,before.summary.tc);assert.equal(missing.summary.forecast,after.summary.forecast);assert.ok(!missing.forecastWarnings.some(x=>x.includes('Power BI實際TC尚缺')));
});
test('DMS dedup/exclusions/missing hours remain identical and inputs immutable',()=>{
 const d=fixture('2026-11-02','2026-11-04');d.rows.push({...d.rows[0]});d.reports[0].score_excluded=true;d.reports[1].area_hours={A:2};const input=JSON.stringify(d),a=M.build(d),b=old.build(d);for(const k of actualKeys)assert.equal(a.summary[k],b.summary[k],k);assert.equal(JSON.stringify(d),input);assert.equal(a.summary.forecast,424);
});
function reportHarness(d,period){
 const els=new Map(),get=id=>{if(!els.has(id))els.set(id,{remove(){},querySelectorAll(){return [];}});return els.get(id);};const sheets=new Map(),XLSX={utils:{json_to_sheet(rows){return {rows};},encode_cell(){return '';},book_append_sheet(wb,ws,name){sheets.set(name,ws.rows);}}};
 const window={OpsMetrics:M,OpsSummary:S,OpsForecast:F,OpsDateControl:{date:d.start,period}};
 const src=fs.readFileSync(require('node:path').join(__dirname,'../operations-report.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.__test={state,appendScores,renderScores};})();');vm.runInNewContext(src,{window,document:{getElementById:get},opsEscape:String,opsToday:()=>d.end,XLSX});window.__test.state.catalog=d.catalog;window.__test.state.cache=d;return {window,sheets,get};
}
for(const [period,start,end] of [['day','2026-11-02','2026-11-02'],['week','2026-10-26','2026-11-01'],['month','2026-10-01','2026-10-31']])test(period+' report export retains DMS actuals when Power BI current dates missing',()=>{
 const d=fixture(start,end);d.powerbiData.history=d.history.filter(x=>x.record_date<start);d.mapping=[...d.mapping].map(([restaurant_name,area_code])=>({restaurant_name,area_code}));const h=reportHarness(d,period);h.window.__test.appendScores({},d,{start,end});
 const days=h.sheets.get('每日成績');assert.equal(days.reduce((n,x)=>n+x.實際單,0),3*days.length);assert.ok(days.every(x=>x.FA===1&&x.D7===.5&&x.D25===1&&x.TC來源==='DMS（ByOrder／ByDate）'));const forecasts=h.sheets.get('預估樣本');assert.equal(days.reduce((n,x)=>n+x.預估單,0),forecasts.reduce((n,x)=>n+x.預估TC,0));assert.ok(days.every(x=>x.預估工時===x.預估單/2.5));
});
test('analysis ranking and export use DMS while preview keeps Power BI forecast',()=>{
 const d=fixture('2026-11-02','2026-11-02');d.powerbiData.history=d.history.filter(x=>x.record_date<d.start);d.mapping=[...d.mapping].map(([restaurant_name,area_code])=>({restaurant_name,area_code}));Object.assign(d,{delays:[],feedback:[],campaigns:[],weeklyNotes:[],monthReports:[]});
 const els=new Map(),get=id=>{if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){}},querySelectorAll(){return [];},addEventListener(){}});return els.get(id);};const sheets=new Map(),XLSX={utils:{book_new(){return {};},json_to_sheet(rows){return {rows};},book_append_sheet(wb,ws,name){sheets.set(name,ws.rows);}},writeFile(){}};const window={OpsMetrics:M,OpsSummary:S,OpsForecast:F,supabase:{createClient(){return {};}}};let src=fs.readFileSync(require('node:path').join(__dirname,'../analysis-dashboard.js'),'utf8');src=src.slice(0,src.indexOf("  document.querySelectorAll('[data-period]').forEach(b=>b.onclick="))+'window.__test={state,storeAnalytics,renderExport};})();';vm.runInNewContext(src,{window,document:{getElementById:get},XLSX});window.__test.state.catalog=d.catalog;window.__test.state.date=d.start;
 const rows=window.__test.storeAnalytics(d,{start:d.start,end:d.end});assert.equal(rows.reduce((n,x)=>n+x.tc,0),3);assert.equal(rows.reduce((n,x)=>n+x.prior,0),200);assert.ok(rows.every(x=>x.sstg===x.tc/x.prior-1));window.__test.renderExport(d,rows,{start:d.start,end:d.end});const sum=sheets.get('營運摘要')[0];assert.equal(sum.TC,3);assert.equal(sum.去年同期TC,200);assert.equal(sum.SSTG,3/200-1);assert.equal(sum.FA,1);assert.equal(sum.預估TC,212);assert.equal(sum.預估工時,84.8);assert.equal(sum.TC來源,'DMS（ByOrder／ByDate）');
 const two=fixture('2026-11-02','2026-11-03');Object.assign(two,{mapping:d.mapping,delays:[]});two.rows=two.rows.filter(x=>!(x.store_code==='002'&&x.batch_id==='2026-11-03ByOrder'));const ranked=window.__test.storeAnalytics(two,{start:two.start,end:two.end});assert.equal(ranked.reduce((n,x)=>n+x.prior,0),400);assert.equal(ranked.find(x=>x.code==='002').prior,200);assert.equal(ranked.find(x=>x.code==='002').sstg,1/200-1);
 const one={...d,rows:d.rows.filter(x=>x.store_code!=='002')};const zeros=window.__test.storeAnalytics(one,{start:d.start,end:d.end});assert.equal(zeros.length,2);assert.equal(zeros.find(x=>x.code==='002').tc,0);assert.equal(zeros.find(x=>x.code==='002').sstg,-1);
});
test('day/week/month exports disclose prior-year selection independently of DMS actuals',()=>{
 for(const [period,start,end] of [['day','2026-11-02','2026-11-02'],['week','2026-10-26','2026-11-01'],['month','2026-10-01','2026-10-31']]){
  const d=fixture(start,end);d.history.filter(x=>x.record_date<F.sampleStart(start)).forEach(x=>x.total_tc=200);d.mapping=[...d.mapping].map(([restaurant_name,area_code])=>({restaurant_name,area_code}));const h=reportHarness(d,period);h.window.__test.appendScores({},d,{start,end});const days=h.sheets.get('每日成績'),samples=h.sheets.get('預估樣本');assert.equal(days.reduce((n,x)=>n+x.預估單,0),424*days.length);assert.equal(days.reduce((n,x)=>n+x.實際單,0),3*days.length);assert.ok(samples.every(x=>x.預估依據==='prior_year'&&x.去年TC===200&&x.前8週平均===100&&x.成長倍率===1.06));
 }
});
