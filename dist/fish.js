import * as T from './assets/three.module.js';
const PI=Math.PI,TAU=PI*2;
const eyeGeo=new T.SphereGeometry(1,12,9);
const white=new T.Color('#f2dfb5'),dark=new T.Color('#163b43');
function profile(f){const type=f.shape;return {h:type==='disc'?.67:type==='angel'?.58:type==='fancy'?.43:type==='round'?.42:type==='catfish'?.28:type==='eel'?.16:.29,w:type==='disc'||type==='angel'?.19:type==='fancy'?.32:type==='eel'?.15:.23,len:type==='arowana'?2.45:type==='dragon'?2.7:type==='eel'?2.45:1.84,tail:type==='betta'?.8:type==='fancy'?.7:type==='guppy'?.55:type==='dragon'?.58:.38};}
function bodyColor(f,u,a){const c=new T.Color(f.color),dorsal=Math.sin(a);c.multiplyScalar(.73+Math.max(0,dorsal)*.15);if(dorsal<-.1)c.lerp(white,Math.min(.65,(-dorsal-.1)*.7));
 const id=f.id;
 if(['perch','midnight','ram','peacock','molly'].includes(id)&&Math.sin(u*34+(id==='ram'?1:0))>.53)c.lerp(dark,.48);
 if(['danio','cardinal','tetra'].includes(id)){if(Math.abs(dorsal-.12)<.19)c.set(id==='cardinal'?'#54d6df':'#78cbbd');if(id==='cardinal'&&dorsal<-.12)c.set('#d25c68');if(id==='danio'&&Math.sin(dorsal*22)>.3)c.lerp(dark,.6);}
 if(f.shape==='koi'){if(Math.sin(u*17+Math.cos(a*2)*2)>.36&&u>.16)c.set(id==='ribbonkoi'?'#c75036':'#bd7753');if(Math.sin(u*30+a*4)<-.82)c.set('#37484a');}
 if(['trout','char','gourami','starpearl','peacock'].includes(id)&&Math.sin(u*107)*Math.cos(a*17)>.68&&u<.78){c.set(id==='trout'||id==='char'?'#846c75':'#e0e3d0');}
 if(['discus','mandarin'].includes(id)&&Math.sin(u*45+Math.sin(a*6)*2)>.45)c.lerp(new T.Color(f.fin),.75);
 if(id==='clown'&&(Math.abs(u-.25)<.055||Math.abs(u-.58)<.06||Math.abs(u-.82)<.045))c.set('#eee5c7');if(['moorish','banner','reefbutter'].includes(id)&&Math.sin(u*18)>.55)c.lerp(dark,.85);if(id==='tang'&&u<.25)c.set('#ddc36b');if(id==='mackerel'&&dorsal>.2&&Math.sin(u*78)>.5)c.lerp(dark,.5);if(id==='cory'&&(u>.73||u<.16))c.lerp(dark,.8);
 // Subtle offset scale rows catch the light without separate meshes.
 const row=Math.floor((a+PI)/.24),scale=Math.cos(u*160+(row%2)*PI);c.multiplyScalar(.97+scale*.035);
 return c;}
function gridGeometry(rows,cols,fn){const pos=[],colors=[],uv=[],index=[];for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){const u=i/rows,v=j/cols;const {p,c}=fn(u,v);pos.push(...p);colors.push(c.r,c.g,c.b);uv.push(u,v);}for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;index.push(a,b,a+1,b,b+1,a+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;}
export function createFish(f){const g=new T.Group(),p=profile(f),tailX=-p.len*.48,headX=p.len*.52;g.name=f.name;
 const bodyGeo=gridGeometry(40,24,(u,v)=>{const a=v*TAU,round=Math.pow(Math.sin(PI*u),.69),shoulder=1.04-.13*u;return {p:[tailX+u*p.len,Math.sin(a)*p.h*round*shoulder,Math.cos(a)*p.w*round],c:bodyColor(f,u,a)};});
 const skin=new T.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.22,transparent:f.id==='glasscat',opacity:f.id==='glasscat'?.64:1});
 const body=new T.Mesh(bodyGeo,skin);g.add(body);
 const finMaterial=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.44,metalness:.12,transparent:true,opacity:f.shape==='betta'?.82:.9,depthWrite:false});
 const fins=[];function addFin(geometry,parent=g){const m=new T.Mesh(geometry,finMaterial);parent.add(m);fins.push({mesh:m,base:geometry.attributes.position.array.slice()});return m;}
 const finC=new T.Color(f.fin),edge=new T.Color(f.color).lerp(white,.32);
 function finColor(u,v){const c=finC.clone().lerp(edge,u*.65);if(Math.cos(v*PI*36)>.75)c.multiplyScalar(.77);return c;}
 const tail=new T.Group();tail.position.x=tailX+.06;g.add(tail);
 addFin(gridGeometry(14,28,(u,v)=>{const span=v*2-1,big=['betta','fancy','guppy'].includes(f.shape),length=big?.7:.58;const fork=big?-Math.sqrt(Math.max(0,1-span*span))*.2:Math.abs(span)*.19;const curl=big?Math.sin(v*PI*8)*.035*u:0;return {p:[-u*length+fork*u,span*p.tail*u+curl,Math.sin(v*PI*3)*.035*u],c:finColor(u,v)};}),tail);
 const dorsalHigh=f.shape==='angel'?.95:f.shape==='sail'?.65:f.shape==='betta'?.45:f.shape==='dragon'?.5:f.shape==='koi'?.16:.2;
 const analHigh=f.shape==='angel'?.85:f.shape==='betta'?.36:f.shape==='koi'?.12:.16;
 for(const [sign,height] of [[1,dorsalHigh],[-1,analHigh]]){addFin(gridGeometry(22,6,(u,v)=>{const x=tailX+.21+u*p.len*.68,bodyU=(x-tailX)/p.len;const root=Math.pow(Math.sin(PI*bodyU),.69)*p.h*.91;const envelope=f.shape==='angel'?Math.pow(u<.68?u/.68:(1-u)/.32,.8):Math.pow(Math.sin(PI*u),.65);const sail=envelope*height;return {p:[x,sign*(root+sail*v),Math.sin(u*PI*4)*.024*v],c:finColor(v,u)};}));}
 const pectorals=[];for(const side of [-1,1]){const fin=addFin(gridGeometry(9,10,(u,v)=>({p:[.18-u*.38,-.06-u*.13+(v-.5)*u*.27,side*(p.w*.8+u*.27)],c:finColor(u,v)})));pectorals.push(fin);
 const eyeX=headX-p.len*.17,bodyU=(eyeX-tailX)/p.len,wide=p.w*Math.pow(Math.sin(PI*bodyU),.69);const eye=new T.Mesh(eyeGeo,new T.MeshStandardMaterial({color:'#101c20',roughness:.12,metalness:.2}));eye.position.set(eyeX,p.h*.19,side*(wide+.007));eye.scale.set(.047,.05,.024);g.add(eye);const iris=new T.Mesh(new T.TorusGeometry(.048,.009,5,18),new T.MeshStandardMaterial({color:f.rarity>2?'#e9cf8f':'#c5b783',side:T.DoubleSide,metalness:.45,roughness:.3}));iris.position.copy(eye.position);iris.position.z+=side*.008;g.add(iris);
 const glint=new T.Mesh(eyeGeo,new T.MeshBasicMaterial({color:'#f8f6dc'}));glint.scale.set(.012,.013,.008);glint.position.copy(eye.position);glint.position.y+=.018;glint.position.x+=.012;glint.position.z+=side*.02;g.add(glint);
 const points=[];for(let i=0;i<=14;i++){const a=-1.05+i/14*2.1;points.push(new T.Vector3(headX-p.len*.28-Math.cos(a)*.055,Math.sin(a)*p.h*.78,side*(p.w*.89+Math.cos(a)*.012)));}const gill=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),14,.006,4,false),new T.MeshStandardMaterial({color:f.fin,roughness:.55}));g.add(gill);
 }
 if(['catfish','round','arowana'].includes(f.shape)){const feelers=f.shape==='catfish'?4:2;for(let j=0;j<feelers;j++){const side=j%2?1:-1,x=f.shape==='round'?.12:headX-.07;const curve=new T.CatmullRomCurve3([new T.Vector3(x,-p.h*.25,side*.06),new T.Vector3(x+.12,-p.h*.6,side*.17),new T.Vector3(x+.2,-p.h*(f.shape==='round'?2.5:1),side*.24)]);g.add(new T.Mesh(new T.TubeGeometry(curve,14,.008,4,false),new T.MeshStandardMaterial({color:f.fin,roughness:.5})));}}
 if(f.shape==='sword'){addFin(gridGeometry(8,4,(u,v)=>({p:[tailX-.25-u*.55,-.12-u*.18+v*.04,.01],c:finColor(u,v)})));}
 if(f.shape==='fancy'){const second=addFin(gridGeometry(10,18,(u,v)=>({p:[tailX-u*.6,(v*2-1)*.46*u,Math.sin(v*PI)*.2*u],c:finColor(u,v)})));second.rotation.y=.28;}
 if(['marlin','sailfish'].includes(f.id)){const bill=new T.Mesh(new T.ConeGeometry(.025,.65,10),new T.MeshStandardMaterial({color:f.fin,roughness:.4}));bill.rotation.z=-Math.PI/2;bill.position.set(headX+.24,.01,0);g.add(bill);}g.scale.setScalar(.59+(f.size-1)*.16);g.userData={tail,pectorals,fins,body,bodyBase:bodyGeo.attributes.position.array.slice(),profile:p,uid:null};return g;
}
export function animateFish(g,time,speed=1){const d=g.userData,p=d.profile,body=d.body.geometry.attributes.position,base=d.bodyBase;for(let i=0;i<body.count;i++){const x=base[i*3],u=(x+p.len*.48)/p.len,rear=Math.pow(1-u,2);body.setZ(i,base[i*3+2]+Math.sin(time*1.2-u*5)*.065*rear*speed);}body.needsUpdate=true;d.tail.rotation.y=Math.sin(time*1.2)*.19*speed;d.tail.position.z=Math.sin(time*1.2)*.06*speed;
 for(let f=0;f<d.fins.length;f++){const {mesh,base}=d.fins[f],a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=base[i*3],y=base[i*3+1];const flex=Math.min(1,Math.abs(y)/Math.max(.3,p.h));a.setZ(i,base[i*3+2]+Math.sin(time*1.15+x*4+f*.7)*.035*flex);}a.needsUpdate=true;}
 for(let i=0;i<d.pectorals.length;i++)d.pectorals[i].rotation.x=Math.sin(time*.75+i*PI)*.12;
}
export function disposeFish(g){const geos=new Set(),mats=new Set();g.traverse(o=>{if(o.isMesh){if(o.geometry!==eyeGeo)geos.add(o.geometry);mats.add(o.material);}});for(const geo of geos)geo.dispose();for(const material of mats)material.dispose();}
