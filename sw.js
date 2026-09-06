const CACHE_NAME = 'tashgheel-cache-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pos.html',
  '/inventory.html',
  '/admin.html',
  '/super-admin.html',
  '/vendors.html',
  '/customers.html',
  '/expenses.html',
  '/reports.html',
  '/salesmen.html',
  '/dine-in.html',
  '/kitchen.html',
  '/receipts.html',
  '/tables.html',
  '/table-order.html',
  '/online_ordering.html',
  '/backup.html',
  '/vendor-report.html',
  '/vendor-summary-report.html',
  '/favicon.png',
  '/icon.ico',
  '/css/styles.css',
  '/css/expenses.css',
  '/css/payroll.css',
  '/css/report-app.css',
  '/css/salesmen-app.css',
  '/js/web-adapter.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/backup-system.js',
  '/js/shared-nav.js',
  '/js/translations.js',
  '/js/pos-app.js',
  '/js/inventory-app.js',
  '/js/admin-app.js',
  '/js/super-admin.js',
  '/js/vendors-app.js',
  '/js/customers-app.js',
  '/js/expenses-app.js',
  '/js/reports-app.js',
  '/js/reports-charts.js',
  '/js/reports-engine.js',
  '/js/reports-export.js',
  '/js/salesmen-app.js',
  '/js/dine-in-app.js',
  '/js/kitchen-app.js',
  '/js/receipts-app.js',
  '/js/tables-app.js',
  '/js/table-order-app.js',
  '/js/online-store.js',
  '/js/vendor-report-app.js',
  '/js/vendor-summary-report.js'
];

const EXTERNAL_ASSETS_TO_CACHE = [
  'https://cdn.tailwindcss.com?plugins=forms,typography,container-queries',
  'https://cdn.tailwindcss.com?plugins=forms,typography',
  'https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching local and external static assets');
      
      // 1. Pre-cache local assets (must succeed)
      const localPromise = cache.addAll(ASSETS_TO_CACHE);
      
      // 2. Pre-cache external assets (fetch individually as no-cors, ignore failures)
      const externalPromises = EXTERNAL_ASSETS_TO_CACHE.map((url) => {
        return fetch(new Request(url, { mode: 'no-cors' }))
          .then((response) => {
            return cache.put(url, response);
          })
          .catch((err) => {
            console.warn('[Service Worker] Failed to pre-cache external asset:', url, err);
          });
      });
      
      return Promise.all([localPromise, ...externalPromises]);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass API calls entirely - let them be handled by the web-adapter's apiFetch
  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First for HTML/page navigation requests to avoid serving stale pages when online
  if (event.request.mode === 'navigate' || requestUrl.pathname.endsWith('.html') || requestUrl.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache with the latest version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If offline, serve from cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Fallback for default navigation
            return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache-First for static assets (JS, CSS, fonts, icons, images)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((response) => {
        // Cache new valid requests
        if (!response || response.status !== 200 || response.type !== 'basic') {
          // If it's a cross-origin request (like Tailwind CDN or Google Fonts), status can be 200 or 0 (opaque)
          // We can cache it if it's successful or from a trusted domain
          if (requestUrl.host.includes('tailwindcss.com') || requestUrl.host.includes('googleapis.com') || requestUrl.host.includes('gstatic.com')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch((err) => {
        // Silently catch fetch errors for static assets if offline
        console.warn('[Service Worker] Fetch failed for:', event.request.url, err);
      });
    })
  );
});
