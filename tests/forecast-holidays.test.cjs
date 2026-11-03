const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../operations-forecast.js'),C=require('../operations-calendar.js'),M=require('../operations-metrics.js');
function data(date='2026-11-02'){
 const mapping=new Map([['測試','A']]),history=[];
 for(const d of F.dates(F.sampleStart(date),date))history.push({record_date:d,restaurant_name:'測試',period_code:'full_day',total_tc:d==='2026-09-28'?810:100,tc_ex_third_party:90,prior_year_tc:80});
 return {mapping,history,reports:[],batches:[]};
}
test('normal Monday excludes national holiday and substitute holiday, uses valid denominator, preserves raw rows',()=>{
 const d=data(),raw=JSON.stringify(d.history),p=F.prepare(d),f=p.forecast('2026-11-02')[0];assert.equal(f.historyWeeks,6);assert.equal(f.totalTc,110);assert.equal(f.recommended,44);assert.ok(f.excludedSamples.some(x=>x.date==='2026-09-28'));assert.ok(f.excludedSamples.some(x=>x.date==='2026-10-26'));assert.equal(p.actual('測試','2026-09-28').tc,810);assert.equal(JSON.stringify(d.history),raw);
});
test('closure and explicit exclusion apply to historical samples; do not infer restaurant closure as whole-center closure',()=>{
 const d=data();d.reports=[{record_date:'2026-10-19',score_excluded:false,special_notes:'停班停課'},{record_date:'2026-10-12',score_excluded:true},{record_date:'2026-10-05',score_excluded:false,special_notes:'環二停業'}];const f=F.prepare(d).forecast('2026-11-02')[0];assert.equal(f.historyWeeks,4);assert.ok(!f.samples.some(x=>['2026-10-19','2026-10-12'].includes(x.date)));assert.ok(f.samples.some(x=>x.date==='2026-10-05'));
});
test('missing all ordinary samples stays missing, never zero or expanded beyond eight weeks',()=>{
 const d=data();d.reports=F.dates('2026-09-07','2026-10-26').map(record_date=>({record_date,score_excluded:true}));const f=F.prepare(d).forecast('2026-11-02')[0];assert.equal(f.totalTc,null);assert.equal(f.historyWeeks,0);assert.equal(f.samples.length,0);
});
test('holiday target keeps original same-weekday method, weekend still excludes closures',()=>{
 const d=data('2026-10-26'),f=F.prepare(d).forecast('2026-10-26')[0];assert.equal(f.historyWeeks,8);assert.ok(f.samples.some(x=>x.date==='2026-09-28'));
 const w=data('2026-11-07');w.reports=[{record_date:'2026-10-24',special_notes:'停班課'}];assert.ok(!F.prepare(w).forecast('2026-11-07')[0].samples.some(x=>x.date==='2026-10-24'));
});
test('calendar supports cross-year holidays and never treats an unknown calendar year as valid weekday samples',()=>{
 assert.ok(C.holiday('2026-09-28'));assert.ok(C.holiday('2026-10-26'));assert.ok(C.holiday('2027-01-01'));assert.ok(C.holiday('2025-05-01'));assert.equal(C.holiday('2026-09-07'),null);assert.equal(F.prepare(data('2028-01-03')).forecast('2028-01-03')[0].totalTc,null);
});
test('historical closure settings reach report model without altering DMS actuals',()=>{
 const d=data();const args={start:'2026-11-02',end:'2026-11-02',mapping:d.mapping,catalog:new Map(),history:[],rows:[{batch_id:'b',row_number:1,order_number:'test',restaurant_name:'測試',payload:{D7:'Y'}}],batches:[{id:'b',report_date:'2026-11-02',report_type:'ByOrder'}],reports:[],powerbiData:{...d,reports:[{record_date:'2026-10-19',score_excluded:true}]}};const v=M.build(args);assert.equal(v.summary.tc,1);assert.equal(v.summary.d7,1);assert.equal(v.forecastDetails[0].historyWeeks,5);assert.equal(v.summary.forecast,110);
});
test('shared loader reads historical closure settings including paging',async()=>{
 const calls=[];const db={async rpc(){return {data:{history:[]}};},from(table){let start,end;const q={select(fields){calls.push({table,fields});return q;},gte(k,v){start=v;return q;},lte(k,v){end=v;return q;},eq(){return q;},order(){return q;},async range(a){if(table==='t995_operations_daily_reports'){assert.equal(start,'2026-09-07');assert.equal(end,'2026-11-03');return {data:a===0?Array.from({length:1000},(_,i)=>({record_date:'2026-10-23',score_excluded:true})):[]};}return {data:[]};}};return q;}};const result=await F.load(db,'2026-11-03','2026-11-03');assert.equal(result.reports.length,1000);assert.ok(calls.some(x=>x.table==='t995_operations_daily_reports'&&x.fields.includes('special_notes')));
});

test('closure-read failures do not silently use an incomplete sample policy',async()=>{
 const db={async rpc(){return {data:{history:[]}};},from(table){const q={select(){return q;},gte(){return q;},lte(){return q;},eq(){return q;},order(){return q;},async range(){return table==='t995_operations_daily_reports'?{error:new Error('fixture denied')}:{data:[]};}};return q;}};await assert.rejects(F.load(db,'2026-11-03','2026-11-03'),/fixture denied/);
});
