import * as T from './assets/three.module.js';
import {surfaceTexture} from './textures.js?v=7';
import {buoyancyPose, createHullMotion, hullTarget} from './surface.js?v=7';
import {BOATS} from './economy.js?v=7';
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
} from './scenery.js?v=7';
const TAU = Math.PI * 2;
// Shoreline banks shared by the scenery, grass and the water shader's shallows.
const BANKS = [
  {cx: -23, cz: -7, w: 27, h: 3.4},
  {cx: 27, cz: -16, w: 32, h: 4.5},
];
export function bankHeight(x, z) {
  const b = x < 0 ? BANKS[0] : BANKS[1],
    xx = x - b.cx,
    zz = z - b.cz,
    edge = Math.max(0, 1 - Math.pow(Math.abs(xx) / (b.w * 0.5), 2));
  return -0.25 + Math.pow(edge, 0.7) * (b.h + Math.sin(xx * 0.25 + zz * 0.18) * b.h * 0.22 + Math.sin(zz * 0.47) * 0.2);
}
const IMPULSES = 16;
// Coherent surface model. The GLSL and JS height functions are kept identical so the
// float, boats and drips ride exactly the waves that are drawn.
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
  };
  const wave = `float height(vec2 p){float a=mix(.048,.22,ocean)*swell;
    float h=sin(p.x*.45+p.y*.68+time*.9)*a+sin(p.x*.71-p.y*.32+time*.7)*a*.55+sin(p.y*1.8+time*1.1)*.018
      +sin(p.x*1.3-p.y*.92+time*1.6)*a*.18+sin(p.x*-.23+p.y*.31+time*.52)*a*.42+sin(p.x*2.1+p.y*1.7+time*2.3)*a*.07;
    for(int i=0;i<${IMPULSES};i++){float age=time-impulses[i].z;float d=length(p-impulses[i].xy);
      if(age>0.&&age<8.)h+=sin(d*6.-age*8.)*exp(-pow(d-age*2.8,2.)*.7)*exp(-age*.65)*impulses[i].w;}
    return h;}`;
  // Horizontal distance from the nearest freshwater bank edge into open water.
  const bank = `float shoreDist(vec2 q){vec2 b=q.x<0.?vec2(-23.,13.5):vec2(27.,16.);return abs(q.x-b.x)-b.y;}`;
  const mat = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    vertexShader: `uniform float time;uniform float ocean;uniform float swell;uniform vec4 impulses[${IMPULSES}];varying vec3 p;varying vec3 normalW;${wave}
      void main(){vec3 v=position;v.y=height(v.xz);float e=.08;
        normalW=normalize(vec3(height(v.xz-vec2(e,0.))-height(v.xz+vec2(e,0.)),2.*e,height(v.xz-vec2(0.,e))-height(v.xz+vec2(0.,e))));
        p=v;gl_Position=projectionMatrix*modelViewMatrix*vec4(v,1.);}`,
    fragmentShader: `uniform float time;uniform float ocean;uniform float rain;uniform vec3 skyTop;uniform vec3 skyHorizon;uniform vec3 sunDir;uniform vec3 sunColor;
      uniform vec3 fogColor;uniform float fogDensity;uniform float light;uniform float detail;varying vec3 p;varying vec3 normalW;${bank}
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
        float sd=shoreDist(p.xz);float zr=p.x<0.?step(-41.,p.z)*step(p.z,27.):step(-53.5,p.z)*step(p.z,21.5);float shore=ocean>.5?0.:(1.-smoothstep(-.2,3.2,sd))*zr;float lap=ocean>.5?0.:(1.-smoothstep(.0,.55,abs(sd-.15+.12*sin(p.z*.9+time*.8))))*zr;
        vec3 body=mix(deep,shallow,.25+.2*sin(p.x*.14+p.z*.18)+shore*.55);
        body=mix(body,vec3(.42,.43,.3),shore*shore*.55);
        vec3 color=mix(body*light,sky,clamp(fres*.85+.08,0.,1.));
        float sd0=max(0.,dot(refl,sunDir));float spec=(pow(sd0,mix(260.,520.,ocean))*mix(1.8,1.1,ocean)+pow(sd0,40.)*.05)*(1.-smoothstep(25.,90.,dist)*.5);
        color+=sunColor*spec*smoothstep(-.05,.12,sunDir.y);
        float crest=ocean*smoothstep(.24,.42,p.y)*.35+lap*(.55+.45*sin(p.z*2.3+time*1.7))*.3;
        color+=crest*vec3(.75,.82,.8)*max(.35,light);
        float fog=1.-exp(-fogDensity*fogDensity*dist*dist);gl_FragColor=vec4(mix(color,fogColor,fog),1.);}`,
  });
  const geo = new T.PlaneGeometry(260, 230, 192, 160);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -65);
  const mesh = new T.Mesh(geo, mat);
  mesh.name = 'Lake water';
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
      wind += ((c.weather === 'wind' ? 1 : 0) - wind) * 0.02;
      swell = 1 + wind * 0.45;
      uniforms.time.value = t;
      uniforms.ocean.value = ocean;
      uniforms.swell.value = swell;
      uniforms.rain.value += ((c.weather === 'rain' ? 1 : 0) - uniforms.rain.value) * 0.02;
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
export function createEnvironment(parent, state, water) {
  const fresh = new T.Group(),
    salt = new T.Group(),
    common = new T.Group();
  parent.add(fresh, salt, common);
  salt.visible = false;
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
        edge = Math.max(0, 1 - Math.pow(Math.abs(x) / (w * 0.5), 2));
      const y = -0.25 + Math.pow(edge, 0.7) * (h + Math.sin(x * 0.25 + z * 0.18) * h * 0.22 + Math.sin(z * 0.47) * 0.2);
      a.setY(i, y);
    }
    g.computeVertexNormals();
    return mesh(g, mat(color), [cx, 0, cz], [1, 1, 1], par);
  }
  terrain(-23, -7, 27, 68, 3.4, '#55745b');
  terrain(27, -16, 32, 75, 4.5, '#506f56');
  terrain(0, 35, 80, 35, 3, '#58715a');
  function ground(x, z) {
    const left = x < 0,
      cx = left ? -23 : 27,
      cz = left ? -7 : -16,
      w = left ? 27 : 32,
      h = left ? 3.4 : 4.5,
      xx = x - cx,
      zz = z - cz,
      edge = Math.max(0, 1 - Math.pow(Math.abs(xx) / (w * 0.5), 2));
    return -0.25 + Math.pow(edge, 0.7) * (h + Math.sin(xx * 0.25 + zz * 0.18) * h * 0.22 + Math.sin(zz * 0.47) * 0.2);
  }
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
    placements[kind].push([x, ground(x, z) - 0.05, z, 0.85 + Math.random() * 0.45, Math.random() * TAU]);
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
  const grass = new T.InstancedMesh(grassGeo, addSway(mat('#80916a', {side: T.DoubleSide}), 0.16), 1800);
  fresh.add(grass);
  for (let i = 0; i < 1800; i++) {
    const side = i % 2 ? -1 : 1;
    matrix.position.set(side * (11.3 + Math.random() * 15), 1, -30 + Math.random() * 48);
    const xx = matrix.position.x - (side < 0 ? -23 : 27),
      zz = matrix.position.z - (side < 0 ? -7 : -16),
      hh = side < 0 ? 3.4 : 4.5,
      ww = side < 0 ? 27 : 32,
      edge = Math.max(0, 1 - Math.pow(Math.abs(xx) / (ww * 0.5), 2));
    matrix.position.y =
      -0.25 + Math.pow(edge, 0.7) * (hh + Math.sin(xx * 0.25 + zz * 0.18) * hh * 0.22 + Math.sin(zz * 0.47) * 0.2);
    matrix.scale.set(0.7 + Math.random(), 0.45 + Math.random(), 1);
    matrix.rotation.set(0.05, Math.random() * TAU, (Math.random() - 0.5) * 0.4);
    matrix.updateMatrix();
    grass.setMatrixAt(i, matrix.matrix);
  }
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
    fresh.add(stones);
  });
  const glowMat = mat('#f7dcad', {emissive: '#e8b674', emissiveIntensity: 0.2});
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 4.3,
      z = -29 - (i % 2) * 5,
      h = cottage(i + 1, glowMat);
    h.position.set(x, ground(x, z) - 0.1, z);
    h.scale.setScalar(0.62 + Math.random() * 0.25);
    h.rotation.y = (Math.random() - 0.5) * 0.3;
    fresh.add(h);
  }
  const roadGeo = new T.PlaneGeometry(28, 2.3, 48, 1);
  roadGeo.rotateX(-Math.PI / 2);
  const roadVertices = roadGeo.attributes.position;
  for (let i = 0; i < roadVertices.count; i++)
    roadVertices.setY(i, ground(roadVertices.getX(i) + 25, roadVertices.getZ(i) - 21) + 0.045);
  roadGeo.computeVertexNormals();
  const road = mesh(roadGeo, mat('#646c64'), [25, 0, -21], [1, 1, 1]);
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const c = carModel(i + 1);
    fresh.add(c);
    cars.push(c);
  }
  const walkers = [];
  for (let i = 0; i < 12; i++) {
    const w = walkerModel(i + 1);
    fresh.add(w);
    walkers.push(w);
  }
  // Coastal land, palms, and a small living waterfront.
  terrain(-42, -63, 46, 42, 4, '#b5b28b', salt);
  terrain(44, -89, 45, 35, 5, '#a1a985', salt);
  const palmMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.8, side: T.DoubleSide});
  addSway(palmMat, 0.03, 3);
  for (let i = 0; i < 11; i++) {
    const p = new T.Mesh(palmGeometry(i + 3), palmMat);
    p.position.set(-53 + i * 2.3, 2, -64 + (i % 3) * 3);
    p.rotation.y = i * 1.3;
    salt.add(p);
  }
  for (let i = 0; i < 14; i++) {
    const b = harborBuilding(i + 1, glowMat);
    b.position.set(-35 + i * 3.3, 1, -79 - (i % 3) * 3);
    salt.add(b);
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
  function boat(size = 1, style = 0) {
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
    const hull = mesh(geo, mat('#ffffff', {vertexColors: true, roughness: 0.55, side: T.DoubleSide}), [0, 0, 0], [1, 1, 1], g);
    hull.name = 'Hull';
    const woodLight = mat('#b39f7b', {map: surfaceTexture('wood')}),
      woodDark = mat('#7e6849', {map: surfaceTexture('wood')});
    for (const sideSign of [-1, 1]) {
      const rail = [];
      for (let i = 0; i <= hullStations; i++) {
        const p = hullPoint(i / hullStations, sideSign < 0 ? 0 : 1);
        rail.push(new T.Vector3(p[0], p[1] + 0.02, p[2]));
      }
      mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rail), 40, 0.045, 6, false), woodDark, [0, 0, 0], [1, 1, 1], g);
    }
    mesh(box, woodLight, [-0.15, 0.22, 0], [3.1, 0.06, 1.25], g);
    for (let k = -3; k <= 3; k++) mesh(box, woodDark, [-0.15, 0.255, k * 0.17], [3.05, 0.012, 0.02], g);
    for (const x of [-1.15, 0.95]) mesh(box, woodDark, [x, 0.42, 0], [0.34, 0.07, 1.62 - Math.abs(x) * 0.18], g);
    mesh(box, woodDark, [1.95, 0.85, 0], [0.12, 0.08, 0.08], g);
    if (style > 0) {
      mesh(box, mat('#e0dccc'), [-1.3, 0.8, 0], [1.1, 1.3, 1.05], g);
      mesh(box, mat('#8fadaf', {metalness: 0.3, roughness: 0.15}), [-1.3, 1.1, 0.54], [0.8, 0.55, 0.03], g);
      mesh(box, mat('#bdc9bd'), [-1.3, 1.53, 0], [1.45, 0.12, 1.5], g);
    }
    if (style === 2) {
      mesh(cyl, mat('#bfcabc', {metalness: 0.6}), [-1.3, 2.05, 0], [0.035, 1.05, 0.035], g);
      mesh(box, mat('#bac9c5'), [-1.3, 2.58, 0], [0.65, 0.08, 0.4], g);
      for (const side of [-1, 1]) {
        for (const x of [-1.5, -0.6, 0.6, 1.5])
          mesh(cyl, mat('#bdc9bb', {metalness: 0.6}), [x, 0.5, side * 0.74], [0.025, 0.65, 0.025], g);
        mesh(box, mat('#bfcbbb', {metalness: 0.55}), [0, 0.82, side * 0.74], [3.3, 0.035, 0.035], g);
      }
    }
    g.scale.setScalar(size);
    return g;
  }
  const fleet = [];
  for (let i = 0; i < 5; i++) {
    const b = boat(0.5 + i * 0.1, i % 2);
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
  }
  const fleetMotion = [],
    anchoredMotion = createHullMotion();
  let anchored = boat(1.55, state.boat),
    boatTier = state.boat;
  anchored.position.set(0, 0.35, 8.7);
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
  const rainGeo = new T.BufferGeometry(),
    rainPos = [];
  for (let i = 0; i < 500; i++)
    rainPos.push((Math.random() - 0.5) * 40, Math.random() * 15, (Math.random() - 0.5) * 45);
  rainGeo.setAttribute('position', new T.Float32BufferAttribute(rainPos, 3));
  const rain = new T.Points(
    rainGeo,
    new T.PointsMaterial({color: '#b4cbd0', size: 0.035, transparent: true, opacity: 0.5}),
  );
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
    update(dt, t, region, c) {
      updateSway(t, c.weather === 'wind');
      const ocean = region >= 3;
      fresh.visible = !ocean;
      salt.visible = ocean;
      glowMat.emissiveIntensity = c.phase === 'night' ? 1.4 : c.phase === 'dusk' ? 0.8 : 0.1;
      for (let i = 0; i < cars.length; i++) {
        const phase = (t * 0.55 + i * 7) % 28;
        const carX = i % 2 ? 39 - phase : 11 + phase,
          carZ = -21 + (i % 2 ? 0.45 : -0.45);
        cars[i].position.set(carX, ground(carX, carZ) + 0.02, carZ);
        cars[i].rotation.y = i % 2 ? Math.PI : 0;
        for (const w of cars[i].userData.wheels) w.rotation.z = -t * 0.55 * 7.7;
      }
      for (let i = 0; i < walkers.length; i++) {
        const px = 13 + ((t * 0.15 + i * 2.3) % 27),
          pz = -19.3 + (i % 3) * 0.25;
        const w = walkers[i],
          stride = Math.sin(t * 4.2 * w.userData.pace + i);
        w.position.set(px, ground(px, pz) + 0.02 + Math.abs(stride) * 0.02, pz);
        w.rotation.y = Math.PI / 2;
        w.userData.legs[0].rotation.x = stride * 0.45;
        w.userData.legs[1].rotation.x = -stride * 0.45;
        w.userData.arms[0].rotation.x = -stride * 0.35;
        w.userData.arms[1].rotation.x = stride * 0.35;
      }
      for (let i = 0; i < fleet.length; i++) {
        const b = fleet[i];
        const bx = Math.sin(t * 0.015 + i * 1.7) * 42,
          bz = -35 - i * 8;
        const pose = buoyancyPose(water.height, bx, bz, t, 3, 1.2),
          yaw = Math.cos(t * 0.015 + i * 1.7) > 0 ? 0 : Math.PI;
        fleetMotion[i] ??= createHullMotion({heave: 2.6, pitch: 3, roll: 2.4});
        b.position.set(bx, pose.y, bz);
        const m = fleetMotion[i].step(dt, hullTarget(pose, 0, yaw));
        b.position.y = m.y;
        b.rotation.y = yaw;
        b.rotation.x = m.rx;
        b.rotation.z = m.rz;
        b.visible = i < 3 || Math.sin(t * 0.02 + i) > 0.3;
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
      rain.visible = c.weather === 'rain';
      if (rain.visible) {
        const a = rainGeo.attributes.position;
        for (let i = 0; i < a.count; i++) {
          let y = a.getY(i) - dt * 9;
          if (y < 0) y = 15;
          a.setY(i, y);
          a.setX(i, a.getX(i) + dt * 0.4);
        }
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
    get anchored() {
      return anchored;
    },
  };
}
