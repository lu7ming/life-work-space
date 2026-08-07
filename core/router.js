/**
 * router.js - 基于 hash 的路由管理
 * 人生工作台 · 页面导航
 *
 * v2 - 集成 ModuleLifecycle，路由切换时自动停用旧模块
 * v3 - 支持 hash 查询参数（#/path?key=value），用于跨模块定位 Tab/卡片
 */
import { ModuleLifecycle } from './module-lifecycle.js';


export const Router = (() => {
  // 路由注册表
  const routes = {};
  // 当前路由（纯路径，不含参数）
  let currentRoute = '';
  // 当前路由参数
  let currentParams = {};
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
   * 解析当前 hash，返回 { route, params }
   */
  function parseHash() {
    const hash = window.location.hash.slice(2); // 去掉 '#/'
    if (!hash) return { route: 'dashboard', params: {} };

    const [rawPath, rawQuery = ''] = hash.split('?');
    const params = {};
    if (rawQuery) {
      rawQuery.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : '';
      });
    }
    return { route: rawPath || 'dashboard', params };
  }

  /**
   * 导航到指定路由
   * @param {string} path - 目标路由
   * @param {Object} [params] - 查询参数对象
   */
  function navigate(path, params) {
    let target = path;
    if (params && Object.keys(params).length > 0) {
      const qs = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      target += `?${qs}`;
    }
    // 相同路径 + 不同参数也算切换
    const parsed = parseHash();
    if (path === currentRoute && JSON.stringify(params || {}) === JSON.stringify(currentParams)) return;
    window.location.hash = `#/${target}`;
  }

  /**
   * 处理路由变化
   */
  function handleRouteChange() {
    const { route, params } = parseHash();

    const prevRoute = currentRoute;
    const prevParams = currentParams;

    const routeChanged = route !== currentRoute;
    const paramsChanged = JSON.stringify(params) !== JSON.stringify(currentParams);

    currentRoute = route;
    currentParams = params;

    if (routeChanged) {
      // ===== 生命周期管理：停用旧模块 =====
      ModuleLifecycle.deactivateCurrent();
    }

    // 触发路由监听器
    listeners.forEach((fn) => fn(route, prevRoute, params, prevParams));

    // 执行路由处理函数
    if (routes[route]) {
      routes[route](params);
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
   * @param {Function} callback - 回调函数 (newRoute, oldRoute, newParams, oldParams) => void
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
   * 获取当前路由参数
   */
  function getCurrentParams() {
    return { ...currentParams };
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
    getCurrentParams,
    init,
    destroy
  };
})();
