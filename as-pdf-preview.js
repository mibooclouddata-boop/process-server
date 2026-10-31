(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AsPdfPreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const limits=Object.freeze({documents:20,documentPages:12,pages:40,pagePixels:8000000,pixels:48000000,bytes:24*1024*1024,documentMs:15000,operationMs:45000});
  const limitMessage='PDF 미리보기 한도를 초과했습니다. 이 PDF 전체가 인쇄에서 제외되었습니다. 원본 파일을 별도로 확인·인쇄해 주세요.';
  const failureMessage='PDF를 표시하지 못했습니다. 이 PDF 전체가 인쇄에서 제외되었습니다. 원본 파일을 별도로 확인·인쇄해 주세요.';
  function createBudget(){return {documents:0,pages:0,pixels:0,bytes:0,deadline:Date.now()+limits.operationMs,controller:new AbortController()};}
  function release(fn){try{Promise.resolve(fn()).catch(()=>{});}catch(_){}}
  async function render(pdfjsLib,url,document,budget=createBudget()){
    let task,renderTask,stopped=false;
    const deadline=Math.min(budget.deadline,Date.now()+limits.documentMs),signal=budget.controller.signal;
    const stop=()=>{if(stopped)return;stopped=true;if(renderTask){release(()=>renderTask.cancel());renderTask=null;}if(task)release(()=>task.destroy());};
    const check=()=>{if(signal.aborted||Date.now()>=deadline)throw Error(limitMessage);};
    async function wait(promise){
      check();
      let timer,onAbort;
      try{return await Promise.race([promise,new Promise((_,reject)=>{
        const fail=()=>{stop();reject(Error(limitMessage));};
        onAbort=fail;signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(fail,Math.max(0,deadline-Date.now()));
      })]);}finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
    }
    try{
      check();
      if(budget.documents>=limits.documents||budget.pages>=limits.pages||budget.pixels>=limits.pixels||budget.bytes>=limits.bytes)throw Error(limitMessage);
      budget.documents++;
      task=pdfjsLib.getDocument({url,isEvalSupported:false,stopAtErrors:true,disableAutoFetch:true});
      const pdf=await wait(task.promise);
      if(!Number.isSafeInteger(pdf.numPages)||pdf.numPages<1||pdf.numPages>limits.documentPages||budget.pages+pdf.numPages>limits.pages)throw Error(limitMessage);
      // Failed documents still consume work already performed in this operation.
      budget.pages+=pdf.numPages;
      const images=[];
      for(let n=1;n<=pdf.numPages;n++){
        let page,canvas;
        try{
          const pagePromise=pdf.getPage(n);
          pagePromise.then(value=>{if(stopped)release(()=>value.cleanup());},()=>{});
          page=await wait(pagePromise);check();
          const viewport=page.getViewport({scale:2}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height),pixels=width*height;
          if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||pixels>limits.pagePixels||budget.pixels+pixels>limits.pixels)throw Error(limitMessage);
          budget.pixels+=pixels;
          canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});
          await wait(renderTask.promise);renderTask=null;check();
          const data=canvas.toDataURL('image/png');check();
          if(!data.startsWith('data:image/png;base64,')||budget.bytes+data.length>limits.bytes)throw Error(limitMessage);
          budget.bytes+=data.length;images.push(data);
        }finally{
          if(renderTask){release(()=>renderTask.cancel());renderTask=null;}
          if(page)release(()=>page.cleanup());
          if(canvas){canvas.width=0;canvas.height=0;}
        }
      }
      return {images,message:''};
    }catch(error){return {images:[],message:error?.message===limitMessage?limitMessage:failureMessage};}
    finally{stop();}
  }
  return {createBudget,render,limits,failureMessage};
});
