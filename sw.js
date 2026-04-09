// Service worker for PWA — cache-first with version-based update
var CACHE_NAME = 'mahjong-v2';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  // 清除舊版快取
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  // 只快取同源的 GET 請求
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Network-first：先嘗試網路，失敗才用快取
  e.respondWith(
    fetch(e.request).then(function(resp) {
      var clone = resp.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
      return resp;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
