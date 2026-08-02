/**
 * orchestrator.js - AI 智能路由与协作编排
 * 人生工作台 · 小鹿AI和妮可AI的智能路由中间件
 * 功能：
 *   - 关键词规则路由（快速、零成本）
 *   - 置信度评分（0~1）
 *   - 模糊场景：小鹿先接，需要分析时调用妮可
 *   - 手动覆盖：用户可强制指定AI
 *   - 路由结果影响UI：自动打开对应AI面板 + 顶部指示器
 *   - 路由决策日志
 *   - 操作通知：小鹿执行后通知妮可更新洞察
 */

const AIOrchestrator = (() => {
  // ===== 路由规则定义 =====

  /**
   * 妮可擅长的关键词（分析/审计/报告类）
   * 每条规则：{ pattern: RegExp, weight: number, label: string }
   */
  const NICOLE_RULES = [
    // 强匹配（weight=1.0）：几乎一定是妮可
    { pattern: /数据健康检查|健康检查/, weight: 1.0, label: '数据健康检查' },
    { pattern: /效率分析|使用效率/, weight: 1.0, label: '效率分析' },
    { pattern: /目标.*审计|审计.*目标/, weight: 1.0, label: '目标审计' },
    { pattern: /周报|月报|年度报告/, weight: 1.0, label: '周期报告' },

    // 高匹配（weight=0.8）：大概率是妮可
    { pattern: /分析/, weight: 0.8, label: '分析' },
    { pattern: /检查/, weight: 0.8, label: '检查' },
    { pattern: /审计/, weight: 0.8, label: '审计' },
    { pattern: /报告/, weight: 0.8, label: '报告' },
    { pattern: /洞察/, weight: 0.8, label: '洞察' },
    { pattern: /总结|复盘/, weight: 0.8, label: '总结复盘' },
    { pattern: /趋势|走向/, weight: 0.8, label: '趋势分析' },

    // 中匹配（weight=0.5）：可能是妮可
    { pattern: /效率/, weight: 0.5, label: '效率' },
    { pattern: /健康(?![检查])/, weight: 0.5, label: '健康' },
    { pattern: /优化|改进/, weight: 0.5, label: '优化建议' },
    { pattern: /对比|比较/, weight: 0.5, label: '对比分析' },
    { pattern: /统计/, weight: 0.5, label: '统计' },
    { pattern: /画像|模式/, weight: 0.5, label: '画像分析' },
  ];

  /**
   * 小鹿擅长的关键词（操作/执行/聊天类）
   */
  const XIAOLU_RULES = [
    // 强匹配（weight=1.0）
    { pattern: /花了|消费了|付了|买了/, weight: 1.0, label: '财务记录' },
    { pattern: /记录.*收入|收到|到账/, weight: 1.0, label: '收入记录' },
    { pattern: /创建.*任务|新建.*任务|加个任务/, weight: 1.0, label: '创建任务' },
    { pattern: /打卡|签到/, weight: 1.0, label: '习惯打卡' },

    // 高匹配（weight=0.8）
    { pattern: /记录/, weight: 0.8, label: '记录' },
    { pattern: /创建|新建|添加/, weight: 0.8, label: '创建' },
    { pattern: /任务/, weight: 0.8, label: '任务' },
    { pattern: /提醒|别忘了/, weight: 0.8, label: '提醒' },

    // 中匹配（weight=0.5）
    { pattern: /聊天|聊聊|说说/, weight: 0.5, label: '聊天' },
    { pattern: /帮忙|帮我把|帮我/, weight: 0.5, label: '帮忙' },
    { pattern: /怎么|如何|什么/, weight: 0.5, label: '提问' },
  ];

  // ===== 状态 =====
  let _lastRoute = null;         // 上次路由结果
  let _manualOverride = null;    // 手动覆盖 ('xiaolu' | 'nicole' | null)
  let _routeHistory = [];        // 路由历史（最近20条）
  const MAX_ROUTE_HISTORY = 20;
  let _indicatorEl = null;       // UI 指示器 DOM 元素

  // ===== 模块生命周期管理 =====
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 核心路由逻辑 =====

  /**
   * 智能路由：分析用户消息，决定由小鹿还是妮可处理
   * @param {string} userMessage - 用户输入的消息
   * @returns {{ target: 'xiaolu'|'nicole', confidence: number, reason: string, matchedRules: string[] }}
   */
  function route(userMessage) {
    // 手动覆盖优先
    if (_manualOverride) {
      const result = {
        target: _manualOverride,
        confidence: 1.0,
        reason: '手动指定',
        matchedRules: ['手动覆盖']
      };
      _logRoute(userMessage, result);
      return result;
    }

    const text = userMessage.trim();
    if (!text) {
      return { target: 'xiaolu', confidence: 0.5, reason: '空消息默认小鹿', matchedRules: [] };
    }

    // 计算妮可和小鹿的得分
    let nicoleScore = 0;
    let xiaoluScore = 0;
    const nicoleMatched = [];
    const xiaoluMatched = [];

    for (const rule of NICOLE_RULES) {
      if (rule.pattern.test(text)) {
        nicoleScore += rule.weight;
        nicoleMatched.push(rule.label);
      }
    }

    for (const rule of XIAOLU_RULES) {
      if (rule.pattern.test(text)) {
        xiaoluScore += rule.weight;
        xiaoluMatched.push(rule.label);
      }
    }

    // 决策逻辑
    let target, confidence, reason, matchedRules;

    if (nicoleScore > xiaoluScore && nicoleScore > 0) {
      // 妮可得分更高
      target = 'nicole';
      confidence = Math.min(0.95, nicoleScore / (nicoleScore + xiaoluScore + 0.01));
      reason = `妮可擅长：${nicoleMatched.join('、')}`;
      matchedRules = nicoleMatched;
    } else if (xiaoluScore > nicoleScore && xiaoluScore > 0) {
      // 小鹿得分更高
      target = 'xiaolu';
      confidence = Math.min(0.95, xiaoluScore / (xiaoluScore + nicoleScore + 0.01));
      reason = `小鹿擅长：${xiaoluMatched.join('、')}`;
      matchedRules = xiaoluMatched;
    } else if (nicoleScore === xiaoluScore && nicoleScore > 0) {
      // 得分相同但有匹配 → 模糊场景：小鹿先接
      target = 'xiaolu';
      confidence = 0.5;
      reason = '模糊场景，小鹿先接，需要分析时可调用妮可';
      matchedRules = [...nicoleMatched, ...xiaoluMatched];
    } else {
      // 都没有匹配 → 默认小鹿（聊天场景）
      target = 'xiaolu';
      confidence = 0.3;
      reason = '未匹配规则，默认小鹿处理';
      matchedRules = [];
    }

    const result = { target, confidence, reason, matchedRules };
    _logRoute(userMessage, result);
    return result;
  }

  /**
   * 记录路由决策日志
   */
  function _logRoute(message, result) {
    const entry = {
      timestamp: Date.now(),
      message: message.slice(0, 50), // 截断
      target: result.target,
      confidence: result.confidence,
      reason: result.reason
    };
    _routeHistory.push(entry);
    if (_routeHistory.length > MAX_ROUTE_HISTORY) {
      _routeHistory.shift();
    }
    _lastRoute = result;

    console.log(
      `[Orchestrator] 路由决策: → ${result.target === 'xiaolu' ? '🦌小鹿' : '🔵妮可'} ` +
      `(置信度: ${(result.confidence * 100).toFixed(0)}%, 原因: ${result.reason})`
    );
  }

  // ===== 路由执行 =====

  /**
   * 处理用户消息：路由 + 打开对应AI面板
   * @param {string} userMessage - 用户消息
   * @returns {{ ai: string, action: Function }} 路由结果和打开面板的函数
   */
  async function handle(userMessage) {
    const routeResult = route(userMessage);

    // 更新 UI 指示器
    updateIndicator(routeResult.target, routeResult.confidence);

    if (routeResult.target === 'nicole') {
      if (typeof NicoleModule !== 'undefined' && NicoleModule.open) {
        return { ai: 'nicole', action: () => NicoleModule.open(), routeResult };
      }
      // 妮不可用，降级到小鹿
      console.warn('[Orchestrator] 妮可模块不可用，降级到小鹿');
      updateIndicator('xiaolu', 0.5);
      if (typeof XiaoluModule !== 'undefined' && XiaoluModule.open) {
        return { ai: 'xiaolu', action: () => XiaoluModule.open(), routeResult };
      }
    }

    if (typeof XiaoluModule !== 'undefined' && XiaoluModule.open) {
      return { ai: 'xiaolu', action: () => XiaoluModule.open(), routeResult };
    }

    return null;
  }

  // ===== 操作通知 =====

  /**
   * 小鹿执行操作后通知妮可（更新洞察缓存 + 写入共享知识）
   * @param {string} tool - 工具名（record_finance / create_task / habit_log）
   * @param {{ success: boolean, message?: string, undoInfo?: object }} result - 执行结果
   */
  async function notifyAction(tool, result) {
    if (!result || !result.success) return;

    // 1. 清除妮可洞察缓存，下次打开时重新计算
    const today = AppUtils.getTodayStr();
    try {
      localStorage.removeItem(`nicole_daily_insight_${today}`);
    } catch (e) { /* 静默 */ }

    // 2. 写入共享知识
    if (typeof SharedKnowledge !== 'undefined' && SharedKnowledge.set) {
      switch (tool) {
        case 'record_finance':
          // 记录财务后更新消费画像
          SharedKnowledge.set('last_finance_action', {
            tool: 'record_finance',
            timestamp: Date.now(),
            today: today
          }, 'xiaolu');
          break;

        case 'create_task':
          // 创建任务后更新任务概览
          SharedKnowledge.set('last_task_action', {
            tool: 'create_task',
            timestamp: Date.now(),
            today: today
          }, 'xiaolu');
          break;

        case 'habit_log':
          // 习惯打卡后更新打卡状态
          SharedKnowledge.set('last_habit_action', {
            tool: 'habit_log',
            timestamp: Date.now(),
            today: today
          }, 'xiaolu');
          break;
      }
    }

    console.log(`[Orchestrator] 通知: 小鹿执行了 ${tool}，已更新共享知识`);
  }

  /**
   * 妮可分析完成后写入共享知识
   * @param {string} analysisType - 分析类型
   * @param {*} analysisResult - 分析结果
   */
  function notifyAnalysis(analysisType, analysisResult) {
    if (typeof SharedKnowledge !== 'undefined' && SharedKnowledge.setAnalysis) {
      SharedKnowledge.setAnalysis(`nicole_${analysisType}`, analysisResult);
      console.log(`[Orchestrator] 通知: 妮可完成了 ${analysisType} 分析，已写入共享知识`);
    }
  }

  // ===== 手动覆盖 =====

  /**
   * 设置手动覆盖（用户强制指定AI）
   * @param {'xiaolu'|'nicole'|null} ai - 指定AI，null 表示取消覆盖
   */
  function setManualOverride(ai) {
    _manualOverride = ai;
    if (ai) {
      console.log(`[Orchestrator] 手动覆盖: → ${ai === 'xiaolu' ? '🦌小鹿' : '🔵妮可'}`);
      updateIndicator(ai, 1.0);
    } else {
      console.log('[Orchestrator] 已取消手动覆盖');
      hideIndicator();
    }
  }

  /**
   * 获取当前手动覆盖设置
   * @returns {'xiaolu'|'nicole'|null}
   */
  function getManualOverride() {
    return _manualOverride;
  }

  // ===== UI 指示器 =====

  /**
   * 创建或更新 AI 处理指示器
   * @param {'xiaolu'|'nicole'} target - 目标AI
   * @param {number} confidence - 置信度
   */
  function updateIndicator(target, confidence) {
    if (!_indicatorEl) {
      _createIndicator();
    }
    if (!_indicatorEl) return;

    const isXiaolu = target === 'xiaolu';
    const icon = isXiaolu ? '🦌' : '🔵';
    const name = isXiaolu ? '小鹿处理' : '妮可处理';
    const color = isXiaolu ? '#D4A574' : '#5B8DB8';
    const confidencePct = Math.round(confidence * 100);

    _indicatorEl.innerHTML = `
      <span class="orch-indicator-icon">${icon}</span>
      <span class="orch-indicator-text">${name}</span>
      <span class="orch-indicator-confidence">${confidencePct}%</span>
    `;
    _indicatorEl.style.setProperty('--orch-color', color);
    _indicatorEl.classList.add('show');
    _indicatorEl.classList.remove('hide');

    // 3秒后自动隐藏（除非手动覆盖模式）
    if (!_manualOverride) {
      clearTimeout(_indicatorEl._hideTimer);
      _indicatorEl._hideTimer = setTimeout(() => {
        hideIndicator();
      }, 3000);
    }
  }

  /**
   * 隐藏指示器（带平滑过渡）
   */
  function hideIndicator() {
    if (_indicatorEl) {
      _indicatorEl.classList.add('hide');
      _indicatorEl.classList.remove('show');
    }
  }

  /**
   * 创建指示器 DOM
   */
  function _createIndicator() {
    _indicatorEl = document.createElement('div');
    _indicatorEl.className = 'orch-indicator';
    _indicatorEl.innerHTML = '<span class="orch-indicator-icon">🦌</span><span class="orch-indicator-text">小鹿处理</span>';
    document.body.appendChild(_indicatorEl);
  }

  // ===== 路由历史 =====

  /**
   * 获取路由历史
   * @param {number} limit - 最多返回条数
   * @returns {Array} 路由历史
   */
  function getRouteHistory(limit = 10) {
    return _routeHistory.slice(-limit);
  }

  /**
   * 获取上次路由结果
   * @returns {Object|null}
   */
  function getLastRoute() {
    return _lastRoute;
  }

  // ===== 初始化与销毁 =====

  /**
   * 初始化路由器
   */
  function init() {
    // 注入指示器样式
    _injectStyles();
    console.log('[Orchestrator] AI智能路由就绪 🧭');
  }

  /**
   * 注入指示器CSS
   */
  function _injectStyles() {
    if (document.getElementById('orch-indicator-styles')) return;
    const style = document.createElement('style');
    style.id = 'orch-indicator-styles';
    style.textContent = `
      .orch-indicator {
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%) translateY(-40px);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 20px;
        background: rgba(255,255,255,0.92);
        border: 1.5px solid var(--orch-color, #D4A574);
        box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        font-size: 13px;
        color: #3D3028;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease;
        opacity: 0;
        pointer-events: none;
        user-select: none;
      }
      .orch-indicator.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      .orch-indicator.hide {
        transform: translateX(-50%) translateY(-40px);
        opacity: 0;
      }
      .orch-indicator-icon {
        font-size: 15px;
      }
      .orch-indicator-text {
        font-weight: 600;
      }
      .orch-indicator-confidence {
        font-size: 11px;
        color: var(--text-muted, #8a7a6d);
        font-weight: 400;
      }
      /* 暗色模式 */
      [data-theme="dark"] .orch-indicator {
        background: rgba(30,30,46,0.92);
        color: #E0D6CC;
        border-color: var(--orch-color, #D4A574);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 销毁模块
   */
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    if (_indicatorEl) {
      _indicatorEl.remove();
      _indicatorEl = null;
    }
    const styleEl = document.getElementById('orch-indicator-styles');
    if (styleEl) styleEl.remove();
    _routeHistory = [];
    _lastRoute = null;
    _manualOverride = null;
    console.log('[Orchestrator] 模块已销毁');
  }

  return {
    init,
    route,
    handle,
    notifyAction,
    notifyAnalysis,
    setManualOverride,
    getManualOverride,
    updateIndicator,
    hideIndicator,
    getRouteHistory,
    getLastRoute,
    destroy
  };
})();
