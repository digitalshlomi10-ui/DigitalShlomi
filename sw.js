// ══════════════════════════════════════════════════
//  Service Worker — בית הכנסת שערי שלום ליעקב
//  גרסה 2.0 — Network-First לדפים, Cache-First לנכסים
// ══════════════════════════════════════════════════

const CACHE_NAME = 'shaarei-shalom-v14';

// קבצים מקומיים לשמירה בקאש
const LOCAL_FILES = [
    './',
    './index.html',
    './admin.html',
    './mobile-admin.html',
    './style.css',
    './bgindex.jpg',
    './bgshabbat.jpg',
    './bgshabbattimes.jpg',
];

// ספריות Firebase מ-CDN לשמירה בקאש
const FIREBASE_URLS = [
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
];

// קבצים שדורשים Network-First (תמיד הגרסה הטרייה)
const NETWORK_FIRST_PATTERNS = [
    /\/index\.html/,
    /\/admin\.html/,
    /\/mobile-admin\.html/,
    /\/style\.css/,
    /\/$/,  // שורש האתר
];

// ───── התקנה: שמור הכל בקאש ─────
self.addEventListener('install', event => {
    console.log('[SW] Installing v2...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching all files');
            const localPromise = cache.addAll(LOCAL_FILES).catch(err => {
                console.warn('[SW] Some local files failed to cache:', err);
            });
            const firebasePromise = Promise.all(
                FIREBASE_URLS.map(url =>
                    fetch(url, { mode: 'cors' })
                        .then(res => cache.put(url, res))
                        .catch(() => console.warn('[SW] Could not cache:', url))
                )
            );
            return Promise.all([localPromise, firebasePromise]);
        }).then(() => {
            console.log('[SW] Install complete');
            return self.skipWaiting();
        })
    );
});

// ───── הפעלה: נקה קאש ישן ─────
self.addEventListener('activate', event => {
    console.log('[SW] Activating v2...');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME)
                    .map(k => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            )
        ).then(() => self.clients.claim())
    );
});

// ───── Fetch: Network-First לדפים, Cache-First לנכסים ─────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Firebase Firestore API — תמיד רשת (לא קאש)
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase.googleapis.com') ||
        url.hostname.includes('identitytoolkit')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
            })
        );
        return;
    }

    // בדוק אם הקובץ דורש Network-First
    const isNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname));

    if (isNetworkFirst) {
        // Network-First: נסה רשת תחילה, אם נכשל — חזור לקאש
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then(response => {
                    if (response && response.status === 200) {
                        // עדכן קאש ברקע
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => {
                    console.log('[SW] Network failed, serving from cache:', url.pathname);
                    return caches.match(event.request);
                })
        );
    } else {
        // Cache-First: מהיר יותר לתמונות וספריות
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) {
                    // עדכן ברקע
                    fetch(event.request)
                        .then(response => {
                            if (response && response.status === 200 && response.type !== 'opaque') {
                                caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                            }
                        })
                        .catch(() => {});
                    return cached;
                }
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const toCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
                    }
                    return response;
                }).catch(() => {
                    if (event.request.destination === 'document') {
                        return caches.match('./index.html');
                    }
                });
            })
        );
    }
});

// ───── הודעה מהדף: עדכן קאש ─────
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
