import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

const APP_SHELL_CSS = `
html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;overscroll-behavior:none;touch-action:manipulation}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,sans-serif}
#root{height:100dvh;min-height:100dvh;isolation:isolate}
html *{scrollbar-width:none;-ms-overflow-style:none} html *::-webkit-scrollbar{display:none!important}
body{background:#F6F7FA;color:#0F172A;-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}
#root *{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,sans-serif!important}
::selection{background:rgba(45,125,255,.18)}
@media(prefers-color-scheme:dark){body{background:#0B1220;color:#F8FAFC}}
`;

const VISUAL_SKIN = `
(()=>{
  const root=()=>document.getElementById('root');
  const set=(el,name,value)=>{
    if(el.style.getPropertyValue(name)===value&&el.style.getPropertyPriority(name)==='important')return;
    el.style.setProperty(name,value,'important');
  };
  const eq=(value,...candidates)=>candidates.includes(value.replace(/\\s+/g,''));
  const normalized=(value)=>value.replace(/\\s+/g,'');

  const skinElement=(el)=>{
    if(!(el instanceof HTMLElement))return;
    const cs=getComputedStyle(el);
    const color=normalized(cs.color);
    const bg=normalized(cs.backgroundColor);
    const border=normalized(cs.borderColor);

    if(color==='rgb(16,35,38)')set(el,'color','#0F172A');
    else if(color==='rgb(96,119,122)')set(el,'color','#6B7280');
    else if(color==='rgb(0,127,134)')set(el,'color','#2D7DFF');
    else if(color==='rgb(166,122,36)')set(el,'color','#A58B4F');
    else if(color==='rgb(243,250,250)')set(el,'color','#F8FAFC');
    else if(color==='rgb(168,186,188)')set(el,'color','#98A2B3');
    else if(color==='rgb(53,184,192)')set(el,'color','#67A5FF');
    else if(color==='rgb(212,174,98)')set(el,'color','#C2A664');

    if(bg==='rgb(242,246,246)')set(el,'background-color','#F6F7FA');
    else if(eq(bg,'rgba(255,255,255,0.78)','rgba(255,255,255,.78)','rgba(255,255,255,0.88)','rgba(255,255,255,.88)')){
      set(el,'background-color','rgba(255,255,255,.94)');
      if(parseFloat(cs.borderRadius)>=14){
        set(el,'border-color','#E9EDF2');
        set(el,'box-shadow','0 12px 30px rgba(15,23,42,.055),0 2px 8px rgba(15,23,42,.035)');
      }
    }
    else if(bg==='rgb(223,241,242)')set(el,'background-color','rgba(45,125,255,.11)');
    else if(bg==='rgb(0,127,134)')set(el,'background-color','#2D7DFF');
    else if(bg==='rgb(8,21,25)')set(el,'background-color','#0B1220');
    else if(eq(bg,'rgba(15,34,39,0.78)','rgba(15,34,39,.78)','rgba(21,44,50,0.88)','rgba(21,44,50,.88)')){
      set(el,'background-color','rgba(22,30,45,.92)');
      if(parseFloat(cs.borderRadius)>=14){
        set(el,'border-color','rgba(148,163,184,.15)');
        set(el,'box-shadow','0 14px 34px rgba(0,0,0,.20)');
      }
    }
    else if(eq(bg,'rgba(53,184,192,0.16)','rgba(53,184,192,.16)'))set(el,'background-color','rgba(45,125,255,.17)');

    if(eq(border,'rgba(16,74,79,0.11)','rgba(16,74,79,.11)'))set(el,'border-color','#E9EDF2');
    else if(border==='rgb(0,127,134)')set(el,'border-color','#2D7DFF');
    else if(eq(border,'rgba(174,214,216,0.14)','rgba(174,214,216,.14)'))set(el,'border-color','rgba(148,163,184,.15)');

    if(el.textContent==='CREW SCHEDULE')set(el,'display','none');
    if(el.textContent==='eScrew'){
      set(el,'font-size','30px');
      set(el,'line-height','34px');
      set(el,'font-weight','700');
      set(el,'letter-spacing','-0.9px');
    }

    if(cs.backdropFilter&&cs.backdropFilter!=='none'){
      set(el,'backdrop-filter','blur(30px) saturate(1.35)');
      set(el,'-webkit-backdrop-filter','blur(30px) saturate(1.35)');
    }
  };

  const apply=()=>{
    const r=root();if(!r)return;
    skinElement(r);
    r.querySelectorAll('*').forEach(skinElement);
  };

  const start=()=>{
    apply();
    const r=root();if(!r){requestAnimationFrame(start);return;}
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;queued=true;
      requestAnimationFrame(()=>{queued=false;apply();});
    });
    observer.observe(r,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
    if(window.matchMedia){
      const mq=window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener?.('change',apply);
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
`;

const OPEN_AIMS_EXTERNALLY = `
(()=>{const AIMS='https://aims.airastana.com/';const standalone=(typeof window.matchMedia==='function'&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;if(!standalone)return;const nativeOpen=window.open.bind(window);window.open=(url,target,features)=>{const href=typeof url==='string'?url:String(url??'');if(href.startsWith(AIMS)){window.location.assign(href);return window;}return nativeOpen(url,target,features);};})();
`;

const REGISTER_SW = `
if('serviceWorker' in navigator){window.addEventListener('load',async()=>{const had=Boolean(navigator.serviceWorker.controller);let notified=false;try{const r=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});const notify=()=>{if(had&&!notified){notified=true;window.alert('A new version of eScrew is available.')}};r.addEventListener('updatefound',()=>{const w=r.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')notify()})});const check=()=>{if(navigator.onLine)r.update().catch(()=>{})};check();window.addEventListener('online',check);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check()})}catch{}})};
`;

export default function Root({ children }: { children: ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return <html lang="en" {...htmlAttributes}><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" media="(prefers-color-scheme:light)" content="#F6F7FA" />
    <meta name="theme-color" media="(prefers-color-scheme:dark)" content="#0B1220" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="eScrew" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="description" content="Personal flight crew schedule companion." />
    <link rel="manifest" href="manifest.webmanifest" />
    <style dangerouslySetInnerHTML={{__html:APP_SHELL_CSS}} />
    <script dangerouslySetInnerHTML={{__html:OPEN_AIMS_EXTERNALLY}} />
    <ScrollViewStyleReset />{headNodes}
  </head><body {...bodyAttributes}>{children}{bodyNodes}<script dangerouslySetInnerHTML={{__html:VISUAL_SKIN}} /><script dangerouslySetInnerHTML={{__html:REGISTER_SW}} /></body></html>;
}
