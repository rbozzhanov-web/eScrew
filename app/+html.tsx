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

/* eScrew concept skin. Visual overrides only: no layout, DOM or behavior changes. */
/* Header refinement from the approved mockup: larger wordmark, no subtitle. */
#root [style*="font-size: 27px"][style*="letter-spacing: -0.8px"]:not([style*="line-height: 31px"]){font-size:30px!important;letter-spacing:-.9px!important}
#root [style*="font-size: 10px"][style*="letter-spacing: 1.2px"]{display:none!important}

#root [style*="background-color: rgba(255, 255, 255, 0.88)"],
#root [style*="background-color:rgba(255,255,255,.88)"],
#root [style*="background-color: rgba(255, 255, 255, 0.78)"],
#root [style*="background-color:rgba(255,255,255,.78)"]{
  background-color:rgba(255,255,255,.92)!important;
  border-color:#E9EDF2!important;
  box-shadow:0 12px 30px rgba(15,23,42,.055),0 2px 8px rgba(15,23,42,.035)!important;
}
#root [style*="background-color: rgb(242, 246, 246)"],
#root [style*="background-color:#F2F6F6"]{background-color:#F6F7FA!important}
#root [style*="color: rgb(16, 35, 38)"],
#root [style*="color:#102326"]{color:#0F172A!important}
#root [style*="color: rgb(96, 119, 122)"],
#root [style*="color:#60777A"]{color:#6B7280!important}
#root [style*="color: rgb(0, 127, 134)"],
#root [style*="color:#007F86"]{color:#2D7DFF!important}
#root [style*="background-color: rgb(223, 241, 242)"],
#root [style*="background-color:#DFF1F2"]{background-color:rgba(45,125,255,.11)!important}
#root [style*="border-color: rgba(16, 74, 79, 0.11)"],
#root [style*="border-color:rgba(16,74,79,.11)"]{border-color:#E9EDF2!important}
#root [style*="color: rgb(166, 122, 36)"],
#root [style*="color:#A67A24"]{color:#A58B4F!important}
#root [style*="background-color: rgb(0, 127, 134)"],
#root [style*="background-color:#007F86"]{background-color:#2D7DFF!important}
#root [style*="border-color: rgb(0, 127, 134)"],
#root [style*="border-color:#007F86"]{border-color:#2D7DFF!important}

/* Glass bars and floating controls get the soft iOS material from the concept. */
#root [style*="backdrop-filter"]{
  backdrop-filter:blur(30px) saturate(1.35)!important;
  -webkit-backdrop-filter:blur(30px) saturate(1.35)!important;
}

@media(prefers-color-scheme:dark){
  body{background:#0B1220;color:#F8FAFC}
  #root [style*="background-color: rgb(8, 21, 25)"],
  #root [style*="background-color:#081519"]{background-color:#0B1220!important}
  #root [style*="background-color: rgba(21, 44, 50, 0.88)"],
  #root [style*="background-color:rgba(21,44,50,.88)"],
  #root [style*="background-color: rgba(15, 34, 39, 0.78)"],
  #root [style*="background-color:rgba(15,34,39,.78)"]{
    background-color:rgba(22,30,45,.9)!important;
    border-color:rgba(148,163,184,.15)!important;
    box-shadow:0 14px 34px rgba(0,0,0,.2)!important;
  }
  #root [style*="color: rgb(243, 250, 250)"],
  #root [style*="color:#F3FAFA"]{color:#F8FAFC!important}
  #root [style*="color: rgb(168, 186, 188)"],
  #root [style*="color:#A8BABC"]{color:#98A2B3!important}
  #root [style*="color: rgb(53, 184, 192)"],
  #root [style*="color:#35B8C0"]{color:#67A5FF!important}
  #root [style*="background-color: rgba(53, 184, 192, 0.16)"],
  #root [style*="background-color:rgba(53,184,192,.16)"]{background-color:rgba(45,125,255,.17)!important}
  #root [style*="border-color: rgba(174, 214, 216, 0.14)"],
  #root [style*="border-color:rgba(174,214,216,.14)"]{border-color:rgba(148,163,184,.15)!important}
  #root [style*="color: rgb(212, 174, 98)"],
  #root [style*="color:#D4AE62"]{color:#C2A664!important}
}
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
  </head><body {...bodyAttributes}>{children}{bodyNodes}<script dangerouslySetInnerHTML={{__html:REGISTER_SW}} /></body></html>;
}
