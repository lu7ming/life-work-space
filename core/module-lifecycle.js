/**
 * module-lifecycle.js - 模块生命周期管理器
 * 人生工作台 · 路由切换时自动清理事件监听器，防止 iPad 内存泄漏
 *
 * 职责：
 * 1. 统一注册所有模块实例
 * 2. 路由切换时自动 deactivate 旧模块、activate 新模块
 * 3. 跟踪每个模块的 EventBus 订阅，deactivate 时自动解绑
 * 4. 提供 destroyAll 用于页面卸载时全局清理
 *
 * 使用方式（模块内）：
 *   ModuleLifecycle.on('eventName', handler);   // 替代 EventBus.on
 *   ModuleLifecycle.once('eventName', handler);  // 替代 EventBus.once
 *   // deactivate 时自动调用 EventBus.off 解绑
 */

;(function () {
  'use strict';

  // 模块注册表：name → { instance, busListeners }
  const _modules = new Map();

  // 当前活跃的模块名
  let _activeModuleName = null;

  const ModuleLifecycle = {
    /**
     * 注册模块
     * @param {string} name - 模块名（如 'tasks', 'habits'）
     * @param {Object} moduleInstance - 模块实例，需有 init() 方法，可选 destroy() 方法
     */
    register(name, moduleInstance) {
      if (_modules.has(name)) {
        console.warn('[ModuleLifecycle] 模块已注册，覆盖:', name);
      }
      _modules.set(name, {
        instance: moduleInstance,
        busListeners: [] // [{ eventName, fn }] EventBus 订阅追踪
      });
    },

    /**
     * 激活模块
     * @param {string} name - 模块名
     * @returns {boolean} 是否成功激活
     */
    activate(name) {
      const entry = _modules.get(name);
      if (!entry) {
        console.warn('[ModuleLifecycle] 未注册的模块:', name);
        return false;
      }

      // 同一模块重复激活时跳过
      if (_activeModuleName === name) return true;

      _activeModuleName = name;

      // 调用模块的 init 方法（如果有的话）
      const mod = entry.instance;
      if (typeof mod.init === 'function') {
        try {
          mod.init();
        } catch (e) {
          console.error('[ModuleLifecycle] 模块 init 失败:', name, e);
        }
      }

      console.log('[ModuleLifecycle] 激活模块:', name);
      return true;
    },

    /**
     * 停用模块
     * @param {string} name - 模块名
     * @returns {boolean} 是否成功停用
     */
    deactivate(name) {
      const entry = _modules.get(name);
      if (!entry) return false;

      // 清理该模块的 EventBus 订阅
      _cleanupBusListeners(entry);

      // 调用模块的 destroy 方法（如果有的话）
      const mod = entry.instance;
      if (typeof mod.destroy === 'function') {
        try {
          mod.destroy();
        } catch (e) {
          console.error('[ModuleLifecycle] 模块 destroy 失败:', name, e);
        }
      }

      if (_activeModuleName === name) {
        _activeModuleName = null;
      }

      console.log('[ModuleLifecycle] 停用模块:', name);
      return true;
    },

    /**
     * 停用当前活跃模块
     */
    deactivateCurrent() {
      if (_activeModuleName) {
        this.deactivate(_activeModuleName);
      }
    },

    /**
     * 销毁所有模块（页面卸载时使用）
     */
    destroyAll() {
      for (const [name] of _modules) {
        this.deactivate(name);
      }
      _modules.clear();
      _activeModuleName = null;
      console.log('[ModuleLifecycle] 所有模块已销毁');
    },

    /**
     * 获取当前活跃模块名
     */
    getActiveModuleName() {
      return _activeModuleName;
    },

    /**
     * 获取当前活跃模块实例
     */
    getActiveModule() {
      if (!_activeModuleName) return null;
      const entry = _modules.get(_activeModuleName);
      return entry ? entry.instance : null;
    },

    /**
     * 获取已注册模块列表
     */
    getRegisteredModules() {
      return Array.from(_modules.keys());
    },

    /**
     * 订阅 EventBus 事件（与当前活跃模块绑定）
     * deactivate 时自动解绑
     *
     * @param {string} eventName - 事件名
     * @param {Function} fn - 处理函数
     */
    on(eventName, fn) {
      if (!_activeModuleName) {
        console.warn('[ModuleLifecycle] 无活跃模块，无法绑定 EventBus 事件:', eventName);
        return;
      }
      const entry = _modules.get(_activeModuleName);
      if (!entry) return;

      if (typeof EventBus !== 'undefined') {
        EventBus.on(eventName, fn);
      }
      entry.busListeners.push({ eventName, fn });
    },

    /**
     * 订阅 EventBus 一次性事件（与当前活跃模块绑定）
     *
     * @param {string} eventName - 事件名
     * @param {Function} fn - 处理函数
     */
    once(eventName, fn) {
      if (!_activeModuleName) {
        console.warn('[ModuleLifecycle] 无活跃模块，无法绑定 EventBus 事件:', eventName);
        return;
      }
      const entry = _modules.get(_activeModuleName);
      if (!entry) return;

      if (typeof EventBus !== 'undefined') {
        EventBus.once(eventName, fn);
      }
      // 注意：once 事件触发后 EventBus 会自动移除，
      // 但我们仍需在 busListeners 中记录以便手动 deactivate 时清理
      entry.busListeners.push({ eventName, fn });
    },

    /**
     * 手动解绑某模块的某个 EventBus 事件
     *
     * @param {string} moduleName - 模块名
     * @param {string} eventName - 事件名
     * @param {Function} fn - 处理函数
     */
    off(moduleName, eventName, fn) {
      const entry = _modules.get(moduleName);
      if (!entry) return;

      if (typeof EventBus !== 'undefined') {
        EventBus.off(eventName, fn);
      }

      const idx = entry.busListeners.findIndex(l => l.eventName === eventName && l.fn === fn);
      if (idx !== -1) entry.busListeners.splice(idx, 1);
    }
  };

  /**
   * 清理模块的 EventBus 订阅
   */
  function _cleanupBusListeners(entry) {
    if (!entry.busListeners.length) return;
    if (typeof EventBus === 'undefined') return;

    entry.busListeners.forEach(({ eventName, fn }) => {
      EventBus.off(eventName, fn);
    });
    entry.busListeners = [];
  }

  window.ModuleLifecycle = ModuleLifecycle;
})();
