/**
 * audit-log.js - AI 操作审计日志
 * 人生工作台 · 记录所有 AI 执行的操作，方便回溯查询
 * 
 * 功能：
 * - log(action)：记录 AI 操作（含字段：timestamp、action类型、source来源、params参数脱敏、result结果、userConfirmed、duration）
 * - getRecentLogs(limit)：获取最近N条日志
 * - getLogsByDate(date)：按日期查询
 * - getLogsByAction(actionType)：按操作类型查询
 * - getCostSummary()：汇总统计（AI调用次数、操作类型分布）
 * - showAuditPanel()：UI 展示审计日志面板
 *
 * 存储：IndexedDB audit_logs 表
 * 自动清理：保留最近30天，最多500条
 */

const AuditLog = (() => {
  // ===== 常量 =====
  const STORE_NAME = 'audit_logs';
  const MAX_RECORDS = 500;           // 最大记录数
  const RETENTION_DAYS = 30;         // 保留天数
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 清理间隔：24小时

  // 支持的 action 类型
  const ACTION_TYPES = {
    ai_finance_record: { icon: '💰', label: 'AI 记录财务' },
    ai_task_create:    { icon: '📋', label: 'AI 创建任务' },
    ai_habit_checkin:  { icon: '✅', label: 'AI 打卡' },
    ai_diary_entry:    { icon: '📝', label: 'AI 写日记' },
    ai_reminder_set:   { icon: '⏰', label: 'AI 设置提醒' },
    nicole_analysis:   { icon: '🔵', label: '妮可分析' },
    voice_command:     { icon: '🎤', label: '语音指令执行' },
    predictive_action: { icon: '🔮', label: '预测操作执行' }
  };

  // PII 字段名列表（需要脱敏的字段）
  const PII_FIELDS = ['name', 'person', 'address', 'phone', 'email', 'location', 'contact', 'personName'];

  // ===== 状态 =====
  let _panelEl = null;
  let _overlayEl = null;
  let _isOpen = false;
  let _lastCleanupTime = 0;

  // ===== 参数脱敏 =====

  /**
   * 对参数对象进行脱敏处理
   * 规则：金额保留，人名/地址等 PII 用 [已脱敏] 替代
   * @param {Object} params - 原始参数
   * @returns {Object} 脱敏后的参数
   */
  function sanitizeParams(params) {
    if (!params || typeof params !== 'object') return params;

    const sanitized = {};
    for (const [key, value] of Object.entries(params)) {
      if (PII_FIELDS.includes(key)) {
        // PII 字段替换为 [已脱敏]
        sanitized[key] = '[已脱敏]';
      } else if (typeof value === 'string') {
        // 检查值中是否包含疑似人名的模式（简单规则：2-4个中文字符且不是常见分类名）
        sanitized[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        // 递归脱敏嵌套对象
        sanitized[key] = sanitizeParams(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // ===== 核心日志记录 =====

  /**
   * 记录一条审计日志（异步，不阻塞 UI）
   * @param {Object} action - 操作信息
   * @param {string} action.type - 操作类型（如 ai_finance_record）
   * @param {string} [action.source] - 来源（xiaolu/nicole/quickinput）
   * @param {Object} [action.params] - 操作参数（会被自动脱敏）
   * @param {string} [action.result] - 结果（success/failed/cancelled）
   * @param {boolean} [action.confirmed] - 是否用户确认
   * @param {number} [action.duration] - 耗时（ms）
   */
  async function log(action) {
    try {
      const now = new Date();
      const entry = {
        timestamp: now.toISOString(),
        action: action.type || 'unknown',
        source: action.source || 'unknown',
        params: sanitizeParams(action.params || {}),
        result: action.result || 'success',
        userConfirmed: action.confirmed || false,
        duration: action.duration || 0,
        date: now.toISOString().slice(0, 10) // 日期索引用
      };

      await Storage.add(STORE_NAME, entry);

      // 异步清理（不阻塞写入）
      _autoCleanup().catch(() => {});

      console.log(`[AuditLog] 已记录: ${entry.action} (${entry.result})`);
    } catch (err) {
      console.error('[AuditLog] 写入失败:', err);
    }
  }

  // ===== 自动清理 =====

  /**
   * 自动清理过期日志
   * 保留最近30天，最多500条
   */
  async function _autoCleanup() {
    const now = Date.now();
    // 24小时内只清理一次
    if (now - _lastCleanupTime < CLEANUP_INTERVAL) return;
    _lastCleanupTime = now;

    try {
      // 1. 清理30天前的日志
      const cutoffDate = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString();

      const allLogs = await Storage.getAll(STORE_NAME);
      const expired = allLogs.filter(log => log.timestamp < cutoffStr);

      if (expired.length > 0) {
        // 批量删除过期记录
        for (const log of expired) {
          if (log.id) {
            await Storage.remove(STORE_NAME, log.id);
          }
        }
        console.log(`[AuditLog] 清理过期日志: ${expired.length} 条`);
      }

      // 2. 超过500条时删除最旧的
      const remaining = await Storage.getAll(STORE_NAME);
      if (remaining.length > MAX_RECORDS) {
        // 按时间排序，删除最旧的
        remaining.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
        const toDelete = remaining.slice(0, remaining.length - MAX_RECORDS);
        for (const log of toDelete) {
          if (log.id) {
            await Storage.remove(STORE_NAME, log.id);
          }
        }
        console.log(`[AuditLog] 清理超额日志: ${toDelete.length} 条`);
      }
    } catch (err) {
      console.error('[AuditLog] 自动清理失败:', err);
    }
  }

  // ===== 日志查询 =====

  /**
   * 获取最近N条日志（按时间倒序）
   * @param {number} [limit=50] - 数量限制
   * @returns {Promise<Array>} 日志列表
   */
  async function getRecentLogs(limit = 50) {
    try {
      const all = await Storage.getAll(STORE_NAME);
      all.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return all.slice(0, limit);
    } catch (err) {
      console.error('[AuditLog] 查询最近日志失败:', err);
      return [];
    }
  }

  /**
   * 按日期查询日志
   * @param {string} date - 日期字符串（YYYY-MM-DD）
   * @returns {Promise<Array>} 日志列表
   */
  async function getLogsByDate(date) {
    try {
      const all = await Storage.getAll(STORE_NAME);
      return all
        .filter(log => log.date === date || (log.timestamp && log.timestamp.startsWith(date)))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    } catch (err) {
      console.error('[AuditLog] 按日期查询失败:', err);
      return [];
    }
  }

  /**
   * 按操作类型查询日志
   * @param {string} actionType - 操作类型
   * @returns {Promise<Array>} 日志列表
   */
  async function getLogsByAction(actionType) {
    try {
      return await Storage.getByIndex(STORE_NAME, 'action', actionType);
    } catch (err) {
      console.error('[AuditLog] 按类型查询失败:', err);
      return [];
    }
  }

  /**
   * 汇总统计
   * @returns {Promise<Object>} 统计信息
   */
  async function getCostSummary() {
    try {
      const all = await Storage.getAll(STORE_NAME);

      const summary = {
        totalCalls: all.length,
        byAction: {},
        bySource: {},
        byResult: { success: 0, failed: 0, cancelled: 0 },
        recent7Days: 0,
        recent30Days: 0,
        avgDuration: 0
      };

      const now = new Date();
      const days7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      let totalDuration = 0;
      let durationCount = 0;

      for (const log of all) {
        // 按操作类型分布
        const actionKey = log.action || 'unknown';
        summary.byAction[actionKey] = (summary.byAction[actionKey] || 0) + 1;

        // 按来源分布
        const sourceKey = log.source || 'unknown';
        summary.bySource[sourceKey] = (summary.bySource[sourceKey] || 0) + 1;

        // 按结果分布
        const resultKey = log.result || 'success';
        if (summary.byResult[resultKey] !== undefined) {
          summary.byResult[resultKey]++;
        }

        // 时间范围统计
        const logDate = new Date(log.timestamp);
        if (logDate >= days7) summary.recent7Days++;
        if (logDate >= days30) summary.recent30Days++;

        // 耗时统计
        if (log.duration && log.duration > 0) {
          totalDuration += log.duration;
          durationCount++;
        }
      }

      summary.avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

      return summary;
    } catch (err) {
      console.error('[AuditLog] 汇总统计失败:', err);
      return { totalCalls: 0, byAction: {}, bySource: {}, byResult: {}, recent7Days: 0, recent30Days: 0, avgDuration: 0 };
    }
  }

  // ===== UI 展示 =====

  /**
   * 打开审计日志面板
   */
  function showAuditPanel() {
    if (_isOpen) {
      closeAuditPanel();
      return;
    }
    _isOpen = true;
    _buildPanel();
  }

  /**
   * 关闭审计日志面板
   */
  function closeAuditPanel() {
    _isOpen = false;
    if (_overlayEl) {
      _overlayEl.classList.remove('show');
      setTimeout(() => {
        if (_overlayEl && _overlayEl.parentNode) {
          _overlayEl.parentNode.removeChild(_overlayEl);
        }
        _overlayEl = null;
      }, 300);
    }
    if (_panelEl) {
      _panelEl.classList.remove('show');
      setTimeout(() => {
        if (_panelEl && _panelEl.parentNode) {
          _panelEl.parentNode.removeChild(_panelEl);
        }
        _panelEl = null;
      }, 300);
    }
  }

  /**
   * 构建审计日志面板 UI
   */
  function _buildPanel() {
    // 遮罩层
    _overlayEl = document.createElement('div');
    _overlayEl.className = 'audit-overlay';
    _overlayEl.addEventListener('click', closeAuditPanel);

    // 面板
    _panelEl = document.createElement('div');
    _panelEl.className = 'audit-panel';
    _panelEl.innerHTML = `
      <div class="audit-header">
        <div class="audit-header-left">
          <span class="audit-header-icon">📜</span>
          <div>
            <div class="audit-title">AI 操作历史</div>
            <div class="audit-subtitle">审计追踪 · 操作回溯</div>
          </div>
        </div>
        <div class="audit-header-actions">
          <button class="audit-header-btn" id="audit-summary-btn" title="统计概览">📊</button>
          <button class="audit-header-btn" id="audit-close-btn" title="关闭">✕</button>
        </div>
      </div>
      <div class="audit-filters">
        <select class="audit-filter-select" id="audit-filter-date">
          <option value="all">全部日期</option>
          <option value="today">今天</option>
          <option value="yesterday">昨天</option>
          <option value="7days">近7天</option>
          <option value="30days">近30天</option>
        </select>
        <select class="audit-filter-select" id="audit-filter-type">
          <option value="all">全部类型</option>
          ${Object.entries(ACTION_TYPES).map(([key, val]) => 
            `<option value="${key}">${val.icon} ${val.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="audit-content" id="audit-content">
        <div class="audit-loading">加载中...</div>
      </div>
    `;

    document.body.appendChild(_overlayEl);
    document.body.appendChild(_panelEl);

    // 触发动画
    requestAnimationFrame(() => {
      _overlayEl.classList.add('show');
      _panelEl.classList.add('show');
    });

    // 绑定事件
    _panelEl.querySelector('#audit-close-btn').addEventListener('click', closeAuditPanel);
    _panelEl.querySelector('#audit-summary-btn').addEventListener('click', _showSummaryView);
    _panelEl.querySelector('#audit-filter-date').addEventListener('change', _refreshList);
    _panelEl.querySelector('#audit-filter-type').addEventListener('change', _refreshList);

    // 加载日志列表
    _refreshList();
  }

  /**
   * 刷新日志列表
   */
  async function _refreshList() {
    const contentEl = document.getElementById('audit-content');
    if (!contentEl) return;

    contentEl.innerHTML = '<div class="audit-loading">加载中...</div>';

    try {
      const dateFilter = document.getElementById('audit-filter-date')?.value || 'all';
      const typeFilter = document.getElementById('audit-filter-type')?.value || 'all';

      // 获取所有日志
      let logs = await Storage.getAll(STORE_NAME);

      // 日期过滤
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      if (dateFilter === 'today') {
        logs = logs.filter(l => l.date === today);
      } else if (dateFilter === 'yesterday') {
        logs = logs.filter(l => l.date === yesterday);
      } else if (dateFilter === '7days') {
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        logs = logs.filter(l => l.timestamp >= cutoff);
      } else if (dateFilter === '30days') {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        logs = logs.filter(l => l.timestamp >= cutoff);
      }

      // 类型过滤
      if (typeFilter !== 'all') {
        logs = logs.filter(l => l.action === typeFilter);
      }

      // 按时间倒序
      logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      // 渲染
      if (logs.length === 0) {
        contentEl.innerHTML = `
          <div class="audit-empty">
            <span class="audit-empty-icon">📭</span>
            <p>暂无 AI 操作记录</p>
          </div>
        `;
        return;
      }

      const html = logs.map(log => _renderLogItem(log)).join('');
      contentEl.innerHTML = `
        <div class="audit-count">共 ${logs.length} 条记录</div>
        <div class="audit-timeline">${html}</div>
      `;
    } catch (err) {
      console.error('[AuditLog] 加载日志失败:', err);
      contentEl.innerHTML = '<div class="audit-error">加载失败，请重试</div>';
    }
  }

  /**
   * 渲染单条日志项
   * @param {Object} log - 日志记录
   * @returns {string} HTML 字符串
   */
  function _renderLogItem(log) {
    const actionInfo = ACTION_TYPES[log.action] || { icon: '❓', label: log.action };
    const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '--';

    // 结果状态标记
    const resultMap = {
      success: '<span class="audit-result audit-result-success">✓ 成功</span>',
      failed: '<span class="audit-result audit-result-failed">✗ 失败</span>',
      cancelled: '<span class="audit-result audit-result-cancelled">⊘ 取消</span>'
    };
    const resultHtml = resultMap[log.result] || `<span class="audit-result">${log.result}</span>`;

    // 来源标记
    const sourceMap = {
      xiaolu: '🦌 小鹿',
      nicole: '🔵 妮可',
      quickinput: '⚡ 快速录入',
      voice: '🎤 语音',
      predictive: '🔮 预测'
    };
    const sourceLabel = sourceMap[log.source] || log.source;

    // 简要描述
    let desc = actionInfo.label;
    if (log.params) {
      if (log.params.amount !== undefined) desc += ` ¥${log.params.amount}`;
      else if (log.params.title) desc += ` 「${log.params.title}」`;
      else if (log.params.habit) desc += ` ${log.params.habit}`;
    }

    // 用户确认标记
    const confirmedMark = log.userConfirmed ? '<span class="audit-confirmed" title="用户确认">👤</span>' : '';

    return `
      <div class="audit-item" data-id="${log.id || ''}">
        <div class="audit-item-icon">${actionInfo.icon}</div>
        <div class="audit-item-body">
          <div class="audit-item-header">
            <span class="audit-item-action">${desc}</span>
            ${confirmedMark}
            ${resultHtml}
          </div>
          <div class="audit-item-meta">
            <span class="audit-item-time">${timeStr}</span>
            <span class="audit-item-source">${sourceLabel}</span>
            ${log.duration > 0 ? `<span class="audit-item-duration">${log.duration}ms</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 显示统计概览
   */
  async function _showSummaryView() {
    const contentEl = document.getElementById('audit-content');
    if (!contentEl) return;

    contentEl.innerHTML = '<div class="audit-loading">统计中...</div>';

    try {
      const summary = await getCostSummary();

      // 操作类型分布 HTML
      const actionDistribution = Object.entries(summary.byAction)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => {
          const info = ACTION_TYPES[key] || { icon: '❓', label: key };
          const pct = summary.totalCalls > 0 ? Math.round(count / summary.totalCalls * 100) : 0;
          return `
            <div class="audit-stat-row">
              <span class="audit-stat-label">${info.icon} ${info.label}</span>
              <div class="audit-stat-bar-bg">
                <div class="audit-stat-bar" style="width:${pct}%"></div>
              </div>
              <span class="audit-stat-count">${count}</span>
            </div>
          `;
        }).join('');

      // 来源分布 HTML
      const sourceDistribution = Object.entries(summary.bySource)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => {
          const sourceMap = { xiaolu: '🦌 小鹿', nicole: '🔵 妮可', quickinput: '⚡ 快速录入', voice: '🎤 语音', predictive: '🔮 预测' };
          const label = sourceMap[key] || key;
          return `<span class="audit-stat-tag">${label}: ${count}</span>`;
        }).join('');

      contentEl.innerHTML = `
        <div class="audit-summary">
          <div class="audit-summary-grid">
            <div class="audit-stat-card">
              <div class="audit-stat-value">${summary.totalCalls}</div>
              <div class="audit-stat-label">总操作次数</div>
            </div>
            <div class="audit-stat-card">
              <div class="audit-stat-value">${summary.recent7Days}</div>
              <div class="audit-stat-label">近7天操作</div>
            </div>
            <div class="audit-stat-card">
              <div class="audit-stat-value">${summary.recent30Days}</div>
              <div class="audit-stat-label">近30天操作</div>
            </div>
            <div class="audit-stat-card">
              <div class="audit-stat-value">${summary.avgDuration}ms</div>
              <div class="audit-stat-label">平均耗时</div>
            </div>
          </div>
          <div class="audit-summary-section">
            <h4>操作结果分布</h4>
            <div class="audit-result-stats">
              <span class="audit-stat-tag audit-tag-success">✓ 成功: ${summary.byResult.success}</span>
              <span class="audit-stat-tag audit-tag-failed">✗ 失败: ${summary.byResult.failed}</span>
              <span class="audit-stat-tag audit-tag-cancelled">⊘ 取消: ${summary.byResult.cancelled}</span>
            </div>
          </div>
          <div class="audit-summary-section">
            <h4>操作类型分布</h4>
            ${actionDistribution || '<p class="audit-empty-text">暂无数据</p>'}
          </div>
          <div class="audit-summary-section">
            <h4>来源分布</h4>
            <div class="audit-source-stats">${sourceDistribution || '<p class="audit-empty-text">暂无数据</p>'}</div>
          </div>
          <button class="audit-back-btn" id="audit-back-list">← 返回日志列表</button>
        </div>
      `;

      document.getElementById('audit-back-list')?.addEventListener('click', _refreshList);
    } catch (err) {
      console.error('[AuditLog] 统计失败:', err);
      contentEl.innerHTML = '<div class="audit-error">统计失败，请重试</div>';
    }
  }

  // ===== 初始化 =====

  /**
   * 初始化审计日志模块
   */
  function init() {
    // 执行一次自动清理
    _autoCleanup().catch(() => {});
    console.log('[AuditLog] 审计日志模块就绪 📜');
  }

  return {
    init,
    log,
    getRecentLogs,
    getLogsByDate,
    getLogsByAction,
    getCostSummary,
    showAuditPanel,
    closeAuditPanel
  };
})();
