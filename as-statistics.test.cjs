const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'dashboard.html'),'utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
class Element{constructor(){this.value='';this.children=[];this.options=[];this.hidden=false;this.style={};this.textContent='';}replaceChildren(){this.children=[];this.options=[];}appendChild(e){this.children.push(e);}append(...es){this.children.push(...es);}add(o){this.options.push(o);if(!this.value)this.value=o.value;}setAttribute(k,v){this[k]=v;}}
const animations=[];
Element.prototype.querySelectorAll=function(){return this.children.map(row=>row.querySelector('.as-reason-fill'));};
Element.prototype.querySelector=function(){if(!this.fill){const width=Number(/width:([0-9.]+)%/.exec(this.innerHTML)?.[1]||0);this.fill={dataset:{},parentElement:{getBoundingClientRect:()=>({width:100})},getBoundingClientRect:()=>({width}),animate:(frames,options)=>animations.push({frames,options})};}return this.fill;};
const els={};for(const m of html.matchAll(/\bid="([^"]+)"/g))els[m[1]]=new Element();
let switched=null;const sample=[{createdAt:'2025-12-31T12:00:00Z',status:'완료'},{createdAt:'2026-01-01T00:00:00Z',status:'접수'},{createdAt:'2026-01-22T00:00:00Z',status:'완료'},{createdAt:'2026-02-04T00:00:00Z',status:'납품 요청'},{createdAt:'2026-03-04',status:'legacy'},{createdAt:'2026-02-30',status:'접수'},{}];
const c={AsAmount:require('./as-amount'),window:{location:{hostname:'example.test'},matchMedia:()=>({matches:false})},console,Date,asJobToday:()=>'2026-10-23',Option:function(text,value){this.text=text;this.value=value},SERVER:'',document:{getElementById:id=>{assert(els[id],id);return els[id]},createElement:()=>new Element(),querySelector:()=>({id:'list-menu'})},fetch:async()=>({ok:true,json:async()=>({list:sample})}),setAsDdValue:(id,v)=>els[id].value=v,_asCalSyncFromInputs(){},switchTab:(...args)=>switched=args};vm.createContext(c);vm.runInContext(html.slice(html.indexOf('let _asStatsRecords = [];'),html.indexOf('let _asKpiSelectionMade = false;')),c);
assert(!html.includes('getAsExampleRecords'));assert(!html.includes('예시 데이터 보기'));
assert.equal(c.asStatsDateKey('2026-02-29'),null);assert.equal(c.asStatsDateKey('2024-02-29').month,2);assert.equal(c.asStatsDateKey(null),null);
const amounts=[{createdAt:'2026-01-01',amount:120000},{createdAt:'2026-01-31',amount:80000},{createdAt:'2026-02-01',amount:300000},{createdAt:'2026-02-02',amount:0},{createdAt:'2026-02-03',amount:null},{createdAt:'2026-02-04'},{createdAt:'2025-12-31',amount:900000},{createdAt:'2026-02-30',amount:700000},{createdAt:'2026-01-03',amount:-1}];
let money=c.summarizeAsStatistics(amounts,2026,1);assert.equal(money.totalAmount,500000n);assert.equal(money.amounts[0],200000n);assert.equal(money.amounts[1],300000n);assert.equal(money.amountEntries[1],2);assert.equal(money.amounts.length,12);
amounts[0].amount=220000;assert.equal(c.summarizeAsStatistics(amounts,2026,1).totalAmount,600000n);
assert.equal(c.summarizeAsStatistics(amounts,2025,12).totalAmount,900000n);assert.equal(c.summarizeAsStatistics([],2026,1).totalAmount,0n);
assert.equal(c.summarizeAsStatistics([{createdAt:'2026-01-01',amount:Number.MAX_SAFE_INTEGER},{createdAt:'2026-01-02',amount:Number.MAX_SAFE_INTEGER}],2026,1).totalAmount,18014398509481982n);
c.renderAsAmounts(2026,1,money);assert(els.asAmountChart.children[0]['aria-label'].includes('200,000원'));assert.equal(els.asAmountAnnual.textContent,'500,000원');assert.equal(els.asAmountChart.children.length,12);
let s=c.summarizeAsStatistics(sample,2026,1);assert.equal(s.total,4);assert.equal(s.current,2);assert.equal(s.previous,1);assert.equal(s.pending,3);assert.equal(s.invalid,2);assert.equal(s.statuses['기타'],1);assert.equal(s.counts.length,12);
s=c.summarizeAsStatistics([],2026,1);assert.equal(s.total,0);assert.equal(s.previous,0);
const reasonCases=['치수 오작',' 품질 불량 ','현장 추가 요청','',null,'__proto__','용접 불량'];
const reasonSummary=c.summarizeAsStatistics(reasonCases.map(reason=>({createdAt:'2026-01-01',reason})).concat([{createdAt:'2025-01-01',reason:'도장 불량'},{createdAt:'invalid',reason:'도장 불량'}]),2026,1);
assert.equal(reasonSummary.reasons['치수 오작'],1);assert.equal(reasonSummary.reasons['품질 불량'],1);assert.equal(reasonSummary.reasons['기타'],4);assert.equal(Object.keys(reasonSummary.reasons).length,8);assert.equal(reasonSummary.reasons['도장 불량'],0);assert.equal(Object.values(reasonSummary.reasons).reduce((a,b)=>a+b,0),reasonSummary.total);
assert.equal(Object.values(c.summarizeAsStatistics([],2026,1).reasons).reduce((a,b)=>a+b,0),0);
const heatRecords=reasonCases.map(reason=>({createdAt:'2026-01-01',reason})).concat([
 {createdAt:'2026-02-01',reason:'치수 오작'},{createdAt:'2026-02-15',reason:'치수 오작'},
 {createdAt:'2025-01-01',reason:'품질 불량'},{createdAt:'2026-02-30',reason:'품질 불량'},null,
 {createdAt:'2026-03-01',reason:'<img src=x onerror=alert(1)>'}
]);
const heat=c.summarizeAsReasonHeatmap(heatRecords,2026,'2026-10-23');
assert.equal(heat.names.length,8);assert.equal(heat.values.length,8);assert(heat.values.every(row=>row.length===12));
assert.equal(heat.total,10);assert.equal(heat.values[0][1],2);assert.equal(heat.values[7][0],4);assert.equal(heat.values[7][2],1);
assert.deepEqual(Array.from(heat.totals),Array.from(c.summarizeAsStatistics(heatRecords,2026,1).counts));
assert.equal(heat.values.flat().reduce((sum,n)=>sum+n,0),heat.total);
assert.deepEqual(Array.from(heat.future),[false,false,false,false,false,false,false,false,false,false,true,true]);
assert(c.summarizeAsReasonHeatmap([],2027,'2026-10-23').future.every(Boolean));
assert(c.summarizeAsReasonHeatmap([],2025,'2026-10-23').future.every(value=>!value));
assert.equal(c.summarizeAsReasonHeatmap([{createdAt:'2027-02-01',reason:'품질 불량'}],2027,'2026-10-23').future[1],false);
c.renderAsReasonHeatmap(heatRecords,2026);
assert.equal((els.asReasonHeatBody.innerHTML.match(/class="as-reason-heat-cell"/g)||[]).length,96);
assert.equal((els.asReasonHeatBody.innerHTML.match(/data-future="true"/g)||[]).length,16);
assert(!els.asReasonHeatBody.innerHTML.includes('<img'));assert(els.asReasonHeatBody.innerHTML.includes('2026년 2월 · 치수 오작 · 2건 · 해당 월 비중 100.0%'));
els.asReasonHeatToggle.onclick();assert.equal(els.asReasonHeatToggle['aria-checked'],'true');assert(els.asReasonHeatBody.innerHTML.includes('>100.0%</button>'));
els.asReasonHeatToggle.onclick();assert.equal(els.asReasonHeatToggle['aria-checked'],'false');assert(!els.asReasonHeatBody.innerHTML.includes('>100.0%</button>'));
c.renderAsReasonHeatmap([],2027);assert.equal((els.asReasonHeatBody.innerHTML.match(/data-future="true"/g)||[]).length,96);
c.renderAsReasonHeatmap([],2025);assert.equal((els.asReasonHeatBody.innerHTML.match(/data-future="true"/g)||[]).length,0);assert(!els.asReasonHeatBody.innerHTML.includes('NaN'));
assert(html.indexOf('aria-labelledby="asReasonHeatTitle"')>html.indexOf('id="asStatsProductsPeriod"'));
assert(!html.slice(html.indexOf('aria-labelledby="asReasonHeatTitle"'),html.indexOf('<!-- 제품명 관리 -->')).includes('<select'));
const productRecords=[
 {createdAt:'2026-01-02',product:' LADDER  A '},{createdAt:'2026-01-03',product:'LADDER A'},
 {createdAt:'2026-01-04',product:'__proto__'},{createdAt:'2026-01-05',product:'<img src=x onerror=alert(1)>'},
 {createdAt:'2026-01-06',product:' '},{createdAt:'2026-01-07',product:null},
 {createdAt:'2026-02-02',product:'OTHER MONTH'},{createdAt:'2025-01-02',product:'OTHER YEAR'},
 {createdAt:'2026-02-30',product:'INVALID DATE'}
];
const products=c.summarizeAsProducts(productRecords,2026,1);
assert.equal(products.total,6);assert.equal(products.entries.length,4);assert.equal(products.entries.find(x=>x.name==='LADDER A').count,2);assert.equal(products.entries.find(x=>x.name==='미입력').count,2);assert.equal(products.entries.find(x=>x.name==='__proto__').count,1);
assert.equal(c.summarizeAsProducts(productRecords,2026,2).total,1);assert.equal(c.summarizeAsProducts([],2026,1).entries.length,0);
const manyProducts=c.summarizeAsProducts(Array.from({length:9},(_,i)=>({createdAt:'2026-01-01',product:'PRODUCT '+i})),2026,1);
assert.equal(manyProducts.entries.length,9);assert.equal(manyProducts.entries.reduce((sum,x)=>sum+x.count,0),manyProducts.total);
c.renderAsProducts(productRecords,2026,1);assert.equal(els.asStatsProductsTotal.textContent,'33.3%');assert.equal(els.asStatsProductsLegend.children.length,4);assert.equal(els.asStatsProductsPager.hidden,true);assert(!els.asStatsProductsChart.innerHTML.includes('<img'));assert(els.asStatsProductsLegend.children.some(row=>row.children[0].children.some(child=>child.textContent==='<img src=x onerror=alert(1)>')));
const productButtons=els.asStatsProductsLegend.children.map(row=>row.children[0]);assert.equal(productButtons[0]['aria-pressed'],'true');
productButtons[2].onclick();assert.equal(productButtons[2]['aria-pressed'],'true');assert.equal(productButtons[0]['aria-pressed'],'false');assert.equal(els.asStatsProductsTotal.textContent,'16.7%');assert(els.asStatsProductsStatus.textContent.includes('1건'));
productButtons[2].onclick();assert.equal(els.asStatsProductsTotal.textContent,'6건');assert.equal(els.asStatsProductsLabel.textContent,'총 접수');assert.equal(els.asStatsProductsReset.disabled,true);assert.equal(els.asStatsProductsArc['stroke-dasharray'],'100 0');
productButtons[0].onclick();els.asStatsProductsReplay.onclick();assert.equal(els.asStatsProductsTotal.textContent,'33.3%');els.asStatsProductsReset.onclick();assert.equal(els.asStatsProductsTotal.textContent,'6건');
c.renderAsProducts([],2026,12);assert.equal(els.asStatsProductsEmpty.hidden,false);assert.equal(els.asStatsProductsHint.textContent,'미도래');assert.equal(els.asStatsProductsLegend.children.length,0);assert(!els.asStatsProductsChart.innerHTML.includes('NaN'));
assert.equal(els.asStatsProductsTotal.textContent,'0건');assert.equal(els.asStatsProductsArc['stroke-dasharray'],'0 100');assert.equal(els.asStatsProductsReplay.disabled,true);
const elevenProducts=Array.from({length:11},(_,i)=>({createdAt:'2026-10-01',product:'PRODUCT '+String(i+1).padStart(2,'0')}));
c.renderAsProducts(elevenProducts,2026,10);assert.equal(els.asStatsProductsLegend.children.length,4);assert.equal(els.asStatsProductsPager.hidden,false);assert.equal(els.asStatsProductsPageInfo.textContent,'1–4 / 11종');
const productNames=()=>els.asStatsProductsLegend.children.map(li=>li.children[0].title);
assert.deepEqual(productNames(),['PRODUCT 01','PRODUCT 02','PRODUCT 03','PRODUCT 04']);
els.asStatsProductsPages.children.find(b=>b.textContent==='2').onclick();assert.equal(els.asStatsProductsPageInfo.textContent,'5–8 / 11종');assert.deepEqual(productNames(),['PRODUCT 05','PRODUCT 06','PRODUCT 07','PRODUCT 08']);assert.equal(els.asStatsProductsLabel.textContent,'PRODUCT 05');assert.equal(els.asStatsProductsTotal.textContent,'9.1%');
els.asStatsProductsPages.children.find(b=>b.textContent==='›').onclick();assert.deepEqual(productNames(),['PRODUCT 09','PRODUCT 10','PRODUCT 11']);assert.equal(els.asStatsProductsPages.children.at(-1).disabled,true);
els.asStatsProductsLegend.children[2].children[0].onclick();assert.equal(els.asStatsProductsLabel.textContent,'PRODUCT 11');assert.equal(els.asStatsProductsLegend.children[2].children[0]['aria-pressed'],'true');
els.asStatsProductsReset.onclick();assert.equal(els.asStatsProductsTotal.textContent,'11건');
els.asStatsProductsPages.children.find(b=>b.textContent==='1').onclick();assert.equal(els.asStatsProductsPages.children[0].disabled,true);assert.deepEqual(productNames(),['PRODUCT 01','PRODUCT 02','PRODUCT 03','PRODUCT 04']);
c.renderAsProducts(elevenProducts,2026,9);assert.equal(els.asStatsProductsPager.hidden,true);assert.equal(els.asStatsProductsLegend.children.length,0);assert.equal(els.asStatsProductsPages.children.length,0);
c.renderAsProducts(Array.from({length:100},(_,i)=>({createdAt:'2026-10-01',product:'ITEM '+i})),2026,10);assert.equal(els.asStatsProductsPages.children.length,7);assert.equal(els.asStatsProductsLegend.children.length,4);
assert(!html.includes('id="asStatsProductsMore"'));
assert.equal(c.asAnnualChangeText(80,100),'전년 대비 20.0% 감소');assert.equal(c.asAnnualChangeText(120,100),'전년 대비 20.0% 증가');assert.equal(c.asAnnualChangeText(0,100),'전년 대비 100.0% 감소');assert.equal(c.asAnnualChangeText(0,0),'전년 대비 변동 없음');assert.equal(c.asAnnualChangeText(5,0),'전년 0건 대비 5건 증가');assert.equal(c.summarizeAsStatistics(sample,2026,1).previousYearTotal,1);
(async()=>{
 await c.loadAsStatistics();
 assert.equal(els.kpiTotal.textContent,'5');assert.equal(els.kpiOpen.textContent,'2');
 c.renderAsOverviewKpis([{createdAt:'2020-01-01',status:'제작 요청'},{status:'완료'},{status:'도장 요청'}]);
 assert.equal(els.kpiTotal.textContent,'2');assert.equal(els.kpiReviewWait.textContent,'1');assert.equal(els.kpiApproveWait.textContent,'1');
 assert(!html.slice(html.indexOf('<div id="asSubList">'),html.indexOf('<!-- /asSubList -->')).includes('id="asKpiRow"'));
 c.renderAsOverviewKpis(sample);

 els.asStatsYear.value='2025';c.renderAsStatistics();assert.equal(els.asStatsYearLabel.textContent,'2025년 접수');assert.equal(els.asStatsPendingLabel.textContent,'2025년 접수 중 미완료');assert.equal(els.asStatsTotal.textContent,'1건');assert.equal(els.asStatsPending.textContent,'0건');
 els.asStatsYear.value='2026';c.renderAsStatistics();assert.equal(els.asStatsYearLabel.textContent,'2026년 접수');assert.equal(els.asStatsPendingLabel.textContent,'2026년 접수 중 미완료');assert.equal(els.asStatsTotal.textContent,'4건');assert(els.asStatsYearDelta.textContent.includes('300.0% 증가'));assert.equal(els.asStatsPending.textContent,'3건');
 c.showAsStatisticsMonth(2026,1);
 assert.equal(els.asStatsProductsTotal.textContent,'100.0%');assert.equal(els.asStatsProductsHint.textContent,'2건 기준');assert.equal(els.asStatsProductsPeriod.textContent,'2026년 1월 · 접수일 기준');
 assert.equal(els.asAmountChart.children.length,12);assert(els.asAmountChart.children[0]['aria-label'].includes('0원'));assert.equal(els.asStatsMonthly.textContent,'2건');assert.equal(switched,null);
 assert(els.asStatsReasonsHint.textContent.includes('2건 기준'));
 assert.equal(els.asStatsChart.children[0]['aria-pressed'],'true');
 els.asStatsChart.children[1].onclick();
 assert.equal(els.asStatsProductsTotal.textContent,'100.0%');assert.equal(els.asStatsProductsHint.textContent,'1건 기준');
 assert.equal(els.asAmountChart.children.length,12);assert.equal(els.asAmountChart.children[1]['aria-pressed'],'true');assert(els.asStatsReasonsHint.textContent.includes('1건 기준'));
 assert.equal(els.asStatsChart.children[1]['aria-pressed'],'true');assert.equal(els.asStatsChart.children[0]['aria-pressed'],'false');assert.equal(switched,null);
 els.asStatsChart.children[11].onclick();assert.equal(els.asStatsReasonsEmpty.hidden,false);assert(els.asStatsReasons.children.every(row=>!row.innerHTML.includes('NaN')));
 c.showAsStatisticsMonth(2025,12);assert(els.asStatsReasonsHint.textContent.includes('1건 기준'));
 assert(!html.includes('id="asStatsMonth"'));assert(!html.includes('asStatsReasonMonth'));assert(!html.includes('monthSelect'));
 await c.loadAsStatistics();assert.strictEqual(vm.runInContext('_asStatsRecords',c),sample);
 assert(!html.includes('id="asAmountMonthly"'));assert(html.indexOf('id="asAmountAnnual"')>html.indexOf('id="asAmountChart"'));
 c.window.location.hostname='localhost';await c.loadAsStatistics();assert.strictEqual(vm.runInContext('_asStatsRecords',c),sample);
 c.showAsStatisticsMonth(2026,1);assert.equal(els.asStatsReasons.children.length,8);assert.equal(els.asStatsChart.children.length,12);assert.equal(els.asStatsPeriodTitle.textContent,'2026년 1월 · 접수 분석');
 assert(els.asStatsReasons.children[0].innerHTML.includes('기타</span><strong class="as-reason-count">2<small>건</small>'));assert(els.asStatsReasons.children[0].innerHTML.includes('as-reason-percent">100.0%'));
 assert.equal(els.asStatsReasons.children.filter(row=>row['data-zero']==='true').length,7);
 assert(els.asStatsReasons.children.every(row=>!row.hidden&&!row.innerHTML.includes('as-reason-fill')));
 c.showAsStatisticsMonth(2026,2);assert.equal(els.asStatsReasons.children.length,8);assert(els.asStatsReasons.children[0].innerHTML.includes('as-reason-count">1<small>건</small>'));assert(els.asStatsReasons.children[0].innerHTML.includes('as-reason-percent">100.0%'));
 c.showAsStatisticsMonth(2026,4);assert.equal(els.asStatsReasons.children.length,8);assert(els.asStatsReasons.children.every(row=>row['data-zero']==='true'&&!row.hidden&&row.innerHTML.includes('as-reason-count">0<small>건</small>')&&row.innerHTML.includes('as-reason-percent">0.0%')&&row.innerHTML.includes('width:0.0%')));
 const counts=[4,6,5,8,6,9,7,10,6,9,0,0];
 assert.equal(c.asMonthlyAverage(counts,2026,'2026-10-23').value,7);
 assert.equal(c.asMonthlyAverage(counts,2025,'2026-10-23').value,70/12);
 assert.equal(c.asMonthlyAverage(counts,2027,'2026-10-23').value,null);
 assert.equal(c.asMonthlyAverage(counts,2026,'2026-01-01').value,4);
 assert.equal(c.asMonthlyAverage(Array(12).fill(0),2026,'2026-10-23').value,0);
 const amountSegments=c.asAmountSegments([10n,0n,20n,0n,30n],[1,1,1,0,1]);
 assert.equal(amountSegments.length,2);assert.equal(amountSegments[0].split(' ').length,3);assert(amountSegments[0].includes('150,180'));
 assert.equal(c.asAmountSegments([0n,0n],[0,0]).length,0);
 assert(els.asStatsChart.children.every(e=>!e.innerHTML.includes('as-stats-bar')));
 assert(els.asAmountChart.children.every(e=>e.innerHTML.includes('as-amount-bar')&&!e.innerHTML.includes('as-amount-point')));
 assert.equal(c.asTrendSegments(counts,2026,'2026-10-23')[0].split(' ').length,10);
 assert.equal(c.asTrendSegments(counts,2025,'2026-10-23')[0].split(' ').length,12);
 assert.equal(c.asTrendSegments(counts,2026,'2026-01-01').length,1);
 const segments=c.asTrendSegments([4,0,5,0,0,0,0,0,0,0,0,0],2027,'2026-10-23');assert.equal(segments.length,2);assert(segments.every(p=>!p.includes('NaN')));
 assert.equal(c.asTrendSegments(Array(12).fill(0),2027,'2026-10-23').length,0);
 assert(!html.includes('id="monthly-chart-legend"'));
 console.log('PASS: 8 ranked types preserve counts and shares; trend lines skip future gaps; month/year selection, amounts and script syntax.');
})().catch(e=>{console.error(e);process.exitCode=1});
