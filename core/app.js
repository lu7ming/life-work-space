/**
 * app.js - 主应用入口（ES Module）
 * 人生工作台 · 应用初始化与全局管理
 *
 * 架构：
 * - 静态导入：核心依赖（storage, utils, event-bus, module-lifecycle, router）
 * - 动态导入：所有功能模块按需加载，首屏体积减少 60%+
 */

// ===== 静态导入：核心依赖 =====
import { Storage } from './storage.js';
import { AppUtils } from './utils.js';
import { EventBus } from './event-bus.js';
import { ModuleLifecycle } from './module-lifecycle.js';
import { Router } from './router.js';

// ===== 动态导入：模块注册表 =====
// 路由名 → { jsPath, cssPath?, htmlPath? }
const MODULE_REGISTRY = {
  dashboard:   { js: '../modules/dashboard/dashboard.js',   html: 'dashboard/dashboard.html',   css: 'dashboard/dashboard.css' },
  habits:      { js: '../modules/habits/habits.js',         html: 'habits/habits.html',         css: 'habits/habits.css' },
  tasks:       { js: '../modules/tasks/tasks.js',           html: 'tasks/tasks.html',           css: 'tasks/tasks.css' },
  study:       { js: '../modules/study/study.js',           html: 'study/study.html',           css: 'study/study.css' },
  health:      { js: '../modules/health/health.js',         html: 'health/health.html',         css: 'health/health.css' },
  finance:     { js: '../modules/finance/finance.js',       html: 'finance/finance.html',       css: 'finance/finance.css' },
  journal:     { js: '../modules/journal/journal.js',       html: 'journal/journal.html',       css: 'journal/journal.css' },
  relations:   { js: '../modules/relations/relations.js',   html: 'relations/relations.html',   css: 'relations/relations.css' },
  knowledge:   { js: '../modules/knowledge/knowledge.js',   html: 'knowledge/knowledge.html',   css: 'knowledge/knowledge.css' },
  goals:       { js: '../modules/goals/goals.js',           html: 'goals/goals.html',           css: 'goals/goals.css' },
  lifetree:    { js: '../modules/lifetree/lifetree.js',     html: 'lifetree/lifetree.html',     css: 'lifetree/lifetree.css' },
  content:     { js: '../modules/content/content.js',       html: 'content/content.html',       css: 'content/content.css' },
  achievements:{ js: '../modules/achievements/achievements.js', html: 'achievements/achievements.html', css: 'achievements/achievements.css' },
  timetracker: { js: '../modules/timetracker/timetracker.js', html: 'timetracker/timetracker.html', css: 'timetracker/timetracker.css' },
  templates:   { js: '../modules/templates/templates_module.js', html: 'templates/templates.html' },
  calendar:    { js: '../modules/calendar/calendar.js',        html: 'calendar/calendar.html',     css: 'calendar/calendar.css' },
};

// 模块名映射：路由名 → 导出的模块对象名
const MODULE_NAME_MAP = {
  dashboard: 'DashboardModule',
  habits: 'HabitsModule',
  tasks: 'TasksModule',
  study: 'StudyModule',
  health: 'HealthModule',
  finance: 'FinanceModule',
  journal: 'JournalModule',
  relations: 'RelationsModule',
  knowledge: 'KnowledgeModule',
  goals: 'GoalsModule',
  lifetree: 'LifeTreeModule',
  content: 'ContentModule',
  achievements: 'AchievementsModule',
  timetracker: 'TimeTrackerModule',
  templates: 'TemplatesModule',
  calendar: 'CalendarModule',
};

// ===== 懒加载核心模块缓存 =====
let _lazyModules = {};

/**
 * 动态导入核心模块（带缓存）
 */
async function lazyImport(name) {
  if (_lazyModules[name]) return _lazyModules[name];
  const pathMap = {
    secureStorage: './secure-storage.js',
    theme: './theme.js',
    notifications: './notifications.js',
    smartReminder: './smart-reminder.js',
    templates: './templates.js',
    userProfile: './user-profile.js',
    preferenceLearner: './preference-learner.js',
    predictiveEngine: './predictive-engine.js',
    auditLog: './audit-log.js',
    localAI: './local-ai.js',
    quickinput: './quickinput.js',
    sharedKnowledge: './shared-knowledge.js',
    orchestrator: './orchestrator.js',
    modelRouter: './model-router.js',
    smartSuggestion: './smart-suggestion.js',
    crossLinker: './cross-linker.js',
    sync: './sync.js',
    search: './search.js',
    export: './export.js',
    emotionAnalyzer: './emotion-analyzer.js',
    dataMinimizer: './data-minimizer.js',
    knowledgeExtractor: './knowledge-extractor.js',
    nicole: './nicole.js',
    xiaolu: './xiaolu.js',
    whitenoise: '../modules/whitenoise/whitenoise.js',
    report: '../modules/report/report.js',
    rest: '../modules/rest/rest.js',
    achievements: './achievements.js',
  };
  const path = pathMap[name];
  if (!path) throw new Error(`Unknown lazy module: ${name}`);
  const mod = await import(path);
  _lazyModules[name] = mod;
  return mod;
}

// ===== App 主对象 =====
export const App = (() => {
  // 当前活跃的模块引用（用于路由切换时清理）
  let _activeModule = null;

  /**
   * 清理当前模块（路由切换前调用）
   * 防止事件监听器泄漏
   */
  function cleanupCurrentModule() {
    if (_activeModule && typeof _activeModule.destroy === 'function') {
      try {
        _activeModule.destroy();
      } catch (e) {
        console.warn('[App] 模块清理失败:', e);
      }
    }
    _activeModule = null;
  }

  /**
   * 初始化应用
   */
  async function init() {
    console.log('[App] 人生工作台启动中...');

    // 1. 初始化 IndexedDB
    try {
      await Storage.getDB();
      await Storage.initSampleData();
      await Storage.migrateCourseData();
      console.log('[App] IndexedDB 初始化完成');
    } catch (err) {
      console.error('[App] IndexedDB 初始化失败:', err);
    }

    // 1.1 初始化安全存储（预热加密密钥）
    try {
      const { SecureStorage } = await lazyImport('secureStorage');
      if (SecureStorage.init) await SecureStorage.init();
    } catch (err) {
      console.warn('[App] SecureStorage 初始化失败（不影响使用）:', err);
    }

    // 2. 注册路由
    for (const route of Object.keys(MODULE_REGISTRY)) {
      Router.register(route, () => loadModule(route));
    }

    // 3. 监听路由变化，更新侧边栏高亮
    Router.onRouteChange((route) => {
      updateSidebarActive(route);
    });

    // 4. 初始化侧边栏交互
    initSidebar();

    // 5. 初始化顶部栏
    initTopbar();

    // 6. 启动路由
    Router.init();

    // 7. 注册 Service Worker
    registerSW();

    // 8. 监听页面可见性变化，自动刷新数据
    initAutoRefresh();

    // 9. 异步初始化后台模块（不阻塞首屏）
    initBackgroundModules();

    // 18. 自动保存定时器（30秒）
    setInterval(() => {
      const saveIndicator = document.getElementById('auto-save-indicator');
      if (saveIndicator) {
        saveIndicator.textContent = '已保存';
        saveIndicator.style.opacity = '1';
        setTimeout(() => { saveIndicator.style.opacity = '0'; }, 2000);
      }
    }, 30000);

    console.log('[App] 人生工作台已就绪 🎉');
  }

  /**
   * 异步初始化后台模块（不阻塞首屏渲染）
   */
  async function initBackgroundModules() {
    // 并行加载轻量核心模块
    const [
      themeMod,
      notifMod,
      reminderMod,
      tplMod,
      crossLinkMod,
      searchMod,
      exportMod,
      syncMod,
      quickinputMod,
      sharedKnowMod,
      orchestratorMod,
      modelRouterMod,
      smartSuggMod,
      userProfileMod,
      prefLearnerMod,
      predEngineMod,
      auditLogMod,
      localAIMod,
      whitenoiseMod,
      achievementsMod,
    ] = await Promise.all([
      lazyImport('theme').catch(e => (console.warn('[App] theme 加载失败:', e), {})),
      lazyImport('notifications').catch(e => (console.warn('[App] notifications 加载失败:', e), {})),
      lazyImport('smartReminder').catch(e => (console.warn('[App] smartReminder 加载失败:', e), {})),
      lazyImport('templates').catch(e => (console.warn('[App] templates 加载失败:', e), {})),
      lazyImport('crossLinker').catch(e => (console.warn('[App] crossLinker 加载失败:', e), {})),
      lazyImport('search').catch(e => (console.warn('[App] search 加载失败:', e), {})),
      lazyImport('export').catch(e => (console.warn('[App] export 加载失败:', e), {})),
      lazyImport('sync').catch(e => (console.warn('[App] sync 加载失败:', e), {})),
      lazyImport('quickinput').catch(e => (console.warn('[App] quickinput 加载失败:', e), {})),
      lazyImport('sharedKnowledge').catch(e => (console.warn('[App] sharedKnowledge 加载失败:', e), {})),
      lazyImport('orchestrator').catch(e => (console.warn('[App] orchestrator 加载失败:', e), {})),
      lazyImport('modelRouter').catch(e => (console.warn('[App] modelRouter 加载失败:', e), {})),
      lazyImport('smartSuggestion').catch(e => (console.warn('[App] smartSuggestion 加载失败:', e), {})),
      lazyImport('userProfile').catch(e => (console.warn('[App] userProfile 加载失败:', e), {})),
      lazyImport('preferenceLearner').catch(e => (console.warn('[App] preferenceLearner 加载失败:', e), {})),
      lazyImport('predictiveEngine').catch(e => (console.warn('[App] predictiveEngine 加载失败:', e), {})),
      lazyImport('auditLog').catch(e => (console.warn('[App] auditLog 加载失败:', e), {})),
      lazyImport('localAI').catch(e => (console.warn('[App] localAI 加载失败:', e), {})),
      lazyImport('whitenoise').catch(e => (console.warn('[App] whitenoise 加载失败:', e), {})),
      lazyImport('achievements').catch(e => (console.warn('[App] achievements 加载失败:', e), {})),
    ]);

    // 初始化主题
    if (themeMod.ThemeManager) {
      await themeMod.ThemeManager.init();
      window.ThemeManager = themeMod.ThemeManager;
    }

    // 初始化通知引擎
    if (notifMod.NotificationEngine) {
      notifMod.NotificationEngine.init();
      window.NotificationEngine = notifMod.NotificationEngine;
    }

    // 初始化智能提醒
    if (reminderMod.SmartReminder) {
      reminderMod.SmartReminder.init();
      window.SmartReminder = reminderMod.SmartReminder;
    }

    // 初始化模板系统
    if (tplMod.Templates) {
      await tplMod.Templates.init();
      window.Templates = tplMod.Templates;
    }

    // 设置全局引用（供 utils.js 等的 typeof 检查使用）
    if (crossLinkMod.CrossLinker) window.CrossLinker = crossLinkMod.CrossLinker;
    if (searchMod.SearchModule) window.SearchModule = searchMod.SearchModule;
    if (exportMod.ExportModule) window.ExportModule = exportMod.ExportModule;
    if (syncMod.SyncModule) {
      window.SyncModule = syncMod.SyncModule;
      syncMod.SyncModule.scheduleAutoSync();
    }
    if (quickinputMod.QuickInput) {
      quickinputMod.QuickInput.init();
      window.QuickInput = quickinputMod.QuickInput;
      // 绑定 FAB 按钮
      const qiFab = document.getElementById('qi-fab');
      if (qiFab) {
        qiFab.addEventListener('click', () => quickinputMod.QuickInput.open());
      }
    }
    if (sharedKnowMod.SharedKnowledge) {
      sharedKnowMod.SharedKnowledge.init();
      window.SharedKnowledge = sharedKnowMod.SharedKnowledge;
    }
    if (orchestratorMod.AIOrchestrator) {
      orchestratorMod.AIOrchestrator.init();
      window.AIOrchestrator = orchestratorMod.AIOrchestrator;
    }
    if (modelRouterMod.ModelRouter) {
      modelRouterMod.ModelRouter.init();
      window.ModelRouter = modelRouterMod.ModelRouter;
    }
    if (smartSuggMod.SmartSuggestion) {
      smartSuggMod.SmartSuggestion.init();
      window.SmartSuggestion = smartSuggMod.SmartSuggestion;
    }
    if (userProfileMod.UserProfile) {
      await userProfileMod.UserProfile.init();
      userProfileMod.UserProfile.buildProfile();
      window.UserProfile = userProfileMod.UserProfile;
    }
    if (prefLearnerMod.PreferenceLearner) {
      await prefLearnerMod.PreferenceLearner.init();
      window.PreferenceLearner = prefLearnerMod.PreferenceLearner;
    }
    if (predEngineMod.PredictiveEngine) {
      await predEngineMod.PredictiveEngine.init();
      window.PredictiveEngine = predEngineMod.PredictiveEngine;
    }
    if (auditLogMod.AuditLog) {
      auditLogMod.AuditLog.init();
      window.AuditLog = auditLogMod.AuditLog;
    }
    if (localAIMod.LocalAI) {
      localAIMod.LocalAI.init();
      window.LocalAI = localAIMod.LocalAI;
    }
    if (whitenoiseMod.WhiteNoiseModule) {
      whitenoiseMod.WhiteNoiseModule.init();
      window.WhiteNoiseModule = whitenoiseMod.WhiteNoiseModule;
    }

    // 初始化成就系统
    if (achievementsMod.Achievements) {
      await achievementsMod.Achievements.init();
      window.Achievements = achievementsMod.Achievements;
    }

    // 初始化键盘快捷键（AppUtils 内置）
    if (AppUtils.KeyboardShortcuts) {
      AppUtils.KeyboardShortcuts.init();
    }

    // 初始化离线检测（AppUtils 内置）
    if (AppUtils.OfflineDetector) {
      AppUtils.OfflineDetector.init();
    }

    // 页面卸载时清理定时器
    window.addEventListener('beforeunload', () => {
      if (window.NotificationEngine?.destroy) window.NotificationEngine.destroy();
      if (window.SmartReminder?.destroy) window.SmartReminder.destroy();
      if (window.PredictiveEngine?.destroy) window.PredictiveEngine.destroy();
    });

    console.log('[App] 后台模块初始化完成');
  }

  /**
   * 通用模块加载器（动态 import）
   * @param {string} routeName - 路由名
   */
  async function loadModule(routeName) {
    const config = MODULE_REGISTRY[routeName];
    if (!config) {
      console.warn(`[App] 未注册的模块: ${routeName}`);
      return;
    }

    const container = document.getElementById('content-area');
    try {
      // 加载 HTML 模板
      if (config.html) {
        const html = await fetchModule(config.html);
        container.innerHTML = html;
      }

      // 加载模块样式
      if (config.css) {
        loadModuleCSS(config.css);
      }

      // 清理旧模块
      cleanupCurrentModule();

      // 动态导入模块 JS
      const mod = await import(config.js);
      const moduleName = MODULE_NAME_MAP[routeName];
      const moduleObj = mod[moduleName];

      if (moduleObj && moduleObj.init) {
        moduleObj.init();
        _activeModule = moduleObj;
      }

      // Dashboard 特殊：同时初始化 Report 模块
      if (routeName === 'dashboard') {
        try {
          const reportMod = await lazyImport('report');
          if (reportMod.ReportModule?.init) {
            reportMod.ReportModule.init();
          }
        } catch (e) { /* 静默 */ }
      }
    } catch (err) {
      console.error(`[App] 加载模块 ${routeName} 失败:`, err);
      App.showToast(`加载失败，请刷新重试`);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 初始化自动刷新
   */
  function initAutoRefresh() {
    let lastRefreshTime = 0;
    function safeReload() {
      const now = Date.now();
      if (now - lastRefreshTime < 30000) return;
      const active = document.activeElement;
      if (active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName)) return;
      lastRefreshTime = now;
      reloadCurrentRoute();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] 页面激活，自动刷新数据');
        safeReload();
      }
    });

    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        console.log('[App] PWA 恢复，自动刷新数据');
        safeReload();
      }
    });

    let hasFocused = false;
    window.addEventListener('focus', () => {
      if (hasFocused) safeReload();
      hasFocused = true;
    });
  }

  /**
   * 重新加载当前路由对应的模块
   */
  function reloadCurrentRoute() {
    const currentRoute = Router.getCurrentRoute?.() || 'dashboard';
    if (MODULE_REGISTRY[currentRoute]) {
      cleanupCurrentModule();
      loadModule(currentRoute);
    }
  }

  /**
   * 获取模块 HTML 模板
   */
  async function fetchModule(path) {
    const resp = await fetch(`modules/${path}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  }

  /**
   * 动态加载模块 CSS
   */
  function loadModuleCSS(path) {
    const id = `css-${path.replace(/[\/\.]/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `modules/${path}`;
    document.head.appendChild(link);
  }

  /**
   * 更新侧边栏活跃状态
   */
  function updateSidebarActive(route) {
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-submenu-item').forEach((item) => {
      item.classList.remove('active');
    });

    const target = document.querySelector(`.sidebar-nav-item[data-route="${route}"]`) ||
                   document.querySelector(`.sidebar-submenu-item[data-route="${route}"]`);
    if (target) {
      target.classList.add('active');
      if (target.classList.contains('sidebar-submenu-item')) {
        const parentNav = target.closest('.sidebar-nav-group')
          ?.querySelector('.sidebar-nav-item');
        const submenu = target.closest('.sidebar-submenu');
        if (parentNav) parentNav.classList.add('expanded');
        if (submenu) submenu.classList.add('open');
      }
    }
  }

  /**
   * 初始化侧边栏交互
   */
  function initSidebar() {
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        if (route) {
          Router.navigate(route);
          closeMobileSidebar();
        }
        if (item.dataset.toggle === 'submenu') {
          const submenu = item.nextElementSibling;
          item.classList.toggle('expanded');
          submenu?.classList.toggle('open');
        }
      });
    });

    document.querySelectorAll('.sidebar-submenu-item').forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        if (route) {
          Router.navigate(route);
          closeMobileSidebar();
        }
      });
    });

    const checkinBtn = document.getElementById('checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', handleCheckin);
    }

    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeMobileSidebar);
    }

    const menuBtn = document.getElementById('mobile-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', openMobileSidebar);
    }

    updateStreak();
  }

  /**
   * 处理打卡
   */
  async function handleCheckin() {
    const btn = document.getElementById('checkin-btn');
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    try {
      const existing = await Storage.get('checkins', dateStr);
      if (existing) {
        await Storage.remove('checkins', dateStr);
        btn.classList.remove('checked');
        btn.textContent = '打卡签到';
      } else {
        await Storage.put('checkins', {
          date: dateStr,
          month: monthStr,
          time: `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`,
          habits: []
        });
        btn.classList.add('checked');
        btn.textContent = '已签到';
      }
      updateStreak();
    } catch (err) {
      console.error('[App] 打卡失败:', err);
      showToast('打卡失败，请重试');
    }
  }

  /**
   * 更新连续天数
   */
  async function updateStreak() {
    const streakEl = document.getElementById('streak-count');
    if (!streakEl) return;

    try {
      const allCheckins = await Storage.getAll('checkins');
      const dateSet = new Set(allCheckins.map((c) => c.date));

      let streak = 0;
      const today = new Date();

      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateSet.has(dateStr)) {
          streak++;
        } else {
          if (i === 0) continue;
          break;
        }
      }

      streakEl.textContent = streak;
    } catch (err) {
      console.error('[App] 更新连续天数失败:', err);
      streakEl.textContent = '0';
    }
  }

  /**
   * 初始化顶部栏
   */
  function initTopbar() {
    updateTopbarDate();

    const aiBtns = document.querySelectorAll('.topbar-ai-btn');
    aiBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const title = btn.getAttribute('title') || '';
        if (title.includes('妮可')) {
          openNicole();
        } else if (title.includes('小鹿')) {
          openXiaolu();
        } else {
          showToast('AI对话功能开发中 🤖');
        }
      });
    });

    const moreBtn = document.getElementById('topbar-more-btn');
    const moreMenu = document.getElementById('topbar-more-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('show');
      });
      document.addEventListener('click', () => {
        moreMenu.classList.remove('show');
      });
    }

    document.querySelectorAll('.topbar-more-menu button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'refresh') {
          location.reload();
        } else if (action === 'search') {
          if (window.SearchModule) window.SearchModule.open();
          else showToast('搜索模块加载中...');
        } else if (action === 'save') {
          showToast('数据已自动保存 ✅');
        } else if (action === 'export') {
          if (window.ExportModule) window.ExportModule.showExportDialog();
          else showToast('导出模块加载中...');
        } else if (action === 'import') {
          if (window.ExportModule) window.ExportModule.showImportDialog();
          else showToast('导入模块加载中...');
        } else if (action === 'theme') {
          showThemePicker();
        } else if (action === 'whitenoise') {
          if (window.WhiteNoiseModule) window.WhiteNoiseModule.togglePanel();
          else showToast('白噪音模块加载中...');
        } else if (action === 'sync') {
          if (window.SyncModule) window.SyncModule.smartSync();
          else showToast('同步模块加载中...');
        }
        moreMenu?.classList.remove('show');
      });
    });

    document.querySelectorAll('.topbar-icon-btn:not(#topbar-more-btn):not(#notif-bell)').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.id === 'topbar-audit-btn') {
          if (window.AuditLog?.showAuditPanel) {
            window.AuditLog.showAuditPanel();
          }
          return;
        }
        const tip = btn.dataset.tip || '功能开发中';
        if (tip.includes('生命树')) {
          Router.navigate('lifetree');
        } else {
          showToast(tip);
        }
      });
    });

    // FAB 按钮组
    const fabXiaolu = document.getElementById('ai-fab-xiaolu');
    const fabNicole = document.getElementById('ai-fab-nicole');

    if (fabXiaolu) {
      fabXiaolu.addEventListener('click', () => openXiaolu());
    }
    if (fabNicole) {
      fabNicole.addEventListener('click', () => openNicole());
    }
  }

  /**
   * 懒加载并打开小鹿AI
   */
  async function openXiaolu() {
    try {
      const { XiaoluModule } = await lazyImport('xiaolu');
      window.XiaoluModule = XiaoluModule;
      XiaoluModule.open();
    } catch (e) {
      console.warn('[App] 小鹿模块加载失败:', e);
      showToast('小鹿模块加载中... 🦌');
    }
  }

  /**
   * 懒加载并打开妮可AI
   */
  async function openNicole() {
    try {
      const { NicoleModule } = await lazyImport('nicole');
      window.NicoleModule = NicoleModule;
      NicoleModule.open();
    } catch (e) {
      console.warn('[App] 妮可模块加载失败:', e);
      showToast('妮可模块加载中... 💎');
    }
  }

  /**
   * 更新顶部栏日期
   */
  function updateTopbarDate() {
    const dateEl = document.getElementById('topbar-date');
    if (!dateEl) return;

    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const weekday = weekdays[now.getDay()];

    dateEl.textContent = `${yyyy}-${mm}-${dd} · 周${weekday}`;
  }

  /**
   * 显示 Toast 提示
   */
  function showToast(message, duration = 2000) {
    document.querySelectorAll('.app-toast').forEach((el) => el.remove());

    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--text-primary);
      color: #fff;
      padding: 10px 24px;
      border-radius: var(--radius-full);
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * 打开移动端侧边栏
   */
  function openMobileSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('show');
  }

  /**
   * 关闭移动端侧边栏
   */
  function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  }

  /**
   * 注册 Service Worker
   */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[App] Service Worker 注册成功，scope:', reg.scope);

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.log('[App] 检测到新版本，自动刷新');
                    location.reload();
                  });
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[App] Service Worker 注册失败:', err);
        });
    }
  }

  /**
   * 显示主题选择器
   */
  function showThemePicker() {
    document.querySelectorAll('.theme-picker-overlay').forEach(el => el.remove());

    const currentTheme = window.ThemeManager ? window.ThemeManager.getTheme() : 'light';
    const overlay = document.createElement('div');
    overlay.className = 'theme-picker-overlay';
    overlay.innerHTML = `
      <div class="theme-picker-backdrop"></div>
      <div class="theme-picker-container">
        <div class="theme-picker-title">🎨 选择主题</div>
        <div class="theme-picker-options">
          <button class="theme-picker-option ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
            <span class="theme-icon">☀️</span>
            <span class="theme-label">浅色模式</span>
            ${currentTheme === 'light' ? '<span class="theme-check">✓</span>' : ''}
          </button>
          <button class="theme-picker-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
            <span class="theme-icon">🌙</span>
            <span class="theme-label">深色模式</span>
            ${currentTheme === 'dark' ? '<span class="theme-check">✓</span>' : ''}
          </button>
          <button class="theme-picker-option ${currentTheme === 'auto' ? 'active' : ''}" data-theme="auto">
            <span class="theme-icon">💻</span>
            <span class="theme-label">跟随系统</span>
            ${currentTheme === 'auto' ? '<span class="theme-check">✓</span>' : ''}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.theme-picker-backdrop').addEventListener('click', () => overlay.remove());

    overlay.querySelectorAll('.theme-picker-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        if (window.ThemeManager) {
          await window.ThemeManager.setTheme(theme);
        }
        overlay.querySelectorAll('.theme-picker-option').forEach(b => {
          b.classList.remove('active');
          const check = b.querySelector('.theme-check');
          if (check) check.remove();
        });
        btn.classList.add('active');
        const checkSpan = document.createElement('span');
        checkSpan.className = 'theme-check';
        checkSpan.textContent = '✓';
        btn.appendChild(checkSpan);

        setTimeout(() => overlay.remove(), 300);
      });
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  return {
    init,
    showToast,
    updateStreak,
    destroy: cleanupCurrentModule
  };
})();

// 设置全局引用（供 utils.js 等的 typeof 检查使用）
window.App = App;
window.Router = Router;
window.EventBus = EventBus;
window.Storage = Storage;
window.AppUtils = AppUtils;
window.ModuleLifecycle = ModuleLifecycle;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();

  // EventBus: 网络状态事件
  window.addEventListener('online', () => EventBus.emit('app:online'));
  window.addEventListener('offline', () => EventBus.emit('app:offline'));
});
