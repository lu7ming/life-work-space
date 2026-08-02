/**
 * app.js - 主应用入口
 * 人生工作台 · 应用初始化与全局管理
 */

const App = (() => {
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
    if (typeof SecureStorage !== 'undefined' && SecureStorage.init) {
      try {
        await SecureStorage.init();
      } catch (err) {
        console.warn('[App] SecureStorage 初始化失败（不影响使用）:', err);
      }
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
    Router.register('templates', loadTemplates);
    Router.register('timetracker', loadTimeTracker);

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

    // 9.1 页面卸载时清理定时器，防止内存泄漏
    window.addEventListener('beforeunload', () => {
      if (typeof NotificationEngine !== 'undefined' && NotificationEngine.destroy) {
        NotificationEngine.destroy();
      }
      if (typeof SmartReminder !== 'undefined' && SmartReminder.destroy) {
        SmartReminder.destroy();
      }
      if (typeof PredictiveEngine !== 'undefined' && PredictiveEngine.destroy) {
        PredictiveEngine.destroy();
      }
    });

    // 9.5 初始化白噪音模块
    if (typeof WhiteNoiseModule !== 'undefined') {
      WhiteNoiseModule.init();
    }

    // 10. 初始化主题系统
    if (typeof ThemeManager !== 'undefined') {
      await ThemeManager.init();
    }

    // 11. 初始化快速录入引擎
    if (typeof QuickInput !== 'undefined') {
      QuickInput.init();
      // 绑定 FAB 按钮
      const qiFab = document.getElementById('qi-fab');
      if (qiFab) {
        qiFab.addEventListener('click', () => QuickInput.open());
      }
    }

    // 12. 初始化模板系统
    if (typeof Templates !== 'undefined') {
      await Templates.init();
    }

    // 13. 初始化键盘快捷键
    if (typeof KeyboardShortcuts !== 'undefined') {
      KeyboardShortcuts.init();
    }

    // 14. 初始化离线检测
    if (typeof OfflineDetector !== 'undefined') {
      OfflineDetector.init();
    }

    // 15. 初始化智能提醒
    if (typeof SmartReminder !== 'undefined') {
      SmartReminder.init();
    }

    // 16. 初始化共享知识层
    if (typeof SharedKnowledge !== 'undefined' && SharedKnowledge.init) {
      SharedKnowledge.init();
    }

    // 16.5 初始化AI智能路由
    if (typeof AIOrchestrator !== 'undefined' && AIOrchestrator.init) {
      AIOrchestrator.init();
    }

    // 16.6 初始化多模型路由
    if (typeof ModelRouter !== 'undefined' && ModelRouter.init) {
      ModelRouter.init();
    }

    // 16.7 初始化智能建议系统
    if (typeof SmartSuggestion !== 'undefined' && SmartSuggestion.init) {
      SmartSuggestion.init();
    }

    // 17. 初始化用户画像
    if (typeof UserProfile !== 'undefined') {
      await UserProfile.init();
      UserProfile.buildProfile();
    }

    // 17.5 初始化偏好学习引擎
    if (typeof PreferenceLearner !== 'undefined' && PreferenceLearner.init) {
      await PreferenceLearner.init();
    }

    // 17.6 初始化预测性操作引擎
    if (typeof PredictiveEngine !== 'undefined' && PredictiveEngine.init) {
      await PredictiveEngine.init();
    }

    // 18. 自动保存定时器（30秒）
    setInterval(() => {
      // 静默自动保存 - 数据已通过 IndexedDB 自动持久化，此处仅提供视觉反馈
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
      'lifetree': loadLifeTree,
      'templates': loadTemplates,
      'timetracker': loadTimeTracker
    };
    
    const handler = routeHandlers[currentRoute];
    if (handler && typeof handler === 'function') {
      cleanupCurrentModule();
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

      // 清理旧模块，防止事件监听器泄漏
      cleanupCurrentModule();

      // 初始化模块逻辑
      if (typeof DashboardModule !== 'undefined' && DashboardModule.init) {
        DashboardModule.init();
        _activeModule = DashboardModule;
      }
    } catch (err) {
      console.error('[App] 加载总面板失败:', err);
      if (typeof App !== 'undefined') App.showToast('加载总面板失败，请刷新重试');
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

      // 清理旧模块，防止事件监听器泄漏
      cleanupCurrentModule();

      // 初始化模块逻辑
      if (typeof HabitsModule !== 'undefined' && HabitsModule.init) {
        HabitsModule.init();
        _activeModule = HabitsModule;
      }
    } catch (err) {
      console.error('[App] 加载习惯打卡失败:', err);
      if (typeof App !== 'undefined') App.showToast('加载习惯打卡失败，请刷新重试');
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

      // 清理旧模块，防止事件监听器泄漏
      cleanupCurrentModule();

      // 初始化模块逻辑
      if (typeof TasksModule !== 'undefined' && TasksModule.init) {
        TasksModule.init();
        _activeModule = TasksModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof StudyModule !== 'undefined' && StudyModule.init) {
        StudyModule.init();
        _activeModule = StudyModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof HealthModule !== 'undefined' && HealthModule.init) {
        HealthModule.init();
        _activeModule = HealthModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof FinanceModule !== 'undefined' && FinanceModule.init) {
        FinanceModule.init();
        _activeModule = FinanceModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof JournalModule !== 'undefined' && JournalModule.init) {
        JournalModule.init();
        _activeModule = JournalModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof KnowledgeModule !== 'undefined' && KnowledgeModule.init) {
        KnowledgeModule.init();
        _activeModule = KnowledgeModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof GoalsModule !== 'undefined' && GoalsModule.init) {
        GoalsModule.init();
        _activeModule = GoalsModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof RelationsModule !== 'undefined' && RelationsModule.init) {
        RelationsModule.init();
        _activeModule = RelationsModule;
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
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof LifeTreeModule !== 'undefined' && LifeTreeModule.init) {
        LifeTreeModule.init();
        _activeModule = LifeTreeModule;
      }
    } catch (err) {
      console.error('[App] 加载生命树模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载模板系统模块
   */
  async function loadTemplates() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('templates/templates.html');
      container.innerHTML = html;
      // 清理旧模块
      cleanupCurrentModule();

      if (typeof TemplatesModule !== 'undefined' && TemplatesModule.init) {
        TemplatesModule.init();
        _activeModule = TemplatesModule;
      }
    } catch (err) {
      console.error('[App] 加载模板模块失败:', err);
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败，请刷新重试</p>';
    }
  }

  /**
   * 加载时间追踪模块
   */
  async function loadTimeTracker() {
    const container = document.getElementById('content-area');
    try {
      const html = await fetchModule('timetracker/timetracker.html');
      container.innerHTML = html;
      loadModuleCSS('timetracker/timetracker.css');
      cleanupCurrentModule();

      if (typeof TimeTrackerModule !== 'undefined' && TimeTrackerModule.init) {
        TimeTrackerModule.init();
        _activeModule = TimeTrackerModule;
      }
    } catch (err) {
      console.error('[App] 加载时间追踪模块失败:', err);
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

    // AI 按钮点击事件
    const aiBtns = document.querySelectorAll('.topbar-ai-btn');
    aiBtns.forEach((btn) => {
      let longPressTimer = null;
      let longPressed = false;

      // 长按 500ms → 打开小鹿并直接语音输入
      const onLongPressStart = (e) => {
        const title = btn.getAttribute('title') || '';
        if (!title.includes('小鹿')) return; // 只对🦌按钮生效

        longPressed = false;
        longPressTimer = setTimeout(() => {
          longPressed = true;
          // 触觉反馈 + 视觉反馈
          if (navigator.vibrate) navigator.vibrate(30);
          btn.classList.add('long-press-active');
          if (typeof XiaoluModule !== 'undefined') {
            XiaoluModule.quickVoiceInput();
          }
        }, 500);
      };

      const onLongPressEnd = () => {
        clearTimeout(longPressTimer);
        btn.classList.remove('long-press-active');
      };

      // 触屏长按
      let topbarTouchStart = 0;
      btn.addEventListener('touchstart', (e) => {
        topbarTouchStart = Date.now();
        onLongPressStart(e);
      }, { passive: true });
      btn.addEventListener('touchend', (e) => {
        onLongPressEnd();
        // 短按手动触发 click
        if (!longPressed && (Date.now() - topbarTouchStart) < 500) {
          e.preventDefault();
          const title = btn.getAttribute('title') || '';
          if (title.includes('小鹿')) {
            typeof XiaoluModule !== 'undefined' ? XiaoluModule.open() : showToast('小鹿模块加载中... 🦌');
          } else if (title.includes('妮可')) {
            typeof NicoleModule !== 'undefined' ? NicoleModule.open() : showToast('妮可模块加载中... 💎');
          }
        }
      });
      btn.addEventListener('touchcancel', onLongPressEnd);
      // 鼠标长按（兼容）
      btn.addEventListener('mousedown', onLongPressStart);
      btn.addEventListener('mouseup', onLongPressEnd);
      btn.addEventListener('mouseleave', onLongPressEnd);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      btn.addEventListener('selectstart', (e) => e.preventDefault());

      // 普通点击（非长按时触发）
      btn.addEventListener('click', () => {
        if (longPressed) return; // 刚长按过，忽略点击
        const title = btn.getAttribute('title') || '';
        if (title.includes('妮可')) {
          if (typeof NicoleModule !== 'undefined') {
            NicoleModule.open();
          } else {
            showToast('妮可模块加载中...');
          }
        } else if (title.includes('小鹿')) {
          if (typeof XiaoluModule !== 'undefined') {
            XiaoluModule.open();
          } else {
            showToast('小鹿模块加载中... 🦌');
          }
        } else {
          showToast('AI对话功能开发中 🤖');
        }
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
          showThemePicker();
        } else if (action === 'whitenoise') {
          if (typeof WhiteNoiseModule !== 'undefined') WhiteNoiseModule.togglePanel();
          else showToast('白噪音模块加载中...');
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

    // ===== 右下角 FAB 按钮组事件 =====
    const fabXiaolu = document.getElementById('ai-fab-xiaolu');
    const fabNicole = document.getElementById('ai-fab-nicole');

    // 🦌 小鹿AI：点击打开面板，长按快捷语音
    if (fabXiaolu) {
      let fabLongPressTimer = null;
      let fabLongPressed = false;
      let fabTouchStartTime = 0;

      const onFabLongPressStart = (e) => {
        fabLongPressed = false;
        fabTouchStartTime = Date.now();
        fabLongPressTimer = setTimeout(() => {
          fabLongPressed = true;
          if (navigator.vibrate) navigator.vibrate(30);
          fabXiaolu.classList.add('long-press-active');
          if (typeof XiaoluModule !== 'undefined') {
            XiaoluModule.quickVoiceInput();
          }
        }, 500);
      };

      const onFabLongPressEnd = () => {
        clearTimeout(fabLongPressTimer);
        fabXiaolu.classList.remove('long-press-active');
      };

      fabXiaolu.addEventListener('touchstart', (e) => {
        // 不在 touchstart preventDefault，否则 iOS 会阻止 click 事件
        onFabLongPressStart(e);
      }, { passive: true });
      fabXiaolu.addEventListener('touchend', (e) => {
        onFabLongPressEnd();
        // 短按（非长按）手动触发打开面板
        if (!fabLongPressed && (Date.now() - fabTouchStartTime) < 500) {
          e.preventDefault(); // 阻止后续 click 重复触发
          if (typeof XiaoluModule !== 'undefined') {
            XiaoluModule.open();
          }
        }
      });
      fabXiaolu.addEventListener('touchcancel', onFabLongPressEnd);
      fabXiaolu.addEventListener('mousedown', onFabLongPressStart);
      fabXiaolu.addEventListener('mouseup', onFabLongPressEnd);
      fabXiaolu.addEventListener('mouseleave', onFabLongPressEnd);
      fabXiaolu.addEventListener('contextmenu', (e) => e.preventDefault());

      // 保留 click 作为桌面端 fallback
      fabXiaolu.addEventListener('click', () => {
        if (fabLongPressed) return;
        if (typeof XiaoluModule !== 'undefined') {
          XiaoluModule.open();
        } else {
          showToast('小鹿模块加载中... 🦌');
        }
      });
    }

    // 💎 妮可AI：点击打开面板
    if (fabNicole) {
      fabNicole.addEventListener('click', () => {
        if (typeof NicoleModule !== 'undefined') {
          NicoleModule.open();
        } else {
          showToast('妮可模块加载中... 💎');
        }
      });
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
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[App] Service Worker 注册成功，scope:', reg.scope);

          // 检测 SW 更新，自动刷新页面
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // 新 SW 已就绪，通知它立即激活
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  // 等新 SW 接管后自动刷新页面
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
    // 移除已有的选择器
    document.querySelectorAll('.theme-picker-overlay').forEach(el => el.remove());

    const currentTheme = typeof ThemeManager !== 'undefined' ? ThemeManager.getTheme() : 'light';
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

    // 绑定事件
    overlay.querySelector('.theme-picker-backdrop').addEventListener('click', () => overlay.remove());

    overlay.querySelectorAll('.theme-picker-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        if (typeof ThemeManager !== 'undefined') {
          await ThemeManager.setTheme(theme);
        }
        // 更新选中状态
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

        // 短暂延迟后关闭
        setTimeout(() => overlay.remove(), 300);
      });
    });

    // ESC 关闭
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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
