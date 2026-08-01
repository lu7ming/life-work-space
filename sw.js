/**
 * Service Worker - 人生工作台
 * 支持离线缓存，采用缓存优先策略
 */

const CACHE_NAME = 'life-work-space-v32';

// 需要缓存的资源列表
const CACHE_ASSETS = [
  './life.html',
  './styles/main.css',
  './styles/sidebar.css',
  './styles/dashboard.css',
  './styles/search.css',
  './core/app.js',
  './core/router.js',
  './core/storage.js',
  './core/utils.js',
  './core/notifications.js',
  './core/export.js',
  './core/search.js',
  './core/nicole.js',
  './styles/nicole.css',
  './core/xiaolu.js',
  './styles/xiaolu.css',
  './core/quickinput.js',
  './styles/quickinput.css',
  './core/theme.js',
  './core/sync.js',
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
  './modules/study/study.js',
  './modules/health/health.html',
  './modules/health/health.css',
  './modules/health/health.js',
  './modules/finance/finance.html',
  './modules/finance/finance.css',
  './modules/finance/finance.js',
  './modules/journal/journal.html',
  './modules/journal/journal.css',
  './modules/journal/journal.js',
  './modules/knowledge/knowledge.html',
  './modules/knowledge/knowledge.css',
  './modules/knowledge/knowledge.js',
  './modules/goals/goals.html',
  './modules/goals/goals.css',
  './modules/goals/goals.js',
  './modules/relations/relations.html',
  './modules/relations/relations.css',
  './modules/relations/relations.js',
  './modules/lifetree/lifetree.html',
  './modules/lifetree/lifetree.css',
  './modules/lifetree/lifetree.js',
  './modules/rest/rest.html',
  './modules/rest/rest.css',
  './modules/rest/rest.js',
  './modules/whitenoise/whitenoise.css',
  './modules/whitenoise/whitenoise.js',
  // [模板系统] 新增缓存文件（版本号由其他子Agent统一管理）
  './core/templates.js',
  './modules/templates/templates.html',
  './modules/templates/templates_module.js',
  './styles/templates.css',
  './manifest.json'
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
 * 请求拦截：导航请求网络优先，静态资源缓存优先+后台更新
 */
self.addEventListener('fetch', (event) => {
  // 只处理同源 GET 请求
  if (event.request.method !== 'GET') return;

  // 导航请求使用网络优先，确保打开即最新
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkRes.clone());
          });
          return networkRes;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./life.html')))
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) {
          fetch(event.request).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkRes);
              });
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then((response) => {
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
        if (event.request.mode === 'navigate') {
          return caches.match('./life.html');
        }
      })
  );
});

/**
 * 新版本就绪时通知页面刷新
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
