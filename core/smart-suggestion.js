/**
 * smart-suggestion.js - 智能建议系统
 * 人生工作台 · 基于数据分析的可操作建议
 * 分析用户数据，生成优先级排序的建议卡片，支持操作路由
 */

const SmartSuggestion = (() => {
  // ===== 常量 =====
  const MAX_SUGGESTIONS = 3;       // 最多显示 3 条建议
  const CACHE_TTL = 60 * 60 * 1000; // 缓存 1 小时
  const CACHE_KEY = 'smart_suggestion_cache';

  // ===== 建议模板 =====
  const SUGGESTION_TEMPLATES = {
    expense_high: {
      id: 'expense_high',
      icon: '💰',
      title: '本月支出偏高',
      priority: 2,
      condition: (data) => {
        if (!data.finance) return false;
        const monthBalance = data.finance.monthIncome - data.finance.monthExpense;
        return monthBalance < 0 || (data.finance.monthExpense > 0 && data.finance.monthIncome > 0 && data.finance.monthExpense / data.finance.monthIncome > 0.8);
      },
      getMessage: (data) => {
        if (data.finance.monthIncome - data.finance.monthExpense < 0) {
          return `本月累计超支 ¥${Math.abs(data.finance.monthIncome - data.finance.monthExpense).toFixed(0)}，建议关注支出`;
        }
        return `本月支出占收入 ${(data.finance.monthExpense / data.finance.monthIncome * 100).toFixed(0)}%，注意控制`;
      },
      actions: [
        { label: '查看支出详情', type: 'navigate', route: 'finance' },
        { label: '调整预算', type: 'navigate', route: 'finance' }
      ]
    },
    task_overdue: {
      id: 'task_overdue',
      icon: '📋',
      title: '有逾期任务',
      priority: 1,
      condition: (data) => data.tasks && data.tasks.overdue > 0,
      getMessage: (data) => `有 ${data.tasks.overdue} 个任务已逾期，需要处理`,
      actions: [
        { label: '重新排期', type: 'execute', module: 'TasksModule', method: 'init' },
        { label: '降低优先级', type: 'execute', module: 'TasksModule', method: 'init' },
        { label: '直接完成', type: 'navigate', route: 'tasks' }
      ]
    },
    habit_broken: {
      id: 'habit_broken',
      icon: '✅',
      title: '连续打卡可能中断',
      priority: 2,
      condition: (data) => data.habits && data.habits.brokenStreaks && data.habits.brokenStreaks.length > 0,
      getMessage: (data) => `习惯「${data.habits.brokenStreaks[0]}」连续打卡可能中断`,
      actions: [
        { label: '一键完成', type: 'navigate', route: 'habits' },
        { label: '调整习惯目标', type: 'navigate', route: 'habits' }
      ]
    },
    no_exercise: {
      id: 'no_exercise',
      icon: '💪',
      title: '本周没有运动',
      priority: 3,
      condition: (data) => {
        if (!data.health) return false;
        const dayOfWeek = new Date().getDay();
        return data.health.exerciseThisWeek === 0 && dayOfWeek >= 3; // 周三之后还没运动才提醒
      },
      getMessage: () => '本周还没有运动记录，动起来吧',
      actions: [
        { label: '记录一次运动', type: 'navigate', route: 'health' },
        { label: '设置运动提醒', type: 'navigate', route: 'health' }
      ]
    },
    goal_stalled: {
      id: 'goal_stalled',
      icon: '🎯',
      title: '目标进度落后',
      priority: 2,
      condition: (data) => data.goals && data.goals.stalled && data.goals.stalled.length > 0,
      getMessage: (data) => `目标「${data.goals.stalled[0]}」已超过7天没有更新`,
      actions: [
        { label: '查看目标', type: 'navigate', route: 'goals' },
        { label: '调整计划', type: 'navigate', route: 'goals' }
      ]
    },
    habit_not_today: {
      id: 'habit_not_today',
      icon: '✅',
      title: '今天还没打卡',
      priority: 3,
      condition: (data) => {
        if (!data.habits) return false;
        return data.habits.total > 0 && data.habits.checkedToday === 0;
      },
      getMessage: (data) => `今天还没打卡，共 ${data.habits.total} 个习惯待完成`,
      actions: [
        { label: '去打卡', type: 'navigate', route: 'habits' }
      ]
    },
    low_sleep: {
      id: 'low_sleep',
      icon: '😴',
      title: '睡眠不足',
      priority: 2,
      condition: (data) => data.health && data.health.sleepAvg > 0 && data.health.sleepAvg < 6,
      getMessage: (data) => `本周平均睡眠仅 ${data.health.sleepAvg.toFixed(1)} 小时，注意休息`,
      actions: [
        { label: '记录睡眠', type: 'navigate', route: 'health' }
      ]
    }
  };

  // ===== 状态 =====
  let _cachedSuggestions = null;  // 缓存的建议列表
  let _cachedAt = 0;              // 缓存时间戳
  let _dismissedIds = new Set();   // 用户已关闭的建议 ID
  let _updateTimer = null;         // 定时更新定时器

  // ===== AppUtils 快捷引用 =====
  const { getTodayStr, getWeekRange } = typeof AppUtils !== 'undefined' ? AppUtils : { getTodayStr: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }, getWeekRange: () => { const n = new Date(); const d = new Date(n); d.setDate(d.getDate() - d.getDay()); const fmtDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; return { start: fmtDate(d), end: fmtDate(n) }; } };

  /**
   * 收集数据（复用 NicoleModule 的 collectData 逻辑，独立实现以避免循环依赖）
   * @returns {Promise<Object>} 各模块数据摘要
   */
  async function _collectData() {
    const today = getTodayStr();
    const week = getWeekRange();
    const data = {
      date: today,
      tasks: { total: 0, done: 0, overdue: 0, overdueList: [] },
      habits: { total: 0, checkedToday: 0, brokenStreaks: [], longestStreak: 0 },
      finance: { weekIncome: 0, weekExpense: 0, monthIncome: 0, monthExpense: 0 },
      health: { exerciseThisWeek: 0, sleepAvg: 0 },
      goals: { total: 0, active: 0, stalled: [] }
    };

    try {
      // === 任务 ===
      const tasks = await Storage.getAll('tasks') || [];
      data.tasks.total = tasks.length;
      data.tasks.done = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
      const todayDate = new Date(today);
      tasks.forEach(t => {
        if (t.status !== 'done' && t.status !== 'completed' && t.dueDate) {
          const due = new Date(t.dueDate);
          if (due < todayDate) {
            data.tasks.overdue++;
            if (data.tasks.overdueList.length < 5) {
              data.tasks.overdueList.push({ title: t.title || t.name || '未命名任务', dueDate: t.dueDate });
            }
          }
        }
      });

      // === 习惯 ===
      const habits = await Storage.getAll('habits') || [];
      const checkins = await Storage.getAll('checkins') || [];
      data.habits.total = habits.length;
      data.habits.checkedToday = checkins.filter(c => c.date === today).length;

      habits.forEach(h => {
        const hCheckins = checkins.filter(c => c.habitId === h.id || c.habitName === h.name)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const hDateSet = new Set(hCheckins.map(c => c.date));
        let streak = 0;
        let broken = false;
        const checkDate = new Date(today);

        for (let i = 0; i < 365; i++) {
          const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
          if (hDateSet.has(dateStr)) {
            streak++;
          } else if (i === 0) {
            continue;
          } else {
            broken = true;
            break;
          }
          checkDate.setDate(checkDate.getDate() - 1);
        }

        if (streak > data.habits.longestStreak) data.habits.longestStreak = streak;
        if (broken && streak < 3) {
          data.habits.brokenStreaks.push(h.name || h.title || '未命名习惯');
        }
      });

      // === 财务 ===
      const finances = await Storage.getAll('finance') || [];
      const monthStr = today.slice(0, 7);
      finances.forEach(f => {
        const amount = parseFloat(f.amount) || 0;
        if (f.date >= week.start && f.date <= week.end) {
          if (f.type === 'income') data.finance.weekIncome += amount;
          else data.finance.weekExpense += amount;
        }
        if (f.date && f.date.startsWith(monthStr)) {
          if (f.type === 'income') data.finance.monthIncome += amount;
          else data.finance.monthExpense += amount;
        }
      });

      // === 健康 ===
      const healthRecords = await Storage.getAll('health') || [];
      data.health.exerciseThisWeek = healthRecords.filter(h =>
        h.date >= week.start && h.date <= week.end &&
        (h.type === 'exercise' || h.category === 'exercise' || h.activity)
      ).length;
      const sleepRecords = healthRecords.filter(h => h.date >= week.start && h.sleep);
      if (sleepRecords.length > 0) {
        data.health.sleepAvg = sleepRecords.reduce((s, h) => s + (parseFloat(h.sleep) || 0), 0) / sleepRecords.length;
      }

      // === 目标 ===
      const goals = await Storage.getAll('goals') || [];
      data.goals.total = goals.length;
      data.goals.active = goals.filter(g => g.status === 'active' || g.status === 'in_progress').length;
      goals.forEach(g => {
        if (g.status === 'active' || g.status === 'in_progress') {
          const lastUpdate = g.updatedAt || g.lastCheckIn || '';
          if (lastUpdate) {
            const daysSince = Math.floor((todayDate - new Date(lastUpdate)) / 86400000);
            if (daysSince > 7) {
              data.goals.stalled.push(g.title || g.name || '未命名目标');
            }
          } else {
            data.goals.stalled.push(g.title || g.name || '未命名目标');
          }
        }
      });

    } catch (e) {
      console.error('[SmartSuggestion] 数据采集异常:', e);
    }

    return data;
  }

  /**
   * 生成建议列表
   * @param {Object} data - 采集的数据
   * @returns {Array} 建议列表，按优先级排序
   */
  function _generateSuggestions(data) {
    const suggestions = [];

    for (const [key, template] of Object.entries(SUGGESTION_TEMPLATES)) {
      // 跳过用户已关闭的建议
      if (_dismissedIds.has(key)) continue;

      try {
        if (template.condition(data)) {
          suggestions.push({
            id: template.id,
            icon: template.icon,
            title: template.title,
            message: template.getMessage(data),
            priority: template.priority,
            actions: template.actions,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        console.warn(`[SmartSuggestion] 检查条件 ${key} 失败:`, e);
      }
    }

    // 按优先级排序（1 最紧急）
    suggestions.sort((a, b) => a.priority - b.priority);

    return suggestions.slice(0, MAX_SUGGESTIONS);
  }

  /**
   * 生成建议（主入口）
   * 从缓存返回或重新生成
   * @param {boolean} forceRefresh - 强制刷新
   * @returns {Promise<Array>} 建议列表
   */
  async function generate(forceRefresh = false) {
    const now = Date.now();

    // 检查缓存
    if (!forceRefresh && _cachedSuggestions && (now - _cachedAt) < CACHE_TTL) {
      return _cachedSuggestions;
    }

    // 尝试从 localStorage 恢复缓存
    if (!forceRefresh && !_cachedSuggestions) {
      try {
        const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (stored && stored.suggestions && (now - stored.cachedAt) < CACHE_TTL) {
          _cachedSuggestions = stored.suggestions;
          _cachedAt = stored.cachedAt;
          return _cachedSuggestions;
        }
      } catch (e) { /* 忽略 */ }
    }

    // 采集数据并生成建议
    const data = await _collectData();
    const suggestions = _generateSuggestions(data);

    // 更新缓存
    _cachedSuggestions = suggestions;
    _cachedAt = now;

    // 持久化缓存
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ suggestions, cachedAt: now }));
    } catch (e) { /* 忽略 */ }

    console.log(`[SmartSuggestion] 生成 ${suggestions.length} 条建议`);
    return suggestions;
  }

  /**
   * 渲染建议卡片到 Dashboard
   * @param {HTMLElement} container - 渲染容器
   */
  async function renderSuggestions(container) {
    if (!container) return;

    const suggestions = await generate();

    if (suggestions.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div class="smart-suggestion-header">
        <span class="smart-suggestion-icon">💡</span>
        <span class="smart-suggestion-title">智能建议</span>
      </div>
      <div class="smart-suggestion-list">
        ${suggestions.map(s => `
          <div class="smart-suggestion-item" data-suggestion-id="${s.id}">
            <div class="smart-suggestion-item-header">
              <span class="smart-suggestion-item-icon">${s.icon}</span>
              <span class="smart-suggestion-item-title">${_escapeHtml(s.title)}</span>
              <button class="smart-suggestion-dismiss" data-id="${s.id}" title="忽略此建议">✕</button>
            </div>
            <div class="smart-suggestion-item-message">${_escapeHtml(s.message)}</div>
            <div class="smart-suggestion-item-actions">
              ${s.actions.map(a => `
                <button class="smart-suggestion-action-btn"
                        data-action-type="${a.type}"
                        data-route="${a.route || ''}"
                        data-module="${a.module || ''}"
                        data-method="${a.method || ''}">
                  ${_escapeHtml(a.label)}
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // 绑定操作按钮事件
    container.querySelectorAll('.smart-suggestion-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _handleAction(btn.dataset);
      });
    });

    // 绑定关闭按钮
    container.querySelectorAll('.smart-suggestion-dismiss').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        dismiss(id);
        // 动画移除
        const item = container.querySelector(`[data-suggestion-id="${id}"]`);
        if (item) {
          item.classList.add('smart-suggestion-dismissing');
          setTimeout(() => renderSuggestions(container), 300);
        }
      });
    });
  }

  /**
   * 处理操作路由
   * @param {Object} dataset - 按钮的 data 属性
   */
  function _handleAction(dataset) {
    const { actionType, route, module, method } = dataset;

    switch (actionType) {
      case 'navigate':
        if (route && typeof Router !== 'undefined' && Router.navigate) {
          Router.navigate(route);
        }
        break;

      case 'execute':
        if (module && method) {
          try {
            const mod = window[module];
            if (mod && typeof mod[method] === 'function') {
              mod[method]();
            }
          } catch (e) {
            console.warn(`[SmartSuggestion] 执行 ${module}.${method} 失败:`, e);
          }
        }
        break;

      case 'dismiss':
        // 已通过 dismiss 按钮处理
        break;

      default:
        console.warn('[SmartSuggestion] 未知操作类型:', actionType);
    }
  }

  /**
   * 关闭某条建议
   * @param {string} id - 建议 ID
   */
  function dismiss(id) {
    _dismissedIds.add(id);

    // 持久化关闭记录（当天有效）
    try {
      const today = getTodayStr();
      const stored = JSON.parse(localStorage.getItem('smart_suggestion_dismissed') || '{}');
      if (stored.date !== today) {
        stored.date = today;
        stored.ids = [];
      }
      stored.ids.push(id);
      localStorage.setItem('smart_suggestion_dismissed', JSON.stringify(stored));
    } catch (e) { /* 忽略 */ }

    console.log('[SmartSuggestion] 已关闭建议:', id);
  }

  /**
   * HTML 转义
   * @param {string} str
   * @returns {string}
   */
  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 启动定时更新（每小时刷新一次）
   */
  function _startAutoRefresh() {
    if (_updateTimer) clearInterval(_updateTimer);
    _updateTimer = setInterval(async () => {
      console.log('[SmartSuggestion] 定时刷新建议...');
      _cachedSuggestions = null; // 清除缓存，强制重新生成
      const suggestions = await generate(true);

      // 如果 Dashboard 当前可见，重新渲染
      const container = document.getElementById('dash-smart-suggestions');
      if (container && container.style.display !== 'none') {
        renderSuggestions(container);
      }
    }, CACHE_TTL);
  }

  /**
   * 初始化
   */
  function init() {
    // 恢复今日已关闭的建议
    try {
      const today = getTodayStr();
      const stored = JSON.parse(localStorage.getItem('smart_suggestion_dismissed') || '{}');
      if (stored.date === today && Array.isArray(stored.ids)) {
        _dismissedIds = new Set(stored.ids);
      }
    } catch (e) { /* 忽略 */ }

    // 启动定时刷新
    _startAutoRefresh();

    console.log('[SmartSuggestion] 智能建议系统就绪 💡');
  }

  /**
   * 销毁
   */
  function destroy() {
    if (_updateTimer) {
      clearInterval(_updateTimer);
      _updateTimer = null;
    }
    _cachedSuggestions = null;
    _cachedAt = 0;
    console.log('[SmartSuggestion] 模块已销毁');
  }

  return {
    init,
    generate,
    renderSuggestions,
    dismiss,
    destroy
  };
})();
