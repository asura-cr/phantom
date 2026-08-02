/* =====================================================================
   PHANTOM — shared WebGL + interaction engine
   exports: THREE helpers, buildPhantom, Drag, HotspotLayer, post,
            initCursor, initLenis, initReveals, runLoader, etc.
===================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
export const MOBILE  = matchMedia('(max-width:760px)').matches;
export const gsap = window.gsap;
export const ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

/* ---------------- renderer / composer ---------------- */
export function makeRenderer(canvas){
  let r;
  try{
    r = new THREE.WebGLRenderer({canvas,antialias:!MOBILE,alpha:true,powerPreference:'high-performance'});
  }catch(e){ return null; }
  r.setSize(innerWidth,innerHeight);
  r.setPixelRatio(Math.min(devicePixelRatio,MOBILE?1.6:2));
  r.setClearColor(0x000000,0);
  r.toneMapping=THREE.ACESFilmicToneMapping;
  r.toneMappingExposure=1.18;
  return r;
}
export function setEnvironment(renderer,scene){
  const pm=new THREE.PMREMGenerator(renderer);
  scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;
}
export function grainPass(amount=0.04){
  return new ShaderPass({
    uniforms:{tDiffuse:{value:null},uTime:{value:0},uGrain:{value:amount},uVig:{value:0.9}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uGrain,uVig;varying vec2 vUv;
      float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
      void main(){vec4 col=texture2D(tDiffuse,vUv);col.rgb+=(rand(vUv*uTime)-0.5)*uGrain;
      vec2 q=vUv-0.5;col.rgb*=mix(0.55,1.0,smoothstep(0.95,uVig*0.35,length(q)));gl_FragColor=col;}`
  });
}
export function makeComposer(renderer,scene,camera,{bloom=true,bloomStrength=0.55,grain=0.04}={}){
  const c=new EffectComposer(renderer);
  c.addPass(new RenderPass(scene,camera));
  if(bloom && !MOBILE) c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),bloomStrength,0.7,0.82));
  const g=grainPass(grain); c.addPass(g);
  c.addPass(new OutputPass());
  c._grain=g;
  return c;
}
export function onResize(renderer,camera,composer){
  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight); composer&&composer.setSize(innerWidth,innerHeight);
  },{passive:true});
}
export function studioLights(scene){
  const key=new THREE.DirectionalLight(0xffffff,3.2); key.position.set(5,6,4); scene.add(key);
  const rim=new THREE.DirectionalLight(0xffffff,4.5); rim.position.set(-6,1.5,-6); scene.add(rim);
  const rim2=new THREE.DirectionalLight(0xffffff,2.2); rim2.position.set(6,-1,-5); scene.add(rim2);
  const fill=new THREE.DirectionalLight(0xbfd0ff,.7); fill.position.set(0,-4,3); scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff,.25));
}

/* ---------------- the Phantom aircraft ---------------- */
export function buildPhantom(opts={}){
  const white=!!opts.white, pusher=!!opts.pusher;
  const g=new THREE.Group();
  const spinners=[];
  const wings=[];                       // refs for config morphing
  const body=white
    ? new THREE.MeshPhysicalMaterial({color:0xf2f5f8,metalness:0,roughness:0.42,clearcoat:0.7,clearcoatRoughness:0.35,envMapIntensity:1.0})
    : new THREE.MeshStandardMaterial({color:0x202020,metalness:.95,roughness:.3,envMapIntensity:1.6});
  const dark=white
    ? new THREE.MeshStandardMaterial({color:0x0c0c0c,metalness:0.2,roughness:0.5})
    : new THREE.MeshStandardMaterial({color:0x080808,metalness:1,roughness:.18,envMapIntensity:1.1});
  const glass=white
    ? new THREE.MeshPhysicalMaterial({color:0x223044,metalness:0,roughness:.1,transmission:.35,clearcoat:1,clearcoatRoughness:.05})
    : new THREE.MeshPhysicalMaterial({color:0x05070a,metalness:0,roughness:.08,transmission:.2,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1.6});
  const solar=white
    ? new THREE.MeshStandardMaterial({color:0xdde3e8,metalness:.1,roughness:.5})
    : new THREE.MeshStandardMaterial({color:0x0b0d10,metalness:.5,roughness:.45,emissive:0x0a0a0a,envMapIntensity:.7});

  const fus=new THREE.Mesh(new THREE.CapsuleGeometry(.32,2.3,10,28),body); fus.rotation.x=Math.PI/2; g.add(fus);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.32,.78,28),dark); nose.rotation.x=-Math.PI/2; nose.position.z=-1.86; g.add(nose);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(.32,.6,28),body); tail.rotation.x=Math.PI/2; tail.position.z=1.73; g.add(tail);
  const can=new THREE.Mesh(new THREE.SphereGeometry(.26,28,20),glass); can.scale.set(1,.42,1.7); can.position.set(0,.2,-.55); g.add(can);

  function wing(span,rootC,tipC,thick,mat){
    const s=new THREE.Shape();
    s.moveTo(0,rootC*.55); s.lineTo(span,tipC*.5); s.lineTo(span,-tipC*.5); s.lineTo(0,-rootC*.45); s.closePath();
    const geo=new THREE.ExtrudeGeometry(s,{depth:thick,bevelEnabled:false,steps:1});
    geo.translate(0,0,-thick/2); geo.rotateX(-Math.PI/2);
    return new THREE.Mesh(geo,mat);
  }
  [1,-1].forEach(side=>{
    const w=wing(2.7,1.2,.45,.05,body); w.position.set(side*.28,0,.05); w.scale.x=side; w.rotation.z=side*0.05; g.add(w); wings.push(w);
    const sk=wing(2.55,1.05,.4,.012,solar); sk.position.set(side*.34,.034,.05); sk.scale.x=side; sk.rotation.z=side*0.05; g.add(sk); wings.push(sk);
  });
  [1,-1].forEach(side=>{ const w=wing(.95,.6,.28,.04,body); w.position.set(side*.22,0,1.5); w.scale.x=side; g.add(w); });

  const finShape=new THREE.Shape(); finShape.moveTo(0,0);finShape.lineTo(.55,0);finShape.lineTo(.12,.7);finShape.lineTo(0,.7);finShape.closePath();
  const finGeo=new THREE.ExtrudeGeometry(finShape,{depth:.04,bevelEnabled:false}); finGeo.translate(-.02,0,-.02);
  const fin=new THREE.Mesh(finGeo,body); fin.rotation.y=Math.PI/2; fin.position.set(0,0,1.25); g.add(fin);

  if(pusher){
    // single black pusher prop at the tail (spins on Z)
    const hub=new THREE.Group(); hub.position.z=2.02;
    const cone=new THREE.Mesh(new THREE.ConeGeometry(.09,.22,16),dark); cone.rotation.x=Math.PI/2; hub.add(cone);
    for(let i=0;i<4;i++){ const bl=new THREE.Mesh(new THREE.BoxGeometry(.045,.72,.02),dark); bl.geometry.translate(0,.36,0); const bg=new THREE.Group(); bg.add(bl); bg.rotation.z=i*(Math.PI/2); hub.add(bg); }
    g.add(hub); spinners.push({obj:hub,axis:'z',spd:30});
  }else{
    // front coaxial prop
    const propHub=new THREE.Group(); propHub.position.z=-2.28;
    const spinner=new THREE.Mesh(new THREE.ConeGeometry(.1,.26,18),dark); spinner.rotation.x=-Math.PI/2; propHub.add(spinner);
    for(let i=0;i<3;i++){ const blade=new THREE.Mesh(new THREE.BoxGeometry(.05,.85,.02),dark); blade.geometry.translate(0,.42,0); const bg=new THREE.Group(); bg.add(blade); bg.rotation.z=i*(Math.PI*2/3); propHub.add(bg); }
    g.add(propHub); spinners.push({obj:propHub,axis:'z',spd:14});

    // ducted lift fans
    [[1.15,0,0],[-1.15,0,0],[.62,0,1.25],[-.62,0,1.25]].forEach(p=>{
      const duct=new THREE.Mesh(new THREE.TorusGeometry(.26,.035,10,28),body); duct.rotation.x=Math.PI/2; duct.position.set(...p); g.add(duct);
      const rotor=new THREE.Group(); rotor.position.set(...p);
      for(let i=0;i<2;i++){ const bl=new THREE.Mesh(new THREE.BoxGeometry(.46,.012,.07),dark); const bg=new THREE.Group(); bg.add(bl); bg.rotation.y=i*Math.PI/2; rotor.add(bg); }
      rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.06,12),dark)); g.add(rotor);
      spinners.push({obj:rotor,axis:'y',spd:22});
    });
  }

  if(!white){
    const wire=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CapsuleGeometry(.322,2.3,4,12),30),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.05}));
    wire.rotation.x=Math.PI/2; g.add(wire);
  }

  g.scale.setScalar(1.15);

  // hotspot anchor points (local space, pre-scale)
  const hotspots=[
    {key:'01',title:'Coaxial Propulsion',text:'Dual counter-rotating motors on a single thrust axis — cancels torque without a tail rotor.',pos:new THREE.Vector3(0,0,-2.3)},
    {key:'02',title:'Solar Wing Skin',text:'High-efficiency solar structure — up to 40% less energy drain across long-range cruise.',pos:new THREE.Vector3(1.7,.1,.1)},
    {key:'03',title:'Persistent Core',text:'One hardened fuselage carries flight control, power, Mercury AI compute and comms.',pos:new THREE.Vector3(0,.3,-.4)},
    {key:'04',title:'Ducted Lift Fan',text:'Low-profile vertical lift pods retract into a low-drag cruise frame. Zero runway.',pos:new THREE.Vector3(1.15,0,1.25)},
  ];
  return {group:g,spinners,wings,hotspots,materials:{body,dark,solar}};
}
export function spinAll(spinners,dt){ for(const s of spinners) s.obj.rotation[s.axis]+=s.spd*dt; }

/* ---------------- drag-to-orbit + parallax (with inertia) ---------------- */
export class Drag{
  constructor({rotateSpeed=0.006,damp=0.09,autoRotate=0,maxPitch=0.6,parallax=0.35}={}){
    this.rotateSpeed=rotateSpeed;this.damp=damp;this.autoRotate=autoRotate;this.maxPitch=maxPitch;this.parallaxAmt=parallax;
    this.tRotY=0;this.tRotX=0;this.rotY=0;this.rotX=0;this.vy=0;this.vx=0;
    this.px=0;this.py=0;this.tpx=0;this.tpy=0;
    this.dragging=false;this.idle=0;this._lx=0;this._ly=0;
    this._bind();
  }
  _ui(t){ return t && t.closest && t.closest('a,button,input,textarea,.hotspot,.cell,.switcher,.nav-cta,.member'); }
  _bind(){
    const ring=()=>document.getElementById('cur-ring');
    addEventListener('pointermove',e=>{
      this.tpx=(e.clientX/innerWidth-0.5);this.tpy=(e.clientY/innerHeight-0.5);
      if(this.dragging){
        const dx=e.clientX-this._lx, dy=e.clientY-this._ly;
        this.tRotY+=dx*this.rotateSpeed; this.tRotX+=dy*this.rotateSpeed;
        this.tRotX=Math.max(-this.maxPitch,Math.min(this.maxPitch,this.tRotX));
        this.vy=dx*this.rotateSpeed; this.vx=dy*this.rotateSpeed;
        this._lx=e.clientX;this._ly=e.clientY; this.idle=0;
      }
    },{passive:true});
    addEventListener('pointerdown',e=>{
      if(this._ui(e.target)) return;
      this.dragging=true;this._lx=e.clientX;this._ly=e.clientY;this.vy=this.vx=0;this.idle=0;
      document.body.classList.add('grabbing'); const r=ring(); r&&r.classList.add('grab');
    });
    const end=()=>{ if(!this.dragging)return; this.dragging=false; document.body.classList.remove('grabbing'); const r=ring(); r&&r.classList.remove('grab'); };
    addEventListener('pointerup',end); addEventListener('pointercancel',end); addEventListener('blur',end);
  }
  update(dt){
    if(!this.dragging){
      this.tRotY+=this.vy; this.tRotX+=this.vx; this.vy*=0.94; this.vx*=0.94;
      this.tRotX=Math.max(-this.maxPitch,Math.min(this.maxPitch,this.tRotX));
      this.idle+=dt;
      if(this.autoRotate && this.idle>1.2) this.tRotY+=this.autoRotate*dt;
    }
    this.rotY+=(this.tRotY-this.rotY)*this.damp;
    this.rotX+=(this.tRotX-this.rotX)*this.damp;
    this.px+=(this.tpx-this.px)*0.05; this.py+=(this.tpy-this.py)*0.05;
  }
  applyTo(obj){ obj.rotation.y=this.rotY; obj.rotation.x=this.rotX; }
  addTo(obj,baseY=0,baseX=0){ obj.rotation.y=baseY+this.rotY; obj.rotation.x=baseX+this.rotX; }
}

/* ---------------- hotspot DOM layer ---------------- */
export class HotspotLayer{
  constructor(container,defs,camera,host,onOpen,scale=1.15){
    this.camera=camera;this.host=host;this.onOpen=onOpen;this.items=[];this.scale=scale;
    this._v=new THREE.Vector3();this._c=new THREE.Vector3();
    defs.forEach((d,i)=>{
      const el=document.createElement('div'); el.className='hotspot';
      el.innerHTML=`<div class="pin"></div><div class="card"><div class="k">Subsystem ${d.key}</div><h4>${d.title}</h4><p>${d.text}</p></div>`;
      el.addEventListener('click',ev=>{ ev.stopPropagation();
        const wasOpen=el.classList.contains('open');
        this.items.forEach(it=>it.el.classList.remove('open'));
        if(!wasOpen){ el.classList.add('open'); onOpen&&onOpen(d,i); }
      });
      container.appendChild(el); this.items.push({def:d,el});
    });
    addEventListener('click',()=>this.items.forEach(it=>it.el.classList.remove('open')));
  }
  update(){
    const cam=this.camera;
    this.host.getWorldPosition(this._c);
    for(const it of this.items){
      this._v.copy(it.def.pos).multiplyScalar(this.scale); // match host scale
      this.host.localToWorld(this._v);
      const wp=this._v.clone();
      this._v.project(cam);
      const inFront=this._v.z<1;
      const x=(this._v.x*0.5+0.5)*innerWidth, y=(-this._v.y*0.5+0.5)*innerHeight;
      // backface fade: farther than model centre along camera view => dim
      const dCam=wp.distanceTo(cam.position), dCen=this._c.distanceTo(cam.position);
      const far=dCam>dCen+0.15;
      if(inFront){ it.el.style.transform=`translate(${x}px,${y}px)`; it.el.style.opacity=far?0.18:1; it.el.style.pointerEvents=far?'none':'auto'; it.el.style.display=''; }
      else it.el.style.display='none';
    }
  }
}

/* ---------------- cursor ---------------- */
export function initCursor(){
  const dot=document.getElementById('cur-dot'),ring=document.getElementById('cur-ring');
  if(!dot||!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
  addEventListener('pointermove',e=>{mx=e.clientX;my=e.clientY;dot.style.transform=`translate(${mx}px,${my}px)`;},{passive:true});
  (function loop(){rx+=(mx-rx)*.16;ry+=(my-ry)*.16;ring.style.transform=`translate(${rx}px,${ry}px)`;requestAnimationFrame(loop);})();
  document.querySelectorAll('a,button,.member,.cell,.hotspot,.switcher button').forEach(el=>{
    el.addEventListener('mouseenter',()=>ring.classList.add('active'));
    el.addEventListener('mouseleave',()=>ring.classList.remove('active'));
  });
}

/* ---------------- lenis smooth scroll ---------------- */
export function initLenis(){
  if(REDUCED || !window.Lenis) return null;
  const lenis=new window.Lenis({lerp:.09,wheelMultiplier:1,smoothWheel:true});
  lenis.on('scroll',ScrollTrigger.update);
  gsap.ticker.add(t=>lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    a.addEventListener('click',e=>{ const id=a.getAttribute('href'); if(id.length<2)return; const el=document.querySelector(id); if(!el)return; e.preventDefault(); lenis.scrollTo(el,{offset:-40,duration:1.3}); });
  });
  return lenis;
}

/* ---------------- DOM reveals ---------------- */
export function initReveals(){
  const nav=document.getElementById('nav');
  ScrollTrigger.create({start:'top -60',onUpdate:s=>nav&&nav.classList.toggle('scrolled',s.scroll()>60)});
  gsap.utils.toArray('[data-rev]').forEach(el=>{
    if(el.closest('#hero,#tech-hero,#ai-hero,#dep-hero')) return; // hero handled by heroIntro
    if(el.hasAttribute('data-split')) return;                     // handled by kinetic split-reveal
    gsap.to(el,{opacity:1,y:0,duration:1,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 86%',once:true}});
  });
  gsap.utils.toArray('[data-wm]').forEach(el=>{
    const sec=el.closest('.section')||el.parentElement;
    const isRight=el.style.textAlign==='right'||(getComputedStyle(el).textAlign==='right');
    const fromX=isRight?2:-2, toX=isRight?-2:2;
    gsap.fromTo(el,{xPercent:fromX},{xPercent:toX,ease:'none',scrollTrigger:{trigger:sec,start:'top bottom',end:'bottom top',scrub:true}});
  });
}
export function heroIntro(sel='#hero'){
  const tl=gsap.timeline({delay:.1});
  if(document.querySelector(`${sel} .hl`)) tl.to(`${sel} .hl`,{yPercent:0,duration:1.1,stagger:.1,ease:'power4.out'});
  tl.to(`${sel} [data-rev]`,{opacity:1,y:0,duration:.9,stagger:.08,ease:'power3.out'},'-=.6');
}

/* ---------------- preloader ---------------- */
export function runLoader(onDone){
  gsap.set('.hl',{yPercent:115}); gsap.set('[data-rev]',{opacity:0,y:30});
  const fill=document.getElementById('loadFill'),num=document.getElementById('loadNum');
  let done=false; const finish=()=>{ if(done)return;done=true;
    const l=document.getElementById('loader'); l&&l.classList.add('done');
    document.body.classList.add('ready');
    onDone&&onDone();
    setTimeout(()=>{ if(window.ScrollTrigger) ScrollTrigger.refresh(); },120);
  };
  const st={v:0};
  gsap.to(st,{v:100,duration:2,ease:'power2.inOut',
    onUpdate:()=>{const v=Math.round(st.v); if(num)num.textContent=String(v).padStart(3,'0'); if(fill)fill.style.width=v+'%';},
    onComplete:finish});
  setTimeout(finish,4500);
}

/* ---------------- marquee helper ---------------- */
export function fillMarquee(id,items){
  const set=[...items,...items];
  const el=document.getElementById(id); if(el) el.innerHTML=[...set,...set].map(t=>`<span class="it"><i></i>${t}</span>`).join('');
}
