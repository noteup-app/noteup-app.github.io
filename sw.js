// Cache first so the app opens at once on a weak network. Every request also refreshes the cache in the background,
// and open pages get one "update" message when a cached file has changed.
"use strict";

const CACHE = "tromboneup";
const FILES = ["./", "index.html", "analysis.js", "rhythm.js", "scales.js", "manifest.webmanifest", "manifest-trumpet.webmanifest", "manifest-euphonium.webmanifest", "manifest-euphonium-b.webmanifest", "manifest-flute.webmanifest",
               "manifest-de.webmanifest", "manifest-de-trumpet.webmanifest", "manifest-de-euphonium.webmanifest", "manifest-de-euphonium-b.webmanifest", "manifest-de-flute.webmanifest",
               "images/icon.svg", "images/icon-32.png", "images/icon-trumpet.svg", "images/icon-trumpet-32.png",
               "images/icon-euphonium.svg", "images/icon-euphonium-32.png", "images/icon-flute.svg", "images/icon-flute-32.png"];
// the instrument pages only exist in the built site
const PAGES = ["trumpet/", "euphonium/", "euphonium-b/", "flute/", "de/", "de/trumpet/", "de/euphonium/", "de/euphonium-b/", "de/flute/"];
const fresh = files => files.map(file => new Request(file, { cache: "reload" }));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all([cache.addAll(fresh(FILES)), cache.addAll(fresh(PAGES)).catch(() => {})])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

const stamp = response => response.headers.get("ETag") || response.headers.get("Last-Modified");

async function changed(before, after) {
  if (stamp(before) || stamp(after)) return stamp(before) !== stamp(after);
  const [a, b] = (await Promise.all([before.arrayBuffer(), after.clone().arrayBuffer()])).map(x => new Uint8Array(x));
  return a.length !== b.length || a.some((v, i) => v !== b[i]);
}

// several files changing at once still make one message
let announcing = null;
function announce() {
  announcing ??= new Promise(resolve => setTimeout(resolve, 500)).then(async () => {
    announcing = null;
    for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "update" });
  });
  return announcing;
}

self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const before = cached?.clone();
    const refresh = fetch(request, { cache: "no-cache" }).then(async response => {
      if (!response.ok) return response;
      const update = before && await changed(before, response);
      await cache.put(request, response.clone());
      if (update) await announce();
      return response;
    });
    event.waitUntil(refresh.catch(() => {}));
    return cached || refresh;
  })());
});

// a new version is about to load: every cached file fresh from the network, so one reload brings the newest of all
self.addEventListener("message", event => {
  // recordings the page may need after a switch of instrument, each fetched once
  if (event.data?.type === "prefetch") {
    event.waitUntil(caches.open(CACHE).then(cache => Promise.all(event.data.files.map(async file => (await cache.match(file)) ?? cache.add(file).catch(() => {})))));
    return;
  }
  if (event.data?.type !== "refresh") return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // the piano samples never change, so they are not fetched again
    await Promise.all((await cache.keys()).filter(request => !request.url.includes("/sounds/")).map(async request => {
      const response = await fetch(request.url, { cache: "reload" }).catch(() => null);
      if (response?.ok) await cache.put(request, response);
    }));
    event.source?.postMessage({ type: "refreshed" });
  })());
});
