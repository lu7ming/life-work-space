/**
 * theme.js - 主题管理模块
 * 人生工作台 · 明暗模式切换
 */

const ThemeManager = (() => {
  const STORAGE_KEY = 'theme';
  const THEMES = { LIGHT: 'light', DARK: 'dark', AUTO: 'auto' };
  let currentTheme = THEMES.LIGHT;
  let mediaQuery = null;

  /**
   * 初始化主题
   * 从 IndexedDB 读取存储的主题，应用到页面
   */
  async function init() {
    try {
      const stored = await Storage.get('settings', 'theme');
      if (stored && stored.value) {
        currentTheme = stored.value;
      } else {
        // 兜底：从 localStorage 读取（防闪白脚本写入的）
        try {
          const lsRaw = localStorage.getItem('life-workspace-theme');
          if (lsRaw) {
            const lsData = JSON.parse(lsRaw);
            if (lsData && lsData.value) {
              currentTheme = lsData.value;
            }
          }
        } catch (e2) {}
      }
    } catch (e) {
      // 兜底 localStorage
      try {
        const lsRaw = localStorage.getItem('life-workspace-theme');
        if (lsRaw) {
          const lsData = JSON.parse(lsRaw);
          if (lsData && lsData.value) {
            currentTheme = lsData.value;
          }
        }
      } catch (e2) {}
    }

    // 监听系统主题变化（auto 模式）
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (currentTheme === THEMES.AUTO) {
        applyTheme();
      }
    });

    applyTheme();

    // 同步到 localStorage（供防闪白脚本同步读取）
    try {
      localStorage.setItem('life-workspace-theme', JSON.stringify({ id: 'theme', value: currentTheme }));
    } catch (e) {}

    console.log('[Theme] 主题已初始化:', currentTheme);
  }

  /**
   * 设置主题
   * @param {'light'|'dark'|'auto'} theme
   */
  async function setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) return;
    currentTheme = theme;

    try {
      await Storage.put('settings', { key: 'theme', value: theme });
    } catch (e) {
      console.warn('[Theme] 存储主题失败:', e);
    }

    // 同步到 localStorage（供防闪白脚本同步读取）
    try {
      localStorage.setItem('life-workspace-theme', JSON.stringify({ key: 'theme', value: theme }));
    } catch (e) {}

    applyTheme();
  }

  /**
   * 获取当前主题
   */
  function getTheme() {
    return currentTheme;
  }

  /**
   * 切换主题（light → dark → auto → light 循环）
   */
  async function toggleTheme() {
    const order = [THEMES.LIGHT, THEMES.DARK, THEMES.AUTO];
    const idx = order.indexOf(currentTheme);
    const next = order[(idx + 1) % order.length];
    await setTheme(next);
    return next;
  }

  /**
   * 应用主题到 DOM
   */
  function applyTheme() {
    let effectiveTheme;

    if (currentTheme === THEMES.AUTO) {
      effectiveTheme = mediaQuery && mediaQuery.matches ? THEMES.DARK : THEMES.LIGHT;
    } else {
      effectiveTheme = currentTheme;
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);

    // 更新 meta theme-color
    const metaColor = document.querySelector('meta[name="theme-color"]');
    if (metaColor) {
      metaColor.setAttribute('content', effectiveTheme === THEMES.DARK ? '#1A1A2E' : '#D4BA9F');
    }

    // 更新 apple-mobile-web-app-status-bar-style
    const appleStyle = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStyle) {
      appleStyle.setAttribute('content', effectiveTheme === THEMES.DARK ? 'dark' : 'default');
    }
  }

  /**
   * 获取主题标签（用于 UI 展示）
   */
  function getThemeLabel(theme) {
    const labels = {
      light: '☀️ 浅色模式',
      dark: '🌙 深色模式',
      auto: '💻 跟随系统'
    };
    return labels[theme] || theme;
  }

  return {
    init,
    setTheme,
    getTheme,
    toggleTheme,
    getThemeLabel,
    THEMES
  };
})();
