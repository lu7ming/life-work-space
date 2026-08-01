/**
 * router.js - 基于 hash 的路由管理
 * 人生工作台 · 页面导航
 */

const Router = (() => {
  // 路由注册表
  const routes = {};
  // 当前路由
  let currentRoute = '';
  // 路由变化回调
  const listeners = [];

  /**
   * 注册路由
   * @param {string} path - 路由路径（如 'dashboard'）
   * @param {Function} handler - 路由处理函数
   */
  function register(path, handler) {
    routes[path] = handler;
  }

  /**
   * 解析当前 hash，返回路由名
   */
  function parseHash() {
    const hash = window.location.hash.slice(2); // 去掉 '#/'
    return hash || 'dashboard'; // 默认路由为 dashboard
  }

  /**
   * 导航到指定路由
   * @param {string} path - 目标路由
   */
  function navigate(path) {
    if (path === currentRoute) return;
    window.location.hash = `#/${path}`;
  }

  /**
   * 处理路由变化
   */
  function handleRouteChange() {
    const route = parseHash();
    if (route === currentRoute) return;

    const prevRoute = currentRoute;
    currentRoute = route;

    // 触发路由监听器
    listeners.forEach((fn) => fn(route, prevRoute));

    // 执行路由处理函数
    if (routes[route]) {
      routes[route]();
    } else {
      console.warn(`[Router] 未注册的路由: ${route}`);
      // 回退到首页
      if (route !== 'dashboard') {
        navigate('dashboard');
      }
    }
  }

  /**
   * 监听路由变化
   * @param {Function} callback - 回调函数 (newRoute, oldRoute) => void
   */
  function onRouteChange(callback) {
    listeners.push(callback);
  }

  /**
   * 获取当前路由
   */
  function getCurrentRoute() {
    return currentRoute;
  }

  /**
   * 初始化路由系统
   */
  function init() {
    // 监听 hash 变化
    window.addEventListener('hashchange', handleRouteChange);

    // 处理首次加载
    handleRouteChange();
  }

  /**
   * 销毁路由系统
   */
  function destroy() {
    window.removeEventListener('hashchange', handleRouteChange);
    listeners.length = 0;
  }

  return {
    register,
    navigate,
    onRouteChange,
    getCurrentRoute,
    init,
    destroy
  };
})();
