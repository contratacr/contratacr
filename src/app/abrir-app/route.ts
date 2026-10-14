import { PWA_STARTUP_IMAGES } from "@/lib/pwa-startup";

// Only the public launch shell is static. Sessions and page data still load
// through the normal home route, without caching authenticated HTML.
export const dynamic = "force-static";

export function GET() {
  const startup = PWA_STARTUP_IMAGES.map(({ url, media }) =>
    `<link rel="apple-touch-startup-image" href="${url}" media="${media}">`,
  ).join("");
  return new Response(`<!doctype html><html lang="es" style="background:#fff;color-scheme:light"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#ffffff"><meta name="color-scheme" content="light">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="ContrataCR">
<meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="robots" content="noindex">
<title>ContrataCR</title><link rel="manifest" href="/site.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="apple-touch-startup-image" href="/pwa/startup/402x874@3-portrait.png">${startup}
<style>html,body{margin:0;min-height:100%;background:#fff}body{min-height:100svh;display:grid;place-items:center}a{display:flex;align-items:center;gap:0}img{display:block;object-fit:contain}</style>
</head><body><a href="/" aria-label="Abrir ContrataCR"><img src="/logo-mark-transparent.png" width="32" height="32" alt=""><img src="/brand/wordmark-light.svg" width="105" height="24" alt="ContrataCR"></a>
<script>let opened=false;function openHome(){if(opened)return;opened=true;location.replace('/')}requestAnimationFrame(()=>requestAnimationFrame(openHome));setTimeout(openHome,250);</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex",
    },
  });
}
