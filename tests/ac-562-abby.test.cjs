const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../operations-metrics.js'),S=require('../operations-summary.js');

test('562 belongs only to Abby; current/historical scope totals remain intact',()=>{
  for(const date of ['2026-10-31','2026-11-01','2026-11-02']){
    const groups=M.acAssignmentsForDate(date),all=groups.flatMap(x=>x.stores);
    assert.deepEqual(groups.filter(x=>x.stores.includes('562')).map(x=>x.name),['Abby']);
    assert.equal(new Set(all).size,all.length);
    assert.equal(all.length,date<'2026-11-01'?38:35);
    if(date>='2026-11-01'){
      assert.deepEqual(groups.map(x=>[x.name,x.stores.length]),[['Abby',4],['Avery',5],['Chance',9],['Jewel',9],['Renee',8]]);
      assert.deepEqual(groups.map(x=>[x.name,x.stores.filter(c=>!M.NON_DELIVERY_STORES.has(c)).length]),[['Abby',3],['Avery',5],['Chance',8],['Jewel',9],['Renee',8]]);
      for(const code of ['025','173','580'])assert.ok(!all.includes(code));
    }
  }
});

test('actual daily/weekly/monthly AC renderers move 562 waits and inspection denominator to Abby',()=>{
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',remove(){}});return elements.get(id);};
  const window={OpsMetrics:M,OpsSummary:S};
  const source=fs.readFileSync(path.join(__dirname,'../operations-report.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.__test={renderAcWaitSummary,renderAcLineSummary};})();');
  vm.runInNewContext(source,{window,document:{getElementById:get},opsEscape:s=>String(s)});
  const value=(id,name)=>get(id).innerHTML.match(new RegExp('<strong>'+name+'</strong><b>([^<]+)</b>'))?.[1];
  for(const period of ['day','week','month']){
    const date='2026-11-02',r=S.range(date,period),base={record_date:date};
    const waits=['133','562','562','066','203'].map(store_code=>({...base,store_code}));
    const line=[['133',true,true],['562',false,false],['066',true,false],['203',true,true]].map(([store_code,line_completed,signature_completed])=>({...base,store_code,line_completed,signature_completed}));
    const original=JSON.stringify({waits,line});
    window.__test.renderAcWaitSummary(waits,r);
    assert.equal(value('opsDelayAcSummary','Abby'),'3 筆');
    assert.equal(value('opsDelayAcSummary','Avery'),'1 筆');
    window.__test.renderAcLineSummary(line,r);
    assert.equal(value('opsLineAcSummary','Abby'),'50.0%');
    assert.equal(value('opsLineAcSummary','Avery'),'50.0%');
    assert.equal(JSON.stringify({waits,line}),original);
  }
});

test('562 export preserves completed-zero record once and both consumers refresh metrics cache',()=>{
  const stores=[{store_code:'562',restaurant_name:'新竹竹北'}];
  const rows=[{record_date:'2026-11-02',...stores[0],line_completed:false,signature_completed:false}];
  const result=S.lineExport(stores,rows,'2026-11-02','2026-11-02','2026-11-02');
  assert.equal(result.length,1);
  assert.equal(result[0].店號,'562');
  assert.equal(result[0].是否登記,'是');
  assert.equal(result[0].劃線,'未完成');
  assert.equal(result[0].簽名,'未完成');
  for(const name of ['admin.html','analysis.html'])assert.match(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),/operations-metrics\.js\?v=20261103-unified/);
});
