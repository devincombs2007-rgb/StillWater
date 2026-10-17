import assert from 'node:assert/strict';
import {makeSwimmer,stepSwimmer} from '../dist/swimming.js';
import {SPECIES} from '../dist/economy.js';
import {createFish,animateFish,disposeFish} from '../dist/fish.js';
assert.equal(SPECIES.length,60);assert.equal(new Set(SPECIES.map(f=>f.id)).size,60);
for(const f of SPECIES){const model=createFish(f);let meshes=0,vertices=0;model.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count;}});// Static details (eyes, gills, lips, barbels) are merged into one draw call, so count parts plus that mesh.
assert.ok(meshes>=8);assert.ok(model.getObjectByName('Fish details'));assert.ok(vertices>3000);animateFish(model,.5);animateFish(model,1.5,1.2);model.traverse(o=>{if(o.isMesh){for(const attribute of Object.values(o.geometry.attributes))for(const n of attribute.array)assert.ok(Number.isFinite(n),f.name+' has valid animated geometry');}});disposeFish(model);}
const swimmers=Array.from({length:24},(_,i)=>makeSwimmer(i,24));const food={x:-2.1,y:3.3,z:.1};let initialDist=0,afterDist=0;
for(let i=0;i<24;i++)initialDist+=Math.hypot(swimmers[i].p.x-food.x,swimmers[i].p.y-food.y,swimmers[i].p.z-food.z);
for(let frame=0;frame<1000;frame++){for(const s of swimmers){const old={...s.p},yaw=s.yaw;stepSwimmer(s,1/60,frame/60,true,food,swimmers);const traveled=Math.hypot(s.p.x-old.x,s.p.y-old.y,s.p.z-old.z);assert.ok(traveled<=s.speed*1.65/60+.00001,'feeding respects a physical speed limit');assert.ok(Math.abs(s.yaw-yaw)<=s.turn/60+.00001,'fish turn gradually');assert.ok(s.p.x>=-4&&s.p.x<=4&&s.p.y>=.62&&s.p.y<=4.35&&Math.abs(s.p.z)<=2.15);}}
for(const s of swimmers)afterDist+=Math.hypot(s.p.x-food.x,s.p.y-food.y,s.p.z-food.z);assert.ok(afterDist<initialDist*.5,'fish actually swim toward food');
let minSpread=9;for(let frame=0;frame<3000;frame++){for(const s of swimmers)stepSwimmer(s,1/60,20+frame/60,false,food,swimmers);if(frame>900&&frame%60===0){const xs=swimmers.map(s=>s.p.x),mu=xs.reduce((a,b)=>a+b)/xs.length;minSpread=Math.min(minSpread,Math.sqrt(xs.reduce((a,b)=>a+(b-mu)**2,0)/xs.length));}}assert.ok(minSpread>1,'idle fish spread through the tank instead of clumping ('+minSpread.toFixed(2)+')');
console.log('PASS: all 60 detailed models animate with finite geometry; 24 fish swim to food with bounded speed, gradual turns, and tank containment.');
