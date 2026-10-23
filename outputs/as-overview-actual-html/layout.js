
(function installAsOverviewLayoutPreview(){
 const requested=new URLSearchParams(location.search).get('as-layout');
 if(!/^[0-5]$/.test(requested||''))return;
 const root=document.getElementById('asSubStats'),names=['현재 화면','기존 배치 정돈','추이 넓게','그래프 나란히','월별 가로표','월별 행 원장'];
 const picker=document.createElement('div');picker.id='asOverviewLayoutPicker';
 picker.innerHTML='<p>현재 AS 현황 화면 · 레이아웃 비교</p><nav aria-label="AS 현황 시안">'+names.map((name,i)=>'<button type="button" data-layout="'+i+'" aria-pressed="false">'+(i?i+'. ':'')+name+'</button>').join('')+'</nav>';
 root.prepend(picker);
 const table=document.createElement('section');table.id='asOverviewPreviewTable';table.className='as-stats-chart-panel';table.hidden=true;root.querySelector('.as-overview-charts').prepend(table);
 let active=Number(requested);
 function renderTable(){
  table.hidden=active!==4&&active!==5;if(table.hidden)return;
  const year=Number(document.getElementById('asStatsYear').value);if(!year)return;
  const months=Array.from({length:12},(_,index)=>{const records=_asStatsRecords.filter(record=>{const date=asStatsDateKey(record.createdAt);return date?.year===year&&date.month===index+1});const done=records.filter(record=>record.status==='완료').length;return {count:records.length,done,pending:records.length-done,amount:records.reduce((total,record)=>total+BigInt(AsAmount.read(record.amount)||0),0n)};});
  const format=value=>value.toLocaleString('ko-KR'),chosen=index=>' aria-current="'+(index+1===_asStatsSelectedMonth)+'"',monthButton=(index)=>'<button type="button" data-month="'+(index+1)+'" aria-label="'+year+'년 '+(index+1)+'월 조회">'+(index+1)+'월</button>';
  let html='<h2>'+year+'년 월별 접수 원장</h2><div class="as-preview-table-scroll" tabindex="0" role="region" aria-label="월별 접수 원장"><table class="as-preview-table">';
  if(active===4){html+='<thead><tr><th scope="col">구분</th>'+months.map((r,i)=>'<th scope="col"'+chosen(i)+'>'+monthButton(i)+'</th>').join('')+'</tr></thead><tbody>';for(const [label,key] of [['접수 (건)','count'],['완료 (건)','done'],['미완료 (건)','pending'],['금액 (원)','amount']])html+='<tr><th scope="row">'+label+'</th>'+months.map((r,i)=>'<td'+chosen(i)+'>'+format(r[key])+'</td>').join('')+'</tr>';html+='</tbody>';}
  else{html+='<thead><tr><th scope="col">월</th><th scope="col">접수 (건)</th><th scope="col">완료 (건)</th><th scope="col">미완료 (건)</th><th scope="col">금액 (원)</th></tr></thead><tbody>'+months.map((r,i)=>'<tr'+chosen(i)+'><th scope="row">'+monthButton(i)+'</th><td>'+r.count+'</td><td>'+r.done+'</td><td>'+r.pending+'</td><td>'+format(r.amount)+'</td></tr>').join('')+'</tbody><tfoot><tr><th scope="row">합계</th>'+['count','done','pending','amount'].map(key=>'<td>'+format(months.reduce((sum,r)=>sum+BigInt(r[key]),0n))+'</td>').join('')+'</tr></tfoot>';}
  table.innerHTML=html+'</table></div>';
 }
 function applyLayout(value){
  active=value;if(active)root.dataset.layoutPreview=String(active);else delete root.dataset.layoutPreview;
  picker.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.layout)===active)));
  root.querySelectorAll('.as-stats-chart-panel').forEach(panel=>panel.style.minHeight='');
  root.querySelectorAll('.as-reason-table-wrap').forEach(wrap=>wrap.style.marginTop='');
  const url=new URL(location.href);url.searchParams.set('as-layout',String(active));history.replaceState(null,'',url);
  renderTable();requestAnimationFrame(()=>{renderMonthlyLines();renderReasonDonut();if(!active)originalAlign();});
 }
 const originalAlign=alignReasonTable;alignReasonTable=function(){if(!root.dataset.layoutPreview)originalAlign();};
 const originalRender=renderAsStatistics;renderAsStatistics=function(){originalRender();renderTable();};
 picker.addEventListener('click',event=>{const button=event.target.closest('[data-layout]');if(button)applyLayout(Number(button.dataset.layout));});
 table.addEventListener('click',event=>{const button=event.target.closest('[data-month]');if(!button)return;const month=Number(button.dataset.month);showAsStatisticsMonth(Number(document.getElementById('asStatsYear').value),month);table.querySelector('[data-month="'+month+'"]')?.focus({preventScroll:true});});
 applyLayout(active);
 document.addEventListener('DOMContentLoaded',()=>{if(!currentUser)return;document.getElementById('asSubmenu').classList.add('open');switchTab('as',document.querySelector('.sidebar .tab[onclick*=toggleAsMenu]'),'stats');});
})();
