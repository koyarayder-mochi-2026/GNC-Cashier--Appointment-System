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
    {id:'beta',name:'Beta Building',code:'BETA',color:'#287b42',focus:[218,331],footprint:[204,285,232,377],description:'Beta Building — cashier and administration offices, positioned behind the basketball gym. Follow the west-side walkway from the Main Gate.'},
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
    beta:      [[252,548],[205,548],[205,480],[205,420],[205,385],[218,385]],
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
  // procedural architectural roof materials, hipped roof geometry, multi-floor window bays,
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
    {id:'beta',name:'Beta Building',rect:[204,285,232,377],h:37,wall:'#15583a',roof:[204,285,232,377],color:'#d5d3c4',roofStyle:'cashier'},
    {id:'banzali',name:'Banzali Hall',rect:[306,289,346,478],h:37,wall:'#853d3d',roof:[306,289,346,478],color:'#d78c8b',roofStyle:'flat'},
    {id:'gateLeft',name:'',rect:[136,502,198,548],h:17,wall:'#6f6c5d',roof:[136,502,198,548],color:'#e5ddcb',roofStyle:'hip'},
    {id:'gate',name:'Main Gate',rect:[210,477,290,560],h:21,wall:'#6a6251',roof:[210,477,290,560],color:'#e8dfcc',roofStyle:'hip',type:'portico'},
    {id:'gateRight',name:'',rect:[292,488,348,556],h:18,wall:'#6f6c5d',roof:[292,488,348,556],color:'#e7dfcf',roofStyle:'hip'}
  ];

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
    const roofMat=new THREE.MeshStandardMaterial({color:b.roofColor||b.color||0xd9d2c2,roughness:.88,metalness:.015});
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
  function addCashierBuilding(b){
    // Beta Building is the enclosed cashier/administration block, set behind
    // (north-west of) the separate open-sided gym and its Philippine-flag canopy.
    const [x1,z1,x2,z2]=b.rect,w=x2-x1,d=z2-z1,cx=(x1+x2)/2,cz=(z1+z2)/2;
    const green=new THREE.MeshStandardMaterial({color:0x15583a,roughness:.82,metalness:.015});
    const greenDark=new THREE.MeshStandardMaterial({color:0x0d3d29,roughness:.86});
    const roofGreen=new THREE.MeshStandardMaterial({color:0x1b6842,roughness:.78,metalness:.025});
    const cream=new THREE.MeshStandardMaterial({color:0xe7e0d0,roughness:.84});
    const trim=new THREE.MeshStandardMaterial({color:0xc9c0ab,roughness:.76});
    const darkGlass=new THREE.MeshStandardMaterial({color:0x173d50,roughness:.28,metalness:.16,emissive:0x07151c,emissiveIntensity:.1});
    const brass=new THREE.MeshStandardMaterial({color:0xb79856,roughness:.42,metalness:.24});
    const box=(bw,bh,bd,x,z,y,mat,opts={})=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),mat);
      m.position.copy(world(x,z,y));m.castShadow=opts.castShadow!==false;m.receiveShadow=opts.receiveShadow!==false;scene.add(m);return m;
    };
    // Solid three-storey body with a green rendered facade (not a pasted image texture).
    box(w,b.h,d,cx,cz,b.h/2,green);
    // Cream floor bands and darker plinth make each storey legible at campus scale.
    box(w+1.6,2,d+1.6,cx,cz,2,greenDark);
    for(let floor=1;floor<=2;floor++){
      const y=b.h*floor/3;
      box(w+1.0,.72,d+1.0,cx,cz,y,trim,{castShadow:false});
    }
    // Beta is the enclosed cashier building: its entire rooftop is school green,
    // not a Philippine-flag panel. The flag belongs only to the separate gym canopy.
    box(w+3,1.9,d+3,cx,cz,b.h+.5,cream);
    const panelY=b.h+1.55, panelW=w-7, panelD=d-9;
    box(panelW,.58,panelD,cx,cz,panelY,roofGreen);
    // A restrained darker-green center expansion joint and perimeter coping finish the roof.
    box(.42,.16,panelD-1,cx,cz,panelY+.38,greenDark,{castShadow:false});
    // Raised cream perimeter coping; the green roof panel sits horizontally on the cap.
    const copingY=panelY+.45;
    box(w+1,.8,1.6,cx,z1+1,copingY,cream);
    box(w+1,.8,1.6,cx,z2-1,copingY,cream);
    box(1.6,.8,d+1,cx-w/2+1,cz,copingY,cream);
    box(1.6,.8,d+1,cx+w/2-1,cz,copingY,cream);
    // Side elevations: three floors of framed, blue-tinted windows with proper sill depth.
    const sideFrame=new THREE.MeshStandardMaterial({color:0xe2ddcf,roughness:.72});
    const sideXs=[x1-.66,x2+.66];
    const windowZ=[z1+17,cz,z2-17];
    for(const sx of sideXs){
      for(let floor=0;floor<3;floor++){
        const y=8+floor*9.3;
        for(const zz of windowZ){
          box(1.15,6.1,11.4,sx,zz,y,sideFrame);
          box(1.28,4.7,9.8,sx+(sx<x1?-.22:.22),zz,y,darkGlass);
          box(2.0,.65,12.2,sx+(sx<x1?-.25:.25),zz,y-3.35,trim);
          box(2.0,.5,12.2,sx+(sx<x1?-.25:.25),zz,y+3.25,trim,{castShadow:false});
        }
      }
    }
    // Front elevation: a recessed main entrance and three distinct cashier service windows.
    const frontZ=z2+.78;
    box(w-7,2.0,1.6,cx,frontZ,b.h*.78,greenDark);
    const serviceY=b.h*.48;
    [-12,0,12].forEach((offset,index)=>{
      const x=cx+offset;
      box(10.2,7.4,1.35,x,frontZ,serviceY,cream);
      box(8.6,5.7,1.5,x,frontZ+.18,serviceY,darkGlass);
      box(10.8,1.0,3.1,x,frontZ+1.15,serviceY-4.0,brass);
      // Subtle counter sill and small transaction slot below each pane.
      box(2.1,.65,.45,x,frontZ+1.55,serviceY-1.2,cream,{castShadow:false});
    });
    const doorZ=frontZ+1.05;
    box(9.2,16,1.8,cx,doorZ,8.4,cream);
    box(6.8,13.5,2.0,cx,doorZ+.2,8.5,darkGlass);
    box(10.6,1.0,5.0,cx,frontZ+3,1.2,cream);
    // Small covered cashier entrance with two square columns and a green canopy.
    box(22,1.5,8,cx,z2+6,1.3,cream);
    box(22,1.15,5,cx,z2+3.4,14.6,green);
    [-9,9].forEach(dx=>box(1.5,13.0,1.5,cx+dx,z2+4.3,7.2,cream));
    // Physical front sign, mounted on the facade rather than floating over the roof.
    box(34,7.0,1.4,cx,frontZ+1.0,b.h*.82,greenDark);
    const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture('BETA BUILDING · CASHIER','#17603e'),transparent:true,depthTest:true,depthWrite:false}));
    sign.scale.set(33,6.5,1);sign.position.copy(world(cx,frontZ+1.85,b.h*.82));sign.renderOrder=12;scene.add(sign);
    b._roofTop=b.h+2.0;
  }

  function addBasketballGym(){
    // Separate open-sided gym. Beta Building sits behind it toward the north-west.
    // The flag canopy is procedural geometry + generated material, never a pasted screenshot.
    const x1=251.5,z1=300,x2=302.5,z2=474,w=x2-x1,d=z2-z1,cx=(x1+x2)/2,cz=(z1+z2)/2;
    const roofEdgeY=56.5;
    const materials={
      apron:new THREE.MeshStandardMaterial({color:0xa83c2a,roughness:.9}),
      court:new THREE.MeshStandardMaterial({color:0x123e71,roughness:.78}),
      green:new THREE.MeshStandardMaterial({color:0x15583a,roughness:.78}),
      cream:new THREE.MeshStandardMaterial({color:0xe8e0cf,roughness:.84}),
      steel:new THREE.MeshStandardMaterial({color:0x9da9a0,roughness:.42,metalness:.28}),
      darkSteel:new THREE.MeshStandardMaterial({color:0x30443c,roughness:.55,metalness:.18}),
      line:new THREE.MeshStandardMaterial({color:0xf7f1df,roughness:.7}),
      backboard:new THREE.MeshStandardMaterial({color:0xdce7e5,roughness:.3,metalness:.12,transparent:true,opacity:.94}),
      orange:new THREE.MeshStandardMaterial({color:0xe87527,roughness:.45,metalness:.08})
    };
    const box=(bw,bh,bd,x,z,y,mat,opts={})=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),mat);
      m.position.copy(world(x,z,y));m.castShadow=opts.castShadow!==false;m.receiveShadow=opts.receiveShadow!==false;scene.add(m);return m;
    };
    // Low perimeter plinth, red apron and a blue court with crisp painted markings.
    box(w+2,2,d+2,cx,cz,1.1,materials.cream);
    box(w,1.0,d,cx,cz,2.45,materials.apron);
    // Keep a wider west-side spectator strip for the stepped bench seating.
    const courtX1=x1+12,courtX2=x2-4,courtZ1=z1+46,courtZ2=z2-5;
    const courtCx=(courtX1+courtX2)/2,courtCz=(courtZ1+courtZ2)/2,courtW=courtX2-courtX1,courtD=courtZ2-courtZ1;
    box(courtW,.65,courtD,courtCx,courtCz,3.25,materials.court);
    const paintY=3.66;
    const line=(ax,az,bx,bz,thick=.55)=>{
      if(Math.abs(az-bz)<.001) box(Math.abs(bx-ax),.16,thick,(ax+bx)/2,az,paintY,materials.line,{castShadow:false});
      else if(Math.abs(ax-bx)<.001) box(thick,.16,Math.abs(bz-az),ax,(az+bz)/2,paintY,materials.line,{castShadow:false});
    };
    line(courtX1,courtZ1,courtX2,courtZ1);line(courtX1,courtZ2,courtX2,courtZ2);
    line(courtX1,courtZ1,courtX1,courtZ2);line(courtX2,courtZ1,courtX2,courtZ2);
    line(courtX1,courtCz,courtX2,courtCz,.62);
    const circleMat=materials.line;
    const circle=new THREE.Mesh(new THREE.TorusGeometry(9,.28,8,64),circleMat);
    circle.rotation.x=Math.PI/2;circle.position.copy(world(courtCx,courtCz,paintY+.1));circle.receiveShadow=true;scene.add(circle);
    // Painted keys, free-throw circles and restricted arcs at both basket ends.
    const keyW=18,keyD=24;
    [courtZ1+3,courtZ2-keyD-3].forEach(kz=>{
      line(courtCx-keyW/2,kz,courtCx+keyW/2,kz,.5);
      line(courtCx-keyW/2,kz,courtCx-keyW/2,kz+keyD,.5);
      line(courtCx+keyW/2,kz,courtCx+keyW/2,kz+keyD,.5);
      const ft=new THREE.Mesh(new THREE.TorusGeometry(7,.24,7,48),circleMat);
      ft.rotation.x=Math.PI/2;ft.position.copy(world(courtCx,kz+keyD,paintY+.1));scene.add(ft);
    });

    // Three-tier spectator benches along the west sideline. These are solid stepped
    // seating platforms with timber seat boards and backs, facing east toward the court.
    // There is deliberately no flag decal or flag-shaped floor graphic on the court.
    const benchConcrete=new THREE.MeshStandardMaterial({color:0xb8b5a8,roughness:.9});
    const benchWood=new THREE.MeshStandardMaterial({color:0x6d513b,roughness:.78});
    const benchEdge=new THREE.MeshStandardMaterial({color:0x174b36,roughness:.78});
    const benchZ=(courtZ1+courtZ2)/2,benchLength=Math.min(78,courtZ2-courtZ1-16);
    // Spectator bleachers face EAST toward the playing court. The front/lowest row is
    // nearest the court; each rear row steps UP and WEST so no seat faces away from play.
    const benchRows=[
      {x:x1+10.25,seatY:5.15}, // front row, nearest the east-side court edge
      {x:x1+7.35,seatY:7.65},  // middle row
      {x:x1+4.45,seatY:10.15}  // rear/top row, farthest from the court
    ];
    benchRows.forEach((row,index)=>{
      const seatWidth=2.55;
      const supportH=row.seatY-3.7;
      box(seatWidth,supportH,benchLength,row.x,benchZ,3.7+supportH/2,benchConcrete);
      box(seatWidth+.22,.5,benchLength,row.x+.05,benchZ,row.seatY,benchWood);
      // Individual seat slats run along the spectator row and face the court to the EAST.
      const slatCount=28,slatStep=benchLength/slatCount;
      for(let i=0;i<slatCount;i++){
        const zz=benchZ-benchLength/2+(i+.5)*slatStep;
        box(seatWidth,.12,.22,row.x+.05,zz,row.seatY+.31,benchEdge,{castShadow:false});
      }
      // Backrests sit on the WEST/rear edge; the open seat edge faces the playing court.
      const backX=row.x-seatWidth/2+.12;
      box(.3,1.65,benchLength,backX,benchZ,row.seatY+1.05,benchWood);
      box(.42,.25,benchLength,backX,benchZ,row.seatY+1.92,benchEdge,{castShadow:false});
      // End cheeks anchor each tier and keep the stepped seating structure continuous.
      for(const endZ of [benchZ-benchLength/2,benchZ+benchLength/2]){
        box(seatWidth+.25,Math.max(1.2,supportH),1.0,row.x,endZ,3.7+Math.max(1.2,supportH)/2,benchEdge);
      }
    });
    // A compact three-step access stair enters the seating tiers from the south aisle.
    const benchStepTrim=new THREE.MeshStandardMaterial({color:0xe0dacc,roughness:.82});
    const accessZ=z2-12;
    // Access stair climbs from the east/court side toward the higher west/rear rows.
    for(let step=0;step<3;step++){
      const sx=x1+8.7-step*1.95,stepH=1.25+step*1.25;
      box(1.65,stepH,6.5,sx,accessZ,3.7+stepH/2,benchConcrete);
      box(1.72,.22,6.6,sx,accessZ,3.7+stepH+.11,benchStepTrim);
    }

    // Raised school-event stage at the north end of the gym, beneath the flag canopy.
    // The platform, apron, steps, backdrop, curtains and lectern are separate solid meshes.
    const stageX=courtCx,stageZ=z1+21,stageW=34,stageD=25,stageTop=7.2;
    const stageWood=new THREE.MeshStandardMaterial({color:0x704536,roughness:.82});
    const stageFace=new THREE.MeshStandardMaterial({color:0x8f3b32,roughness:.8});
    const stageTrim=new THREE.MeshStandardMaterial({color:0xe5d7bd,roughness:.7});
    const curtain=new THREE.MeshStandardMaterial({color:0x7e2634,roughness:.9});
    const curtainDark=new THREE.MeshStandardMaterial({color:0x4f1d2b,roughness:.92});
    const stageMetal=new THREE.MeshStandardMaterial({color:0x59675f,roughness:.45,metalness:.3});
    box(stageW,stageTop-2,stageD,stageX,stageZ,stageTop/2,stageWood);
    box(stageW+1.2,1.0,stageD+1.2,stageX,stageZ,stageTop-0.45,stageTrim);
    box(stageW-1.6,.75,1.2,stageX,stageZ+stageD/2-.5,stageTop-1.1,stageFace);
    // Three broad, shallow steps face the basketball court.
    for(let i=0;i<3;i++){
      const depth=3.6,width=stageW-7,y=1.4+i*1.75;
      box(width,y,depth,stageX,stageZ+stageD/2+2.0+i*2.6,y/2,stageTrim);
      box(width,.32,depth+.2,stageX,stageZ+stageD/2+2.0+i*2.6,y+.08,stageWood,{castShadow:false});
    }
    // Backdrop wall and folded curtain panels; the gym remains open on its long sides.
    const backZ=z1+7.2;
    box(stageW+2,17,1.8,stageX,backZ,16.5,stageMetal);
    box(stageW-2,13.8,.8,stageX,backZ+1.2,16.2,curtainDark);
    box(7,14,1.0,stageX-stageW/2+4,backZ+1.9,16.3,curtain);
    box(7,14,1.0,stageX+stageW/2-4,backZ+1.9,16.3,curtain);
    for(let i=0;i<12;i++){
      const x=stageX-stageW/2+7+i*1.75;
      box(.8,13.6,1.0,x,backZ+1.7,16.3,i%2?curtain:curtainDark);
    }
    // Header fascia with a readable stage title, plus modest side wing trims.
    box(stageW+3,2.2,2.4,stageX,backZ+1.0,25.6,stageTrim);
    const stageSign=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture('GNCI SCHOOL STAGE','#17603e'),transparent:true,depthTest:true,depthWrite:false}));
    stageSign.scale.set(25,5,1);stageSign.position.copy(world(stageX,backZ+2.25,26.2));stageSign.renderOrder=11;scene.add(stageSign);
    [-1,1].forEach(side=>{
      box(2.2,16,2.4,stageX+side*(stageW/2+1),backZ+1.1,16.5,stageTrim);
      box(2.6,1.2,2.8,stageX+side*(stageW/2+1),stageZ,stageTop-.5,stageFace);
    });
    // A simple lectern and microphone complete the event setup without crowding the stage.
    box(3.4,4.6,2.6,stageX+9,stageZ+2,stageTop+1.8,stageWood);
    box(4.4,.55,3.4,stageX+9,stageZ+2,stageTop+4.2,stageTrim);
    const mic=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,3.2,10),stageMetal);
    mic.position.copy(world(stageX+9,stageZ+2,stageTop+5.8));mic.castShadow=true;scene.add(mic);
    // Basketball hoops at both ends: vertical backboard, support arm and a raised orange rim.
    [courtZ1+7,courtZ2-7].forEach((boardZ,index)=>{
      const inward=index===0?1:-1;
      box(9,6.2,.78,courtCx,boardZ,13.3,materials.backboard);
      box(.65,7.8,.65,courtCx,boardZ-inward*2.6,9.1,materials.steel);
      box(5.8,.5,.5,courtCx,boardZ-inward*1.1,11.2,materials.darkSteel);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(2.15,.26,8,40),materials.orange);
      rim.rotation.x=Math.PI/2;rim.position.copy(world(courtCx,boardZ+inward*2.2,10.6));rim.castShadow=true;scene.add(rim);
      box(5.4,.24,.24,courtCx,boardZ+inward*2.2,9.3,materials.line,{castShadow:false});
    });
    // Open-sided gym columns and longitudinal edge beams.
    const postXs=[x1+3,x2-3];
    const postZs=[z1+7,z1+42,z1+78,z1+114,z1+150,z2-7];
    postXs.forEach(px=>postZs.forEach(pz=>{
      box(2.3,roofEdgeY-1.4,2.3,px,pz,(roofEdgeY-1.4)/2,materials.green);
      box(3.6,1.1,3.6,px,pz,roofEdgeY-1.15,materials.cream);
      box(3.0,1.0,3.0,px,pz,3.0,materials.cream);
    }));
    box(2.0,2.0,d+5,x1+3,cz,roofEdgeY-1.5,materials.green);
    box(2.0,2.0,d+5,x2-3,cz,roofEdgeY-1.5,materials.green);

    // Procedurally draw a Philippine flag for the arched canopy. This is a generated
    // material on curved geometry, so the flag follows the roof curvature in 3D.
    // Flag canopy orientation follows the supplied reference: blue on the LEFT,
    // red on the RIGHT, with the white triangle and sun/stars at the near/south end.
    // Texture u runs west-to-east; texture v runs north-to-south along the canopy.
    const flagCanvas=document.createElement('canvas');flagCanvas.width=1024;flagCanvas.height=3072;
    const ctx=flagCanvas.getContext('2d');
    ctx.fillStyle='#0038a8';ctx.fillRect(0,0,512,3072);
    ctx.fillStyle='#c8102e';ctx.fillRect(512,0,512,3072);
    // White hoist triangle: apex points toward the far end; its broad base is at the near end.
    ctx.fillStyle='#fffdf4';ctx.beginPath();ctx.moveTo(512,1500);ctx.lineTo(0,3072);ctx.lineTo(1024,3072);ctx.closePath();ctx.fill();
    const sunX=512,sunY=2360;
    ctx.strokeStyle='#e6ae24';ctx.lineWidth=25;ctx.lineCap='round';
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(sunX+Math.cos(a)*68,sunY+Math.sin(a)*68);ctx.lineTo(sunX+Math.cos(a)*155,sunY+Math.sin(a)*155);ctx.stroke();}
    ctx.fillStyle='#efb72f';ctx.beginPath();ctx.arc(sunX,sunY,61,0,Math.PI*2);ctx.fill();
    function star(cx0,cy0,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.42:r;const px=cx0+Math.cos(a)*rr,py=cy0+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
    ctx.fillStyle='#efb72f';star(512,1555,43);star(128,2785,48);star(896,2785,48);
    // Subtle longitudinal fabric seams, kept low contrast so the national emblem stays clear.
    ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=4;
    for(let x=96;x<1024;x+=128){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,3072);ctx.stroke();}
    const flagTexture=new THREE.CanvasTexture(flagCanvas);flagTexture.flipY=true;flagTexture.colorSpace=THREE.SRGBColorSpace;flagTexture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),12);flagTexture.minFilter=THREE.LinearMipmapLinearFilter;flagTexture.magFilter=THREE.LinearFilter;
    const roofX1=x1-1.5,roofX2=x2+1.5,roofZ1=z1-2,roofZ2=z2-1,roofY=roofEdgeY;
    const across=32,along=64,positions=[],uvs=[],indices=[];
    const roofHeight=(u,v)=>roofY+7.2*(1-Math.pow((u-.5)*2,2))+.9*Math.sin(v*Math.PI);
    for(let j=0;j<=along;j++){
      const v=j/along;
      for(let i=0;i<=across;i++){
        const u=i/across,x=roofX1+(roofX2-roofX1)*u,z=roofZ1+(roofZ2-roofZ1)*v,y=roofHeight(u,v);
        const p=world(x,z,y);positions.push(p.x,p.y,p.z);uvs.push(u,1-v);
        if(i<across&&j<along){const a=j*(across+1)+i,b=a+1,c=a+(across+1),d=c+1;indices.push(a,c,b,b,c,d);}
      }
    }
    const canopyGeometry=new THREE.BufferGeometry();
    canopyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    canopyGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));canopyGeometry.setIndex(indices);canopyGeometry.computeVertexNormals();
    const canopyMat=new THREE.MeshStandardMaterial({map:flagTexture,roughness:.82,metalness:.015,side:THREE.FrontSide});
    const canopy=new THREE.Mesh(canopyGeometry,canopyMat);canopy.castShadow=true;canopy.receiveShadow=true;canopy.renderOrder=4;scene.add(canopy);
    // The flag is an exterior roof finish, never a floor graphic. From inside the gym,
    // visitors see a plain warm soffit instead of a mirrored flag on the underside.
    const soffitPositions=positions.map((value,index)=>index%3===1?value-1.45:value);
    const soffitGeometry=new THREE.BufferGeometry();
    soffitGeometry.setAttribute('position',new THREE.Float32BufferAttribute(soffitPositions,3));
    soffitGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    soffitGeometry.setIndex(indices);soffitGeometry.computeVertexNormals();
    const soffitMat=new THREE.MeshStandardMaterial({color:0xe8e2d4,roughness:.94,metalness:0,side:THREE.DoubleSide});
    const soffit=new THREE.Mesh(soffitGeometry,soffitMat);soffit.receiveShadow=true;soffit.renderOrder=3;scene.add(soffit);
    // Raised perimeter fascia and underside trusses make the flag unmistakably a roof canopy,
    // not a flag texture lying on the basketball floor.
    const fasciaMat=new THREE.MeshStandardMaterial({color:0xe3ddcf,roughness:.52,metalness:.18});
    const frontFascia=new THREE.Mesh(new THREE.BoxGeometry(roofX2-roofX1+2,1.5,1.8),fasciaMat);
    frontFascia.position.copy(world(cx,roofZ2,roofEdgeY-1.1));frontFascia.castShadow=true;scene.add(frontFascia);
    const rearFascia=new THREE.Mesh(new THREE.BoxGeometry(roofX2-roofX1+2,1.5,1.8),fasciaMat);
    rearFascia.position.copy(world(cx,roofZ1,roofEdgeY-1.1));rearFascia.castShadow=true;scene.add(rearFascia);
    const undersideBeamMat=new THREE.MeshStandardMaterial({color:0x315343,roughness:.64,metalness:.12});
    for(const px of [roofX1+2,roofX2-2]){
      const beam=new THREE.Mesh(new THREE.BoxGeometry(1.8,2.2,roofZ2-roofZ1),undersideBeamMat);
      beam.position.copy(world(px,(roofZ1+roofZ2)/2,roofEdgeY-3.0));beam.castShadow=true;scene.add(beam);
    }
    // Subtle curved structural ribs follow the canopy, not a flat rectangular slab.
    const ribMat=new THREE.MeshStandardMaterial({color:0x66776e,roughness:.48,metalness:.28});
    for(let j=0;j<=8;j++){
      const v=j/8,z=roofZ1+(roofZ2-roofZ1)*v,pts=[];
      for(let i=0;i<=24;i++){const u=i/24;pts.push(world(roofX1+(roofX2-roofX1)*u,z,roofHeight(u,v)-.35));}
      const curve=new THREE.CatmullRomCurve3(pts);const rib=new THREE.Mesh(new THREE.TubeGeometry(curve,40,.48,8,false),ribMat);rib.castShadow=true;scene.add(rib);
    }
    // Continuous side rails and end bows define a finished canopy silhouette.
    for(const px of [roofX1,roofX2]){
      const pts=[];for(let j=0;j<=32;j++){const v=j/32;pts.push(world(px,roofZ1+(roofZ2-roofZ1)*v,roofHeight(px===roofX1?0:1,v)));}
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),48,.62,8,false),ribMat));
    }
    // Gym name plaque on the southern fascia; the canopy and court remain open-sided.
    box(34,5.2,1.2,cx,z2+1,roofEdgeY-5,materials.green);
    const gymSign=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture('BASKETBALL GYM','#17603e'),transparent:true,depthTest:true,depthWrite:false}));
    gymSign.scale.set(30,5.9,1);gymSign.position.copy(world(cx,z2+1.5,roofEdgeY-4.5));gymSign.renderOrder=10;scene.add(gymSign);
  }

  function addLimlinganPedestrianBridge(){
    // Two real, raised covered pedestrian links visible in the supplied campus plan:
    // (1) the north connector between Tanjangco and Goseco, and
    // (2) the Limlingan-to-Beta side bridge beside Limlingan Hall.
    // The older version placed a narrow span at x=155, z=278..378, where it sat
    // on the wrong side of Limlingan and was visually hidden by nearby geometry.
    const materials={
      deck:new THREE.MeshStandardMaterial({color:0x244f68,roughness:.34,metalness:.22}),
      deckGlass:new THREE.MeshStandardMaterial({color:0x477f98,roughness:.24,metalness:.18,transparent:true,opacity:.58,side:THREE.DoubleSide}),
      sideGlass:new THREE.MeshStandardMaterial({color:0x6e9fb1,roughness:.22,metalness:.16,transparent:true,opacity:.34,side:THREE.DoubleSide,depthWrite:false}),
      steel:new THREE.MeshStandardMaterial({color:0xb9b8ad,roughness:.48,metalness:.34}),
      darkSteel:new THREE.MeshStandardMaterial({color:0x405766,roughness:.58,metalness:.22}),
      roof:new THREE.MeshStandardMaterial({color:0x315e77,roughness:.28,metalness:.16,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false}),
      concrete:new THREE.MeshStandardMaterial({color:0xd4d0c3,roughness:.86})
    };

    function addCoveredSpan({name,axis,fixed,from,to,width,deckY=15.5,roof=true}){
      const length=to-from;
      const center=(from+to)/2;
      const vertical=axis==='z';
      const box=(w,h,d,x,z,y,mat,opts={})=>{
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
        mesh.position.copy(world(x,z,y));
        mesh.castShadow=opts.castShadow!==false;
        mesh.receiveShadow=opts.receiveShadow!==false;
        scene.add(mesh);return mesh;
      };
      const spanWidth=width;
      // Deep, continuous deck and a dark underside beam make the span read as a bridge.
      box(vertical?spanWidth:length,1.8,vertical?length:spanWidth,vertical?fixed:center,vertical?center:fixed,deckY,materials.deck);
      box(vertical?spanWidth+.7:.9,1.0,vertical?.9:spanWidth+.7,vertical?fixed:center,vertical?from:fixed,deckY-.55,materials.darkSteel);
      box(vertical?spanWidth+.7:.9,1.0,vertical?.9:spanWidth+.7,vertical?fixed:center,vertical?to:fixed,deckY-.55,materials.darkSteel);

      // Fine anti-slip deck ribs, not a screenshot texture.
      const ribCount=Math.max(5,Math.floor(length/8));
      for(let i=1;i<ribCount;i++){
        const t=from+(length/ribCount)*i;
        if(vertical) box(spanWidth-.7,.08,.34,fixed,t,deckY+.94,materials.steel,{castShadow:false});
        else box(.34,.08,spanWidth-.7,t,fixed,deckY+.94,materials.steel,{castShadow:false});
      }

      // Segmented translucent balustrade with real mullions and continuous handrails.
      const sideOffset=spanWidth/2-.32;
      const segment=Math.min(10,length/5);
      for(const side of [-1,1]){
        if(vertical){
          box(.62,5.9,length,fixed+side*sideOffset,center,deckY+4.0,materials.sideGlass,{castShadow:false});
          box(.95,.62,length+.5,fixed+side*sideOffset,center,deckY+7.15,materials.steel);
          box(.8,.55,length+.5,fixed+side*sideOffset,center,deckY+1.4,materials.steel);
        }else{
          box(length,5.9,.62,center,fixed+side*sideOffset,deckY+4.0,materials.sideGlass,{castShadow:false});
          box(length+.5,.62,.95,center,fixed+side*sideOffset,deckY+7.15,materials.steel);
          box(length+.5,.55,.8,center,fixed+side*sideOffset,deckY+1.4,materials.steel);
        }
        for(let t=from+segment;t<to-1;t+=segment){
          if(vertical) box(.8,7.3,1.0,fixed+side*sideOffset,t,deckY+4.0,materials.steel);
          else box(1.0,7.3,.8,t,fixed+side*sideOffset,deckY+4.0,materials.steel);
        }
      }

      // Light blue glazed canopy with exposed cross rafters, matching the blue bridge in the references.
      if(roof){
        const roofY=deckY+8.1;
        if(vertical){
          box(spanWidth+1.5,.72,length+1.5,fixed,center,roofY,materials.roof,{castShadow:false});
          for(let z=from+segment;z<to;z+=segment) box(spanWidth+1.8,.58,1.0,fixed,z,roofY+.05,materials.steel);
          [-1,1].forEach(side=>box(.65,.7,length+1.2,fixed+side*(spanWidth/2+.45),center,roofY,materials.darkSteel));
        }else{
          box(length+1.5,.72,spanWidth+1.5,center,fixed,roofY,materials.roof,{castShadow:false});
          for(let x=from+segment;x<to;x+=segment) box(1.0,.58,spanWidth+1.8,x,fixed,roofY+.05,materials.steel);
          [-1,1].forEach(side=>box(length+1.2,.7,.65,center,fixed+side*(spanWidth/2+.45),roofY,materials.darkSteel));
        }
      }

      // Paired concrete piers hold the walkway above the ground plane and cast visible contact shadows.
      const supportStep=vertical?20:20;
      for(let t=from+supportStep/2;t<to-5;t+=supportStep){
        for(const side of [-1,1]){
          const sx=vertical?fixed+side*(spanWidth/2-.65):t;
          const sz=vertical?t:fixed+side*(spanWidth/2-.65);
          const column=new THREE.Mesh(new THREE.BoxGeometry(1.7,deckY-1.1,1.7),materials.concrete);
          column.position.copy(world(sx,sz,(deckY-1.1)/2));column.castShadow=true;column.receiveShadow=true;scene.add(column);
          const cap=new THREE.Mesh(new THREE.BoxGeometry(2.25,.8,2.25),materials.steel);
          cap.position.copy(world(sx,sz,deckY-1.3));cap.castShadow=true;scene.add(cap);
        }
      }

      // Wide end landings visibly meet the adjacent pedestrian approach.
      for(const t of [from,to]){
        if(vertical) box(spanWidth+4,1.35,6,fixed,t,deckY-.1,materials.concrete);
        else box(6,1.35,spanWidth+4,t,fixed,deckY-.1,materials.concrete);
      }
      return {name,axis,fixed,from,to,width:spanWidth,deckY};
    }

    // Main covered passage visible between Tanjangco Hall and Goseco Hall,
    // joining the north end of the Limlingan Hall circulation spine.
    addCoveredSpan({name:'Central covered bridge',axis:'z',fixed:187,from:157,to:242,width:10.5,deckY:15.5,roof:true});

    // Limlingan side bridge: this is the blue narrow structure in the supplied
    // 2D campus plan between Limlingan Hall and Beta Building (not on Limlingan's west side).
    addCoveredSpan({name:'Limlingan Hall bridge',axis:'z',fixed:205,from:315,to:362,width:9.5,deckY:15.5,roof:true});
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
    }else if(b.roofStyle==='cashier'){
      addCashierBuilding(b);
    }else{
      const body=new THREE.Mesh(new THREE.BoxGeometry(w,b.h,d),[sideLight,sideDark,wallMat,sideDark,wallMat,sideDark]);
      body.position.set(center.x,b.h/2,center.z);body.castShadow=true;body.receiveShadow=true;scene.add(body);
    }
    if(b.roofStyle!=='cashier'){addFacadeDetails(b);addWindows(b);}
    if(b.roofStyle==='hip') addHippedRoof(image,b);
    else if(b.roofStyle!=='cashier') {
      const roofMat=b.type==='parking'
        ? new THREE.MeshStandardMaterial({map:makeParkingAsphaltTexture(w,d),color:0xffffff,roughness:.96,metalness:.01,side:THREE.DoubleSide})
        : new THREE.MeshStandardMaterial({color:b.color||0xd8d1c2,roughness:.9,metalness:.015,side:THREE.DoubleSide});
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
    // Remove the flat plan's building footprints from the ground; their roof details are rebuilt as elevated architectural geometry.
    const masks=[
      [7,0,320,119],[7,116,69,239],[66,118,219,168],[88,166,184,237],
      [216,153,320,204],[216,202,235,264],[316,202,350,300],[235,263,320,300],
      [40,237,134,281],[130,242,218,280],[160,276,200,378],[157,374,200,481],
      [207,297,250,395],[249,297,306,480],[303,286,350,482],[132,500,210,551],[207,475,292,562],[290,486,350,560]
    ];
    ctx.fillStyle='#fbfaf6';masks.forEach(([x1,y1,x2,y2])=>ctx.fillRect(x1*sx,y1*sy,(x2-x1)*sx,(y2-y1)*sy));
    // The source illustration contains a large Philippine-flag graphic under the Beta/gym
    // footprint. It is a 2D planning graphic, not campus paving; mask the COMPLETE shared
    // footprint so no fragment can appear on the 3D floor beside or beneath the canopy.
    const fx1=198,fy1=278,fx2=312,fy2=486;
    ctx.fillStyle='#e9e6dd';
    ctx.fillRect(fx1*sx,fy1*sy,(fx2-fx1)*sx,(fy2-fy1)*sy);
    // Fine concrete joints give the newly exposed circulation apron a deliberate finish.
    ctx.strokeStyle='rgba(112,119,108,.12)';ctx.lineWidth=Math.max(1,sx*.22);
    for(let x=fx1+8;x<fx2;x+=12){ctx.beginPath();ctx.moveTo(x*sx,fy1*sy);ctx.lineTo(x*sx,fy2*sy);ctx.stroke();}
    for(let y=fy1+10;y<fy2;y+=14){ctx.beginPath();ctx.moveTo(fx1*sx,y*sy);ctx.lineTo(fx2*sx,y*sy);ctx.stroke();}
    // Campus perimeter stripe and subtle pedestrian-court guide lines.
    ctx.fillStyle='#173f2d';ctx.fillRect(0,c.height-12,c.width,12);
    return new THREE.CanvasTexture(c);
  }
  function makeParkingAsphaltTexture(width,depth){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#6b7070';ctx.fillRect(0,0,canvas.width,canvas.height);
    // Fine, deterministic aggregate texture gives the deck a believable sealed-asphalt finish.
    let seed=Math.round(width*113+depth*71);
    const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<14000;i++){
      const v=Math.floor(58+rand()*70);
      ctx.fillStyle=`rgba(${v},${v+2},${v+3},${.08+rand()*.16})`;
      const x=rand()*1024,y=rand()*1024,r=.35+rand()*1.5;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    // Faint roller/patch streaks, low contrast so the painted bays remain dominant.
    for(let i=0;i<45;i++){
      const y=rand()*1024;
      ctx.strokeStyle=`rgba(230,231,224,${.018+rand()*.025})`;ctx.lineWidth=1+rand()*2;
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1024,y+(rand()-.5)*8);ctx.stroke();
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1,width/105),Math.max(1,depth/105));
    texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),12);
    return texture;
  }

  function addParkingVehicle(x,z,axis,color){
    // Small, detailed low-poly cars are deliberately sparse so every parking bay stays legible.
    const horizontal=axis==='x',bodyW=horizontal?15.5:8.4,bodyD=horizontal?8.4:15.5;
    const baseY=6.15,bodyY=8.45;
    const paint=new THREE.MeshStandardMaterial({color,roughness:.38,metalness:.18});
    const dark=new THREE.MeshStandardMaterial({color:0x15242c,roughness:.42,metalness:.18});
    const glass=new THREE.MeshStandardMaterial({color:0x244b60,roughness:.22,metalness:.22,transparent:true,opacity:.92});
    const chrome=new THREE.MeshStandardMaterial({color:0xb9c1bb,roughness:.3,metalness:.65});
    const lamp=new THREE.MeshStandardMaterial({color:0xf5e7bb,emissive:0x8a6c32,emissiveIntensity:.25});
    const box=(w,h,d,px,pz,py,mat)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      m.position.copy(world(px,pz,py));m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
    };
    // Shadow pad, chassis and softly rounded-looking body assembled from clean bevel-like layers.
    const shadow=new THREE.Mesh(new THREE.BoxGeometry(bodyW+1,.28,bodyD+1),
      new THREE.MeshBasicMaterial({color:0x222927,transparent:true,opacity:.16}));
    shadow.position.copy(world(x,z,baseY+.1));scene.add(shadow);
    box(bodyW,2.5,bodyD,x,z,bodyY,paint);
    box(bodyW*.78,2.3,bodyD*.53,x,z,bodyY+2.1,paint);
    box(bodyW*.68,1.68,bodyD*.47,x,z,bodyY+2.18,glass);
    // Roof cap and windshield highlights.
    box(bodyW*.62,.35,bodyD*.45,x,z,bodyY+3.17,chrome);
    const wheelMat=dark;
    const wheelOffsets=horizontal
      ? [[-bodyW*.31,-bodyD*.38],[bodyW*.31,-bodyD*.38],[-bodyW*.31,bodyD*.38],[bodyW*.31,bodyD*.38]]
      : [[-bodyW*.38,-bodyD*.31],[bodyW*.38,-bodyD*.31],[-bodyW*.38,bodyD*.31],[bodyW*.38,bodyD*.31]];
    wheelOffsets.forEach(([dx,dz])=>{
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,.78,12),wheelMat);
      wheel.rotation.set(horizontal?Math.PI/2:0,0,horizontal?0:Math.PI/2);wheel.position.copy(world(x+dx,z+dz,7.35));wheel.castShadow=true;scene.add(wheel);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.82,12),chrome);
      hub.rotation.set(horizontal?Math.PI/2:0,0,horizontal?0:Math.PI/2);hub.position.copy(world(x+dx,z+dz,7.35));scene.add(hub);
    });
    // Front and rear lamps are placed on the short ends for each parking orientation.
    [-1,1].forEach(side=>{
      if(horizontal){
        box(.65,.72,1.55,x+bodyW/2+.12,z+side*bodyD*.34,bodyY+.15,lamp);
        box(.65,.7,1.5,x-bodyW/2-.12,z+side*bodyD*.34,bodyY+.1,new THREE.MeshStandardMaterial({color:0xb62f31,emissive:0x3d0808}));
      }else{
        box(1.55,.72,.65,x+side*bodyW*.34,z+bodyD/2+.12,bodyY+.15,lamp);
        box(1.5,.7,.65,x+side*bodyW*.34,z-bodyD/2-.12,bodyY+.1,new THREE.MeshStandardMaterial({color:0xb62f31,emissive:0x3d0808}));
      }
    });
  }

  function addParkingLighting(x,z,height=17){
    const poleMat=new THREE.MeshStandardMaterial({color:0x46534e,roughness:.5,metalness:.42});
    const lampMat=new THREE.MeshStandardMaterial({color:0xfff0c8,emissive:0xc9a65d,emissiveIntensity:.75,roughness:.35});
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.65,.9,height,10),poleMat);
    pole.position.copy(world(x,z,height/2+6));pole.castShadow=true;scene.add(pole);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(5,.6,.8),poleMat);arm.position.copy(world(x+2,z,height+5.6));arm.castShadow=true;scene.add(arm);
    const head=new THREE.Mesh(new THREE.BoxGeometry(4.4,.65,3.0),lampMat);head.position.copy(world(x+4,z,height+5.2));head.castShadow=true;scene.add(head);
  }

  function addParkingStripeLines(){
    const paint=new THREE.MeshStandardMaterial({color:0xf5f1e4,roughness:.82,emissive:0x141414});
    const yellow=new THREE.MeshStandardMaterial({color:0xd8b54f,roughness:.78});
    const curb=new THREE.MeshStandardMaterial({color:0xc8c3b7,roughness:.9});
    const island=new THREE.MeshStandardMaterial({color:0x526f4d,roughness:.95});
    const line=(x,z,w,d,y=6.12,mat=paint)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.20,d),mat);
      mesh.position.copy(world(x+w/2,z+d/2,y));mesh.receiveShadow=true;mesh.castShadow=false;scene.add(mesh);return mesh;
    };
    const curbBox=(w,h,d,x,z,y,mat=curb)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      m.position.copy(world(x,z,y));m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
    };
    // PARKING 1: dark paved deck, two banks of perpendicular stalls and a wide central drive aisle.
    line(10,15,306,.8,6.10);line(10,46,306,.8,6.10);
    line(10,71,306,.8,6.10);line(10,102,306,.8,6.10);
    for(let x=20;x<=300;x+=15){
      line(x,16,.58,30,6.13);line(x,72,.58,30,6.13);
    }
    // Central aisle double guide lines and directional arrows.
    line(14,57,298,.42,6.13,yellow);line(14,67,298,.42,6.13,yellow);
    for(const x of [42,102,162,222,282]){
      const arrow=new THREE.Mesh(new THREE.ConeGeometry(2.25,5.5,3),paint);
      arrow.rotation.x=Math.PI/2;arrow.rotation.z=Math.PI;arrow.position.copy(world(x,62,6.45));scene.add(arrow);
    }
    // Curbed planted separators add depth at the unused corners without blocking any bay.
    [[14,10],[308,10],[14,108],[308,108]].forEach(([x,z])=>{
      curbBox(8,1.5,10,x,z,6.4);curbBox(5.3,1.1,7.3,x,z,7.65,island);
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dz])=>{
        const shrub=new THREE.Mesh(new THREE.SphereGeometry(1.8,8,6),new THREE.MeshStandardMaterial({color:0x3f7849,roughness:.95}));
        shrub.position.copy(world(x+dx*1.3,z+dz*1.2,9));shrub.castShadow=true;scene.add(shrub);
      });
    });
    // Wheel stops at occupied sample spaces.
    const p1Cars=[
      [35,31,'#e9e7df'],[80,31,'#1c5678'],[125,31,'#a83d38'],
      [185,86,'#d3b35a'],[230,86,'#e4e3dd'],[275,86,'#2e604b']
    ];
    p1Cars.forEach(([x,z,color])=>{
      curbBox(5.2,.8,1.0,x,z+9.0,6.6,curb);
      addParkingVehicle(x,z,'z',color);
    });
    // PARKING 2: the narrow west-side lot has individual cross-bays and a clear central approach.
    for(let z=127;z<=226;z+=14)line(14,z,47,.62,6.13);
    line(13,126,.65,110,6.13);line(61,126,.65,110,6.13);
    line(13,180,49,.42,6.13,yellow);
    [[37,137,'#e8e5de'],[37,165,'#244e70'],[37,193,'#a53d39'],[37,221,'#c5b27e']].forEach(([x,z,color])=>{
      curbBox(2.0,.75,5.5,x+20,z,6.6,curb);
      addParkingVehicle(x,z,'x',color);
    });
    // Pedestrian zebra crossing at the shared parking-to-campus approaches.
    for(let i=0;i<7;i++){
      line(140+i*5,108,2.3,6.5,6.16,paint);
      line(68,238+i*2.4,5.8,1.15,6.16,paint);
    }
    // Tall cut-off poles and down-facing lamps give the lots a readable scale cue.
    [[18,53],[302,53],[18,92],[64,180]].forEach(([x,z])=>addParkingLighting(x,z,15));
    const p1=labelTexture('PARKING 1','#6d4a7f');
    const p2=labelTexture('PARKING 2','#6d4a7f');
    [[p1,80,60,31],[p2,42,175,30]].forEach(([map,x,z,width])=>{
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthTest:true,depthWrite:false}));
      sprite.scale.set(width,width*.205,1);sprite.position.copy(world(x,z,7.8));sprite.renderOrder=12;scene.add(sprite);
    });
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
      addBasketballGym();
      addParkingStripeLines();
      addMainGateArchitecture();addGosecoCourtDetails();addLimlinganPedestrianBridge();
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
