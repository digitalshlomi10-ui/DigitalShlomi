const CACHE_NAME = 'synagogue-v1';
const ASSETS = [
  '/DigitalShlomi/index.html',
  '/DigitalShlomi/admin.html',
  '/DigitalShlomi/mobile-admin.html',
  '/DigitalShlomi/style.css',
  '/DigitalShlomi/bgindex.jpg',
  '/DigitalShlomi/bgshabbat.jpg',
  '/DigitalShlomi/bgshabbattimes.jpg'
];

// התקנה — שמור את כל הקבצים בזיכרון
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('שומר קבצים לשימוש אופליין...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// הפעלה — מחק cache ישן
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// בקשת רשת — נסה רשת קודם, אחר כך cache
self.addEventListener('fetch', event => {
  // Firebase ובקשות חיצוניות — תמיד מהרשת
  if (event.request.url.includes('firebase') ||
      event.request.url.includes('gstatic') ||
      event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // אם הצלחנו — עדכן את ה-cache
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // אין אינטרנט — טען מה-cache
        return caches.match(event.request);
      })
  );
});
