import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, RESOURCES, key } from './model.js';
import { heightAt, groundForFeet, foundationHeight, riverX, riverWidth, BRIDGES, WATER_Y } from './landscape.js';
import meadowUrl from './assets/meadow.jpg';
import timberUrl from './assets/timber.jpg';

const COLORS = { water: '#82c6c9', sand: '#e6ce9a', grass: '#adc789', leaf: '#56855d',
  wood: '#94704e', stone: '#a5b0a4', soil: '#866348', cream: '#fff4d7', gold: '#e8b35c' };
const materials = new Map();
const cylinderGeometries = new Map();
function mat(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  return materials.get(color);
}
function mesh(parent, geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const ballGeo = new THREE.IcosahedronGeometry(1, 1);
function box(p, c, x, y, z, sx, sy, sz) {
  const m = mesh(p, boxGeo, c, x, y, z); m.scale.set(sx, sy, sz); return m;
}
function ball(p, c, x, y, z, sx, sy = sx, sz = sx) {
  const m = mesh(p, ballGeo, c, x, y, z); m.scale.set(sx, sy, sz); return m;
}
function cyl(p, c, x, y, z, top, bottom, height, sides = 8) {
  const id = `${top}:${bottom}:${height}:${sides}`;
  if (!cylinderGeometries.has(id)) cylinderGeometries.set(id, new THREE.CylinderGeometry(top, bottom, height, sides));
  return mesh(p, cylinderGeometries.get(id), c, x, y, z);
}
function group(p, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; }
let seed = 71;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

export class IslandView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b9dfed');
    this.scene.fog = new THREE.Fog('#b9dfed', 40, 115);
    this.camera = new THREE.PerspectiveCamera(57, 1, 0.12, 180);
    this.focus = new THREE.Vector3(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight('#fff5d7', '#678c6b', 2.6));
    const sun = new THREE.DirectionalLight('#fff0ce', 3.3);
    sun.position.set(-12, 28, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 75 });
    sun.shadow.normalBias = 0.06; sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.resources = new Map(); this.crops = new Map(); this.builtCount = -1;
    this.buildings = group(this.scene); this.ghost = group(this.scene);
    this.palms = []; this.occluders = [];
    seed = 71;
    const loader = new THREE.TextureLoader();
    this.meadow = loader.load(meadowUrl); this.timber = loader.load(timberUrl);
    for (const tex of [this.meadow, this.timber]) { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy()); }
    this.meadow.repeat.set(36, 36); this.timber.repeat.set(1, 1);
    this.woodMaterial = new THREE.MeshStandardMaterial({ map: this.timber, color: '#cda775', roughness: 0.9 });
    this.makeTerrain(); this.makeScenery(); this.batchScenery(); this.makePlayer();
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.81, 48), new THREE.MeshBasicMaterial({ color: '#fff8db', side: THREE.DoubleSide }));
    this.target.rotation.x = -Math.PI / 2; this.target.position.y = 0.07; this.target.visible = false; this.scene.add(this.target);
    this.playerRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.51, 40), new THREE.MeshBasicMaterial({ color: '#fff9e9', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    this.playerRing.rotation.x = -Math.PI / 2; this.scene.add(this.playerRing);
    this.resize();
  }
  makeTerrain() {
    const geo = new THREE.PlaneGeometry(160, 160, 180, 180); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
      pos.setY(i, h);
      const edge = Math.abs(x - riverX(z));
      const c = new THREE.Color(edge < riverWidth(z) + 0.6 ? '#c1b887' : '#c2d79b');
      c.multiplyScalar(0.92 + Math.sin(x * 0.8 + z * 0.3) * 0.055); colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.meadow, vertexColors: true, roughness: 1 }));
    terrain.receiveShadow = true; this.scene.add(terrain);
    const verts = [], indices = [];
    for (let i = 0; i <= 200; i++) {
      const z = -80 + i * 0.8, x = riverX(z), w = riverWidth(z) + 0.18;
      verts.push(x-w, WATER_Y, z, x+w, WATER_Y, z);
      if(i < 200) { const j=i*2; indices.push(j,j+2,j+1,j+1,j+2,j+3); }
    }
    const waterGeo = new THREE.BufferGeometry(); waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3)); waterGeo.setIndex(indices); waterGeo.computeVertexNormals();
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color:'#65bfc5', roughness:0.23, metalness:0.15, transparent:true, opacity:0.85, side:THREE.DoubleSide })); this.scene.add(this.water);
    this.ripples = group(this.scene);
    for(let i=0;i<65;i++) { const z=-45+rand()*90; const m=box(this.ripples,'#cef2dc',riverX(z)+(rand()-.5)*1.8,WATER_Y+.015,z,.22+rand()*.6,.008,.035); m.castShadow=false; }
    for (const bz of BRIDGES) {
      const g=group(this.scene,riverX(bz),0,bz);
      for(let j=0;j<18;j++) box(g,'#ae8553',(j-8.5)*.29,.48,0,.27,.16,1.8).material=this.woodMaterial;
      for(const z of [-.87,.87]) {
        box(g,'#735133',0,1.1,z,5.4,.11,.1);
        for(const x of [-2.45,0,2.45]) { box(g,'#89613f',x,.75,z,.15,1.5,.15); ball(g,'#d8b271',x,1.55,z,.13); }
      }
    }
    // Reused instanced meshes keep the meadow's detail affordable on mobile.
    const blade = new THREE.ConeGeometry(.055,.38,3);
    const grass = new THREE.InstancedMesh(blade,mat('#6f9b49'),3200);
    const flowers = new THREE.InstancedMesh(ballGeo,mat('#f5d68f'),400);
    const dummy = new THREE.Object3D();
    for(let i=0;i<3200;i++) {
      const x=(rand()-.5)*110,z=(rand()-.5)*110;
      const reserved = Math.abs(x-riverX(z)) < 2 || Math.hypot(x,z)<3 || (x>0&&x<6&&z>2&&z<8);
      dummy.position.set(x,heightAt(x,z)+.13,z); dummy.rotation.set(0,rand()*6,0); dummy.scale.setScalar(reserved?0:.6+rand()); dummy.updateMatrix(); grass.setMatrixAt(i,dummy.matrix);
      if(i<400) { dummy.position.y+=.13; dummy.scale.set(reserved?0:.07,.05,.07); dummy.updateMatrix(); flowers.setMatrixAt(i,dummy.matrix); }
    }
    this.scene.add(grass,flowers);
    for(const [x,z] of WORLD.PLOTS) {
      const g=group(this.scene,x*2,heightAt(x*2,z*2)+.035,z*2);
      box(g,COLORS.soil,0,.025,0,1.78,.06,1.78);
      for(const d of [-.88,.88]) { box(g,'#b08d5a',d,.12,0,.08,.18,1.84); box(g,'#b08d5a',0,.12,d,1.84,.18,.08); }
      for(let j=-2;j<=2;j++) box(g,'#75573f',0,.07,j*.31,1.55,.045,.08);
    }
    // Pale stepping stones lead from the homestead to the garden and crossing.
    for(let i=0;i<23;i++) { const x=-4+i*.65,z=1.4+Math.sin(i*.3)*.5; const m=cyl(this.scene,'#d3c69a',x,heightAt(x,z)+.03,z,.3,.34,.07,7); m.rotation.y=i; }
    // Subtle boundary markers, not invisible scenery presented as explorable map.
    for(let i=0;i<32;i++) { const a=i/32*Math.PI*2,x=Math.sin(a)*16.85,z=Math.cos(a)*16.85; ball(this.scene,'#b0b49a',x,heightAt(x,z)+.12,z,.22,.16,.25); }
  }
  tree(x,z,scale=1,variant=0) {
    const g=group(this.scene,x,heightAt(x,z),z); g.scale.setScalar(scale);
    cyl(g,'#79573b',0,1.7,0,.13,.3,3.4,7);
    if(variant%3===0) {
      for(let n=0;n<3;n++) cyl(g,['#456c4d','#568253','#6b9558'][n],0,2.6+n*.8,0,0,1.35-n*.28,2,8);
    } else {
      ball(g,'#638b4d',-.6,3.1,0,1.45,1.5,1.25);
      ball(g,'#8aad58',.6,3.6,.25,1.5,1.3,1.35);
      ball(g,'#a4bd67',0,4.35,-.15,1.2,.95,1);
      if(variant%2) for(let j=0;j<6;j++) ball(g,'#e8a15b',Math.sin(j*2)*1,3+Math.cos(j)*.6,Math.cos(j*2)*1,.12);
    }
    if(Math.hypot(x,z)<20) this.occluders.push(g);
    return g;
  }
  makeScenery() {
    for(const r of RESOURCES) {
      let g;
      if(r.kind==='wood') { g=this.tree(r.x,r.z,.85,Number(r.id.split('_')[1])); this.palms.push(g); }
      else { g=group(this.scene,r.x,heightAt(r.x,r.z),r.z); const m=ball(g,'#9baba0',0,.45,0,.86,.65,.71);m.rotation.y=r.x;ball(g,'#c2c7ad',.5,.2,.3,.35,.3,.3); }
      this.resources.set(r.id,g);
    }
    for(let i=0;i<85;i++) { const a=rand()*Math.PI*2,r=22+rand()*40; this.tree(Math.sin(a)*r,Math.cos(a)*r,.7+rand()*.8,i); }
    // Unfinished homestead outside the build grid: scenery, clearly signposted in help.
    const cottage=group(this.scene,-9,heightAt(-9,-15),-15);
    for(let x=0;x<3;x++) for(let z=0;z<2;z++) this.makeBuilding({kind:'floor',cell:[x,z],rotation:0},cottage);
    for(let x=0;x<3;x++) this.makeBuilding({kind:x===1?'window':'wall',cell:[x,0],rotation:0},cottage);
    for(let z=0;z<2;z++) this.makeBuilding({kind:'wall',cell:[0,z],rotation:1},cottage);
    for(let x=0;x<2;x++) this.makeBuilding({kind:'roof',cell:[x,0],rotation:0},cottage);
    // Workbench and supplies belong to the environmental dressing, no fake buttons.
    const bench=group(this.scene,-3.8,heightAt(-3.8,-6),-6);
    box(bench,'#aa7747',0,.9,0,1.8,.17,.8).material=this.woodMaterial;
    for(const x of [-.7,.7]) for(const z of [-.26,.26]) box(bench,'#79573b',x,.43,z,.13,.85,.13);
    box(bench,'#8d9995',.45,1.06,0,.35,.17,.3); box(bench,'#dcc592',-.4,1.03,0,.65,.08,.3);
    for(let i=0;i<5;i++) cyl(bench,'#9d744d',1.6,.18+Math.floor(i/3)*.3,(i%3)*.31-.3,.13,.13,1.3,8).rotation.z=Math.PI/2;
    const sign=group(this.scene,1.6,heightAt(1.6,-1.8),-1.8); box(sign,'#84613d',0,.5,0,.1,1,.1);box(sign,'#cfb87c',0,1,0,.9,.44,.09);
    // Distant clouds in the same 3D sky, rather than a painted backdrop.
    for(let i=0;i<13;i++) { const g=group(this.scene,(rand()-.5)*135,23+rand()*12,-55+rand()*45);for(let j=0;j<3;j++) ball(g,'#fff6da',j*2,Math.sin(j)*.6,0,3,1.25,1.6); }
    this.rabbit=group(this.scene,5,heightAt(5,-1),-1);
    ball(this.rabbit,'#efe7d1',0,.23,0,.27,.25,.36);ball(this.rabbit,'#fff2db',0,.4,-.23,.2);
    for(const x of [-.1,.1]) ball(this.rabbit,'#efe7d1',x,.7,-.21,.065,.25,.07);
    ball(this.rabbit,'#6b5848',.1,.43,-.39,.025);ball(this.rabbit,'#fff7e5',0,.24,.34,.12);
  }
  batchScenery() {
    // Merge immutable dressing by material. Interactive trees remain separate so
    // depletion and camera occlusion never alter the simulation.
    this.scene.updateMatrixWorld(true);
    const exclude = new Set([...this.resources.values(), this.buildings, this.ghost, this.ripples, this.water]);
    const buckets = new Map(), originals = [];
    this.scene.traverse(o => {
      if(!o.isMesh || o.isInstancedMesh) return;
      for(let p=o;p;p=p.parent) if(exclude.has(p)) return;
      // All primitive meshes share position/normal/uv; terrain adds colors.
      if(o.geometry.attributes.color) return;
      const geo=o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
      if(!buckets.has(o.material)) buckets.set(o.material,[]);
      buckets.get(o.material).push(geo); originals.push(o);
    });
    for(const o of originals) o.removeFromParent();
    for(const [material,geos] of buckets) {
      const merged=mergeGeometries(geos,false); for(const g of geos)g.dispose();
      const m=new THREE.Mesh(merged,material);m.receiveShadow=true;m.castShadow=true;this.scene.add(m);
    }
  }
  makePlayer() {
    this.player=group(this.scene); this.avatar=group(this.player); this.legs=[]; this.arms=[];
    for(const x of [-.16,.16]) {
      const leg=group(this.avatar,x,.61,0); box(leg,'#354f50',0,-.23,0,.24,.47,.26);box(leg,'#78533c',0,-.5,-.06,.27,.17,.38);this.legs.push(leg);
    }
    cyl(this.avatar,'#398f87',0,.95,0,.31,.36,.72,9);
    box(this.avatar,'#d2ad69',0,.66,0,.65,.08,.47);
    for(const x of [-.43,.43]) { const arm=group(this.avatar,x,1.19,0);ball(arm,'#4d9b8f',0,-.1,0,.16,.22,.17);cyl(arm,'#d7a17c',0,-.34,0,.085,.09,.34);ball(arm,'#e8b58b',0,-.53,0,.1);this.arms.push(arm); }
    ball(this.avatar,'#e4b18a',0,1.58,-.015,.31,.35,.29);
    ball(this.avatar,'#563e2f',0,1.8,.055,.34,.23,.3);
    for(let i=0;i<9;i++) { const a=i/9*Math.PI*2;ball(this.avatar,i%2?'#614431':'#49362d',Math.sin(a)*.25,1.77+Math.cos(i*3)*.07,Math.cos(a)*.22,.125); }
    for(const x of [-.11,.11]) {ball(this.avatar,'#332e29',x,1.6,-.275,.032,.04,.025);ball(this.avatar,'#e0a17d',x*2.4,1.58,0,.065,.09,.065); }
    box(this.avatar,'#a87342',0,1,.3,.49,.55,.25);box(this.avatar,'#d9a75c',0,.89,.455,.36,.23,.1);
    for(const x of [-.22,.22]) box(this.avatar,'#e2bf7f',x,1.15,.18,.055,.5,.08);
    const shovel=group(this.avatar,.48,.6,.17);shovel.rotation.z=-.15;
    cyl(shovel,'#98734c',0,.28,0,.025,.025,1.1);box(shovel,'#abb8ad',0,-.32,0,.2,.3,.06);
  }
  makeBuilding(b, parent, preview = false, valid = true) {
    const g = group(parent, b.cell[0] * WORLD.GRID, foundationHeight(b.cell), b.cell[1] * WORLD.GRID);
    g.rotation.y = b.rotation * Math.PI / 2;
    const wood = preview ? (valid ? '#91cbaa' : '#d77c62') : '#9f7448';
    const cream = preview ? wood : '#f0dfb2';
    const timber=(x,y,z,sx,sy,sz)=>{const m=box(g,wood,x,y,z,sx,sy,sz);if(!preview)m.material=this.woodMaterial;return m;};
    if(b.kind==='floor') {
      box(g,preview?wood:'#9b9d87',0,-.13,0,1.99,.26,1.99);
      for(let i=0;i<6;i++) timber((i-2.5)*.33,.065,0,.31,.13,1.98);
    } else if(b.kind==='roof') {
      for(const side of [-1,1]) {
        const tile=box(g,preview?wood:'#ad6244',side*.51,2.66,0,1.2,.13,2.24);tile.rotation.z=-side*.5;
        for(let j=0;j<5;j++) { const bat=box(g,preview?wood:'#c57c51',side*.52,2.74,(j-2)*.44,1.21,.045,.055);bat.rotation.z=-side*.5; }
      }
      timber(0,2.95,0,.14,.12,2.28);
    } else {
      const edge=b.legacy?0:-1;
      if(b.kind==='fence') {
        for(const x of [-.88,.88]) timber(x,.55,edge,.13,1.1,.14);
        for(const y of [.35,.8]) timber(0,y,edge,1.95,.12,.12);
      } else {
        for(const x of [-.93,.93]) timber(x,1.15,edge,.14,2.3,.22);
        timber(0,2.26,edge,2,.15,.24);timber(0,.16,edge,2,.13,.23);
        if(b.kind==='door') {for(const x of [-.77,.77])box(g,cream,x,1.1,edge,.32,1.95,.14);box(g,cream,0,2.03,edge,1.8,.32,.14);}
        else if(b.kind==='window') {
          for(const x of [-.7,.7])box(g,cream,x,1.14,edge,.45,2.1,.14);
          box(g,cream,0,.49,edge,.95,.65,.14);box(g,cream,0,1.95,edge,.95,.48,.14);
          for(const y of [.85,1.7])timber(0,y,edge,.99,.08,.23);
          timber(0,1.27,edge,.055,.83,.15);
        } else {box(g,cream,0,1.16,edge,1.8,2.1,.14);timber(0,1.15,edge-.09,.09,2.12,.08);}
      }
    }
    if (preview) {
      g.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.7;
          o.castShadow = false;
        }
      });
    }
    return g;
  }
  clearGroup(g) {
    g.traverse(o => { if (o.isMesh && o.material.transparent) o.material.dispose(); });
    g.clear();
  }
  sync(game) {
    for (const [id, g] of this.resources) { g.userData.depleted=(game.state.gathered[id]||0)>=3;g.visible=!g.userData.depleted; }
    if (this.builtCount !== game.state.buildings.length) {
      this.clearGroup(this.buildings);
      for (const b of game.state.buildings) this.makeBuilding(b, this.buildings);
      this.builtCount = game.state.buildings.length;
    }
    for (const cell of WORLD.PLOTS) {
      const id = key(cell), crop = game.state.crops[id];
      const stage = !crop ? -1 : !crop.watered ? 0 : Math.min(4, 1 + Math.floor((1 - crop.remaining / 30) * 3));
      if (this.crops.get(id)?.stage === stage) continue;
      if (this.crops.has(id)) { this.scene.remove(this.crops.get(id).g); this.crops.delete(id); }
      if (!crop) continue;
      const g = group(this.scene, cell[0] * 2, heightAt(cell[0]*2,cell[1]*2)+0.1, cell[1] * 2);
      for (let i = 0; i < 4; i++) {
        const x = i % 2 ? 0.38 : -0.38, z = i < 2 ? -0.38 : 0.38, h = 0.15 + stage * 0.13;
        cyl(g, '#4f8057', x, h / 2, z, 0.03, 0.04, h, 5);
        ball(g, stage === 0 ? '#7d9860' : '#669653', x, h * 0.7, z, 0.22, 0.09, 0.16);
        if (stage === 4) ball(g, '#ecb55b', x, h, z, 0.17, 0.21, 0.17);
      }
      this.crops.set(id, { g, stage });
    }
  }
  preview(build, valid) {
    const signature = build ? JSON.stringify([build, valid]) : '';
    if (signature === this.ghostSignature) return;
    this.ghostSignature = signature; this.clearGroup(this.ghost);
    if (build) this.makeBuilding(build, this.ghost, true, valid);
  }
  highlight(target) {
    this.target.visible = !!target;
    if (target) { const x=target.type==='plot'?target.cell[0]*2:target.x,z=target.type==='plot'?target.cell[1]*2:target.z;this.target.position.set(x,heightAt(x,z)+.1,z); }
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.aspect = w / h; this.camera.aspect=this.aspect; this.camera.updateProjectionMatrix();
  }
  render(game, dt, moving, overview, time) {
    const [x, z] = game.state.position;
    let feet=groundForFeet(x,z)+.02;
    for(const b of game.state.buildings) if(b.kind==='floor'&&Math.abs(x-b.cell[0]*2)<1&&Math.abs(z-b.cell[1]*2)<1) feet=Math.max(feet,foundationHeight(b.cell)+.14);
    this.player.position.set(x,feet,z); this.playerRing.position.set(x,feet+.015,z);
    this.avatar.position.y=moving?Math.sin(time*11)*.035:Math.sin(time*2)*.012;
    this.legs.forEach((leg,i)=>leg.rotation.x=moving?Math.sin(time*11+i*Math.PI)*.5:0);
    this.arms.forEach((arm,i)=>arm.rotation.x=moving?Math.sin(time*11+i*Math.PI+Math.PI)*.35:Math.sin(time*2)*.025);
    const focus=new THREE.Vector3(x,feet+1.45,z);
    if(!this.cameraReady) {this.focus.copy(focus);this.cameraReady=true;}
    this.focus.lerp(focus,1-Math.exp(-dt*9));
    const yaw=game.state.yaw, targetRadius=overview?(this.aspect<.8?29:23):(this.aspect<.8?6.6:7.2);
    this.radius??=targetRadius; this.radius+=(targetRadius-this.radius)*(1-Math.exp(-dt*5));
    const px=this.focus.x+Math.sin(yaw)*this.radius,pz=this.focus.z+Math.cos(yaw)*this.radius;
    const py=overview?feet+25:Math.max(this.focus.y+2.2,heightAt(px,pz)+1.1);
    this.camera.position.set(px,py,pz);
    const forward=overview?0:2.8;
    this.camera.lookAt(this.focus.x-Math.sin(yaw)*forward,this.focus.y+(overview?-.6:.15),this.focus.z-Math.cos(yaw)*forward);
    // Trees between lens and player disappear, preventing a canopy from filling
    // the phone screen when the camera backs into an otherwise solid tree.
    const vx=this.camera.position.x-x,vz=this.camera.position.z-z, len=vx*vx+vz*vz;
    for(const g of this.occluders) {
      const dx=g.position.x-x,dz=g.position.z-z,t=(dx*vx+dz*vz)/len;
      const d=Math.hypot(dx-t*vx,dz-t*vz);
      g.visible=!g.userData.depleted && !(t>-.08 && t<1.35 && d<2.05*g.scale.x);
    }
    // Lift off the roof while standing inside a player-built room.
    this.buildings.children.forEach((g,i)=>{
      const b=game.state.buildings[i];g.visible=true;
      if(b.kind==='roof')g.visible=!(Math.abs(x-b.cell[0]*2)<1.7&&Math.abs(z-b.cell[1]*2)<1.7);
      else if(b.kind!=='floor') {
        const a=b.rotation*Math.PI/2,cx=b.cell[0]*2-(b.legacy?0:Math.sin(a)),cz=b.cell[1]*2-(b.legacy?0:Math.cos(a));
        const dx=cx-x,dz=cz-z,t=(dx*vx+dz*vz)/len;
        if(t>.06&&t<1.1&&Math.hypot(dx-t*vx,dz-t*vz)<1.15)g.visible=false;
      }
    });
    this.ripples.position.z=Math.sin(time*.55)*.08;
    this.renderer.render(this.scene,this.camera);
  }
}
