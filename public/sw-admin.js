/* Somente uma página pública e estática é guardada. Pedidos, sessão, permissões
 * e caixa nunca entram em Cache Storage: a operação exige conexão real. */
const CACHE_ESTATICO = "shalon-admin-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_ESTATICO).then((cache) => cache.add("/admin-offline.html")),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((chaves) => Promise.all(
        chaves.filter((chave) => chave.startsWith("shalon-admin-offline-") && chave !== CACHE_ESTATICO)
          .map((chave) => caches.delete(chave)),
      )),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin ||
      (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))) return;

  event.respondWith(
    fetch(event.request).catch(async () =>
      (await caches.match("/admin-offline.html")) ?? Response.error(),
    ),
  );
});
