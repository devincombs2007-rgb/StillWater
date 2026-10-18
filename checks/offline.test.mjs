import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
const listeners={},stores=new Map();let network=true,authRedirect=false,claimed=false;
const key=r=>typeof r==='string'?r:r.url||r.href;
const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {async put(k,v){map.set(key(k),v);},async match(k){return map.get(key(k));}};},async keys(){return [...stores.keys()];},async delete(k){return stores.delete(k);},async match(k){for(const m of stores.values())if(m.has(key(k)))return m.get(key(k));}};
function response(url,html=false){return {url:authRedirect?'https://auth.test/login':url,ok:true,redirected:authRedirect,clone(){return this;},async text(){return html?'<meta name="stillwater-build" content="3">':'game asset';}};}
const context={self:{location:new URL('https://game.test/sw.js'),clients:{async claim(){claimed=true;}},async skipWaiting(){},addEventListener(n,f){listeners[n]=f;}},caches,Request,Response,URL,fetch:async r=>{if(!network)throw Error('offline');const url=key(r);return response(url,new URL(url).pathname==='/'||url.includes('index.html'));}};
vm.runInNewContext(src,context);
let waiting;listeners.install({waitUntil(p){waiting=p;}});await waiting;assert.ok(stores.get('stillwater-pocket-v8').size>=16);
stores.set('stillwater-pocket-old',new Map());stores.set('other-app-cache',new Map());listeners.activate({waitUntil(p){waiting=p;}});await waiting;assert.equal(claimed,true);assert.ok(!stores.has('stillwater-pocket-old'));assert.ok(stores.has('other-app-cache'));
network=false;let result;listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://game.test/?app=1'},respondWith(p){result=p;}});assert.match(await (await result).text(),/stillwater-build/);
result=null;listeners.fetch({request:{method:'GET',mode:'cors',url:'https://game.test/game.js?v=8'},respondWith(p){result=p;}});assert.equal((await result).url,'https://game.test/game.js?v=8');
result=null;listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://game.test/oauth/login'},respondWith(p){result=p;}});assert.equal(result,null,'authentication routes are never intercepted');
network=true;authRedirect=true;listeners.install({waitUntil(p){waiting=p;}});await assert.rejects(waiting,/safely/);
const manifest=JSON.parse(await readFile(new URL('../dist/manifest.webmanifest',import.meta.url)));assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.ok((await readFile(new URL('../dist/'+icon.src,import.meta.url))).length>1000);
console.log('PASS: offline shell and modules, cache version cleanup, no auth-route interception, rejected login-page caching, and standalone app manifest/icons.');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(html,/apple-mobile-web-app-capable/);assert.match(html,/viewport-fit=cover/);assert.match(css,/-webkit-touch-callout: ?none/);assert.match(css,/-webkit-user-select: ?none/);assert.match(css,/user-select: ?text ?!important/);
console.log('PASS: iPhone home-screen metadata, safe-area viewport, no-selection CSS, and editable-input exception.');
{const {readdir}=await import('node:fs/promises');const dir=new URL('../dist/',import.meta.url),build=(await readFile(new URL('index.html',dir),'utf8')).match(/stillwater-build" content="(\d+)"/)[1];
for(const f of (await readdir(dir)).filter(f=>f.endsWith('.js')&&f!=='sw.js')){const code=await readFile(new URL(f,dir),'utf8');
 for(const [,m] of code.matchAll(/from '\.\/([\w-]+\.js)\?v=(\d+)'/g)){assert.ok(src.includes(`'./${m}?v=${build}'`),`${f} imports ${m}, which the offline cache must list at v${build}`);}
 for(const [,v] of code.matchAll(/from '\.\/[\w-]+\.js\?v=(\d+)'/g))assert.equal(v,build,`${f} imports a module at a stale version`);}
assert.match(await readFile(new URL('game.js',dir),'utf8'),new RegExp(`BUILD = ${build};`),'the on-screen build number matches the build marker');
console.log('PASS: every module the game imports is in the offline cache at the current build version, and the on-screen build number matches.');}
