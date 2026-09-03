const CACHE_PREFIX = "electromentor-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline";
const PUBLIC_RESOURCES = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

async function precacheOfflineShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(PUBLIC_RESOURCES);

  const offlineResponse = await fetch(OFFLINE_URL, {
    cache: "reload",
    credentials: "omit",
  });
  if (!offlineResponse.ok) {
    throw new Error("The offline fallback page could not be cached");
  }

  const html = await offlineResponse.clone().text();
  await cache.put(OFFLINE_URL, offlineResponse);

  const staticAssets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];

  await Promise.allSettled(
    staticAssets.map(async (assetUrl) => {
      const response = await fetch(assetUrl, {
        cache: "reload",
        credentials: "omit",
      });
      if (response.ok) await cache.put(assetUrl, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOfflineShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(async () => {
        const fallback = await caches.match(OFFLINE_URL);
        return (
          fallback ??
          new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  const isPrecachedPublicResource = PUBLIC_RESOURCES.includes(url.pathname);
  const isNextStaticAsset = url.pathname.startsWith("/_next/static/");
  if (!isPrecachedPublicResource && !isNextStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request)),
  );
});
