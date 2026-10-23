const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const root=path.resolve(__dirname,'../..');
const names=['기존 배치 정돈','추이 집중형','업무 비교형 · 추천','월별 가로 비교표','확인 사항·원장형'];
const descriptions=['기존 배치와 도넛을 유지한 최소 변경안. 0건 유형을 접고 대기 건수 관계를 분명히 합니다.','월별 추이를 넓게 배치하고 유형은 가로 막대로 비교합니다. 연간 흐름을 파악하기 좋습니다.','월별 접수와 유형별 가로 막대를 나란히 비교합니다. 일상적인 업무 현황 파악에 추천합니다.','12개월 수치를 가로로 비교하고 아래에서 그래프를 확인합니다. 월별 대조 업무에 적합합니다.','금액 미입력·기타 분류를 확인하고 월별 접수·완료·미완료·금액 원장을 함께 봅니다.'];
let baseline=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
if(baseline.includes('as-overview-live-layout-script'))throw Error('Preview code must be extracted from live dashboard first');
const sampleContext={asJobToday:()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),Math:Object.create(Math)};let seed=2648;sampleContext.Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};vm.createContext(sampleContext);
vm.runInContext(baseline.slice(baseline.indexOf('function createAsListExample()'),baseline.indexOf('function asListExampleReadOnly()')),sampleContext);const sample=sampleContext.createAsListExample();
const css=['layout.css','readability.css','dashboard-ux.css'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8')).join('\n');
const readability=fs.readFileSync(path.join(__dirname,'readability.js'),'utf8');
const dashboardUx=fs.readFileSync(path.join(__dirname,'dashboard-ux.js'),'utf8');
const rawLayout=fs.readFileSync(path.join(__dirname,'layout.js'),'utf8');
const embed=code=>code.replace(/<\/script/gi,'<\\/script');
for(let n=1;n<=5;n++){
 let html=baseline;
 const start=html.indexOf('(function initAuth() {'),end=html.indexOf('let expandedBarcodes',start);if(start<0||end<0)throw Error('Auth boundary missing');
 html=html.slice(0,start)+"currentUser={id:'preview',name:'화면 시안',role:'sysadmin'};\n"+html.slice(end);
 for(const file of ['as-amount.js','as-workflow-ui.js']){const re=new RegExp('<script src="/'+file.replaceAll('.','\\.')+'[^\"]*"><\\/script>');if(!re.test(html))throw Error('Dependency missing '+file);html=html.replace(re,()=>'<script>'+embed(fs.readFileSync(path.join(root,file),'utf8'))+'</script>')}
 html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>'+n+'. '+names[n-1]+' · 실제 AS 현황 기반</title>').replace('</head>','<style>'+css+'</style></head>');
 let layout=rawLayout.replace("const requested=new URLSearchParams(location.search).get('as-layout');","const requested='"+n+"';").replace(/  const url=new URL\(location.href\);[^\n]+\n/,'');
 const setup=`
_asExampleRecords=${JSON.stringify(sample)};_asListExample=true;
loadStats=async()=>{};loadMapView=async()=>{};connectSSE=()=>{};loadProductList=async()=>{};
window.fetch=async function(url,options={}){if(options.method&&options.method!=='GET')return new Response(JSON.stringify({error:'별도 HTML 시안에서는 저장하지 않습니다.'}),{status:403});return new Response(JSON.stringify({list:getAsExampleRecords(),records:[]}));};
const standaloneLoadStatistics=loadAsStatistics;loadAsStatistics=()=>standaloneLoadStatistics(true);
${readability}
${layout}
const AS_PREVIEW_DATE=${JSON.stringify(sampleContext.asJobToday())};
${dashboardUx}
document.getElementById('asOverviewLayoutPicker')?.remove();
const standaloneBanner=document.createElement('div');standaloneBanner.className='standalone-review-banner';standaloneBanner.innerHTML='<div><strong>${n}. ${names[n-1]}</strong> <span>· 실제 화면 기반 HTML 시안</span></div><a href="index.html" target="_top">5개 시안 비교</a>';document.getElementById('asSubStats').prepend(standaloneBanner);
document.querySelector('.logout-btn').onclick=()=>{location.href='index.html'};
`;
 const last=html.lastIndexOf('</body>');html=html.slice(0,last)+'<script>'+embed(setup)+'</script>'+html.slice(last);
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 fs.writeFileSync(path.join(__dirname,'concept-'+n+'.html'),html);
}
const index=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>실제 AS 현황 · 그래프 가독성 개선 5안</title><style>@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');*{box-sizing:border-box}body{margin:0;height:100dvh;display:flex;flex-direction:column;font:500 15px/1.5 'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;color:#202a36;background:#fff}header{padding:16px 22px;border-bottom:1px solid #b8c4d0}h1{font-size:22px;margin:0 0 4px}p{margin:0;color:#526171}nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}button,a{font:inherit;color:inherit}button{cursor:pointer;border:1px solid #9caaba;padding:9px 12px;background:#fff;text-align:left;border-radius:3px;min-height:40px}button[aria-pressed=true]{background:#e4edf6;border-color:#375f80;font-weight:600}button:focus-visible,a:focus-visible{outline:2px solid #375f80;outline-offset:2px}.description{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 22px;border-bottom:1px solid #b8c4d0}.description a{white-space:nowrap;text-underline-offset:4px}iframe{flex:1;width:100%;min-height:0;border:0}details{margin-top:10px}summary{cursor:pointer}.changes{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:8px 0 0;padding-left:18px}@media(max-width:700px){header{padding:12px}nav{display:flex;overflow:auto}nav button{min-width:165px}.description{padding:8px 12px}.changes{grid-template-columns:1fr}}</style></head><body><header><h1>실제 AS 현황 · 그래프 가독성 개선</h1><p>현재 메뉴·도넛·접수목록을 유지한 별도 HTML 5개 · 같은 예시 70건 사용</p><nav aria-label="시안 선택">${names.map((name,i)=>'<button type="button" data-n="'+(i+1)+'" aria-pressed="'+(i===0)+'">'+(i+1)+'. '+name+'</button>').join('')}</nav><details><summary>공통 개선 사항</summary><ul class="changes"><li>막대·선 중복을 줄이고 건수 축 눈금을 표시</li><li>0건·0% 그래프 표시는 줄이고 표에는 그대로 유지</li><li>금액 그래프는 만 원 단위, 합계·상세는 정확한 원 단위</li><li>본문 15px 통일, 선택 월과 행·열 경계 강조</li></ul></details></header><div class="description"><p id="description">${descriptions[0]}</p><a id="open" href="concept-1.html" target="_blank" rel="noopener">독립 HTML 열기 ↗</a></div><iframe id="preview" src="concept-1.html" title="실제 AS 현황 시안 1"></iframe><script>const descriptions=${JSON.stringify(descriptions)};for(const button of document.querySelectorAll('nav button'))button.onclick=()=>{const n=Number(button.dataset.n);for(const b of document.querySelectorAll('nav button'))b.setAttribute('aria-pressed',String(b===button));document.getElementById('preview').src='concept-'+n+'.html';document.getElementById('preview').title='실제 AS 현황 시안 '+n;document.getElementById('description').textContent=descriptions[n-1];document.getElementById('open').href='concept-'+n+'.html'};</script></body></html>`;
const finalIndex=index.replace(/<details>[\s\S]*?<\/details>/,'<details><summary>개선 근거 · 데이터 확인 사항</summary><p>단일 막대로 월별 건수를 비교하고, 2~5안은 유형별 가로 막대를 사용합니다. 전체 대기와 단계 합계, 접수일 기준, 현재까지의 집계와 미도래를 구분합니다.</p><p><a href="review.html" target="_blank" rel="noopener">현재 UI 문제 · 데이터 확인 사항 · 5안의 선택 기준 자세히 보기 ↗</a></p></details>');
fs.writeFileSync(path.join(__dirname,'index.html'),finalIndex);console.log('Built 5 standalone HTML files with embedded app scripts and identical 70 samples');
