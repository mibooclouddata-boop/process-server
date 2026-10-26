const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {applyWorkflow,normalize,dateValid}=require('./as-workflow');
const actor={id:'test',name:'테스트 담당',department:'품질'},day='2026-10-20',now='2026-10-20T00:00:00Z';
const base=()=>({id:'test',status:'접수',deliveryAgreedDate:'2026-10-25',createdBy:actor.name,createdById:actor.id,files:[]});
const run=(item,input)=>applyWorkflow(item,{revision:item.workflow?.revision||0,...input},actor,day,now);
const start=item=>run(item,{action:'advance',next:'제작 요청',owner:'제작 담당',dueDate:'2026-10-21'});

test('AS Excel export sizes Korean columns and wrapped rows without losing cell content',async()=>{
 const source=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 const fn=source.slice(source.indexOf('function exportAsExcel()'),source.indexOf('let asRemoveFiles'));
 async function exportRows(rows){
  let blob,download;
  const c={_asFiltered:rows,AsAmount:require('./as-amount'),Blob,alert(){throw Error('unexpected empty export');},
   URL:{createObjectURL(value){blob=value;return 'blob:test';},revokeObjectURL(){}},
   document:{createElement(){return {click(){download=this.download;}};},body:{appendChild(){},removeChild(){}}}};
  vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function normalizeAsReason('),source.indexOf('function asStatsDateKey(')),c);vm.runInContext(fn,c);c.exportAsExcel();
  assert.match(download,/\.xls$/);return blob.text();
 }
 const short=await exportRows([{product:'ABC',reason:'점검',amount:0}]);
 const renamed=await exportRows([{reason:'품질 불량'},{reason:'수량 누락'}]);
 assert(renamed.includes('제작 오작'));assert(renamed.includes('부재 누락'));assert(!renamed.includes('품질 불량'));assert(!renamed.includes('수량 누락'));
 const long=await exportRows([{product:'한글제품명이길어지는경우',reason:'파손 부위 확인 및 교체 작업 요청 '.repeat(10)+'\n다음 줄',remark:'A&B <확인>',amount:1234567}]);
 const widths=html=>[...html.matchAll(/<col width="(\d+)"/g)].map(m=>Number(m[1]));
 assert.equal(widths(long).length,13);
 assert(widths(long)[6]>widths(short)[6],'product width grows with its actual content');
 assert(widths(long)[7]<=420,'long prose wraps instead of creating an unbounded column');
 const heights=html=>[...html.matchAll(/<tr height="(\d+)"/g)].map(m=>Number(m[1]));
 assert(heights(long)[1]>heights(short)[1],'wrapped Korean text receives a taller row');
 assert.match(long,/다음 줄/);assert.match(long,/<br style="mso-data-placement:same-cell">/);
 assert.match(long,/A&amp;B &lt;확인&gt;/);assert.match(long,/>1234567<\/td>/);assert.match(short,/>0<\/td>/);
 const cells=[...long.matchAll(/<(?:td|th)\b([^>]*)>/g)];
 assert.equal(cells.length,26);
 for(const [,attributes] of cells){
  assert.match(attributes,/align="center"/);assert.match(attributes,/valign="middle"/);
  assert.match(attributes,/text-align:center;vertical-align:middle/);
 }
});
test('full route preserves deadline, completion dates and audit history',()=>{
 let a=start(base());assert.equal(a.status,'제작 요청');
 a=run(a,{action:'save',deliveryAgreedDate:'2026-10-26'});assert.equal(a.deliveryAgreedDate,'2026-10-26');assert.equal(a.workflow.history.filter(h=>h.type==='deadline').length,1);
 a=run(a,{action:'advance',next:'도장 요청',owner:'도장 담당',dueDate:'2026-10-23',completedDate:day});assert.equal(a.workflow.stages['제작 요청'].completedDate,day);
 a=run(a,{action:'advance',next:'납품 요청',owner:'납품 담당',dueDate:'2026-10-24',completedDate:day});
 a=run(a,{action:'advance',next:'완료',completedDate:day});assert.equal(a.deliveredDate,day);
 assert.equal(a.status,'완료');assert.equal(a.completedBy,actor.name);assert.equal(a.workflow.revision,5);assert.throws(()=>run(a,{action:'save'}));
});
test('sequential stages and delivery deadline are required',()=>{
 assert.throws(()=>run(base(),{action:'advance',next:'도장 요청',skipReason:'도장 보수만 필요'}));
 assert.throws(()=>start({...base(),deliveryAgreedDate:''}));
 const a=start(base());
 assert.throws(()=>run(base(),{action:'advance',next:'납품 요청',owner:'담당',dueDate:day}));
 assert.throws(()=>run(base(),{action:'advance',next:'완료',completionNote:'완료'}));
 assert.throws(()=>run(a,{action:'advance',next:'완료',completedDate:day,completionNote:'완료'}));
});
test('bad dates, reverse moves and concurrent edits rejected without mutation',()=>{
 assert.equal(dateValid('2026-02-30'),false);assert.equal(dateValid('2024-02-29'),true);
 assert.throws(()=>run(base(),{action:'advance',next:'제작 요청',deliveryAgreedDate:'2026-02-30'}));
 const a=start(base()),snapshot=JSON.stringify(a);
 for(const input of [{action:'save',revision:0,owner:'a',dueDate:day},{action:'advance',next:'제작 요청'},{action:'advance',next:'도장 요청',owner:'a',dueDate:day,completedDate:'2026-10-21'}])assert.throws(()=>run(a,input));
 assert.equal(JSON.stringify(a),snapshot);
});
test('actual dates can precede entry dates but cannot reverse stage order or be future dates',()=>{
 let item=start(base());
 item=run(item,{action:'advance',next:'도장 요청',completedDate:'2026-10-18'});
 assert.equal(item.workflow.stages['제작 요청'].completedDate,'2026-10-18');
 assert.throws(()=>run(item,{action:'advance',next:'납품 요청',completedDate:'2026-10-17'}));
 item=run(item,{action:'advance',next:'납품 요청',completedDate:'2026-10-19'});
 assert.throws(()=>run(item,{action:'advance',next:'완료',completedDate:'2026-10-18'}));
 assert.throws(()=>run(item,{action:'advance',next:'완료',completedDate:'2026-10-21'}));
 item=run(item,{action:'advance',next:'완료',completedDate:day});
 assert.equal(item.deliveredDate,day);
});
test('legacy state preserved without fabricating stage completions',()=>{
 const old={...base(),status:'승인 요청',reviewer:'이전 검토자'};
 const normalized=normalize(old);assert.equal(normalized.status,'접수');assert.equal(normalized.legacyStatus,'승인 요청');assert.equal(old.status,'승인 요청');
 const a=start(old);assert.equal(a.reviewer,'이전 검토자');assert.equal(a.workflow.stages['제작 요청'].completedDate,undefined);
});
test('dashboard syntax, document fields and HTML escaping',()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
 const context={document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),context);
 const doc=context.asJobDocument({...start(base()),asNo:'AS-TEST',product:'<script>bad</script>',materialCode:'MAT-01',reason:'수량 누락',reviewer:'검토자',approver:'승인자'});
 assert(doc.includes('결재선'));assert(doc.includes('MAT-01'));assert(doc.includes('info-table'));assert(doc.includes('as-doc-header'));assert(doc.includes('as-doc-approval'));assert(doc.includes('&lt;script&gt;'));assert(!doc.includes('<script>bad'));
 assert.equal((html.match(/<script src="\/as-workflow-ui.js\?v=integrity-1"><\/script>/g)||[]).length,1);
});
// API persistence, validation, authorization and conflicts are exercised by as-integrity.test.cjs.

test('approval slots show the authenticated completer for each stage and preserve old audit names',()=>{
 const c={document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),c);
 let item=start(base());
 const people=[{id:'maker',name:'제작 담당',department:'제작팀',position:'기사'},{id:'painter',name:'도장 담당'},{id:'deliverer',name:'납품 담당'}];
 for(const [i,next] of ['도장 요청','납품 요청','완료'].entries()){
  item=applyWorkflow(item,{revision:item.workflow.revision,action:'advance',next,completedDate:day,completedBy:'위조된 이름'},people[i],day,now);
  const stage=item.workflow.stages[['제작 요청','도장 요청','납품 요청'][i]];
  assert.equal(stage.completedBy,people[i].name);assert.equal(stage.completedUserId,people[i].id);assert.equal(stage.completedAt,now);
 }
 item.createdAt=now;
 const output=c.asJobApprovalLine(item);
 for(const person of [actor,...people])assert(output.includes(person.name));
 assert(!output.includes('위조된 이름'));assert(!output.includes('>검토<'));assert.equal((output.match(/class="as-doc-approval-stamp"/g)||[]).length,4);assert.equal((output.match(/>승인<\/span>/g)||[]).length,4);
 assert.equal((output.match(/scope="col"/g)||[]).length,4);
 delete item.workflow.stages['제작 요청'].completedBy;
 assert(c.asJobApprovalLine(item).includes('제작 담당'));
 const pending=c.asJobApprovalLine({...base(),reviewer:'과거 검토자',approver:'과거 승인자'});
 assert(!pending.includes('과거 검토자'));assert(!pending.includes('과거 승인자'));assert(!pending.includes('제작 담당'));assert(!pending.includes('as-doc-approval-stamp'));
 const received=c.asJobApprovalLine({...base(),createdAt:now});
 assert.equal((received.match(/class="as-doc-approval-stamp"/g)||[]).length,1);assert(received.includes('<time datetime="'+day+'">'+day.replace(/-/g,'.')+'</time>'));
});

test('receipt amounts format, sort and remain editable across workflow states',()=>{
 const AsAmount=require('./as-amount');
 assert.equal(AsAmount.format(0),'0');assert.equal(AsAmount.format(null),'');assert.equal(AsAmount.format(1234567),'1,234,567');
 const ui={AsAmount};vm.createContext(ui);const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');vm.runInContext(html.slice(html.indexOf('function _sortAsListBy('),html.indexOf('function sortAsTable(')),ui);
 const rows=[{amount:1000},{amount:null},{amount:0},{amount:20}];
 assert.deepEqual(Array.from(ui._sortAsListBy(rows,'amount','asc'),r=>r.amount),[0,20,1000,null]);
 assert.deepEqual(Array.from(ui._sortAsListBy(rows,'amount','desc'),r=>r.amount),[1000,20,0,null]);
 let selected,opened;Object.assign(ui,{_getSelectedAsItems:()=>[selected],openAsModal:item=>opened=item,showAlert:()=>assert.fail('edit unexpectedly blocked')});
 vm.runInContext(html.slice(html.indexOf('function bulkEditAs()'),html.indexOf('async function bulkDeleteAs()')),ui);
 for(const status of ['접수','제작 요청','도장 요청','납품 요청','완료']){selected={status,legacyStatus:'승인 요청'};ui.bulkEditAs();assert.equal(opened,selected);}
});

test('shared calendar respects stage bounds, clearing and month boundaries',()=>{
 const c={Event,document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),c);
 const input={value:'2026-10-20',min:'2026-10-19',max:'2026-10-21',events:[],dispatchEvent(e){this.events.push(e.type)}};let closes=0;c.input=input;c.dialog={innerHTML:'',close(){closes++}};
 vm.runInContext('appDateState.input=input;appDateState.dialog=dialog;appDateState.view=new Date(2026,9,1)',c);
 c.pickAppDate('2026-10-22');c.pickAppDate('2026-10-18');assert.equal(input.value,'2026-10-20');assert.equal(closes,0);
 c.pickAppDate('2026-10-21');assert.equal(input.value,'2026-10-21');assert.deepEqual(input.events,['input','change']);assert.equal(closes,1);
 c.pickAppDate('');assert.equal(input.value,'');c.moveAppDatePicker(3);assert(c.dialog.innerHTML.includes('2027년 1월'));assert.equal((c.dialog.innerHTML.match(/aria-pressed=/g)||[]).length,42);
});

test('legacy records without an agreement can enter the new workflow through the dialog',()=>{
 const legacy=normalize({id:'old',status:'승인 요청',createdBy:actor.name,reviewer:'previous'});
 const dialog={open:false,showModal(){this.open=true;},setAttribute(){},addEventListener(){}};
 const context={currentUser:{...actor,role:'sysadmin'},document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}},getElementById:id=>id==='asJobDialog'?dialog:null}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),context);
 context.openAsWorkflow(legacy);
 assert(dialog.innerHTML.includes('id="asJobLegacyDeadline"'));
 assert(!dialog.innerHTML.includes('class="as-job-primary" disabled'));
 const updated=applyWorkflow(legacy,{revision:0,action:'advance',next:'제작 요청',deliveryAgreedDate:'2026-10-25'},actor,day,now);
 assert.equal(updated.status,'제작 요청');assert.equal(updated.reviewer,'previous');assert.equal(updated.deliveryAgreedDate,'2026-10-25');
 assert.throws(()=>applyWorkflow(legacy,{revision:0,action:'advance',next:'제작 요청',deliveryAgreedDate:''},actor,day,now));
});

test('receipt groups its number and dates under the title and escapes text exactly once',()=>{
 const c={document:{addEventListener(){},createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/as-workflow-ui.js','utf8'),c);
 const doc=c.asJobDocument({asNo:'AS-TEST<&>',createdAt:'2026-10-14',deliveryAgreedDate:'2026-10-22',reason:'A & B <확인>',files:[{name:'검사 & 도면.pdf'}]});
 assert(doc.includes('2026.10.14'));assert(doc.includes('2026.10.22'));assert(doc.includes('A &amp; B &lt;확인&gt;'));assert(!doc.includes('&amp;amp;'));assert(doc.includes('검사 &amp; 도면.pdf'));assert(!doc.includes('처리 이력'));assert.equal((doc.match(/납품 협의일/g)||[]).length,1);
 const header=doc.slice(doc.indexOf('<header'),doc.indexOf('</header>'));
 assert(header.includes('A/S 접수서'));assert(header.includes('AS-TEST&lt;&amp;&gt;'));assert(header.includes('2026.10.14'));assert(header.includes('2026.10.22'));
 assert(header.indexOf('접수번호')<header.indexOf('접수일'));assert(header.indexOf('접수일')<header.indexOf('납품 협의일'));assert(header.indexOf('납품 협의일')<header.indexOf('as-doc-approval'));
 assert(!doc.includes('MIBOO'));assert(!doc.includes('as-doc-dates'));assert(!doc.includes('도장 요청'));
 const empty=c.asJobDocument({});assert(empty.includes('<dt>접수번호</dt><dd>—</dd>'));assert(empty.includes('<dt>납품 협의일</dt><dd>미정</dd>'));assert(!empty.includes('as-doc-approval-stamp'));
});

test('intake pagination shows 20 records per page and handles the final partial page',()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 let visible=true;
 const tbody={innerHTML:''},pagination={style:{}},head={getClientRects:()=>visible?[{}]:[],getBoundingClientRect:()=>({bottom:300-c.window.scrollY})};
 const c={AsAmount:require('./as-amount'),window:{innerHeight:1000,scrollY:0},document:{querySelector:()=>head,getElementById:id=>id==='asTableBody'?tbody:pagination},_asRemarkEditing:null,_asFullList:[],_asPage:1,_asPageSize:20,_asFiltered:[],_updateAsSelectedCount(){},_renderAsPagination(){},_initAsColResizers(){},asJobEsc:String,escapeHtml:String,asWorkflowDelayHtml:()=>''};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function normalizeAsReason('),html.indexOf('function asStatsDateKey(')),c);
 vm.runInContext(html.slice(html.indexOf('function _renderAsPage()'),html.indexOf('function _renderAsPagination(')),c);
 visible=true;c._renderAsPage();assert(tbody.innerHTML.includes('조건에 맞는 접수 내역이 없습니다.'));assert(!tbody.innerHTML.includes('data-id='));assert.equal(pagination.style.display,'none');
 c._asFiltered=[{id:'one',asNo:'AS-ONE',status:'접수',reason:'수량 누락',files:[]}];c._renderAsPage();
 assert(tbody.innerHTML.includes('부재 누락'));assert(!tbody.innerHTML.includes('수량 누락'));
 assert.equal((tbody.innerHTML.match(/<tr /g)||[]).length,1);
 assert(!html.includes('asListExampleBtn'));assert(!html.includes('toggleAsListExample'));
 c._asFiltered=Array.from({length:21},(_,i)=>({id:'item-'+i,asNo:'AS-'+i,status:'접수',files:[]}));
 c._renderAsPage();assert.equal((tbody.innerHTML.match(/<tr /g)||[]).length,20);
 c._asPage=2;c._renderAsPage();assert.equal((tbody.innerHTML.match(/<tr /g)||[]).length,1);assert(tbody.innerHTML.includes('AS-20'));
});

test('newer receipt requests ignore stale responses and errors',async()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 const source=html.slice(html.indexOf('let _asListRequest = 0;'),html.indexOf('function _applyAsFilters()'));
 for(const fail of [false,true]){
  let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});let calls=0;
  const elements={},latest=[{id:'latest'}];
  const c={_asRemarkEditing:null,_asFullList:[],_asPage:1,SERVER:'',fetch:()=>++calls===1?pending:Promise.resolve({ok:true,json:async()=>({list:latest})}),_applyAsFilters(){},_updateAsSelectedCount(){},document:{getElementById:id=>elements[id]??= {style:{}}}};
  vm.createContext(c);vm.runInContext(source,c);
  const first=c.loadAsList();await c.loadAsList();
  if(fail)reject(Error('offline'));else resolve({ok:true,json:async()=>({list:[{id:'stale'}]})});
  await first;assert.equal(c._asFullList,latest);assert.notEqual(elements.asLedgerCount.textContent,'조회 오류');
 }
});

test('remark editing preserves unsaved input on validation, HTTP and network errors',async()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 const source=html.slice(html.indexOf('async function saveRemark('),html.indexOf('async function submitAs('));
 for(const scenario of ['success','validation','http','network','saving']){
  const elements={asRemarkError:{},asRemarkSave:{},asRemarkCancel:{},asLedgerMessage:{}};
  let calls=0,refreshes=0;
  const input={value:scenario==='validation'?'x'.repeat(501):'수정 내용',setAttribute(){},removeAttribute(){},focus(){}};
  const c={_asFullList:[{id:'one',version:0}],asRecordVersion:item=>item?.version||0,asWrite:async()=>{calls++;if(scenario==='network'||scenario==='http')throw Error('save failed');return {success:true};},_asRemarkEditing:{id:'one',saving:scenario==='saving'},document:{getElementById:id=>elements[id]},FormData,SERVER:'',fetch:async()=>{calls++;if(scenario==='network')throw Error('offline');return {ok:scenario!=='http',json:async()=>({error:'저장 실패'})};},loadAsList:async()=>refreshes++};
  vm.createContext(c);vm.runInContext(source,c);await c.saveRemark(input,'one');
  assert.equal(calls,['validation','saving'].includes(scenario)?0:1);
  assert.equal(refreshes,scenario==='success'?1:0);
  if(scenario==='success')assert.equal(c._asRemarkEditing,null);
  else{assert.equal(c._asRemarkEditing.id,'one');assert.equal(input.value,scenario==='validation'?'x'.repeat(501):'수정 내용');if(scenario!=='saving')assert(elements.asRemarkError.textContent);}
 }
});

test('bulk deletion reports server failures instead of success, refreshes partial results and honors cancel',async()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 const source=html.slice(html.indexOf('async function bulkDeleteAs()'),html.indexOf('function bulkApproveAs()'));
 for(const scenario of ['success','failure','network','cancel']){
  const alerts=[],requests=[];let refreshes=0;
  const context={asChangeReason:async()=> 'test reason',asRecordVersion:()=>0,asWrite:async url=>{requests.push(url);if(scenario==='network'||scenario==='failure'&&requests.length>1)throw Error('save failed');return {success:true};},asListExampleReadOnly:()=>false,_getSelectedAsItems:()=>[{id:'one'},{id:'two'}],showConfirm:async()=>scenario!=='cancel',SERVER:'',fetch:async url=>{requests.push(url);if(scenario==='network')throw Error('offline');return {ok:scenario!=='failure'||requests.length===1};},showAlert:(message,type)=>alerts.push({message,type}),loadAsList:()=>refreshes++};
  vm.createContext(context);vm.runInContext(source,context);await context.bulkDeleteAs();
  if(scenario==='cancel'){assert.equal(requests.length,0);assert.equal(alerts.length,0);assert.equal(refreshes,0);}
  else{assert.equal(refreshes,1);assert.equal(alerts.length,1);assert.equal(alerts[0].type,scenario==='success'?'success':'error');}
 }
});


test('intake filler rows fill the viewport without becoming selectable records',()=>{
 const html=fs.readFileSync(__dirname+'/dashboard.html','utf8');
 const source=html.slice(html.indexOf('function asLedgerFillRows('),html.indexOf('function asLedgerLayoutColumns('));
 function element(tag){
  const e={tag,children:[],attrs:{},className:'',height:40,
   hasAttribute(name){return Object.hasOwn(this.attrs,name);},
   setAttribute(name,value){this.attrs[name]=value;},
   getBoundingClientRect(){return {height:this.height};},
   appendChild(child){if(child.tag==='fragment'){for(const node of child.children)this.appendChild(node);}else{child.parent=this;this.children.push(child);}},
   remove(){this.parent.children=this.parent.children.filter(child=>child!==this);},
   querySelectorAll(){return this.children.filter(child=>child.className==='as-ledger-filler');}
  };
  e.classList={contains:name=>e.className.split(' ').includes(name)};
  Object.defineProperty(e,'rows',{get(){return this.children;}});
  return e;
 }
 const body=element('tbody'),table={tBodies:[body],tHead:{getBoundingClientRect:()=>({height:44})}},viewport={clientHeight:444};
 const c={document:{createElement:element,createDocumentFragment:()=>element('fragment')}};
 vm.createContext(c);vm.runInContext(source,c);
 const fill=()=>c.asLedgerFillRows(table,viewport,40,17);
 const record=element('tr');record.attrs['data-id']='real';body.appendChild(record);
 fill();assert.equal(body.rows.length,10);assert.equal(body.rows[0],record);
 for(const row of body.rows.slice(1)){
  assert.equal(row.attrs['aria-hidden'],'true');assert(!row.hasAttribute('data-id'));assert(!row.hasAttribute('tabindex'));
  assert.equal(row.children.length,17);assert(row.children.every(cell=>cell.tag==='td'&&!cell.children.length&&!cell.hasAttribute('tabindex')));
 }
 fill();assert.equal(body.rows.length,10,'resize must not accumulate filler rows');
 viewport.clientHeight=244;fill();assert.equal(body.rows.length,5);
 viewport.clientHeight=846;record.height=42;c.asLedgerFillRows(table,viewport,42,17);
 assert.equal(body.rows.length,20,'partial last row still fills the viewport');
 body.children=[];for(let i=0;i<20;i++){const row=element('tr');row.attrs['data-id']=String(i);body.appendChild(row);}
 viewport.clientHeight=444;fill();assert.equal(body.rows.length,20);assert.equal(body.querySelectorAll().length,0);
 body.children=[];const empty=element('tr');empty.className='as-ledger-no-results';empty.height=120;body.appendChild(empty);
 fill();assert.equal(body.rows[0],empty);assert.equal(body.querySelectorAll().length,7);
 body.children=[];body.appendChild(element('tr'));fill();assert.equal(body.rows.length,1,'loading/error rows must not receive fillers');
 assert(html.includes("tbody tr.as-ledger-filler td:nth-child("),'filler cells share frozen column positioning');
 assert(html.includes("row.classList.contains('as-ledger-filler'))){"),'filler rows do not suppress record count updates');
});
