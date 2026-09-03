import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

const APP_SHELL_CSS = `
html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;overscroll-behavior:none;touch-action:manipulation}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,sans-serif}
#root{height:100dvh;min-height:100dvh;isolation:isolate}
html *{scrollbar-width:none;-ms-overflow-style:none} html *::-webkit-scrollbar{display:none!important}
body{background:#F6F7FA;color:#0F172A;-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}
::selection{background:rgba(45,125,255,.18)}
@media(prefers-color-scheme:dark){body{background:#0B1220;color:#F8FAFC}}
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
    <ScrollViewStyleReset />{headNodes}
  </head><body {...bodyAttributes}>{children}{bodyNodes}<script dangerouslySetInnerHTML={{__html:REGISTER_SW}} /></body></html>;
}
