// Tara Desk service worker: caches the app shell so it opens offline. API calls are never cached.
const CACHE = "tara-desk-v12";
const SHELL = ["./","demo/designs.json","demo/previews/B01.png","demo/previews/B02.png","demo/previews/B03.png","demo/previews/B04.png","demo/previews/B05.png","demo/previews/B06.png","demo/previews/I01.png","demo/previews/I02.png","demo/previews/I03.png","demo/previews/I04.png","demo/previews/I05.png","demo/previews/I06.png","demo/previews/I07.png","demo/previews/I08.png","index.html","manifest.webmanifest","vendor/html2canvas.min.js",
  "assets/star.png","assets/upi-qr.png","icons/icon-192.png","icons/icon-512.png",
  "fonts/jost-latin-400-normal.woff2","fonts/jost-latin-500-normal.woff2","fonts/jost-latin-600-normal.woff2","fonts/jost-latin-700-normal.woff2",
  "fonts/cormorant-garamond-latin-600-normal.woff2","fonts/cormorant-garamond-latin-700-normal.woff2",
  "fonts/cormorant-garamond-latin-600-italic.woff2","fonts/cormorant-garamond-latin-700-italic.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;           // let API calls go straight to the network
  e.respondWith(caches.match(r, {ignoreSearch: true}).then(hit => {
    const net = fetch(r).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(r, res.clone())); return res; }).catch(() => hit);
    return hit || net;                                                       // cache first, refresh in the background
  }));
});
