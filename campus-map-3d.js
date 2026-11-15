import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('campus3dCanvas');
  const viewport = $('campusMapViewport');
  const list = $('campusDestinationList');
  if (!canvas || !viewport || !list) return;

  const destinations = [
    {id:'beta',name:'Beta Building',code:'BETA',color:'#287b42',x:247,y:385,description:'Beta Building — use the campus signs to locate your room.'},
    {id:'banzali',name:'Banzali Hall',code:'BH',color:'#c94c50',x:323,y:388,description:'Banzali Hall — use the campus signs to locate your room.'},
    {id:'tanj',name:'Tanjangco Hall',code:'TH',color:'#27864d',x:135,y:199,description:'Tanjangco Hall — use the campus signs to locate your room.'},
    {id:'goseco',name:'Goseco Hall',code:'GH',color:'#d8aa35',x:257,y:180,description:'Goseco Hall — use the campus signs to locate your room.'},
    {id:'puno',name:'Puno Hall',code:'PH',color:'#4d89ae',x:179,y:430,description:'Puno Hall — use the campus signs to locate your room.'},
    {id:'limlingan',name:'Limlingan Hall',code:'LH',color:'#4d8b5a',x:184,y:315,description:'Limlingan Hall — use the campus signs to locate your room.'},
    {id:'narciso',name:'Narciso Hall',code:'NH',color:'#4e83b2',x:84,y:252,description:'Narciso Hall — use the campus signs to locate your room.'},
    {id:'parking1',name:'Parking 1',code:'P1',color:'#8a55a8',x:163,y:58,description:'Parking 1 — follow the campus parking signs.'},
    {id:'parking2',name:'Parking 2',code:'P2',color:'#8a55a8',x:38,y:174,description:'Parking 2 — follow the campus parking signs.'},
    {id:'gate',name:'Main Gate',code:'GATE',color:'#17603e',x:252,y:526,description:'Main Gate — the starting point for campus walking routes.'}
  ];
  const world = (x,z,y=0) => new THREE.Vector3(x-175.5,y,z-285);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe9e2');
  scene.fog = new THREE.Fog('#dfe9e2', 780, 1450);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false}); }
  catch (error) { $('campus3dLoading').textContent='Your browser could not start the 3D map. Please try an updated browser with WebGL enabled.'; console.error(error); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.minPolarAngle = .42;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 360;
  controls.maxDistance = 1050;
  controls.enablePan = true;
  controls.target.set(0,0,0);

  scene.add(new THREE.HemisphereLight(0xffffff,0x718474,2.05));
  const sun = new THREE.DirectionalLight(0xfff5df,2.5);
  sun.position.set(-230,470,280); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-420; sun.shadow.camera.right=420;
  sun.shadow.camera.top=620; sun.shadow.camera.bottom=-620;
  sun.shadow.bias=-0.00025;
  scene.add(sun);

  const groundMat = new THREE.MeshStandardMaterial({color:0xf5f5ef,roughness:1});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900,1120),groundMat);
  ground.rotation.x=-Math.PI/2; ground.position.y=-5; ground.receiveShadow=true; scene.add(ground);

  const loader = new THREE.TextureLoader();
  loader.load('assets/gnc-campus-map-reference.jpg', texture => {
    texture.colorSpace=THREE.SRGBColorSpace;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(351,570),new THREE.MeshStandardMaterial({map:texture,roughness:1}));
    base.rotation.x=-Math.PI/2; base.position.set(0,-.1,0); base.receiveShadow=true; scene.add(base);
  }, undefined, () => {
    $('campus3dLoading').textContent='Map image could not be loaded. Check that assets/gnc-campus-map-reference.jpg exists.';
  });

  // Building footprints follow the supplied site plan. Roofs are deliberately restrained
  // so the campus remains legible rather than looking like a toy/isometric illustration.
  const buildings = [
    {id:'parking1',x:12,z:5,w:302,d:111,h:7,roof:0x51475b,wall:0x302b39},
    {id:'parking2',x:11,z:119,w:57,d:115,h:8,roof:0x51475b,wall:0x302b39},
    {id:'tanj',x:94,z:171,w:84,d:63,h:17,roof:0x6b9674,wall:0x365c43},
    {id:'goseco',x:197,z:160,w:142,d:133,h:19,roof:0xc5a85d,wall:0x80672f},
    {id:'narciso',x:46,z:241,w:84,d:32,h:12,roof:0x718ba1,wall:0x40596d},
    {id:'limlingan',x:124,z:246,w:89,d:230,h:13,roof:0x87a18a,wall:0x526c59},
    {id:'puno',x:164,z:359,w:32,d:116,h:15,roof:0x8ba9b8,wall:0x526f7c},
    {id:'beta',x:204,z:310,w:79,d:151,h:24,roof:0x327b4d,wall:0x17482f},
    {id:'banzali',x:308,z:292,w:32,d:186,h:22,roof:0xb66a69,wall:0x713c3b},
    {id:'gate',x:140,z:480,w:148,d:72,h:9,roof:0xbab3a1,wall:0x777163}
  ];
  const buildingMeshes = new Map();
  const material = (color,roughness=.82) => new THREE.MeshStandardMaterial({color,roughness});
  buildings.forEach(b=>{
    const group=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d),material(b.wall));
    body.position.set(b.x+b.w/2-175.5,b.h/2,b.z+b.d/2-285);
    body.castShadow=true;body.receiveShadow=true;group.add(body);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(b.w-3,3,b.d-3),material(b.roof,.72));
    roof.position.set(body.position.x,b.h+1.5,body.position.z);
    roof.castShadow=true;roof.receiveShadow=true;group.add(roof);
    const rim=new THREE.Mesh(new THREE.BoxGeometry(b.w-1,1.2,b.d-1),material(0xe6dfc9));
    rim.position.set(body.position.x,b.h+3.1,body.position.z);group.add(rim);
    scene.add(group);buildingMeshes.set(b.id,group);
  });

  // Fine architectural details: restrained roof seams and parking bay lines.
  function line(points,color,width=1){
    const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>world(p[0],p[1],p[2]||.2)));
    const obj=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.65,linewidth:width}));
    scene.add(obj);return obj;
  }
  for(let x=24;x<302;x+=15){ line([[x,17,11.1],[x,102,11.1]],0xd8c8df); }
  for(let z=130;z<228;z+=18){ line([[18,z,11.1],[60,z,11.1]],0xd8c8df); }

  function makeLabel(text,color){
    const c=document.createElement('canvas'),ctx=c.getContext('2d');
    c.width=512;c.height=128;
    ctx.fillStyle=color;roundRect(ctx,10,12,492,104,28);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=7;roundRect(ctx,13,15,486,98,24);ctx.stroke();
    ctx.font='700 43px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(text,256,65);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    sprite.scale.set(Math.max(58,text.length*5.2),14,1);sprite.renderOrder=10;return sprite;
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  const interactive=[];
  destinations.forEach(d=>{
    const marker=new THREE.Group();
    const pin=new THREE.Mesh(new THREE.CylinderGeometry(2.3,2.3,7,16),new THREE.MeshStandardMaterial({color:d.color,metalness:.12,roughness:.45}));
    pin.position.y=7;pin.castShadow=true;marker.add(pin);
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(6.5,6.5,1.4,32),new THREE.MeshStandardMaterial({color:d.color,emissive:d.color,emissiveIntensity:.16,roughness:.4}));
    disc.position.y=3.6;marker.add(disc);
    const label=makeLabel(d.name,d.color);label.position.set(0,23,0);marker.add(label);
    marker.position.copy(world(d.x,d.y,0));marker.userData.destination=d;
    scene.add(marker);interactive.push(marker);
  });

  const routeGroup=new THREE.Group();scene.add(routeGroup);
  let routeDash=null, routePulse=null, selected=null, cameraTween=null;
  const paths={
    beta:[[252,526],[252,505],[235,488],[224,464],[222,438],[222,412],[222,385],[247,385]],
    banzali:[[252,526],[252,505],[275,490],[288,468],[298,440],[310,415],[323,388]],
    tanj:[[252,526],[244,500],[230,475],[214,450],[204,425],[194,395],[178,365],[164,335],[148,300],[135,265],[135,199]],
    goseco:[[252,526],[252,500],[262,470],[265,440],[263,410],[260,380],[257,350],[257,320],[257,280],[257,240],[257,180]],
    puno:[[252,526],[244,510],[230,492],[214,475],[198,455],[179,430]],
    limlingan:[[252,526],[245,505],[230,485],[218,460],[207,435],[198,408],[190,380],[184,350],[184,315]],
    narciso:[[252,526],[240,500],[222,475],[205,450],[185,425],[160,395],[140,365],[120,335],[100,300],[84,252]],
    parking1:[[252,526],[250,495],[240,460],[228,420],[216,380],[205,340],[195,300],[185,260],[175,220],[163,180],[163,58]],
    parking2:[[252,526],[235,500],[210,470],[180,440],[150,410],[120,380],[95,345],[75,305],[55,260],[38,174]]
  };
  function clearRoute(){while(routeGroup.children.length){const o=routeGroup.children.pop();o.geometry?.dispose();if(o.material?.map)o.material.map.dispose();o.material?.dispose();}routeDash=null;routePulse=null;}
  function drawRoute(dest){
    clearRoute();if(!dest||dest.id==='gate')return;
    const coords=paths[dest.id]||[[252,526],[dest.x,dest.y]];
    const points=coords.map(([x,z])=>world(x,z,2.2));
    const curve=new THREE.CatmullRomCurve3(points,false,'centripetal',.18);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(80,coords.length*16),3.4,8,false),new THREE.MeshStandardMaterial({color:0xe34f48,roughness:.38,metalness:.04,emissive:0x651b18,emissiveIntensity:.12}));
    tube.castShadow=true;routeGroup.add(tube);
    const lineGeo=new THREE.BufferGeometry().setFromPoints(curve.getPoints(260));
    routeDash=new THREE.Line(lineGeo,new THREE.LineDashedMaterial({color:0xffffff,dashSize:5,gapSize:3,transparent:true,opacity:.98}));
    routeDash.computeLineDistances();routeGroup.add(routeDash);
    const pulse=new THREE.Mesh(new THREE.SphereGeometry(4.2,18,14),new THREE.MeshBasicMaterial({color:0xffe17a}));
    pulse.position.copy(points[0]);routeGroup.add(pulse);routePulse={curve,mesh:pulse,start:performance.now()};
  }
  function focus(dest){
    const target=world(dest.x,dest.y,0);
    const offset=new THREE.Vector3(0,235,290);
    const desired=target.clone().add(offset);
    cameraTween={from:camera.position.clone(),to:desired,targetFrom:controls.target.clone(),targetTo:target,start:performance.now(),duration:1050};
    controls.enabled=false;
  }
  function select(id){
    selected=destinations.find(d=>d.id===id)||null;
    list.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.destination===id)));
    $('campusSelectedName').textContent=selected?selected.name:'Start at the Main Gate';
    $('campusRouteDescription').textContent=selected?(selected.id==='gate'?selected.description:selected.description+' Follow the animated route from the Main Gate.'):'Select a building from the directory or tap its label in the 3D map.';
    $('campusMapHint').textContent=selected?`Selected: ${selected.name} · route from Main Gate`:'Drag to orbit · scroll to zoom · select a building to navigate';
    $('campusClearSelection').hidden=!selected;
    drawRoute(selected);
    if(selected)focus(selected);
    else resetCamera();
  }
  destinations.forEach(d=>{
    const b=document.createElement('button');b.type='button';b.className='campus-destination-button';b.dataset.destination=d.id;b.setAttribute('aria-pressed','false');
    b.innerHTML=`<i class="campus-destination-dot" style="--destination-color:${d.color}"></i><span>${d.name}</span><small class="campus-destination-code">${d.code}</small>`;
    b.addEventListener('click',()=>select(d.id));list.appendChild(b);
  });

  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  canvas.addEventListener('click',event=>{
    const rect=canvas.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(interactive,true);
    if(hits.length){let obj=hits[0].object;while(obj&&!obj.userData.destination)obj=obj.parent;if(obj?.userData.destination)select(obj.userData.destination.id);}
  });

  function resetCamera(){
    const to=new THREE.Vector3(0,470,650),target=new THREE.Vector3(0,0,0);
    cameraTween={from:camera.position.clone(),to,targetFrom:controls.target.clone(),targetTo:target,start:performance.now(),duration:850};controls.enabled=false;
  }
  $('campusZoomIn').addEventListener('click',()=>{camera.position.lerp(controls.target,.12);});
  $('campusZoomOut').addEventListener('click',()=>{camera.position.lerp(controls.target,-.14);});
  $('campusMapReset').addEventListener('click',()=>{select(null);});
  $('campusMapHome').addEventListener('click',()=>select('gate'));
  $('campusClearSelection').addEventListener('click',()=>select(null));

  function resize(){
    const w=viewport.clientWidth,h=viewport.clientHeight;
    if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewport);resize();resetCamera();

  function animate(now){
    requestAnimationFrame(animate);
    if(cameraTween){
      const t=Math.min(1,(now-cameraTween.start)/cameraTween.duration),e=1-Math.pow(1-t,3);
      camera.position.lerpVectors(cameraTween.from,cameraTween.to,e);
      controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,e);
      camera.lookAt(controls.target);
      if(t>=1){cameraTween=null;controls.enabled=true;}
    } else controls.update();
    if(routeDash)routeDash.material.dashOffset=-(now*.018)%1000;
    if(routePulse){const t=((now-routePulse.start)%3600)/3600;routePulse.mesh.position.copy(routePulse.curve.getPointAt(t));}
    renderer.render(scene,camera);
  }
  requestAnimationFrame(animate);
  $('campus3dLoading').classList.add('is-hidden');
})();
