const assert=require('node:assert/strict');const M=require('../operations-metrics.js'),S=require('../operations-summary.js');
const stores=[['025','苗栗中正','K'],['173','苗栗竹南','K'],['580','苗栗頭份','K'],['165','桃園南平','E']].map(([store_code,restaurant_name,area])=>({store_code,restaurant_name,area}));
const batches=['2026-10-31','2026-11-01'].flatMap(report_date=>['ByOrder','ByDate'].map(report_type=>({id:report_date+report_type,report_date,report_type})));
const rows=batches.flatMap(b=>stores.map((x,i)=>({...x,batch_id:b.id,row_number:i+1,order_number:b.id+x.store_code,payload:{AC:'995-'+x.area,D7:'Y',D25:'Y'}})));
const history=['2026-10-31','2026-11-01'].flatMap(record_date=>stores.map(x=>({...x,record_date,period_code:'full_day',prior_year_tc:1,total_tc:1,tc_ex_third_party:1})));
const reports=['2026-10-31','2026-11-01'].map(record_date=>({record_date,area_hours:{K:30,E:10}}));
const data={rows,batches,history,reports,mapping:new Map(stores.map(x=>[x.restaurant_name,x.area])),catalog:new Map(stores.map(x=>[x.store_code,x])),start:'2026-10-31',end:'2026-11-01'};
for(const code of ['025','173','580']){assert.equal(M.storeInScope(code,'2026-10-31'),true);assert.equal(M.storeInScope(code,'2026-11-01'),false);}
const all=M.build(data);assert.equal(all.summary.tc,5);assert.equal(all.days.get('2026-10-31').metrics.tc,4);assert.equal(all.days.get('2026-11-01').metrics.tc,1);assert.equal(all.days.get('2026-11-01').baselineCount,1);assert.equal(all.days.get('2026-11-01').baselineComplete,true);assert.equal(all.days.get('2026-11-01').hours,10);assert.equal(all.summary.totalHours,50);
const nov=M.build({...data,start:'2026-11-01'});assert.equal(nov.summary.tc,1);assert.equal(nov.areas.has('K'),false);assert.equal(nov.summary.prior,1);assert.equal(nov.summary.sstg,0);
assert.equal(M.acAssignmentsForDate('2026-10-31').flatMap(x=>x.stores).length,38);assert.equal(M.AC_ASSIGNMENTS.flatMap(x=>x.stores).length,35);
const records=['2026-10-31','2026-11-01'].flatMap(record_date=>stores.map(x=>({...x,record_date,line_completed:false,signature_completed:false})));
assert.equal(M.scopeData({line:records}).line.length,5);const out=S.lineExport(stores,records,'2026-10-31','2026-11-01','2026-11-02');assert.equal(out.length,5);assert.equal(out.filter(x=>x.日期==='2026-11-01').length,1);assert.equal(rows.length,16);assert.equal(records.length,8);
console.log('PASS scope date boundary, mixed period, baseline denominator, hours, AC 38→35, line export and immutable source arrays');
