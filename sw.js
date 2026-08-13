/**
 * Service Worker - 人生工作台
 * v116 - 新增倒数日模块
 */

const CACHE_NAME = 'life-work-space-v116';

// 需要缓存的资源列表（所有模块仍缓存以确保离线可用）
const CACHE_ASSETS = [
  './life.html',
  // 核心样式
  './styles/main.css',
  './styles/sidebar.css',
  './styles/dashboard.css',
  './styles/search.css',
  './styles/nicole.css',
  './styles/xiaolu.css',
  './styles/audit-log.css',
  './styles/quickinput.css',
  './styles/templates.css',
  './styles/visual-enhancements.css',
  './styles/visual-enhancements-a.css',
  './styles/visual-c-group.css',
  // 核心 ES Modules（首屏静态导入）
  './core/app.js',
  './core/storage.js',
  './core/utils.js',
  './core/event-bus.js',
  './core/module-lifecycle.js',
  './core/router.js',
  // 核心懒加载模块
  './core/secure-storage.js',
  './core/shared-knowledge.js',
  './core/orchestrator.js',
  './core/cross-linker.js',
  './core/notifications.js',
  './core/smart-reminder.js',
  './core/model-router.js',
  './core/smart-suggestion.js',
  './core/nicole.js',
  './core/emotion-analyzer.js',
  './core/data-minimizer.js',
  './core/local-ai.js',
  './core/knowledge-extractor.js',
  './core/xiaolu.js',
  './core/audit-log.js',
  './core/templates.js',
  './core/export.js',
  './core/search.js',
  './core/theme.js',
  './core/bg-effects.js',
  './core/visual-enhancements.js',
  './core/visual-c-group.js',
  './core/sync.js',
  './core/quickinput.js',
  './core/user-profile.js',
  './core/preference-learner.js',
  './core/predictive-engine.js',
  './core/achievements.js',
  // 功能模块（动态 import 按需加载，但预缓存以保离线可用）
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
  './modules/content/content.html',
  './modules/content/content.css',
  './modules/content/content.js',
  './modules/achievements/achievements.html',
  './modules/achievements/achievements.css',
  './modules/achievements/achievements.js',
  './modules/report/report.html',
  './modules/report/report.css',
  './modules/report/report.js',
  './modules/rest/rest.html',
  './modules/rest/rest.css',
  './modules/rest/rest.js',
  './modules/music/music.css',
  './modules/music/music.js',
  './modules/music/music.html',
  './modules/templates/templates.html',
  './modules/templates/templates_module.js',
  './modules/timetracker/timetracker.html',
  './modules/timetracker/timetracker.css',
  './modules/timetracker/timetracker.js',
  // 日历视图
  './modules/calendar/calendar.html',
  './modules/calendar/calendar.css',
  './modules/calendar/calendar.js',
  './modules/toolbox/toolbox.html',
  './modules/toolbox/toolbox.css',
  './modules/toolbox/toolbox.js',
  // 旅行计划模块
  './modules/travel/travel.html',
  './modules/travel/travel.css',
  './modules/travel/travel.js',
  // 道模块
  './modules/dao/dao.html',
  './modules/dao/dao.css',
  './modules/dao/dao.js',
  './modules/dao/dao-data.js',
  // PWA
  './manifest.json',
  // 数据文件
  './data/daily-wisdom.json',
  './data/daily-text-recommend.json',
  // 用户资源
  './assets/avatar.jpg',
  './assets/icons/icon-192.png'
];

/**
 * 安装事件：预缓存核心资源
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        CACHE_ASSETS.map((asset) =>
          cache.add(asset).catch(() => { /* skip missing asset */ })
        )
      ))
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
  if (event.request.method !== 'GET') return;

  // API 请求直通网络，不缓存（避免缓存过期 token / 旧响应）
  const url = new URL(event.request.url);
  if (url.hostname === 'api.coze.cn' || url.hostname === 'api.deepseek.com') {
    event.respondWith(fetch(event.request));
    return;
  }

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
 * 后台同步（Background Sync）
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC', tag: 'sync-data' });
        });
      })
    );
  }
});

/**
 * 消息处理
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
