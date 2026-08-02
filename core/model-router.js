/**
 * model-router.js - 多模型路由
 * 人生工作台 · 智能模型选择与成本统计
 * 根据任务类型自动选择最优模型（快速/推理/视觉），记录调用成本
 */
import { Storage } from './storage.js';
import { SecureStorage } from './secure-storage.js';
import { EventBus } from './event-bus.js';


export const ModelRouter = (() => {
  // ===== 模型配置 =====
  const MODELS = {
    fast: {
      id: 'deepseek-chat',
      name: '快速模型',
      description: '意图分类、参数提取、简单对话',
      inputPrice: 0.001,   // 每千 token 预估成本（元）
      outputPrice: 0.002
    },
    reasoning: {
      id: 'deepseek-reasoner',
      name: '推理模型',
      description: '周度分析、目标规划、复杂推理',
      inputPrice: 0.004,
      outputPrice: 0.008
    },
    vision: {
      id: 'vision-reserved',
      name: '视觉模型（预留）',
      description: '图像识别（当前不用，留接口）',
      inputPrice: 0,
      outputPrice: 0
    }
  };

  // ===== 任务 → 模型映射 =====
  const TASK_MODEL_MAP = {
    intent_classify: 'fast',
    param_extract: 'fast',
    chat: 'fast',
    weekly_analysis: 'reasoning',
    goal_planning: 'reasoning',
    complex_reasoning: 'reasoning',
    receipt_ocr: 'vision'
  };

  // ===== 成本记录 =====
  let _costLog = [];  // [{task, model, inputTokens, outputTokens, cost, duration, timestamp}]

  // ===== 状态 =====
  let _enabled = true; // 总开关，不可用时降级到快速模型

  /**
   * 根据任务类型选择最优模型
   * @param {string} task - 任务类型标识（如 'intent_classify'、'weekly_analysis'）
   * @returns {{modelId: string, modelName: string, modelKey: string}} 选中的模型信息
   */
  function select(task) {
    // 不可用时降级到快速模型
    if (!_enabled) {
      return {
        modelId: MODELS.fast.id,
        modelName: MODELS.fast.name,
        modelKey: 'fast'
      };
    }

    const modelKey = TASK_MODEL_MAP[task] || 'fast'; // 默认走快速模型
    const model = MODELS[modelKey];

    return {
      modelId: model.id,
      modelName: model.name,
      modelKey: modelKey
    };
  }

  /**
   * 调用模型并记录成本（统一入口）
   * @param {string} task - 任务类型
   * @param {string} token - API Key
   * @param {Array} messages - 消息列表
   * @param {Object} options - 调用选项 { temperature, max_tokens, timeout }
   * @returns {Promise<{content: string, model: Object, cost: number, duration: number}>}
   */
  async function callModel(task, token, messages, options = {}) {
    const { temperature = 0.7, max_tokens = 500, timeout = 15000 } = options;
    const selected = select(task);
    const startTime = Date.now();

    // 视觉模型预留：暂不可用，降级到快速模型
    if (selected.modelKey === 'vision') {
      console.warn('[ModelRouter] 视觉模型暂不可用，降级到快速模型');
      selected.modelId = MODELS.fast.id;
      selected.modelKey = 'fast';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const API_URL = 'https://api.deepseek.com/v1/chat/completions';
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selected.modelId,
          messages: messages,
          temperature: temperature,
          max_tokens: max_tokens,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (resp.status === 401) throw new Error('AUTH_ERROR');
      if (resp.status === 429) throw new Error('API 额度已用完或请求太频繁，请稍后再试');
      if (!resp.ok) throw new Error(`请求失败 (${resp.status})`);

      const data = await resp.json();
      const duration = Date.now() - startTime;

      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        const reply = data.choices[0].message.content;
        if (reply) {
          // 记录成本
          const inputTokens = data.usage?.prompt_tokens || 0;
          const outputTokens = data.usage?.completion_tokens || 0;
          const cost = _estimateCost(selected.modelKey, inputTokens, outputTokens);

          _logCost({
            task,
            model: selected.modelId,
            modelKey: selected.modelKey,
            inputTokens,
            outputTokens,
            cost,
            duration,
            timestamp: Date.now()
          });

          return {
            content: reply.trim(),
            model: selected,
            cost,
            duration
          };
        }
      }

      throw new Error('未获取到有效回复');
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('请求超时，请稍后再试');
      }
      throw err;
    }
  }

  /**
   * 预估单次调用成本
   * @param {string} modelKey - 模型标识
   * @param {number} inputTokens - 输入 token 数
   * @param {number} outputTokens - 输出 token 数
   * @returns {number} 预估成本（元）
   */
  function _estimateCost(modelKey, inputTokens, outputTokens) {
    const model = MODELS[modelKey] || MODELS.fast;
    const inputCost = (inputTokens / 1000) * model.inputPrice;
    const outputCost = (outputTokens / 1000) * model.outputPrice;
    return Math.round((inputCost + outputCost) * 10000) / 10000; // 保留4位小数
  }

  /**
   * 记录一次调用成本
   * @param {Object} entry - 成本记录条目
   */
  function _logCost(entry) {
    _costLog.push(entry);

    // 内存中只保留最近 500 条
    if (_costLog.length > 500) {
      _costLog = _costLog.slice(-500);
    }

    // 持久化到 localStorage（每周一清零）
    try {
      const weekKey = _getWeekKey();
      const stored = JSON.parse(localStorage.getItem('model_router_cost') || '{}');
      if (stored.week !== weekKey) {
        // 新的一周，重置
        stored.week = weekKey;
        stored.log = [];
      }
      stored.log.push(entry);
      // 限制存储条数
      if (stored.log.length > 500) {
        stored.log = stored.log.slice(-500);
      }
      localStorage.setItem('model_router_cost', JSON.stringify(stored));
    } catch (e) {
      console.warn('[ModelRouter] 成本持久化失败:', e);
    }

    console.log(`[ModelRouter] ${entry.task} → ${entry.model} | ${entry.inputTokens}+${entry.outputTokens} tokens | ¥${entry.cost} | ${entry.duration}ms`);
  }

  /**
   * 获取本周的成本统计
   * @returns {{week: string, totalCost: number, totalCalls: number, byModel: Object, byTask: Object}}
   */
  function getCostSummary() {
    const weekKey = _getWeekKey();
    let log = _costLog;

    // 从 localStorage 加载完整数据
    try {
      const stored = JSON.parse(localStorage.getItem('model_router_cost') || '{}');
      if (stored.week === weekKey && Array.isArray(stored.log)) {
        log = stored.log;
      }
    } catch (e) { /* 忽略 */ }

    const totalCost = log.reduce((s, e) => s + (e.cost || 0), 0);
    const totalCalls = log.length;

    // 按模型分组
    const byModel = {};
    log.forEach(e => {
      if (!byModel[e.model]) {
        byModel[e.model] = { calls: 0, cost: 0, tokens: 0 };
      }
      byModel[e.model].calls++;
      byModel[e.model].cost += e.cost || 0;
      byModel[e.model].tokens += (e.inputTokens || 0) + (e.outputTokens || 0);
    });

    // 按任务分组
    const byTask = {};
    log.forEach(e => {
      if (!byTask[e.task]) {
        byTask[e.task] = { calls: 0, cost: 0 };
      }
      byTask[e.task].calls++;
      byTask[e.task].cost += e.cost || 0;
    });

    return {
      week: weekKey,
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalCalls,
      byModel,
      byTask
    };
  }

  /**
   * 获取当前周的标识（YYYY-Www 格式）
   * @returns {string}
   */
  function _getWeekKey() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = (now - start + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000)) / 86400000;
    const weekNum = Math.ceil((diff + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /**
   * 设置启用/禁用（降级开关）
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    _enabled = enabled;
    console.log('[ModelRouter] 模型路由', enabled ? '已启用' : '已禁用（降级到快速模型）');
  }

  /**
   * 检查是否启用
   * @returns {boolean}
   */
  function isEnabled() {
    return _enabled;
  }

  /**
   * 获取所有模型配置
   * @returns {Object}
   */
  function getModels() {
    return { ...MODELS };
  }

  /**
   * 获取任务-模型映射表
   * @returns {Object}
   */
  function getTaskModelMap() {
    return { ...TASK_MODEL_MAP };
  }

  /**
   * 清除本周成本记录
   */
  function clearCostLog() {
    _costLog = [];
    try {
      localStorage.removeItem('model_router_cost');
    } catch (e) { /* 忽略 */ }
    console.log('[ModelRouter] 成本记录已清除');
  }

  /**
   * 初始化：从 localStorage 恢复成本记录
   */
  function init() {
    try {
      const stored = JSON.parse(localStorage.getItem('model_router_cost') || '{}');
      const weekKey = _getWeekKey();
      if (stored.week === weekKey && Array.isArray(stored.log)) {
        _costLog = stored.log;
        console.log(`[ModelRouter] 已恢复本周成本记录，共 ${_costLog.length} 条`);
      }
    } catch (e) {
      console.warn('[ModelRouter] 恢复成本记录失败:', e);
    }
    console.log('[ModelRouter] 多模型路由就绪 🔀');
  }

  return {
    init,
    select,
    callModel,
    getCostSummary,
    setEnabled,
    isEnabled,
    getModels,
    getTaskModelMap,
    clearCostLog
  };
})();
