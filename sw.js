/* Toppers Hub Academy — service worker
   Strategy:
   - App shell (HTML/JS/JSON): NETWORK-FIRST, so every load gets the latest code
     (with cache fallback when offline). This is what makes forced updates work.
   - Icons + CDN libraries: CACHE-FIRST (they rarely change), with network fallback.
   - Supabase API + version.json: NETWORK-ONLY (never served stale).
*/
const CACHE = "toppershub-v7";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache Supabase API or the version file — always fresh from network.
  if (url.hostname.endsWith("supabase.co") || url.pathname.endsWith("version.json")) return;

  const isCDN = url.hostname === "cdn.jsdelivr.net" || url.hostname === "cdnjs.cloudflare.com";
  const isIcon = /icon-\d+.*\.png$/.test(url.pathname);

  // Cache-first for icons and CDN libraries (rarely change).
  if (isIcon || isCDN) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Network-first for everything same-origin (the app shell) so updates land immediately.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
  }
});
