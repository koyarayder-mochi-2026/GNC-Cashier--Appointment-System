import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('campus3dCanvas');
  const viewport = $('campusMapViewport');
  const list = $('campusDestinationList');
  const loading = $('campus3dLoading');
  if (!canvas || !viewport || !list || !loading) return;

  // Coordinates are measured against the supplied 351 x 570 campus artwork.
  // focus = printed map label; entry = route endpoint on an adjacent walkway.
  const MAP_W = 351;
  const MAP_H = 570;
  const destinations = [
    {id:'beta',name:'Beta Building',code:'BETA',color:'#287b42',focus:[247,345],entry:[292,380],footprint:[214,300,291,476],description:'Beta Building — route ends at the eastern approach, beside the building.'},
    {id:'banzali',name:'Banzali Hall',code:'BH',color:'#c94c50',focus:[322,385],entry:[306,468],footprint:[306,289,346,478],description:'Banzali Hall — route follows the narrow passage along the western side of the hall.'},
    {id:'tanj',name:'Tanjangco Hall',code:'TH',color:'#27864d',focus:[135,199],entry:[180,205],footprint:[90,167,181,234],description:'Tanjangco Hall — route approaches from the eastern side via the upper campus passage.'},
    {id:'goseco',name:'Goseco Hall',code:'GH',color:'#d8aa35',focus:[258,180],entry:[344,280],footprint:[218,155,348,296],description:'Goseco Hall — route approaches the southeast side of the hall.'},
    {id:'puno',name:'Puno Hall',code:'PH',color:'#4d89ae',focus:[179,430],entry:[199,445],footprint:[160,376,198,478],description:'Puno Hall — route ends at the eastern approach to the hall.'},
    {id:'limlingan',name:'Limlingan Hall',code:'LH',color:'#4d8b5a',focus:[184,315],entry:[200,245],footprint:[162,244,216,375],description:'Limlingan Hall — route approaches from the north end of the building.'},
    {id:'narciso',name:'Narciso Hall',code:'NH',color:'#4e83b2',focus:[84,252],entry:[132,280],footprint:[43,239,132,278],description:'Narciso Hall — route approaches from the southern side.'},
    {id:'parking1',name:'Parking 1',code:'P1',color:'#8a55a8',focus:[163,58],entry:[165,120],footprint:[8,0,318,118],description:'Parking 1 — route follows the outer east edge of Parking 2, then turns into the upper parking entrance.'},
    {id:'parking2',name:'Parking 2',code:'P2',color:'#8a55a8',focus:[38,174],entry:[64,235],footprint:[8,117,67,237],description:'Parking 2 — route approaches from the southern end of the parking area.'},
    {id:'gate',name:'Main Gate',code:'GATE',color:'#17603e',focus:[251,525],entry:[252,490],footprint:[210,477,290,550],description:'Main Gate — starting point for all illustrated walking routes.'}
  ];

  // Nine individually drawn routes, following the visible gaps and perimeter walkways
  // in the supplied campus plan. Points are map-image pixels (x, y from top-left).
  const routes = {
    beta:      [[252,490],[284,490],[298,480],[298,435],[298,400],[292,380]],
    banzali:   [[252,490],[284,490],[298,480],[302,477],[306,468]],
    tanj:      [[252,490],[284,490],[298,480],[298,305],[220,305],[220,245],[200,245],[190,230],[185,212],[180,205]],
    goseco:    [[252,490],[284,490],[298,480],[298,305],[318,305],[333,295],[344,280]],
    puno:      [[252,490],[220,490],[204,480],[200,470],[199,445]],
    limlingan: [[252,490],[284,490],[298,480],[298,305],[220,305],[220,245],[200,245]],
    narciso:   [[252,490],[284,490],[298,480],[298,305],[220,305],[220,245],[160,240],[150,255],[150,280],[132,280]],
    parking2:  [[252,490],[284,490],[298,480],[298,305],[220,305],[220,245],[160,240],[150,255],[150,282],[100,282],[70,282],[70,255],[70,235]],
    parking1:  [[252,490],[284,490],[298,480],[298,305],[220,305],[220,245],[160,240],[150,255],[150,282],[100,282],[70,282],[70,255],[70,235],[70,120],[165,120]]
  };

  const mapPoint = (x, y, height = 0) => new THREE.Vector3(x - MAP_W / 2, height, y - MAP_H / 2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe9e2');

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2600);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  } catch (error) {
    loading.textContent = 'Your browser could not start the 3D campus view. Please enable WebGL or try an updated browser.';
    loading.classList.add('campus-3d-load-error');
    console.error('GNC 3D renderer initialization failed.', error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.minPolarAngle = .43;
  controls.maxPolarAngle = 1.34;
  controls.minDistance = 300;
  controls.maxDistance = 1180;
  controls.enablePan = true;
  controls.target.set(0,0,0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x788b7e, 1.6));
  const keyLight = new THREE.DirectionalLight(0xfff6e8, 1.55);
  keyLight.position.set(-260, 520, 350);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048,2048);
  keyLight.shadow.camera.left = -420;
  keyLight.shadow.camera.right = 420;
  keyLight.shadow.camera.top = 620;
  keyLight.shadow.camera.bottom = -620;
  keyLight.shadow.bias = -0.0002;
  scene.add(keyLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1500),
    new THREE.MeshStandardMaterial({color:0xdfe9e2, roughness:1})
  );
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -4;
  ground.receiveShadow = true;
  scene.add(ground);

  // Important: the supplied campus illustration already contains the correct building
  // geometry, roof forms, flag, labels, parking bays and baked shadows. It is the map
  // surface. We intentionally do NOT add substitute boxes or recoloured roof meshes.
  const mapBacking = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_W + 3, 2.2, MAP_H + 3),
    new THREE.MeshStandardMaterial({color:0xe9e6da, roughness:.9})
  );
  mapBacking.position.y = -0.95;
  mapBacking.receiveShadow = true;
  mapBacking.castShadow = true;
  scene.add(mapBacking);

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    'assets/gnc-campus-map-reference.jpg',
    texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      const mapSurface = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP_W, MAP_H),
        new THREE.MeshBasicMaterial({map:texture, side:THREE.DoubleSide, toneMapped:false})
      );
      mapSurface.rotation.x = -Math.PI/2;
      mapSurface.position.y = .22;
      mapSurface.receiveShadow = true;
      mapSurface.renderOrder = 1;
      scene.add(mapSurface);
      loading.classList.add('is-hidden');
    },
    undefined,
    error => {
      loading.textContent = 'The campus artwork could not be loaded. Check that assets/gnc-campus-map-reference.jpg is deployed.';
      loading.classList.add('campus-3d-load-error');
      console.error('GNC campus map texture failed to load.', error);
    }
  );

  // Transparent clickable regions sit exactly over the labeled areas in the artwork.
  // They do not draw over, recolour, or replace any part of the original map.
  const hotspots = [];
  const invisibleMaterial = new THREE.MeshBasicMaterial({
    transparent:true, opacity:0, colorWrite:false, depthWrite:false,
    side:THREE.DoubleSide
  });
  destinations.forEach(destination => {
    const [left, top, right, bottom] = destination.footprint;
    const hotspot = new THREE.Mesh(
      new THREE.PlaneGeometry(right-left, bottom-top),
      invisibleMaterial
    );
    hotspot.rotation.x = -Math.PI/2;
    hotspot.position.copy(mapPoint((left+right)/2, (top+bottom)/2, 1.25));
    hotspot.userData.destination = destination;
    hotspot.renderOrder = 2;
    scene.add(hotspot);
    hotspots.push(hotspot);
  });

  // A small destination marker is only added after selection; all original map labels
  // remain untouched and readable underneath the transparent interaction layer.
  const destinationMarker = new THREE.Group();
  const markerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(5.1, 32),
    new THREE.MeshBasicMaterial({color:0xffd76a, transparent:true, opacity:.95, side:THREE.DoubleSide})
  );
  markerDisc.rotation.x = -Math.PI/2;
  markerDisc.position.y = 3.4;
  destinationMarker.add(markerDisc);
  const markerRing = new THREE.Mesh(
    new THREE.RingGeometry(6.2, 8.1, 40),
    new THREE.MeshBasicMaterial({color:0x15573a, side:THREE.DoubleSide, transparent:true, opacity:.9})
  );
  markerRing.rotation.x = -Math.PI/2;
  markerRing.position.y = 3.5;
  destinationMarker.add(markerRing);
  destinationMarker.visible = false;
  scene.add(destinationMarker);

  const startMarker = new THREE.Mesh(
    new THREE.RingGeometry(4.3, 6.1, 36),
    new THREE.MeshBasicMaterial({color:0x17603e, side:THREE.DoubleSide, transparent:true, opacity:.92})
  );
  startMarker.rotation.x = -Math.PI/2;
  startMarker.position.copy(mapPoint(252,490,3.1));
  scene.add(startMarker);

  const routeGroup = new THREE.Group();
  routeGroup.renderOrder = 5;
  scene.add(routeGroup);
  let activeCurve = null;
  let routeDashes = [];
  let routeStartTime = 0;
  let routePulse = null;
  let selected = null;
  let cameraTween = null;

  function disposeRoute() {
    const removed = [...routeGroup.children];
    routeGroup.clear();
    const geometries = new Set();
    const materials = new Set();
    removed.forEach(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    activeCurve = null;
    routeDashes = [];
    routePulse = null;
  }

  function drawRoute(destination) {
    disposeRoute();
    destinationMarker.visible = false;
    if (!destination || destination.id === 'gate') return;
    const coordinates = routes[destination.id];
    if (!coordinates || coordinates.length < 2) {
      $('campusRouteDescription').textContent = 'No route is configured for this destination yet.';
      return;
    }

    const points = coordinates.map(([x,y]) => mapPoint(x,y,3.2));
    activeCurve = new THREE.CatmullRomCurve3(points, false, 'centripetal', .12);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(activeCurve, Math.max(120, coordinates.length*24), 2.15, 8, false),
      new THREE.MeshBasicMaterial({color:0xd74640, toneMapped:false})
    );
    tube.renderOrder = 5;
    routeGroup.add(tube);

    // Moving white dashes communicate walking direction without hiding the red route.
    const dashCount = Math.max(18, Math.min(54, Math.ceil(activeCurve.getLength()/12)));
    const dashGeometry = new THREE.CylinderGeometry(.72,.72,5.2,7,1,false);
    const dashMaterial = new THREE.MeshBasicMaterial({color:0xffffff, toneMapped:false});
    const axis = new THREE.Vector3(0,1,0);
    for (let i=0; i<dashCount; i++) {
      const dash = new THREE.Mesh(dashGeometry, dashMaterial);
      dash.renderOrder = 6;
      routeGroup.add(dash);
      routeDashes.push(dash);
    }

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 14, 10),
      new THREE.MeshBasicMaterial({color:0xffe07a, toneMapped:false})
    );
    pulse.renderOrder = 7;
    routeGroup.add(pulse);
    routePulse = pulse;
    routeStartTime = performance.now();

    destinationMarker.position.copy(mapPoint(destination.entry[0], destination.entry[1], .9));
    destinationMarker.visible = true;
  }

  function focusDestination(destination) {
    const target = mapPoint(destination.focus[0], destination.focus[1], 0);
    const offset = new THREE.Vector3(0, 255, 310);
    cameraTween = {
      from:camera.position.clone(),
      to:target.clone().add(offset),
      targetFrom:controls.target.clone(),
      targetTo:target,
      started:performance.now(),
      duration:950
    };
    controls.enabled = false;
  }

  function resetCamera() {
    const target = new THREE.Vector3(0,0,0);
    cameraTween = {
      from:camera.position.clone(),
      to:new THREE.Vector3(0,520,550),
      targetFrom:controls.target.clone(),
      targetTo:target,
      started:performance.now(),
      duration:850
    };
    controls.enabled = false;
  }

  function select(id) {
    selected = destinations.find(d => d.id === id) || null;
    list.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.destination === id));
    });
    $('campusSelectedName').textContent = selected ? selected.name : 'Start at the Main Gate';
    $('campusRouteDescription').textContent = selected
      ? (selected.id === 'gate' ? selected.description : selected.description + ' The animated route begins at the Main Gate.')
      : 'Select a building from the directory or tap its labeled area in the 3D map.';
    $('campusMapHint').textContent = selected
      ? (selected.id === 'gate' ? 'Main Gate selected · choose another destination for directions' : `Selected: ${selected.name} · route from Main Gate`)
      : 'Drag to orbit · scroll to zoom · select a building to navigate';
    $('campusClearSelection').hidden = !selected;
    drawRoute(selected);
    if (selected) focusDestination(selected);
    else resetCamera();
  }

  destinations.forEach(destination => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'campus-destination-button';
    button.dataset.destination = destination.id;
    button.setAttribute('aria-pressed','false');
    button.innerHTML = `<i class="campus-destination-dot" style="--destination-color:${destination.color}"></i><span>${destination.name}</span><small class="campus-destination-code">${destination.code}</small>`;
    button.addEventListener('click', () => select(destination.id));
    list.appendChild(button);
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  canvas.addEventListener('pointerdown', event => { pointerDown = {x:event.clientX,y:event.clientY}; });
  canvas.addEventListener('pointercancel', () => { pointerDown = null; });
  canvas.addEventListener('pointermove', event => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(pointer,camera);
    canvas.style.cursor = raycaster.intersectObjects(hotspots,false).length ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y);
    pointerDown = null;
    if (moved > 7) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hits = raycaster.intersectObjects(hotspots,false);
    if (hits.length) select(hits[0].object.userData.destination.id);
  });

  $('campusZoomIn').addEventListener('click', () => {
    const direction = camera.position.clone().sub(controls.target).multiplyScalar(.84);
    camera.position.copy(controls.target).add(direction);
    controls.update();
  });
  $('campusZoomOut').addEventListener('click', () => {
    const direction = camera.position.clone().sub(controls.target).multiplyScalar(1.18);
    camera.position.copy(controls.target).add(direction);
    controls.update();
  });
  $('campusMapReset').addEventListener('click', () => select(null));
  $('campusMapHome').addEventListener('click', () => select('gate'));
  $('campusClearSelection').addEventListener('click', () => select(null));

  function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width,height,false);
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = ('ResizeObserver' in window) ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(viewport);
  else window.addEventListener('resize', resize);
  resize();
  camera.position.set(0,520,550);
  camera.lookAt(0,0,0);

  function animate(now) {
    requestAnimationFrame(animate);
    if (cameraTween) {
      const t = Math.min(1,(now-cameraTween.started)/cameraTween.duration);
      const eased = 1-Math.pow(1-t,3);
      camera.position.lerpVectors(cameraTween.from,cameraTween.to,eased);
      controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,eased);
      camera.lookAt(controls.target);
      if (t>=1) { cameraTween=null; controls.enabled=true; }
    } else {
      controls.update();
    }

    if (activeCurve && routeDashes.length) {
      const travel = ((now-routeStartTime)%4200)/4200;
      const lift = 4.2;
      const axis = new THREE.Vector3(0,1,0);
      routeDashes.forEach((dash,index) => {
        const u = (index/routeDashes.length + travel)%1;
        const point = activeCurve.getPointAt(u);
        const tangent = activeCurve.getTangentAt(u).normalize();
        dash.position.set(point.x,lift,point.z);
        dash.quaternion.setFromUnitVectors(axis,tangent);
      });
      if (routePulse) {
        const point = activeCurve.getPointAt(travel);
        routePulse.position.set(point.x,5.4,point.z);
      }
    }
    if (destinationMarker.visible) {
      const scale = 1 + Math.sin(now*.006)*.12;
      destinationMarker.scale.setScalar(scale);
    }
    renderer.render(scene,camera);
  }
  requestAnimationFrame(animate);
})();
