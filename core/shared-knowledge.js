/**
 * shared-knowledge.js - AI 知识共享层
 * 人生工作台 · 小鹿AI与妮可AI的共享知识库
 * 功能：
 *   - 两个AI共享上下文知识（操作记录、分析结果、消费画像等）
 *   - LRU策略控制大小（最多100条）
 *   - 24小时过期自动清理
 *   - 持久化到 IndexedDB settings 表
 *   - 按AI类型生成上下文注入prompt
 */
import { Storage } from './storage.js';


export const SharedKnowledge = (() => {
  // ===== 常量 =====
  const MAX_ENTRIES = 100;           // LRU 最大条目数
  const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24小时过期
  const STORAGE_KEY = 'shared_knowledge'; // IndexedDB settings 表中的 key

  // ===== 状态 =====
  let _knowledge = {};      // { key: { value, source, updatedAt, accessCount } }
  let _loaded = false;      // 是否已从 IndexedDB 加载
  let _persistTimer = null; // 防抖持久化定时器

  // ===== 内部方法 =====

  /**
   * 清理过期的条目（24小时过期）
   * @returns {number} 清理的条目数
   */
  function _cleanExpired() {
    const now = Date.now();
    let cleaned = 0;
    for (const key of Object.keys(_knowledge)) {
      if (now - _knowledge[key].updatedAt > EXPIRY_MS) {
        delete _knowledge[key];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[SharedKnowledge] 清理了 ${cleaned} 条过期知识`);
    }
    return cleaned;
  }

  /**
   * LRU 驱逐：当条目超过 MAX_ENTRIES 时，移除最久未访问的条目
   */
  function _evictLRU() {
    const entries = Object.entries(_knowledge);
    if (entries.length <= MAX_ENTRIES) return;

    // 按 updatedAt 升序排序（最旧的在前）
    entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const toRemove = entries.length - MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      delete _knowledge[entries[i][0]];
    }
    if (toRemove > 0) {
      console.log(`[SharedKnowledge] LRU 驱逐了 ${toRemove} 条旧知识`);
    }
  }

  /**
   * 防抖持久化到 IndexedDB（300ms 内只执行一次）
   */
  function _schedulePersist() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(async () => {
      await _persist();
      _persistTimer = null;
    }, 300);
  }

  /**
   * 立即持久化到 IndexedDB
   */
  async function _persist() {
    try {
      await Storage.put('settings', { key: STORAGE_KEY, value: _knowledge });
    } catch (e) {
      console.warn('[SharedKnowledge] 持久化失败:', e);
    }
  }

  // ===== 公共 API =====

  /**
   * 初始化：从 IndexedDB 加载共享知识
   */
  async function init() {
    if (_loaded) return;
    try {
      const setting = await Storage.get('settings', STORAGE_KEY);
      if (setting && setting.value) {
        _knowledge = setting.value;
        // 加载后立即清理过期数据
        const cleaned = _cleanExpired();
        if (cleaned > 0) await _persist();
      }
      _loaded = true;
      console.log(`[SharedKnowledge] 已加载，共 ${Object.keys(_knowledge).length} 条知识`);
    } catch (e) {
      console.warn('[SharedKnowledge] 加载失败，使用空知识库:', e);
      _knowledge = {};
      _loaded = true;
    }
  }

  /**
   * 写入知识条目（通常由小鹿调用）
   * @param {string} key - 知识键名（如 'last_expense', 'today_tasks_count'）
   * @param {*} value - 知识值
   * @param {string} source - 来源标识（'xiaolu' | 'nicole'）
   */
  function set(key, value, source = 'xiaolu') {
    _knowledge[key] = {
      value,
      source,
      updatedAt: Date.now(),
      accessCount: (_knowledge[key]?.accessCount || 0) + 1
    };
    _cleanExpired();
    _evictLRU();
    _schedulePersist();
    console.log(`[SharedKnowledge] 写入: ${key} (来源: ${source})`);
  }

  /**
   * 写入分析结果（通常由妮可调用）
   * @param {string} key - 分析键名（如 'daily_insight', 'spending_trend'）
   * @param {*} analysis - 分析结果
   */
  function setAnalysis(key, analysis) {
    set(key, analysis, 'nicole');
  }

  /**
   * 读取知识条目
   * @param {string} key - 知识键名
   * @returns {*} 知识值，不存在则返回 undefined
   */
  function get(key) {
    const entry = _knowledge[key];
    if (!entry) return undefined;
    // 检查过期
    if (Date.now() - entry.updatedAt > EXPIRY_MS) {
      delete _knowledge[key];
      _schedulePersist();
      return undefined;
    }
    // 更新访问计数（LRU 依据）
    entry.accessCount = (entry.accessCount || 0) + 1;
    return entry.value;
  }

  /**
   * 生成供 AI prompt 注入的上下文文本
   * @param {string} aiType - 'xiaolu' 或 'nicole'
   * @returns {string} 格式化的上下文文本，无上下文时返回空串
   */
  function getContextForPrompt(aiType) {
    _cleanExpired();
    const entries = Object.entries(_knowledge);
    if (entries.length === 0) return '';

    // 按相关性排序：对方来源的条目优先（交叉引用更有价值）
    const otherSource = aiType === 'xiaolu' ? 'nicole' : 'xiaolu';
    const sorted = entries.sort((a, b) => {
      const aScore = a[1].source === otherSource ? 1 : 0;
      const bScore = b[1].source === otherSource ? 1 : 0;
      return bScore - aScore; // 对方来源排前面
    });

    const lines = sorted.map(([k, v]) => {
      const sourceLabel = v.source === 'xiaolu' ? '小鹿' : '妮可';
      const age = Math.round((Date.now() - v.updatedAt) / 60000); // 分钟
      const ageLabel = age < 60 ? `${age}分钟前` : `${Math.round(age / 60)}小时前`;
      const valueStr = typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value);
      // 截断过长的值
      const truncated = valueStr.length > 200 ? valueStr.slice(0, 200) + '...' : valueStr;
      return `- ${k}: ${truncated} (来自${sourceLabel}，${ageLabel})`;
    });

    return `\n## 共享上下文\n以下是小鹿和妮可的共享知识，请参考：\n${lines.join('\n')}`;
  }

  /**
   * 获取所有知识条目（调试用）
   * @returns {Object} 知识库快照
   */
  function getAll() {
    return { ..._knowledge };
  }

  /**
   * 获取知识条目数量
   * @returns {number}
   */
  function size() {
    return Object.keys(_knowledge).length;
  }

  /**
   * 删除指定知识条目
   * @param {string} key
   */
  function remove(key) {
    if (_knowledge[key]) {
      delete _knowledge[key];
      _schedulePersist();
    }
  }

  /**
   * 清空所有知识
   */
  function clear() {
    _knowledge = {};
    _schedulePersist();
    console.log('[SharedKnowledge] 已清空');
  }

  /**
   * 销毁模块
   */
  function destroy() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _knowledge = {};
    _loaded = false;
    console.log('[SharedKnowledge] 模块已销毁');
  }

  return {
    init,
    set,
    get,
    setAnalysis,
    getContextForPrompt,
    getAll,
    size,
    remove,
    clear,
    destroy
  };
})();
