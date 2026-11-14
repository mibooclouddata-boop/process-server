'use strict';
(() => {
  // Comparison prototypes only: no business API writes, uploads, or persistent form storage.
  const variants = [
    {name:'기본 3단계',tag:'선택한 1번 · 항목은 유지하고 입력 순서만 정리',steps:['자재 · 위치','접수 내용','금액 · 첨부'],sections:['material','content','finish'],titles:['어떤 자재의 AS인가요?','어떤 문제와 조치가 필요한가요?','금액과 첨부파일을 확인하세요.'],descriptions:['발생 위치를 먼저 입력하고, 대상 자재를 지정하세요.','사유를 선택한 뒤 처리 방법과 일정을 입력하세요.','현장 사진·도면과 금액 관련 자료를 함께 첨부하세요.']},
    {name:'집중형 4단계',tag:'한 번에 적은 항목만, 입력에 집중',steps:['위치','자재','내용','확인'],sections:['location','product','content','finish'],titles:['AS가 발생한 위치를 알려주세요.','어떤 자재인가요?','발생 사유를 알려주세요.','마지막으로 확인해 주세요.'],descriptions:['구분, 호선, 블록을 입력해 주세요.','자재명과 코드를 입력해 주세요. 미정이면 비워둘 수 있어요.','후속조치와 일정·금액은 확인된 경우에 입력하세요.','첨부파일을 추가하고 입력 내용을 확인하세요.']},
    {name:'좌측 단계형',tag:'진행 단계와 접수 대상을 항상 함께 확인',steps:['자재 정보','접수 내용','첨부 · 확인'],sections:['material','content','finish'],titles:['접수할 자재를 입력하세요.','AS 내용을 정리하세요.','첨부파일과 접수 내용을 확인하세요.'],descriptions:['AS가 발생한 위치와 자재를 지정합니다.','필수 사유부터 입력하고, 확인된 정보를 더해 주세요.','입력한 내용을 확인한 후 접수를 마무리합니다.']},
    {name:'넓은 2단계',tag:'클릭은 적게, 넓은 화면에서 빠르게 입력',steps:['접수 정보','첨부 · 확인'],sections:['combined','finish'],titles:['접수 정보를 한눈에 입력하세요.','첨부와 최종 확인만 남았어요.'],descriptions:['자재와 사유를 한 화면에서 입력합니다. 별표는 필수 항목입니다.','현장 자료를 첨부하고 오른쪽에서 접수 내용을 확인하세요.']},
    {name:'우측 패널형',tag:'접수목록을 보면서 옆에서 이어서 입력',steps:['자재 정보','접수 내용','첨부 · 확인'],sections:['material','content','finish'],titles:['어떤 자재를 접수할까요?','필요한 조치를 알려주세요.','첨부하고 접수를 마무리하세요.'],descriptions:['접수목록을 벗어나지 않고 새 AS를 등록합니다.','사유는 필수, 나머지는 확인된 정보만 입력하세요.','최종 내용을 확인할 수 있습니다.']}
  ];
  const pathOption = location.pathname.match(/as-intake-option-([1-5])\.html$/)?.[1];
  const requested = Number(pathOption || new URLSearchParams(location.search).get('option'));
  const option = Number.isInteger(requested) && requested >= 1 && requested <= 5 ? requested : 1;
  const config = variants[option - 1];
  const data = {category:'사내',ship:'',block:'',element:'',product:'',materialCode:'',reason:'',reasonOther:'',action:'',actionOther:'',delivery:'',amount:'',remark:''};
  let step = 0, files = [], complete = false, closed = false;
  const root = document.getElementById('previewApp');
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name==='close'?'<path d="m6 6 12 12M6 18 18 6"/>':'<path d="M21 11.5 12 20a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'}</svg>`;
  function field(key,label,placeholder='',extra={}) {
    const attrs=`id="preview-${key}" name="${key}" data-field="${key}" ${extra.required?'required':''} ${extra.type==='date'?'type="date"':'type="text"'} ${key==='amount'?'inputmode="numeric"':''} maxlength="${key==='remark'?2000:200}"`;
    const mark=extra.required?'<span class="required">*</span>':'';
    const choices=extra.options?.map(item=>`<option value="${esc(item)}" ${data[key]===item?'selected':''}>${esc(item||extra.empty||'선택하세요')}</option>`).join('');
    const input=extra.options?`<select ${attrs}>${choices}</select>`:extra.textarea?`<textarea ${attrs} placeholder="${esc(placeholder)}">${esc(data[key])}</textarea>`:`<input ${attrs} value="${esc(data[key])}" placeholder="${esc(placeholder)}" ${key==='product'?'list="preview-products" autocomplete="off"':''}>`;
    return `<div class="field ${extra.full?'full':''} ${extra.wide?'wide':''} ${extra.all?'all':''}" data-wrapper="${key}"><label for="preview-${key}">${label}${mark}${extra.optional?'<small>선택</small>':''}</label>${key==='amount'?`<div class="amount-control">${input}<span>원</span></div>`:input}${extra.hint?`<small>${extra.hint}</small>`:''}<span class="field-error" id="error-${key}" hidden></span></div>`;
  }
  function category(){return `<fieldset class="category-group"><legend>구분<span class="required">*</span></legend><div class="category-options">${(option===1?['사내','사외']:['사내','사외','기타']).map(value=>`<label><input type="radio" name="category" data-field="category" value="${value}" ${data.category===value?'checked':''}>${value}</label>`).join('')}</div></fieldset>`;}
  const locationInputs = () => `<div class="location-row">${field('ship','호선','예: H-2601',{required:true})}${field('block','블록','예: 101',{required:true})}${field('element',option===1?'엘레멘탈':'엘레멘트','예: E-01',{optional:true})}</div>`;
  const locationFields = () => category()+locationInputs();
  const productFields = () => field('product','자재명','검색 또는 직접 입력',{optional:true,wide:true})+field('materialCode','자재코드','자재코드 입력',{optional:true});
  const contentFields = () => field('reason','사유','',{required:true,options:['','치수 오작','제작 오작','용접 불량','도장 불량','부재 누락','납기 누락','마킹 오류','기타'],empty:'사유를 선택하세요',full:option!==4})+field('reasonOther','기타 사유','발생한 내용을 입력해 주세요',{textarea:true,full:true,all:true})+field('action','후속조치','',{options:['','현장 시수','출장 AS','신품 제작','기타'],empty:'후속조치 선택',full:false})+field('actionOther','기타 후속조치','조치 내용을 입력해 주세요',{textarea:true,full:true,all:true})+field('delivery','납품 협의일','',{type:'date'})+field('amount','금액','금액 입력',{hint:'금액 입력 시 이체 영수증을 첨부하세요.'})+field('remark','비고','출력할 참고 사항을 입력해 주세요',{textarea:true,full:true,wide:true});
  function organizedContent(){
    return field('reason','사유','',{required:true,options:['','치수 오작','제작 오작','용접 불량','도장 불량','부재 누락','납기 누락','마킹 오류','기타'],empty:'사유를 선택하세요',full:true})
      +field('reasonOther','기타 사유','발생한 내용을 입력해 주세요',{textarea:true,full:true})
      +field('action','후속조치','',{optional:true,options:['','현장 시수','출장 AS','신품 제작','기타'],empty:'미정 · 나중에 입력'})
      +field('delivery','납품 협의일','',{type:'date',optional:true,hint:'미정이면 제작 요청 전에 지정하세요.'})
      +field('actionOther','기타 후속조치','조치 내용을 입력해 주세요',{textarea:true,full:true})
      +field('remark','비고','출력할 참고 사항이 있으면 입력하세요.',{textarea:true,full:true,optional:true});
  }
  function summary(){const rows=[['구분 / 호선',[data.category,data.ship].filter(Boolean).join(' / ')],['블록 / 엘레멘트',[data.block,data.element].filter(Boolean).join(' / ')],['자재명',data.product],['자재코드',data.materialCode],['접수 사유',data.reason==='기타'?data.reasonOther:data.reason],['후속조치',data.action==='기타'?data.actionOther:data.action],['납품 협의일',data.delivery],['금액',data.amount?Number(data.amount.replaceAll(',','')).toLocaleString('ko-KR')+' 원':''],['비고',data.remark]];return `<section class="review"><h3>접수 내용 확인</h3><dl class="summary-list">${rows.map(([label,value])=>`<div class="${label==='비고'?'summary-wide':''}"><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`;}
  function upload(){return `<section><label class="upload-box">${icon('attach')}<strong>파일 선택하기</strong><small>현장 사진 · 도면 · 이체 영수증</small><small>PDF, 이미지, Word, Excel · 파일당 최대 20MB</small><input class="file-input" type="file" id="preview-files" aria-label="첨부파일 선택" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.doc,.docx,.xls,.xlsx"></label><ul class="file-list">${files.map((file,i)=>`<li><span>${esc(file.name)}</span><small>${(file.size/1024/1024).toFixed(1)} MB</small><button type="button" data-remove-file="${i}" aria-label="${esc(file.name)} 첨부 취소">삭제</button></li>`).join('')}</ul><p class="compact-note">${files.length?files.length+'개 파일 선택됨':'첨부할 자료가 없으면 그대로 진행할 수 있어요.'}<br>납품 협의일이 미정이면 제작 요청 전에 지정하세요.</p></section>`;}
  function stepControls(side=false){return config.steps.map((title,i)=>`<li class="${i<step?'is-complete':''}"><button type="button" data-step="${i}" ${i===step?'aria-current="step"':''} aria-label="${i+1}단계 ${title}"><span class="${side?'side-number':'step-number'}">${i<step?'&#10003;':i+1}</span><span>${title}${side?`<small>${['위치와 자재 지정','사유와 처리 계획','자료 첨부와 최종 확인'][i]}</small>`:''}</span></button></li>`).join('');}
  async function loadWorkspace(){
    const frame=document.querySelector('.live-workspace');
    // A signed-out dashboard redirects the top window; keep the comparison page available.
    frame.srcdoc='<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0;padding:32px;font:14px sans-serif;background:#f3f5f7;color:#202c3c}header{display:flex;gap:48px;align-items:center;margin-bottom:32px}strong{font-size:30px}main{background:white;border:1px solid #dfe5ec;border-radius:12px;padding:28px}h2{font-size:20px}p{color:#5c6978}</style><header><strong>MIBOO</strong><span>AS 관리</span><span>공정 관리</span><span>배차 관리</span></header><main><h2>AS 접수목록</h2><p>로그인 상태에서는 현재 접수목록이 배경에 표시됩니다.</p></main></html>';
    try{
      const response=await fetch('/api/me',{credentials:'same-origin'});
      if(response.ok){frame.removeAttribute('srcdoc');frame.src='/dashboard.html#as-list';}
    }catch{/* The static background keeps the prototype usable when the server is unavailable. */}
  }
  function render(focus=false){
    document.body.className=`variant-${option}`;
    document.title=`AS 접수 시안 ${option} · ${config.name}`;
    if(!document.getElementById('previewShell')){
      root.innerHTML=`<header class="preview-bar" id="previewShell"><div class="preview-label"><strong>AS 접수 시안</strong><span>클릭해서 비교해 보세요</span></div><nav class="variant-nav" aria-label="AS 접수 시안 선택">${variants.map((variant,i)=>`<a href="/cover-assets/as-intake-option-${i+1}.html" ${i+1===option?'aria-current="page"':''}>${i+1}. ${variant.name}</a>`).join('')}</nav></header><iframe title="현재 MIBOO AS 업무 화면" class="live-workspace" sandbox="allow-scripts allow-same-origin" tabindex="-1" inert></iframe><main class="stage" id="stage"></main><footer class="preview-caption"><strong>${option===1?'추천 · ':''}${config.tag}</strong><span>비교용 시안 · 입력 내용과 파일은 실제로 저장되지 않습니다.</span></footer>`;
      void loadWorkspace();
    }
    const stage=document.getElementById('stage');
    if(closed){stage.innerHTML='<section class="closed-panel"><h2>AS 접수 시안</h2><p>접수 창을 다시 열어 입력 흐름을 확인해 보세요.<br>입력한 내용은 이 페이지 안에서 유지됩니다.</p><button class="button primary" data-reopen>접수 창 다시 열기</button></section>';return;}
    const section=config.sections[step];
    let content='';
    if(section==='material')content=option===1?`<section class="field-section">${category()}</section><section class="field-section"><h3>정보</h3>${locationInputs()}</section><section class="field-section"><h3>대상 자재 <small>선택</small></h3><div class="field-grid">${productFields()}</div></section>`:`<div class="field-grid">${locationFields()}${productFields()}</div>`;
    if(section==='location')content=`<div class="field-grid">${locationFields()}</div>`;
    if(section==='product')content=`<div class="summary-box"><p>${esc(data.category)} · ${esc(data.ship)} · ${esc(data.block)}</p></div><div class="field-grid">${productFields()}</div>`;
    if(section==='content')content=`${option===5?`<div class="context-line"><span>접수 대상</span><strong>${esc(data.ship||'호선 미입력')} / ${esc(data.block||'블록 미입력')}</strong></div>`:''}<div class="field-grid">${option===1?organizedContent():contentFields()}</div>`;
    if(section==='combined')content=`<div class="field-grid">${locationFields()}${productFields()}</div><h3 class="subheading">접수 내용</h3><div class="field-grid">${contentFields()}</div>`;
    if(section==='finish')content=option===1?`<div class="field-grid">${field('amount','금액','미정이면 비워두세요',{optional:true,full:true,hint:'금액을 입력하는 경우 이체 영수증을 아래에 첨부하세요.'})}</div><h3 class="subheading">첨부파일 <small>선택</small></h3>${upload()}`:`<div class="${option===4?'two-panels':''}">${upload()}${summary()}</div>`;
    stage.innerHTML=`<section role="dialog" aria-modal="false" aria-labelledby="dialogTitle" aria-describedby="dialogDescription" class="intake-dialog"><header class="dialog-head"><div><h1 id="dialogTitle">AS 접수</h1><p id="dialogDescription">${config.name} · 필요한 정보를 순서대로 입력하세요.</p></div><button type="button" class="close-button" data-close aria-label="접수 시안 닫기">${icon('close')}</button></header><div class="dialog-middle"><aside class="side-steps"><h2>새 AS 접수</h2><ol>${stepControls(true)}</ol><div class="side-context">현재 접수 대상<strong id="sideShip">${esc(data.ship||'호선 미입력')}</strong><span id="sideBlock">${esc(data.block?'블록 '+data.block:'위치 입력을 기다리고 있어요.')}</span></div></aside><div class="dialog-main"><ol class="step-nav" aria-label="접수 진행 단계">${stepControls()}</ol><form class="form-scroll" id="previewForm" novalidate><div class="section-heading">${!complete?'<button type="button" class="text-button example-button" data-example>예시 채우기</button>':''}<h2 id="stepTitle" tabindex="-1">${complete?'입력 흐름 확인 완료':config.titles[step]}</h2><p>${complete?'이 화면은 실제 접수를 생성하지 않습니다.':config.descriptions[step]}</p></div>${complete?'<div class="success-panel"><div class="success-symbol" aria-hidden="true">&#10003;</div><h2>접수 흐름을 모두 확인했어요.</h2><p>입력한 내용은 서버에 저장되지 않았습니다.<br>위에서 다른 시안도 비교해 보세요.</p><button type="button" class="button" data-restart>처음부터 다시 보기</button></div>':content}<datalist id="preview-products"><option value="보강 브래킷"><option value="엘레멘트 프레임"><option value="서포트 플레이트"></datalist></form></div></div><div id="previewMessage" class="message" role="alert"></div><footer class="dialog-footer"><span class="footer-copy">${complete?'시안 체험 완료':`${step+1} / ${config.steps.length} 단계`}</span><button type="button" class="button" ${step===0||complete?'data-close':'data-previous'}>${step===0||complete?'닫기':'이전'}</button>${complete?'':`<button type="button" class="button primary" data-next>${step===config.steps.length-1?'접수 완료 체험':'다음 <span aria-hidden="true">→</span>'}</button>`}</footer></section>`;
    updateConditional();
    if(focus)document.getElementById('stepTitle').focus({preventScroll:true});
  }
  function updateConditional(){
    for(const [key,visible] of [['reasonOther',data.reason==='기타'],['actionOther',data.action==='기타']]){const el=document.querySelector(`[data-wrapper="${key}"]`);if(el)el.hidden=!visible;}
    if(option===1){
      const hint=document.querySelector('[data-wrapper="delivery"] > small');
      if(hint)hint.textContent=data.action==='현장 시수'?'현장 시수는 납품 협의일을 입력하지 않아도 됩니다.':'미정이면 제작 요청 전에 지정하세요.';
      const note=document.querySelector('.compact-note');
      if(note)note.textContent=files.length?files.length+'개 파일 선택됨':'첨부할 자료가 없으면 그대로 진행할 수 있어요.';
    }
  }
  function validate(){
    const section=config.sections[step];
    const required=[];
    if(['material','location','combined'].includes(section))required.push(['ship','호선을 입력하세요.'],['block','블록을 입력하세요.']);
    if(['content','combined'].includes(section)){required.push(['reason','사유를 선택하세요.']);if(data.reason==='기타')required.push(['reasonOther','기타 사유를 입력하세요.']);if(data.action==='기타')required.push(['actionOther','기타 후속조치를 입력하세요.']);}
    let first;
    for(const [key,message] of required){const input=document.getElementById('preview-'+key),error=document.getElementById('error-'+key);const invalid=!data[key].trim();input.setAttribute('aria-invalid',String(invalid));input.setAttribute('aria-describedby','error-'+key);error.hidden=!invalid;error.textContent=invalid?message:'';if(invalid&&!first)first=input;}
    if((option===1?section==='finish':['content','combined'].includes(section))&&data.amount&&!/^\d{1,12}$/.test(data.amount.replaceAll(',',''))){first ||= document.getElementById('preview-amount');const error=document.getElementById('error-amount');error.hidden=false;error.textContent='금액은 12자리 이내의 숫자로 입력하세요.';document.getElementById('preview-amount').setAttribute('aria-invalid','true');}
    if(first){first.focus();return false;}return true;
  }
  function advance(){if(!validate())return;if(step<config.steps.length-1)step++;else complete=true;render(true);}
  root.addEventListener('input',event=>{const key=event.target.dataset.field;if(!key)return;if(event.target.type==='radio'&&!event.target.checked)return;data[key]=event.target.value;event.target.removeAttribute('aria-invalid');const error=document.getElementById('error-'+key);if(error)error.hidden=true;updateConditional();const ship=document.getElementById('sideShip'),block=document.getElementById('sideBlock');if(ship)ship.textContent=data.ship||'호선 미입력';if(block)block.textContent=data.block?'블록 '+data.block:'위치 입력을 기다리고 있어요.';});
  root.addEventListener('change',event=>{
    if(event.target.id!=='preview-files')return;
    const allowed=/\.(pdf|jpe?g|png|gif|bmp|docx?|xlsx?)$/i;
    const selected=[...event.target.files];
    const rejected=selected.filter(file=>file.size>20*1024*1024||!allowed.test(file.name));
    files.push(...selected.filter(file=>file.size<=20*1024*1024&&allowed.test(file.name)));
    render();if(rejected.length)document.getElementById('previewMessage').textContent='20MB를 초과하거나 지원하지 않는 형식의 파일은 제외했습니다.';
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-close')){closed=true;render();}
    else if(button.hasAttribute('data-reopen')){closed=false;render(true);}
    else if(button.hasAttribute('data-next'))advance();
    else if(button.hasAttribute('data-previous')){step--;render(true);}
    else if(button.hasAttribute('data-step')){const target=Number(button.dataset.step);if(target<=step||(target===step+1&&validate())){step=target;complete=false;render(true);}}
    else if(button.hasAttribute('data-example')){Object.assign(data,{category:'사내',ship:'H-2601',block:'101',element:'E-01',product:'보강 브래킷',materialCode:'MB-2601-01',reason:'치수 오작',action:'신품 제작',delivery:'2026-11-20',amount:'150000',remark:'도면 치수 확인 후 재제작 요청'});render(true);}
    else if(button.hasAttribute('data-remove-file')){files.splice(Number(button.dataset.removeFile),1);render();}
    else if(button.hasAttribute('data-restart')){step=0;complete=false;render(true);}
  });
  root.addEventListener('submit',event=>{event.preventDefault();advance();});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!closed){closed=true;render();return;}
    if(event.key==='Enter'&&event.target.matches('input:not([type=file])')){event.preventDefault();advance();}
  });
  console.assert(variants.length===5&&variants.every(v=>v.steps.length===v.sections.length),'Each prototype must have matching steps and sections.');
  render();
})();
