// Nectra Service Worker
const CACHE_NAME = 'nectra-v2';

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(SHELL_URLS.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Handle Web Share Target POST
  if (event.request.method === 'POST' && url.searchParams.has('share-target')) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.get('file');
        if (file) {
          // Convert file to object URL and store in sessionStorage via client
          const buffer = await file.arrayBuffer();
          const blob   = new Blob([buffer], { type: file.type });
          const objUrl = URL.createObjectURL(blob);
          // Send to all clients
          const clients = await self.clients.matchAll({ includeUncontrolled: true });
          const info = JSON.stringify({ url: objUrl, name: file.name, type: file.type });
          for (const client of clients) {
            client.postMessage({ type: 'share-target', payload: info });
          }
        }
      } catch(e) { console.warn('Share target SW error', e); }
      // Redirect to app
      return Response.redirect('/?share-target', 303);
    })());
    return;
  }

  // Skip Firebase/Google API calls
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('gstatic.com')) return;

  // Cache-first for app shell
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        });
      })
    );
  }
});
