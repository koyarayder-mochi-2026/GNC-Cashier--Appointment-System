// Three.js is loaded only when the visitor selects 3D. The 2D map stays fully
// interactive even if a CDN, WebGL, or browser GPU feature is unavailable.
let THREE = null;
let OrbitControls = null;

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const viewport = $('campusMapViewport');
  const canvas = $('campus3dCanvas');
  const list = $('campusDestinationList');
  const loading = $('campus3dLoading');
  const stage2d = $('campus2dStage');
  const art2d = $('campus2dArt');
  const markers2d = $('campus2dMarkers');
  const routeHalo2d = $('campus2dRouteHalo');
  const route2d = $('campus2dRoute');
  const routeDash2d = $('campus2dRouteDash');
  if (!viewport || !canvas || !list || !loading || !stage2d || !art2d || !markers2d) return;

  const MAP_W = 351, MAP_H = 570;
  const GATE = [252, 548];
  const destinations = [
    {id:'beta',name:'Beta Building',code:'BETA',color:'#287b42',focus:[247,345],entry:[210,365],footprint:[214,300,291,476],description:'Beta Building — follow the east-side campus walkway to the building entrance.'},
    {id:'banzali',name:'Banzali Hall',code:'BH',color:'#c94c50',focus:[322,385],entry:[305,398],footprint:[306,289,346,478],description:'Banzali Hall — follow the outer east walkway alongside the hall.'},
    {id:'tanj',name:'Tanjangco Hall',code:'TH',color:'#27864d',focus:[135,199],entry:[180,225],footprint:[90,167,181,234],description:'Tanjangco Hall — follow the west-side passage, then turn east toward the hall.'},
    {id:'goseco',name:'Goseco Hall',code:'GH',color:'#d8aa35',focus:[258,180],entry:[218,300],footprint:[218,155,348,296],description:'Goseco Hall — follow the east-side passage and turn toward the southeast entrance.'},
    {id:'puno',name:'Puno Hall',code:'PH',color:'#4d89ae',focus:[179,430],entry:[199,445],footprint:[160,376,198,478],description:'Puno Hall — approach from the lower east-side walkway.'},
    {id:'limlingan',name:'Limlingan Hall',code:'LH',color:'#4d8b5a',focus:[184,315],entry:[220,315],footprint:[162,244,216,375],description:'Limlingan Hall — follow the central passage and approach from the north end.'},
    {id:'narciso',name:'Narciso Hall',code:'NH',color:'#4e83b2',focus:[84,252],entry:[105,280],footprint:[43,239,132,278],description:'Narciso Hall — follow the central passage, then turn west toward the hall.'},
    {id:'parking1',name:'Parking 1',code:'P1',color:'#8a55a8',focus:[163,58],entry:[165,120],footprint:[8,0,318,118],description:'Parking 1 — follow the west-side passage north, then turn east into the upper parking area.'},
    {id:'parking2',name:'Parking 2',code:'P2',color:'#8a55a8',focus:[38,174],entry:[70,235],footprint:[8,117,67,237],description:'Parking 2 — follow the west-side passage north to the lower parking entrance.'},
    {id:'gate',name:'Main Gate',code:'GATE',color:'#17603e',focus:[251,525],entry:GATE,footprint:[210,477,290,560],description:'Main Gate — starting point for all illustrated walking routes.'}
  ];

  // Orthogonal waypoints: each leg is intentionally horizontal or vertical.
  // These reproduce the clean corridor-following paths in the supplied route examples.
  const routes = {
    beta:      [[252,548],[205,548],[205,480],[205,380],[210,380],[210,365]],
    banzali:   [[252,548],[205,548],[205,480],[250,480],[300,480],[300,430],[305,430],[305,398]],
    tanj:      [[252,548],[205,548],[205,480],[205,380],[220,380],[220,245],[180,245],[180,225]],
    goseco:    [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[218,300]],
    puno:      [[252,548],[205,548],[205,480],[205,445],[199,445]],
    limlingan: [[252,548],[205,548],[205,480],[205,380],[220,380],[220,330],[220,315]],
    narciso:   [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[150,300],[150,280],[105,280]],
    parking1:  [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[150,300],[70,300],[70,235],[70,120],[165,120]],
    parking2:  [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[150,300],[70,300],[70,235]]
  };

  const svgNS = 'http://www.w3.org/2000/svg';
  const svgElement = (tag, attrs={}) => {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key,value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const routePathD = points => points.map((p,i) => `${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ');
  let selected = null;
  let currentView = '2d';
  let zoom2d = 1, panX = 0, panY = 0, dragging2d = null;

  // Build accessible destination directory and 2D map markers from one source of truth.
  destinations.forEach(destination => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'campus-destination-button';
    button.dataset.destination = destination.id;
    button.setAttribute('aria-pressed','false');
    button.innerHTML = `<i class="campus-destination-dot" style="--destination-color:${destination.color}"></i><span>${destination.name}</span><small class="campus-destination-code">${destination.code}</small>`;
    button.addEventListener('click', () => select(destination.id));
    list.appendChild(button);

    const group = svgElement('g', {class:'campus-2d-marker',tabindex:0,role:'button','aria-label':destination.name,'data-destination':destination.id});
    const halo = svgElement('circle',{class:'campus-2d-marker-halo',cx:destination.focus[0],cy:destination.focus[1],r:8,fill:destination.color});
    const core = svgElement('circle',{class:'campus-2d-marker-core',cx:destination.focus[0],cy:destination.focus[1],r:4,fill:destination.color});
    const title = svgElement('title'); title.textContent = destination.name;
    group.append(halo,core,title);
    group.addEventListener('click',()=>select(destination.id));
    group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(destination.id);}});
    markers2d.appendChild(group);
  });

  const routeStart2d = svgElement('circle',{class:'campus-route-start-2d',cx:GATE[0],cy:GATE[1],r:4.2});
  const routeEnd2d = svgElement('circle',{class:'campus-route-end-2d',cx:0,cy:0,r:4.6});
  markers2d.append(routeStart2d,routeEnd2d);

  // 2D route: crisp, right-angle strokes with no spline interpolation.
  function render2dRoute(destination) {
    const coordinates = destination && routes[destination.id] ? routes[destination.id] : null;
    const d = coordinates ? routePathD(coordinates) : '';
    routeHalo2d.setAttribute('d',d);
    route2d.setAttribute('d',d);
    routeDash2d.setAttribute('d',d);
    routeStart2d.style.display=coordinates?'':'none';
    if(coordinates){const end=coordinates[coordinates.length-1];routeEnd2d.setAttribute('cx',end[0]);routeEnd2d.setAttribute('cy',end[1]);routeEnd2d.style.display='';}else{routeEnd2d.style.display='none';}
    markers2d.querySelectorAll('.campus-2d-marker').forEach(node => {
      node.classList.toggle('selected', node.dataset.destination === (destination?.id || ''));
    });
  }
  function apply2dTransform(){art2d.style.transform=`translate(${panX}px,${panY}px) scale(${zoom2d})`;}
  function reset2d(){zoom2d=1;panX=0;panY=0;apply2dTransform();}
  $('campusZoomIn')?.addEventListener('click',()=>{if(currentView==='2d'){zoom2d=Math.min(2.5,zoom2d*1.15);apply2dTransform();}else if(camera){camera.zoom=Math.min(2.5,camera.zoom*1.12);camera.updateProjectionMatrix();}});
  $('campusZoomOut')?.addEventListener('click',()=>{if(currentView==='2d'){zoom2d=Math.max(.85,zoom2d/1.15);apply2dTransform();}else if(camera){camera.zoom=Math.max(.72,camera.zoom/1.12);camera.updateProjectionMatrix();}});
  $('campusMapReset')?.addEventListener('click',()=>{reset2d(); if(currentView==='3d')reset3d(); select(null,false);});
  $('campusMapHome')?.addEventListener('click',()=>select('gate'));
  $('campusClearSelection')?.addEventListener('click',()=>select(null));

  // 2D map panning and touch/mouse zoom.
  art2d.addEventListener('pointerdown',event=>{
    if(event.target.closest('.campus-2d-marker')) return;
    dragging2d={x:event.clientX-panX,y:event.clientY-panY,pointerId:event.pointerId};
    art2d.setPointerCapture(event.pointerId);
  });
  art2d.addEventListener('pointermove',event=>{
    if(!dragging2d) return;
    panX=event.clientX-dragging2d.x; panY=event.clientY-dragging2d.y; apply2dTransform();
  });
  const stopDrag=()=>{dragging2d=null;};
  art2d.addEventListener('pointerup',stopDrag); art2d.addEventListener('pointercancel',stopDrag);
  stage2d.addEventListener('wheel',event=>{event.preventDefault();zoom2d=Math.max(.85,Math.min(2.5,zoom2d*(event.deltaY<0?1.08:.92)));apply2dTransform();},{passive:false});

  function select(id, moveCamera=true){
    selected=destinations.find(d=>d.id===id)||null;
    list.querySelectorAll('.campus-destination-button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.destination===(selected?.id||''))));
    $('campusSelectedName').textContent=selected?selected.name:'Start at the Main Gate';
    $('campusRouteDescription').textContent=selected?(selected.id==='gate'?selected.description:selected.description+' The route follows the illustrated campus walkways from the Main Gate.'):'Choose a building from the directory or tap its marker to see the route from the Main Gate.';
    $('campusMapHint').textContent=selected?`Selected: ${selected.name} · route from Main Gate`:(currentView==='3d'?'3D view · Drag to orbit · Scroll to zoom':'2D view · Drag to pan · Scroll to zoom');
    $('campusMapHintOverlay').textContent=currentView==='3d'?'3D view · Drag to orbit · Scroll to zoom':'2D view · Drag to pan · Scroll to zoom';
    $('campusClearSelection').hidden=!selected;
    render2dRoute(selected); draw3dRoute(selected);
    if(currentView==='3d'&&moveCamera&&selected) focus3d(selected);
  }

  // 3D scene: original illustrated campus is used as a single, unmodified texture.
  let renderer=null, camera=null, controls=null, scene=null, routeGroup=null, mapPlane=null;
  let routeSegments=[], dashMeshes=[], routeAnimationStart=0, resizeObserver=null, cameraTween=null;
  const MAP_CENTER = (x,y,height=0)=>new THREE.Vector3(x-MAP_W/2,height,y-MAP_H/2);
  function disposeRoute3d(){
    if(!routeGroup)return;
    const geometries=new Set(), materials=new Set();
    routeGroup.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material){if(Array.isArray(object.material))object.material.forEach(m=>materials.add(m));else materials.add(object.material);}});
    scene.remove(routeGroup); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
    routeGroup=new THREE.Group();scene.add(routeGroup);routeSegments=[];dashMeshes=[];
  }
  function makeSegment(a,b,material,radius,group,record=false){
    const start=MAP_CENTER(a[0],a[1],3.2), end=MAP_CENTER(b[0],b[1],3.2);
    const delta=end.clone().sub(start), length=delta.length();
    if(length<.01)return;
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,10),material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    mesh.scale.y=length; mesh.renderOrder=5; group.add(mesh);
    if(record)routeSegments.push({a:start,b:end,length,dir:end.clone().sub(start).normalize(),horizontal:Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])});
  }
  function draw3dRoute(destination){
    if(!renderer||!scene)return;
    disposeRoute3d();
    if(!destination||!routes[destination.id])return;
    const coords=routes[destination.id];
    const baseMat=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
    const redMat=new THREE.MeshBasicMaterial({color:0xd74640,toneMapped:false});
    const jointBase=new THREE.SphereGeometry(3.1,12,8);
    const jointCore=new THREE.SphereGeometry(2.05,12,8);
    coords.slice(0,-1).forEach((point,i)=>{
      const next=coords[i+1];
      makeSegment(point,next,baseMat,3.15,routeGroup,true);
      makeSegment(point,next,redMat,2.0,routeGroup,false);
      [point].forEach(p=>{
        const whiteJoint=new THREE.Mesh(jointBase,baseMat);whiteJoint.position.copy(MAP_CENTER(p[0],p[1],3.25));routeGroup.add(whiteJoint);
        const redJoint=new THREE.Mesh(jointCore,redMat);redJoint.position.copy(MAP_CENTER(p[0],p[1],4));routeGroup.add(redJoint);
      });
    });
    const last=coords[coords.length-1];
    const whiteEnd=new THREE.Mesh(jointBase,baseMat);whiteEnd.position.copy(MAP_CENTER(last[0],last[1],3.25));routeGroup.add(whiteEnd);
    const redEnd=new THREE.Mesh(jointCore,redMat);redEnd.position.copy(MAP_CENTER(last[0],last[1],4));routeGroup.add(redEnd);
    // Distinct start and destination markers make the route endpoints unambiguous.
    const startMarkerGroup=new THREE.Group();
    const startDisc=new THREE.Mesh(new THREE.CircleGeometry(4.8,28),new THREE.MeshBasicMaterial({color:0x17603e,toneMapped:false,side:THREE.DoubleSide}));
    startDisc.rotation.x=-Math.PI/2;startDisc.position.copy(MAP_CENTER(GATE[0],GATE[1],7.0));startMarkerGroup.add(startDisc);
    const startRing=new THREE.Mesh(new THREE.RingGeometry(5.1,6.6,28),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,side:THREE.DoubleSide}));
    startRing.rotation.x=-Math.PI/2;startRing.position.copy(MAP_CENTER(GATE[0],GATE[1],7.1));startMarkerGroup.add(startRing);routeGroup.add(startMarkerGroup);
    const endDisc=new THREE.Mesh(new THREE.CircleGeometry(4.4,28),new THREE.MeshBasicMaterial({color:0xe1b53e,toneMapped:false,side:THREE.DoubleSide}));
    endDisc.rotation.x=-Math.PI/2;endDisc.position.copy(MAP_CENTER(last[0],last[1],7.0));routeGroup.add(endDisc);
    // Moving short white dashes run along the straight route, never around a spline.
    const total=routeSegments.reduce((sum,s)=>sum+s.length,0);
    const dashCount=Math.max(10,Math.min(28,Math.floor(total/18)));
    const dashMat=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
    const dashGeo=new THREE.BoxGeometry(6.2,.9,1.7);
    for(let i=0;i<dashCount;i++){
      const dash=new THREE.Mesh(dashGeo,dashMat);dash.renderOrder=7;routeGroup.add(dash);dashMeshes.push(dash);
    }
    routeAnimationStart=performance.now();
  }
  function pointAlongRoute(distance){
    let remaining=distance;
    for(const segment of routeSegments){
      if(remaining<=segment.length){
        const t=segment.length?remaining/segment.length:0;
        return {position:segment.a.clone().lerp(segment.b,t),horizontal:segment.horizontal};
      }
      remaining-=segment.length;
    }
    const last=routeSegments[routeSegments.length-1];
    return {position:last?last.b.clone():new THREE.Vector3(),horizontal:last?.horizontal??true};
  }
  function fitCamera(){
    if(!camera||!viewport)return;
    const aspect=Math.max(.3,viewport.clientWidth/Math.max(1,viewport.clientHeight));
    const frustumHeight=660;
    camera.left=-frustumHeight*aspect/2;camera.right=frustumHeight*aspect/2;
    camera.top=frustumHeight/2;camera.bottom=-frustumHeight/2;
    camera.updateProjectionMatrix();
  }
  function reset3d(){
    if(!camera||!controls)return;
    const from=camera.position.clone(), targetFrom=controls.target.clone();
    cameraTween={from,to:new THREE.Vector3(0,1080,330),targetFrom,targetTo:new THREE.Vector3(0,0,0),zoomFrom:camera.zoom,zoomTo:1,started:performance.now(),duration:650};
  }
  function focus3d(destination){
    if(!camera||!controls)return;
    const point=MAP_CENTER(destination.focus[0],destination.focus[1],0);
    // Keep the whole plan visible: only a mild recenter/zoom is applied, avoiding clipping.
    const targetTo=new THREE.Vector3(point.x*.18,0,point.z*.18);
    const offset=new THREE.Vector3(0,1080,330);
    cameraTween={from:camera.position.clone(),to:targetTo.clone().add(offset),targetFrom:controls.target.clone(),targetTo,zoomFrom:camera.zoom,zoomTo:1.06,started:performance.now(),duration:550};
  }
  let threeInitPromise=null;
  async function init3d(){
    if(threeInitPromise)return threeInitPromise;
    threeInitPromise=(async()=>{
      try{
        const [threeModule,controlsModule]=await Promise.all([
          import('three'),
          import('three/addons/controls/OrbitControls.js')
        ]);
        THREE=threeModule;
        OrbitControls=controlsModule.OrbitControls;
      }catch(error){
        console.error('GNC Three.js modules could not be loaded.',error);
        $('campusMapHint').textContent='3D resources are unavailable. The 2D campus map remains ready to use.';
        return false;
      }
      try{
        renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
      }catch(error){
        console.error('GNC 3D renderer initialization failed.',error);
        $('campusMapHint').textContent='WebGL is unavailable in this browser. Continue with the 2D map.';
        document.querySelector('[data-campus-view="3d"]')?.setAttribute('disabled','disabled');
        return false;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.NoToneMapping;
      renderer.shadowMap.enabled=false; // The supplied campus artwork already contains its own accurate shadows.
      scene=new THREE.Scene();scene.background=new THREE.Color('#e4ece6');
      camera=new THREE.OrthographicCamera(-360,360,360,-360,.1,4000);
      camera.position.set(0,1080,330);camera.lookAt(0,0,0);
      fitCamera();
      controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.07;
      controls.minPolarAngle=.12;controls.maxPolarAngle=1.03;controls.minDistance=450;controls.maxDistance=1700;controls.minZoom=.72;controls.maxZoom=2.5;controls.enablePan=true;controls.target.set(0,0,0);
      scene.add(new THREE.HemisphereLight(0xffffff,0x8a978e,1.7));
      const key=new THREE.DirectionalLight(0xfff6e8,1.05);key.position.set(-360,850,410);scene.add(key);
      // A restrained beveled presentation board adds depth without replacing any campus artwork.
      const board=new THREE.Mesh(new THREE.BoxGeometry(MAP_W+14,5,MAP_H+14),new THREE.MeshStandardMaterial({color:0xe9e5d8,roughness:.92,metalness:0}));
      board.position.y=-1.8;scene.add(board);
      const textureLoader=new THREE.TextureLoader();
      let texture;
      try{
        texture=await new Promise((resolve,reject)=>textureLoader.load('assets/gnc-campus-map-reference.jpg',resolve,undefined,reject));
      }catch(error){
        console.error('GNC campus map texture failed to load.',error);
        renderer.dispose();renderer=null;scene=null;camera=null;controls=null;
        $('campusMapHint').textContent='Campus image could not be loaded. Check assets/gnc-campus-map-reference.jpg.';
        return false;
      }
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
      texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
      mapPlane=new THREE.Mesh(new THREE.PlaneGeometry(MAP_W,MAP_H),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
      mapPlane.rotation.x=-Math.PI/2;mapPlane.position.y=1.0;scene.add(mapPlane);

      // Transparent click regions align with the printed destination labels. They add no geometry to the map.
      const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
      const hotspotMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false,side:THREE.DoubleSide});
      const hotspots=[];
      destinations.forEach(d=>{
        const [x1,y1,x2,y2]=d.footprint;
        const h=new THREE.Mesh(new THREE.PlaneGeometry(x2-x1,y2-y1),hotspotMat);
        h.rotation.x=-Math.PI/2;h.position.copy(MAP_CENTER((x1+x2)/2,(y1+y2)/2,2.1));h.userData.destination=d;scene.add(h);hotspots.push(h);
      });
      let down=null;
      canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
      canvas.addEventListener('pointercancel',()=>down=null);
      canvas.addEventListener('pointerup',e=>{
        if(!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>6)return;
        const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
        raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(hotspots,false);if(hits.length)select(hits[0].object.userData.destination.id);
      });
      resizeObserver=new ResizeObserver(()=>{fitCamera();renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);});
      resizeObserver.observe(viewport);renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);
      routeGroup=new THREE.Group();scene.add(routeGroup);
      const animate=now=>{
        requestAnimationFrame(animate);
        if(cameraTween){
          const raw=Math.min(1,(now-cameraTween.started)/cameraTween.duration),t=1-Math.pow(1-raw,3);
          camera.position.lerpVectors(cameraTween.from,cameraTween.to,t);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,t);
          camera.zoom=THREE.MathUtils.lerp(cameraTween.zoomFrom,cameraTween.zoomTo,t);camera.updateProjectionMatrix();
          if(raw>=1)cameraTween=null;
        }
        controls.enabled=!cameraTween&&currentView==='3d';if(currentView==='3d')controls.update();
        if(dashMeshes.length&&routeSegments.length){
          const total=routeSegments.reduce((sum,s)=>sum+s.length,0),offset=((now-routeAnimationStart)*.022)%18;
          dashMeshes.forEach((dash,i)=>{
            const dist=((i/dashMeshes.length)*total+offset)%total;const p=pointAlongRoute(dist);
            dash.position.set(p.position.x,5.5,p.position.z);dash.rotation.y=p.horizontal?0:Math.PI/2;
          });
        }
        if(currentView==='3d')renderer.render(scene,camera);
      };
      requestAnimationFrame(animate);
      draw3dRoute(selected);
      return true;
    })();
    return threeInitPromise;
  }

  function setView(view){
    currentView=(view==='3d'&&renderer)?'3d':'2d';
    viewport.classList.toggle('map-view-2d',currentView==='2d');viewport.classList.toggle('map-view-3d',currentView==='3d');
    stage2d.hidden=currentView!=='2d';canvas.hidden=currentView!=='3d';
    document.querySelectorAll('[data-campus-view]').forEach(button=>{
      const active=button.dataset.campusView===currentView;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
    });
    $('campusMapHintOverlay').textContent=currentView==='3d'?'3D view · Drag to orbit · Scroll to zoom':'2D view · Drag to pan · Scroll to zoom';
    $('campusMapHint').textContent=selected?`Selected: ${selected.name} · route from Main Gate`:(currentView==='3d'?'3D view · Drag to orbit · Scroll to zoom':'2D view · Drag to pan · Scroll to zoom');
    if(currentView==='3d'&&renderer){renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);if(selected)focus3d(selected);else reset3d();}
    if(currentView==='2d')reset2d();
  }
  async function activateView(view){
    if(view==='3d'&&!renderer){
      loading.textContent='Preparing 3D campus…';loading.classList.remove('is-hidden');
      let ok=false;
      try{ok=await init3d();}catch(error){
        console.error('GNC 3D campus startup failed.',error);
        $('campusMapHint').textContent='3D mode could not start. The 2D campus map is still available.';
      }
      loading.classList.add('is-hidden');
      if(!ok){document.querySelector('[data-campus-view="3d"]')?.setAttribute('disabled','disabled');setView('2d');return;}
    }
    setView(view);
  }
  document.querySelectorAll('[data-campus-view]').forEach(button=>button.addEventListener('click',()=>{void activateView(button.dataset.campusView);}));

  // The 2D map is the reliable default and works without WebGL or a Three.js CDN.
  // The 3D engine loads on demand only after the visitor explicitly chooses 3D.
  stage2d.hidden=false;canvas.hidden=true;loading.classList.add('is-hidden');
  setView('2d');select(null,false);
})();
