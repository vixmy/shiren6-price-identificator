// Service Worker — オフライン動作用
// 方針: 同一オリジンの GET はキャッシュを即座に返し、裏でネットワークから取り直してキャッシュを更新する
// （stale-while-revalidate）。ファイルを更新すると、次回起動時に新しい内容が反映される。
// キャッシュするファイルを増減したときは CACHE_NAME の番号を上げる。

var CACHE_NAME = 'shiren6-price-v3';

// パスは sw.js からの相対パス（GitHub Pages のサブパス配信に対応）
var PRECACHE_URLS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/weapon.js',
  'data/items.js',
  'data/appearance.js',
  'data/weapons.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  // 古いバージョンのキャッシュを削除
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf('shiren6-price-') === 0 && key !== CACHE_NAME;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      // クエリ（?v=... など）は無視してキャッシュを引く
      return cache.match(request, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(request).then(function (response) {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        if (cached) {
          // 裏での更新失敗（オフライン時など）は無視する
          event.waitUntil(network.catch(function () {}));
          return cached;
        }
        return network;
      });
    })
  );
});
