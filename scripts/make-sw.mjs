import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
const root=join(process.cwd(),'dist');
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});const files=[];for(const entry of entries){const full=join(dir,entry.name);if(entry.isDirectory())files.push(...await walk(full));else files.push(full)}return files}
const files=(await walk(root)).map(file=>relative(root,file).split(sep).join('/')).filter(file=>file!=='sw.js'&&!file.endsWith('.map')).sort();
const revision=createHash('sha256').update((await Promise.all(files.map(async file=>`${file}:${createHash('sha256').update(await readFile(join(root,file))).digest('hex')}`))).join('\n')).digest('hex').slice(0,12);
const precache=files.map(file=>`./${file}`);
const sw=`const CACHE='escrew-${revision}';\nconst PRECACHE=${JSON.stringify(precache)};\nself.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting()))});\nself.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('escrew-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});\nself.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response}).catch(async()=>(await caches.match(request))||(await caches.match('./index.html'))));return}event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}return response})))})`;
await writeFile(join(root,'sw.js'),sw,'utf8');
console.log(`Generated eScrew sw.js (${revision})`);
