// ══════════════════════════════════════════════════
//  Service Worker — בית הכנסת שערי שלום ליעקב
//  גרסה 1.0 — תמיכה מלאה באופליין
// ══════════════════════════════════════════════════

const CACHE_NAME = 'shaarei-shalom-v1';

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

const ALL_CACHE_FILES = [...LOCAL_FILES, ...FIREBASE_URLS];

// ───── התקנה: שמור הכל בקאש ─────
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching all files');
            // שמור קבצים מקומיים
            const localPromise = cache.addAll(LOCAL_FILES).catch(err => {
                console.warn('[SW] Some local files failed to cache:', err);
            });
            // שמור Firebase בנפרד (אם נכשל — לא קריטי)
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
    console.log('[SW] Activating...');
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

// ───── Fetch: Cache-First עם Fallback לרשת ─────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Firebase Firestore API — תמיד רשת (לא קאש)
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase.googleapis.com') ||
        url.hostname.includes('identitytoolkit')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // אופליין — Firebase ינהל את זה דרך persistence
                return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
            })
        );
        return;
    }

    // כל שאר הבקשות — Cache First
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) {
                // יש בקאש — החזר מהקאש, ועדכן ברקע
                const networkUpdate = fetch(event.request)
                    .then(response => {
                        if (response && response.status === 200 && response.type !== 'opaque') {
                            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                        }
                        return response;
                    })
                    .catch(() => {}); // אופליין — בסדר
                return cached;
            }
            // אין בקאש — נסה רשת
            return fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const toCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
                }
                return response;
            }).catch(() => {
                // אופליין ואין בקאש
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// ───── הודעה מהדף: עדכן קאש ─────
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
