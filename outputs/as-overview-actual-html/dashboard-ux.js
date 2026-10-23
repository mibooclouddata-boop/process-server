// Standalone design proposals only. Retains original terminology, data and list actions.
(function () {
 const root=document.getElementById('asSubStats'),variant=Number(root.dataset.layoutPreview);
 const today=AS_PREVIEW_DATE,nowYear=Number(today.slice(0,4)),nowMonth=Number(today.slice(5,7));
 const $=id=>document.getElementById(id),num=n=>n.toLocaleString('ko-KR');
 const state={mode:'normal',zero:false};
 const context=document.createElement('section');context.className='ux-context';
 context.innerHTML='<div><h2>처리할 업무</h2><p>현재 상태 기준 · 전체 기간 · 완료 제외</p></div><p id="uxPendingRelation"></p>';
 $('asKpiRow').before(context);
 const period=document.createElement('div');period.className='ux-period';period.innerHTML='<div id="uxPeriod"></div><div><button type="button" id="uxReset">선택 초기화</button><label>화면 상태 <select id="uxState"><option value="normal">정상</option><option value="loading">로딩</option><option value="empty">데이터 없음</option><option value="error">조회 오류</option></select></label></div>';
 $('asStatsContent').before(period);
 const issues=document.createElement('div');issues.className='ux-checks';issues.id='uxChecks';period.after(issues);
 const notice=document.createElement('div');notice.className='ux-notice';notice.id='uxNotice';notice.setAttribute('role','status');notice.hidden=true;$('asStatsContent').before(notice);
 root.querySelectorAll('#asKpiRow button').forEach(button=>{button.querySelector('small').textContent='목록 보기 ↗';button.querySelector('small').removeAttribute('aria-hidden');});
 const reasons=$('asStatsReasonsTitle').closest('section');reasons.classList.add('ux-reasons');
 if(variant!==1)reasons.classList.add('ux-bars');
 const toggle=document.createElement('button');toggle.type='button';toggle.id='uxZeroToggle';toggle.className='ux-zero-toggle';toggle.setAttribute('aria-expanded','false');
 reasons.append(toggle);toggle.onclick=()=>{state.zero=!state.zero;renderUx();};
 const foot=document.createElement('p');foot.className='ux-footnote';foot.textContent='예시 자료 기준 · 조회 0건과 미도래를 구분합니다. 원본 API에 집계 완료일·누락 여부가 없어 0건 확정 및 동일 기간 비교는 확인이 필요합니다.';root.append(foot);
 function future(year,month){return year>nowYear||(year===nowYear&&month>nowMonth);}
 function rowsFor(year,month){return _asStatsRecords.filter(r=>{const d=asStatsDateKey(r.createdAt);return d&&d.year===year&&(month==null||d.month===month);});}
 function zeroText(count,year,month){return count?num(count):future(year,month)?'—':'0*';}
 function renderUx(){
  const year=Number($('asStatsYear').value),month=_asStatsSelectedMonth;if(!year)return;
  const sum=summarizeAsStatistics(_asStatsRecords,year,month),monthRows=rowsFor(year,month),past=future(year,month),ongoing=year===nowYear&&month===nowMonth;
  const total=_asStatsRecords.filter(r=>r.status!=='완료').length,stages=['접수','제작 요청','도장 요청','납품 요청'].map(s=>_asStatsRecords.filter(r=>r.status===s).length),other=total-stages.reduce((a,b)=>a+b,0);
  $('uxPendingRelation').textContent='전체 대기 '+num(total)+'건 = 단계별 '+stages.map(num).join(' + ')+'건'+(other?' + 기타 상태 '+num(other)+'건':'');
  root.querySelectorAll('#asKpiRow button').forEach(button=>button.setAttribute('aria-label',button.querySelector('span').textContent+' '+button.querySelector('strong').textContent+'건, 해당 조건의 접수 목록 보기'));
  $('uxPeriod').textContent='조회 '+year+'년 · 선택 '+month+'월'+(past?' · 미도래':ongoing?' · 집계 진행 중':'')+' / 접수일 기준 / 기준일 '+today+' (한국 시간)';
  $('uxReset').disabled=year===nowYear&&month===nowMonth;
  $('asStatsMessage').textContent='예시 데이터 '+_asStatsRecords.length+'건 · 접수 목록과 동일한 자료 · 실제 데이터 저장 없음';
  $('asStatsChartHint').textContent='월을 선택하면 유형별 집계와 금액이 함께 바뀝니다. 단위: 건 · 0* 조회 자료 없음 / — 미도래';
  $('monthly-chart-legend').textContent=year+'년 조회 합계 '+num(sum.total)+'건 · 월별 접수 건수';
  $('comparison-count').textContent=year+'년 '+month+'월 · '+(past&&!sum.current?'미도래':num(sum.current)+'건')+(ongoing?' (현재까지)':'');
  const diff=sum.current-sum.previous,rate=sum.previous?Math.abs(diff/sum.previous*100).toFixed(1)+'%':null;
  $('comparison-change').textContent=past?'전월 비교 대상 아님':'전월 대비 '+(diff===0?'동일':(diff>0?'+':'−')+num(Math.abs(diff))+'건')+(rate?' ('+rate+' '+(diff>0?'증가':diff<0?'감소':'변동')+')':sum.current?' · 전월 0건, 증감률 산출 제외':'');
  $('comparison-basis').textContent=past?'미래 월은 실제 0건과 구분':sum.previousYear+'년 '+sum.previousMonth+'월 조회 '+num(sum.previous)+'건과 비교'+(ongoing?' · 이번 달 일부 기간 ↔ 전월 전체':'')+' · 자료 완전성 미확인';
  $('asStatsChart').querySelectorAll('.as-stats-month').forEach((button,i)=>{
   const missing=future(year,i+1)&&!sum.counts[i];button.dataset.future=String(missing);button.dataset.zero=String(!sum.counts[i]&&!missing);
   button.querySelector('.as-stats-value').textContent=zeroText(sum.counts[i],year,i+1);
   const label=year+'년 '+(i+1)+'월 '+(missing?'미도래':num(sum.counts[i])+'건'+(!sum.counts[i]?' · 조회 자료 없음, 집계 완료 여부 미확인':''));button.title=label;button.setAttribute('aria-label',label+', 선택하여 유형별 집계 보기');
  });
  $('asAmountChart').querySelectorAll('.as-amount-month').forEach((button,i)=>{
   const missing=future(year,i+1)&&!sum.counts[i];button.dataset.future=String(missing);
   if(missing){button.querySelector('.as-amount-value').textContent='—';button.title=year+'년 '+(i+1)+'월 미도래';button.setAttribute('aria-label',button.title);}
   else if(!sum.amountEntries[i]){button.querySelector('.as-amount-value').textContent='—';button.title=year+'년 '+(i+1)+'월 금액 입력 자료 없음';button.setAttribute('aria-label',button.title);}
  });
  $('asAmountMonthly').textContent=past&&!sum.current?'미도래':sum.amountEntries[month-1]?num(sum.amounts[month-1])+'원':'금액 입력 없음';
  $('asAmountBasis').textContent='접수일 기준 · '+month+'월 금액 입력 '+sum.amountEntries[month-1]+'건 / 미입력 '+(sum.current-sum.amountEntries[month-1])+'건 · 회계상 매출·입금 집계 아님';
  const countByReason=summarizeAsStatistics(monthRows,year,month).reasons;
  const ordered=[...$('asStatsReasons').rows].sort((a,b)=>countByReason[b.querySelector('.as-reason-name').textContent]-countByReason[a.querySelector('.as-reason-name').textContent]);
  ordered.forEach(row=>{const key=row.querySelector('.as-reason-name').textContent,count=countByReason[key];row.dataset.zero=String(!count);row.hidden=!count&&!state.zero;row.querySelector('.as-reason-fill').style.background='#557b9d';$('asStatsReasons').append(row);});
  const zeroCount=Object.values(countByReason).filter(v=>v===0).length;toggle.hidden=!zeroCount;toggle.textContent='0건 유형 '+zeroCount+'개 '+(state.zero?'접기':'펼치기');toggle.setAttribute('aria-expanded',String(state.zero));
  $('asStatsReasonsHint').textContent=year+'년 '+month+'월 · '+(past&&!sum.current?'미도래':num(monthRows.length)+'건 기준')+' · 건수 내림차순';
  const reasonHeader=reasons.querySelector('thead');if(reasonHeader)reasonHeader.innerHTML='<tr><th scope="col">유형</th><th scope="col">전체 대비 비중</th><th scope="col">건수 / 비율</th></tr>';
  $('asStatsReasonsEmpty').hidden=!!monthRows.length;$('asStatsReasonsEmpty').textContent=past?'미도래 기간입니다.':'선택 월에 조회된 접수 자료가 없습니다. 집계 완료 여부는 확인이 필요합니다.';
  $('asStatsEmpty').hidden=!!sum.total;$('asStatsEmpty').textContent='선택 연도에 조회된 자료가 없습니다. 집계 완료 여부는 확인이 필요합니다.';
  const invalid=_asStatsRecords.filter(r=>!asStatsDateKey(r.createdAt)).length,missingAmount=monthRows.filter(r=>AsAmount.read(r.amount)===null).length,unmapped=countByReason['기타'];
  $('uxChecks').textContent='확인할 자료 · 선택 월 금액 미입력 '+missingAmount+'건 · 기타 유형 '+unmapped+'건'+(invalid?' · 접수일 확인 '+invalid+'건':'')+(other?' · 단계 미분류 '+other+'건':'');
  $('uxChecks').title='기타는 현재 정해진 접수 사유와 일치하지 않는 값입니다. 정상적인 기타 사유인지 분류 누락인지 확인하세요.';
  const table=$('asOverviewPreviewTable');if(table&&!table.hidden&&table.querySelector('h2')){
   table.querySelector('h2').textContent=year+'년 월별 접수 원장 · 조회 자료 기준';
   if(variant===4){[...table.querySelectorAll('tbody tr')].forEach((row,ri)=>[...row.querySelectorAll('td')].forEach((cell,i)=>{if(future(year,i+1)&&!sum.counts[i])cell.textContent='—';else if(ri===0&&!sum.counts[i])cell.textContent='0*';else if(ri===3&&!sum.amountEntries[i])cell.textContent='—';}));}
   if(variant===5){[...table.querySelectorAll('tbody tr')].forEach((row,i)=>{const cells=row.querySelectorAll('td');if(future(year,i+1)&&!sum.counts[i])cells.forEach(cell=>cell.textContent='—');else{if(!sum.counts[i])cells[0].textContent='0*';if(!sum.amountEntries[i])cells[3].textContent='—';}});}
  }
  if(state.mode==='normal'||state.mode==='empty'){$('asStatsContent').hidden=false;notice.hidden=state.mode!=='empty';notice.textContent=state.mode==='empty'?'데이터 없음 상태 시안 · 아직 조회된 접수가 없습니다. 새 접수 후 다시 조회하세요.':'';}
 }
 const original=renderAsStatistics;renderAsStatistics=function(){original();renderUx();};
 const originalMonthly=renderMonthlyLines;renderMonthlyLines=function(){originalMonthly();renderUx();};
 $('uxReset').onclick=()=>{showAsStatisticsMonth(nowYear,nowMonth);$('uxReset').focus();};
 $('uxState').onchange=()=>{
  state.mode=$('uxState').value;root.setAttribute('aria-busy',String(state.mode==='loading'));
  if(state.mode==='normal'||state.mode==='empty'){_asStatsRecords=state.mode==='empty'?[]:getAsExampleRecords();renderAsStatistics();}
  else{$('asStatsContent').hidden=true;notice.hidden=false;notice.replaceChildren();const text=document.createElement('span');text.textContent=state.mode==='loading'?'현황을 불러오는 중입니다. 잠시 기다려 주세요.':'현황을 불러오지 못했습니다. 수치가 0건이라는 의미는 아닙니다.';notice.append(text);if(state.mode==='error'){const retry=document.createElement('button');retry.type='button';retry.textContent='다시 조회';retry.onclick=()=>{$('uxState').value='normal';$('uxState').dispatchEvent(new Event('change'));};notice.append(retry);}}
 };
 window.addEventListener('resize',()=>requestAnimationFrame(renderUx));
 renderUx();
})();
