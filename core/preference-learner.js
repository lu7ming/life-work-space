/**
 * preference-learner.js - 偏好学习引擎
 * 人生工作台 · PreferenceLearner
 * 
 * 从用户交互中自动学习偏好，渐进式调整，
 * 生成个性化 prompt 后缀供小鹿 AI 使用。
 * 
 * 偏好维度：
 * 1. 语言风格 - formalityLevel / emojiUsage / responseLength
 * 2. 操作偏好 - autoConfirm / defaultCategory / defaultPriority
 * 3. 时间偏好 - reminderTime / reportDay
 */
import { Storage } from './storage.js';
import { EventBus } from './event-bus.js';


export const PreferenceLearner = (() => {
  // ===== 常量 =====
  const PREF_KEY = 'user_preferences';      // IndexedDB settings 表中的 key
  const LEARNING_RATE = 0.15;               // 渐进式学习步长（0~1，越小越保守）
  const AUTO_CONFIRM_THRESHOLD = 5;         // 连续确认多少次后开启自动确认
  const CATEGORY_WEIGHT_THRESHOLD = 3;      // 某分类使用多少次后成为默认分类
  const MAX_HISTORY_LENGTH = 50;            // 交互历史最大长度（用于统计）

  // ===== 默认偏好值 =====
  const DEFAULT_PREFERENCES = {
    // 语言风格
    formalityLevel: 0.5,       // 0=随意 → 1=正式
    emojiUsage: 0.5,           // emoji 使用频率 0~1
    responseLength: 'medium',  // short / medium / long

    // 操作偏好
    autoConfirm: false,        // 是否自动确认 AI 操作
    defaultCategory: '',       // 未指定分类时的默认值
    defaultPriority: 'medium', // 默认优先级

    // 时间偏好
    reminderTime: '',          // 习惯打卡提醒时间（如 '08:00'）
    reportDay: '',             // 周报生成日（如 'sunday'）

    // 内部统计（不暴露给外部）
    _stats: {
      confirmCount: 0,        // 连续确认次数
      cancelCount: 0,         // 连续取消次数
      categoryUsage: {},      // 分类使用计数 { '餐饮': 5, '交通': 2, ... }
      emojiInUserMsg: 0,      // 用户消息中含 emoji 的次数
      totalUserMsg: 0,        // 用户消息总数
      shortResponseCount: 0,  // 用户要求简短的次数
      longResponseCount: 0,   // 用户要求详细的次数
      reminderSetCount: 0,    // 用户设置提醒时间的次数
    }
  };

  // ===== 状态 =====
  let _preferences = null;     // 当前偏好缓存
  let _initDone = false;       // 是否已初始化

  // ===== 初始化 =====

  /**
   * 初始化偏好学习引擎
   * 从 IndexedDB 加载已有偏好，如无则使用默认值
   */
  async function init() {
    try {
      const saved = await Storage.get('settings', PREF_KEY);
      if (saved && saved.value) {
        // 合并默认值（处理新增字段的向后兼容）
        _preferences = _mergeWithDefaults(saved.value);
        console.log('[PreferenceLearner] 已加载用户偏好');
      } else {
        _preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
        console.log('[PreferenceLearner] 使用默认偏好');
      }
      _initDone = true;
    } catch (err) {
      console.error('[PreferenceLearner] 初始化失败:', err);
      _preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
      _initDone = true;
    }
  }

  /**
   * 将加载的偏好与默认值合并（确保新增字段有默认值）
   * @param {Object} loaded - 已持久化的偏好
   * @returns {Object} 合并后的偏好
   */
  function _mergeWithDefaults(loaded) {
    const result = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
    // 合并顶层字段
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (key === '_stats') continue;
      if (loaded[key] !== undefined) {
        result[key] = loaded[key];
      }
    }
    // 合并 _stats
    if (loaded._stats) {
      for (const key of Object.keys(DEFAULT_PREFERENCES._stats)) {
        if (loaded._stats[key] !== undefined) {
          if (typeof loaded._stats[key] === 'object' && !Array.isArray(loaded._stats[key])) {
            result._stats[key] = { ...DEFAULT_PREFERENCES._stats[key], ...loaded._stats[key] };
          } else {
            result._stats[key] = loaded._stats[key];
          }
        }
      }
    }
    return result;
  }

  // ===== 学习机制 =====

  /**
   * 从用户交互中学习偏好
   * @param {string} userMessage - 用户消息
   * @param {string} aiReply - AI 回复（可选）
   * @param {Object} userAction - 用户行为（可选）
   *   - action: 'confirm' | 'cancel' | 'category' | 'priority' | 'reminder' | 'navigate'
   *   - value: 行为相关值
   */
  async function learnFromInteraction(userMessage, aiReply, userAction) {
    if (!_initDone) await init();

    let changed = false;

    // --- 从用户消息文本学习 ---
    if (userMessage && typeof userMessage === 'string') {
      changed = _learnFromMessageText(userMessage) || changed;
    }

    // --- 从用户行为学习 ---
    if (userAction) {
      changed = _learnFromAction(userAction) || changed;
    }

    // 持久化
    if (changed) {
      await _savePreferences();
    }
  }

  /**
   * 从消息文本中学习
   * @param {string} message - 用户消息
   * @returns {boolean} 是否有偏好变化
   */
  function _learnFromMessageText(message) {
    let changed = false;
    const stats = _preferences._stats;

    // 统计用户消息总数
    stats.totalUserMsg++;

    // --- emoji 使用偏好 ---
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    if (emojiRegex.test(message)) {
      stats.emojiInUserMsg++;
      // 渐进式调高 emojiUsage
      const ratio = stats.emojiInUserMsg / stats.totalUserMsg;
      _preferences.emojiUsage = _lerp(_preferences.emojiUsage, ratio, LEARNING_RATE);
      changed = true;
    }

    // --- 回复长度偏好 ---
    if (/简短|简练|少说|简洁|简要|一句话|一两句|精简/.test(message)) {
      stats.shortResponseCount++;
      // 渐进式调低 responseLength
      const lengthMap = { short: 0, medium: 1, long: 2 };
      const current = lengthMap[_preferences.responseLength] || 1;
      const target = Math.max(0, current - 1);
      const lengthValues = ['short', 'medium', 'long'];
      _preferences.responseLength = lengthValues[target];
      changed = true;
    }
    if (/详细|详尽|多说|展开|深入|具体|详细说|展开讲/.test(message)) {
      stats.longResponseCount++;
      const lengthMap = { short: 0, medium: 1, long: 2 };
      const current = lengthMap[_preferences.responseLength] || 1;
      const target = Math.min(2, current + 1);
      const lengthValues = ['short', 'medium', 'long'];
      _preferences.responseLength = lengthValues[target];
      changed = true;
    }

    // --- 正式程度偏好 ---
    if (/请|麻烦|劳驾|烦请|是否|能否|您好/.test(message)) {
      // 用户使用正式用语 → 渐进式调高 formalityLevel
      _preferences.formalityLevel = _lerp(_preferences.formalityLevel, 1, LEARNING_RATE * 0.5);
      changed = true;
    }
    if (/哈哈|嘿嘿|哦哦|嗯嗯|呀|吧|哒|嘿/.test(message)) {
      // 用户使用口语 → 渐进式调低 formalityLevel
      _preferences.formalityLevel = _lerp(_preferences.formalityLevel, 0, LEARNING_RATE * 0.5);
      changed = true;
    }

    return changed;
  }

  /**
   * 从用户行为中学习
   * @param {Object} action - { action: string, value: any }
   * @returns {boolean} 是否有偏好变化
   */
  function _learnFromAction(action) {
    let changed = false;
    const stats = _preferences._stats;

    switch (action.action) {
      case 'confirm':
        // 用户确认了 AI 操作
        stats.confirmCount++;
        stats.cancelCount = 0;
        // 连续确认超过阈值 → 开启自动确认
        if (stats.confirmCount >= AUTO_CONFIRM_THRESHOLD && !_preferences.autoConfirm) {
          _preferences.autoConfirm = true;
          changed = true;
          console.log('[PreferenceLearner] 连续确认达标，已开启自动确认');
        }
        break;

      case 'cancel':
        // 用户取消了 AI 操作
        stats.cancelCount++;
        stats.confirmCount = 0;
        // 一次取消就关闭自动确认（安全优先）
        if (_preferences.autoConfirm) {
          _preferences.autoConfirm = false;
          changed = true;
          console.log('[PreferenceLearner] 用户取消操作，已关闭自动确认');
        }
        break;

      case 'category':
        // 用户使用了某个分类
        if (action.value) {
          const cat = action.value;
          stats.categoryUsage[cat] = (stats.categoryUsage[cat] || 0) + 1;
          // 找出最常用的分类
          const topCategory = Object.entries(stats.categoryUsage)
            .sort((a, b) => b[1] - a[1])[0];
          if (topCategory && topCategory[1] >= CATEGORY_WEIGHT_THRESHOLD && topCategory[0] !== _preferences.defaultCategory) {
            _preferences.defaultCategory = topCategory[0];
            changed = true;
            console.log('[PreferenceLearner] 默认分类已更新为:', topCategory[0]);
          }
        }
        break;

      case 'priority':
        // 用户设置了优先级
        if (action.value && ['high', 'medium', 'low'].includes(action.value)) {
          // 渐进式：统计常用优先级
          stats.priorityUsage = stats.priorityUsage || {};
          stats.priorityUsage[action.value] = (stats.priorityUsage[action.value] || 0) + 1;
          const topPriority = Object.entries(stats.priorityUsage)
            .sort((a, b) => b[1] - a[1])[0];
          if (topPriority && topPriority[0] !== _preferences.defaultPriority) {
            _preferences.defaultPriority = topPriority[0];
            changed = true;
          }
        }
        break;

      case 'reminder':
        // 用户设置了提醒时间
        if (action.value) {
          _preferences.reminderTime = action.value;
          stats.reminderSetCount++;
          changed = true;
          console.log('[PreferenceLearner] 提醒时间已更新为:', action.value);
        }
        break;

      case 'reportDay':
        // 用户设置了周报日
        if (action.value) {
          _preferences.reportDay = action.value;
          changed = true;
        }
        break;
    }

    return changed;
  }

  // ===== 个性化 Prompt 生成 =====

  /**
   * 根据偏好生成 AI prompt 后缀片段
   * 用于追加到小鹿 AI 的 system prompt 末尾
   * @returns {string} prompt 后缀
   */
  function getPersonalizedPromptSuffix() {
    if (!_preferences) return '';

    const suffixes = [];

    // --- 回复长度 ---
    switch (_preferences.responseLength) {
      case 'short':
        suffixes.push('回复尽量简短，1-2句话。');
        break;
      case 'medium':
        suffixes.push('回复简洁，不超过3句话，除非用户要求详细回答。');
        break;
      case 'long':
        suffixes.push('回复可以详细一些，充分展开说明。');
        break;
    }

    // --- emoji 使用 ---
    if (_preferences.emojiUsage > 0.6) {
      suffixes.push('适当使用emoji，让回复更生动。');
    } else if (_preferences.emojiUsage < 0.3) {
      suffixes.push('减少emoji使用，回复以纯文字为主。');
    }

    // --- 正式程度 ---
    if (_preferences.formalityLevel < 0.4) {
      suffixes.push('语气轻松随意，像朋友聊天。');
    } else if (_preferences.formalityLevel > 0.7) {
      suffixes.push('语气正式专业，表达清晰准确。');
    }

    // --- 默认分类提示 ---
    if (_preferences.defaultCategory) {
      suffixes.push(`用户未指定分类时，默认使用「${_preferences.defaultCategory}」。`);
    }

    // --- 默认优先级提示 ---
    if (_preferences.defaultPriority && _preferences.defaultPriority !== 'medium') {
      suffixes.push(`新建任务默认优先级为${_preferences.defaultPriority === 'high' ? '高' : '低'}。`);
    }

    return suffixes.length > 0 ? '\n\n个性化偏好：' + suffixes.join('') : '';
  }

  // ===== 偏好访问 =====

  /**
   * 获取当前偏好（只读副本）
   * @returns {Object} 偏好对象
   */
  function getPreferences() {
    if (!_preferences) return JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
    // 返回不含 _stats 的副本
    const result = {};
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (key === '_stats') continue;
      result[key] = _preferences[key];
    }
    return result;
  }

  /**
   * 获取某个偏好值
   * @param {string} key - 偏好键名
   * @returns {*} 偏好值
   */
  function get(key) {
    if (!_preferences) return DEFAULT_PREFERENCES[key];
    return _preferences[key];
  }

  /**
   * 手动设置偏好值（供设置页面使用）
   * @param {string} key - 偏好键名
   * @param {*} value - 偏好值
   */
  async function set(key, value) {
    if (!_initDone) await init();
    if (key === '_stats') return; // 不允许直接修改统计

    if (DEFAULT_PREFERENCES.hasOwnProperty(key)) {
      _preferences[key] = value;
      await _savePreferences();
      console.log(`[PreferenceLearner] 偏好 ${key} 已手动更新为:`, value);
    }
  }

  // ===== 工具方法 =====

  /**
   * 线性插值（渐进式调整）
   * @param {number} current - 当前值
   * @param {number} target - 目标值
   * @param {number} rate - 学习率（0~1）
   * @returns {number} 调整后的值
   */
  function _lerp(current, target, rate) {
    return current + (target - current) * rate;
  }

  /**
   * 持久化偏好到 IndexedDB
   */
  async function _savePreferences() {
    try {
      await Storage.put('settings', { key: PREF_KEY, value: _preferences });
    } catch (err) {
      console.error('[PreferenceLearner] 保存偏好失败:', err);
    }
  }

  /**
   * 重置所有偏好为默认值
   */
  async function reset() {
    _preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
    await _savePreferences();
    console.log('[PreferenceLearner] 偏好已重置为默认值');
  }

  return {
    init,
    learnFromInteraction,
    getPersonalizedPromptSuffix,
    getPreferences,
    get,
    set,
    reset
  };
})();
