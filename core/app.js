/**
 * app.js - 主应用入口
 * 人生工作台 · 应用初始化与全局管理
 */

const App = (() => {
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

    // 2. 注册路由
    Router.register('dashboard', loadDashboard);
    Router.register('habits', loadHabits);
    Router.register('tasks', loadTasks);
    Router.register('study', loadStudy);
    Router.register('health', loadHealth);
    Router.register('finance', loadFinance);
    Router.register('journal', loadJournal);
    Router.register('relations', loadRelations);
    Router.register('knowledge', loadKnowledge);
    Router.register('goals', loadGoals);
    Router.register('lifetree', loadLifeTree);

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

    // 9. 初始化通知引擎
    if (typeof NotificationEngine !== 'undefined') {
      NotificationEngine.init();
    }

    console.log('[App] 人生工作台已就绪 🎉');
  }

  /**
   * 初始化自动刷新
   * 每次进入工作台时自动刷新当前页面数据
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

    // 页面从后台切换到前台时刷新
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] 页面激活，自动刷新数据');
        safeReload();
      }
    });

    // PWA 从后台恢复时刷新（移动端）
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        console.log('[App] PWA 恢复，自动刷新数据');
        safeReload();
      }
    });

    // 窗口获得焦点时刷新（桌面端）
    let hasFocused = false;
    window.addEventListener('focus', () => {
      if (hasFocused) {
        safeReload();
      }
      hasFocused = true;
    });
  }

  /**
   * 重新加载当前路由对应的模块
   */
  function reloadCurrentRoute() {
    const currentRoute = Router.getCurrentRoute?.() || 'dashboard';
    const routeHandlers = {
      'dashboard': loadDashboard,
      'habits': loadHabits,
      'tasks': loadTasks,
      'study': loadStudy,
      'health': loadHealth,
      'finance': loadFinance,
      'journal': loadJournal,
      'relations': loadRelations,
      'knowledge': loadKnowledge,
      'goals': loadGoals,
      'lifetree': loadLifeTree
    };
    
    const handler = routeHandlers[currentRoute];
    if (handler && typeof handler === 'function') {
      handler();
    }
  }

  /**
   * 加载总面板模块
   */
  async function loadDashboard() {
    const container = document.getElementById('content-area');
    try {
      // 加载模板
      const html = await fetchModule('dashboard/dashboard.html');
      container.innerHTML = html;

      // 加载模块样式（如果未加载过）
      loadModuleCSS('dashboard/dashboard.css');

      // 初始化模块逻辑
      if (typeof DashboardModule !== 'undefined' && DashboardModule.init) {
        DashboardModule.init();
      }
    } catch (err) {
      console.error('[App] 加载总面板失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载习惯打卡模块
   */
  async function loadHabits() {
    const container = document.getElementById('content-area');
    try {
      // 加载模板
      const html = await fetchModule('habits/habits.html');
      container.innerHTML = html;

      // 加载模块样式
      loadModuleCSS('habits/habits.css');

      // 初始化模块逻辑
      if (typeof HabitsModule !== 'undefined' && HabitsModule.init) {
        HabitsModule.init();
      }
    } catch (err) {
      console.error('[App] 加载习惯打卡失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载任务模块
   */
  async function loadTasks() {
    const container = document.getElementById('content-area');
    try {
      // 加载模板
      const html = await fetchModule('tasks/tasks.html');
      container.innerHTML = html;

      // 加载模块样式
      loadModuleCSS('tasks/tasks.css');

      // 初始化模块逻辑
      if (typeof TasksModule !== 'undefined' && TasksModule.init) {
        TasksModule.init();
      }
    } catch (err) {
      console.error('[App] 加载任务模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载学习模块
   */
  async function loadStudy() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('study/study.html');
      container.innerHTML = html;
      loadModuleCSS('study/study.css');
      if (typeof StudyModule !== 'undefined' && StudyModule.init) {
        StudyModule.init();
      }
    } catch (err) {
      console.error('[App] 加载学习模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载健康模块
   */
  async function loadHealth() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('health/health.html');
      container.innerHTML = html;
      loadModuleCSS('health/health.css');
      if (typeof HealthModule !== 'undefined' && HealthModule.init) {
        HealthModule.init();
      }
    } catch (err) {
      console.error('[App] 加载健康模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载财务模块
   */
  async function loadFinance() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('finance/finance.html');
      container.innerHTML = html;
      loadModuleCSS('finance/finance.css');
      if (typeof FinanceModule !== 'undefined' && FinanceModule.init) {
        FinanceModule.init();
      }
    } catch (err) {
      console.error('[App] 加载财务模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载记录与反思模块
   */
  async function loadJournal() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('journal/journal.html');
      container.innerHTML = html;
      loadModuleCSS('journal/journal.css');
      if (typeof JournalModule !== 'undefined' && JournalModule.init) {
        JournalModule.init();
      }
    } catch (err) {
      console.error('[App] 加载记录与反思模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载知识库模块
   */
  async function loadKnowledge() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('knowledge/knowledge.html');
      container.innerHTML = html;
      loadModuleCSS('knowledge/knowledge.css');
      if (typeof KnowledgeModule !== 'undefined' && KnowledgeModule.init) {
        KnowledgeModule.init();
      }
    } catch (err) {
      console.error('[App] 加载知识库模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载目标模块
   */
  async function loadGoals() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('goals/goals.html');
      container.innerHTML = html;
      loadModuleCSS('goals/goals.css');
      if (typeof GoalsModule !== 'undefined' && GoalsModule.init) {
        GoalsModule.init();
      }
    } catch (err) {
      console.error('[App] 加载目标模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载关系模块
   */
  async function loadRelations() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('relations/relations.html');
      container.innerHTML = html;
      loadModuleCSS('relations/relations.css');
      if (typeof RelationsModule !== 'undefined' && RelationsModule.init) {
        RelationsModule.init();
      }
    } catch (err) {
      console.error('[App] 加载关系模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载生命树模块
   */
  async function loadLifeTree() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('lifetree/lifetree.html');
      container.innerHTML = html;
      loadModuleCSS('lifetree/lifetree.css');
      if (typeof LifeTreeModule !== 'undefined' && LifeTreeModule.init) {
        LifeTreeModule.init();
      }
    } catch (err) {
      console.error('[App] 加载生命树模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载占位页面（未开发的模块）
   */
  function loadPlaceholder(name) {
    const container = document.getElementById('content-area');
    container.innerHTML = `
      <div class="page-enter" style="text-align:center;padding:80px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">🚧</div>
        <h2 style="font-size:22px;color:var(--text-primary);margin-bottom:8px;">${name}</h2>
        <p style="color:var(--text-muted);font-size:14px;">该模块正在开发中，敬请期待</p>
      </div>
    `;
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
    // 清除所有 active
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-submenu-item').forEach((item) => {
      item.classList.remove('active');
    });

    // 设置当前 active
    const target = document.querySelector(`.sidebar-nav-item[data-route="${route}"]`) ||
                   document.querySelector(`.sidebar-submenu-item[data-route="${route}"]`);
    if (target) {
      target.classList.add('active');
      // 如果是子菜单项，展开父级
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
    // 导航点击
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        if (route) {
          Router.navigate(route);
          closeMobileSidebar();
        }
        // 更多按钮展开/折叠
        if (item.dataset.toggle === 'submenu') {
          const submenu = item.nextElementSibling;
          item.classList.toggle('expanded');
          submenu?.classList.toggle('open');
        }
      });
    });

    // 子菜单项点击
    document.querySelectorAll('.sidebar-submenu-item').forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        if (route) {
          Router.navigate(route);
          closeMobileSidebar();
        }
      });
    });

    // 打卡按钮
    const checkinBtn = document.getElementById('checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', handleCheckin);
    }

    // 移动端遮罩点击关闭
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeMobileSidebar);
    }

    // 移动端菜单按钮
    const menuBtn = document.getElementById('mobile-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', openMobileSidebar);
    }

    // 更新连续天数
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
        // 已签到，取消签到
        await Storage.remove('checkins', dateStr);
        btn.classList.remove('checked');
        btn.textContent = '打卡签到';
      } else {
        // 签到
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
      const dates = allCheckins.map((c) => c.date).sort().reverse();

      let streak = 0;
      const today = new Date();

      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dates.includes(dateStr)) {
          streak++;
        } else {
          // 允许今天还没打卡的情况（从昨天算起）
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
    // 更新日期显示
    updateTopbarDate();

    // AI 按钮点击提示
    document.querySelectorAll('.topbar-ai-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        showToast('AI对话功能开发中 🤖');
      });
    });

    // 更多菜单切换
    const moreBtn = document.getElementById('topbar-more-btn');
    const moreMenu = document.getElementById('topbar-more-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('show');
      });
      // 点击其他地方关闭
      document.addEventListener('click', () => {
        moreMenu.classList.remove('show');
      });
    }

    // 更多菜单项
    document.querySelectorAll('.topbar-more-menu button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'refresh') {
          location.reload();
        } else if (action === 'search') {
          if (typeof SearchModule !== 'undefined') SearchModule.open();
          else showToast('搜索模块加载中...');
        } else if (action === 'save') {
          showToast('数据已自动保存 ✅');
        } else if (action === 'export') {
          if (typeof ExportModule !== 'undefined') ExportModule.showExportDialog();
          else showToast('导出模块加载中...');
        } else if (action === 'import') {
          if (typeof ExportModule !== 'undefined') ExportModule.showImportDialog();
          else showToast('导入模块加载中...');
        } else if (action === 'theme') {
          showToast('主题切换功能开发中 🎨');
        }
        moreMenu?.classList.remove('show');
      });
    });

    // 生命树 & 设置按钮（排除通知铃铛和更多按钮）
    document.querySelectorAll('.topbar-icon-btn:not(#topbar-more-btn):not(#notif-bell)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tip = btn.dataset.tip || '功能开发中';
        if (tip.includes('生命树')) {
          Router.navigate('lifetree');
        } else {
          showToast(tip);
        }
      });
    });
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
    // 移除已有 toast
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

    // 动画显示
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    // 自动隐藏
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
      // 先清除所有旧版缓存
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key !== 'life-workspace-v6') {
              caches.delete(key);
              console.log('[App] 已清除旧缓存:', key);
            }
          });
        });
      }
      navigator.serviceWorker.register('./sw.js?v=' + Date.now())
        .then((reg) => {
          console.log('[App] Service Worker 注册成功，scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[App] Service Worker 注册失败:', err);
        });
    }
  }

  return {
    init,
    showToast,
    updateStreak
  };
})();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
