const CACHE_NAME = '1sol-pwa-v4';
const MEDIA_CACHE_NAME = '1sol-media-v1';
const MAX_MEDIA_ENTRIES = 100;

const STATIC_ASSETS = [
  '/',
  '/warehouse',
  '/agent-chat/',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== MEDIA_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$/);
}

function isMediaProxy(url) {
  return url.pathname.startsWith('/api/agent-chat/media/');
}

async function trimMediaCache() {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length > MAX_MEDIA_ENTRIES) {
    const toDelete = keys.slice(0, keys.length - MAX_MEDIA_ENTRIES);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function mediaCacheFirst(request) {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      trimMediaCache();
    }
    return response;
  } catch (e) {
    return new Response('Media unavailable', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (isMediaProxy(url)) {
    event.respondWith(mediaCacheFirst(event.request));
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.includes('vite-hmr') || url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules/') || url.pathname.startsWith('/src/')) return;

  if (url.pathname === '/' || url.pathname === '' || event.request.mode === 'navigate') {
    if (url.pathname.startsWith('/agent-chat') || url.pathname.startsWith('/warehouse')) {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
      );
    }
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '1SOL Agent Chat', body: event.data ? event.data.text() : 'New message' };
  }

  const title = data.title || '1SOL Agent Chat';
  const options = {
    body: data.body || 'You have a new message',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.conversationId || 'agent-chat-notification',
    renotify: true,
    data: {
      conversationId: data.conversationId || null,
      slug: data.slug || null,
      url: data.url || '/agent-chat/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => {
          if (client.url.includes('/agent-chat')) {
            client.postMessage({ type: 'NEW_MESSAGE', conversationId: data.conversationId });
          }
        });
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || '/agent-chat/';

  if (notifData.slug && notifData.conversationId) {
    targetUrl = '/agent-chat/' + notifData.slug + '?conv=' + notifData.conversationId;
  } else if (notifData.slug) {
    targetUrl = '/agent-chat/' + notifData.slug;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/agent-chat') && 'focus' in client) {
          client.postMessage({
            type: 'PUSH_NOTIFICATION',
            conversationId: notifData.conversationId,
          });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
