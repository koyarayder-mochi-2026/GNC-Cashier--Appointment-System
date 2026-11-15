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
  const GATE = [252,548];
  const destinations = [
    {id:'beta',name:'Beta Building',code:'BETA',color:'#287b42',focus:[247,345],footprint:[214,300,291,476],description:'Beta Building — use the west-side walkway from the Main Gate.'},
    {id:'banzali',name:'Banzali Hall',code:'BH',color:'#c94c50',focus:[322,385],footprint:[306,289,346,478],description:'Banzali Hall — follow the eastern perimeter walkway.'},
    {id:'tanj',name:'Tanjangco Hall',code:'TH',color:'#27864d',focus:[135,199],footprint:[90,167,181,234],description:'Tanjangco Hall — follow the central passage, then turn west.'},
    {id:'goseco',name:'Goseco Hall',code:'GH',color:'#d8aa35',focus:[258,180],footprint:[218,155,348,296],description:'Goseco Hall — follow the central passage toward the north-east.'},
    {id:'puno',name:'Puno Hall',code:'PH',color:'#4d89ae',focus:[179,430],footprint:[160,376,198,478],description:'Puno Hall — follow the west-side passage beside Beta Building.'},
    {id:'limlingan',name:'Limlingan Hall',code:'LH',color:'#4d8b5a',focus:[184,315],footprint:[132,244,216,375],description:'Limlingan Hall — follow the central passage and turn toward the west wing.'},
    {id:'narciso',name:'Narciso Hall',code:'NH',color:'#4e83b2',focus:[84,252],footprint:[43,239,132,278],description:'Narciso Hall — follow the west passage and turn toward the hall.'},
    {id:'parking1',name:'Parking 1',code:'P1',color:'#8a55a8',focus:[163,58],footprint:[8,0,318,118],description:'Parking 1 — follow the northern access lane.'},
    {id:'parking2',name:'Parking 2',code:'P2',color:'#8a55a8',focus:[38,174],footprint:[8,117,68,237],description:'Parking 2 — follow the west-side access lane.'},
    {id:'gate',name:'Main Gate',code:'GATE',color:'#17603e',focus:[251,525],footprint:[210,477,290,560],description:'Main Gate — starting point for all routes.'}
  ];

  const directoryDestinations=destinations.filter(d=>d.id!=='gate');

  // Routes are right-angle polylines traced against the supplied GNC map.
  // Points remain on the walkable corridors; do not smooth or spline these paths.
  const routes = {
    beta:      [[252,548],[205,548],[205,480],[205,380],[210,380],[210,365]],
    banzali:   [[252,548],[205,548],[205,480],[250,480],[300,480],[300,430],[305,430],[305,398]],
    tanj:      [[252,548],[205,548],[205,480],[205,380],[220,380],[220,245],[180,245],[180,225]],
    goseco:    [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[218,300]],
    puno:      [[252,548],[205,548],[205,480],[205,445],[199,445]],
    limlingan: [[252,548],[205,548],[205,480],[205,380],[220,380],[220,330],[220,315]],
    narciso:   [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[150,300],[150,280],[132,280]],
    parking1:  [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[150,300],[70,300],[70,235],[70,120],[165,120]],
    parking2:  [[252,548],[205,548],[205,480],[205,380],[220,380],[220,300],[150,300],[70,300],[70,235]]
  };

  // 3D paths are adjusted to the clear walkable gaps between the modeled buildings.
  // The already-approved 2D linework above is deliberately left unchanged.
  const routes3d = {
    beta:      [[252,548],[212,548],[212,480],[212,380],[210,380],[210,365]],
    banzali:   [[252,548],[212,548],[212,480],[250,480],[300,480],[300,430],[305,430],[305,398]],
    tanj:      [[252,548],[212,548],[212,480],[212,380],[212,298],[217,298],[217,240],[185,240],[185,225]],
    goseco:    [[252,548],[212,548],[212,480],[212,380],[212,298],[217,298],[235,298]],
    puno:      [[252,548],[212,548],[212,480],[205,480],[205,445],[199,445]],
    limlingan: [[252,548],[212,548],[212,480],[212,380],[212,315],[200,315]],
    narciso:   [[252,548],[212,548],[212,480],[212,380],[212,298],[217,298],[217,238],[135,238]],
    parking1:  [[252,548],[212,548],[212,480],[212,380],[212,298],[217,298],[217,238],[70,238],[70,119],[165,119]],
    parking2:  [[252,548],[212,548],[212,480],[212,380],[212,298],[217,298],[217,238],[70,238],[70,174]]
  };

  const svgNS='http://www.w3.org/2000/svg';
  const svgEl=(tag,attrs={})=>{const n=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));return n;};
  const pathD=pts=>pts.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ');
  let selected=null,currentView='2d',zoom2d=1,panX=0,panY=0,drag2d=null;

  directoryDestinations.forEach(d=>{
    const b=document.createElement('button');b.type='button';b.className='campus-destination-button';b.dataset.destination=d.id;b.setAttribute('aria-pressed','false');
    b.innerHTML=`<i class="campus-destination-dot" style="--destination-color:${d.color}"></i><span>${d.name}</span><small class="campus-destination-code">${d.code}</small>`;
    b.addEventListener('click',()=>select(d.id));list.appendChild(b);
    const g=svgEl('g',{class:'campus-2d-marker',tabindex:0,role:'button','aria-label':d.name,'data-destination':d.id});
    g.append(svgEl('circle',{class:'campus-2d-marker-halo',cx:d.focus[0],cy:d.focus[1],r:8,fill:d.color}),svgEl('circle',{class:'campus-2d-marker-core',cx:d.focus[0],cy:d.focus[1],r:4,fill:d.color}));
    const t=svgEl('title');t.textContent=d.name;g.append(t);
    g.addEventListener('click',()=>select(d.id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(d.id);}});
    markers2d.append(g);
  });
  const start2d=svgEl('circle',{class:'campus-route-start-2d',cx:GATE[0],cy:GATE[1],r:4.2});
  const end2d=svgEl('circle',{class:'campus-route-end-2d',cx:0,cy:0,r:4.6});
  markers2d.append(start2d,end2d);

  function render2dRoute(d){
    const pts=d&&routes[d.id]?routes[d.id]:null, path=pts?pathD(pts):'';
    routeHalo2d.setAttribute('d',path);route2d.setAttribute('d',path);routeDash2d.setAttribute('d',path);
    start2d.style.display=pts?'':'none';
    if(pts){const last=pts[pts.length-1];end2d.setAttribute('cx',last[0]);end2d.setAttribute('cy',last[1]);end2d.style.display='';}else end2d.style.display='none';
    markers2d.querySelectorAll('.campus-2d-marker').forEach(g=>g.classList.toggle('selected',g.dataset.destination===(d?.id||'')));
  }
  function apply2d(){art2d.style.transform=`translate(${panX}px,${panY}px) scale(${zoom2d})`;}
  function reset2d(){zoom2d=1;panX=0;panY=0;apply2d();}
  $('campusZoomIn')?.addEventListener('click',()=>{if(currentView==='2d'){zoom2d=Math.min(2.8,zoom2d*1.15);apply2d();}else if(camera){camera.zoom=Math.min(2.6,camera.zoom*1.12);camera.updateProjectionMatrix();}});
  $('campusZoomOut')?.addEventListener('click',()=>{if(currentView==='2d'){zoom2d=Math.max(.85,zoom2d/1.15);apply2d();}else if(camera){camera.zoom=Math.max(.65,camera.zoom/1.12);camera.updateProjectionMatrix();}});
  $('campusMapReset')?.addEventListener('click',()=>{reset2d();if(currentView==='3d')reset3d();select(null,false);});
  $('campusMapHome')?.addEventListener('click',()=>{select('gate');});
  $('campusClearSelection')?.addEventListener('click',()=>select(null));
  art2d.addEventListener('pointerdown',e=>{if(e.target.closest('.campus-2d-marker'))return;drag2d={x:e.clientX-panX,y:e.clientY-panY};art2d.setPointerCapture(e.pointerId);});
  art2d.addEventListener('pointermove',e=>{if(!drag2d)return;panX=e.clientX-drag2d.x;panY=e.clientY-drag2d.y;apply2d();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>art2d.addEventListener(ev,()=>drag2d=null));
  stage2d.addEventListener('wheel',e=>{e.preventDefault();zoom2d=Math.max(.85,Math.min(2.8,zoom2d*(e.deltaY<0?1.08:.92)));apply2d();},{passive:false});

  function select(id,moveCamera=true){
    selected=destinations.find(d=>d.id===id)||null;
    list.querySelectorAll('.campus-destination-button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.destination===(selected?.id||''))));
    $('campusSelectedName').textContent=selected?selected.name:'Start at the Main Gate';
    $('campusRouteDescription').textContent=selected?(selected.description+' Route is shown from the Main Gate.'):'Choose a building from the directory or map to see the route from the Main Gate.';
    $('campusMapHint').textContent=selected?`Selected: ${selected.name} · route from Main Gate`:(currentView==='3d'?'3D campus · drag to orbit · scroll to zoom':'2D campus · drag to pan · scroll to zoom');
    $('campusMapHintOverlay').textContent=currentView==='3d'?'3D campus · drag to orbit · scroll to zoom':'2D campus · drag to pan · scroll to zoom';
    $('campusClearSelection').hidden=!selected;
    render2dRoute(selected);draw3dRoute(selected);
    if(currentView==='3d'&&moveCamera&&selected)focus3d(selected);
  }

  // Three-dimensional campus construction. Buildings are real extruded meshes:
  // textured roof surfaces preserve the supplied GNC artwork; hipped roof geometry, multi-floor window bays,
  // parapets, raised parking decks, the open Main Gate portico and cast shadows provide architectural depth.
  let renderer=null,camera=null,controls=null,scene=null,routeGroup=null,groundGroup=null;
  let routeSegments=[],movingArrows=[],routeStartTime=0,resizeObserver=null,raycaster=null,hotspots=[];
  const W=MAP_W,H=MAP_H;
  const world=(x,y,height=0)=>new THREE.Vector3(x-W/2,height,y-H/2);
  const BUILDINGS=[
    {id:'parking1',name:'Parking 1',rect:[8,0,318,118],h:5,wall:'#3f3150',roof:[8,0,318,118],type:'parking',roofStyle:'flat'},
    {id:'parking2',name:'Parking 2',rect:[8,117,68,237],h:5,wall:'#453451',roof:[8,117,68,237],type:'parking',roofStyle:'flat'},
    {id:'annexNorthA',name:'',rect:[74,120,130,165],h:17,wall:'#77796d',roof:[68,120,130,165],color:'#e6dfcf',roofStyle:'hip'},
    {id:'annexNorthB',name:'',rect:[130,120,218,165],h:18,wall:'#77796d',roof:[130,120,218,165],color:'#e9e0cd',roofStyle:'hip'},
    {id:'tanj',name:'Tanjangco Hall',rect:[90,167,181,234],h:27,wall:'#165b38',roof:[90,167,181,234],color:'#a4c58e',roofStyle:'hip'},
    // Goseco Hall is modeled as a four-sided building surround so its central court is genuinely open.
    {id:'goseco',name:'Goseco Hall',rect:[218,155,318,202],h:31,wall:'#a88a37',roof:[218,155,318,202],color:'#d9bf72',roofStyle:'hip'},
    {id:'gosecoWestWing',name:'',rect:[218,202,235,263],h:31,wall:'#a88a37',roof:[218,202,235,263],color:'#d9bf72',roofStyle:'hip'},
    {id:'gosecoEastWing',name:'',rect:[318,202,348,296],h:31,wall:'#a88a37',roof:[318,202,348,296],color:'#d9bf72',roofStyle:'hip'},
    {id:'gosecoSouthWing',name:'',rect:[235,263,318,296],h:31,wall:'#a88a37',roof:[235,263,318,296],color:'#d9bf72',roofStyle:'hip'},
    {id:'narciso',name:'Narciso Hall',rect:[43,239,132,278],h:24,wall:'#164b75',roof:[43,239,132,278],color:'#7da3bd',roofStyle:'flat'},
    {id:'limlinganNorthWing',name:'',rect:[132,244,216,278],h:24,wall:'#3d7049',roof:[132,244,216,278],color:'#a8c2a0',roofStyle:'hip'},
    {id:'limlingan',name:'Limlingan Hall',rect:[162,278,198,375],h:25,wall:'#3d7049',roof:[162,278,198,375],color:'#a8c2a0',roofStyle:'flat'},
    {id:'puno',name:'Puno Hall',rect:[160,376,198,478],h:25,wall:'#365b6e',roof:[160,376,198,478],color:'#a7c3cb',roofStyle:'hip'},
    {id:'beta',name:'Beta Building',rect:[214,300,291,476],h:36,wall:'#15583a',roof:[214,300,291,476],color:'#d5d3c4',flag:true,roofStyle:'flat'},
    {id:'banzali',name:'Banzali Hall',rect:[306,289,346,478],h:37,wall:'#853d3d',roof:[306,289,346,478],color:'#d78c8b',roofStyle:'flat'},
    {id:'gateLeft',name:'',rect:[136,502,198,548],h:17,wall:'#6f6c5d',roof:[136,502,198,548],color:'#e5ddcb',roofStyle:'hip'},
    {id:'gate',name:'Main Gate',rect:[210,477,290,560],h:21,wall:'#6a6251',roof:[210,477,290,560],color:'#e8dfcc',roofStyle:'hip',type:'portico'},
    {id:'gateRight',name:'',rect:[292,488,348,556],h:18,wall:'#6f6c5d',roof:[292,488,348,556],color:'#e7dfcf',roofStyle:'hip'}
  ];

  function createCropTexture(image,rect){
    const [x1,y1,x2,y2]=rect, sw=Math.max(1,x2-x1),sh=Math.max(1,y2-y1),scale=6;
    const c=document.createElement('canvas');c.width=sw*scale;c.height=sh*scale;
    const ctx=c.getContext('2d');
    const sx=image.naturalWidth/W,sy=image.naturalHeight/H;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(image,x1*sx,y1*sy,sw*sx,sh*sy,0,0,c.width,c.height);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),12);
    tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;return tex;
  }
  function labelTexture(text,color){
    const c=document.createElement('canvas');c.width=640;c.height=128;const ctx=c.getContext('2d');
    const radius=34;ctx.fillStyle=color;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=10;
    ctx.beginPath();ctx.roundRect(8,8,624,112,radius);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='800 48px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    let label=text.toUpperCase();while(ctx.measureText(label).width>550){ctx.font='800 44px Arial,sans-serif';break;}
    ctx.fillText(label,320,67);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);return texture;
  }
  function roofRiseFor(building){
    if(building.roofStyle!=='hip')return 0;
    const [x1,y1,x2,y2]=building.rect,w=x2-x1,d=y2-y1;
    return Math.min(8.5,Math.max(4.6,Math.min(w,d)*.13));
  }
  function addRoofQuad(points,color){
    const geometry=new THREE.BufferGeometry();
    const positions=[];
    points.forEach(([x,z,y])=>{const p=world(x,z,y);positions.push(p.x,p.y,p.z);});
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color,roughness:.88,metalness:0,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    return mesh;
  }
  function addHippedRoof(image,b){
    const [x1,z1,x2,z2]=b.rect,w=x2-x1,d=z2-z1;
    const baseY=b.h+.55,rise=roofRiseFor(b),insetX=Math.min(10,w*.15),insetZ=Math.min(8,d*.18);
    const topY=baseY+rise;
    const left=x1+insetX,right=x2-insetX,front=z1+insetZ,back=z2-insetZ;
    const base=new THREE.Color(b.color||'#d8d2c2');
    const shade=(factor)=>'#'+base.clone().multiplyScalar(factor).getHexString();
    // Four real sloped roof faces and a small raised crown reproduce the hip-roof profile in the reference.
    addRoofQuad([[x1,z1,baseY],[x2,z1,baseY],[right,front,topY],[left,front,topY]],shade(1.13));
    addRoofQuad([[x2,z2,baseY],[x1,z2,baseY],[left,back,topY],[right,back,topY]],shade(.88));
    addRoofQuad([[x1,z2,baseY],[x1,z1,baseY],[left,front,topY],[left,back,topY]],shade(1.02));
    addRoofQuad([[x2,z1,baseY],[x2,z2,baseY],[right,back,topY],[right,front,topY]],shade(.76));
    const roofTex=createCropTexture(image,b.roof);
    const roofMat=new THREE.MeshStandardMaterial({map:roofTex,color:0xffffff,roughness:.82,metalness:0});
    const top=new THREE.Mesh(new THREE.PlaneGeometry(right-left,back-front),roofMat);
    top.rotation.x=-Math.PI/2;top.position.copy(world((left+right)/2,(front+back)/2,topY+.06));top.castShadow=true;top.receiveShadow=true;scene.add(top);
    const fascia=new THREE.MeshStandardMaterial({color:new THREE.Color(b.wall).multiplyScalar(.78),roughness:.76});
    const railH=1.35,railT=1.45;
    [
      [w+1,railH,railT,(x1+x2)/2,baseY-.25,z1],
      [w+1,railH,railT,(x1+x2)/2,baseY-.25,z2],
      [railT,railH,d+1,x1,baseY-.25,(z1+z2)/2],
      [railT,railH,d+1,x2,baseY-.25,(z1+z2)/2]
    ].forEach(([rw,rh,rd,x,y,z])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(rw,rh,rd),fascia);m.position.copy(world(x,z,y));m.castShadow=true;scene.add(m);});
    const ridgeLength=Math.max(12,(w>=d?right-left:back-front)*.66);
    const ridge=new THREE.Mesh(new THREE.BoxGeometry(w>=d?ridgeLength:1.25,.8,w>=d?1.25:ridgeLength),
      new THREE.MeshStandardMaterial({color:shade(1.2),roughness:.82}));
    ridge.position.copy(world((x1+x2)/2,(z1+z2)/2,topY+.34));ridge.castShadow=true;scene.add(ridge);
    b._roofTop=topY;
  }
  function addLabel(building,d){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(d.name,d.color),transparent:true,depthTest:true,depthWrite:false}));
    const width=Math.min(112,Math.max(52,d.name.length*5.7));
    sprite.scale.set(width,width*.205,1);
    sprite.position.copy(world(d.focus[0],d.focus[1],(building._roofTop??(building.h+1.2))+6.5));sprite.renderOrder=10;scene.add(sprite);
  }
  function addWindows(building){
    if(building.type==='parking'||building.type==='portico')return;
    const [x1,z1,x2,z2]=building.rect;
    const w=x2-x1,d=z2-z1,h=building.h;
    const floors=Math.max(2,Math.min(4,Math.round(h/8.5)));
    const floorStep=h/floors;
    const winW=Math.min(6.2,Math.max(3.8,Math.min(w,d)*.20));
    const winH=Math.min(3.55,Math.max(2.45,floorStep*.40));
    const entries=[];
    const addFace=(length,axis,edge,rotation)=>{
      const count=Math.max(2,Math.min(11,Math.floor((length-7)/(winW+3))));
      const usable=length-8,spacing=usable/count;
      for(let floor=0;floor<floors;floor++){
        const y=floorStep*(floor+.5);
        for(let i=0;i<count;i++){
          const along=(axis==='x'?x1:z1)+4+spacing*(i+.5);
          let x,z;
          if(axis==='x'){x=along;z=edge;}
          else{x=edge;z=along;}
          entries.push({x,z,y,rotation,axis});
        }
      }
    };
    // Windows are placed on all four exposed elevations, with consistent spacing per floor.
    addFace(w,'x',z1-.52,0);
    addFace(w,'x',z2+.52,0);
    addFace(d,'z',x1-.52,Math.PI/2);
    addFace(d,'z',x2+.52,Math.PI/2);
    if(!entries.length)return;

    const frameMat=new THREE.MeshStandardMaterial({color:0xe4dfd1,roughness:.72,metalness:.04});
    const glassMat=new THREE.MeshStandardMaterial({color:0x24485b,roughness:.26,metalness:.18,emissive:0x07141b,emissiveIntensity:.12});
    const mullionMat=new THREE.MeshStandardMaterial({color:0xb9c1ba,roughness:.55,metalness:.08});
    const frameGeo=new THREE.BoxGeometry(winW+.9,winH+.8,.9);
    const glassGeo=new THREE.BoxGeometry(winW,winH,.96);
    const verticalGeo=new THREE.BoxGeometry(.28,winH-.18,.18);
    const horizontalGeo=new THREE.BoxGeometry(winW-.18,.22,.18);
    const frames=new THREE.InstancedMesh(frameGeo,frameMat,entries.length);
    const panes=new THREE.InstancedMesh(glassGeo,glassMat,entries.length);
    const verticals=new THREE.InstancedMesh(verticalGeo,mullionMat,entries.length);
    const horizontals=new THREE.InstancedMesh(horizontalGeo,mullionMat,entries.length);
    const dummy=new THREE.Object3D();
    entries.forEach((e,i)=>{
      dummy.position.copy(world(e.x,e.z,e.y));dummy.rotation.set(0,e.rotation,0);dummy.updateMatrix();
      frames.setMatrixAt(i,dummy.matrix);
      // The glass sits a fraction proud of the frame so it does not z-fight with the facade.
      const outward=e.axis==='x' ? (e.z< (z1+z2)/2 ? -.56 : .56) : (e.x< (x1+x2)/2 ? -.56 : .56);
      const gx=e.x+(e.axis==='z'?outward:0),gz=e.z+(e.axis==='x'?outward:0);
      dummy.position.copy(world(gx,gz,e.y));dummy.rotation.set(0,e.rotation,0);dummy.updateMatrix();
      panes.setMatrixAt(i,dummy.matrix);
      // Mullions are raised just in front of the glass, preventing depth-fighting.
      const mx=gx+(e.axis==='z'?outward*.62:0),mz=gz+(e.axis==='x'?outward*.62:0);
      dummy.position.copy(world(mx,mz,e.y));dummy.rotation.set(0,e.rotation,0);dummy.updateMatrix();
      verticals.setMatrixAt(i,dummy.matrix);horizontals.setMatrixAt(i,dummy.matrix);
    });
    [frames,panes,verticals,horizontals].forEach(mesh=>{
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    });
  }

  function addFacadeDetails(building){
    if(building.type==='parking'||building.type==='portico')return;
    const [x1,z1,x2,z2]=building.rect,w=x2-x1,d=z2-z1,h=building.h;
    const trim=new THREE.MeshStandardMaterial({color:0xe5dfd0,roughness:.8});
    const corner=new THREE.MeshStandardMaterial({color:new THREE.Color(building.wall).multiplyScalar(1.12),roughness:.76});
    // Subtle floor bands and corner pilasters add the layered institutional facade seen in the video.
    const floors=Math.max(2,Math.min(4,Math.round(h/9)));
    for(let f=1;f<floors;f++){
      const y=h*f/floors;
      [[w+.4,.72,1.0,(x1+x2)/2-W/2,y,(z1-H/2)-.55],
       [w+.4,.72,1.0,(x1+x2)/2-W/2,y,(z2-H/2)+.55],
       [1.0,.72,d+.4,(x1-W/2)-.55,y,(z1+z2)/2-H/2],
       [1.0,.72,d+.4,(x2-W/2)+.55,y,(z1+z2)/2-H/2]].forEach(([bw,bh,bd,x,yy,z])=>{
        const band=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),trim);band.position.set(x,yy,z);band.castShadow=true;scene.add(band);
      });
    }
    [[x1,z1],[x1,z2],[x2,z1],[x2,z2]].forEach(([x,z])=>{
      const pilaster=new THREE.Mesh(new THREE.BoxGeometry(1.5,h,1.5),corner);
      pilaster.position.copy(world(x,z,h/2));pilaster.castShadow=true;scene.add(pilaster);
    });
  }
  function addFlagCanopy(image,b){
    const [x1,z1,x2,z2]=b.rect,w=x2-x1,d=z2-z1,cx=(x1+x2)/2,cz=(z1+z2)/2;
    const baseY=b.h+1.8,trimMat=new THREE.MeshStandardMaterial({color:0xe7e0cf,roughness:.72});
    const platform=new THREE.Mesh(new THREE.BoxGeometry(w+4,1.6,d+4),trimMat);
    platform.position.copy(world(cx,cz,b.h+.65));platform.castShadow=true;platform.receiveShadow=true;scene.add(platform);
    const roofTex=createCropTexture(image,b.roof);
    const geo=new THREE.PlaneGeometry(w*.93,d*.93,36,52);
    const pos=geo.attributes.position;
    for(let i=0;i<pos.count;i++){
      const u=geo.attributes.uv.getX(i),v=geo.attributes.uv.getY(i);
      // Gentle cloth-like crown across the flag roof, not a sharp artificial pyramid.
      const crown=2.2*Math.sin(Math.PI*u)+1.6*Math.sin(Math.PI*v);
      pos.setZ(i,crown);
    }
    geo.computeVertexNormals();
    const canopy=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({
      map:roofTex,color:0xffffff,roughness:.66,metalness:0,side:THREE.DoubleSide
    }));
    canopy.rotation.x=-Math.PI/2;canopy.position.copy(world(cx,cz,baseY));canopy.castShadow=true;canopy.receiveShadow=true;scene.add(canopy);
    const border=new THREE.MeshStandardMaterial({color:0xe8e0cf,roughness:.68});
    const beams=[
      [w*.94,1.35,1.6,cx,baseY+.2,z1+2],
      [w*.94,1.35,1.6,cx,baseY+.2,z2-2],
      [1.6,1.35,d*.92,x1+2,baseY+.2,cz],
      [1.6,1.35,d*.92,x2-2,baseY+.2,cz]
    ];
    beams.forEach(([bw,bh,bd,x,y,z])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),border);m.position.copy(world(x,z,y));m.castShadow=true;scene.add(m);});
    b._roofTop=baseY+3.8;
  }

  function addGymLine(points, y, material, radius=.42){
    for(let i=0;i<points.length-1;i++){
      const a=world(points[i][0],points[i][1],y), b=world(points[i+1][0],points[i+1][1],y);
      const delta=b.clone().sub(a), length=delta.length();
      if(length<.05) continue;
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,8),material);
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
      mesh.castShadow=false;mesh.receiveShadow=true;scene.add(mesh);
    }
  }
  function addBasketballGym(building){
    // Beta is an open-sided basketball gym below the Philippine-flag canopy,
    // not a sealed classroom block. Court lines and baskets are visible through the roof supports.
    const [x1,z1,x2,z2]=building.rect, w=x2-x1, d=z2-z1, cx=(x1+x2)/2, cz=(z1+z2)/2;
    const floorTop=3.15;
    const slabMat=new THREE.MeshStandardMaterial({color:0xa94331,roughness:.88});
    const blueMat=new THREE.MeshStandardMaterial({color:0x174a78,roughness:.78});
    const greenMat=new THREE.MeshStandardMaterial({color:0x145b3c,roughness:.78});
    const trimMat=new THREE.MeshStandardMaterial({color:0xe7dfcc,roughness:.78});
    const lineMat=new THREE.MeshStandardMaterial({color:0xf4f0df,roughness:.72});
    const goldMat=new THREE.MeshStandardMaterial({color:0xd7ad45,roughness:.55,metalness:.08});
    const orangeMat=new THREE.MeshStandardMaterial({color:0xd97832,roughness:.55});
    const darkMat=new THREE.MeshStandardMaterial({color:0x223b45,roughness:.7});
    // Red gym apron and a recessed blue playing court.
    const apron=new THREE.Mesh(new THREE.BoxGeometry(w-5,1.5,d-9),slabMat);
    apron.position.copy(world(cx,cz,floorTop-.8));apron.receiveShadow=true;apron.castShadow=true;scene.add(apron);
    const courtW=w-19, courtD=d-35, courtX1=cx-courtW/2, courtX2=cx+courtW/2;
    const courtZ1=cz-courtD/2, courtZ2=cz+courtD/2;
    const court=new THREE.Mesh(new THREE.BoxGeometry(courtW,.45,courtD),blueMat);
    court.position.copy(world(cx,cz,floorTop+.12));court.receiveShadow=true;scene.add(court);
    const y=floorTop+.48;
    // White regulation boundary, centre line, key boxes and centre circle.
    addGymLine([[courtX1,courtZ1],[courtX2,courtZ1],[courtX2,courtZ2],[courtX1,courtZ2],[courtX1,courtZ1]],y,lineMat,.48);
    addGymLine([[cx,courtZ1],[cx,courtZ2]],y,lineMat,.38);
    const centreRing=new THREE.Mesh(new THREE.TorusGeometry(8,.42,8,56),lineMat);
    centreRing.rotation.x=Math.PI/2;centreRing.position.copy(world(cx,cz,y+.08));scene.add(centreRing);
    const keyW=21, keyD=27;
    [[courtZ1,courtZ1+keyD],[courtZ2-keyD,courtZ2]].forEach(([za,zb])=>{
      addGymLine([[cx-keyW/2,za],[cx+keyW/2,za],[cx+keyW/2,zb],[cx-keyW/2,zb],[cx-keyW/2,za]],y,lineMat,.42);
      const freeRing=new THREE.Mesh(new THREE.TorusGeometry(7,.38,8,44,Math.PI),lineMat);
      freeRing.rotation.set(Math.PI/2,0,za===courtZ1?0:Math.PI);
      freeRing.position.copy(world(cx,za===courtZ1?za+keyD:zb-keyD,y+.06));scene.add(freeRing);
    });
    // Gold-painted centre and end markings echo the court shown in the GNC reference.
    addGymLine([[cx-2,cz],[cx+2,cz]],y+.04,goldMat,.55);
    // Basket supports, backboards and orange rims at both ends of the court.
    [courtZ1+8,courtZ2-8].forEach((basketZ,index)=>{
      const support=new THREE.Mesh(new THREE.BoxGeometry(1.25,8,1.25),darkMat);
      support.position.copy(world(cx,basketZ+ (index===0?-3:3),floorTop+4.3));support.castShadow=true;scene.add(support);
      const board=new THREE.Mesh(new THREE.BoxGeometry(12,7,.75),trimMat);
      board.position.copy(world(cx,basketZ,floorTop+14));board.castShadow=true;scene.add(board);
      const inner=new THREE.Mesh(new THREE.BoxGeometry(5.8,3.8,.25),new THREE.MeshStandardMaterial({color:0x9fc0cf,roughness:.35,metalness:.05}));
      inner.position.copy(world(cx,basketZ+(index===0?-.48:.48),floorTop+14));scene.add(inner);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(2.5,.48,8,32),orangeMat);
      rim.rotation.x=Math.PI/2;rim.position.copy(world(cx,basketZ+(index===0?3.1:-3.1),floorTop+10.5));rim.castShadow=true;scene.add(rim);
    });
    // Open-sided green frame: corner and mid-span columns carry the flag canopy while keeping the court visible.
    const postPositions=[
      [x1+3,z1+4],[x2-3,z1+4],[x1+3,cz],[x2-3,cz],[x1+3,z2-4],[x2-3,z2-4]
    ];
    postPositions.forEach(([x,z])=>{
      const plinth=new THREE.Mesh(new THREE.BoxGeometry(4.2,1.5,4.2),trimMat);
      plinth.position.copy(world(x,z,3.9));plinth.castShadow=true;scene.add(plinth);
      const post=new THREE.Mesh(new THREE.BoxGeometry(2.6,building.h+1,2.6),greenMat);
      post.position.copy(world(x,z,(building.h+1)/2+4));post.castShadow=true;post.receiveShadow=true;scene.add(post);
    });
    // Low green side rails and fascia; the front and rear remain open for the gym entrance.
    [x1+1.2,x2-1.2].forEach(x=>{
      const rail=new THREE.Mesh(new THREE.BoxGeometry(1.8,5,d-10),greenMat);
      rail.position.copy(world(x,cz,6.8));rail.castShadow=true;scene.add(rail);
    });
    const fascia=new THREE.Mesh(new THREE.BoxGeometry(w-3,2.1,2.2),greenMat);
    fascia.position.copy(world(cx,z1+2.2,building.h+0.1));fascia.castShadow=true;scene.add(fascia);
  }

  function addBuilding(image,b){
    const [x1,z1,x2,z2]=b.rect,w=x2-x1,d=z2-z1,center=world((x1+x2)/2,(z1+z2)/2,0);
    const wallMat=new THREE.MeshStandardMaterial({color:b.wall,roughness:.78,metalness:.02});
    const sideLight=new THREE.MeshStandardMaterial({color:new THREE.Color(b.wall).multiplyScalar(1.12),roughness:.8});
    const sideDark=new THREE.MeshStandardMaterial({color:new THREE.Color(b.wall).multiplyScalar(.78),roughness:.86});
    if(b.type==='portico'){
      // Keep the center of the Main Gate open: the pedestrian route passes through this roofed entrance.
      const columnMat=new THREE.MeshStandardMaterial({color:0xe4ddcd,roughness:.78});
      [[x1+8,z1+8],[x2-8,z1+8],[x1+8,z2-8],[x2-8,z2-8]].forEach(([x,z])=>{
        const column=new THREE.Mesh(new THREE.BoxGeometry(3.6,b.h,3.6),columnMat);
        column.position.copy(world(x,z,b.h/2));column.castShadow=true;column.receiveShadow=true;scene.add(column);
      });
      const lintel=new THREE.Mesh(new THREE.BoxGeometry(w-4,2.2,4.2),new THREE.MeshStandardMaterial({color:0xb8954c,roughness:.6,metalness:.12}));
      lintel.position.copy(world((x1+x2)/2,z1+4,b.h-1.6));lintel.castShadow=true;scene.add(lintel);
    }else if(b.flag){
      // Beta's Philippine-flag roof covers an open basketball gym; do not fill it with a solid block.
      addBasketballGym(b);
    }else{
      const body=new THREE.Mesh(new THREE.BoxGeometry(w,b.h,d),[sideLight,sideDark,wallMat,sideDark,wallMat,sideDark]);
      body.position.set(center.x,b.h/2,center.z);body.castShadow=true;body.receiveShadow=true;scene.add(body);
    }
    if(!b.flag){addFacadeDetails(b);addWindows(b);}
    if(b.flag) addFlagCanopy(image,b);
    else if(b.roofStyle==='hip') addHippedRoof(image,b);
    else {
      const roofTex=createCropTexture(image,b.roof);
      const roofMat=new THREE.MeshStandardMaterial({map:roofTex,color:0xffffff,roughness:.78,metalness:0,side:THREE.DoubleSide});
      const roof=new THREE.Mesh(new THREE.PlaneGeometry(w-.7,d-.7),roofMat);
      roof.rotation.x=-Math.PI/2;roof.position.set(center.x,b.h+.75,center.z);roof.receiveShadow=true;roof.castShadow=true;scene.add(roof);
      const trimMat=new THREE.MeshStandardMaterial({color:b.wall,roughness:.65});
      const railH=b.type==='parking'?0.8:1.35,railT=b.type==='parking'?1.5:1.1;
      [
        [w,railH,railT,center.x,b.h+railH/2,center.z-d/2],
        [w,railH,railT,center.x,b.h+railH/2,center.z+d/2],
        [railT,railH,d,center.x-w/2,b.h+railH/2,center.z],
        [railT,railH,d,center.x+w/2,b.h+railH/2,center.z]
      ].forEach(([rw,rh,rd,rx,ry,rz])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(rw,rh,rd),trimMat);m.position.set(rx,ry,rz);m.castShadow=true;scene.add(m);});
      b._roofTop=b.h+.75;
    }
    const destination=destinations.find(x=>x.id===b.id);
    if(destination)addLabel(b,destination);
  }

  function addMainGateArchitecture(){
    // A framed entrance and stepped approach give the Main Gate a recognizable 3D silhouette.
    const dark=new THREE.MeshStandardMaterial({color:0x3b5548,roughness:.7});
    const warm=new THREE.MeshStandardMaterial({color:0xd8cfbb,roughness:.82});
    const gold=new THREE.MeshStandardMaterial({color:0xb89442,metalness:.18,roughness:.48});
    const gx=250-W/2, front=560-H/2;
    const portal=new THREE.Mesh(new THREE.BoxGeometry(17,12,1.2),dark);
    portal.position.set(gx,10.8,front+1.1);portal.castShadow=true;scene.add(portal);
    const lintel=new THREE.Mesh(new THREE.BoxGeometry(22,2.2,2.1),gold);
    lintel.position.set(gx,18.2,front+1.1);scene.add(lintel);
    [-12,12].forEach(dx=>{
      const col=new THREE.Mesh(new THREE.BoxGeometry(2.5,14,2.5),warm);
      col.position.set(gx+dx,8.5,front+1.4);col.castShadow=true;scene.add(col);
    });
    // Three shallow entrance steps extend from the gate toward the south edge of the site board.
    [0,1,2].forEach(i=>{
      const step=new THREE.Mesh(new THREE.BoxGeometry(34,1.8,5.8),warm);
      step.position.set(gx,-.1,front+5+i*5.2);step.receiveShadow=true;scene.add(step);
    });
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(26,1.6,7),warm);
    canopy.position.set(gx,21.7,front-.8);canopy.castShadow=true;scene.add(canopy);
  }

  function addRizalStatue(){
    const loader=new THREE.TextureLoader();
    loader.load('assets/rizal-statue-cutout.png',texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),12);
      texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
      const shadow=new THREE.Mesh(
        new THREE.CircleGeometry(7.2,40),
        new THREE.MeshBasicMaterial({color:0x3c453e,transparent:true,opacity:.19,depthWrite:false})
      );
      shadow.rotation.x=-Math.PI/2;shadow.position.copy(world(274,232,3.53));scene.add(shadow);
      // Camera-facing transparent sculpture cutout retains the real Rizal statue details supplied by GNC.
      const statue=new THREE.Sprite(new THREE.SpriteMaterial({
        map:texture,color:0xffffff,transparent:true,alphaTest:.025,depthTest:true,depthWrite:false
      }));
      const statueHeight=29,statueWidth=statueHeight*(623/1741);
      statue.center.set(.5,0);
      statue.scale.set(statueWidth,statueHeight,1);
      statue.position.copy(world(274,232,3.55));
      statue.renderOrder=8;scene.add(statue);
      const plaque=new THREE.Sprite(new THREE.SpriteMaterial({
        map:labelTexture('RIZAL MONUMENT','#17603e'),transparent:true,depthTest:true,depthWrite:false
      }));
      plaque.scale.set(39,7.8,1);
      plaque.position.copy(world(274,232,37.2));
      plaque.renderOrder=9;scene.add(plaque);
    },undefined,error=>console.error('Rizal statue texture could not load',error));
  }
  function addGosecoCourtDetails(){
    // The open Goseco courtyard is the Rizal monument court between Goseco and Beta.
    const floor=new THREE.Mesh(new THREE.BoxGeometry(80,1.8,57),
      new THREE.MeshStandardMaterial({color:0x9b9b93,roughness:.94}));
    floor.position.copy(world(275,232,2.0));floor.receiveShadow=true;scene.add(floor);
    const inset=new THREE.Mesh(new THREE.BoxGeometry(20,.7,15),
      new THREE.MeshStandardMaterial({color:0x777970,roughness:.9}));
    inset.position.copy(world(274,232,3.15));inset.receiveShadow=true;scene.add(inset);
    addRizalStatue();
  }
  function makeGroundTexture(image){
    const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
    const ctx=c.getContext('2d');ctx.fillStyle='#fbfaf6';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0);
    const sx=c.width/W,sy=c.height/H;
    // Remove the flat plan's building footprints from the ground; their roof details are remade as elevated textured roofs.
    const masks=[
      [7,0,320,119],[7,116,69,239],[66,118,219,168],[88,166,184,237],
      [216,153,320,204],[216,202,235,264],[316,202,350,300],[235,263,320,300],
      [40,237,134,281],[130,242,218,280],[160,276,200,378],[157,374,200,481],
      [211,297,295,480],[303,286,350,482],[132,500,210,551],[207,475,292,562],[290,486,350,560]
    ];
    ctx.fillStyle='#fbfaf6';masks.forEach(([x1,y1,x2,y2])=>ctx.fillRect(x1*sx,y1*sy,(x2-x1)*sx,(y2-y1)*sy));
    // Campus perimeter stripe and subtle pedestrian-court guide lines.
    ctx.fillStyle='#173f2d';ctx.fillRect(0,c.height-12,c.width,12);
    return new THREE.CanvasTexture(c);
  }
  function addParkingStripeLines(){
    const paint=new THREE.MeshStandardMaterial({color:0xe9e4ea,roughness:.9});
    const line=(x,z,w,d,y=6.05)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.18,d),paint);
      mesh.position.copy(world(x+w/2,z+d/2,y));mesh.receiveShadow=true;scene.add(mesh);
    };
    // Parking 1: two clean rows of individual stalls divided by a central drive aisle.
    for(let x=20;x<=300;x+=15){line(x,17,.72,29);line(x,72,.72,29);}
    line(14,56,298,.55,6.0);
    // Parking 2: horizontal bays follow the narrow north-south lot.
    for(let z=127;z<=226;z+=14)line(15,z,45,.72,6.0);
  }

  let routeAnim=[];
  function clearRoute(){
    if(!routeGroup)return;
    const geometries=new Set(),materials=new Set();
    routeGroup.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>materials.add(m));else materials.add(o.material);}});
    scene.remove(routeGroup);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    routeGroup=new THREE.Group();scene.add(routeGroup);routeSegments=[];movingArrows=[];
  }
  function createRouteSegment(a,b,material,radius,record=false,heightA=3.2,heightB=3.2){
    const start=world(a[0],a[1],heightA),end=world(b[0],b[1],heightB),delta=end.clone().sub(start),length=delta.length();
    if(length<.1)return;
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,12),material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
    mesh.castShadow=false;routeGroup.add(mesh);
    if(record)routeSegments.push({a:start,b:end,length,dir:delta.normalize()});
  }
  function positionOnRoute(distance){
    let left=distance;
    for(const s of routeSegments){if(left<=s.length){return {point:s.a.clone().lerp(s.b,s.length?left/s.length:0),dir:s.dir};}left-=s.length;}
    const last=routeSegments[routeSegments.length-1];return last?{point:last.b.clone(),dir:last.dir}:{point:new THREE.Vector3(),dir:new THREE.Vector3(0,0,1)};
  }
  function draw3dRoute(d){
    if(!routeGroup||!renderer)return;clearRoute();
    if(!d||!routes3d[d.id])return;
    const pts=routes3d[d.id];
    const under=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62});
    const red=new THREE.MeshStandardMaterial({color:0xd63f39,roughness:.56,emissive:0x210000});
    // Constant elevation and 90-degree waypoint segments keep the route on walkable ground.
    const pathHeight=1.4;
    for(let i=0;i<pts.length-1;i++){
      createRouteSegment(pts[i],pts[i+1],under,1.15,false,pathHeight,pathHeight);
      createRouteSegment(pts[i],pts[i+1],red,.78,true,pathHeight+.48,pathHeight+.48);
    }
    const jointWhite=new THREE.Mesh(new THREE.SphereGeometry(1.15,12,10),under);
    const jointRed=new THREE.Mesh(new THREE.SphereGeometry(.78,12,10),red);
    pts.forEach(p=>{
      const w=jointWhite.clone();w.position.copy(world(p[0],p[1],pathHeight));routeGroup.add(w);
      const r=jointRed.clone();r.position.copy(world(p[0],p[1],pathHeight+.48));routeGroup.add(r);
    });
    const arrowMat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthWrite:false});
    const arrowGeo=new THREE.ConeGeometry(.68,2.5,3);
    const total=routeSegments.reduce((sum,item)=>sum+item.length,0);
    const arrowCount=Math.max(4,Math.floor(total/31));
    for(let i=0;i<arrowCount;i++){
      const arrow=new THREE.Mesh(arrowGeo,arrowMat);arrow.renderOrder=9;routeGroup.add(arrow);movingArrows.push(arrow);
    }
    routeAnim={total,count:arrowCount,start:performance.now(),speed:13.5};
    const start=world(GATE[0],GATE[1],pathHeight+1.1),end=world(pts[pts.length-1][0],pts[pts.length-1][1],pathHeight+1.1);
    const startPin=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,.8,20),new THREE.MeshStandardMaterial({color:0x145b3b,roughness:.45}));
    startPin.position.copy(start);routeGroup.add(startPin);
    const endPin=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,.8,20),new THREE.MeshStandardMaterial({color:0xd9a927,roughness:.48}));
    endPin.position.copy(end);routeGroup.add(endPin);
    routeAnim.start=performance.now();
  }

  let cameraTween=null,threePromise=null;
  function updateCameraAspect(){
    if(!camera||!renderer)return;
    camera.aspect=Math.max(.35,viewport.clientWidth/Math.max(1,viewport.clientHeight));camera.updateProjectionMatrix();
  }
  function reset3d(){
    if(!camera||!controls)return;
    const to=new THREE.Vector3(95,555,500),targetTo=new THREE.Vector3(0,0,0);
    cameraTween={from:camera.position.clone(),to,targetFrom:controls.target.clone(),targetTo,fromFov:camera.fov,toFov:31,started:performance.now(),duration:850};
  }
  function focus3d(d){
    if(!camera||!controls)return;
    const point=world(d.focus[0],d.focus[1],0);
    const building=BUILDINGS.find(b=>b.id===d.id);
    const roofHeight=building?(building._roofTop??building.h):16;
    const targetHeight=Math.max(12,Math.min(34,roofHeight-2));
    const targetTo=new THREE.Vector3(point.x,targetHeight,point.z);
    const [x1,z1,x2,z2]=building?.rect||d.footprint;
    const span=Math.max(x2-x1,z2-z1);
    const distance=Math.min(660,Math.max(310,span*1.9));
    const offset=new THREE.Vector3(distance*.22,distance*.63,distance*.73);
    cameraTween={from:camera.position.clone(),to:targetTo.clone().add(offset),targetFrom:controls.target.clone(),targetTo,fromFov:camera.fov,toFov:30,started:performance.now(),duration:900};
  }
  async function init3d(){
    if(threePromise)return threePromise;
    threePromise=(async()=>{
      // Import Three.js only when 3D is selected. The 2D directory remains operational
      // even if the CDN is unavailable or the visitor's browser does not support WebGL.
      const [threeModule,controlsModule]=await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js')
      ]);
      THREE=threeModule;OrbitControls=controlsModule.OrbitControls;
      const loader=new THREE.TextureLoader();
      const tex=await new Promise((resolve,reject)=>loader.load('assets/gnc-campus-map-reference-hd.png',resolve,undefined,reject));
      const image=tex.image;tex.colorSpace=THREE.SRGBColorSpace;
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2.25));renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      scene=new THREE.Scene();scene.background=new THREE.Color('#e4ece6');
      camera=new THREE.PerspectiveCamera(31,1,.1,5000);camera.position.set(95,555,500);
      controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,0,0);controls.minPolarAngle=.24;controls.maxPolarAngle=1.28;controls.minDistance=260;controls.maxDistance=1600;controls.enablePan=true;
      scene.add(new THREE.HemisphereLight(0xffffff,0x6f7d72,1.25));
      const sun=new THREE.DirectionalLight(0xfff4df,1.55);sun.position.set(-330,820,420);sun.castShadow=true;sun.shadow.mapSize.set(3072,3072);sun.shadow.camera.left=-300;sun.shadow.camera.right=300;sun.shadow.camera.top=340;sun.shadow.camera.bottom=-340;sun.shadow.camera.near=10;sun.shadow.camera.far=1800;sun.shadow.bias=-.00025;sun.shadow.radius=3;scene.add(sun);
      const fill=new THREE.DirectionalLight(0xdce9ff,.34);fill.position.set(360,360,-300);scene.add(fill);
      // White architectural site board.
      const board=new THREE.Mesh(new THREE.BoxGeometry(W+34,8,H+34),new THREE.MeshStandardMaterial({color:0xf3f1e9,roughness:.95}));board.position.set(0,-5,0);board.receiveShadow=true;board.castShadow=true;scene.add(board);
      const groundTex=makeGroundTexture(image);groundTex.colorSpace=THREE.SRGBColorSpace;
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({map:groundTex,color:0xffffff,roughness:1,metalness:0}));ground.rotation.x=-Math.PI/2;ground.position.y=0;ground.receiveShadow=true;scene.add(ground);
      groundGroup=new THREE.Group();scene.add(groundGroup);
      BUILDINGS.forEach(b=>addBuilding(image,b));
      addParkingStripeLines();
      addMainGateArchitecture();addGosecoCourtDetails();
      routeGroup=new THREE.Group();scene.add(routeGroup);
      // Destination hit planes sit slightly above each roof, so clicks work even on small mobile screens.
      raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
      const hitMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false,side:THREE.DoubleSide});
      hotspots=directoryDestinations.map(d=>{
        const [x1,y1,x2,y2]=d.footprint;
        const model=BUILDINGS.find(b=>b.id===d.id);
        const roofTop=model?(model._roofTop??(model.roofStyle==='hip'?model.h+.55+roofRiseFor(model):model.h+.75)):6;
        const hit=new THREE.Mesh(new THREE.PlaneGeometry(x2-x1,y2-y1),hitMat);hit.rotation.x=-Math.PI/2;hit.position.copy(world((x1+x2)/2,(y1+y2)/2,roofTop+3));hit.userData.destination=d;scene.add(hit);return hit;
      });
      let pointerDown=null;
      canvas.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY};});
      canvas.addEventListener('pointerup',e=>{
        if(!pointerDown)return;const moved=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y);pointerDown=null;if(moved>5)return;
        const rect=canvas.getBoundingClientRect();pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
        raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(hotspots,false);if(hits.length)select(hits[0].object.userData.destination.id);
      });
      resizeObserver=new ResizeObserver(()=>{updateCameraAspect();renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);});resizeObserver.observe(viewport);
      renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);
      function tick(now){
        requestAnimationFrame(tick);
        if(cameraTween){
          const q=Math.min(1,(now-cameraTween.started)/cameraTween.duration),t=1-Math.pow(1-q,3);
          camera.position.lerpVectors(cameraTween.from,cameraTween.to,t);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,t);
          camera.fov=THREE.MathUtils.lerp(cameraTween.fromFov,cameraTween.toFov,t);camera.updateProjectionMatrix();
          if(q>=1)cameraTween=null;
        }
        controls.enabled=!cameraTween&&currentView==='3d';if(currentView==='3d')controls.update();
        if(movingArrows.length&&routeSegments.length){
          movingArrows.forEach((a,i)=>{
            const distance=(i/movingArrows.length*routeAnim.total+(now-routeAnim.start)*routeAnim.speed/1000)%routeAnim.total;
            const p=positionOnRoute(distance);a.position.copy(p.point);a.position.y+=.35;
            a.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),p.dir);
          });
        }
        if(currentView==='3d')renderer.render(scene,camera);
      }
      requestAnimationFrame(tick);
      draw3dRoute(selected);
      return true;
    })().catch(err=>{
      console.error('3D campus initialization failed',err);
      loading.textContent='3D map could not start. The 2D map is still available.';
      loading.classList.add('campus-3d-load-error');
      if(renderer){renderer.dispose();renderer=null;}return false;
    });
    return threePromise;
  }
  function setView(view){
    currentView=view==='3d'&&renderer?'3d':'2d';
    viewport.classList.toggle('map-view-2d',currentView==='2d');viewport.classList.toggle('map-view-3d',currentView==='3d');
    stage2d.hidden=currentView!=='2d';canvas.hidden=currentView!=='3d';
    document.querySelectorAll('[data-campus-view]').forEach(b=>{const on=b.dataset.campusView===currentView;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});
    $('campusMapHintOverlay').textContent=currentView==='3d'?'3D campus · drag to orbit · scroll to zoom':'2D campus · drag to pan · scroll to zoom';
    if(currentView==='3d'&&renderer){renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);if(selected)focus3d(selected);else reset3d();}
    else reset2d();
  }
  async function activateView(view){
    if(view==='3d'&&!renderer){
      loading.textContent='Building the 3D campus…';loading.classList.remove('is-hidden','campus-3d-load-error');
      const ok=await init3d();loading.classList.add('is-hidden');
      if(!ok){document.querySelector('[data-campus-view="3d"]')?.setAttribute('disabled','disabled');setView('2d');return;}
    }
    setView(view);
  }
  document.querySelectorAll('[data-campus-view]').forEach(b=>b.addEventListener('click',()=>void activateView(b.dataset.campusView)));
  stage2d.hidden=false;canvas.hidden=true;loading.classList.add('is-hidden');setView('2d');select(null,false);
})();
