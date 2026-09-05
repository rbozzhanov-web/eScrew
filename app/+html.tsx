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
body.escrew-suspend-glass{--escrew-blur-glass:none;--escrew-blur-tab:none}
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
    <ScrollViewStyleReset />{headNodes}
  </head><body {...bodyAttributes}>{children}{bodyNodes}<script dangerouslySetInnerHTML={{__html:REGISTER_SW}} /></body></html>;
}
