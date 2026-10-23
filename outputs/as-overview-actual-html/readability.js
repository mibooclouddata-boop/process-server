// Readability layer on the existing dashboard renderers. Data and actions remain shared.
renderMonthlyLines=function(){
 const chart=document.getElementById('asStatsChart');if(!chart)return;
 chart.querySelector('.monthly-line-overlay')?.remove();
 const year=Number(document.getElementById('asStatsYear').value);if(!year)return;
 const result=summarizeAsStatistics(_asStatsRecords,year,_asStatsSelectedMonth),peak=Math.max(0,...result.counts),step=peak<=10?5:10,max=Math.max(step,Math.ceil(peak/step)*step);
 chart.querySelectorAll('.as-stats-month').forEach((button,index)=>{
  const count=result.counts[index],height=count/max*176,bar=button.querySelector('.as-stats-bar'),value=button.querySelector('.as-stats-value');
  bar.style.height=height+'px';value.style.top=(198-height)+'px';value.textContent=count?String(count):'';button.title=year+'년 '+(index+1)+'월 '+count+'건';
 });
 let axis=chart.parentElement.querySelector('.readable-y-axis');if(!axis){axis=document.createElement('div');axis.className='readable-y-axis';axis.setAttribute('aria-hidden','true');chart.parentElement.append(axis)}
 axis.innerHTML=[max,max/2,0].map(value=>'<span style="top:'+(208-value/max*176)+'px">'+value+'</span>').join('');
 let legend=document.getElementById('monthly-chart-legend');if(!legend){legend=document.createElement('div');legend.id='monthly-chart-legend';legend.className='monthly-chart-legend';chart.parentElement.before(legend)}
 legend.textContent='연간 '+result.total.toLocaleString()+'건 · 월평균 '+(result.total/12).toFixed(1)+'건';
 document.getElementById('comparison-count').textContent=year+'년 '+_asStatsSelectedMonth+'월 · '+result.current.toLocaleString()+'건';
};
const originalStandaloneAmounts=renderAsAmounts;
renderAsAmounts=function(year,month,result){
 originalStandaloneAmounts(year,month,result);
 const chart=document.getElementById('asAmountChart'),max=Math.max(1,...result.amounts.map(Number));
 chart.closest('.as-daily-section').querySelector('.as-chart-unit').textContent='그래프 단위: 만 원';
 chart.querySelectorAll('.as-amount-month').forEach((button,index)=>{
  const amount=result.amounts[index],value=button.querySelector('.as-amount-value'),bar=button.querySelector('.as-amount-bar'),height=Number(amount)/max*132;
  value.textContent=amount?Number(amount/10000n).toLocaleString('ko-KR'):'';value.style.top=(154-height)+'px';bar.style.height=height+'px';
  button.title=year+'년 '+(index+1)+'월 '+amount.toLocaleString('ko-KR')+'원';
 });
};
const originalStandaloneDonut=renderReasonDonut;
renderReasonDonut=function(){
 originalStandaloneDonut();const host=document.getElementById('reason-donut');if(!host?._entries)return;
 host.querySelectorAll('[data-reason-index]').forEach(element=>{const count=host._entries[Number(element.dataset.reasonIndex)]?.[1]||0;element.dataset.zero=String(count===0);if(count===0)element.setAttribute('tabindex','-1')});
};
window.addEventListener('resize',()=>requestAnimationFrame(renderMonthlyLines));
