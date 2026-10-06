/* fillts HR — 홈 화면 설치용 최소 서비스 워커. 캐시하지 않는다(항상 최신 화면 · 개인정보를 기기에 남기지 않음). */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* 네트워크 그대로 */ });
