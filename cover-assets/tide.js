(() => {
 'use strict';
 let canvas=document.getElementById('art');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),TAU=Math.PI*2,COUNT=16000;
 let seed=73;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 const particles=new Float32Array(COUNT*4);
 for(let i=0;i<COUNT;i++){particles[i*4]=random()*TAU;particles[i*4+1]=random()*2-1;particles[i*4+2]=random();particles[i*4+3]=random();}
 let w=600,h=600,scale=180,dpr=1,time=2.8,visible=true,frame=0,last=0,frames=0,renderer;
 function webgl(){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
  if(!gl)return null;
  const vertex=`attribute vec4 aParticle;uniform vec2 uSize;uniform float uScale,uDpr,uTime,uCenter;varying vec4 vColor;
  void main(){
   float u=aParticle.x+(uTime-2.8)*.035,v=aParticle.y,r=1.+.34*v,twist=u*.65+uTime*.045;
   vec3 p=vec3(r*cos(u)*1.22,r*sin(u),.38*sin(u*2.+uTime*.16)+v*.4*sin(twist)+aParticle.z*.035);
   p.yz=mat2(cos(.88),sin(.88),-sin(.88),cos(.88))*p.yz;
   p.xz=mat2(cos(.15),-sin(.15),sin(.15),cos(.15))*p.xz;
   p.xy=mat2(cos(-.4),sin(-.4),-sin(-.4),cos(-.4))*p.xy;
   float perspective=4.8/(4.8-p.z),depth=clamp((p.z+1.1)/2.2,0.,1.);
   gl_Position=vec4((uCenter*2.-1.)+p.x*uScale*perspective*2./uSize.x,.1+p.y*uScale*perspective*2./uSize.y,0.,1.);
   float radius=(.31+aParticle.w*.55+depth*.34)*clamp(uScale/180.,.68,1.15);
   gl_PointSize=max(1.,radius*2.*uDpr);
   float light=pow(max(0.,cos(u+v*.8-.8)),10.);
   vColor=vec4(vec3(9.+(1.-depth)*61.+light*35.,72.+(1.-depth)*55.+light*25.,127.+(1.-depth)*46.+light*21.)/255.,.21+depth*.57);
  }`;
  const fragment=`precision mediump float;varying vec4 vColor;void main(){float edge=1.-smoothstep(.30,.50,length(gl_PointCoord-vec2(.5)));gl_FragColor=vec4(vColor.rgb,vColor.a*edge);}`;
  const shaders=[],program=gl.createProgram(),buffer=gl.createBuffer();
  try{
   for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Particle shader compile failed');gl.attachShader(program,shader);}
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Particle shader link failed');gl.useProgram(program);
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,particles,gl.STATIC_DRAW);
   const attr=gl.getAttribLocation(program,'aParticle');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,4,gl.FLOAT,false,16,0);
   const uniforms=Object.fromEntries(['uSize','uScale','uDpr','uTime','uCenter'].map(name=>[name,gl.getUniformLocation(program,name)]));
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(247/255,248/255,246/255,1);
   return {name:'webgl',draw(){gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(uniforms.uSize,w,h);gl.uniform1f(uniforms.uScale,scale);gl.uniform1f(uniforms.uDpr,dpr);gl.uniform1f(uniforms.uTime,time);gl.uniform1f(uniforms.uCenter,w<450?.5:.46);gl.drawArrays(gl.POINTS,0,COUNT);},dispose(){gl.deleteBuffer(buffer);for(const shader of shaders)gl.deleteShader(shader);gl.deleteProgram(program);}};
  }catch{gl.deleteBuffer(buffer);for(const shader of shaders)gl.deleteShader(shader);gl.deleteProgram(program);return null;}
 }
 function fallback(){
  const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return null;
  const count=3600,xs=new Float32Array(count),ys=new Float32Array(count),next=new Int32Array(count),heads=new Int32Array(24);
  const colors=Array.from({length:12},(_,i)=>{const d=(i+.5)/12;return `rgba(${Math.round(9+(1-d)*61)},${Math.round(72+(1-d)*55)},${Math.round(127+(1-d)*46)},${.21+d*.57})`});
  const cx=Math.cos(.88),sx=Math.sin(.88),cy=Math.cos(.15),sy=Math.sin(.15),cz=Math.cos(-.4),sz=Math.sin(-.4);
  return {name:'canvas-fallback',draw(){
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#f7f8f6';ctx.fillRect(0,0,w,h);heads.fill(-1);
   for(let i=0;i<count;i++){
    const k=i*4,u=particles[k]+(time-2.8)*.035,v=particles[k+1],r=1+.34*v;
    const x=r*Math.cos(u)*1.22,y=r*Math.sin(u),z=.38*Math.sin(u*2+time*.16)+v*.4*Math.sin(u*.65+time*.045)+particles[k+2]*.035;
    const y1=y*cx-z*sx,z1=y*sx+z*cx,x2=x*cy+z1*sy,z2=-x*sy+z1*cy,x3=x2*cz-y1*sz,y3=x2*sz+y1*cz,perspective=4.8/(4.8-z2);
    xs[i]=w*(w<450?.5:.46)+x3*scale*perspective;ys[i]=h*.45-y3*scale*perspective;
    const depth=Math.max(0,Math.min(.999,(z2+1.1)/2.2)),bucket=Math.floor(depth*12)*2+(particles[k+3]>.5?1:0);next[i]=heads[bucket];heads[bucket]=i;
   }
   const size=Math.min(1.15,Math.max(.68,scale/180));
   for(let b=0;b<24;b++){ctx.fillStyle=colors[b>>1];ctx.beginPath();const radius=(b%2?.95:.65)*size;for(let i=heads[b];i!==-1;i=next[i]){ctx.moveTo(xs[i]+radius,ys[i]);ctx.arc(xs[i],ys[i],radius,0,TAU);}ctx.fill();}
  },dispose(){}};
 }
 function draw(){if(!renderer)return;renderer.draw();frames++;canvas.dataset.frames=String(frames);canvas.dataset.ready='true';canvas.dataset.renderer=renderer.name;}
 function resize(){const rect=canvas.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,1.6);const width=Math.round(w*dpr),height=Math.round(h*dpr);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}scale=Math.min(w*(w<450?.26:.30),h*.34)*(innerWidth<=700?1:Number(canvas.dataset.zoom)||1);draw();}
 function running(){return !!renderer&&!reduced.matches&&visible&&!document.hidden;}
 function tick(now){frame=0;if(!running())return;if(!last)last=now;time+=Math.min(.05,(now-last)/1000);last=now;draw();frame=requestAnimationFrame(tick);}
 function sync(){cancelAnimationFrame(frame);last=0;canvas.dataset.running=String(running());if(running())frame=requestAnimationFrame(tick);else draw();}
 renderer=webgl()||fallback();
 if(!renderer){document.querySelector('.art-error').hidden=false;return;}
 const resizeObserver=new ResizeObserver(resize),intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:.01});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);resizeObserver.unobserve(canvas);intersection.unobserve(canvas);renderer.dispose();renderer=fallback();if(!renderer){document.querySelector('.art-error').hidden=false;return;}resizeObserver.observe(canvas);intersection.observe(canvas);resize();sync();},{once:true});
 resizeObserver.observe(canvas);intersection.observe(canvas);reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 window.addEventListener('pagehide',event=>{cancelAnimationFrame(frame);last=0;if(event.persisted)return;resizeObserver.disconnect();intersection.disconnect();renderer?.dispose()});
 window.addEventListener('pageshow',event=>{if(event.persisted){resize();sync();}});resize();sync();
})();
