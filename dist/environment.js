import * as T from './assets/three.module.js';
import {surfaceTexture} from './textures.js?v=8';
import {buoyancyPose, orientedPose, createHullMotion, hullTarget, steerBoat} from './surface.js?v=8';
import {BOATS} from './economy.js?v=8';
import {createLand, landHeight as regionLand, landDistance} from './land.js?v=8';
import {createAmbience} from './ambience.js?v=8';
import {
  broadleafGeometry,
  pineGeometry,
  rockGeometry,
  cottage,
  car as carModel,
  walker as walkerModel,
  palmGeometry,
  harborBuilding,
  gull,
  flapGull,
  coralGeometry,
  lilyPadGeometry,
} from './scenery.js?v=8';
const TAU = Math.PI * 2;
const IMPULSES = 16;
// Coherent surface model. The GLSL and JS height functions are kept identical so the
// float, boats and drips ride exactly the waves that are drawn.
// Water LOD: the same vertex budget, graded so cells are about 0.35 units round the angler
// (where the float, splashes and ripples are) and stretch to several units at the horizon.
// Covers x -130..130 and z -180..50 like a flat plane would.
function waterGrid(cols, rows) {
  const g = new T.PlaneGeometry(1, 1, cols, rows),
    p = g.attributes.position,
    split = 0.22;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) * 2,
      v = 0.5 + p.getY(i),
      x = Math.sign(a) * 130 * Math.pow(Math.abs(a), 1.8),
      z = v < split ? 8.8 + 41.2 * Math.pow((split - v) / split, 1.6) : 8.8 - 188.8 * Math.pow((v - split) / (1 - split), 1.8);
    p.setXYZ(i, x, 0, z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
export function createWater(parent) {
  let ocean = 0,
    swell = 1,
    wind = 0;
  const events = [];
  const impulses = Array.from({length: IMPULSES}, () => new T.Vector4(0, 0, -100, 0));
  const uniforms = {
    time: {value: 0},
    ocean: {value: 0},
    swell: {value: 1},
    rain: {value: 0},
    impulses: {value: impulses},
    skyTop: {value: new T.Color('#4d8fb5')},
    skyHorizon: {value: new T.Color('#cfe3e0')},
    sunDir: {value: new T.Vector3(-0.4, 0.7, -0.3).normalize()},
    sunColor: {value: new T.Color('#ffe2b5')},
    fogColor: {value: new T.Color('#35575b')},
    fogDensity: {value: 0.0065},
    light: {value: 1},
    detail: {value: 1},
    tint: {value: new T.Color('#3fc6c0')},
    tintAmount: {value: 0},
    reefShoal: {value: 0},
    current: {value: 0},
    biolume: {value: 0},
    // Land under the water for shallows and shore foam (set by createEnvironment).
    shoreTex: {value: new T.DataTexture(new Uint8Array([0]), 1, 1, T.RedFormat)},
    shoreBox: {value: new T.Vector4(-130, -180, 260, 230)},
  };
  uniforms.shoreTex.value.needsUpdate = true;
  const wave = `float height(vec2 p){float a=mix(.048,.22,ocean)*swell;
    float h=sin(p.x*.45+p.y*.68+time*.9)*a+sin(p.x*.71-p.y*.32+time*.7)*a*.55+sin(p.y*1.8+time*1.1)*.018
      +sin(p.x*1.3-p.y*.92+time*1.6)*a*.18+sin(p.x*-.23+p.y*.31+time*.52)*a*.42+sin(p.x*2.1+p.y*1.7+time*2.3)*a*.07;
    for(int i=0;i<${IMPULSES};i++){float age=time-impulses[i].z;float d=length(p-impulses[i].xy);
      if(age>0.&&age<8.)h+=sin(d*6.-age*8.)*exp(-pow(d-age*2.8,2.)*.7)*exp(-age*.65)*impulses[i].w;}
    return h;}`;
  // Horizontal distance from the nearest freshwater bank edge into open water.
  // Land height under the water, baked by land.js for the current region (-4..4 in 0..1).
  const bank = `uniform sampler2D shoreTex;uniform vec4 shoreBox;
    float landUnder(vec2 q){vec2 uv=(q-shoreBox.xy)/shoreBox.zw;if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return -4.;return texture2D(shoreTex,uv).r*8.-4.;}`;
  const mat = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    vertexShader: `uniform float time;uniform float ocean;uniform float swell;uniform vec4 impulses[${IMPULSES}];varying vec3 p;varying vec3 normalW;${wave}
      void main(){vec3 v=position;v.y=height(v.xz);float e=.08;
        normalW=normalize(vec3(height(v.xz-vec2(e,0.))-height(v.xz+vec2(e,0.)),2.*e,height(v.xz-vec2(0.,e))-height(v.xz+vec2(0.,e))));
        p=v;gl_Position=projectionMatrix*modelViewMatrix*vec4(v,1.);}`,
    fragmentShader: `uniform float time;uniform float ocean;uniform float rain;uniform vec3 skyTop;uniform vec3 skyHorizon;uniform vec3 sunDir;uniform vec3 sunColor;
      uniform vec3 fogColor;uniform float fogDensity;uniform float light;uniform float detail;uniform vec3 tint;uniform float tintAmount;uniform float reefShoal;uniform float current;uniform float biolume;varying vec3 p;varying vec3 normalW;${bank}
      vec2 ripple(vec2 q,float t){return vec2(sin(q.x*3.1+q.y*1.3+t*1.9)+sin(q.x*5.7-q.y*4.1-t*2.7)*.5+sin(q.y*9.3+q.x*.7+t*3.9)*.25,
        cos(q.y*2.9-q.x*1.7+t*1.6)+cos(q.y*6.3+q.x*3.9-t*2.3)*.5+cos(q.x*8.7-q.y*1.1+t*4.3)*.25);}
      void main(){vec3 view=cameraPosition-p;float dist=length(view);view/=dist;
        vec2 r=detail>.5?ripple(p.xz,time)*(.035+rain*.05)*(1.-smoothstep(12.,70.,dist)):vec2(0.);
        vec3 n=normalize(normalW+vec3(r.x,0.,r.y));
        if(detail>.5&&rain>.02&&dist<40.){vec2 g=p.xz*1.7;vec2 id=floor(g);vec2 c=fract(g)-.5;float h=fract(sin(dot(id,vec2(12.9898,78.233)))*43758.5453);
          c-=(vec2(fract(h*7.13),fract(h*13.7))-.5)*.5;float ph=fract(time*.85+h);float d=length(c),rad=ph*.42;
          float ring=sin((d-rad)*70.)*smoothstep(.07,0.,abs(d-rad))*(1.-ph);n=normalize(n+vec3(c.x,0.,c.y)/max(d,.02)*ring*rain*.35*(1.-dist/40.));}
        float facing=max(0.,dot(view,n));float fres=.03+.97*pow(1.-facing,5.);
        vec3 refl=reflect(-view,n);float up=clamp(refl.y,0.,1.);
        vec3 sky=mix(skyHorizon,skyTop,pow(up,.55));
        vec3 deep=mix(vec3(.03,.13,.13),vec3(.015,.11,.18),ocean),shallow=mix(vec3(.12,.3,.24),vec3(.06,.38,.42),ocean);
        float lh=landUnder(p.xz);float shore=smoothstep(-.75,-.2,lh);float lap=(1.-smoothstep(0.,.09,abs(lh+.06+.025*sin(p.z*.9+p.x*.4+time*.8))))*step(-.6,lh);
        vec3 body=mix(deep,shallow,.25+.2*sin(p.x*.14+p.z*.18)+shore*.55);
        body=mix(body,vec3(.42,.43,.3),shore*shore*.55);body=mix(body,tint,tintAmount);float shoal=reefShoal*smoothstep(.15,.75,sin(p.x*.13+sin(p.z*.11)*2.)*sin(p.z*.09+p.x*.05)+.25);body=mix(body,vec3(.45,.78,.7),shoal*.55);
        vec3 color=mix(body*light,sky,clamp(fres*.85+.08,0.,1.));
        float sd0=max(0.,dot(refl,sunDir));float spec=(pow(sd0,mix(260.,520.,ocean))*mix(1.8,1.1,ocean)+pow(sd0,40.)*.05)*(1.-smoothstep(25.,90.,dist)*.5);
        color+=sunColor*spec*smoothstep(-.05,.12,sunDir.y);
        float crest=ocean*smoothstep(.24,.42,p.y)*.35+lap*(.55+.45*sin(p.z*2.3+time*1.7))*.3;
        color+=crest*vec3(.75,.82,.8)*max(.35,light);
        // Fernwater's current: foam streaks drifting downstream (toward the angler).
        if(current>.01){float streak=pow(.5+.5*sin(p.x*1.9+sin(p.z*.35+p.x*.2)*1.6),14.)*(.5+.5*sin((p.z-time*1.7)*.8+sin(p.x*.7)*2.));color+=streak*current*.12*max(.4,light)*(1.-smoothstep(20.,60.,dist));}
        // Starlit Cove: specks of blue bioluminescence that twinkle at night.
        if(biolume>.01){vec2 q=p.xz*3.;vec2 cell=floor(q);float h=fract(sin(dot(cell,vec2(41.3,289.1)))*43758.5);vec2 c=fract(q)-vec2(fract(h*7.3),fract(h*3.1))*.6-.2;float dot=smoothstep(.13,0.,length(c))*step(.92,h);float tw=.5+.5*sin(time*2.+h*40.);color+=vec3(.3,.8,1.)*dot*tw*biolume*1.6*(1.-smoothstep(8.,40.,dist));}
        float fog=1.-exp(-fogDensity*fogDensity*dist*dist);gl_FragColor=vec4(mix(color,fogColor,fog),1.);}`,
  });
  const mesh = new T.Mesh(waterGrid(192, 160), mat);
  mesh.name = 'Lake water';
  // Drawn after hull water masks (renderOrder 1) so it never shows inside a boat.
  mesh.renderOrder = 2;
  parent.add(mesh);
  function height(x, z, t) {
    const a = (ocean ? 0.22 : 0.048) * swell;
    let h =
      Math.sin(x * 0.45 + z * 0.68 + t * 0.9) * a +
      Math.sin(x * 0.71 - z * 0.32 + t * 0.7) * a * 0.55 +
      Math.sin(z * 1.8 + t * 1.1) * 0.018 +
      Math.sin(x * 1.3 - z * 0.92 + t * 1.6) * a * 0.18 +
      Math.sin(x * -0.23 + z * 0.31 + t * 0.52) * a * 0.42 +
      Math.sin(x * 2.1 + z * 1.7 + t * 2.3) * a * 0.07;
    for (const e of events) {
      const age = t - e.time,
        d = Math.hypot(x - e.x, z - e.z);
      if (age > 0 && age < 8)
        h += Math.sin(d * 6 - age * 8) * Math.exp(-Math.pow(d - age * 2.8, 2) * 0.7) * Math.exp(-age * 0.65) * e.power;
    }
    return h;
  }
  return {
    mesh,
    height,
    uniforms,
    setResolution(ultra) {
      const cols = ultra ? 300 : 192;
      if (mesh.geometry.parameters?.widthSegments === cols) return;
      mesh.geometry.dispose();
      mesh.geometry = waterGrid(cols, ultra ? 250 : 160);
    },
    impulse(x, z, t, power = 0.22) {
      events.push({x, z, time: t, power});
      if (events.length > IMPULSES) events.shift();
      for (let i = 0; i < IMPULSES; i++) {
        const e = events[i];
        impulses[i].set(e?.x || 0, e?.z || 0, e?.time ?? -100, e?.power || 0);
      }
    },
    update(t, region, c) {
      ocean = region >= 3 ? 1 : 0;
      wind += ((c.weather === 'wind' ? 1 : c.weather === 'storm' ? 1.3 : 0) - wind) * 0.02;
      swell = 1 + wind * 0.45;
      uniforms.time.value = t;
      uniforms.ocean.value = ocean;
      uniforms.swell.value = swell;
      uniforms.rain.value += ((c.weather === 'rain' ? 1 : c.weather === 'storm' ? 1.35 : 0) - uniforms.rain.value) * 0.02;
      // Reef water is clear and turquoise; the open ocean is deep blue.
      uniforms.tint.value.set(region === 4 ? '#2fb8b4' : '#0a2a48');
      uniforms.current.value += ((region === 1 ? 1 : 0) - uniforms.current.value) * 0.05;
      uniforms.biolume.value += ((region === 2 ? (c.phase === 'night' ? 1.4 : c.phase === 'dusk' ? 0.6 : 0.12) : 0) - uniforms.biolume.value) * 0.05;
      uniforms.reefShoal.value += ((region === 4 ? 1 : 0) - uniforms.reefShoal.value) * 0.05;
      uniforms.tintAmount.value += ((region === 4 ? 0.42 : region === 5 ? 0.45 : 0) - uniforms.tintAmount.value) * 0.05;
    },
  };
}
// Wind sway injected into standard materials; instanced plants sway out of phase.
const sway = {time: {value: 0}, wind: {value: 0.4}};
export function addSway(material, amount, base = 0) {
  material.onBeforeCompile = shader => {
    shader.uniforms.swayTime = sway.time;
    shader.uniforms.swayWind = sway.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float swayTime;uniform float swayWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = (modelMatrix * vec4(position.x, 0., position.z, 1.)).xyz;
        #endif
        float sw = sin(swayTime * 1.7 + ip.x * .35 + ip.z * .27) + .4 * sin(swayTime * 3.1 + ip.z * .6 + ip.x * .2);
        float lift = max(0., position.y - ${base.toFixed(2)});
        transformed.x += sw * ${amount.toFixed(3)} * (.35 + swayWind) * lift;
        transformed.z += sw * ${(amount * 0.4).toFixed(3)} * (.35 + swayWind) * lift;`,
      );
  };
  material.customProgramCacheKey = () => 'sway' + amount + base;
  return material;
}
export function updateSway(t, windy) {
  sway.time.value = t;
  sway.wind.value += ((windy ? 1.1 : 0.35) - sway.wind.value) * 0.01;
}
const BOX = new T.BoxGeometry(1, 1, 1),
  CYL = new T.CylinderGeometry(1, 1, 1, 12);
BOX.userData.shared = CYL.userData.shared = true;
const bmat = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: 0.85, ...extra});
function bmesh(g, m, p, sc, par) {
  const o = new T.Mesh(g, m);
  o.position.set(...p);
  o.scale.set(...sc);
  par.add(o);
  return o;
}
// Lofted skiff hull: transom stern, rising sheer to a pointed bow, painted bottom and
// a boot stripe at the waterline, with gunwales, floorboards and thwarts inside.
const hullStations = 26,
  hullRing = 16;
function hullPoint(u, a) {
  const beam = u < 0.62 ? 0.78 + 0.22 * Math.sin((u / 0.62) * Math.PI * 0.5) : Math.pow((1 - u) / 0.38, 0.75),
    sheer = 0.62 + 0.3 * Math.pow(u, 3) - 0.04 * Math.sin(Math.PI * u),
    keel = -0.45 + 0.22 * Math.pow(u, 4),
    theta = a * Math.PI,
    down = Math.pow(Math.sin(theta), 0.55);
  return [(u - 0.5) * 4.1, sheer - (sheer - keel) * down, Math.cos(theta) * 0.92 * beam];
}
export function boatModel(size = 1, style = 0) {
  const g = new T.Group(),
    pos = [],
    colors = [],
    index = [],
    paint = new T.Color(BOATS[style]?.color || '#b4a787'),
    bottom = new T.Color('#2f4f52'),
    stripe = new T.Color('#efe9d6');
  for (let i = 0; i <= hullStations; i++) {
    for (let j = 0; j <= hullRing; j++) {
      const p = hullPoint(i / hullStations, j / hullRing);
      pos.push(...p);
      const c = p[1] < -0.2 ? bottom : p[1] < -0.12 ? stripe : paint;
      colors.push(c.r, c.g, c.b);
    }
    if (i < hullStations)
      for (let j = 0; j < hullRing; j++) {
        const a = i * (hullRing + 1) + j,
          b = a + hullRing + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
  }
  // Transom: close the stern with a flat fan.
  const centre = pos.length / 3;
  pos.push(-2.05, 0.1, 0);
  colors.push(paint.r * 0.85, paint.g * 0.85, paint.b * 0.85);
  for (let j = 0; j < hullRing; j++) index.push(centre, j, j + 1);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const hull = bmesh(geo, bmat('#ffffff', {vertexColors: true, roughness: 0.55, side: T.DoubleSide}), [0, 0, 0], [1, 1, 1], g);
  hull.name = 'Hull';
  // Invisible lid across the gunwales: it writes depth only, after the boat and before the
  // sea, so the sea surface can never show through inside the hull as the boat rolls.
  const lidPos = [],
    lidIdx = [];
  for (let i = 0; i <= hullStations; i++) {
    for (const a of [0, 1]) lidPos.push(...hullPoint(i / hullStations, a));
    if (i < hullStations) lidIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const lidGeo = new T.BufferGeometry();
  lidGeo.setAttribute('position', new T.Float32BufferAttribute(lidPos, 3));
  lidGeo.setIndex(lidIdx);
  const lid = new T.Mesh(lidGeo, new T.MeshBasicMaterial({colorWrite: false, side: T.DoubleSide}));
  lid.renderOrder = 1;
  lid.name = 'Hull water mask';
  g.add(lid);
  const woodLight = bmat('#b39f7b', {map: surfaceTexture('wood')}),
    woodDark = bmat('#7e6849', {map: surfaceTexture('wood')});
  for (const sideSign of [-1, 1]) {
    const rail = [];
    for (let i = 0; i <= hullStations; i++) {
      const p = hullPoint(i / hullStations, sideSign < 0 ? 0 : 1);
      rail.push(new T.Vector3(p[0], p[1] + 0.02, p[2]));
    }
    bmesh(new T.TubeGeometry(new T.CatmullRomCurve3(rail), 40, 0.045, 6, false), woodDark, [0, 0, 0], [1, 1, 1], g);
  }
  bmesh(BOX, woodLight, [-0.15, 0.22, 0], [3.1, 0.06, 1.25], g);
  for (let k = -3; k <= 3; k++) bmesh(BOX, woodDark, [-0.15, 0.255, k * 0.17], [3.05, 0.012, 0.02], g);
  for (const x of [-1.15, 0.95]) bmesh(BOX, woodDark, [x, 0.42, 0], [0.34, 0.07, 1.62 - Math.abs(x) * 0.18], g);
  bmesh(BOX, woodDark, [1.95, 0.85, 0], [0.12, 0.08, 0.08], g);
  if (style > 0) {
    bmesh(BOX, bmat('#e0dccc'), [-1.3, 0.8, 0], [1.1, 1.3, 1.05], g);
    bmesh(BOX, bmat('#8fadaf', {metalness: 0.3, roughness: 0.15}), [-1.3, 1.1, 0.54], [0.8, 0.55, 0.03], g);
    bmesh(BOX, bmat('#bdc9bd'), [-1.3, 1.53, 0], [1.45, 0.12, 1.5], g);
  }
  if (style === 2) {
    bmesh(CYL, bmat('#bfcabc', {metalness: 0.6}), [-1.3, 2.05, 0], [0.035, 1.05, 0.035], g);
    bmesh(BOX, bmat('#bac9c5'), [-1.3, 2.58, 0], [0.65, 0.08, 0.4], g);
    for (const side of [-1, 1]) {
      for (const x of [-1.5, -0.6, 0.6, 1.5])
        bmesh(CYL, bmat('#bdc9bb', {metalness: 0.6}), [x, 0.5, side * 0.74], [0.025, 0.65, 0.025], g);
      bmesh(BOX, bmat('#bfcbbb', {metalness: 0.55}), [0, 0.82, side * 0.74], [3.3, 0.035, 0.035], g);
    }
  }
  g.scale.setScalar(size);
  return g;
}
const GRASS_MAX = 4200;
export function createEnvironment(parent, state, water) {
  const fresh = new T.Group(),
    salt = new T.Group(),
    common = new T.Group();
  parent.add(fresh, salt, common);
  salt.visible = false;
  // One continuous landscape per water (land.js): banks, hills and mountains all round, so
  // there is no strip of land to see past or under. The water reads its shallows from it.
  const land = createLand(common, state.region || 0, state.quality);
  if (water.uniforms.shoreTex) water.uniforms.shoreTex.value = land.shoreTexture;
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: 0.85, ...extra});
  const sphere = new T.SphereGeometry(1, 16, 12),
    box = new T.BoxGeometry(1, 1, 1),
    cyl = new T.CylinderGeometry(1, 1, 1, 12);
  function mesh(g, m, p, s, par = fresh) {
    const o = new T.Mesh(g, m);
    o.position.set(...p);
    o.scale.set(...s);
    par.add(o);
    return o;
  }
  function terrain(cx, cz, w, d, h, color, par = fresh) {
    const g = new T.PlaneGeometry(w, d, 48, 72);
    g.rotateX(-Math.PI / 2);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i),
        z = a.getZ(i),
        // Falls off on all four sides, so the patch never ends in a cut edge above water.
        edge = Math.max(0, 1 - Math.pow(Math.abs(x) / (w * 0.5), 2)) * Math.max(0, 1 - Math.pow(Math.abs(z) / (d * 0.5), 4));
      const y = -0.6 + Math.pow(edge, 0.7) * (h + 0.35 + Math.sin(x * 0.25 + z * 0.18) * h * 0.22 + Math.sin(z * 0.47) * 0.2);
      a.setY(i, y);
    }
    g.computeVertexNormals();
    const land = mesh(g, mat(color), [cx, 0, cz], [1, 1, 1], par);
    land.receiveShadow = true;
    return land;
  }
  // Freshwater scenery sits on the shared lake landscape (identical near the banks in all
  // three freshwater regions).
  const ground = (x, z) => regionLand(0, x, z);
  // Banks of broadleaf trees mixed with conifers; a few shared variants are instanced so
  // the whole wood stays a handful of draw calls.
  const foliage = addSway(new T.MeshStandardMaterial({vertexColors: true, roughness: 0.88}), 0.025, 1.4),
    matrix = new T.Object3D(),
    treeKinds = [0, 1, 2, 3, 4].map(k => broadleafGeometry(k + 1)).concat([0, 1, 2].map(k => pineGeometry(k + 11))),
    placements = treeKinds.map(() => []);
  for (let i = 0; i < 48; i++) {
    const side = i % 2 ? -1 : 1,
      x = side * (12 + Math.random() * 17),
      z = -35 + Math.random() * 55,
      kind = Math.random() < 0.3 ? 5 + (i % 3) : i % 5;
    placements[kind].push([x, ground(x, z) - 0.05, z, 1.25 + Math.random() * 0.7, Math.random() * TAU]);
  }
  treeKinds.forEach((geo, k) => {
    if (!placements[k].length) return;
    const trees = new T.InstancedMesh(geo, foliage, placements[k].length);
    placements[k].forEach(([x, y, z, sc, rot], i) => {
      matrix.position.set(x, y, z);
      matrix.rotation.set(0, rot, 0);
      matrix.scale.setScalar(sc);
      matrix.updateMatrix();
      trees.setMatrixAt(i, matrix.matrix);
    });
    trees.computeBoundingSphere();
    fresh.add(trees);
  });
  const grassGeo = new T.PlaneGeometry(0.09, 0.8, 1, 3);
  grassGeo.translate(0, 0.4, 0);
  const grass = new T.InstancedMesh(grassGeo, addSway(mat('#80916a', {side: T.DoubleSide}), 0.16), GRASS_MAX);
  fresh.add(grass);
  for (let i = 0; i < GRASS_MAX; i++) {
    const side = i % 2 ? -1 : 1;
    matrix.position.set(side * (11.3 + Math.random() * 15), 1, -30 + Math.random() * 48);
    matrix.position.y = ground(matrix.position.x, matrix.position.z) - 0.05;
    matrix.scale.set(0.7 + Math.random(), 0.45 + Math.random(), 1);
    matrix.rotation.set(0.05, Math.random() * TAU, (Math.random() - 0.5) * 0.4);
    matrix.updateMatrix();
    grass.setMatrixAt(i, matrix.matrix);
  }
  // Lily pads drift in Willow Lake's shallows and ride the real wave height.
  const lilyGeo = [1, 2, 3].map(k => lilyPadGeometry(k)),
    lilies = lilyGeo.map(g => new T.InstancedMesh(g, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.6, side: T.DoubleSide}), 12)),
    lilySpots = [];
  for (let i = 0; i < 36; i++) {
    const side = i % 2 ? -1 : 1,
      x = side * (6.2 + ((i * 37) % 30) / 10),
      z = -16 + ((i * 53) % 190) / 10;
    lilySpots.push({x, z, rot: i * 2.1, kind: i % 3, index: Math.floor(i / 3), scale: 0.8 + ((i * 7) % 5) * 0.12});
  }
  const lilyGroup = new T.Group();
  for (const l of lilies) {
    l.receiveShadow = true;
    lilyGroup.add(l);
  }
  fresh.add(lilyGroup);
  // Shoreline boulders: weathered, mossy on top, settled into the ground.
  const stoneMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.95}),
    stoneKinds = [1, 2, 3, 4].map(k => rockGeometry(k)),
    stonePlacements = stoneKinds.map(() => []);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? -1 : 1,
      x = side * (7 + Math.random() * 9),
      z = -28 + Math.random() * 41;
    stonePlacements[i % 4].push([x, Math.max(ground(x, z), -0.15), z, 0.35 + Math.random() * 0.8]);
  }
  stoneKinds.forEach((geo, k) => {
    const stones = new T.InstancedMesh(geo, stoneMat, stonePlacements[k].length);
    stonePlacements[k].forEach(([x, y, z, sc], i) => {
      matrix.position.set(x, y + sc * 0.12, z);
      matrix.rotation.set(0, Math.random() * TAU, 0);
      matrix.scale.set(sc * (1 + Math.random() * 0.4), sc * (0.6 + Math.random() * 0.4), sc);
      matrix.updateMatrix();
      stones.setMatrixAt(i, matrix.matrix);
    });
    stones.computeBoundingSphere();
    stones.castShadow = stones.receiveShadow = true;
    fresh.add(stones);
  });
  const glowMat = mat('#f7dcad', {emissive: '#e8b674', emissiveIntensity: 0.2});
  // The lakeside road follows the right-hand shore at a steady 15 units inland, so it runs
  // along the level bank top (never down a slope into the lake). Cars, walkers and cottages
  // all use it.
  const roadPoints = [];
  for (let z = 46; z >= -150; z -= 3) {
    let x = 11;
    while (landDistance(0, x, z) < 0 && x < 140) x += 0.5;
    roadPoints.push(new T.Vector3(x + 15, 0, z));
  }
  const roadCurve = new T.CatmullRomCurve3(roadPoints),
    roadLength = roadCurve.getLength(),
    // Real scale (1 m = 1.37 units; the angler is 2.45): a two-lane road about 6.5 m wide.
    ROAD_W = 9,
    roadSegs = 320,
    roadPos = [],
    roadCol = [],
    roadIdx = [];
  const sideOf = (u, off, out = new T.Vector3()) => {
    const p = roadCurve.getPointAt(u),
      t = roadCurve.getTangentAt(u);
    return out.set(p.x - t.z * off, 0, p.z + t.x * off);
  };
  const tarmac = new T.Color('#34383a'),
    verge = new T.Color('#6f6c5c'),
    paint = new T.Color('#cfc8ab');
  for (let i = 0; i <= roadSegs; i++) {
    const u = i / roadSegs;
    for (const [k, off] of [-ROAD_W / 2 - 0.9, -ROAD_W / 2, -0.09, 0.09, ROAD_W / 2, ROAD_W / 2 + 0.9].entries()) {
      const q = sideOf(u, off);
      roadPos.push(q.x, ground(q.x, q.z) + (k === 0 || k === 5 ? 0.02 : 0.07), q.z);
      // Dashed centre line, plain tarmac, gravel verges.
      const c = k === 0 || k === 5 ? verge : (k === 2 || k === 3) && Math.floor((u * roadLength) / 4.5) % 2 ? paint : tarmac;
      roadCol.push(c.r, c.g, c.b);
    }
    if (i < roadSegs)
      for (let k = 0; k < 5; k++) {
        const a = i * 6 + k,
          b = a + 6;
        roadIdx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  const roadGeo = new T.BufferGeometry();
  roadGeo.setAttribute('position', new T.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('color', new T.Float32BufferAttribute(roadCol, 3));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();
  const road = new T.Mesh(roadGeo, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.95, envMapIntensity: 0.3}));
  road.receiveShadow = true;
  fresh.add(road);
  // Cottages stand back from the road on the inland side, facing it and the lake.
  const cottageList = [];
  for (let i = 0; i < 7; i++) {
    const u = 0.1 + i * 0.05 + (i % 2) * 0.015,
      q = sideOf(u, 15 + (i % 3) * 2.5),
      t = roadCurve.getTangentAt(u),
      h = cottage(i + 1, glowMat);
    h.position.set(q.x, ground(q.x, q.z) - 0.12, q.z);
    h.scale.setScalar(1.55 + ((i * 37) % 10) * 0.05);
    h.rotation.y = Math.atan2(t.z, -t.x) + ((i % 3) - 1) * 0.12;
    fresh.add(h);
    cottageList.push(h);
  }
  const ambience = createAmbience({fresh, salt}, {ground, roadCurve, roadLength, sideOf, cottages: cottageList});
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const c = carModel(i + 1);
    c.rotation.order = 'YXZ';
    c.userData.u = i / 4;
    c.userData.dir = i % 2 ? -1 : 1;
    c.userData.speed = 9 + (i % 3) * 1.6;
    fresh.add(c);
    cars.push(c);
  }
  const walkers = [];
  for (let i = 0; i < 6; i++) {
    const w = walkerModel(i + 1);
    w.scale.setScalar(1.8 + ((i * 7) % 5) * 0.05);
    w.userData.u = 0.04 + i * 0.05;
    w.userData.dir = i % 2 ? -1 : 1;
    fresh.add(w);
    walkers.push(w);
  }
  // Coastal land, palms, and a small living waterfront.
  // Each saltwater region has its own coastline: Harbor Reach a town, Sunbreak Reef a palm
  // island with coral heads around the boat, the Open Blue nothing but horizon.
  const harbor = new T.Group(),
    island = new T.Group(),
    reef = new T.Group();
  salt.add(harbor, island, reef);
  const coralMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.7, side: T.DoubleSide});
  addSway(coralMat, 0.02, 0.6);
  // Staghorn (seed % 3 === 0) and brain corals (seed % 3 === 1); sea fans stay out of sight.
  for (const [i, seed] of [3, 6, 9, 1, 4, 7].entries()) {
    const brain = seed % 3 === 1,
      geo = coralGeometry(seed),
      heads = new T.InstancedMesh(geo, coralMat, 7);
    for (let k = 0; k < 7; k++) {
      const a = (i * 7 + k) * 2.39,
        d = 5 + ((i * 7 + k) % 9) * 2.6,
        x = Math.sin(a) * d,
        z = 6 - Math.abs(Math.cos(a)) * d * 1.4;
      // Coral heads break the surface at low water; the shallows themselves are painted by the water shader.
      matrix.position.set(x, (brain ? -0.62 : -0.38) - ((k * 13) % 5) * 0.05, z);
      matrix.rotation.set(0, a, 0);
      matrix.scale.setScalar(0.8 + ((k * 5) % 4) * 0.25);
      matrix.updateMatrix();
      heads.setMatrixAt(k, matrix.matrix);
    }
    heads.computeBoundingSphere();
    reef.add(heads);
  }

  const palmMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.8, side: T.DoubleSide});
  addSway(palmMat, 0.03, 3);
  for (let i = 0; i < 11; i++) {
    const p = new T.Mesh(palmGeometry(i + 3), palmMat);
    p.position.set(-53 + i * 2.3, 2, -64 + (i % 3) * 3);
    p.rotation.y = i * 1.3;
    island.add(p);
  }
  // A stone quay the waterfront stands on (the buildings used to stand on open water).
  const quay = mesh(box, mat('#8d8a7d', {roughness: 0.95}), [-13.5, 0.4, -83], [50, 1.6, 15], harbor);
  quay.receiveShadow = true;
  mesh(box, mat('#6f6d63', {roughness: 0.95}), [-13.5, 1.22, -75.6], [50, 0.12, 0.5], harbor);
  for (let k = 0; k < 12; k++) mesh(cyl, mat('#4c4a43'), [-37 + k * 4.3, 0.3, -75.3], [0.18, 1.4, 0.18], harbor);
  // Waterfront at real scale: seven buildings two to four storeys high along the quay.
  for (let i = 0; i < 7; i++) {
    const b = harborBuilding(i + 1, glowMat);
    b.position.set(-34 + i * 6.8, 1.15, -80.5 - (i % 3) * 2.4);
    b.scale.setScalar(2 + ((i * 5) % 4) * 0.15);
    harbor.add(b);
  }
  const boat = boatModel;
  const fleet = [],
    sailors = [];
  // Four distant boats: two under way, two riding at anchor.
  for (let i = 0; i < 4; i++) {
    const b = boat(0.55 + i * 0.12, i % 2);
    common.add(b);
    if (i % 2 === 0) {
      mesh(cyl, mat('#a8b4a6'), [0, 1.6, 0], [0.035, 3.2, 0.035], b);
      mesh(cyl, mat('#a8b4a6'), [0.65, 0.62, 0], [0.025, 1.3, 0.025], b).rotation.z = Math.PI / 2;
      // Mainsail and jib as gently billowing curved panels.
      // pts: [head, tack, clew]; the panel narrows from the foot to the head.
      const sail = ([head, tack, clew], belly) => {
        const geo = new T.PlaneGeometry(1, 1, 8, 8),
          p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const u = p.getX(k) + 0.5,
            v = p.getY(k) + 0.5,
            w = 1 - v;
          p.setXYZ(k, tack[0] + (clew[0] - tack[0]) * u * w, tack[1] + (head[1] - tack[1]) * v, Math.sin(u * Math.PI) * belly * w);
        }
        geo.computeVertexNormals();
        return geo;
      };
      mesh(sail([[0.06, 3.1], [0.06, 0.65], [1.3, 0.65]], 0.25), mat('#ece6d2', {side: T.DoubleSide}), [0, 0, 0], [1, 1, 1], b);
      mesh(sail([[-0.06, 2.6], [-0.06, 0.7], [-1.2, 0.7]], 0.18), mat('#e3dcc6', {side: T.DoubleSide}), [0, 0, 0], [1, 1, 1], b);
    }
    fleet.push(b);
    const sailor = {x: 0, z: -90 - i * 6, heading: Math.random() * Math.PI * 2, speed: 0.6, cruise: 0.55 + i * 0.1, size: 0.55 + i * 0.12, seed: i * 1.7, turnLeft: 0, moored: i >= 2};
    sailors.push(sailor);
  }
  let currentRegion = state.region || 0,
    fleetRegion = -1;
  // Land under a point for the current region (water level is 0): the same landscape the
  // player sees, so boats see the real shore.
  const landHeight = (x, z) => regionLand(currentRegion, x, z);
  // Each water's sailing area, where distant boats are visible without crowding the view.
  const SAIL = [
    [-70, 70, -175, -62],
    [-70, 70, -175, -62],
    [-70, 70, -175, -62],
    [-90, 90, -72, -18],
    [-90, 90, -150, -18],
    [-100, 100, -170, -18],
  ];
  // Moorings: two boats in every water sit at anchor instead of all of them sailing.
  const MOORINGS = [
    [[-36, -128], [44, -112]],
    [[-36, -128], [44, -112]],
    [[-36, -128], [44, -112]],
    [[-24, -71.5], [-3, -71.5]],
    [[-20, -50], [28, -44]],
    [[-42, -95], [60, -62]],
  ];
  // Open water with a hull-sized margin, inside the distant sailing area.
  function sailable(x, z) {
    const [x0, x1, z0, z1] = SAIL[currentRegion] || SAIL[0];
    if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    for (const [dx, dz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) if (landHeight(x + dx, z + dz) > -0.2) return false;
    return true;
  }
  function placeOnWater(s) {
    const [x0, x1, z0, z1] = SAIL[currentRegion] || SAIL[0];
    for (let k = 0; k < 400; k++) {
      const x = x0 + Math.random() * (x1 - x0),
        z = z0 + Math.random() * (z1 - z0);
      if (sailable(x, z)) {
        s.x = x;
        s.z = z;
        s.turnLeft = 0;
        return;
      }
    }
  }
  function moor(s, slot) {
    const [x, z] = MOORINGS[currentRegion][slot];
    if (sailable(x, z)) {
      s.x = x;
      s.z = z;
    } else placeOnWater(s);
    s.heading = slot * 2.1 + currentRegion;
    s.speed = 0;
  }
  const fleetMotion = [],
    anchoredMotion = createHullMotion();
  let anchored = boat(1.55, state.boat),
    boatTier = state.boat;
  anchored.position.set(0, 0.35, 8.7);
  const shadeBoat = b => b.traverse(o => o.isMesh && (o.castShadow = o.receiveShadow = true));
  shadeBoat(anchored);
  salt.add(anchored);
  const titleShore = new T.Group();
  titleShore.visible = false;
  common.add(titleShore);
  terrain(17, 23, 18, 22, 1.4, '#b5ae8e', titleShore);
  const shoreRocks = new T.InstancedMesh(rockGeometry(21, false, ['#9d9a84', '#b3ae96']), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.95}), 18);
  for (let i = 0; i < 18; i++) {
    const x = 11 + (i % 6) * 1.4 + Math.sin(i * 3.1) * 0.4,
      z = 18 + Math.floor(i / 6) * 2 + Math.cos(i * 2.3) * 0.5;
    matrix.position.set(x, 0.45, z);
    matrix.rotation.set(0, i * 1.7, 0);
    matrix.scale.set(0.25 + (i % 3) * 0.08, 0.16, 0.3);
    matrix.updateMatrix();
    shoreRocks.setMatrixAt(i, matrix.matrix);
  }
  shoreRocks.computeBoundingSphere();
  titleShore.add(shoreRocks);
  // Rain as falling streaks round the angler (a short line per drop, slanted by the wind).
  const DROPS = 900,
    rainGeo = new T.BufferGeometry(),
    rainPos = new Float32Array(DROPS * 6);
  for (let i = 0; i < DROPS; i++) {
    const x = (Math.random() - 0.5) * 44,
      y = Math.random() * 16,
      z = 8 + (Math.random() - 0.5) * 46;
    rainPos.set([x, y, z, x, y + 0.45, z], i * 6);
  }
  rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
  const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({color: '#b9cfd4', transparent: true, depthWrite: false, opacity: 0.32}));
  rain.frustumCulled = false;
  common.add(rain);
  rain.visible = false;
  const sun = new T.Mesh(new T.SphereGeometry(2.5, 24, 16), new T.MeshBasicMaterial({color: '#ffe1a0'}));
  common.add(sun);
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const bird = gull(i + 1);
    bird.scale.setScalar(1.3);
    common.add(bird);
    birds.push(bird);
  }
  return {
    // Grass density follows the graphics setting; placements are random, so any prefix of
    // the instances is an even scatter.
    setDetail(quality) {
      grass.count = {battery: 900, balanced: 1800, crisp: 2600, ultra: GRASS_MAX}[quality] || 1800;
      land.setDetail(quality);
    },
    update(dt, t, region, c) {
      updateSway(t, c.weather === 'wind' || c.weather === 'storm');
      ambience.update(dt, t, region, c);
      currentRegion = region;
      const ocean = region >= 3;
      fresh.visible = !ocean;
      salt.visible = ocean;
      harbor.visible = region === 3;
      lilyGroup.visible = region === 0;
      if (lilyGroup.visible) {
        for (const s of lilySpots) {
          const y = water.height(s.x, s.z, t),
            tiltX = (water.height(s.x, s.z + 0.4, t) - y) * 2,
            tiltZ = (water.height(s.x + 0.4, s.z, t) - y) * 2;
          matrix.position.set(s.x, y + 0.015, s.z);
          matrix.rotation.set(-tiltX, s.rot + Math.sin(t * 0.2 + s.rot) * 0.1, tiltZ);
          matrix.scale.setScalar(s.scale);
          matrix.updateMatrix();
          lilies[s.kind].setMatrixAt(s.index, matrix.matrix);
        }
        for (const l of lilies) {
          l.instanceMatrix.needsUpdate = true;
          l.computeBoundingSphere();
        }
      }
      island.visible = region === 3 || region === 4;
      reef.visible = region === 4;
      glowMat.emissiveIntensity = c.phase === 'night' ? 1.4 : c.phase === 'dusk' ? 0.8 : 0.1;
      const lamps = c.phase === 'night' ? 1 : c.phase === 'dusk' ? 0.55 : ['rain', 'mist', 'storm', 'overcast'].includes(c.weather) ? 0.3 : 0.02;
      for (const car of cars) {
        car.userData.lights[0].emissiveIntensity = 0.1 + lamps * 3;
        car.userData.lights[1].emissiveIntensity = 0.15 + lamps * 2.2;
      }
      // Traffic: cars keep to their lane, follow the road's curves and slopes, and wrap round
      // out of sight at the far ends.
      const fwd = new T.Vector3(),
        back = new T.Vector3();
      for (const c of cars) {
        const d = c.userData;
        d.u = (d.u + (d.dir * d.speed * dt) / roadLength + 1) % 1;
        const lane = d.dir > 0 ? 2.2 : -2.2,
          q = sideOf(d.u, lane),
          tan = roadCurve.getTangentAt(d.u).multiplyScalar(d.dir);
        sideOf(Math.min(1, Math.max(0, d.u + (d.dir * 1.9) / roadLength)), lane, fwd);
        sideOf(Math.min(1, Math.max(0, d.u - (d.dir * 1.9) / roadLength)), lane, back);
        const y = (ground(fwd.x, fwd.z) + ground(back.x, back.z)) / 2 + 0.07,
          pitch = Math.atan2(ground(fwd.x, fwd.z) - ground(back.x, back.z), 3.8);
        c.position.set(q.x, y, q.z);
        c.rotation.set(0, Math.atan2(-tan.z, tan.x), pitch);
        c.visible = d.u > 0.01 && d.u < 0.99;
        for (const w of d.wheels) w.rotation.z = -t * d.speed * 2.1;
      }
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i],
          d = w.userData;
        d.u = (d.u + (d.dir * 1.9 * d.pace * dt) / roadLength + 1) % 1;
        const q = sideOf(d.u, -ROAD_W / 2 - 2 - (i % 2) * 0.7),
          tan = roadCurve.getTangentAt(d.u).multiplyScalar(d.dir),
          stride = Math.sin(t * 4.2 * d.pace + i);
        w.position.set(q.x, ground(q.x, q.z) + 0.02 + Math.abs(stride) * 0.04, q.z);
        w.rotation.y = Math.atan2(tan.x, tan.z);
        d.legs[0].rotation.x = stride * 0.45;
        d.legs[1].rotation.x = -stride * 0.45;
        d.arms[0].rotation.x = -stride * 0.35;
        d.arms[1].rotation.x = stride * 0.35;
      }
      // Distant boats steer around the shore instead of sailing through it.
      if (fleetRegion !== region) {
        fleetRegion = region;
        land.setRegion(region);
        sailors.forEach((s, i) => (s.moored ? moor(s, i - 2) : !sailable(s.x, s.z) && placeOnWater(s)));
      }
      for (let i = 0; i < fleet.length; i++) {
        const b = fleet[i],
          s = sailors[i].moored ? sailors[i] : steerBoat(sailors[i], dt, sailable, t),
          pose = orientedPose(water.height, s.x, s.z, t, s.heading, 4.1 * s.size, 1.8 * s.size);
        fleetMotion[i] ??= createHullMotion({heave: 2.6, pitch: 3, roll: 2.4});
        const m = fleetMotion[i].step(dt, hullTarget(pose, 0, 0));
        b.position.set(s.x, m.y, s.z);
        b.rotation.order = 'YXZ';
        // Boats at anchor swing slowly round their mooring with the wind.
        const swing = s.moored ? Math.sin(t * 0.05 + i * 2) * 0.35 : 0;
        b.rotation.set(m.rx, -s.heading + swing, m.rz + Math.min(0.12, Math.abs(s.turnLeft) * 0.05) * Math.sign(s.turnLeft));
      }
      if (boatTier !== state.boat) {
        salt.remove(anchored);
        anchored.traverse(o => {
          if (o.isMesh) {
            o.geometry.dispose();
            o.material.dispose();
          }
        });
        anchored = boat(1.55, state.boat);
        shadeBoat(anchored);
        salt.add(anchored);
        boatTier = state.boat;
      }
      const hull = buoyancyPose(water.height, 0, 8.7, t, 5.6, 2.4);
      anchored.position.x = 0;
      anchored.position.z = 8.7;
      const motion = anchoredMotion.step(dt, hullTarget(hull, 0.28));
      anchored.position.y = motion.y;
      anchored.rotation.x = motion.rx;
      anchored.rotation.z = motion.rz;
      const storm = c.weather === 'storm';
      rain.visible = c.weather === 'rain' || storm;
      if (rain.visible) {
        const p = rainPos,
          fall = dt * (storm ? 17 : 11),
          drift = dt * (storm ? 3.2 : 0.6),
          slant = storm ? 0.16 : 0.04,
          len = storm ? 0.75 : 0.5,
          shown = storm ? DROPS : Math.round(DROPS * 0.6);
        rain.geometry.setDrawRange(0, shown * 2);
        rain.material.opacity = storm ? 0.42 : 0.3;
        for (let i = 0; i < shown; i++) {
          const k = i * 6;
          let x = p[k] + drift,
            y = p[k + 1] - fall;
          if (y < 0) {
            y = 14 + Math.random() * 2;
            x = (Math.random() - 0.5) * 44;
          }
          if (x > 22) x -= 44;
          p[k] = x;
          p[k + 1] = y;
          p[k + 3] = x - slant * len * 3;
          p[k + 4] = y + len;
          p[k + 5] = p[k + 2];
        }
        const a = rainGeo.attributes.position;
        a.needsUpdate = true;
      }
      const angle = (c.cycle / 0.64) * Math.PI;
      sun.position.set(Math.cos(angle) * 65, Math.sin(angle) * 55 + 8, -95);
      sun.visible = c.phase !== 'night';
      for (let i = 0; i < birds.length; i++) {
        const a = t * 0.04 + i,
          heading = Math.cos(a) > 0 ? 1 : -1;
        birds[i].position.set(Math.sin(a) * 35, 10 + (i % 3) + Math.sin(t * 0.7 + i) * 0.4, -35 - i * 2 + Math.sin(t * 0.3 + i) * 2);
        birds[i].rotation.set(0, (heading * Math.PI) / 2, -heading * Math.sin(a) * 0.25);
        flapGull(birds[i], t);
      }
    },
    setTitle(on) {
      titleShore.visible = on;
    },
    // A hooked fish pulling toward open water (-z) heels the skiff that way.
    tug(amount) {
      anchoredMotion.kick('rx', -amount);
      anchoredMotion.kick('y', -amount * 0.4);
    },
    // Exposed for tests: distant boats' steering state and the region's land map.
    // The sun disc is drawn by the scene's sky pass.
    sunDisc: sun,
    get sailors() {
      return sailors;
    },
    landHeight,
    groundAt: (x, z) => landHeight(x, z),
    get anchored() {
      return anchored;
    },
  };
}
