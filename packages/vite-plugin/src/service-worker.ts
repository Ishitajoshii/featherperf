import type { FeatherPerfOptions, FeatherPerfServiceWorkerOptions } from './types.js';

const DEFAULT_ASSET_EXTENSIONS = [
  'avif',
  'gif',
  'glb',
  'gltf',
  'jpeg',
  'jpg',
  'json',
  'lottie',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'otf',
  'png',
  'svg',
  'ttf',
  'webm',
  'webp',
  'woff',
  'woff2'
];

const DEFAULT_SERVICE_WORKER_OPTIONS: Required<FeatherPerfServiceWorkerOptions> = {
  enabled: false,
  register: true,
  fileName: 'featherperf-sw.js',
  scope: '/',
  cacheName: 'featherperf-assets',
  cacheVersion: 'v1',
  maxEntries: 250,
  assetExtensions: DEFAULT_ASSET_EXTENSIONS,
  debug: false
};

export function getServiceWorkerOptions(options: FeatherPerfOptions): Required<FeatherPerfServiceWorkerOptions> | null {
  if (options.serviceWorker === true) {
    return {
      ...DEFAULT_SERVICE_WORKER_OPTIONS,
      enabled: true,
      debug: options.debug ?? DEFAULT_SERVICE_WORKER_OPTIONS.debug
    };
  }

  if (!options.serviceWorker || options.serviceWorker.enabled === false) {
    return null;
  }

  return {
    ...DEFAULT_SERVICE_WORKER_OPTIONS,
    ...options.serviceWorker,
    enabled: true,
    debug: options.serviceWorker.debug ?? options.debug ?? DEFAULT_SERVICE_WORKER_OPTIONS.debug
  };
}

export function createServiceWorkerRegistrationSnippet(options: Required<FeatherPerfServiceWorkerOptions>): string {
  return [
    '<script data-featherperf-service-worker>',
    '(() => {',
    "  if (!('serviceWorker' in navigator)) return;",
    '  window.addEventListener("load", () => {',
    `    navigator.serviceWorker.register(${JSON.stringify(`/${options.fileName}`)}, { scope: ${JSON.stringify(options.scope)} }).catch(() => undefined);`,
    '  }, { once: true });',
    '})();',
    '</script>'
  ].join('\n');
}

export function createServiceWorkerSource(options: Required<FeatherPerfServiceWorkerOptions>): string {
  const cacheName = `${options.cacheName}-${options.cacheVersion}`;
  const cachePrefix = `${options.cacheName}-`;

  return `const FEATHERPERF_CACHE_NAME = ${JSON.stringify(cacheName)};
const FEATHERPERF_CACHE_PREFIX = ${JSON.stringify(cachePrefix)};
const FEATHERPERF_MAX_ENTRIES = ${JSON.stringify(options.maxEntries)};
const FEATHERPERF_DEBUG = ${JSON.stringify(options.debug)};
const FEATHERPERF_ASSET_EXTENSIONS = new Set(${JSON.stringify(
    options.assetExtensions.map((extension) => extension.replace(/^\./, '').toLowerCase())
  )});

function log(message) {
  if (FEATHERPERF_DEBUG) {
    console.debug('[FeatherPerf SW] ' + message);
  }
}

function getExtension(pathname) {
  const match = pathname.toLowerCase().match(/\\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function isCacheableAssetRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (request.mode === 'navigate') {
    return false;
  }

  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    return false;
  }

  const extension = getExtension(url.pathname);
  return FEATHERPERF_ASSET_EXTENSIONS.has(extension);
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= FEATHERPERF_MAX_ENTRIES) {
    return;
  }

  await Promise.all(keys.slice(0, keys.length - FEATHERPERF_MAX_ENTRIES).map((key) => cache.delete(key)));
}

async function cacheFirst(request) {
  const cache = await caches.open(FEATHERPERF_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    log('cache hit ' + new URL(request.url).pathname);
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
    void trimCache(cache);
  }

  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(FEATHERPERF_CACHE_PREFIX) && cacheName !== FEATHERPERF_CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (!isCacheableAssetRequest(event.request)) {
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
`;
}
