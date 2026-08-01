/**
 * Service Worker - 人生工作台
 * 支持离线缓存，采用缓存优先策略
 */

const CACHE_NAME = 'life-workspace-v4';

// 需要缓存的资源列表
const CACHE_ASSETS = [
  './life.html',
  './styles/main.css',
  './styles/sidebar.css',
  './styles/dashboard.css',
  './core/app.js',
  './core/router.js',
  './core/storage.js',
  './modules/dashboard/dashboard.html',
  './modules/dashboard/dashboard.css',
  './modules/dashboard/dashboard.js',
  './modules/habits/habits.html',
  './modules/habits/habits.css',
  './modules/habits/habits.js',
  './modules/tasks/tasks.html',
  './modules/tasks/tasks.css',
  './modules/tasks/tasks.js',
  './modules/study/study.html',
  './modules/study/study.css',
  './modules/study/study.js'
];

/**
 * 安装事件：预缓存核心资源
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/**
 * 激活事件：清理旧版本缓存
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/**
 * 请求拦截：缓存优先，回退网络
 */
self.addEventListener('fetch', (event) => {
  // 只处理同源 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // 缓存新获取的资源
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
      .catch(() => {
        // 离线时返回离线页面（可选）
        if (event.request.mode === 'navigate') {
          return caches.match('./life.html');
        }
      })
  );
});
