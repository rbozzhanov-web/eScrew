import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

const APP_VERSION = process.env.EXPO_PUBLIC_ESCREW_VERSION ?? '';

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
  const appVersion=${JSON.stringify(APP_VERSION)};
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
      set(el,'font-size','33px');
      set(el,'line-height','37px');
      set(el,'font-weight','700');
      set(el,'letter-spacing','-1px');
      set(el,'transform','translateY(1.13px)');
    }

    if(cs.backdropFilter&&cs.backdropFilter!=='none'){
      set(el,'backdrop-filter','blur(30px) saturate(1.35)');
      set(el,'-webkit-backdrop-filter','blur(30px) saturate(1.35)');
    }
  };

  const applyVersion=()=>{
    const r=root();if(!r||!appVersion||appVersion==='unknown')return;
    if(r.querySelector('[data-escrew-version]'))return;
    const privacy=[...r.querySelectorAll('*')].find(el=>el instanceof HTMLElement&&el.textContent==='Privacy');
    const card=privacy&&privacy.parentElement;
    if(!card)return;
    const marker=document.createElement('div');
    marker.setAttribute('data-escrew-version','');
    marker.textContent='PR '+appVersion;
    Object.assign(marker.style,{fontSize:'9px',lineHeight:'11px',fontWeight:'600',opacity:'.32',textAlign:'right',marginTop:'2px',letterSpacing:'.2px'});
    card.appendChild(marker);
  };

  const apply=()=>{
    const r=root();if(!r)return;
    skinElement(r);
    r.querySelectorAll('*').forEach(skinElement);
    applyVersion();
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

const AIMS_CLIPBOARD_BRIDGE = `
(()=>{
  const AIMS='https://aims.airastana.com/';
  const ORIGIN='https://aims.airastana.com';
  const TYPE='escrew:aims-scheduler-events';
  const MARKER='escrew:aims-safari-capture';
  const MAX_AGE=2*60*60*1000;
  const standalone=(typeof window.matchMedia==='function'&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  if(!standalone)return;
  const nativeOpen=window.open.bind(window);
  const isiOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const readMarker=()=>{try{return Number(localStorage.getItem(MARKER)||0);}catch{return 0;}};
  const writeMarker=()=>{try{localStorage.setItem(MARKER,String(Date.now()));}catch{}};
  const clearMarker=()=>{try{localStorage.removeItem(MARKER);}catch{}};
  const missing='No copied AIMS roster found yet. Return to Safari, run the eScrew AIMS capture, load My Schedule, tap “Copy roster to eScrew”, then return here and tap AIMS again.';
  const deliverText=(text)=>{
    let data;
    try{data=JSON.parse(text);}catch{}
    const payload=data&&data.payload;
    if(!data||data.type!==TYPE||!payload||typeof payload.PeriodStart!=='string'||typeof payload.PeriodEnd!=='string'||!Array.isArray(payload.SchedulerEvents))return false;
    clearMarker();
    window.dispatchEvent(new MessageEvent('message',{origin:ORIGIN,data}));
    return true;
  };
  const requestIOSPaste=()=>{
    const area=document.createElement('textarea');
    area.setAttribute('aria-hidden','true');
    area.setAttribute('autocomplete','off');
    area.setAttribute('autocapitalize','off');
    area.setAttribute('spellcheck','false');
    area.setAttribute('inputmode','none');
    Object.assign(area.style,{position:'fixed',left:'50%',top:'50%',width:'1px',height:'1px',padding:'0',border:'0',opacity:'0',pointerEvents:'none',zIndex:'-1'});
    let finished=false;
    const cleanup=()=>{if(finished)return;finished=true;try{area.blur();}catch{}try{area.remove();}catch{}};
    const accept=(text)=>{
      if(finished)return;
      if(deliverText(text)){cleanup();return;}
      cleanup();
      window.alert(missing);
    };
    area.addEventListener('paste',(event)=>{
      const text=event.clipboardData&&event.clipboardData.getData('text/plain');
      if(text){event.preventDefault();accept(text);return;}
      setTimeout(()=>accept(area.value),0);
    },{once:true});
    area.addEventListener('input',()=>setTimeout(()=>accept(area.value),0),{once:true});
    document.body.appendChild(area);
    area.focus({preventScroll:true});
    area.select();
    try{document.execCommand('paste');}catch{cleanup();window.alert(missing);}
    setTimeout(cleanup,30000);
  };
  const openSafari=()=>{
    writeMarker();
    if(isiOS){window.location.href='x-safari-'+AIMS;return;}
    nativeOpen(AIMS,'_blank','noopener,noreferrer');
  };
  window.open=(url,target,features)=>{
    const href=typeof url==='string'?url:String(url??'');
    if(!href.startsWith(AIMS))return nativeOpen(url,target,features);
    const started=readMarker();
    if(!started||Date.now()-started>MAX_AGE){openSafari();return window;}
    if(isiOS){requestIOSPaste();return window;}
    if(!navigator.clipboard||typeof navigator.clipboard.readText!=='function'){window.alert(missing);return window;}
    navigator.clipboard.readText().then(text=>{if(!deliverText(text))window.alert(missing);}).catch(()=>window.alert(missing));
    return window;
  };
})();
`;

const REGISTER_SW = `
if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const had=Boolean(navigator.serviceWorker.controller);let updateInstalled=false;let reloading=false;const r=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});r.addEventListener('updatefound',()=>{const w=r.installing;if(w)w.addEventListener('statechange',()=>{if(had&&w.state==='installed')updateInstalled=true})});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||!updateInstalled||reloading)return;reloading=true;window.location.reload()});if(navigator.onLine)r.update().catch(()=>{});window.addEventListener('online',()=>r.update().catch(()=>{}))}catch{}})};
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
    <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
    <style dangerouslySetInnerHTML={{__html:APP_SHELL_CSS}} />
    <script dangerouslySetInnerHTML={{__html:AIMS_CLIPBOARD_BRIDGE}} />
    <ScrollViewStyleReset />{headNodes}
  </head><body {...bodyAttributes}>{children}{bodyNodes}<script dangerouslySetInnerHTML={{__html:VISUAL_SKIN}} /><script dangerouslySetInnerHTML={{__html:REGISTER_SW}} /></body></html>;
}
