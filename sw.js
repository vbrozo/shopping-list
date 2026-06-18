// Service worker — offline podrška (app shell caching)
const CACHE = "lista-v39";
const CORE = ["./", "index.html", "manifest.json",
  "css/base.css?v=39", "css/layout.css?v=39", "css/forms.css?v=39", "css/list.css?v=39",
  "css/modals.css?v=39", "css/settings.css?v=39", "css/icons.css?v=39",
  "icon-192.png", "icon-512.png", "icon-180.png?v=39", "favicon-32.png?v=39"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Ne diraj Firebase/Firestore promet (ima vlastiti offline mehanizam)
  if (/firestore|googleapis|firebaseio|firebase/.test(url.hostname)) return;

  // Navigacija (HTML) — mreža prvo, pa cache (da se uhvate nove verzije)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match("index.html")))
    );
    return;
  }

  // Ostalo (JS/CSS/SDK) — cache prvo, pa mreža (i spremi u cache)
  e.respondWith(
    caches.match(req).then((m) =>
      m ||
      fetch(req).then((r) => {
        if (r && (r.ok || r.type === "opaque")) {
          caches.open(CACHE).then((c) => c.put(req, r.clone()));
        }
        return r;
      }).catch(() => m)
    )
  );
});
