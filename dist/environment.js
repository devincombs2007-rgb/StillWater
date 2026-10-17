import * as T from './assets/three.module.js';
import {surfaceTexture} from './textures.js?v=5';
import {buoyancyPose, createHullMotion, hullTarget} from './surface.js?v=5';
import {BOATS} from './economy.js?v=5';
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
      uniform vec3 fogColor;uniform float fogDensity;uniform float light;varying vec3 p;varying vec3 normalW;${bank}
      vec2 ripple(vec2 q,float t){return vec2(sin(q.x*3.1+q.y*1.3+t*1.9)+sin(q.x*5.7-q.y*4.1-t*2.7)*.5+sin(q.y*9.3+q.x*.7+t*3.9)*.25,
        cos(q.y*2.9-q.x*1.7+t*1.6)+cos(q.y*6.3+q.x*3.9-t*2.3)*.5+cos(q.x*8.7-q.y*1.1+t*4.3)*.25);}
      void main(){vec3 view=cameraPosition-p;float dist=length(view);view/=dist;
        float detail=(.035+rain*.05)*(1.-smoothstep(12.,70.,dist));vec2 r=ripple(p.xz,time)*detail;
        vec3 n=normalize(normalW+vec3(r.x,0.,r.y));
        if(rain>.02&&dist<40.){vec2 g=p.xz*1.7;vec2 id=floor(g);vec2 c=fract(g)-.5;float h=fract(sin(dot(id,vec2(12.9898,78.233)))*43758.5453);
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
  const treePositions = [];
  for (let i = 0; i < 44; i++) {
    const side = i % 2 ? -1 : 1;
    treePositions.push([
      side * (12 + Math.random() * 17),
      1.7 + Math.random(),
      -35 + Math.random() * 55,
      3.5 + Math.random() * 5,
    ]);
  }
  const trunks = new T.InstancedMesh(cyl, mat('#6b5b46'), treePositions.length),
    canopy = new T.InstancedMesh(sphere, mat('#ffffff'), treePositions.length * 9),
    matrix = new T.Object3D();
  fresh.add(trunks, canopy);
  let leaf = 0;
  for (let i = 0; i < treePositions.length; i++) {
    const [x, y, z, h] = treePositions[i];
    matrix.position.set(x, y + h * 0.36, z);
    matrix.scale.set(0.2, h * 0.72, 0.2);
    matrix.rotation.set(0, 0, (Math.random() - 0.5) * 0.08);
    matrix.updateMatrix();
    trunks.setMatrixAt(i, matrix.matrix);
    for (let j = 0; j < 9; j++) {
      const a = j * 2.4,
        r = (j % 3) * 0.6;
      matrix.position.set(x + Math.sin(a) * r, y + h * 0.72 + (j % 3) * 0.65, z + Math.cos(a) * r);
      matrix.scale.set(1.5 + (j % 2) * 0.4, 1.3, 1.5);
      matrix.rotation.set(0.2 * a, 0.3 * a, 0.15 * a);
      matrix.updateMatrix();
      canopy.setMatrixAt(leaf, matrix.matrix);
      canopy.setColorAt(leaf, new T.Color(['#41694e', '#527b57', '#365d48'][j % 3]));
      leaf++;
    }
  }
  const grassGeo = new T.PlaneGeometry(0.09, 0.8, 1, 3);
  grassGeo.translate(0, 0.4, 0);
  const grass = new T.InstancedMesh(grassGeo, mat('#80916a', {side: T.DoubleSide}), 1800);
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
  for (let i = 0; i < 38; i++) {
    const side = i % 2 ? -1 : 1;
    const stone = mesh(
      new T.DodecahedronGeometry(1, 2),
      mat(['#849083', '#75877d', '#8b9181'][i % 3]),
      [side * (7 + Math.random() * 9), 0.15, -28 + Math.random() * 41],
      [0.4 + Math.random() * 0.9, 0.3 + Math.random() * 0.6, 0.4 + Math.random() * 0.8],
    );
    stone.rotation.set(Math.random(), Math.random(), Math.random());
  }
  const glowMat = mat('#f7dcad', {emissive: '#e8b674', emissiveIntensity: 0.2});
  function house(x, z, scale = 1, par = fresh) {
    const h = new T.Group();
    h.position.set(x, par === fresh ? ground(x, z) : 2, z);
    h.scale.setScalar(scale);
    par.add(h);
    mesh(box, mat('#b4ae93'), [0, 1.5, 0], [3.5, 3, 3], h);
    const roof = mesh(new T.ConeGeometry(1, 1, 4), mat('#5c6860'), [0, 3.4, 0], [3, 1.5, 2.7], h);
    roof.rotation.y = Math.PI / 4;
    for (const xx of [-0.9, 0.9]) mesh(box, glowMat, [xx, 1.6, 1.515], [0.65, 0.85, 0.04], h);
    mesh(box, mat('#657764'), [0, 0.9, 1.52], [0.6, 1.8, 0.05], h);
    mesh(cyl, mat('#5d7065'), [1, 3.7, -0.6], [0.22, 1.5, 0.22], h);
    return h;
  }
  for (let i = 0; i < 6; i++) house(16 + i * 4.3, -29 - (i % 2) * 5, 0.65 + Math.random() * 0.3);
  const roadGeo = new T.PlaneGeometry(28, 2.3, 48, 1);
  roadGeo.rotateX(-Math.PI / 2);
  const roadVertices = roadGeo.attributes.position;
  for (let i = 0; i < roadVertices.count; i++)
    roadVertices.setY(i, ground(roadVertices.getX(i) + 25, roadVertices.getZ(i) - 21) + 0.045);
  roadGeo.computeVertexNormals();
  const road = mesh(roadGeo, mat('#646c64'), [25, 0, -21], [1, 1, 1]);
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const car = new T.Group();
    fresh.add(car);
    mesh(box, mat(['#a4b8b0', '#bca187', '#788c9d', '#c8c1ad'][i]), [0, 0.5, 0], [1.4, 0.55, 0.7], car);
    mesh(box, mat('#829c9e', {metalness: 0.35, roughness: 0.25}), [0, 0.9, 0], [0.75, 0.4, 0.64], car);
    for (const x of [-0.45, 0.45])
      for (const z of [-0.36, 0.36]) {
        const wheel = mesh(cyl, mat('#35413e'), [x, 0.26, z], [0.18, 0.09, 0.18], car);
        wheel.rotation.x = Math.PI / 2;
      }
    cars.push(car);
  }
  const walkers = [];
  for (let i = 0; i < 12; i++) {
    const person = new T.Group();
    fresh.add(person);
    mesh(sphere, mat(['#a58b78', '#9cafa0', '#8f9da9'][i % 3]), [0, 0.55, 0], [0.15, 0.3, 0.13], person);
    mesh(sphere, mat('#c5a788'), [0, 0.97, 0], [0.12, 0.14, 0.12], person);
    for (const x of [-0.07, 0.07]) mesh(cyl, mat('#5d706a'), [x, 0.2, 0], [0.045, 0.45, 0.045], person);
    walkers.push(person);
  }
  // Coastal land, palms, and a small living waterfront.
  terrain(-42, -63, 46, 42, 4, '#b5b28b', salt);
  terrain(44, -89, 45, 35, 5, '#a1a985', salt);
  for (let i = 0; i < 11; i++) {
    const x = -53 + i * 2.3,
      z = -64 + (i % 3) * 3,
      h = 4 + (i % 4);
    const palm = new T.Group();
    palm.position.set(x, 2, z);
    salt.add(palm);
    mesh(cyl, mat('#9a8e69'), [0, h * 0.5, 0], [0.12, h, 0.12], palm);
    for (let j = 0; j < 7; j++) {
      const shape = new T.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.4, 1.1, 0.3, 2.4, 0, 3);
      shape.bezierCurveTo(-0.3, 2.3, -0.4, 0.7, 0, 0);
      const frond = mesh(
        new T.ShapeGeometry(shape, 15),
        mat('#68896a', {side: T.DoubleSide}),
        [0, h, 0],
        [1, 1, 1],
        palm,
      );
      frond.rotation.set(1.0, (j * TAU) / 7, j * 0.1);
    }
  }
  for (let i = 0; i < 14; i++) {
    const height = 3 + (i % 5) * 1.9;
    mesh(
      box,
      mat(i % 2 ? '#b5bbaf' : '#96aca9'),
      [-35 + i * 3.3, height * 0.5 + 1, -79 - (i % 3) * 3],
      [2.2, height, 2.6],
      salt,
    );
    for (let j = 0; j < Math.floor(height); j++)
      mesh(box, glowMat, [-35 + i * 3.3, j + 1.7, -77.65 - (i % 3) * 3], [1.5, 0.35, 0.035], salt);
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
      mesh(cyl, mat('#a8b4a6'), [0, 1.5, 0], [0.035, 3, 0.035], b);
      const sailGeo = new T.BufferGeometry().setFromPoints([
        new T.Vector3(0.08, 2.8, 0),
        new T.Vector3(0.08, 0.45, 0),
        new T.Vector3(1.3, 0.45, 0),
      ]);
      sailGeo.setIndex([0, 1, 2]);
      sailGeo.computeVertexNormals();
      mesh(sailGeo, mat('#e3dec9', {side: T.DoubleSide}), [0, 0, 0], [1, 1, 1], b);
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
  for (let i = 0; i < 18; i++) {
    const x = 11 + (i % 6) * 1.4,
      z = 18 + Math.floor(i / 6) * 2;
    mesh(new T.SphereGeometry(1, 12, 8), mat('#aaa78d'), [x, 0.5, z], [0.2, 0.14, 0.3], titleShore);
  }
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
    const pts = [new T.Vector3(-0.2, 0, 0), new T.Vector3(0, 0.09, 0), new T.Vector3(0.2, 0, 0)];
    const bird = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({color: '#bcc9bb'}));
    common.add(bird);
    birds.push(bird);
  }
  return {
    update(dt, t, region, c) {
      const ocean = region >= 3;
      fresh.visible = !ocean;
      salt.visible = ocean;
      glowMat.emissiveIntensity = c.phase === 'night' ? 1.4 : c.phase === 'dusk' ? 0.8 : 0.1;
      for (let i = 0; i < cars.length; i++) {
        const phase = (t * 0.55 + i * 7) % 28;
        const carX = i % 2 ? 39 - phase : 11 + phase,
          carZ = -21 + (i % 2 ? 0.45 : -0.45);
        cars[i].position.set(carX, ground(carX, carZ) + 0.08, carZ);
        cars[i].rotation.y = i % 2 ? Math.PI : 0;
      }
      for (let i = 0; i < walkers.length; i++) {
        const px = 13 + ((t * 0.15 + i * 2.3) % 27),
          pz = -19.3 + (i % 3) * 0.25;
        walkers[i].position.set(px, ground(px, pz) + 0.04, pz);
        walkers[i].rotation.z = Math.sin(t * 3 + i) * 0.015;
        walkers[i].children[2].rotation.x = Math.sin(t * 3 + i) * 0.4;
        walkers[i].children[3].rotation.x = -Math.sin(t * 3 + i) * 0.4;
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
        birds[i].position.set(Math.sin(t * 0.04 + i) * 35, 10 + (i % 3), -35 - i * 2);
        birds[i].scale.y = 0.8 + Math.sin(t * 4 + i) * 0.4;
      }
    },
    setTitle(on) {
      titleShore.visible = on;
    },
    get anchored() {
      return anchored;
    },
  };
}
