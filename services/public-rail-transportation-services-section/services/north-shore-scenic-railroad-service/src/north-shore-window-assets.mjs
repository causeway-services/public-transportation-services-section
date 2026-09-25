export const NORTH_SHORE_WINDOW_MANIFEST = Object.freeze({
  name: "North Shore Window",
  short_name: "Shore Window",
  description: "Independent, private, offline scenic rail ride companion.",
  start_url: "/",
  display: "standalone",
  background_color: "#061516",
  theme_color: "#061516",
  orientation: "portrait-primary",
  categories: ["travel", "navigation", "education"],
  icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
});

export const NORTH_SHORE_WINDOW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#071516"/><path d="M70 348C164 86 326 100 442 194" fill="none" stroke="#79e4c0" stroke-width="48" stroke-linecap="round"/><circle cx="264" cy="270" r="55" fill="#ffd56f" stroke="#fff" stroke-width="20"/></svg>`;

export const NORTH_SHORE_WINDOW_SERVICE_WORKER = String.raw`const CACHE="north-shore-window-v3";
const CORE=["/","/app.js","/tufte-browser.mjs","/north-shore-route-position.mjs","/route-ride-tracker.mjs","/api/route","/manifest.webmanifest","/icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>event.request.mode==="navigate"?caches.match("/"):new Response("Offline",{status:503,headers:{"content-type":"text/plain; charset=utf-8"}}))))});`;

export const NORTH_SHORE_WINDOW_HEADERS = `/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(self)
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'

/service-worker.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /
`;
