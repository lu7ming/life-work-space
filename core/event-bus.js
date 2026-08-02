/**
 * event-bus.js - 统一事件总线系统
 * 人生工作台 · 模块间事件通信中枢
 *
 * 事件命名规范：模块名:动作:结果（小写+冒号分隔）
 *
 * 已定义事件列表：
 * - habit:completed    习惯打卡完成
 * - habit:created      习惯创建
 * - habit:deleted      习惯删除
 * - task:created       任务创建
 * - task:completed     任务完成
 * - task:updated       任务更新
 * - finance:added      财务记录新增
 * - finance:deleted    财务记录删除
 * - journal:created    日记创建
 * - journal:updated    日记更新
 * - study:session      学习会话记录
 * - goal:updated       目标更新
 * - health:logged      健康数据记录
 * - relation:updated   人际关系更新
 * - user:mood          用户情绪变化
 * - data:exported      数据导出
 * - data:imported      数据导入
 * - knowledge:extracted 知识自动沉淀
 * - content:published   内容发布
 * - achievement:unlocked 成就解锁
 * - app:ready          应用初始化完成
 * - app:online         网络恢复
 * - app:offline        网络断开
 */

const MAX_LISTENERS = 50;
const _events = new Map(); // eventName → [{ fn, once, priority }]

function _getListeners(name) {
  if (!_events.has(name)) _events.set(name, []);
  return _events.get(name);
}

function _addListener(name, fn, options) {
  const list = _getListeners(name);
  if (list.length >= MAX_LISTENERS) {
    console.warn('[EventBus] "' + name + '" 监听器已达上限 ' + MAX_LISTENERS);
  }
  const once = !!(options && options.once);
  const priority = (options && options.priority) || 0;
  list.push({ fn, once, priority });
  list.sort((a, b) => b.priority - a.priority); // priority 越大越先执行
}

export const EventBus = {
  /** 调试开关：开启后打印所有 emit 日志 */
  debug: false,

  on(name, fn, options) {
    if (typeof fn !== 'function') return;
    _addListener(name, fn, options);
  },

  off(name, fn) {
    const list = _events.get(name);
    if (!list) return;
    const idx = list.findIndex(l => l.fn === fn);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) _events.delete(name);
  },

  emit(name, data) {
    const list = _events.get(name);
    if (!list || list.length === 0) return;
    if (this.debug) console.log('[EventBus] emit:', name, data);
    // 快照遍历，支持在回调中 off
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const l = snapshot[i];
      if (l.once) this.off(name, l.fn);
      try {
        l.fn(data);
      } catch (err) {
        console.error('[EventBus] listener error on "' + name + '":', err);
      }
    }
  },

  emitAsync(name, data) {
    setTimeout(() => this.emit(name, data), 0);
  },

  once(name, fn) {
    this.on(name, fn, { once: true });
  },

  listeners(name) {
    return (_events.get(name) || []).map(l => ({ fn: l.fn, once: l.once, priority: l.priority }));
  },

  eventNames() {
    return Array.from(_events.keys());
  },

  clear(name) {
    if (name) { _events.delete(name); } else { _events.clear(); }
  }
};
